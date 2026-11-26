"""Bergenline Ave 8-bit run video.

Renders a vertical (576x1024) pixel-art side-scroller video with an
original character running up Bergenline Avenue in North Bergen, NJ.
Generates its own chiptune soundtrack. Output: bergenline_run.mp4
"""
import math
import random
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent
W, H = 144, 256          # native pixel canvas
SCALE = 4                # -> 576 x 1024
FPS = 30
GROUND = 196             # sidewalk top (player feet)
LEVEL_W = 2560
SPEED = 42.0             # px per second
T_RUN = 1.5              # run starts
X0 = 20.0

# ---------------------------------------------------------------- font
GLYPHS = {
    'A': ".#.#.#####.##.#",
    'B': "##.#.###.#.###.",
    'C': ".###..#..#...##",
    'D': "##.#.##.##.###.",
    'E': "####..##.#..###",
    'F': "####..##.#..#..",
    'G': ".###..#.##.#.##",
    'H': "#.##.#####.##.#",
    'I': "###.#..#..#.###",
    'J': "..#..#..##.#.#.",
    'K': "#.##.###.#.##.#",
    'L': "#..#..#..#..###",
    'M': "#.########.##.#",
    'N': "##.#.##.##.##.#",
    'O': ".#.#.##.##.#.#.",
    'P': "##.#.###.#..#..",
    'Q': ".#.#.##.###..##",
    'R': "##.#.###.#.##.#",
    'S': ".###...#...###.",
    'T': "###.#..#..#..#.",
    'U': "#.##.##.##.####",
    'V': "#.##.##.##.#.#.",
    'W': "#.##.########.#",
    'X': "#.##.#.#.#.##.#",
    'Y': "#.##.#.#..#..#.",
    'Z': "###..#.#.#..###",
    '0': "####.##.##.####",
    '1': ".#.##..#..#.###",
    '2': "##...#.#.#..###",
    '3': "##...#.#...###.",
    '4': "#.##.####..#..#",
    '5': "####..##...###.",
    '6': ".###..####.####",
    '7': "###..#.#..#..#.",
    '8': "####.#####.####",
    '9': "####.####..###.",
    '-': "......###......",
    '!': ".#..#..#.....#.",
    '.': ".............#.",
    ',': "..........#.#..",
    ':': "....#.....#....",
    'x': "...#.#.#.#.#...",
    ' ': "...............",
    "'": ".#..#..........",
    '$': ".####..#..####.",
}


def text_w(s, sc=1):
    return len(s) * 4 * sc - sc


def draw_text(img, x, y, s, col, sc=1, shadow=None):
    d = ImageDraw.Draw(img)
    for pass_ in ([shadow, col] if shadow else [col]):
        off = sc if (shadow and pass_ is shadow) else 0
        cx = x
        for ch in s:
            g = GLYPHS.get(ch.upper() if ch != "x" else "x", GLYPHS[" "])
            for i, c in enumerate(g):
                if c == "#":
                    px, py = cx + (i % 3) * sc + off, y + (i // 3) * sc + off
                    d.rectangle([px, py, px + sc - 1, py + sc - 1], fill=pass_)
            cx += 4 * sc


# ---------------------------------------------------------------- sprites
def sprite(rows, pal):
    h, w = len(rows), max(len(r) for r in rows)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in pal:
                im.putpixel((x, y), pal[c])
    return im


PAL = {
    "K": (20, 20, 30, 255), "C": (232, 64, 40, 255), "S": (246, 190, 140, 255),
    "H": (60, 36, 24, 255), "T": (24, 170, 160, 255), "B": (40, 70, 170, 255),
    "W": (250, 250, 250, 255), "E": (20, 20, 30, 255), "Y": (255, 210, 60, 255),
    "G": (140, 140, 160, 255), "g": (100, 100, 120, 255), "O": (240, 150, 40, 255),
    "R": (210, 30, 40, 255), "r": (150, 20, 30, 255), "D": (90, 90, 100, 255),
    "L": (200, 200, 210, 255), "P": (120, 200, 120, 255), "M": (240, 120, 170, 255),
}

HEAD = [
    "....CCCCC...",
    "...CCCCCCCCC",
    "...HHSSES...",
    "..HHSSSSSS..",
    "..HHSSSSS...",
    "....SSSS....",
]
P_RUN = [
    sprite(HEAD + [
        "...TTTTTT...", "..TTTTTTTT..", ".STTTYTTTTS.", ".S.TTTTTT.S.",
        "...BBBBBB...", "...BBBBBB...", "..BBB..BBB..", "..BB....BB..",
        ".WWW....WWW.", ".WW......WW."], PAL),
    sprite(HEAD + [
        "...TTTTTT...", "...TTTTTTS..", "..STTYTTTS..", "...TTTTTT...",
        "...BBBBBB...", "....BBBB....", "....BBB.....", "....BBB.....",
        "....WWWW....", "....WWW....."], PAL),
    sprite(HEAD + [
        "...TTTTTT.S.", "..TTTTTTTTS.", "STTTTYTTTT..", "S..TTTTTT...",
        "...BBBBBB...", "..BBB..BBB..", ".BBB....BBB.", "BBB......BB.",
        "WWW.......WW", "WW........WW"], PAL),
]
P_JUMP = sprite([
    "....CCCCC..S",
    "...CCCCCCCCS",
    "...HHSSES..S",
    "..HHSSSSSS.T",
    "..HHSSSSS.TT",
    "....SSSS.TT.",
    "...TTTTTTT..", "..TTTTTTT...", ".STTTYTTT...", ".S.TTTTTT...",
    "...BBBBBB...", "..BBBBBBBB..", "..BB....BBB.", ".BB......WWW",
    ".WWW.....WW.", ".WW........."], PAL)
P_POLE = sprite([
    "....CCCCC...", "...CCCCCCCCC", "...HHSSES.SS", "..HHSSSSSSS.",
    "..HHSSSSS...", "....SSSS....", "...TTTTTTSS.", "..TTTTTTT...",
    "..TTTYTTTSS.", "...TTTTTT...", "...BBBBBB...", "...BBBBBBB..",
    "...BB..BBB..", "...BB...BB..", "..WWW..WWW..", "..WW...WW..."], PAL)

PIGEON = [
    sprite(["...GGG....", "..GGEGO...", "..GGGG....", ".GGGGGGG..",
            "GGGGgGGGG.", ".GGWgGGG..", "..GGGGG...", "...O..O..."], PAL),
    sprite(["...GGG....", "..GGEGO...", "..GGGG....", ".GGGGGGG..",
            "GGGGgGGGG.", ".GGWgGGG..", "..GGGGG...", "..O..O...."], PAL),
]
PIGEON_FLY = [
    sprite(["g.......g.", "gg.GGG.gg.", ".ggGEGOg..", "..gGGGg...",
            "..GGGGG...", "...GGG...."], PAL),
    sprite(["...GGG....", "..GGEGO...", "gggGGGggg.", ".ggGGGgg..",
            "..GGGGG...", "...GGG...."], PAL),
]
CART = sprite([
    "R...........",
    "RR..........",
    ".LLLLLLLLLLL",
    ".LDLDLDLDLDL",
    ".LLLLLLLLLLL",
    "..LDLDLDLDL.",
    "..LLLLLLLLL.",
    "...LDLDLDL..",
    "...LLLLLLL..",
    "...L.....L..",
    "..KK....KK..",
    "..KK....KK.."], PAL)
HYDRANT = sprite([
    "..RRRR..", ".RRRRRR.", "..rrrr..", ".RRRRRR.", "RRRRRRRR",
    "RRrRRrRR", ".RRRRRR.", ".RRRRRR.", ".RRrRRR.", ".RRRRRR.",
    "rrrrrrrr", "rrrrrrrr"], PAL)
COIN_FRAMES = [
    sprite(["..YY..", ".YOOY.", "YOYYOY", "YOYYOY", "YOYYOY", "YOYYOY", ".YOOY.", "..YY.."],
           {"Y": (255, 214, 60, 255), "O": (210, 140, 20, 255)}),
    sprite([".YY.", "YOOY", "YYOY", "YYOY", "YYOY", "YYOY", "YOOY", ".YY."],
           {"Y": (255, 214, 60, 255), "O": (210, 140, 20, 255)}),
    sprite(["YY", "OY", "OY", "OY", "OY", "OY", "OY", "YY"],
           {"Y": (255, 214, 60, 255), "O": (210, 140, 20, 255)}),
    sprite([".YY.", "YOOY", "YOYY", "YOYY", "YOYY", "YOYY", "YOOY", ".YY."],
           {"Y": (255, 214, 60, 255), "O": (210, 140, 20, 255)}),
]


def block_img(used):
    im = Image.new("RGBA", (12, 12), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    if used:
        d.rectangle([1, 1, 10, 10], fill=(150, 90, 50))
        d.rectangle([2, 2, 9, 9], fill=(170, 105, 60))
    else:
        d.rectangle([1, 1, 10, 10], fill=(250, 170, 40))
        d.rectangle([1, 1, 10, 1], fill=(255, 230, 140))
        d.rectangle([1, 1, 1, 10], fill=(255, 230, 140))
        d.ellipse([3, 3, 8, 8], fill=(255, 240, 160))
        d.rectangle([5, 4, 6, 7], fill=(200, 110, 20))
    for px, py in [(2, 2), (9, 2), (2, 9), (9, 9)]:
        im.putpixel((px, py), (0, 0, 0, 255))
    return im


BLOCK = block_img(False)
BLOCK_USED = block_img(True)

# ---------------------------------------------------------------- vehicles
def make_bus():
    im = Image.new("RGBA", (64, 26), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 2, 63, 21], 3, fill=(245, 245, 240))
    d.rectangle([0, 14, 63, 16], fill=(30, 150, 200))
    d.rectangle([2, 0, 61, 3], fill=(220, 220, 215))
    for i in range(6):
        d.rectangle([8 + i * 9, 5, 14 + i * 9, 11], fill=(60, 90, 120))
        d.rectangle([9 + i * 9, 6, 10 + i * 9, 8], fill=(150, 200, 230))
    d.rectangle([1, 5, 5, 13], fill=(60, 90, 120))      # windshield (facing left)
    d.rectangle([0, 17, 2, 19], fill=(255, 230, 120))   # headlight
    draw_text(im, 14, 17, "BERGENLINE", (255, 255, 255))
    for wx in (10, 48):
        d.ellipse([wx, 18, wx + 7, 25], fill=(25, 25, 30))
        d.ellipse([wx + 2, 20, wx + 5, 23], fill=(170, 170, 180))
    return im


def make_car(col):
    im = Image.new("RGBA", (36, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 6, 35, 12], 2, fill=col)
    d.polygon([(8, 6), (12, 0), (26, 0), (30, 6)], fill=col)
    d.polygon([(10, 6), (13, 2), (18, 2), (18, 6)], fill=(150, 200, 230))
    d.polygon([(20, 6), (20, 2), (25, 2), (28, 6)], fill=(150, 200, 230))
    d.rectangle([33, 7, 35, 8], fill=(255, 230, 120))
    for wx in (5, 25):
        d.ellipse([wx, 10, wx + 6, 15], fill=(25, 25, 30))
        d.ellipse([wx + 2, 12, wx + 4, 14], fill=(170, 170, 180))
    return im


def make_logo(size):
    """North Bergen logo, cropped to its circle, scaled down with a round alpha mask."""
    src = Image.open(OUT_DIR / "nb_logo.png").convert("RGB").crop((115, 115, 385, 385))
    im = src.resize((size, size), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (size * 8, size * 8), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * 8 - 1, size * 8 - 1], fill=255)
    im.putalpha(m.resize((size, size), Image.LANCZOS).point(lambda v: 255 if v > 110 else 0))
    return im


