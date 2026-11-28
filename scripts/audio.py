#!/usr/bin/env python3
"""Procedural stereo soundtrack for "shut the world off".

Reads build/bake.json (the same event timestamps the renderer uses) and writes
build/audio.wav: 48 kHz stereo 32-bit float, normalised to -14 LUFS with a
-1 dBTP ceiling.

    python3 scripts/audio.py                 full 60 s mix -> build/audio.wav
    python3 scripts/audio.py --sample 0 10   also export out/audio_sample_0-10s.wav
"""
import json
import sys
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
DUR = 60.0
N = int(SR * DUR)
ANC = 1.5
rng = np.random.default_rng(20261128)
t_axis = np.arange(N) / SR

bake = json.loads((ROOT / "build/bake.json").read_text())
fps = bake["fps"]


def curve(name):
    """Per-frame curve from the bake, interpolated to audio rate."""
    c = np.asarray(bake["curves"][name], dtype=np.float64)
    return np.interp(t_axis, np.arange(len(c)) / fps, c)


breath = curve("breath")
swirl_pan = curve("swirlPan")


def smoothstep(a, b, x):
    k = np.clip((x - a) / (b - a), 0.0, 1.0)
    return k * k * (3 - 2 * k)


def env_window(a0, a1, b0, b1):
    return smoothstep(a0, a1, t_axis) * (1 - smoothstep(b0, b1, t_axis))


def sos_filter(kind, freq, x, order=2):
    sos = signal.butter(order, freq, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def pan_gains(p):
    """Constant-power pan, p in [-1, 1]."""
    a = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def stereo_noise(n, corr=0.3):
    a = rng.standard_normal(n)
    b = rng.standard_normal(n)
    c = rng.standard_normal(n)
    return np.stack([a * (1 - corr) + c * corr, b * (1 - corr) + c * corr])


def pink(x):
    # Paul Kellet's economy pink filter coefficients via IIR approximation
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, x, axis=-1)


dry = np.zeros((2, N))
send = np.zeros((2, N))  # reverb send


def add(sig, start=0, gain=1.0, rev=0.0):
    """Mix a (2, n) block into the bus at sample `start`."""
    n = sig.shape[1]
    s0 = max(0, start)
    s1 = min(N, start + n)
    if s1 <= s0:
        return
    seg = sig[:, s0 - start : s1 - start] * gain
    dry[:, s0:s1] += seg
    if rev:
        send[:, s0:s1] += seg * rev


# --------------------------------------------------------------- 0:00-1:50 room
room_n = int(SR * (ANC + 0.05))
room = pink(stereo_noise(room_n, 0.5))
room = sos_filter("lowpass", 1400, room, 4)
room = sos_filter("highpass", 70, room, 2)
room /= np.max(np.abs(room)) + 1e-9
tt = np.arange(room_n) / SR
hum = (np.sin(2 * np.pi * 60 * tt) * 0.5 + np.sin(2 * np.pi * 120 * tt) * 0.3 + np.sin(2 * np.pi * 180 * tt) * 0.12)
hum *= 1 + 0.15 * np.sin(2 * np.pi * 0.7 * tt)
room = room * 0.55 + hum * 0.22
# restless murmur: slow random level changes
room *= 0.8 + 0.2 * np.interp(tt, np.linspace(0, tt[-1], 12), rng.random(12))
fade_in = smoothstep(0, 0.12, tt)
cut = 1 - smoothstep(ANC - 0.004, ANC + 0.006, tt)  # ANC kills it instantly
add(room * fade_in * cut, 0, gain=0.09)

# --------------------------------------------------------------- 0:01.5 ANC engage
s_anc = int(round(ANC * SR))
# muted click: tiny damped tick + soft low thump, both rolled off
cn = int(0.08 * SR)
ct = np.arange(cn) / SR
tick = np.sin(2 * np.pi * 1900 * ct) * np.exp(-ct / 0.0016)
thump = np.sin(2 * np.pi * 105 * ct) * np.exp(-ct / 0.022) * smoothstep(0, 0.002, ct)
click = sos_filter("lowpass", 2600, tick * 0.55 + thump * 0.9, 2)
add(np.stack([click, click]), s_anc, gain=0.30, rev=0.12)

