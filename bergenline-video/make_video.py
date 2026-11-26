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
LEVEL_W = 1800
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

# ---------------------------------------------------------------- level art
# Cross streets from 72nd St (start) to 84th St (finish)
CROSS = [(250, "74 ST"), (480, "77 ST"), (860, "79 ST"), (1060, "81 ST"),
         (1360, "83 ST"), (1640, "84 ST")]
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

LIB_X, LIB_W = 1712, 86          # Sai Rao Public Library, 8411 Bergenline


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
            stores = real[si]
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

# ---------------------------------------------------------------- choreography
JW = SPEED * 0.7     # jump width in px
JH = 30

jumps = []           # (x_start, width, height)
coins = []           # dict(x, y, got)
blocks = []          # dict(x, y, hit_x, hit_t, used)
pigeons = []         # dict(land_x, flown_t)
carts = []           # dict(apex_x)
hydrants = []        # x
score_pops = []      # (t, x, y, text)


def jump_apex(apex_x):
    jumps.append((apex_x - JW / 2, JW, JH))


def add_block(cx):
    jump_apex(cx - 6 + 6)
    blocks.append(dict(x=cx, y=GROUND - 16 - JH - 12 + 2, hit_x=cx, hit_t=None))


def add_hydrant(cx):
    jump_apex(cx - 4 + 0)
    hydrants.append(cx)


def add_pigeon(land_x):
    jumps.append((land_x - JW - 4, JW, JH))
    pigeons.append(dict(land_x=land_x, t_land=None))


def add_cart(apex_x):
    jump_apex(apex_x)
    carts.append(dict(apex_x=apex_x))


def coin_row(x1, x2, y):
    for cx in range(int(x1), int(x2), 10):
        coins.append(dict(x=cx, y=y, got=None))


def coin_arc(apex_x):
    jump_apex(apex_x)
    x0 = apex_x - JW / 2
    for k in range(5):
        p = (k + 0.5) / 5
        coins.append(dict(x=x0 + p * JW + 3, y=GROUND - 16 - JH * 4 * p * (1 - p) + 2, got=None))


coin_row(80, 130, GROUND - 12)
add_block(176)
add_hydrant(225)
add_pigeon(330)
coin_arc(400)
add_cart(470)
add_block(600)
add_block(650)
add_pigeon(720)
add_hydrant(790)
coin_row(825, 880, GROUND - 12)
add_cart(920)
add_pigeon(985)
add_block(1110)
coin_row(1135, 1195, GROUND - 12)
add_pigeon(1245)
add_hydrant(1310)
add_cart(1385)
add_block(1505)
coin_arc(1560)
add_pigeon(1625)

for b in blocks:   # block sits so player head bumps it at apex
    b["y"] = int(GROUND - 16 - JH - 12)

X_FINAL = 1648
T_FINAL = T_RUN + (X_FINAL - X0) / SPEED
FJ_DUR = 0.8
POLE_X = 1700
T_GRAB = T_FINAL + FJ_DUR
GRAB_H = 64
SLIDE = 1.1
T_LAND = T_GRAB + SLIDE
WALK = 2.0
T_CLEAR = T_LAND + WALK
TALLY = 2.4
T_END = T_CLEAR + TALLY
DURATION = T_END + 3.5
PREVIEW = None
GATE_X = LIB_X + LIB_W // 2 - 22   # player stops (and enters) at the door

sfx = []   # (t, kind)


def player_state(t):
    """returns x, feet_y_offset (height above ground), pose"""
    if t < T_RUN:
        return X0, 0, "stand"
    if t < T_FINAL:
        x = X0 + (t - T_RUN) * SPEED
        for jx, jw, jh in jumps:
            if jx <= x < jx + jw:
                p = (x - jx) / jw
                return x, jh * 4 * p * (1 - p), "jump"
        return x, 0, "run"
    if t < T_GRAB:
        p = (t - T_FINAL) / FJ_DUR
        x = X_FINAL + (POLE_X - 11 - X_FINAL) * p
        return x, GRAB_H * math.sin(p * math.pi / 2) * 1.0, "jump"
    if t < T_LAND:
        p = (t - T_GRAB) / SLIDE
        return POLE_X - 11, GRAB_H * (1 - p), "pole"
    if t < T_CLEAR:
        x = POLE_X - 11 + 6 + (t - T_LAND) * 34
        if t - T_LAND < 0.25:
            return POLE_X + 2, 0, "stand"
        return min(x, GATE_X + 16), 0, "run" if x < GATE_X + 16 else "gone"
    return GATE_X + 16, 0, "gone"