LOGO_FLAG = make_logo(20)
LOGO_BANNER = make_logo(12)
LOGO_CARD = make_logo(44)

BUS = make_bus()
CAR = make_car((240, 200, 40))

# ---------------------------------------------------------------- timeline
# Everything is timed to the soundtrack of the reference video (reference_audio).
# Score/coin events below were read frame by frame off that video's HUD, so each
# action here lands on the same sound effect.
DURATION = 91.4
BEAT0, BEAT = 0.07, 60 / 133.5            # measured tempo of the song
REF_SCORE = [  # (time, points)
    (3.1, 200), (4.3, 100), (6.7, 200), (7.9, 1000), (9.7, 100), (11.37, 300), (11.5, 100),
    (11.7, 200), (11.87, 200), (12.03, 200), (12.23, 300), (13.8, 500), (14.1, 500),
    (20.3, 200), (21.1, 200), (21.7, 200), (22.3, 200), (24.1, 200), (24.4, 200), (24.7, 200),
    (25.0, 200), (25.3, 200), (25.6, 200), (27.7, 100), (28.3, 100), (31.53, 200), (31.67, 200),
    (31.77, 300), (31.87, 100), (32.97, 1200), (33.1, 200), (33.2, 200), (34.3, 200), (34.6, 200),
    (36.4, 200), (37.9, 200), (38.63, 200), (38.9, 300), (39.3, 100), (41.0, 600), (41.33, 300),
    (42.1, 300), (42.2, 200), (42.3, 200), (42.57, 200), (45.1, 200), (45.7, 50), (46.3, 50),
    (46.9, 50), (47.5, 50), (47.67, 200), (48.1, 50), (48.63, 200), (48.83, 300), (48.97, 100),
    (51.7, 100), (52.9, 100), (55.9, 200), (57.7, 100), (60.1, 1000), (60.9, 200), (61.3, 300),
    (61.7, 100), (62.5, 200), (65.3, 200), (67.3, 2000), (69.3, 1800), (69.7, 200), (79.3, 5000),
]
T_RUN = 0.3
V_BASE, V_BUS, V_HYPER = 34.0, 80.0, 58.0
TB0, TB1 = 15.4, 19.2                     # bus ride
TH0, TH1 = 60.1, 70.0                     # cafecito speed mode
T_FINAL = 78.3                            # leap from the crates to the flagpole
T_GRAB = 79.3                             # flagpole (5000) in the reference


def speed_t(t):
    if TB0 <= t < TB1:
        return V_BUS
    if TH0 <= t < TH1:
        return V_HYPER
    return V_BASE


_ts = np.arange(0, DURATION + 0.01, 1 / 600)
_xs = np.empty_like(_ts)
_x = X0
for _i, _t in enumerate(_ts):
    _xs[_i] = _x
    if T_RUN <= _t < T_FINAL:
        _x += speed_t(_t) / 600
TS, XS = _ts, _xs
X_FINAL = float(np.interp(T_FINAL, TS, XS))


def x_of_t(t):
    return float(np.interp(t, TS, XS))


def t_of_x(x):
    i = np.searchsorted(XS, x)
    return float(TS[min(i, len(TS) - 1)])


POLE_X = int(X_FINAL + 112)
LEVEL_W = POLE_X + 120


# ---------------------------------------------------------------- level art
# Cross streets from 72nd St (start) to 84th St (finish)
CROSS = [(int(x_of_t(16.2)), "74 ST"), (int(x_of_t(26.6)), "77 ST"), (int(x_of_t(43.5)), "79 ST"),
         (int(x_of_t(55.0)), "81 ST"), (int(x_of_t(71.5)), "83 ST"), (int(X_FINAL + 40), "84 ST")]
CROSS_W = 36

# Generic placeholder storefronts (blocks with no verified listings)
GENERIC = [
    ("PANADERIA", (250, 230, 200), (180, 40, 40), (220, 60, 60), (255, 255, 255), (232, 200, 150)),
    ("FARMACIA", (255, 255, 255), (20, 140, 70), (20, 140, 70), (255, 255, 255), (170, 190, 210)),
    ("99 CENT", (255, 220, 0), (200, 20, 20), (230, 40, 40), (255, 220, 0), (180, 80, 60)),
    ("ENVIOS", (20, 90, 170), (255, 220, 0), (20, 90, 170), (255, 220, 0), (225, 215, 190)),
    ("CELL FIX", (20, 20, 40), (80, 220, 255), (60, 60, 80), (80, 220, 255), (210, 200, 230)),
    ("BARBER", (255, 255, 255), (30, 60, 160), (220, 40, 40), (255, 255, 255), (190, 70, 60)),
    ("PUPUSAS", (40, 80, 180), (255, 255, 255), (40, 80, 180), (255, 255, 255), (230, 230, 220)),
    ("JOYERIA", (40, 30, 60), (255, 210, 80), (100, 60, 140), (255, 210, 80), (200, 120, 90)),
    ("OPTICA", (255, 255, 255), (40, 40, 160), (40, 40, 160), (200, 220, 255), (180, 80, 70)),
    ("ZAPATOS", (230, 60, 120), (255, 255, 255), (230, 60, 120), (255, 255, 255), (230, 230, 220)),
    ("DELI", (180, 30, 30), (255, 255, 255), (180, 30, 30), (255, 255, 255), (230, 220, 200)),
    ("LAVANDERIA", (60, 170, 230), (255, 255, 255), (60, 170, 230), (255, 255, 255), (220, 200, 170)),
    ("PERFUMES", (120, 40, 140), (255, 200, 240), (200, 90, 200), (255, 255, 255), (235, 230, 240)),
    ("TACOS", (255, 120, 20), (255, 255, 255), (255, 120, 20), (255, 230, 60), (250, 200, 210)),
    ("BODEGA", (240, 240, 40), (20, 20, 20), (30, 140, 60), (240, 240, 40), (215, 190, 160)),
]

# Real listings, in address order.  "/" splits a sign onto two lines.
BLOCK_77_79 = [
    ("CORTADITOS", (250, 240, 220), (120, 60, 30), (120, 60, 30), (250, 240, 220), (200, 110, 80)),      # 7700
    ("ADRY'S/BEAUTY SPA", (250, 200, 225), (170, 40, 110), (230, 120, 170), (255, 255, 255), (235, 230, 240)),  # 7710
    ("TOWN/BEVERAGE", (30, 50, 110), (255, 255, 255), (30, 50, 110), (200, 30, 40), (215, 190, 160)),     # 7804
    ("LA KAUSA", (200, 40, 30), (255, 220, 60), (200, 40, 30), (255, 220, 60), (230, 220, 200)),        # 7815
    ("FLOWERS OF/THE FIELD", (255, 255, 255), (40, 140, 60), (240, 130, 170), (255, 255, 255), (180, 80, 60)),  # 7821
    ("VICO/GELATO", (255, 240, 245), (60, 130, 90), (120, 200, 170), (255, 255, 255), (232, 200, 150)),  # 7827
    ("LA SORRENTINA", (20, 110, 60), (255, 255, 255), (20, 140, 70), (220, 40, 40), (240, 225, 190)),   # 7831
]
BLOCK_81_83 = [
    ("HARRY'S", (20, 20, 30), (255, 200, 60), (40, 40, 50), (255, 200, 60), (190, 70, 60)),           # 8101
    ("BERGENLINE/SUPERMARKET", (220, 30, 40), (255, 255, 255), (220, 30, 40), (255, 255, 255), (230, 230, 220)),  # 8107
    ("JIMMY'S/BAKERY", (255, 225, 180), (150, 60, 30), (210, 120, 60), (255, 240, 220), (200, 120, 90)),  # 8125
    ("ASIAN FUSION/SUSHI", (20, 20, 20), (240, 60, 60), (200, 30, 30), (20, 20, 20), (225, 215, 190)),  # 8201
    ("WADI/SCOOPS", (120, 210, 230), (255, 255, 255), (250, 150, 190), (255, 255, 255), (210, 200, 230)),  # 8205
]