# downward low-pass whoosh (time-varying 2-pole one-pole cascade)
wn = int(0.95 * SR)
wt = np.arange(wn) / SR
wnoise = stereo_noise(wn, 0.6)
cutoff = 120 + (7500 - 120) * np.exp(-wt / 0.16)
alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
y = np.zeros_like(wnoise)
s1 = np.zeros(2)
s2 = np.zeros(2)
for i in range(wn):
    s1 += alpha[i] * (wnoise[:, i] - s1)
    s2 += alpha[i] * (s1 - s2)
    y[:, i] = s2
wenv = smoothstep(0, 0.012, wt) * np.exp(-wt / 0.30)
whoosh = y * wenv
whoosh /= np.max(np.abs(whoosh)) + 1e-9
add(whoosh, s_anc, gain=0.16, rev=0.2)
# pressure drop: a sub sweep the ear reads as "sealed"
pd = np.sin(2 * np.pi * np.cumsum(70 - 32 * smoothstep(0, 0.5, wt)) / SR) * smoothstep(0, 0.02, wt) * np.exp(-wt / 0.35)
add(np.stack([pd, pd]), s_anc, gain=0.14)

# --------------------------------------------------------------- underwater bed
bed = np.cumsum(stereo_noise(N, 0.4), axis=1)  # brown noise
bed = sos_filter("highpass", 25, bed, 2)
bed = sos_filter("lowpass", 320, bed, 4)
bed /= np.percentile(np.abs(bed), 99.5) + 1e-9
drone = np.zeros(N)
for f, a in [(mtof(38), 0.40), (mtof(45), 0.22), (mtof(50), 0.12)]:  # D2, A2, D3
    drone += a * np.sin(2 * np.pi * f * t_axis + rng.random() * 6.28) * (1 + 0.2 * np.sin(2 * np.pi * 0.05 * t_axis + rng.random() * 6.28))
bed_env = smoothstep(ANC, ANC + 0.06, t_axis) * (1 - smoothstep(36.0, 44.0, t_axis))
breathe = 0.78 + 0.22 * breath  # the hidden breathing cadence, audible as a slow swell
bed_mix = (bed * 0.75 + drone[None, :] * 0.55) * (bed_env * breathe)[None, :]
add(bed_mix, 0, gain=0.17, rev=0.08)