def camera(px):
    return int(max(0, min(LEVEL_W - W, px - 50)))


# ---------------------------------------------------------------- render
def paste(frame, im, x, y):
    frame.alpha_composite(im, (int(round(x)), int(round(y)))) if 0 <= x and 0 <= y and \
        x + im.width <= W and y + im.height <= H else _paste_clip(frame, im, int(round(x)), int(round(y)))


def _paste_clip(frame, im, x, y):
    if x >= W or y >= H or x + im.width <= 0 or y + im.height <= 0:
        return
    l, t = max(0, -x), max(0, -y)
    r, b = min(im.width, W - x), min(im.height, H - y)
    frame.alpha_composite(im.crop((l, t, r, b)), (x + l, y + t))


def render():
    n = int(DURATION * FPS)
    import os
    prev = os.environ.get("PREVIEW")
    prev_set = {int(float(s) * FPS) for s in prev.split(",")} if prev else None
    ff = None if prev else subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W * SCALE}x{H * SCALE}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
         str(OUT_DIR / "_video.mp4")], stdin=subprocess.PIPE)
    score, ncoins = 0, 0
    time_left = 300
    prev_time_tick = 0
    tally_done = False
    triggered = set()
    for fi in range(n):
        t = fi / FPS
        px, ph, pose = player_state(t)
        cam = camera(px)
        feet = GROUND - ph
        prect = (px + 1, feet - 16, px + 11, feet)

        # -------- events
        if pose == "jump" and t < T_FINAL:
            for i, (jx, jw, jh) in enumerate(jumps):
                if jx <= px < jx + jw and ("j", i) not in triggered:
                    triggered.add(("j", i)); sfx.append((t, "jump"))
        if T_FINAL <= t and ("fj",) not in triggered:
            triggered.add(("fj",)); sfx.append((t, "jump"))
        for b in blocks:
            if b["hit_t"] is None and t < T_FINAL and px + 6 >= b["x"] + 6 - 0.5 and ph > JH - 2:
                b["hit_t"] = t; score += 200; ncoins += 1
                sfx.append((t, "bump")); sfx.append((t + 0.02, "coin"))
                score_pops.append((t, b["x"], b["y"] - 10, "200"))
        for c in coins:
            if c["got"] is None and prect[0] < c["x"] + 6 and prect[2] > c["x"] and \
                    prect[1] < c["y"] + 8 and prect[3] > c["y"]:
                c["got"] = t; score += 100; ncoins += 1; sfx.append((t, "coin"))
        for pg in pigeons:
            if pg["t_land"] is None and px >= pg["land_x"] - 5 and t < T_FINAL:
                pg["t_land"] = t; score += 100; sfx.append((t, "stomp"))
                score_pops.append((t, pg["land_x"], GROUND - 26, "100"))
        if t >= T_GRAB and ("grab",) not in triggered:
            triggered.add(("grab",)); score += 5000; sfx.append((t, "pole"))
            score_pops.append((t, POLE_X + 4, GROUND - GRAB_H - 20, "5000"))
        if t >= T_LAND and ("fan",) not in triggered:
            triggered.add(("fan",)); sfx.append((t, "fanfare"))
        if T_RUN <= t < T_GRAB:
            ticks = int((t - T_RUN) / 0.4)
            time_left = 300 - ticks
        if T_CLEAR + 0.3 <= t and time_left > 0:
            per = max(1, int(time_left / max(1, (T_END - 0.4 - t) * FPS)))
            per = min(per, time_left)
            time_left -= per; score += per * 50
            if fi % 2 == 0:
                sfx.append((t, "tick"))

        # -------- draw
        frame = Image.new("RGBA", (W, H), (106, 168, 255, 255))
        dr = ImageDraw.Draw(frame)
        # sky gradient band near horizon
        for yy in range(110, GROUND):
            k = (yy - 110) / (GROUND - 110)
            dr.line([0, yy, W, yy], fill=(int(106 + 60 * k), int(168 + 40 * k), 255))
        co = int(cam * 0.25 + t * 3) % CLOUDS.width
        paste(frame, CLOUDS, -co, 0)
        paste(frame, CLOUDS, -co + CLOUDS.width, 0)
        _paste_clip(frame, SKYLINE, -int(cam * 0.5), 0)
        _paste_clip(frame, LEVEL, -cam, 0)

        # flag pole
        pxs = POLE_X - cam
        dr.rectangle([pxs - 4, GROUND - 8, pxs + 5, GROUND - 1], fill=(170, 160, 140))
        dr.rectangle([pxs - 4, GROUND - 8, pxs + 5, GROUND - 8], fill=(210, 200, 180))
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


        # hydrants
        for hx in hydrants:
            paste(frame, HYDRANT, hx - cam, GROUND - 12)
        # blocks
        for b in blocks:
            bump = 0
            if b["hit_t"] is not None and t - b["hit_t"] < 0.16:
                bump = -int(4 * math.sin((t - b["hit_t"]) / 0.16 * math.pi))
            paste(frame, BLOCK_USED if b["hit_t"] is not None else BLOCK, b["x"] - cam, b["y"] + bump)
            if b["hit_t"] is not None and t - b["hit_t"] < 0.45:
                k = (t - b["hit_t"]) / 0.45
                cy = b["y"] - 10 - 28 * math.sin(k * math.pi * 0.9)
                paste(frame, COIN_FRAMES[int(t * 20) % 4], b["x"] + 3 - cam, cy)
        # coins
        for c in coins:
            if c["got"] is None:
                f = COIN_FRAMES[int(t * 8 + c["x"] * 0.1) % 4]
                paste(frame, f, c["x"] + (6 - f.width) // 2 - cam, c["y"])
            elif t - c["got"] < 0.25:
                k = (t - c["got"]) / 0.25
                for a in range(4):
                    ang = a * math.pi / 2 + 0.7
                    sx = c["x"] + 3 + math.cos(ang) * 8 * k - cam
                    sy = c["y"] + 4 + math.sin(ang) * 8 * k
                    dr.rectangle([sx, sy, sx + 1, sy + 1], fill=(255, 240, 150))
        # pigeons
        for pg in pigeons:
            if pg["t_land"] is None:
                t_land_est = T_RUN + (pg["land_x"] - 5 - X0) / SPEED
                gx_ = pg["land_x"] + 2 + (t_land_est - t) * 10
                img = PIGEON[int(t * 6) % 2]
                paste(frame, img.transpose(Image.FLIP_LEFT_RIGHT), gx_ - cam, GROUND - 8)
            else:
                dt = t - pg["t_land"]
                if dt < 2.0:
                    img = PIGEON_FLY[int(t * 12) % 2]
                    paste(frame, img, pg["land_x"] + 2 + dt * 50 - cam, GROUND - 8 - dt * 70 - 2)
        # carts
        for ct in carts:
            t_apex = T_RUN + (ct["apex_x"] - X0) / SPEED
            cx_ = ct["apex_x"] + 6 - 6 + (t_apex - t) * 18
            bob = 1 if int(t * 10) % 2 else 0
            paste(frame, CART, cx_ - cam, GROUND - 12 - bob * 0)

        # player
        if pose != "gone":
            if pose == "stand":
                img = P_RUN[1]
            elif pose == "run":
                img = P_RUN[int(t * 12) % 3]
            elif pose == "jump":
                img = P_JUMP
            else:
                img = P_POLE
            paste(frame, img, px - cam, feet - 16)
            if pose == "run" and int(t * 12) % 3 == 0:
                dr.point((px - cam - 1, feet - 1), fill=(230, 230, 235))

        # vehicles in the street
        bus_x = 1900 - (t - 4) * 90
        for off in (0, 1400):
            bxs = (bus_x + off) - cam
            if -80 < bxs < W + 10:
                paste(frame, BUS, bxs, 213)
        car_x = -60 + (t - 9) * 75
        for off in (0, 1100):
            cxs = car_x + off - cam
            if -50 < cxs < W + 10:
                paste(frame, CAR, cxs, 238)

        # score pops
        for (st, sx, sy, txt) in score_pops:
            if 0 <= t - st < 0.8:
                draw_text(frame, int(sx - cam), int(sy - (t - st) * 25), txt,
                          (255, 255, 255), shadow=(0, 0, 0))

        # HUD
        white, sh = (255, 255, 255), (30, 30, 60)
        draw_text(frame, 6, 10, "SCORE", white, shadow=sh)
        draw_text(frame, 6, 17, f"{min(score, 999999):06d}", white, shadow=sh)
        paste(frame, COIN_FRAMES[int(t * 6) % 4] if True else None, 34, 16)
        draw_text(frame, 42, 17, f"x{ncoins:02d}", white, shadow=sh)
        draw_text(frame, 66, 10, "N.BERGEN", white, shadow=sh)
        draw_text(frame, 76, 17, "1-1", white, shadow=sh)
        draw_text(frame, 116, 10, "TIME", white, shadow=sh)
        if t >= T_RUN:
            draw_text(frame, 118, 17, f"{max(0, time_left):03d}", white, shadow=sh)

        # title overlay
        if t < T_RUN + 2.0:
            a = 1.0 if t < T_RUN + 1.2 else max(0.0, 1 - (t - T_RUN - 1.2) / 0.8)
            if a > 0:
                ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                od = ImageDraw.Draw(ov)
                od.rectangle([8, 44, W - 9, 92], fill=(20, 20, 50, int(200 * a)))
                od.rectangle([8, 44, W - 9, 92], outline=(255, 210, 60, int(255 * a)))
                frame.alpha_composite(ov)
                if a > 0.5:
                    draw_text(frame, (W - text_w("BERGENLINE", 2)) // 2, 52, "BERGENLINE", (255, 210, 60), 2, (120, 40, 20))
                    draw_text(frame, (W - text_w("AVENUE", 2)) // 2, 66, "AVENUE", (255, 210, 60), 2, (120, 40, 20))
                    draw_text(frame, (W - text_w("NORTH BERGEN, NJ")) // 2, 82, "NORTH BERGEN, NJ", white)

        # clear text
        if t >= T_CLEAR:
            draw_text(frame, (W - text_w("COURSE CLEAR!", 1)) // 2, 70, "COURSE CLEAR!", white, 1, sh)
            if t >= T_CLEAR + 0.3:
                draw_text(frame, (W - text_w("TIME BONUS")) // 2, 80, "TIME BONUS", (255, 210, 60), 1, sh)
            # fireworks
            for k, (fx, fy, ft) in enumerate([(30, 60, 0.3), (110, 50, 0.8), (70, 40, 1.4), (40, 100, 2.0), (100, 95, 2.6)]):
                dt = t - T_CLEAR - ft
                if 0 <= dt < 0.7:
                    rad = 4 + dt * 22
                    colr = [(255, 90, 90), (255, 230, 90), (120, 220, 255), (150, 255, 150), (255, 150, 230)][k]
                    for a in range(12):
                        ang = a * math.pi / 6
                        dr.rectangle([fx + math.cos(ang) * rad, fy + math.sin(ang) * rad,
                                      fx + math.cos(ang) * rad + 1, fy + math.sin(ang) * rad + 1], fill=colr)
                    if ("fw", k) not in triggered:
                        triggered.add(("fw", k)); sfx.append((t, "boom"))

        # end card
        if t >= T_END:
            a = min(1.0, (t - T_END) / 0.6)
            ov = Image.new("RGBA", (W, H), (15, 15, 35, int(235 * a)))
            frame.alpha_composite(ov)
            if a >= 1.0:
                _paste_clip(frame, LOGO_CARD, (W - 44) // 2, 46)
                draw_text(frame, (W - text_w("BERGENLINE", 2)) // 2, 96, "BERGENLINE", (255, 210, 60), 2, (120, 40, 20))
                draw_text(frame, (W - text_w("AVENUE", 2)) // 2, 110, "AVENUE", (255, 210, 60), 2, (120, 40, 20))
                draw_text(frame, (W - text_w("NORTH BERGEN, NJ")) // 2, 128, "NORTH BERGEN, NJ", white)
                draw_text(frame, (W - text_w(f"SCORE {score:06d}")) // 2, 146, f"SCORE {score:06d}", white)
                draw_text(frame, (W - text_w(f"COINS x{ncoins:02d}")) // 2, 154, f"COINS x{ncoins:02d}", (255, 210, 60))

        if prev_set is not None:
            if fi in prev_set:
                frame.convert("RGB").resize((W * 2, H * 2), Image.NEAREST).save(
                    OUT_DIR / f"_prev_{fi:04d}.png")
            continue
        out = frame.convert("RGB").resize((W * SCALE, H * SCALE), Image.NEAREST)
        ff.stdin.write(out.tobytes())
        if fi % 150 == 0:
            print(f"frame {fi}/{n}", file=sys.stderr)
    if ff:
        ff.stdin.close()
        ff.wait()


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
    return np.zeros(1)


def make_audio():
    total = np.zeros(int((DURATION + 1) * SR))
    m = music(T_GRAB - T_RUN + 0.05)
    k = int(T_RUN * SR)
    fade = np.ones(len(m)); fade[-int(0.05 * SR):] = np.linspace(1, 0, int(0.05 * SR))
    total[k:k + len(m)] += m * fade
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
    make_audio()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(OUT_DIR / "_video.mp4"),
                    "-i", str(OUT_DIR / "_audio.wav"), "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "160k", "-shortest", str(OUT_DIR / "bergenline_run.mp4")], check=True)
    (OUT_DIR / "_video.mp4").unlink()
    (OUT_DIR / "_audio.wav").unlink()
    print("done:", OUT_DIR / "bergenline_run.mp4", f"{DURATION:.1f}s")