LIB_X, LIB_W = POLE_X + 16, 86          # Sai Rao Public Library, 8411 Bergenline


def store_min_w(store):
    return max(44, max(text_w(l) for l in store[0].split("/")) + 8)


def draw_building(d, x, w, store, rng):
    name, sign_bg, sign_fg, aw1, aw2, facade = store
    nl = len(name.split("/"))
    sf_h = 30 + 6 * (nl - 1)              # storefront height
    stories = rng.choice([2, 2, 3])
    top = GROUND - sf_h - stories * 20 - 4
    d.rectangle([x, top, x + w - 1, GROUND - 1], fill=facade)
    shade = tuple(max(0, c - 40) for c in facade)
    d.rectangle([x, top, x + w - 1, top + 3], fill=shade)
    d.rectangle([x, top + 4, x + w - 1, top + 4], fill=tuple(min(255, c + 25) for c in facade))
    d.line([x, top, x, GROUND - 1], fill=shade)
    if facade[0] > facade[2] + 40 and facade[0] < 210:
        for by in range(top + 6, GROUND - sf_h, 4):
            for bx in range(x + ((by // 4) % 2) * 3, x + w - 1, 6):
                d.point((bx, by), fill=shade)
    nwin = max(2, (w - 8) // 14)
    gap = (w - nwin * 8) / (nwin + 1)
    for s in range(stories):
        wy = top + 8 + s * 20
        for i in range(nwin):
            wx = int(x + gap + i * (8 + gap))
            d.rectangle([wx - 1, wy - 1, wx + 8, wy + 11], fill=(245, 240, 230))
            d.rectangle([wx, wy, wx + 7, wy + 10], fill=(70, 110, 160))
            d.rectangle([wx, wy, wx + 7, wy + 4], fill=(110, 160, 210))
            d.line([wx + 4, wy, wx + 4, wy + 10], fill=(245, 240, 230))
            d.rectangle([wx - 2, wy + 11, wx + 9, wy + 12], fill=shade)
            r = rng.random()
            if r < 0.2:
                d.rectangle([wx + 1, wy + 6, wx + 7, wy + 10], fill=(200, 200, 205))
                d.line([wx + 2, wy + 8, wx + 6, wy + 8], fill=(120, 120, 130))
            elif r < 0.35:
                d.rectangle([wx, wy + 9, wx + 7, wy + 10], fill=(150, 80, 40))
                d.rectangle([wx + 1, wy + 7, wx + 6, wy + 8], fill=(60, 160, 70))
    sy = GROUND - sf_h
    d.rectangle([x, sy, x + w - 1, GROUND - 1], fill=(60, 60, 70))
    bh = 2 + 6 * nl
    d.rectangle([x + 1, sy, x + w - 2, sy + bh], fill=sign_bg)
    d.rectangle([x + 1, sy, x + w - 2, sy], fill=(0, 0, 0))
    ay = sy + bh + 1
    for i in range(x + 1, x + w - 1):
        c = aw1 if ((i - x) // 4) % 2 == 0 else aw2
        d.line([i, ay, i, ay + 4], fill=c)
        if (i - x) % 4 in (1, 2):
            d.point((i, ay + 5), fill=c)
    gy = ay + 7
    door_x = x + w - 12
    d.rectangle([x + 3, gy, door_x - 3, GROUND - 3], fill=(150, 210, 240))
    d.line([x + 5, gy + 9, x + 11, gy + 2], fill=(220, 245, 255))
    d.line([x + 6, gy + 10, x + 12, gy + 3], fill=(220, 245, 255))
    d.rectangle([x + 3, GROUND - 6, door_x - 3, GROUND - 3], fill=(90, 90, 100))
    for gx in range(x + 16, door_x - 5, 6):
        d.rectangle([gx, GROUND - 9, gx + 3, GROUND - 6], fill=rng.choice(
            [aw1, aw2, sign_fg, (255, 200, 120)]))
    d.rectangle([door_x, gy, door_x + 8, GROUND - 1], fill=(40, 40, 45))
    d.rectangle([door_x + 1, gy + 1, door_x + 7, GROUND - 2], fill=(110, 150, 180))
    d.point((door_x + 6, gy + 8), fill=(250, 210, 60))
    return (name, x, w, sy, sign_fg)


def draw_library(im, d):
    x, w = LIB_X, LIB_W
    stone, dark, trim = (226, 212, 180), (180, 165, 135), (245, 238, 220)
    top = GROUND - 86
    d.rectangle([x, top + 10, x + w - 1, GROUND - 1], fill=stone)
    d.polygon([(x - 2, top + 12), (x + w // 2, top - 6), (x + w + 1, top + 12)], fill=trim)   # pediment
    d.polygon([(x + 8, top + 10), (x + w // 2, top - 1), (x + w - 9, top + 10)], fill=stone)
    d.rectangle([x - 2, top + 10, x + w + 1, top + 13], fill=trim)
    # name plate
    d.rectangle([x + 4, top + 16, x + w - 5, top + 30], fill=(30, 60, 110))
    d.rectangle([x + 5, top + 17, x + w - 6, top + 29], outline=(240, 210, 120))
    draw_text(im, x + (w - text_w("SAI RAO")) // 2, top + 19, "SAI RAO", (255, 230, 150))
    draw_text(im, x + (w - text_w("PUBLIC LIBRARY")) // 2, top + 24, "PUBLIC LIBRARY", (255, 255, 255))
    # columns
    for cx in range(x + 4, x + w - 4, 13):
        d.rectangle([cx, top + 34, cx + 5, GROUND - 8], fill=trim)
        d.line([cx + 2, top + 36, cx + 2, GROUND - 10], fill=dark)
        d.rectangle([cx - 1, top + 33, cx + 6, top + 34], fill=dark)
    # tall windows between columns
    for i, wx in enumerate(range(x + 11, x + w - 10, 13)):
        if abs(wx + 3 - (x + w // 2)) < 8:
            continue
        d.rectangle([wx, top + 40, wx + 5, GROUND - 16], fill=(70, 110, 160))
        d.rectangle([wx, top + 40, wx + 5, top + 46], fill=(120, 170, 220))
    # door (player walks in here)
    dx = x + w // 2 - 6
    d.rectangle([dx, GROUND - 30, dx + 12, GROUND - 8], fill=(90, 50, 30))
    d.rectangle([dx + 1, GROUND - 29, dx + 5, GROUND - 9], fill=(120, 70, 40))
    d.rectangle([dx + 7, GROUND - 29, dx + 11, GROUND - 9], fill=(120, 70, 40))
    # steps
    for k in range(3):
        d.rectangle([x - 2 + k * 3, GROUND - 8 + k * 3 - 1, x + w + 1 - k * 3, GROUND - 6 + k * 3 - 1],
                    fill=trim if k % 2 == 0 else dark)
    # book cart / plants
    d.rectangle([x - 8, GROUND - 6, x - 2, GROUND - 1], fill=(150, 80, 40))
    d.ellipse([x - 9, GROUND - 13, x - 1, GROUND - 5], fill=(50, 150, 70))


def build_level():
    im = Image.new("RGBA", (LEVEL_W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rng = random.Random(7)
    signs = []
    gi = 0
    seg_starts = [-10] + [cx + CROSS_W for cx, _ in CROSS[:-1]]
    seg_ends = [cx for cx, _ in CROSS]
    real = {2: BLOCK_77_79, 4: BLOCK_81_83}
    for si, (a, b) in enumerate(zip(seg_starts, seg_ends)):
        L = b - a
        if si in real:
            # real listings in address order; unverified storefronts fill the gaps
            stores = list(real[si])
            k = 1
            while sum(store_min_w(s) for s in stores) + 50 <= L:
                stores.insert(min(k, len(stores)), GENERIC[gi % len(GENERIC)])
                gi += 1
                k += 2
                if k > len(stores):
                    k = 1
        else:
            n = max(1, L // 50)
            stores = [GENERIC[(gi + k) % len(GENERIC)] for k in range(n)]
            gi += n
        widths = [store_min_w(st) for st in stores]
        extra = L - sum(widths)
        assert extra >= 0, f"segment {si} too short by {-extra}px"
        for k in range(extra):
            widths[k % len(widths)] += 1
        x = a
        for st, w in zip(stores, widths):
            signs.append(draw_building(d, x, w, st, rng))
            x += w
    for name, bx, bw, sy, fg in signs:
        for li, line in enumerate(name.split("/")):
            draw_text(im, bx + (bw - text_w(line)) // 2, sy + 2 + li * 6, line, fg)

    # ground
    d.rectangle([0, GROUND, LEVEL_W, GROUND + 9], fill=(200, 200, 205))
    for sx in range(0, LEVEL_W, 12):
        d.line([sx, GROUND, sx, GROUND + 9], fill=(170, 170, 178))
    d.line([0, GROUND, LEVEL_W, GROUND], fill=(225, 225, 230))
    d.rectangle([0, GROUND + 10, LEVEL_W, GROUND + 12], fill=(140, 140, 150))
    d.rectangle([0, GROUND + 13, LEVEL_W, H], fill=(60, 62, 70))
    for sx in range(0, LEVEL_W, 20):
        d.rectangle([sx, 236, sx + 10, 237], fill=(250, 210, 40))
    rng2 = random.Random(3)
    for _ in range(300):
        px, py = rng2.randrange(LEVEL_W), rng2.randrange(GROUND + 14, H)
        d.point((px, py), fill=(75, 77, 86))

    for cx, label in CROSS:
        d.rectangle([cx, GROUND, cx + CROSS_W - 1, GROUND + 12], fill=(60, 62, 70))
        for i in range(cx + 2, cx + CROSS_W - 2, 6):
            d.rectangle([i, GROUND + 1, i + 3, GROUND + 11], fill=(240, 240, 240))
        px = cx + 3
        d.rectangle([px, GROUND - 60, px + 1, GROUND], fill=(50, 90, 60))
        d.rectangle([px - 2, GROUND - 60, px + 24, GROUND - 59], fill=(50, 90, 60))
        d.rectangle([px + 18, GROUND - 59, px + 24, GROUND - 44], fill=(40, 40, 40))
        for j, c in enumerate([(230, 40, 40), (240, 190, 30), (50, 200, 80)]):
            d.rectangle([px + 20, GROUND - 57 + j * 5, px + 22, GROUND - 55 + j * 5],
                        fill=c if j == 2 else tuple(v // 3 for v in c))
        d.rectangle([px - 1, GROUND - 52, px + 43, GROUND - 38], fill=(20, 120, 60))
        d.rectangle([px, GROUND - 51, px + 42, GROUND - 39], outline=(255, 255, 255))
        draw_text(im, px + 3, GROUND - 49, "BERGENLINE", (255, 255, 255))
        draw_text(im, px + 2 + (40 - text_w(label)) // 2, GROUND - 43, label, (255, 255, 255))

        # North Bergen banner on the light pole
        bx, by = px + 2, GROUND - 34
        d.rectangle([bx, by, bx + 15, by + 9], fill=(170, 30, 35))
        d.rectangle([bx, by + 10, bx + 15, by + 19], fill=(250, 200, 40))
        d.polygon([(bx, by + 20), (bx + 15, by + 20), (bx + 7, by + 23)], fill=(250, 200, 40))
        im.alpha_composite(LOGO_BANNER, (bx + 2, by + 4))

    draw_library(im, d)
    return im


def build_skyline():
    sw = LEVEL_W // 2 + W
    im = Image.new("RGBA", (sw, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rng = random.Random(11)
    x = 0
    while x < sw:
        w = rng.randint(10, 22)
        h = rng.randint(30, 80)
        if rng.random() < 0.08:
            h = rng.randint(95, 115)
        top = GROUND - h
        col = (150, 165, 205)
        d.rectangle([x, top, x + w - 1, GROUND], fill=col)
        if h > 95:   # spire tower
            d.polygon([(x + 2, top), (x + w // 2, top - 14), (x + w - 3, top)], fill=col)
            d.line([x + w // 2, top - 26, x + w // 2, top - 14], fill=col)
        for wy in range(top + 4, GROUND, 6):
            for wx in range(x + 2, x + w - 2, 4):
                if rng.random() < 0.5:
                    d.point((wx, wy), fill=(185, 200, 235))
        x += w + rng.randint(0, 4)
    return im


def build_clouds():
    cw = 600
    im = Image.new("RGBA", (cw, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rng = random.Random(5)
    for i in range(7):
        cx, cy = i * 86 + rng.randint(0, 30), rng.randint(36, 90)
        w = rng.randint(26, 44)
        d.rounded_rectangle([cx, cy + 6, cx + w, cy + 14], 4, fill=(255, 255, 255))
        d.ellipse([cx + 4, cy, cx + w // 2 + 4, cy + 12], fill=(255, 255, 255))
        d.ellipse([cx + w // 2 - 4, cy + 2, cx + w - 2, cy + 12], fill=(255, 255, 255))
        d.rectangle([cx + 2, cy + 13, cx + w - 2, cy + 14], fill=(170, 210, 255))
    return im


LEVEL = build_level()
SKYLINE = build_skyline()
CLOUDS = build_clouds()

# ---------------------------------------------------------------- extra sprites
PAL2 = dict(PAL)
PAL2.update({"N": (125, 105, 95, 255), "n": (90, 75, 70, 255), "p": (240, 150, 170, 255),
             "y": (255, 214, 120, 255), "o": (220, 150, 60, 255), "m": (230, 80, 110, 255),
             "c": (90, 50, 30, 255), "w": (245, 245, 245, 255), "s": (190, 190, 200, 255)})
RAT = [
    sprite(["..NN........", ".NNNNNNNN...", "NENNNNNNNN..", "pNNNNNNNNNpp",
            ".nNNNNNNNn..", "..K.K..K.K.."], PAL2),
    sprite(["..NN........", ".NNNNNNNN...", "NENNNNNNNN..", "pNNNNNNNNNp.",
            ".nNNNNNNNn.p", ".K..K.K..K.."], PAL2),
]
PASTELITO = sprite(["..yyyyyy..", ".yoooooooy", "yoommmmooy", "yommmmmmoy",
                    "yoommmmooy", ".yoooooooy", "..yyyyyy.."], PAL2)
CAFECITO = sprite([".w..w...", "..w..w..", "wwwwww..", "wccccwww", "wwwwww.w",
                   "wwwwwwww", ".wwww...", "ssssssss"], PAL2)


def make_brick():
    im = Image.new("RGBA", (12, 12), (40, 20, 10, 255))
    d = ImageDraw.Draw(im)
    for row in range(3):
        y = row * 4
        off = 0 if row % 2 == 0 else 3
        for bx in range(-off, 12, 6):
            d.rectangle([bx + 1, y + 1, bx + 5, y + 3], fill=(200, 90, 50))
            d.point((bx + 1, y + 1), fill=(240, 150, 100))
    return im


BRICK = make_brick()


def make_crate(col):
    im = Image.new("RGBA", (18, 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 17, 9], fill=col)
    dk = tuple(max(0, c - 60) for c in col)
    d.rectangle([0, 0, 17, 9], outline=dk)
    for hx in range(3, 15, 4):
        d.rectangle([hx, 3, hx + 1, 6], fill=dk)
    return im


CRATES = [make_crate((40, 90, 200)), make_crate((210, 40, 40)), make_crate((40, 160, 80))]


def make_pinata():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = []
    for k in range(10):
        r = 7.5 if k % 2 == 0 else 3.5
        a = -math.pi / 2 + k * math.pi / 5
        pts.append((7.5 + r * math.cos(a), 8 + r * math.sin(a)))
    d.polygon(pts, fill=(250, 90, 170))
    d.ellipse([4, 5, 11, 12], fill=(255, 210, 60))
    d.ellipse([6, 7, 9, 10], fill=(60, 190, 230))
    return im


PINATA = make_pinata()


def big(img):
    return img.resize((img.width * 3 // 2, img.height * 3 // 2), Image.NEAREST)


def recolor(img, src, dst):
    a = np.array(img)
    m = (a[:, :, 0] == src[0]) & (a[:, :, 1] == src[1]) & (a[:, :, 2] == src[2]) & (a[:, :, 3] > 0)
    a[m, :3] = dst
    return Image.fromarray(a)


HYPER_COLS = [(255, 80, 80), (255, 220, 60), (80, 230, 255), (200, 120, 255)]


def pose_set(scale_big):
    f = big if scale_big else (lambda i: i)
    base = {"run": [f(i) for i in P_RUN], "jump": f(P_JUMP), "pole": f(P_POLE)}
    return base


SMALL = pose_set(False)
BIG = pose_set(True)
HYPER = []
for hc in HYPER_COLS:
    HYPER.append({"run": [recolor(i, PAL["T"][:3], hc) for i in BIG["run"]],
                  "jump": recolor(BIG["jump"], PAL["T"][:3], hc)})

# ---------------------------------------------------------------- choreography
T_BIG = 7.9                       # pastelito collected (1000 in the reference)
T_POWER_HIT = 6.7
T_PINATA, T_CAFE = 57.7, TH0
X_BIG = x_of_t(T_BIG)
XB0, XB1 = x_of_t(TB0), x_of_t(TB1)
XH0, XH1 = x_of_t(TH0), x_of_t(TH1)
ROOF = -8                          # bus roof height (bus drawn at y=204)


def kid_big_t(t):
    return t >= T_BIG


def KW_t(t):
    return 18 if kid_big_t(t) else 12


def KH_t(t):
    return 24 if kid_big_t(t) else 16


moves = []        # x-domain jumps
coins = []        # dict(x, hb, t)
blocks = []       # dict(x, y, kind, t)
enemies = []      # dict(kind, x, mode, t)
hydrants, carts, cellars, ledges, sheds = [], [], [], [], []
brick_rows = []
steps = []


def mv_t(t0, t1, h0, h1, apex):
    x0, x1 = x_of_t(t0), x_of_t(t1)
    lo, hi = 0.0, 400.0
    ps = np.linspace(0, 1, 201)
    for _ in range(50):
        b = (lo + hi) / 2
        if (h0 + (h1 - h0) * ps + 4 * b * ps * (1 - ps)).max() < apex:
            lo = b
        else:
            hi = b
    m = dict(x0=x0, x1=x1, h0=h0, h1=h1, apex=apex, b=b, t0=t0, t1=t1)
    moves.append(m)
    return m


def move_h(m, x):
    p = (x - m["x0"]) / (m["x1"] - m["x0"])
    return m["h0"] + (m["h1"] - m["h0"]) * p + 4 * m["b"] * p * (1 - p)


def peak(tp, kind=None, h=0, apex=None, dur=0.56):
    """jump whose top is at time tp; optional block hit there"""
    apex = apex if apex is not None else h + 38
    m = mv_t(tp - dur / 2, tp + dur / 2, h, h, apex)
    if kind:
        xp = x_of_t(tp)
        blocks.append(dict(x=xp + KW_t(tp) / 2 - 6, y=int(GROUND - (apex + KH_t(tp)) - 12),
                           kind=kind, t=tp))
    return m


def land_on(tl, kind, h=0, dur=0.55, apex=None):
    """jump that lands on an enemy at time tl"""
    mv_t(tl - dur, tl, h, h, apex if apex is not None else h + 28)
    xl = x_of_t(tl)
    ew = 10 if kind == "pigeon" else 12
    enemies.append(dict(kind=kind, x=xl + KW_t(tl) / 2 - ew / 2, mode="stomp", t=tl))


def knock(t, kind):
    enemies.append(dict(kind=kind, x=x_of_t(t) + KW_t(t) - 4, mode="knock", t=t))


def coin_t(*ts):
    for t in ts:
        coins.append(dict(t=t))      # placed after all moves exist


def over(tp, what, apex=36, dur=0.6):
    """filler jump over a street obstacle, top on a beat"""
    tp = BEAT0 + round((tp - BEAT0) / BEAT) * BEAT
    mv_t(tp - dur / 2, tp + dur / 2, 0, 0, apex)
    xc = x_of_t(tp) + KW_t(tp) / 2
    if what == "hydrant":
        hydrants.append(xc - 4)
    elif what == "cart":
        carts.append((tp, xc))
    elif what == "cellar":
        cellars.append((xc - 12, xc + 12))


# ---- 72nd -> 74th
over(1.6, "hydrant")
peak(3.1, "coin")                                   # 200 + coin
land_on(4.3, "pigeon")                              # 100
over(5.3, "cart", 34, 0.56)
peak(T_POWER_HIT, "pastelito")                      # block -> pastelito, grab at 7.9
land_on(9.7, "rat")
mv_t(10.55, 11.05, 0, 30, 44)                       # up onto the brick ledge
coin_t(11.37, 11.5, 11.7, 11.87, 12.03, 12.23)
mv_t(12.45, 12.95, 30, 0, 40)
ledges.append((x_of_t(10.95) - 4, x_of_t(12.5) + 18, 30))
land_on(13.8, "pigeon")                             # 500
land_on(14.1, "pigeon", dur=0.3, apex=14)           # 500 bounce
# ---- bus ride
mv_t(14.9, TB0, 0, ROOF, 10)
mv_t(16.95, 17.45, ROOF, ROOF, ROOF + 20)
mv_t(TB1, 19.65, ROOF, 0, 6)
land_on(20.3, "rat")
peak(21.1, "coin", dur=0.52); peak(21.7, "coin", dur=0.52); peak(22.3, "coin", dur=0.52)
# ---- sidewalk shed run
mv_t(23.3, 23.8, 0, 34, 48)
coin_t(24.1, 24.4, 24.7, 25.0, 25.3, 25.6)
mv_t(25.85, 26.35, 34, 0, 42)
sheds.append((x_of_t(23.6), x_of_t(26.05) + 10, 34))
land_on(27.7, "rat")
land_on(28.3, "pigeon", dur=0.5, apex=22)
peak(30.03, "coin")
mv_t(31.25, 32.15, 0, 0, 46)
coin_t(31.53, 31.67, 31.77, 31.87, 32.07)
land_on(32.97, "pigeon")
coin_t(33.07, 33.2, 34.3, 34.43, 34.6)
peak(35.13, "coin")
land_on(36.4, "rat")
peak(37.9, "coin")
mv_t(38.35, 39.3, 0, 0, 44)
coin_t(38.63, 38.87, 39.23)
enemies.append(dict(kind="pigeon", x=x_of_t(39.3) + KW_t(39.3) / 2 - 5, mode="stomp", t=39.3))
coin_t(39.53)
mv_t(40.45, 41.45, 0, 0, 40)
coin_t(40.67, 40.77, 41.0, 41.1, 41.33)
coin_t(42.1, 42.2, 42.3, 42.53)
land_on(45.1, "rat")
# ---- brick breaking run
BRICK_TS = [45.7, 46.3, 46.9, 47.5, 48.1]
for tb in BRICK_TS:
    peak(tb, "brick", dur=0.56, apex=40)
coin_t(46.7, 47.17, 47.67)
brick_rows.append((blocks[-5]["x"] - 12, blocks[-1]["x"] + 24, blocks[-1]["y"]))
mv_t(48.45, 48.97, 0, 0, 30)
coin_t(48.63, 48.8)
enemies.append(dict(kind="rat", x=x_of_t(48.97) + 3, mode="stomp", t=48.97))
peak(49.9, "coin")
land_on(51.7, "pigeon")
land_on(52.9, "rat")
over(54.2, "cellar", 32, 0.7)
peak(55.9, "coin")
PIN_M = peak(T_PINATA, None, apex=40)                # pinata (100), cafecito caught at 60.1
PINATA_POS = (x_of_t(T_PINATA) + KW_t(T_PINATA) / 2 - 8, GROUND - (40 + 24) - 16)
over(59.0, "hydrant")
# ---- cafecito speed mode
knock(60.9, "rat"); knock(61.3, "pigeon"); knock(61.7, "cart"); knock(62.5, "rat")
over(63.9, "cart", 38, 0.5)
knock(65.3, "pigeon")
over(66.3, "hydrant", 38, 0.5)
for dt_, k_ in ((-0.15, "rat"), (-0.05, "pigeon"), (0.05, "rat")):
    knock(67.3 + dt_, k_)
coin_t(67.3)
for dt_, k_ in ((-0.15, "pigeon"), (-0.05, "rat"), (0.05, "pigeon")):
    knock(69.3 + dt_, k_)
coin_t(69.3)
knock(69.7, "rat")
# ---- 83rd -> 84th: obstacles on the beat, crate stairs, flagpole
over(71.2, "cart", 34)
over(72.6, "hydrant")
over(74.0, "cellar", 32, 0.7)
st = [75.6, 76.13, 76.66, 77.19, 77.72]
for i in range(4):
    mv_t(st[i], st[i + 1], i * 10, (i + 1) * 10, (i + 1) * 10 + 8)
for i in range(4):
    x_a = x_of_t(st[i + 1]) - 2
    x_b = x_of_t(st[i + 2]) - 2 if i < 3 else X_FINAL + 22
    steps.append((x_a, x_b, (i + 1) * 10))

moves.sort(key=lambda m: m["x0"])
for a_, b_ in zip(moves, moves[1:]):
    assert a_["x1"] <= b_["x0"] + 0.01, (a_["t0"], b_["t0"])


def run_height(x):
    h = 0
    for m in moves:
        if m["x0"] <= x < m["x1"]:
            return move_h(m, x), True
        if m["x1"] <= x:
            h = m["h1"]
    return h, False


for c in coins:
    x = x_of_t(c["t"])
    h, _ = run_height(x)
    c["x"] = x + KW_t(c["t"]) / 2 - 3
    c["hb"] = h + KH_t(c["t"]) / 2 - 4

FJ_DUR = T_GRAB - T_FINAL
GRAB_X = POLE_X - 16
GRAB_H = 72
SLIDE = 1.1
T_LAND = T_GRAB + SLIDE
DOOR_X = LIB_X + LIB_W // 2 - 9
T_CLEAR = 82.07                   # tally runs 82.37 -> 85.77 like the reference
T_END = 85.9


def player_state(t):
    if t < T_RUN:
        return X0, 0, "stand"
    if t < T_FINAL:
        x = x_of_t(t)
        h, air = run_height(x)
        if not air and TB0 <= t < TB1:
            return x, h, "stand"
        return x, h, "jump" if air else "run"
    if t < T_GRAB:
        p = (t - T_FINAL) / FJ_DUR
        x = X_FINAL + (GRAB_X - X_FINAL) * p
        h = 40 + (GRAB_H - 40) * p + 30 * 4 * p * (1 - p) * (1 - p)
        return x, h, "jump"
    if t < T_LAND:
        p = (t - T_GRAB) / SLIDE
        return GRAB_X, GRAB_H * (1 - p), "pole"
    if t < T_CLEAR + 1.5:
        if t - T_LAND < 0.25:
            return POLE_X + 2, 0, "stand"
        x = POLE_X + 2 + (t - T_LAND - 0.25) * 34
        return (x, 0, "run") if x < DOOR_X else (DOOR_X, 0, "gone")
    return DOOR_X, 0, "gone"


def camera(px):
    return int(max(0, min(LEVEL_W - W, px - 50)))


def bus_x(t):
    if t < TB0:
        return XB0 - 23 - V_BUS * (TB0 - t)
    if t < TB1:
        return x_of_t(t) - 23
    return XB1 - 23 + V_BUS * (t - TB1)


def score_at(t):
    return sum(d for tt, d in REF_SCORE if tt <= t)


def time_at(t):
    return max(0, 400 - int(t * 2.45))


# ---------------------------------------------------------------- render
def paste(frame, im, x, y, alpha=1.0):
    if alpha < 1.0:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    _paste_clip(frame, im, int(round(x)), int(round(y)))


def _paste_clip(frame, im, x, y):
    if x >= W or y >= H or x + im.width <= 0 or y + im.height <= 0:
        return
    l, t = max(0, -x), max(0, -y)
    r, b = min(im.width, W - x), min(im.height, H - y)
    frame.alpha_composite(im.crop((l, t, r, b)), (x + l, y + t))


def item_path(t, t0, p0, t1, p1, bump):
    k = min(1.0, max(0.0, (t - t0) / (t1 - t0)))
    return p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k - bump * math.sin(math.pi * k)


def popup_pos(t):
    x = x_of_t(min(t, T_FINAL))
    h, _ = run_height(x)
    return x, GROUND - h - KH_t(t) - 10


def render():
    import os
    prev = os.environ.get("PREVIEW")
    prev_set = {int(float(s) * FPS) for s in prev.split(",")} if prev else None
    ff = None if prev else subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W * SCALE}x{H * SCALE}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
         str(OUT_DIR / "_video.mp4")], stdin=subprocess.PIPE)
    n = int(DURATION * FPS)
    trail = []
    rng = random.Random(9)
    pops = []
    for (tt, d) in REF_SCORE:
        if tt == T_GRAB:
            pops.append((tt, POLE_X + 4, GROUND - GRAB_H - 20, str(d), (255, 255, 255)))
        else:
            px_, py_ = popup_pos(tt)
            txt = "CAFECITO!" if tt == T_CAFE else str(d)
            col = (255, 220, 60) if tt == T_CAFE else (255, 255, 255)
            pops.append((tt, px_, py_, txt, col))
    pb = [b for b in blocks if b["kind"] == "pastelito"][0]
    for fi in range(n):
        t = fi / FPS
        px, ph, pose = player_state(t)
        cam = camera(px)
        feet = GROUND - ph
        hyper = TH0 <= t < TH1
        score = score_at(t)
        ncoins = sum(1 for c in coins if c["t"] <= t) + sum(1 for b in blocks if b["kind"] == "coin" and b["t"] <= t)
        time_left = time_at(min(t, T_GRAB))
        if t >= T_CLEAR + 0.3:
            k = min(1.0, (t - T_CLEAR - 0.3) / (85.77 - T_CLEAR - 0.3))
            done = int(time_left * k)
            score += done * 50
            time_left -= done

        # ---------------- background
        frame = Image.new("RGBA", (W, H), (106, 168, 255, 255))
        dr = ImageDraw.Draw(frame)
        for yy in range(110, GROUND):
            k = (yy - 110) / (GROUND - 110)
            dr.line([0, yy, W, yy], fill=(int(106 + 60 * k), int(168 + 40 * k), 255))
        co = int(cam * 0.25 + t * 3) % CLOUDS.width
        _paste_clip(frame, CLOUDS, -co, 0)
        _paste_clip(frame, CLOUDS, -co + CLOUDS.width, 0)
        _paste_clip(frame, SKYLINE, -int(cam * 0.5), 0)
        _paste_clip(frame, LEVEL, -cam, 0)

        # ---------------- street props
        for (a_, b_) in cellars:
            cx0, cx1 = a_ - cam, b_ - cam
            if cx1 < -10 or cx0 > W + 10:
                continue
            dr.rectangle([cx0, GROUND, cx1, GROUND + 9], fill=(20, 18, 22))
            dr.polygon([(cx0 - 6, GROUND - 12), (cx0, GROUND), (cx0 + 2, GROUND), (cx0 - 4, GROUND - 12)], fill=(130, 130, 140))
            dr.polygon([(cx1 + 6, GROUND - 12), (cx1, GROUND), (cx1 - 2, GROUND), (cx1 + 4, GROUND - 12)], fill=(130, 130, 140))
        for (a_, b_, hh) in ledges:
            for bx in np.arange(a_, b_, 12):
                _paste_clip(frame, BRICK, int(bx - cam), GROUND - hh)
        for (a_, b_, hh) in sheds:
            sx0, sx1 = int(a_ - cam), int(b_ - cam)
            for postx in range(sx0 + 2, sx1, 22):
                dr.rectangle([postx, GROUND - hh + 8, postx + 1, GROUND - 1], fill=(110, 110, 120))
            dr.rectangle([sx0, GROUND - hh, sx1, GROUND - hh + 8], fill=(40, 110, 60))
            dr.line([sx0, GROUND - hh, sx1, GROUND - hh], fill=(90, 170, 100))
            for k in range(sx0 + 4, sx1 - 50, 64):
                draw_text(frame, k, GROUND - hh + 2, "POST NO BILLS", (230, 240, 230))
        for hx in hydrants:
            if -20 < hx - cam < W + 20:
                _paste_clip(frame, HYDRANT, int(hx - cam), GROUND - 12)
                for k in range(10):
                    ph_ = (t * 1.6 + k / 10) % 1
                    for side in (-1, 1):
                        wx = hx + 4 + side * ph_ * 16 - cam
                        wy = GROUND - 9 - 18 * 4 * ph_ * (1 - ph_) * 0.6
                        dr.rectangle([wx, wy, wx + 1, wy + 1], fill=(150, 210, 255))
        for i, (a_, b_, hh) in enumerate(steps):
            for lvl in range(hh // 10):
                for cx_ in np.arange(a_, b_ - 1, 18):
                    cw = int(min(18, b_ - cx_))
                    _paste_clip(frame, CRATES[(i + lvl) % 3].crop((0, 0, cw, 10)), int(cx_ - cam), GROUND - 10 - lvl * 10)
        # pinata
        pnx, pny = PINATA_POS
        if t < T_PINATA:
            sway = math.sin(t * 3) * 2
            dr.line([pnx + 8 - cam, 60, pnx + 8 + sway - cam, pny], fill=(240, 240, 240))
            _paste_clip(frame, PINATA, int(pnx + sway - cam), int(pny))
        else:
            dt = t - T_PINATA
            dr.line([pnx + 8 - cam, 60, pnx + 8 - cam, pny - 10], fill=(240, 240, 240))
            if dt < 1.0:
                r2 = random.Random(4)
                for k in range(26):
                    ang = r2.uniform(0, 2 * math.pi); sp = r2.uniform(20, 60)
                    cxp = pnx + 8 + math.cos(ang) * sp * dt - cam
                    cyp = pny + 8 + math.sin(ang) * sp * dt + 60 * dt * dt
                    col = [(255, 90, 170), (255, 220, 60), (80, 220, 255), (120, 255, 120)][k % 4]
                    dr.rectangle([cxp, cyp, cxp + 1, cyp + 1], fill=col)

        # ---------------- blocks
        for (a_, b_, by) in brick_rows:
            for bx in np.arange(a_, b_, 12):
                if any(b["kind"] == "brick" and abs(b["x"] - bx) < 6 for b in blocks):
                    continue
                _paste_clip(frame, BRICK, int(bx - cam), by)
        for b in blocks:
            hit = t >= b["t"]
            if b["kind"] == "brick" and hit:
                dt = t - b["t"]
                if dt < 1.0:
                    for (vx, vy) in [(-30, -60), (30, -60), (-20, -30), (20, -30)]:
                        fx = b["x"] + 3 + vx * dt - cam
                        fy = b["y"] + 3 + vy * dt + 180 * dt * dt
                        dr.rectangle([fx, fy, fx + 3, fy + 3], fill=(200, 90, 50))
                continue
            bump = -int(4 * math.sin((t - b["t"]) / 0.16 * math.pi)) if 0 <= t - b["t"] < 0.16 else 0
            img = BRICK if b["kind"] == "brick" else (BLOCK_USED if hit else BLOCK)
            _paste_clip(frame, img, int(b["x"] - cam), b["y"] + bump)
            if b["kind"] == "coin" and hit and t - b["t"] < 0.45:
                k = (t - b["t"]) / 0.45
                cy = b["y"] - 10 - 28 * math.sin(k * math.pi * 0.9)
                _paste_clip(frame, COIN_FRAMES[int(t * 20) % 4], int(b["x"] + 3 - cam), int(cy))

        # ---------------- power-up items
        if T_POWER_HIT <= t < T_BIG:
            if t - T_POWER_HIT < 0.3:
                ix, iy = pb["x"] + 1, pb["y"] - 7 * (t - T_POWER_HIT) / 0.3
            else:
                ix, iy = item_path(t, T_POWER_HIT + 0.3, (pb["x"] + 1, pb["y"] - 7),
                                   T_BIG, (X_BIG + 8, GROUND - 14), 6)
            _paste_clip(frame, PASTELITO, int(ix - cam), int(iy))
        if T_PINATA <= t < T_CAFE:
            ix, iy = item_path(t, T_PINATA, (PINATA_POS[0] + 4, PINATA_POS[1] + 4),
                               T_CAFE, (XH0 + 6, GROUND - 16), 22)
            _paste_clip(frame, CAFECITO, int(ix - cam), int(iy))

        # ---------------- coins
        for c in coins:
            cy = GROUND - c["hb"] - 8
            if t < c["t"]:
                if -10 < c["x"] - cam < W + 10:
                    f = COIN_FRAMES[int(t * 8 + c["x"] * 0.1) % 4]
                    _paste_clip(frame, f, int(c["x"] + (6 - f.width) // 2 - cam), int(cy))
            elif t - c["t"] < 0.25:
                k = (t - c["t"]) / 0.25
                for a in range(4):
                    ang = a * math.pi / 2 + 0.7
                    sx = c["x"] + 3 + math.cos(ang) * 8 * k - cam
                    sy = cy + 4 + math.sin(ang) * 8 * k
                    dr.rectangle([sx, sy, sx + 1, sy + 1], fill=(255, 240, 150))

        # ---------------- enemies
        for e in enemies:
            kind = e["kind"]
            if e["x"] - cam > W + 40 or e["x"] - cam < -80:
                continue
            if t < e["t"]:
                if kind == "pigeon":
                    img = PIGEON[int(t * 5 + e["x"]) % 2].transpose(Image.FLIP_LEFT_RIGHT)
                    _paste_clip(frame, img, int(e["x"] - cam), GROUND - 8)
                elif kind == "rat":
                    _paste_clip(frame, RAT[int(t * 8) % 2], int(e["x"] + (e["t"] - t) * 12 - cam), GROUND - 6)
                elif kind == "cart":
                    _paste_clip(frame, CART, int(e["x"] + (e["t"] - t) * 18 - cam), GROUND - 12)
                continue
            dt = t - e["t"]
            if e["mode"] == "stomp":
                if kind == "pigeon" and dt < 2.0:
                    _paste_clip(frame, PIGEON_FLY[int(t * 12) % 2],
                                int(e["x"] + dt * 50 - cam), int(GROUND - 10 - dt * 70))
                elif kind == "rat" and dt < 0.4:
                    _paste_clip(frame, RAT[0].resize((12, 3), Image.NEAREST), int(e["x"] - cam), GROUND - 3)
            elif dt < 1.5:
                img = {"pigeon": PIGEON[0], "rat": RAT[0], "cart": CART}[kind].transpose(Image.FLIP_TOP_BOTTOM)
                ex = e["x"] + 50 * dt - cam
                ey = GROUND - img.height - (60 * dt - 200 * dt * dt)
                _paste_clip(frame, img, int(ex), int(ey))
                if dt < 0.12:
                    for a in range(6):
                        ang = a * math.pi / 3
                        dr.point((e["x"] + 6 + math.cos(ang) * 8 - cam, GROUND - 6 + math.sin(ang) * 8), fill=(255, 255, 200))
        for (ta, xc) in carts:
            _paste_clip(frame, CART, int(xc - 6 + (ta - t) * 18 - cam), GROUND - 12)

        # ---------------- vehicles
        bxp = bus_x(t)
        if -70 < bxp - cam < W + 10:
            _paste_clip(frame, BUS, int(bxp - cam), GROUND - ROOF)
        car_x = -60 + (t - 6) * 75
        for off in (0, 1300, 2600):
            cxs = car_x + off - cam
            if -50 < cxs < W + 10:
                _paste_clip(frame, CAR, int(cxs), 238)

        # ---------------- flag pole
        pxs = POLE_X - cam
        dr.rectangle([pxs - 4, GROUND - 8, pxs + 5, GROUND - 1], fill=(170, 160, 140))
        dr.rectangle([pxs, GROUND - 108, pxs + 1, GROUND - 9], fill=(220, 220, 225))
        dr.ellipse([pxs - 2, GROUND - 113, pxs + 3, GROUND - 108], fill=(250, 200, 40))
        if t < T_GRAB:
            fy = GROUND - 34
        elif t < T_LAND:
            fy = GROUND - 34 - (t - T_GRAB) / SLIDE * 72
        else:
            fy = GROUND - 106
        fy = int(fy)
        dr.rectangle([pxs + 2, fy, pxs + 33, fy + 11], fill=(170, 30, 35))
        dr.rectangle([pxs + 2, fy + 12, pxs + 33, fy + 23], fill=(250, 200, 40))
        _paste_clip(frame, LOGO_FLAG, pxs + 8, fy + 2)

        # ---------------- player
        if pose != "gone":
            is_big = kid_big_t(t) and not (t - T_BIG < 0.6 and int((t - T_BIG) / 0.08) % 2 == 0)
            S = BIG if is_big else SMALL
            if hyper:
                S = HYPER[int(t * 10) % 4]
            if pose in ("stand", "run"):
                img = S["run"][1] if pose == "stand" else S["run"][int(t * (18 if hyper else 12)) % 3]
            elif pose == "jump":
                img = S["jump"]
            else:
                img = BIG["pole"]
            if hyper:
                for k, a in ((2, 0.25), (1, 0.45)):
                    if len(trail) > k * 2:
                        tx, ty, timg = trail[-k * 2]
                        paste(frame, timg, tx - cam, ty, a)
            paste(frame, img, px - cam, feet - img.height)
            trail.append((px, feet - img.height, img))
            trail[:] = trail[-8:]
            if hyper:
                for _ in range(3):
                    sx = px + rng.uniform(-4, img.width + 4) - cam
                    sy = feet - rng.uniform(0, img.height + 6)
                    dr.point((sx, sy), fill=rng.choice([(255, 255, 255), (255, 240, 120), (150, 230, 255)]))

        # ---------------- score pops
        for (st_, sx, sy, txt, col) in pops:
            if 0 <= t - st_ < 0.8:
                draw_text(frame, int(sx - cam), int(sy - (t - st_) * 25), txt, col, shadow=(0, 0, 0))

        # ---------------- HUD
        white, sh = (255, 255, 255), (30, 30, 60)
        draw_text(frame, 6, 10, "SCORE", white, shadow=sh)
        draw_text(frame, 6, 17, f"{min(score, 999999):06d}", white, shadow=sh)
        _paste_clip(frame, COIN_FRAMES[int(t * 6) % 4], 34, 16)
        draw_text(frame, 42, 17, f"x{ncoins:02d}", white, shadow=sh)
        draw_text(frame, 66, 10, "N.BERGEN", white, shadow=sh)
        draw_text(frame, 76, 17, "1-1", white, shadow=sh)
        draw_text(frame, 116, 10, "TIME", white, shadow=sh)
        draw_text(frame, 118, 17, f"{max(0, time_left):03d}", white, shadow=sh)

        # ---------------- title overlay
        if t < 2.4:
            a = 1.0 if t < 1.6 else max(0.0, 1 - (t - 1.6) / 0.8)
            ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            od = ImageDraw.Draw(ov)
            od.rectangle([8, 44, W - 9, 92], fill=(20, 20, 50, int(200 * a)))
            od.rectangle([8, 44, W - 9, 92], outline=(255, 210, 60, int(255 * a)))
            frame.alpha_composite(ov)
            if a > 0.5:
                draw_text(frame, (W - text_w("BERGENLINE", 2)) // 2, 52, "BERGENLINE", (255, 210, 60), 2, (120, 40, 20))
                draw_text(frame, (W - text_w("AVENUE", 2)) // 2, 66, "AVENUE", (255, 210, 60), 2, (120, 40, 20))
                draw_text(frame, (W - text_w("NORTH BERGEN, NJ")) // 2, 82, "NORTH BERGEN, NJ", white)

        # ---------------- clear + fireworks
        if t >= T_CLEAR:
            draw_text(frame, (W - text_w("COURSE CLEAR!")) // 2, 70, "COURSE CLEAR!", white, 1, sh)
            if t >= T_CLEAR + 0.3:
                draw_text(frame, (W - text_w("TIME BONUS")) // 2, 80, "TIME BONUS", (255, 210, 60), 1, sh)
            for k, (fx, fy2, ft) in enumerate([(30, 60, 0.3), (110, 50, 0.8), (70, 40, 1.4), (40, 100, 2.0), (100, 95, 2.6)]):
                dt = t - T_CLEAR - ft
                if 0 <= dt < 0.7:
                    rad = 4 + dt * 22
                    colr = [(255, 90, 90), (255, 230, 90), (120, 220, 255), (150, 255, 150), (255, 150, 230)][k]
                    for a in range(12):
                        ang = a * math.pi / 6
                        dr.rectangle([fx + math.cos(ang) * rad, fy2 + math.sin(ang) * rad,
                                      fx + math.cos(ang) * rad + 1, fy2 + math.sin(ang) * rad + 1], fill=colr)

        # ---------------- end card
        if t >= T_END:
            a = min(1.0, (t - T_END) / 0.6)
            frame.alpha_composite(Image.new("RGBA", (W, H), (15, 15, 35, int(235 * a))))
            if a >= 1.0:
                _paste_clip(frame, LOGO_CARD, (W - 44) // 2, 46)
                draw_text(frame, (W - text_w("BERGENLINE", 2)) // 2, 96, "BERGENLINE", (255, 210, 60), 2, (120, 40, 20))
                draw_text(frame, (W - text_w("AVENUE", 2)) // 2, 110, "AVENUE", (255, 210, 60), 2, (120, 40, 20))
                draw_text(frame, (W - text_w("NORTH BERGEN, NJ")) // 2, 128, "NORTH BERGEN, NJ", white)
                draw_text(frame, (W - text_w(f"SCORE {score:06d}")) // 2, 146, f"SCORE {score:06d}", white)
                draw_text(frame, (W - text_w(f"COINS x{ncoins:02d}")) // 2, 154, f"COINS x{ncoins:02d}", (255, 210, 60))

        if prev_set is not None:
            if fi in prev_set:
                frame.convert("RGB").resize((W * 2, H * 2), Image.NEAREST).save(OUT_DIR / f"_prev_{fi:04d}.png")
            continue
        ff.stdin.write(frame.convert("RGB").resize((W * SCALE, H * SCALE), Image.NEAREST).tobytes())
        if fi % 300 == 0:
            print(f"frame {fi}/{n}", file=sys.stderr)
    if ff:
        ff.stdin.close()
        ff.wait()
    print(f"coins {len(coins)}  duration {DURATION:.1f}s  level {LEVEL_W}px", file=sys.stderr)


# ---------------------------------------------------------------- audio
SR = 44100


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def square(f, dur, duty=0.25, vol=0.2):
    tt = np.arange(int(dur * SR)) / SR
    w = np.where((f * tt) % 1 < duty, 1.0, -1.0)
    return w * vol


def env(n, a=0.005, d=0.08, s=0.6, r=0.04):
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n); e[:na] = np.linspace(0, 1, na)
    nd2 = min(nd, n - na)
    e[na:na + nd2] = np.linspace(1, s, nd2)
    if nr < n:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def note_name(n):
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    base = names[n[0]]
    i = 1
    if n[i] == "#":
        base += 1; i += 1
    return 12 * (int(n[i:]) + 1) + base


MELODY = [
    "E5 G5 C6 G5 E5 G5 A5 G5", "E5 - C5 E5 A5 - G5 E5",
    "F5 A5 C6 A5 F5 - E5 F5", "G5 - D5 G5 B5 - A5 G5",
    "C6 - G5 E5 G5 - C6 D6", "E6 - D6 C6 A5 - C6 A5",
    "F5 - A5 C6 D6 C6 A5 F5", "G5 - B5 D6 G5 - - -",
]
BASS_ROOTS = ["C3", "A2", "F2", "G2", "C3", "A2", "F2", "G2"]


def music(length):
    beat8 = 60 / 150 / 2
    out = np.zeros(int(length * SR) + SR)
    t = 0.0
    rng = np.random.default_rng(1)
    while t < length:
        for bar in range(8):
            toks = MELODY[bar].split()
            i = 0
            while i < 8:
                tok = toks[i]
                j = i + 1
                while j < 8 and toks[j] == "-":
                    j += 1
                st = t + (bar * 8 + i) * beat8
                if tok != "-" and st < length:
                    dur = (j - i) * beat8 * 0.92
                    w = square(midi_hz(note_name(tok)), dur, 0.25, 0.12)
                    w *= env(len(w), d=0.1, s=0.55)
                    k = int(st * SR); out[k:k + len(w)] += w
                i = j
            root = note_name(BASS_ROOTS[bar])
            for e in range(8):
                st = t + (bar * 8 + e) * beat8
                if st >= length:
                    continue
                m = root + (12 if e % 2 else 0) + (7 if e in (5,) else 0)
                tt = np.arange(int(beat8 * 0.85 * SR)) / SR
                f = midi_hz(m)
                w = (2 * np.abs(2 * ((f * tt) % 1) - 1) - 1) * 0.16
                w *= env(len(w), d=0.05, s=0.7)
                k = int(st * SR); out[k:k + len(w)] += w
                # drums
                nl = int(0.05 * SR) if e % 4 != 2 else int(0.12 * SR)
                nz = rng.uniform(-1, 1, nl) * (0.05 if e % 4 != 2 else 0.12)
                nz *= np.exp(-np.linspace(0, 6, nl))
                out[k:k + nl] += nz
                if e % 4 == 0:
                    kl = int(0.1 * SR)
                    kt = np.arange(kl) / SR
                    kick = np.sin(2 * np.pi * (120 - 600 * kt) * kt) * np.exp(-kt * 30) * 0.25
                    out[k:k + kl] += kick
        t += 64 * beat8
    return out[:int(length * SR)]


def sfx_wave(kind):
    if kind == "jump":
        n = int(0.14 * SR); tt = np.arange(n) / SR
        f = 260 + 3200 * tt
        return np.where((np.cumsum(f) / SR) % 1 < 0.5, 1, -1) * 0.12 * np.linspace(1, 0.3, n)
    if kind == "coin":
        a = square(988, 0.06, 0.5, 0.13)
        b = square(1319, 0.3, 0.5, 0.13) * np.exp(-np.linspace(0, 5, int(0.3 * SR)))
        return np.concatenate([a, b])
    if kind == "stomp":
        n = int(0.12 * SR); tt = np.arange(n) / SR
        f = 400 - 2200 * tt
        return np.where((np.cumsum(f) / SR) % 1 < 0.5, 1, -1) * 0.15 * np.linspace(1, 0, n)
    if kind == "bump":
        return square(140, 0.09, 0.5, 0.18) * np.linspace(1, 0, int(0.09 * SR))
    if kind == "pole":
        n = int(SLIDE * SR); tt = np.arange(n) / SR
        f = 1400 - 900 * tt / SLIDE
        return np.where((np.cumsum(f) / SR) % 1 < 0.25, 1, -1) * 0.09 * np.linspace(1, 0.4, n)
    if kind == "tick":
        return square(1760, 0.03, 0.5, 0.06)
    if kind == "boom":
        n = int(0.4 * SR)
        return np.random.default_rng(len(sfx)).uniform(-1, 1, n) * 0.12 * np.exp(-np.linspace(0, 7, n))
    if kind == "fanfare":
        seq = ["C5", "E5", "G5", "C6", "E6", "G6", "E6", "-",
               "G#4", "C5", "D#5", "G#5", "C6", "D#6", "G#6", "D#6",
               "A#4", "D5", "F5", "A#5", "D6", "F6", "A#6", "A#6"]
        step = 0.075
        out = np.zeros(int((len(seq) * step + 0.8) * SR))
        for i, nm in enumerate(seq):
            if nm == "-":
                continue
            dur = step * (4 if i == len(seq) - 1 else 1.1)
            w = square(midi_hz(note_name(nm)), dur, 0.5, 0.1)
            w *= env(len(w), d=0.03, s=0.7)
            k = int(i * step * SR); out[k:k + len(w)] += w
        c = square(midi_hz(note_name("C6")), 0.7, 0.25, 0.1) * env(int(0.7 * SR), s=0.8, r=0.3)
        k = int(len(seq) * step * SR); out[k:k + len(c)] += c[:len(out) - k]
        return out
    if kind == "break":
        n = int(0.25 * SR)
        return np.random.default_rng(3).uniform(-1, 1, n) * 0.16 * np.exp(-np.linspace(0, 9, n))
    if kind == "kick":
        n = int(0.1 * SR); tt = np.arange(n) / SR
        f = 900 - 5000 * tt
        return np.where((np.cumsum(f) / SR) % 1 < 0.5, 1, -1) * 0.12 * np.linspace(1, 0, n)
    if kind in ("powerup", "sprout"):
        notes = ["C5", "G5", "C6", "E5", "B5", "E6", "G5", "D6", "G6"] if kind == "powerup" else ["C5", "E5", "G5", "C6"]
        return np.concatenate([square(midi_hz(note_name(nm)), 0.045, 0.5, 0.1) for nm in notes])
    if kind == "oneup":
        notes = ["E6", "G6", "E7", "C7", "D7", "G7"]
        return np.concatenate([square(midi_hz(note_name(nm)), 0.08, 0.5, 0.1) for nm in notes])
    if kind == "pinata":
        n = int(0.3 * SR)
        nz = np.random.default_rng(5).uniform(-1, 1, n) * 0.14 * np.exp(-np.linspace(0, 6, n))
        return nz + np.concatenate([square(1568, 0.08, 0.5, 0.08), square(2093, 0.22, 0.5, 0.08)])[:n]
    if kind == "honk":
        a = square(330, 0.18, 0.5, 0.07) + square(415, 0.18, 0.5, 0.07)
        return np.concatenate([a, np.zeros(int(0.06 * SR)), a])
    if kind == "sparkle":
        return square(2637, 0.025, 0.5, 0.03)
    return np.zeros(1)


def hyper_layer(length):
    """fast arpeggio that plays during cafecito mode"""
    step = 60 / 150 / 4
    seq = ["C6", "E6", "G6", "C7", "G6", "E6", "D6", "F6", "A6", "D7", "A6", "F6"]
    out = np.zeros(int(length * SR) + SR)
    i = 0
    while i * step < length:
        w = square(midi_hz(note_name(seq[i % len(seq)])), step * 0.8, 0.5, 0.05)
        w *= env(len(w), d=0.02, s=0.6)
        k = int(i * step * SR); out[k:k + len(w)] += w
        i += 1
    return out[:int(length * SR)]


def make_audio():
    total = np.zeros(int((DURATION + 1) * SR))
    m = music(T_GRAB - T_RUN + 0.05)
    k = int(T_RUN * SR)
    fade = np.ones(len(m)); fade[-int(0.05 * SR):] = np.linspace(1, 0, int(0.05 * SR))
    total[k:k + len(m)] += m * fade
    th0, th1 = t_of_x(XH0), t_of_x(XH1)
    hl = hyper_layer(th1 - th0)
    k = int(th0 * SR)
    total[k:k + len(hl)] += hl
    for t, kind in sfx:
        w = sfx_wave(kind)
        k = int(t * SR)
        total[k:k + len(w)] += w[:len(total) - k]
    total = total[:int(DURATION * SR)]
    total /= max(1.0, np.abs(total).max() / 0.9)
    pcm = (total * 32767).astype(np.int16)
    with wave.open(str(OUT_DIR / "_audio.wav"), "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


if __name__ == "__main__":
    import os
    render()
    if os.environ.get("PREVIEW"):
        sys.exit()
    # soundtrack: the reference video's song (with its sound effects)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(OUT_DIR / "_video.mp4"),
                    "-i", str(OUT_DIR / "reference_audio.m4a"), "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest",
                    str(OUT_DIR / "bergenline_run.mp4")], check=True)
    (OUT_DIR / "_video.mp4").unlink()
    print("done:", OUT_DIR / "bergenline_run.mp4", f"{DURATION:.1f}s")
