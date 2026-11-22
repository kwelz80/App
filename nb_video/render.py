"""Render the N B brick-breaker video (1080x1920, 60 fps, 3112 frames = 51.87 s)."""
import math
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from level import EMPTY, WALL, BRICK, GATE, ROWS, COLS, SPLIT_COL
from sim import (Sim, SCHEDULE, ENTRY_N, ENTRY_B, NFRAMES, FPS, P, X0, Y0,
                 PADDLE_TOP, PADDLE_H, PU_R, cell_x, cell_y)

W, H = 1080, 1920
ANGLE_N, ANGLE_B = 9.59, 10.21

# ---------------- palette ----------------
BG = (22, 24, 21)
HUD_TRACK = (53, 53, 53)
HUD_ORANGE = (158, 96, 66)
HUD_GRAY = (152, 153, 153)
BAND = (51, 53, 53)
WALL_C = (125, 125, 125)
PADDLE_C = (250, 131, 68)
BALL_C = (255, 255, 255)
YELLOW = (196, 156, 18)
RED = (176, 30, 38)
YELLOW_TINT = (34, 30, 14)
RED_TINT = (36, 17, 18)
GATE_ON_YELLOW = (236, 52, 48)     # N gate sits in the yellow half -> red
GATE_ON_RED = (246, 208, 32)       # B gate sits in the red half -> yellow

FONT = '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf'


def cell_box(c, r, half):
    cx, cy = cell_x(c), cell_y(r)
    return (int(round(cx - half)), int(round(cy - half)), int(round(cx + half)) - 1, int(round(cy + half)) - 1)


def draw_cell(d, G, r, c):
    """Draw one grid cell (background first, then block)."""
    d.rectangle(cell_box(c, r, P / 2), fill=BG)
    t = G[r, c]
    yellow_side = c < SPLIT_COL
    if t == WALL:
        d.rectangle(cell_box(c, r, 7.6), fill=WALL_C)
    elif t == BRICK:
        d.rectangle(cell_box(c, r, P / 2), fill=YELLOW_TINT if yellow_side else RED_TINT)
        d.rectangle(cell_box(c, r, 6.6), fill=YELLOW if yellow_side else RED)
    elif t == GATE:
        d.rectangle(cell_box(c, r, P / 2), fill=YELLOW_TINT if yellow_side else RED_TINT)
        d.rectangle(cell_box(c, r, 6.6), fill=GATE_ON_YELLOW if yellow_side else GATE_ON_RED)


def make_ball_masks(radius=9.0, ss=8, sub=4):
    """Anti-aliased disk masks for sub x sub sub-pixel offsets."""
    size = int(math.ceil(radius * 2)) + 3
    masks = {}
    for oy in range(sub):
        for ox in range(sub):
            n = size * ss
            yy, xx = np.mgrid[0:n, 0:n]
            cx = (1.5 + radius + ox / sub) * ss
            cy = (1.5 + radius + oy / sub) * ss
            inside = ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2) <= (radius * ss) ** 2
            a = inside.reshape(size, ss, size, ss).mean(axis=(1, 3))
            masks[(ox, oy)] = Image.fromarray((a * 255).astype(np.uint8), 'L')
    return masks, size


def make_powerup_sprites():
    font = ImageFont.truetype(FONT, 34)
    font_s = ImageFont.truetype(FONT, 27)
    specs = {
        'x3': ((172, 198, 30), 'x3'),
        '+3': ((30, 180, 214), '+3'),
        'wide': ((12, 104, 18), '«-»'),
        'minus': ((246, 150, 82), None),
    }
    ss = 4
    R = PU_R
    sprites = {}
    for k, (col, txt) in specs.items():
        n = (2 * R + 4) * ss
        im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        c = n / 2
        d.ellipse([c - R * ss, c - R * ss, c + R * ss, c + R * ss], fill=col + (255,))
        im = im.resize((2 * R + 4, 2 * R + 4), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        tc = tuple(int(v + (255 - v) * 0.78) for v in col) + (255,)
        c = (2 * R + 4) / 2
        if txt is not None:
            f = font_s if k == 'wide' else font
            d.text((c, c + 1), txt, font=f, fill=tc, anchor='mm')
        else:
            d.rounded_rectangle([c - 16, c - 3, c + 16, c + 3], radius=2, fill=(255, 238, 220, 255))
        sprites[k] = im
    # star
    n = 40 * ss
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = []
    for i in range(10):
        rr = (14 if i % 2 == 0 else 6) * ss
        a = -math.pi / 2 + i * math.pi / 5
        pts.append((n / 2 + rr * math.cos(a), n / 2 + rr * math.sin(a)))
    d.polygon(pts, fill=(246, 168, 38, 255))
    sprites['star'] = im.resize((40, 40), Image.LANCZOS)
    return sprites


def fade(sprite, scale, alpha):
    w, h = sprite.size
    s = sprite.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.BILINEAR)
    a = s.getchannel('A').point(lambda v: int(v * alpha))
    s.putalpha(a)
    return s


def gray_len(n):
    if n <= 1:
        return 0
    return int(max(0, min(W, 125 * math.log(n) - 55)))


# ---------------- audio ----------------
SR = 44100


def tone(freq, dur, amp, tau, tail_amp=0.0, tail_tau=0.03):
    t = np.arange(int(SR * dur)) / SR
    env = amp * np.exp(-t / tau) + tail_amp * np.exp(-t / tail_tau)
    env *= np.minimum(1.0, t / 0.0015)
    return np.sin(2 * np.pi * freq * t) * env