# --------------------------------------------------------------- bubbling water
bub = np.zeros((2, N))
water_env = env_window(5.0, 7.0, 32.5, 36.5)
rate = 3.2 + 2.0 * env_window(5, 8, 19, 22) + 1.0 * env_window(20, 23, 32, 35)
tcur = 5.0
while tcur < 36.5:
    r = np.interp(tcur, t_axis[:: SR // 100], rate[:: SR // 100])
    tcur += rng.exponential(1 / r)
    if tcur >= 36.5:
        break
    f0 = np.exp(rng.uniform(np.log(260), np.log(950)))
    dur = rng.uniform(0.025, 0.08)
    bn = int(dur * 4 * SR)
    bt = np.arange(bn) / SR
    ph = 2 * np.pi * np.cumsum(f0 * (1 + 0.9 * bt / dur * 0.25)) / SR
    b = np.sin(ph) * np.exp(-bt / dur) * smoothstep(0, 0.002, bt) * rng.uniform(0.3, 1.0)
    gl, gr = pan_gains(rng.uniform(-0.8, 0.8))
    s0 = int(tcur * SR)
    s1 = min(N, s0 + bn)
    bub[0, s0:s1] += b[: s1 - s0] * gl
    bub[1, s0:s1] += b[: s1 - s0] * gr
bub = sos_filter("lowpass", 2200, bub, 2)
trickle = sos_filter("bandpass", [350, 1100], stereo_noise(N, 0.2), 2)
trickle *= 0.6 + 0.4 * np.abs(sos_filter("lowpass", 3, rng.standard_normal(N), 1))[None, :] * 3
add((bub * 0.9 + trickle * 0.05) * water_env[None, :], 0, gain=0.22, rev=0.25)

# --------------------------------------------------------------- glass marimba chimes
PARTIALS = [(1.0, 1.0, 1.0), (2.76, 0.10, 0.45), (3.93, 0.32, 0.30), (9.2, 0.05, 0.10)]  # ratio, amp, decay scale


def chime(midi, vel):
    f = mtof(midi)
    base_decay = 2.4 * (440 / f) ** 0.35
    n = int(min(5.0, base_decay * 2.6) * SR)
    ct = np.arange(n) / SR
    attack = smoothstep(0, 0.0035, ct)
    out = np.zeros((2, n))
    for ratio, amp, dsc in PARTIALS:
        fp = f * ratio
        if fp > 9000:
            continue
        bright = amp * (0.45 + 0.55 * vel) if ratio > 1 else amp
        decay = base_decay * dsc
        for ch, det in ((0, -0.6), (1, 0.6)):  # tiny L/R detune = shimmer
            fr = fp * 2 ** (det / 1200)
            out[ch] += bright * np.sin(2 * np.pi * fr * ct) * np.exp(-ct / decay)
    # soft mallet: short filtered noise tap
    tapn = min(n, int(0.012 * SR))
    tap = sos_filter("bandpass", [f * 0.8, min(f * 4, 8000)], rng.standard_normal(tapn), 1) * np.exp(-np.arange(tapn) / SR / 0.003)
    out[:, :tapn] += tap * 0.15
    return out * attack * (0.25 + 0.75 * vel)


chime_log = []
for e in bake["events"]:
    if not e.get("chime"):
        continue
    s0 = int(round(e["t"] * SR))
    gl, gr = pan_gains(e["pan"] * 0.7)
    for k, m in enumerate(e["notes"]):
        c = chime(m, e["velocity"]) * (1.0 if k == 0 else 0.55)
        c[0] *= gl
        c[1] *= gr
        add(c, s0, gain=0.20, rev=0.5)
    chime_log.append(e)

# --------------------------------------------------------------- rainstick shimmer (bead swirl)
rs_env = env_window(19.6, 22.6, 32.8, 36.0)
dens = rs_env * (140 + 260 * (0.5 + 0.5 * np.sin(2 * np.pi * t_axis / 5.0 + 1.0)) * (0.7 + 0.3 * breath))
hits = rng.random(N) < dens / SR
idx = np.nonzero(hits)[0]
amps = rng.uniform(0.2, 1.0, len(idx)) * rng.choice([-1, 1], len(idx))
# pan follows the swirl, sweeping left <-> right with a little scatter
pans = np.clip(swirl_pan[idx] * 0.85 + rng.normal(0, 0.15, len(idx)), -1, 1)
gl, gr = pan_gains(pans)
imp = np.zeros((2, N))
imp[0, idx] = amps * gl
imp[1, idx] = amps * gr
pebbles = sos_filter("bandpass", [2200, 3600], imp, 2) * 0.7 + sos_filter("bandpass", [3800, 5600], imp, 2) * 0.45
pebbles = sos_filter("lowpass", 7000, pebbles, 2)
pebbles /= np.percentile(np.abs(pebbles), 99.9) + 1e-9
add(pebbles, 0, gain=0.05, rev=0.35)

# --------------------------------------------------------------- warm pad 0:35-0:60
CHORDS = [  # (start, midi notes)  D add9 -> Bm7 -> G maj7 -> D add9 resolve
    (34.8, [38, 45, 54, 57, 64]),
    (40.8, [35, 42, 50, 57, 61]),
    (46.6, [31, 38, 47, 54, 57]),
    (52.4, [38, 45, 54, 57, 64]),
]
pad = np.zeros((2, N))
for ci, (start, notes) in enumerate(CHORDS):
    end = CHORDS[ci + 1][0] + 2.5 if ci + 1 < len(CHORDS) else DUR
    s0 = int(start * SR)
    s1 = min(N, int(end * SR))
    ct = np.arange(s1 - s0) / SR
    att = smoothstep(0, 3.0, ct)
    rel = 1 - smoothstep((end - start) - 3.0, (end - start), ct) if ci + 1 < len(CHORDS) else np.ones_like(ct)
    for ni, m in enumerate(notes):
        f = mtof(m)
        # the resolving chord thins out from the top voice down
        thin = np.ones_like(ct)
        if ci == len(CHORDS) - 1 and ni >= 3:
            thin = 1 - smoothstep(54.0 + (ni - 3) * 1.2 - start, 56.5 + (ni - 3) * 1.2 - start, ct)
        for vi, det in enumerate((-5, 0, 5)):
            fr = f * 2 ** (det / 1200)
            v = np.zeros_like(ct)
            h = 1
            while fr * h < 1100 and h <= 10:  # no harsh treble, by construction
                v += np.sin(2 * np.pi * fr * h * ct + (vi + h) * 1.3) / h ** 1.7
                h += 1
            g = (0.9 if m < 50 else 0.55) / 3
            gl, gr = pan_gains((vi - 1) * 0.55)
            pad[0, s0:s1] += v * g * gl * att * rel * thin
            pad[1, s0:s1] += v * g * gr * att * rel * thin
pad = sos_filter("lowpass", 1400, pad, 2)
pad_env = smoothstep(34.8, 40.0, t_axis) * (0.85 + 0.15 * breath) * (1 - 0.35 * smoothstep(48, 58, t_axis))
add(pad * pad_env[None, :], 0, gain=0.11, rev=0.4)

# --------------------------------------------------------------- reverb
ir_len = int(3.6 * SR)
it = np.arange(ir_len) / SR
ir = stereo_noise(ir_len, 0.05) * np.exp(-it / 0.9)[None, :]
ir = sos_filter("lowpass", 4200, ir, 2)
ir[:, : int(0.018 * SR)] = 0  # pre-delay
ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True)) + 1e-9
wet = np.stack([signal.fftconvolve(send[0], ir[0])[:N], signal.fftconvolve(send[1], ir[1])[:N]])
mix = dry + wet * 0.55

