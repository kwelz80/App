"""Procedural renderer for the 90s Nostalgia Minis squish video.

Draws chunky clay objects as shaded height fields, animates wax cracking and
pink nail polish peeling, and times every thumb press to the loud transients
in the original audio. Writes clips/01.mp4 ... clips/07.mp4 for assemble.sh.

Usage: python3 render.py [clip numbers...]   (default: all)
"""
import os
import subprocess
import sys
import wave
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 720, 1280
FPS = 30
CUTS = [0.0, 1.97, 6.20, 10.97, 12.47, 14.63, 15.70, 18.7333]
PINK = np.array([1.0, 0.50, 0.72], np.float32)        # nail polish shell
NAIL = np.array([1.0, 0.55, 0.76], np.float32)        # manicure
SKIN = np.array([0.96, 0.80, 0.70], np.float32)
CLAY = np.array([1.0, 0.97, 0.93], np.float32)        # soft clay under the wax
LIGHT = np.array([-0.45, -0.65, 0.62], np.float32)
LIGHT /= np.linalg.norm(LIGHT)
HALF = LIGHT + np.array([0, 0, 1], np.float32)
HALF /= np.linalg.norm(HALF)


def hexc(s):
    s = s.lstrip('#')
    return np.array([int(s[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


# ---------------------------------------------------------------- SDF helpers
def box(u, v, cx, cy, hw, hh, r):
    qx = np.abs(u - cx) - hw + r
    qy = np.abs(v - cy) - hh + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def circ(u, v, cx, cy, r):
    return np.hypot(u - cx, v - cy) - r


def ellip(u, v, cx, cy, a, b, ang=0.0):
    x, y = u - cx, v - cy
    if ang:
        c, s = np.cos(ang), np.sin(ang)
        x, y = c * x + s * y, -s * x + c * y
    return (np.hypot(x / a, y / b) - 1) * min(a, b)


def capsule(u, v, ax, ay, bx, by, r):
    px, py = u - ax, v - ay
    dx, dy = bx - ax, by - ay
    t = np.clip((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(px - t * dx, py - t * dy) - r


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def dome(d, b):
    t = np.clip(-d / b, 0, 1)
    return b * np.sqrt(1 - (1 - t) ** 2)


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def noise(shape, scale, seed):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((max(2, shape[0] // scale + 2), max(2, shape[1] // scale + 2)))
    n = ndi.zoom(n, (shape[0] / (n.shape[0] - 1), shape[1] / (n.shape[1] - 1)), order=3)
    n = n[:shape[0], :shape[1]]
    return ((n - n.mean()) / (n.std() + 1e-6)).astype(np.float32)


# ------------------------------------------------------------ object library
class Part:
    def __init__(self, sdf, color, lift, bevel=0.035):
        self.sdf, self.color, self.lift, self.bevel = sdf, hexc(color), lift, bevel


def object_parts(kind, u, v):
    """Returns (body sdf, body color, list of detail parts)."""
    P = []
    if kind == 'egg':
        body = smin(ellip(u, v, 0, 0.16, 0.66, 0.7), ellip(u, v, 0, -0.18, 0.52, 0.56), 0.2)
        ring = np.abs(circ(u, v, 0, -0.80, 0.13)) - 0.055
        body = smin(body, ring, 0.04)
        col = '#CDB6F2'
        P += [Part(box(u, v, 0, -0.04, 0.32, 0.25, 0.1), '#D4F4E2', -0.05, 0.03),
              Part(circ(u, v, -0.06, -0.06, 0.08), '#9FD9B8', 0.015, 0.03),
              Part(circ(u, v, 0.09, -0.02, 0.05), '#9FD9B8', 0.012, 0.02),
              Part(circ(u, v, -0.26, 0.43, 0.09), '#FF9EC7', 0.05),
              Part(circ(u, v, 0.0, 0.52, 0.09), '#FFE08A', 0.05),
              Part(circ(u, v, 0.26, 0.43, 0.09), '#9ED8FF', 0.05),
              Part(ring, '#E4D6FA', 0.03, 0.05)]
    elif kind == 'cassette':
        body = box(u, v, 0, 0, 0.86, 0.56, 0.16)
        col = '#5CF08A'
        P += [Part(box(u, v, 0, -0.14, 0.7, 0.3, 0.1), '#FFF35C', 0.025),
              Part(box(u, v, 0, -0.1, 0.4, 0.13, 0.11), '#4A4560', -0.035, 0.03),
              Part(circ(u, v, -0.23, -0.1, 0.085), '#FFFFFF', 0.04, 0.03),
              Part(circ(u, v, 0.23, -0.1, 0.085), '#FFFFFF', 0.04, 0.03),
              Part(circ(u, v, -0.23, -0.1, 0.035), '#4A4560', -0.02, 0.02),
              Part(circ(u, v, 0.23, -0.1, 0.035), '#4A4560', -0.02, 0.02),
              Part(box(u, v, 0, 0.39, 0.52, 0.14, 0.07), '#FF8A3D', 0.03),
              Part(circ(u, v, -0.3, 0.4, 0.045), '#3A3550', -0.03, 0.02),
              Part(circ(u, v, 0.3, 0.4, 0.045), '#3A3550', -0.03, 0.02)]
    elif kind == 'owl':
        body = circ(u, v, 0, 0.08, 0.78)
        for sx in (-1, 1):
            body = smin(body, ellip(u, v, sx * 0.55, -0.62, 0.17, 0.32, -sx * 0.5), 0.12)
        col = '#C4A3F2'
        P += [Part(ellip(u, v, 0, 0.26, 0.56, 0.5), '#FFD4EA', 0.02, 0.08)]
        for sx in (-1, 1):
            P += [Part(ellip(u, v, sx * 0.58, -0.78, 0.09, 0.14, -sx * 0.5), '#FF9EC7', 0.02, 0.05),
                  Part(circ(u, v, sx * 0.3, -0.08, 0.25), '#FFFFFF', 0.06, 0.06),
                  Part(circ(u, v, sx * 0.28, -0.06, 0.15), '#5EBBFF', 0.015, 0.03),
                  Part(circ(u, v, sx * 0.27, -0.05, 0.08), '#1E1A2E', 0.01, 0.02),
                  Part(circ(u, v, sx * 0.24, -0.11, 0.035), '#FFFFFF', 0.012, 0.015)]
        P += [Part(ellip(u, v, 0, 0.26, 0.14, 0.11), '#FFA94D', 0.06, 0.05),
              Part(ellip(u, v, 0, 0.52, 0.2, 0.08), '#E9608F', -0.02, 0.04)]
    elif kind == 'console':
        body = box(u, v, 0, 0, 0.62, 0.88, 0.2)
        col = '#9A68EC'
        dpad = np.minimum(box(u, v, -0.3, 0.3, 0.17, 0.06, 0.035), box(u, v, -0.3, 0.3, 0.06, 0.17, 0.035))
        P += [Part(box(u, v, 0, -0.4, 0.5, 0.35, 0.1), '#57506E', -0.02, 0.03),
              Part(box(u, v, 0, -0.4, 0.34, 0.26, 0.05), '#C9DAB0', -0.03, 0.02),
              Part(dpad, '#FF7FB5', 0.05),
              Part(circ(u, v, 0.22, 0.38, 0.09), '#FF7FB5', 0.05),
              Part(circ(u, v, 0.43, 0.24, 0.09), '#FF7FB5', 0.05),
              Part(box(u, v, -0.1, 0.6, 0.08, 0.03, 0.03), '#6A4FB0', 0.02, 0.02),
              Part(box(u, v, 0.12, 0.6, 0.08, 0.03, 0.03), '#6A4FB0', 0.02, 0.02)]
        for i in range(3):
            for j in range(3):
                P.append(Part(circ(u, v, 0.28 + i * 0.09, 0.62 + j * 0.08, 0.025), '#5B3F99', -0.02, 0.015))
    elif kind == 'phone':
        body = smin(box(u, v, 0, -0.47, 0.42, 0.42, 0.18), box(u, v, 0, 0.47, 0.46, 0.46, 0.18), 0.08)
        body = smin(body, box(u, v, 0.31, -0.93, 0.07, 0.1, 0.06), 0.05)
        col = '#FF8CC6'
        P += [Part(box(u, v, 0, -0.5, 0.3, 0.29, 0.07), '#F7E8EF', -0.04, 0.03),
              Part(box(u, v, 0, 0.0, 0.4, 0.07, 0.07), '#F27AB4', 0.04, 0.05)]
        for r in range(4):
            for c in range(3):
                P.append(Part(circ(u, v, -0.25 + c * 0.25, 0.22 + r * 0.17, 0.085), '#FFC2DF', 0.045))
    elif kind == 'skate':
        body = smin(box(u, v, -0.17, -0.24, 0.33, 0.44, 0.2), box(u, v, 0.05, 0.18, 0.6, 0.22, 0.2), 0.15)
        body = smin(body, box(u, v, -0.17, -0.66, 0.37, 0.1, 0.09), 0.05)
        body = np.minimum(body, box(u, v, 0.05, 0.44, 0.63, 0.06, 0.05))
        body = np.minimum(body, circ(u, v, 0.64, 0.33, 0.11))
        body = np.minimum(body, np.minimum(circ(u, v, -0.38, 0.64, 0.2), circ(u, v, 0.42, 0.64, 0.2)))
        col = '#FFF4EA'
        P += [Part(np.maximum(box(u, v, 0.05, 0.13, 0.7, 0.055, 0.01), body), '#9FD3FF', 0.015, 0.02),
              Part(box(u, v, -0.17, -0.66, 0.37, 0.1, 0.09), '#FF8CC0', 0.03, 0.06),
              Part(box(u, v, 0.05, 0.44, 0.63, 0.06, 0.05), '#B8B2C2', 0.03, 0.03),
              Part(circ(u, v, 0.64, 0.33, 0.11), '#FF6FA8', 0.06, 0.06),
              Part(circ(u, v, -0.38, 0.64, 0.2), '#FF6FA8', 0.12, 0.12),
              Part(circ(u, v, 0.42, 0.64, 0.2), '#FF6FA8', 0.12, 0.12),
              Part(circ(u, v, -0.38, 0.64, 0.08), '#FFFFFF', 0.03, 0.03),
              Part(circ(u, v, 0.42, 0.64, 0.08), '#FFFFFF', 0.03, 0.03)]
        for i, y in enumerate((-0.42, -0.26, -0.1)):
            P.append(Part(capsule(u, v, 0.02, y, 0.15, y + 0.03, 0.04), '#FFFFFF', 0.04, 0.04))
    return body, hexc(col), P


def build_object(kind, S, M):
    """Material layers on an MxM canvas with the object spanning S px."""
    ys, xs = np.mgrid[0:M, 0:M].astype(np.float32)
    u = (xs - M / 2) / (S / 2)
    v = (ys - M / 2) / (S / 2)
    px = 2.0 / S
    body, col, parts = object_parts(kind, u, v)
    alpha = np.clip(0.5 - body / px, 0, 1)
    height = dome(body, 0.32)
    color = np.broadcast_to(col, (M, M, 3)).copy()
    for p in parts:
        a = np.clip(0.5 - p.sdf / px, 0, 1)[..., None]
        color = color * (1 - a) + p.color * a
        height = height + p.lift * dome(p.sdf, p.bevel) / p.bevel
    fur = np.zeros((M, M), np.float32)
    if kind == 'owl':  # fluffy fur
        fur = (noise((M, M), 3, 7) * 0.006 + noise((M, M), 9, 8) * 0.008) * (alpha > 0)
        height = height + fur
        color = color * (1 + 0.05 * noise((M, M), 4, 9))[..., None]
    if kind == 'console':  # translucent: brighter near the rim
        rim = smooth(-body, 0.0, 0.12)
        color = color * (0.85 + 0.25 * (1 - rim))[..., None] + 0.06
    height = height * (alpha > 0.01)
    return dict(u=u, v=v, color=np.clip(color, 0, 1).astype(np.float32),
                h=height.astype(np.float32), fur=fur, a=alpha.astype(np.float32), body=body, px=px)


# ------------------------------------------------------------------ shading
def shade(color, h, scale, ks, shin, amb=0.42, ao_k=6.0):
    gy, gx = np.gradient(h * scale)
    n = np.stack([-gx, -gy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    diff = np.clip(n @ LIGHT, 0, 1)
    spec = np.clip(n @ HALF, 0, 1)
    if np.ndim(ks) == 0:
        ks = np.full(h.shape, ks, np.float32)
    if np.ndim(shin) == 0:
        shin = np.full(h.shape, shin, np.float32)
    s = ks * spec ** shin
    hb = ndi.gaussian_filter(h, 6)
    ao = np.clip(1 - (hb - h) * scale * ao_k / 40, 0.55, 1)
    out = color * (amb + (1 - amb) * diff)[..., None] * ao[..., None] + s[..., None]
    return np.clip(out, 0, 1)


def pink_shell(c):
    lum = c @ np.array([0.3, 0.55, 0.15], np.float32)
    return PINK * (0.62 + 0.42 * lum)[..., None] * 0.86 + c * 0.14


# --------------------------------------------------------------- background
_BG = None


def background():
    global _BG
    if _BG is not None:
        return _BG
    rng = np.random.default_rng(3)
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):  # wall to table
        t = y / H
        if t < 0.34:
            c = (238 - int(30 * t), 196 - int(40 * t), 200 - int(30 * t))
        else:
            k = (t - 0.34) / 0.66
            c = (226 - int(14 * k), 198 - int(16 * k), 172 - int(18 * k))
        d.line([(0, y), (W, y)], fill=c)
    toys = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(toys)
    # shelf edge
    td.rectangle([0, 395, W, 430], fill=(214, 170, 130, 255))
    # 3x3 puzzle cube
    cols = [(255, 70, 70), (255, 220, 40), (40, 160, 255), (60, 200, 90), (255, 140, 30), (250, 250, 250)]
    x0, y0, s = 30, 250, 46
    td.rounded_rectangle([x0 - 6, y0 - 6, x0 + 3 * s + 4, y0 + 3 * s + 4], 14, fill=(25, 25, 30, 255))
    for i in range(3):
        for j in range(3):
            c = cols[rng.integers(6)]
            td.rounded_rectangle([x0 + i * s, y0 + j * s, x0 + i * s + s - 6, y0 + j * s + s - 6], 8, fill=c + (255,))
    # plush bear with a rainbow tummy
    bx, by = 250, 250
    td.ellipse([bx - 70, by - 20, bx + 70, by + 150], fill=(250, 175, 205, 255))
    td.ellipse([bx - 55, by - 120, bx + 55, by - 10], fill=(250, 175, 205, 255))
    for ex in (-48, 48):
        td.ellipse([bx + ex - 24, by - 140, bx + ex + 24, by - 92], fill=(250, 175, 205, 255))
    for k, c in enumerate([(255, 90, 90), (255, 200, 60), (90, 200, 120), (90, 160, 255)]):
        r = 40 - k * 8
        td.pieslice([bx - r, by + 40 - r, bx + r, by + 40 + r], 180, 360, fill=c + (255,))
    # pastel pony
    px_, py_ = 470, 300
    td.ellipse([px_ - 80, py_ - 20, px_ + 60, py_ + 60], fill=(170, 225, 250, 255))
    td.ellipse([px_ + 30, py_ - 95, px_ + 105, py_ - 20], fill=(170, 225, 250, 255))
    td.ellipse([px_ + 10, py_ - 105, px_ + 60, py_ + 10], fill=(220, 120, 230, 255))
    for lx in (-60, -25, 15, 45):
        td.rounded_rectangle([px_ + lx, py_ + 40, px_ + lx + 22, py_ + 110], 10, fill=(170, 225, 250, 255))
    td.ellipse([px_ - 120, py_ - 10, px_ - 60, py_ + 80], fill=(220, 120, 230, 255))
    # yellow cassette player with orange headphones
    td.rounded_rectangle([600, 270, 720, 400], 18, fill=(255, 210, 50, 255))
    td.ellipse([585, 200, 640, 255], fill=(255, 130, 40, 255))
    td.ellipse([670, 200, 725, 255], fill=(255, 130, 40, 255))
    # neon slap bracelets on the table
    for k, c in enumerate([(255, 60, 170), (60, 240, 200), (255, 230, 60)]):
        td.ellipse([560 + k * 18, 440 + k * 6, 700 + k * 18, 500 + k * 6], outline=c + (255,), width=12)
    toys = toys.filter(ImageFilter.GaussianBlur(11))
    img.paste(toys, (0, 0), toys)
    # fairy-light bokeh
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for _ in range(46):
        x, y = rng.uniform(0, W), rng.uniform(0, 420)
        r = rng.uniform(8, 24)
        c = [(255, 140, 90), (255, 110, 170), (255, 190, 110)][rng.integers(3)]
        gd.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v * 0.55) for v in c))
    glow = glow.filter(ImageFilter.GaussianBlur(5))
    arr = np.asarray(img, np.float32) / 255 + np.asarray(glow, np.float32) / 255
    arr += noise((H, W), 2, 11)[..., None] * 0.008
    ys, xs = np.mgrid[0:H, 0:W]
    vig = 1 - 0.28 * (((xs - W / 2) / W) ** 2 + ((ys - H * 0.6) / H) ** 2) * 2
    _BG = np.clip(arr * vig[..., None], 0, 1).astype(np.float32)
    return _BG


def composite(dst, rgb, alpha, x0, y0, shadow=True, sh_off=(14, 22), sh_blur=18, sh_amt=0.4):
    pad = int(sh_blur * 3 + max(abs(sh_off[0]), abs(sh_off[1]))) if shadow else 0
    if pad:
        alpha = np.pad(alpha, pad)
        rgb = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)))
        x0, y0 = x0 - pad, y0 - pad
    h, w = alpha.shape
    ys, xs = slice(max(0, y0), min(H, y0 + h)), slice(max(0, x0), min(W, x0 + w))
    if ys.stop <= ys.start or xs.stop <= xs.start:
        return
    sy, sx = slice(ys.start - y0, ys.stop - y0), slice(xs.start - x0, xs.stop - x0)
    if shadow:
        sh = ndi.gaussian_filter(alpha, sh_blur)
        sh = ndi.shift(sh, (sh_off[1], sh_off[0]), order=0, cval=0)
        dst[ys, xs] *= (1 - sh_amt * sh[sy, sx])[..., None]
    a = alpha[sy, sx, None]
    dst[ys, xs] = dst[ys, xs] * (1 - a) + rgb[sy, sx] * a


# ------------------------------------------------------------------- thumbs
def draw_thumbs(frame, tips, lift):
    """tips: list of (x, y, angle) screen px; lift 0 pressed .. 1 raised."""
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    for (tx, ty, ang) in tips:
        r = 68 * (1 + 0.08 * lift)
        ty2 = ty + 30 * lift
        dx, dy = np.sin(ang), np.cos(ang)
        bx, by = tx + dx * 900, ty2 + dy * 900
        x0, x1 = int(max(0, min(tx, bx) - r - 90)), int(min(W, max(tx, bx) + r + 90))
        y0, y1 = int(max(0, ty2 - r - 90)), H
        if x1 <= x0 or y1 <= y0:
            continue
        X, Y = xs[y0:y1, x0:x1], ys[y0:y1, x0:x1]
        d = capsule(X, Y, tx, ty2, bx, by, r)
        a = np.clip(0.5 - d, 0, 1)
        hgt = dome(d, r)
        # nail: ellipse near the tip, along the thumb axis
        ncx, ncy = tx + dx * r * 0.55, ty2 + dy * r * 0.55
        lx = (X - ncx) * dy - (Y - ncy) * dx
        ly = (X - ncx) * dx + (Y - ncy) * dy
        nd = (np.hypot(lx / (r * 0.6), ly / (r * 0.78)) - 1) * r * 0.6
        na = np.clip(0.5 - nd, 0, 1)
        hgt = hgt + dome(nd, 8) * 0.6
        col = SKIN * (1 - na[..., None]) + NAIL * na[..., None]
        col = col * (1 - 0.06 * smooth(-d, 0, r)[..., None])
        ks = 0.08 + 0.85 * na
        shin = 10 + 70 * na
        rgb = shade(col, hgt, 1.0, ks, shin, amb=0.5, ao_k=1.5)
        sub = frame[y0:y1, x0:x1]
        sh = ndi.gaussian_filter(a, 10 + 14 * lift)
        off = int(10 + 30 * lift)
        sh = ndi.shift(sh, (off, off // 2), order=0, cval=0)
        sub *= (1 - (0.35 - 0.12 * lift) * sh)[..., None]
        sub[:] = sub * (1 - a[..., None]) + rgb * a[..., None]


# -------------------------------------------------------------------- audio
def audio_onsets():
    path = os.path.join(HERE, 'original_audio.wav')
    if not os.path.exists(path):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(HERE, 'original_audio.m4a'),
                        '-ac', '1', '-ar', '16000', path], check=True)
    w = wave.open(path)
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32)
    hop = 160
    e = np.sqrt(np.convolve(x ** 2, np.ones(480) / 480, 'same')[::hop])
    db = 20 * np.log10(e + 1)
    t = np.arange(len(db)) * hop / 16000
    thr = db.max() - 16
    peaks = []
    for i in range(2, len(db) - 2):
        if db[i] > thr and db[i] == db[i - 4:i + 5].max():
            if not peaks or t[i] - peaks[-1][0] > 0.14:
                peaks.append((t[i], (db[i] - thr) / 16))
    return peaks


# -------------------------------------------------------------- squish clip
TX, TY = 118, 96  # thumb tip offset from press point, px
OBJ_SCALE = {'egg': 520, 'cassette': 560, 'owl': 540, 'console': 470, 'phone': 440, 'skate': 540}


def render_squish(kind, coat, layers, t0, dur, out):
    S = OBJ_SCALE[kind]
    M = int(S * 1.45) // 2 * 2
    ob = build_object(kind, S, M)
    u, v, base_a = ob['u'], ob['v'], ob['a']
    rng = np.random.default_rng(sum(map(ord, kind)))
    cx, cy = W // 2, int(H * 0.6)
    x0, y0 = cx - M // 2, cy - M // 2

    # press events from the audio, relative to clip start
    ev = [(t - t0, s) for t, s in audio_onsets() if t0 - 0.05 <= t < t0 + dur - 0.05]
    if not ev:
        ev = [(0.3, 0.6)]
    centers = []
    for k, _ in enumerate(ev):
        ang = rng.uniform(0, 2 * np.pi)
        rad = 0.12 + 0.18 * min(1, k / 4)
        centers.append((np.cos(ang) * rad * 0.8, np.sin(ang) * rad * 0.6 + 0.05))

    # wax: voronoi shell pieces, fewer and chunkier with more layers
    if coat == 'wax':
        nseed = {1: 70, 2: 34, 3: 16}[layers]
        seeds = rng.uniform(-0.95, 0.95, (nseed, 2)).astype(np.float32)
        d = np.stack([np.hypot(u - sx, v - sy) for sx, sy in seeds], 0)
        order = np.argsort(d, 0)
        id1, id2 = order[0], order[1]
        d1 = np.take_along_axis(d, order[:1], 0)[0]
        d2 = np.take_along_axis(d, order[1:2], 0)[0]
        border = (d2 - d1) / 2
        del d, order
        crack_t = np.full(nseed, np.inf)
        flake_t = np.full(nseed, np.inf)
        for k_ev, ((te, s), (pcx, pcy)) in enumerate(zip(ev, centers)):
            dist = np.hypot(seeds[:, 0] - pcx, seeds[:, 1] - pcy)
            reach = 0.22 + 0.25 * s + 0.08 * layers + 0.03 * k_ev
            hit = dist < reach
            crack_t[hit] = np.minimum(crack_t[hit], te + dist[hit] * 0.08)
            fl = dist < reach * (0.55 + 0.1 * layers)
            jitter = rng.uniform(0.04, 0.25, nseed)
            flake_t[fl] = np.minimum(flake_t[fl], te + 0.05 + jitter[fl])
        fly_dir = rng.uniform(0, 2 * np.pi, nseed)
        shell_t = 0.022 * layers
    else:
        pnoise = noise((M, M), 40, 5)
        wrn = noise((M, M), 18, 6)
        lipw = 0.03 + 0.02 * layers

    frames = int(round(dur * FPS))
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                             '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264',
                             '-crf', '16', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    bg = background()
    for f in range(frames):
        t = f / FPS
        dent = np.zeros((M, M), np.float32)
        bulge = np.zeros((M, M), np.float32)
        wx = np.zeros((M, M), np.float32)
        wy = np.zeros((M, M), np.float32)
        spread = 0.0
        active, lift = None, 1.0
        for (te, s), (pcx, pcy) in zip(ev, centers):
            e = smooth(t, te - 0.12, te + 0.06)
            if e <= 0:
                continue
            rel = 1 - 0.55 * smooth(t, te + 0.08, te + 0.35)
            amt = (0.5 + 0.6 * s) * e * rel
            r = np.hypot(u - pcx, v - pcy)
            g = np.exp(-(r / 0.24) ** 2)
            dent += amt * 0.05 * g
            for sx in (-1, 1):  # dents under each thumb tip
                rt = np.hypot(u - (pcx + sx * TX / (S / 2)), v - (pcy + TY / (S / 2)))
                dent += amt * 0.09 * np.exp(-(rt / 0.2) ** 2)
            bulge += amt * 0.035 * np.exp(-((r - 0.32) / 0.12) ** 2)
            push = amt * 0.05 * np.exp(-((r - 0.22) / 0.18) ** 2)
            wx += push * (u - pcx) / (r + 1e-3)
            wy += push * (v - pcy) / (r + 1e-3)
            spread += 0.012 * e
            if te - 0.3 <= t <= te + 0.3:
                active = (pcx, pcy)
                lift = min(lift, 1 - (e * (1 - smooth(t, te + 0.12, te + 0.3))))
        spread = min(spread, 0.08)

        color = ob['color'].copy()
        hgt = ob['h'].copy()
        ks = np.zeros((M, M), np.float32)
        shin = np.full((M, M), 10, np.float32)
        flyers = []
        if coat == 'wax':
            cr = crack_t <= t
            fl = flake_t <= t
            in_shell = ~fl[id1]
            cracked = cr[id1] | cr[id2]
            line = in_shell & cracked & (border < 0.0025 + 0.0015 * layers) & (base_a > 0.5)
            rim = in_shell & fl[id2] & (border < shell_t)
            inner = ~in_shell
            color[inner] = CLAY * 1.04
            hgt = np.where(inner, hgt - ob['fur'] - shell_t * 0.9, hgt)
            # visible wax strata on broken edges
            if rim.any():
                k = np.floor(border[rim] / shell_t * layers).astype(int) % 2
                color[rim] = np.where(k[:, None] == 0, ob['color'][rim] * 0.82, ob['color'][rim] * 1.05)
            color[line] = color[line] * 0.55 + np.array([0.25, 0.12, 0.2], np.float32) * 0.15
            hgt = np.where(line, hgt - 0.012, hgt)
            ks = np.where(inner, 0.1, 0.06).astype(np.float32)
            shin = np.where(inner, 18, 6).astype(np.float32)
            for i in np.nonzero(fl & (flake_t > t - 0.7))[0]:
                age = t - flake_t[i]
                flyers.append((i, age))
        else:
            peel = np.full((M, M), -1.0, np.float32)
            for (te, s), (pcx, pcy) in zip(ev, centers):
                g = smooth(t, te - 0.02, te + 0.4)
                if g <= 0:
                    continue
                rad = (0.12 + 0.2 * s + 0.04 * (4 - layers)) * g
                r = np.hypot(u - pcx, (v - pcy) * 1.1)
                peel = np.maximum(peel, rad + 0.05 * pnoise * g - r)
            peeled = peel > 0
            lip = (peel <= 0) & (peel > -lipw) & (base_a > 0.5)
            wrinkle = (peel <= 0) & (peel > -0.2)
            shell_col = pink_shell(ob['color'])
            color = np.where(peeled[..., None], ob['color'] * 0.97, shell_col)
            hgt = np.where(peeled, hgt - 0.01 * layers, hgt)
            # wrinkles in the polish film ahead of the tear, plus a curled lip
            hw = np.where(wrinkle, 0.006 * layers * np.sin((peel * 90 + wrn * 3)) * smooth(peel, -0.2, -0.02), 0)
            hgt = hgt + hw + np.where(lip, 0.012 * layers * np.sin(np.pi * (-peel / lipw)), 0)
            color = np.where(lip[..., None], color * 0.9 + PINK * 0.1, color)
            ks = np.where(peeled, 0.12, 0.9).astype(np.float32)
            shin = np.where(peeled, 14, 90).astype(np.float32)

        hgt = (hgt - dent + bulge) * (base_a > 0.01)
        # spread + local push warp (inverse map)
        su = u / (1 + spread) - wx
        sv = v / (1 + spread * 0.7) - wy
        coords = [sv * (S / 2) + M / 2, su * (S / 2) + M / 2]
        def warp(a, order=1):
            return ndi.map_coordinates(a, coords, order=order, mode='constant')
        a_w = warp(base_a)
        h_w = warp(hgt)
        c_w = np.stack([warp(color[..., i]) for i in range(3)], -1)
        ks_w, sh_w = warp(ks), warp(shin)
        rgb = shade(c_w, h_w, S * 0.5, ks_w, sh_w)

        frame = bg.copy()
        composite(frame, rgb, a_w, x0, y0)

        # flying wax flakes
        for i, age in flyers:
            mask = (id1 == i) & (base_a > 0.5)
            if not mask.any():
                continue
            ys_, xs_ = np.nonzero(mask)
            ya, yb, xa, xb = ys_.min(), ys_.max() + 1, xs_.min(), xs_.max() + 1
            piece_a = mask[ya:yb, xa:xb].astype(np.float32)
            piece_h = ob['h'][ya:yb, xa:xb] * 0.3 + 0.02
            piece = shade(ob['color'][ya:yb, xa:xb], piece_h, S * 0.5, 0.06, 6)
            sp = 160 + 120 * (layers == 1)
            ox = np.cos(fly_dir[i]) * sp * age
            oy = np.sin(fly_dir[i]) * sp * age * 0.6 + 900 * age * age
            fade = 1 - smooth(age, 0.45, 0.7)
            composite(frame, piece, piece_a * fade, int(x0 + xa + ox), int(y0 + ya + oy),
                      sh_off=(8, 14), sh_blur=6, sh_amt=0.35)

        # thumbs
        if active is None:
            nxt = [c for (te, _), c in zip(ev, centers) if te > t]
            active = nxt[0] if nxt else centers[-1]
        ax = cx + active[0] * S / 2
        ay = cy + active[1] * S / 2
        draw_thumbs(frame, [(ax - TX, ay + TY, -0.45), (ax + TX, ay + TY + 6, 0.45)], lift)

        proc.stdin.write((np.clip(frame, 0, 1) * 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    proc.wait()


# ------------------------------------------------------------------- opener
def render_opener(dur, out):
    frame0 = background().copy()
    tw, th = 640, 900
    tx0, ty0 = (W - tw) // 2, int(H * 0.6) - th // 2
    ys, xs = np.mgrid[0:th, 0:tw].astype(np.float32)
    outer = box(xs, ys, tw / 2, th / 2, tw / 2 - 2, th / 2 - 2, 60)
    inner = box(xs, ys, tw / 2, th / 2, tw / 2 - 34, th / 2 - 34, 36)
    a = np.clip(0.5 - outer, 0, 1)
    hgt = dome(outer, 26) - dome(inner, 14) * 0.9
    warpn = noise((th, tw), 120, 2)
    grain = np.sin(xs * 0.07 + warpn * 3.0 + noise((th, tw), 40, 4) * 0.6)
    fine = np.sin(xs * 0.6 + warpn * 9)
    wood = hexc('#E0A866') * (0.9 + 0.07 * grain + 0.02 * fine)[..., None]
    rgb = shade(wood, hgt, 1.0, 0.12, 12, ao_k=1.2)
    composite(frame0, rgb, a, tx0, ty0, sh_off=(16, 26), sh_blur=22, sh_amt=0.45)
    layout = [('egg', 'wax', 0, 0), ('cassette', 'np', 1, 0), ('owl', 'wax', 0, 1),
              ('console', 'np', 1, 1), ('phone', 'wax', 0, 2), ('skate', 'np', 1, 2)]
    for kind, coat, c, r in layout:
        S = int(OBJ_SCALE[kind] * 0.43)
        M = int(S * 1.2) // 2 * 2
        ob = build_object(kind, S, M)
        col = ob['color'] if coat == 'wax' else pink_shell(ob['color'])
        rgb = shade(col, ob['h'], S * 0.5, 0.06 if coat == 'wax' else 0.9, 6 if coat == 'wax' else 90)
        ox = tx0 + 170 + c * 300 - M // 2
        oy = ty0 + 150 + r * 290 - M // 2
        composite(frame0, rgb, ob['a'], ox, oy, sh_off=(8, 12), sh_blur=8, sh_amt=0.4)
    frames = int(round(dur * FPS))
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                             '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264',
                             '-crf', '16', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(frames):
        frame = frame0.copy()
        k = f / frames
        draw_thumbs(frame, [(250 + 6 * k, 1210 - 8 * k, -0.35), (470 - 6 * k, 1214 - 8 * k, 0.35)], 0.6)
        # slow push-in like a handheld opener
        z = 1 + 0.03 * k
        img = Image.fromarray((np.clip(frame, 0, 1) * 255).astype(np.uint8))
        cw, ch = int(W / z), int(H / z)
        img = img.crop(((W - cw) // 2, (H - ch) // 2, (W + cw) // 2, (H + ch) // 2)).resize((W, H), Image.LANCZOS)
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    proc.wait()


JOBS = {
    1: ('opener', None, 0),
    2: ('egg', 'wax', 1),
    3: ('cassette', 'np', 1),
    4: ('owl', 'wax', 2),
    5: ('console', 'np', 2),
    6: ('phone', 'wax', 3),
    7: ('skate', 'np', 3),
}


def run(n):
    kind, coat, layers = JOBS[n]
    t0, dur = CUTS[n - 1], CUTS[n] - CUTS[n - 1]
    out = os.path.join(HERE, 'clips', f'{n:02d}.mp4')
    if kind == 'opener':
        render_opener(dur, out)
    else:
        render_squish(kind, coat, layers, t0, dur, out)
    return out


if __name__ == '__main__':
    os.makedirs(os.path.join(HERE, 'clips'), exist_ok=True)
    todo = [int(a) for a in sys.argv[1:]] or list(JOBS)
    audio_onsets()
    with Pool(min(4, len(todo))) as p:
        for o in p.imap_unordered(run, todo):
            print('wrote', o, flush=True)