def build_audio(sim, path):
    total = int(round(NFRAMES / FPS * SR))
    buf = np.zeros(total + SR, np.float64)
    tick = tone(1000, 0.09, 0.19, 0.0045, 0.026, 0.03)
    tick_hi = tone(1050, 0.09, 0.19, 0.0045, 0.026, 0.03)
    catch = tone(520, 0.25, 0.14, 0.05, 0.0) + tone(260, 0.25, 0.10, 0.07, 0.0)
    hits = set(sim.hit_frames)
    bricks = set(sim.brick_hit_frames)
    last = -100
    for f in range(NFRAMES):
        if f in hits and f - last >= 6:
            s = tick_hi if f in bricks else tick
            i = int(f / FPS * SR)
            buf[i:i + len(s)] += s
            last = f
    for (f, k) in sim.catch_frames:
        i = int(f / FPS * SR)
        buf[i:i + len(catch)] += catch
    buf = buf[:total]
    buf = np.clip(buf, -1, 1)
    pcm = (buf * 32767).astype(np.int16)
    st = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(st.tobytes())


# ---------------- main render ----------------
def main(out_path, frames=NFRAMES, stills=()):
    sim = Sim([(ENTRY_N[0], ENTRY_N[1], ANGLE_N), (ENTRY_B[0], ENTRY_B[1], ANGLE_B)], SCHEDULE)

    # static base: HUD strip, field, play area, band
    base = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(base)
    d.rectangle([0, 11, W - 1, 40], fill=HUD_TRACK)
    d.rectangle([0, 41, W - 1, 1679], fill=BG)
    for r in range(ROWS):
        for c in range(COLS):
            draw_cell(d, sim.G, r, c)
    # re-clear anything the field drew above row 41 so the HUD stays clean
    d.rectangle([0, 11, W - 1, 40], fill=HUD_TRACK)
    d.rectangle([0, 0, W - 1, 10], fill=(0, 0, 0))
    field = base
    fd = ImageDraw.Draw(field)

    masks, msize = make_ball_masks()
    white = Image.new('RGB', (msize, msize), BALL_C)
    sprites = make_powerup_sprites()
    flash_cache = {}

    enc = None
    if out_path:
        enc = subprocess.Popen([
            'ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
            '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_path], stdin=subprocess.PIPE)

    for f in range(frames):
        if f > 0:
            nb = len(sim.broken_log)
            sim.step()
            for (_, r, c, _) in sim.broken_log[nb:]:
                draw_cell(fd, sim.G, r, c)
        frame = field.copy()
        # balls
        xs, ys = sim.x, sim.y
        for i in range(len(xs)):
            x, y = xs[i], ys[i]
            if y > 1700 or y < 30:
                continue
            fx = x - 9.0 - 1.5; fy = y - 9.0 - 1.5
            ix = math.floor(fx); iy = math.floor(fy)
            ox = min(3, int((fx - ix) * 4)); oy = min(3, int((fy - iy) * 4))
            frame.paste(white, (ix, iy), masks[(ox, oy)])
        fdraw = ImageDraw.Draw(frame)
        # power-ups
        for p in sim.powerups:
            sp = sprites[p['kind']]
            frame.paste(sp, (int(round(p['x'] - sp.size[0] / 2)), int(round(p['y'] - sp.size[1] / 2))), sp)
        for fl in sim.flashes:
            k = (fl['kind'], fl['age'])
            if k not in flash_cache:
                a = fl['age'] / 24.0
                flash_cache[k] = fade(sprites[fl['kind']], 1.0 + 0.7 * a, 0.55 * (1 - a))
            sp = flash_cache[k]
            frame.paste(sp, (int(round(fl['x'] - sp.size[0] / 2)), int(round(fl['y'] - sp.size[1] / 2))), sp)
        # paddle
        pl = sim.pad_c - sim.pad_w / 2
        fdraw.rectangle([int(round(pl)), PADDLE_TOP, int(round(pl + sim.pad_w)) - 1, PADDLE_TOP + PADDLE_H - 1], fill=PADDLE_C)
        # bottom band (hides balls that fall out)
        fdraw.rectangle([0, 1680, W - 1, 1899], fill=BAND)
        fdraw.rectangle([0, 1900, W - 1, H - 1], fill=(0, 0, 0))
        # HUD bars
        ol = int(round(W * sim.bricks_left() / sim.total_bricks))
        if ol > 0:
            fdraw.rectangle([0, 18, ol - 1, 28], fill=HUD_ORANGE)
        gl = gray_len(len(sim.x))
        if gl > 0:
            fdraw.rectangle([0, 29, gl - 1, 39], fill=HUD_GRAY)
        if enc:
            enc.stdin.write(frame.tobytes())
        if f in stills:
            frame.save(stills[f])
        if f % 300 == 0:
            print(f'frame {f}/{frames} balls={len(sim.x)} bricks={sim.bricks_left()}', flush=True)
    if enc:
        enc.stdin.close(); enc.wait()
    return sim


if __name__ == '__main__':
    import os
    mode = sys.argv[1]
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    if mode == 'stills':
        times = [float(t) for t in sys.argv[3:]]
        st = {int(round(t * FPS)): f'{outdir}/still_{t:05.1f}.png' for t in times}
        main(None, frames=max(st) + 1, stills=st)
    else:
        vid = f'{outdir}/video_noaudio.mp4'
        if mode == 'audio':   # re-run the (deterministic) sim only, reuse rendered frames
            sim = Sim([(ENTRY_N[0], ENTRY_N[1], ANGLE_N), (ENTRY_B[0], ENTRY_B[1], ANGLE_B)], SCHEDULE)
            for _ in range(NFRAMES - 1):
                sim.step()
        else:
            sim = main(vid)
        build_audio(sim, f'{outdir}/audio.wav')
        final = f'{outdir}/NB_brick_breaker.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', vid, '-i', f'{outdir}/audio.wav', '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', final], check=True)
        print('wrote', final)