# --------------------------------------------------------------- master
mix = sos_filter("highpass", 22, mix, 2)
tail = 1 - smoothstep(57.0, 60.0, t_axis) ** 1.0  # clean fade to silence at 60.0 s
mix *= tail[None, :]
mix[:, -1] = 0.0


def true_peak_db(x):
    up = signal.resample_poly(x, 4, 1, axis=1)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-12)


def limiter(x, ceiling_db=-1.2, look=0.004, release=0.12):
    ceil = 10 ** (ceiling_db / 20)
    peak = np.max(np.abs(x), axis=0)
    la = int(look * SR)
    # windowed max = lookahead: gain is already down when the peak arrives
    peak = np.max(np.lib.stride_tricks.sliding_window_view(np.pad(peak, (la, la)), 2 * la + 1), axis=1)
    gain_target = np.minimum(1.0, ceil / (peak + 1e-12))
    g = np.empty_like(gain_target)
    rel = np.exp(-1 / (release * SR))
    cur = 1.0
    for i in range(len(g)):  # instant attack (lookahead covers it), smooth release
        tg = gain_target[i]
        cur = tg if tg < cur else tg + (cur - tg) * rel
        g[i] = cur
    return x * g[None, :]


meter = pyln.Meter(SR)
TARGET = -14.0
for _ in range(4):
    lufs = meter.integrated_loudness(mix.T)
    mix *= 10 ** ((TARGET - lufs) / 20)
    if true_peak_db(mix) > -1.0:
        mix = limiter(mix)
    else:
        break
lufs = meter.integrated_loudness(mix.T)
tp = true_peak_db(mix)

out = ROOT / "build/audio.wav"
out.parent.mkdir(exist_ok=True)
wavfile.write(out, SR, mix.T.astype(np.float32))
print(f"audio: {out}  integrated {lufs:.2f} LUFS  true peak {tp:.2f} dBTP  chimes {len(chime_log)}")

log = ROOT / "out/audio_events.txt"
log.parent.mkdir(exist_ok=True)
lines = [f"ANC engage            t=1.500s  frame 90  (room tone cut + click + low-pass whoosh)"]
for e in chime_log:
    names = " ".join(["D", "E", "F#", "A", "B"][[62, 64, 66, 69, 71].index(((m - 62) % 12) + 62)] + str(m // 12 - 1) for m in e["notes"])
    lines.append(f"{e['type']:<20}  t={e['t']:.3f}s  frame {e['frame']:>4}  {e['a']}+{e['b']}  notes {names}  vel {e['velocity']}  pan {e['pan']:+.2f}")
log.write_text("\n".join(lines) + "\n")

if "--sample" in sys.argv:
    i = sys.argv.index("--sample")
    a, b = float(sys.argv[i + 1]), float(sys.argv[i + 2])
    seg = mix[:, int(a * SR) : int(b * SR)].copy()
    fl = int(0.15 * SR)
    seg[:, -fl:] *= np.linspace(1, 0, fl)[None, :]  # avoid a click at the cut
    sp = ROOT / f"out/audio_sample_{a:g}-{b:g}s.wav"
    wavfile.write(sp, SR, seg.T.astype(np.float32))
    print(f"sample: {sp}")
