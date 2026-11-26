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
from PIL import Image, ImageChops, ImageDraw

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


def make_truck():
    """box truck, facing left"""
    im = Image.new("RGBA", (84, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([18, 0, 83, 25], fill=(250, 250, 245))
    d.rectangle([18, 0, 83, 25], outline=(150, 150, 150))
    d.rectangle([19, 20, 82, 24], fill=(30, 130, 60))
    draw_text(im, 18 + (66 - text_w("GARGIULO")) // 2, 4, "GARGIULO", (30, 120, 50))
    draw_text(im, 18 + (66 - text_w("PRODUCE")) // 2, 11, "PRODUCE", (200, 40, 40))
    for k, col in enumerate([(220, 40, 40), (60, 170, 60), (250, 150, 30), (220, 40, 40)]):
        d.ellipse([22 + k * 4, 17, 25 + k * 4, 20], fill=col)
        d.ellipse([71 + k * 2, 17 - (k % 2), 74 + k * 2, 20 - (k % 2)], fill=col)
    d.polygon([(0, 26), (0, 13), (5, 6), (17, 6), (17, 26)], fill=(30, 130, 60))
    d.polygon([(2, 13), (6, 8), (12, 8), (12, 13)], fill=(150, 200, 230))
    d.rectangle([0, 22, 2, 24], fill=(255, 230, 120))
    d.rectangle([0, 26, 83, 27], fill=(60, 60, 60))
    for wx in (4, 56, 68):
        d.ellipse([wx, 24, wx + 8, 31], fill=(25, 25, 30))
        d.ellipse([wx + 3, 27, wx + 5, 29], fill=(170, 170, 180))
    return im


TRUCK = make_truck()


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


WINDOWS = []
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
    ("CARNICERIA", (255, 255, 255), (170, 30, 30), (170, 30, 30), (255, 255, 255), (215, 190, 160)),
]

# Real listings, in address order.  "/" splits a sign onto two lines.
# Real storefronts by block, in address order (list supplied by the user).
# (sign text, sign bg, sign text color, awning 1, awning 2, facade). "/" = two-line sign.
REAL_BLOCKS = [
    [  # 72nd - 74th
        ("BANANA KING", (255, 220, 30), (30, 110, 50), (255, 220, 30), (30, 110, 50), (230, 220, 200)),           # 7316
    ],
    [  # 74th - 77th
        ("EL CARRETERO", (250, 210, 40), (30, 60, 150), (200, 30, 40), (250, 210, 40), (200, 110, 80)),          # 7412
        ("SELECTOS/FOODMARKET", (200, 30, 40), (255, 255, 255), (200, 30, 40), (255, 255, 255), (225, 215, 190)),  # 7425
        ("AL-KARAM/FASHION", (30, 30, 40), (240, 200, 90), (90, 40, 110), (240, 200, 90), (235, 230, 240)),        # 7508
        ("GANDOLFO/PIZZERIA", (30, 130, 60), (255, 255, 255), (200, 30, 30), (255, 255, 255), (180, 80, 60)),     # 7523
        ("AMEEN/PHARMACY", (255, 255, 255), (20, 120, 70), (20, 120, 70), (255, 255, 255), (170, 190, 210)),       # 7527
        ("BOUTIQUE/CAROL", (250, 200, 225), (160, 30, 100), (230, 100, 160), (255, 255, 255), (232, 200, 150)),    # 7551
        ("LAS CHICAS/BAKERY", (255, 230, 190), (180, 60, 40), (240, 140, 80), (255, 240, 220), (250, 200, 210)),  # 7553
        ("N B FASHION", (40, 40, 60), (255, 255, 255), (60, 60, 90), (220, 220, 230), (200, 120, 90)),            # 7609
        ("LATINO AMERICAN/SUPER MARKET", (30, 90, 170), (255, 220, 40), (30, 90, 170), (255, 220, 40), (230, 230, 220)),  # 7620
    ],
    [  # 77th - 79th
        ("CORTADITOS", (250, 240, 220), (120, 60, 30), (120, 60, 30), (250, 240, 220), (200, 110, 80)),          # 7700
        ("LA KAUSA", (200, 40, 30), (255, 220, 60), (200, 40, 30), (255, 220, 60), (230, 220, 200)),             # 7815
        ("NOVECKS/PHARMACY", (255, 255, 255), (30, 80, 160), (30, 80, 160), (255, 255, 255), (215, 190, 160)),   # 7823
        ("LA SORRENTINA", (20, 110, 60), (255, 255, 255), (20, 140, 70), (220, 40, 40), (240, 225, 190)),        # 7831
    ],
    [  # 79th - 81st
        ("TAPAS DE/ESPANA", (200, 30, 30), (255, 215, 40), (200, 30, 30), (255, 215, 40), (232, 200, 150)),      # 7909
        ("BIRRIA HOUSE/TAQUERIA", (120, 30, 20), (255, 200, 60), (230, 110, 30), (255, 230, 120), (250, 200, 210)),  # 7911
    ],
    [  # 81st - 83rd
        ("HARRY'S", (20, 20, 30), (255, 200, 60), (40, 40, 50), (255, 200, 60), (190, 70, 60)),                  # 8101
        ("BERGENLINE/SUPERMARKET", (220, 30, 40), (255, 255, 255), (220, 30, 40), (255, 255, 255), (230, 230, 220)),  # 8107
        ("JIMMY'S/BAKERY", (255, 225, 180), (150, 60, 30), (210, 120, 60), (255, 240, 220), (200, 120, 90)),     # 8125
        ("EL FENIX/BAKERY III", (30, 60, 140), (255, 200, 60), (230, 120, 30), (255, 220, 120), (225, 215, 190)),  # 8133
    ],
    [],  # 83rd - 84th
]
MAX_REAL_W = 96




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
            WINDOWS.append((wx, wy))
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



# ---------------------------------------------------------------- new sprites
PAL3 = dict(PAL2)
PAL3.update({"b": (120, 95, 70, 255), "B": (165, 140, 110, 255), "g": (40, 140, 60, 255),
             "P": (240, 110, 170, 255), "Y": (255, 225, 90, 255), "W": (250, 250, 250, 255)})
GOOSE = [
    sprite(["...KK.........", "..KWKK........", "..KKK.........", "...KK.........", "...KK.........",
            "...KKbbbbb....", "..bbbbbbbbbb..", ".bbbbbbbbbbbb.", ".bbBBbbbbbbbb.", "..bbbbbbbbbb..",
            "....K....K....", "...KK...KK...."], PAL3),
    sprite(["..............", "...KK.........", "..KWKK........", "..KKK.........", "...KK.........",
            "...KKbbbbb....", "..bbbbbbbbbb..", ".bbbbbbbbbbbb.", ".bbBBbbbbbbbb.", "..bbbbbbbbbb..",
            "...K......K...", "..KK.....KK..."], PAL3),
]
DUCK = [
    sprite([".gg.......", "YgEg......", ".gg.......", "..gg......", ".bbbbbbb..", "bbbbbbbbb.",
            ".bbbbbbb..", "..O...O..."], PAL3),
    sprite([".gg.......", "YgEg......", ".gg.......", "..gg......", ".bbbbbbb..", "bbbbbbbbb.",
            ".bbbbbbb..", "...O.O...."], PAL3),
]
BATIDO = sprite(["....P..", "...P...", "..P....", "WWWWWWW", "WYYYYYW", ".YYYYY.", ".YYYYY.",
                 ".YYYYY.", "..YYY..", "..YYY..", ".WWWWW."], PAL3)


def make_pipe():
    im = Image.new("RGBA", (28, 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 7, 25, 19], fill=(40, 160, 60), outline=(15, 70, 25))
    d.rectangle([5, 8, 7, 19], fill=(140, 230, 140))
    d.rectangle([0, 0, 27, 7], fill=(50, 180, 70), outline=(15, 70, 25))
    d.rectangle([3, 1, 5, 6], fill=(150, 235, 150))
    return im


PIPE = make_pipe()


def make_net():
    im = Image.new("RGBA", (26, 13), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for x in range(2, 24, 3):
        d.line([x, 3, x, 12], fill=(60, 60, 70))
    for y in range(4, 13, 3):
        d.line([2, y, 23, y], fill=(60, 60, 70))
    d.rectangle([1, 1, 24, 2], fill=(255, 255, 255))
    d.rectangle([0, 0, 1, 12], fill=(40, 110, 60))
    d.rectangle([24, 0, 25, 12], fill=(40, 110, 60))
    return im


NET = make_net()


def make_cone():
    im = Image.new("RGBA", (7, 9), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(3, 0), (6, 7), (0, 7)], fill=(255, 120, 20))
    d.line([1, 4, 5, 4], fill=(255, 255, 255))
    d.rectangle([0, 7, 6, 8], fill=(255, 120, 20))
    return im


CONE = make_cone()


def make_glove():
    im = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([0, 0, 9, 7], fill=(210, 30, 30))
    d.ellipse([0, 1, 4, 5], fill=(240, 70, 70))
    d.rectangle([2, 6, 8, 9], fill=(250, 250, 250))
    return im


GLOVE = make_glove()


def make_train():
    im = Image.new("RGBA", (186, 34), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for c in range(3):
        x = c * 62
        d.rounded_rectangle([x, 2, x + 59, 30], 4, fill=(205, 210, 220), outline=(90, 95, 110))
        d.rectangle([x + 1, 20, x + 58, 23], fill=(30, 90, 170))
        for w in range(5):
            d.rectangle([x + 4 + w * 11, 7, x + 11 + w * 11, 15], fill=(50, 70, 100))
            d.point((x + 5 + w * 11, 8), fill=(160, 200, 240))
        for wx in (x + 8, x + 44):
            d.ellipse([wx, 27, wx + 7, 33], fill=(30, 30, 35))
    d.polygon([(0, 30), (0, 10), (6, 2), (8, 2), (8, 30)], fill=(205, 210, 220))
    d.rectangle([1, 12, 5, 17], fill=(50, 70, 100))
    d.rectangle([0, 24, 2, 26], fill=(255, 240, 150))
    draw_text(im, 70, 25, "LIGHT RAIL", (255, 255, 255))
    d.line([62, 0, 70, -4], fill=(60, 60, 60))
    return im


TRAIN = make_train()
CAR_R = make_car((200, 40, 40))
CAR_B = make_car((50, 90, 190))

# ---------------------------------------------------------------- timeline
# Every point-scoring moment below was read frame by frame off the reference
# video's HUD, so each action lands on the matching sound in its soundtrack.
DURATION = 91.4
BEAT0, BEAT = 0.07, 60 / 133.5
REF_SCORE = [
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
T_RUN = 1.4                                # after the PRESS START screen
V_BASE, V_BUS, V_HYPER = 34.0, 80.0, 58.0
BUS_V = 50.0                               # buses move slower than the kid riding them
TB0, TB1 = 15.4, 19.2
TH0, TH1 = 60.1, 70.0
T_HIT = 50.6                               # runaway cart: shrink
T_FINAL, T_GRAB = 78.3, 79.3
PIPE_JUMP = 240                            # x skipped while the screen is black
# pipe = land on top, sink done, black ends, rise done
PIPES = [dict(land=43.0, sunk=43.35, black=44.05, up=44.4, world=2),
         dict(land=53.4, sunk=53.7, black=54.45, up=54.85, world=3),
         dict(land=70.4, sunk=70.75, black=71.45, up=71.85, world=4)]
WORLD_CARDS = {2: ("WORLD 1-2", "TONNELLE AVE", "LIGHT RAIL TUNNEL"),
               3: ("WORLD 1-3", "BRADDOCK PARK", "WOODCLIFF LAKE"),
               4: ("WORLD 1-4", "BACK ON", "BERGENLINE AVE")}


def speed_t(t):
    for p in PIPES:
        if p["land"] <= t < p["up"]:
            return 0.0
    if TB0 <= t < TB1:
        return V_BUS
    if TH0 <= t < TH1:
        return V_HYPER
    return V_BASE


_ts = np.arange(0, DURATION + 0.01, 1 / 600)
_xs = np.empty_like(_ts)
_x = X0
_jumped = set()
for _i, _t in enumerate(_ts):
    for _k, _p in enumerate(PIPES):
        if _t >= (_p["sunk"] + _p["black"]) / 2 and _k not in _jumped:
            _jumped.add(_k); _x += PIPE_JUMP
    _xs[_i] = _x
    if T_RUN <= _t < T_FINAL:
        _x += speed_t(_t) / 600
TS, XS = _ts, _xs
X_FINAL = float(np.interp(T_FINAL, TS, XS))


def x_of_t(t):
    return float(np.interp(t, TS, XS))


def world_at(t):
    w = 1
    for p in PIPES:
        if t >= (p["sunk"] + p["black"]) / 2:
            w = p["world"]
    return w


POLE_X = int(X_FINAL + 112)
LEVEL_W = POLE_X + 120
LIB_X, LIB_W = POLE_X + 16, 86
# x ranges of each world's strip
WR = {1: (-10, x_of_t(PIPES[0]["land"]) + 110),
      2: (x_of_t(PIPES[0]["up"]) - 70, x_of_t(PIPES[1]["land"]) + 110),
      3: (x_of_t(PIPES[1]["up"]) - 70, x_of_t(PIPES[2]["land"]) + 110),
      4: (x_of_t(PIPES[2]["up"]) - 70, LEVEL_W)}

T_BIG = 7.9
T_POWER_HIT = 6.7
T_PINATA, T_CAFE = 57.7, TH0
ROOF = -8


def kid_big_t(t):
    return (T_BIG <= t < T_HIT) or t >= T_CAFE


def KW_t(t):
    return 18 if kid_big_t(t) else 12


def KH_t(t):
    return 24 if kid_big_t(t) else 16


def _place_crosses():
    """74th-83rd St signs inside World 1-1; busier blocks get more room."""
    names = ["74 ST", "77 ST", "79 ST", "81 ST", "83 ST"]
    weights = [2.2, 10.5, 5, 3, 5]
    end = x_of_t(41.2)
    span = end - (-10) - 5 * 36
    avoid = [(10.5, 13.0), (14.8, 15.5), (23.2, 26.4)]
    out, x = [], -10
    for i, nm in enumerate(names):
        x += span * weights[i] / sum(weights)
        cx = x
        for a, b in avoid:
            if x_of_t(a) - 36 < cx < x_of_t(b):
                cx = x_of_t(b) + 2
        out.append((int(cx), nm))
        x = cx + 36
    out.append((int(X_FINAL + 40), "84 ST"))
    return out


CROSS = _place_crosses()


# ---------------------------------------------------------------- level strips
def street_ground(d, a, b):
    d.rectangle([a, GROUND, b, GROUND + 9], fill=(200, 200, 205))
    for sx in range(int(a) - int(a) % 12, int(b), 12):
        d.line([sx, GROUND, sx, GROUND + 9], fill=(170, 170, 178))
    d.line([a, GROUND, b, GROUND], fill=(225, 225, 230))
    d.rectangle([a, GROUND + 10, b, GROUND + 12], fill=(140, 140, 150))
    d.rectangle([a, GROUND + 13, b, H], fill=(60, 62, 70))
    for sx in range(int(a) - int(a) % 20, int(b), 20):
        d.rectangle([sx, 236, sx + 10, 237], fill=(250, 210, 40))


def fill_stores(d, a, b, real, rng, gi):
    a, b = int(a), int(b)
    L = b - a
    signs = []
    free = L - sum(min(MAX_REAL_W, store_min_w(r) + 24) for r in real)
    ngen = max(0, int(free // 56)) if real else max(1, L // 52)
    stores = []
    slots = len(real) + 1
    for k in range(slots):
        cnt = ngen * (k + 1) // slots - ngen * k // slots
        for _ in range(cnt):
            stores.append(GENERIC[gi % len(GENERIC)]); gi += 1
        if k < len(real):
            stores.append(real[k])
    if not stores:
        return signs, gi
    widths = [store_min_w(st) for st in stores]
    extra = L - sum(widths)
    while extra < 0 and len(stores) > len(real):     # drop placeholders that don't fit
        for i, st in enumerate(stores):
            if st not in real:
                del stores[i]; del widths[i]; break
        extra = L - sum(widths)
    for k in range(max(0, extra)):
        widths[k % len(widths)] += 1
    x = a
    for st, w in zip(stores, widths):
        signs.append(draw_building(d, x, w, st, rng))
        x += w
    return signs, gi


def draw_cross(im, d, cx, label):
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
    bx, by = px + 2, GROUND - 34
    d.rectangle([bx, by, bx + 15, by + 9], fill=(170, 30, 35))
    d.rectangle([bx, by + 10, bx + 15, by + 19], fill=(250, 200, 40))
    d.polygon([(bx, by + 20), (bx + 15, by + 20), (bx + 7, by + 23)], fill=(250, 200, 40))
    im.alpha_composite(LOGO_BANNER, (bx + 2, by + 4))


def draw_underground(im, d, a, b):
    a, b = int(a), int(b)
    d.rectangle([a, 0, b, H], fill=(14, 16, 40))
    # ceiling bricks
    for y in range(28, 46, 6):
        for x in range(a - (y // 6 % 2) * 6, b, 12):
            d.rectangle([x + 1, y + 1, x + 10, y + 5], fill=(60, 70, 120))
    # subway tile wall
    for y in range(50, 150, 4):
        for x in range(a + (y // 4 % 2) * 3, b, 7):
            d.rectangle([x, y, x + 5, y + 2], fill=(34, 44, 96))
    d.rectangle([a, 112, b, 116], fill=(200, 160, 40))           # tile stripe
    # station signs and lamps
    for x in range(a + 40, b - 60, 150):
        d.rectangle([x, 70, x + 58, 84], fill=(20, 60, 140), outline=(230, 230, 240))
        draw_text(im, x + (58 - text_w("TONNELLE AVE")) // 2, 72, "TONNELLE AVE", (255, 255, 255))
        draw_text(im, x + (58 - text_w("LIGHT RAIL")) // 2, 78, "LIGHT RAIL", (250, 210, 60))
        d.rectangle([x + 90, 46, x + 91, 54], fill=(90, 90, 100))
        d.ellipse([x + 86, 54, x + 95, 60], fill=(255, 230, 140))
    # track bed
    d.rectangle([a, 150, b, GROUND - 1], fill=(8, 8, 20))
    d.line([a, 186, b, 186], fill=(120, 120, 140))
    d.line([a, 190, b, 190], fill=(120, 120, 140))
    for x in range(a - a % 8, b, 8):
        d.rectangle([x, 191, x + 4, 193], fill=(60, 45, 35))
    # platform floor
    d.rectangle([a, GROUND, b, H], fill=(40, 44, 70))
    d.rectangle([a, GROUND, b, GROUND + 2], fill=(230, 200, 60))       # yellow platform edge
    for y in range(GROUND + 4, H, 6):
        for x in range(a - (y // 6 % 2) * 6, b, 12):
            d.rectangle([x + 1, y + 1, x + 10, y + 4], fill=(56, 62, 96))


def draw_park(im, d, a, b, rng):
    a, b = int(a), int(b)
    # hills
    for x in range(a - 40, b, 70):
        hh = rng.randint(30, 60)
        d.ellipse([x, GROUND - hh, x + 110, GROUND + hh], fill=(110, 190, 110))
        d.ellipse([x + 20, GROUND - hh + 6, x + 70, GROUND - hh + 20], fill=(140, 210, 130))
    # trees
    for x in range(a + 10, b, 34):
        if rng.random() < 0.8:
            th = rng.randint(44, 70)
            d.rectangle([x + 6, GROUND - th + 20, x + 9, GROUND - 1], fill=(100, 65, 35))
            d.ellipse([x - 6, GROUND - th, x + 22, GROUND - th + 30], fill=(40, 130, 60))
            d.ellipse([x - 1, GROUND - th + 4, x + 14, GROUND - th + 18], fill=(70, 170, 80))
    # grass path
    d.rectangle([a, GROUND, b, GROUND + 9], fill=(90, 170, 70))
    d.rectangle([a, GROUND, b, GROUND + 1], fill=(130, 210, 100))
    d.rectangle([a, GROUND + 6, b, GROUND + 9], fill=(150, 110, 70))
    # Woodcliff Lake
    d.rectangle([a, GROUND + 10, b, H], fill=(50, 120, 190))
    for y in range(GROUND + 16, H, 7):
        for x in range(a + (y * 7) % 23, b, 23):
            d.line([x, y, x + 6, y], fill=(110, 170, 230))
    # entrance arch
    gx = int(x_of_t(PIPES[1]["up"]) + 40)
    for gpx in (gx - 4, gx + 36):
        d.rectangle([gpx, GROUND - 44, gpx + 7, GROUND - 1], fill=(170, 80, 60))
        d.rectangle([gpx - 1, GROUND - 47, gpx + 8, GROUND - 44], fill=(200, 190, 170))
    d.rectangle([gx - 5, GROUND - 62, gx + 44, GROUND - 47], fill=(30, 90, 50))
    d.rectangle([gx - 4, GROUND - 61, gx + 43, GROUND - 48], outline=(240, 220, 140))
    draw_text(im, gx + 20 - text_w("BRADDOCK") // 2, GROUND - 59, "BRADDOCK", (255, 240, 180))
    draw_text(im, gx + 20 - text_w("PARK") // 2, GROUND - 53, "PARK", (255, 240, 180))
    # lake sign
    lx = int(x_of_t(58.4))
    d.rectangle([lx + 18, GROUND - 22, lx + 19, GROUND], fill=(100, 65, 35))
    d.rectangle([lx, GROUND - 30, lx + 37, GROUND - 18], fill=(110, 70, 40), outline=(60, 35, 20))
    draw_text(im, lx + 2, GROUND - 28, "WOODCLIFF", (255, 240, 200))
    draw_text(im, lx + 10, GROUND - 23, "LAKE", (255, 240, 200))
    # checkpoint banner: Cinderella Man
    cx = int(x_of_t(64.6))
    d.rectangle([cx, GROUND - 70, cx + 1, GROUND - 1], fill=(200, 200, 210))
    d.rectangle([cx + 2, GROUND - 70, cx + 50, GROUND - 50], fill=(140, 20, 30), outline=(250, 200, 60))
    draw_text(im, cx + 5, GROUND - 67, "CINDERELLA", (255, 230, 120))
    draw_text(im, cx + 18, GROUND - 61, "MAN", (255, 230, 120))
    im.alpha_composite(GLOVE, (cx + 6, GROUND - 62))
    im.alpha_composite(GLOVE.transpose(Image.FLIP_LEFT_RIGHT), (cx + 36, GROUND - 62))
    draw_text(im, cx + 5, GROUND - 55, "CHECKPOINT", (255, 255, 255))


def build_level():
    im = Image.new("RGBA", (LEVEL_W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rng = random.Random(7)
    signs, gi = [], 0
    # World 1-1 and 1-4: Bergenline Avenue
    a1, b1 = WR[1]
    crosses_1 = [c for c in CROSS if c[0] < b1]
    starts = [a1] + [cx + CROSS_W for cx, _ in crosses_1]
    ends = [cx for cx, _ in crosses_1] + [b1]
    for si, (a, b) in enumerate(zip(starts, ends)):
        real = REAL_BLOCKS[si] if si < 5 else []
        s, gi = fill_stores(d, a, b, real, rng, gi)
        signs += s
    a4, _ = WR[4]
    s, gi = fill_stores(d, a4, X_FINAL + 40, [], rng, gi)
    signs += s
    for name, bx, bw, sy, fg in signs:
        for li, line in enumerate(name.split("/")):
            draw_text(im, bx + (bw - text_w(line)) // 2, sy + 2 + li * 6, line, fg)
    street_ground(d, a1, b1)
    street_ground(d, a4, LEVEL_W)
    for cx, label in CROSS:
        draw_cross(im, d, cx, label)
    draw_library(im, d)
    draw_underground(im, d, *WR[2])
    draw_park(im, d, *WR[3], random.Random(3))
    return im


LEVEL = build_level()
SKYLINE = build_skyline()
CLOUDS = build_clouds()


def _lit_skyline():
    a = np.array(SKYLINE)
    m = (a[:, :, 0] == 185) & (a[:, :, 1] == 200) & (a[:, :, 2] == 235)
    b = a.copy()
    b[:, :, :3] = (b[:, :, :3] * 0.45).astype(np.uint8)
    b[m, :3] = (255, 220, 120)
    return Image.fromarray(b)


SKYLINE_NIGHT = _lit_skyline()

# ---------------------------------------------------------------- choreography
moves, coins, blocks, enemies = [], [], [], []
hydrants, carts, cellars, ledges, sheds, nets = [], [], [], [], [], []
brick_rows, steps, labels = [], [], []


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
    apex = apex if apex is not None else h + 38
    m = mv_t(tp - dur / 2, tp + dur / 2, h, h, apex)
    if kind:
        xp = x_of_t(tp)
        blocks.append(dict(x=xp + KW_t(tp) / 2 - 6, y=int(GROUND - (apex + KH_t(tp)) - 12), kind=kind, t=tp))
    return m


def land_on(tl, kind, h=0, dur=0.55, apex=None):
    mv_t(tl - dur, tl, h, h, apex if apex is not None else h + 28)
    stomp_at(tl, kind)


def stomp_at(tl, kind):
    xl = x_of_t(tl)
    ew = 10 if kind == "pigeon" else 12
    enemies.append(dict(kind=kind, x=xl + KW_t(tl) / 2 - ew / 2, mode="stomp", t=tl))


def knock(t, kind):
    enemies.append(dict(kind=kind, x=x_of_t(t) + KW_t(t) - 4, mode="knock", t=t))


def coin_t(*ts):
    for t in ts:
        coins.append(dict(t=t))


def over(tp, what, apex=36, dur=0.6):
    tp = BEAT0 + round((tp - BEAT0) / BEAT) * BEAT
    mv_t(tp - dur / 2, tp + dur / 2, 0, 0, apex)
    xc = x_of_t(tp) + KW_t(tp) / 2
    if what == "hydrant":
        hydrants.append(xc - 4)
    elif what == "cart":
        carts.append((tp, xc))
    elif what in ("cellar", "pothole"):
        cellars.append((xc - 12, xc + 12))
    elif what == "net":
        nets.append(xc - 13)


def label(t, text, col=(255, 230, 90)):
    labels.append((t, text, col))


# ---- WORLD 1-1: Bergenline Ave, 72nd -> 83rd
over(5.3, "pothole", 34, 0.56)
peak(3.1, "coin")
land_on(4.3, "pigeon")
peak(T_POWER_HIT, "batido")
label(T_POWER_HIT, "BANANA KING BATIDO!")
label(T_BIG, "SUPER SIZE!")
land_on(9.7, "rat")
mv_t(10.55, 11.05, 0, 30, 44)
coin_t(11.37, 11.5, 11.7, 11.87, 12.03, 12.23)
mv_t(12.45, 12.95, 30, 0, 40)
ledges.append((x_of_t(10.95) - 4, x_of_t(12.5) + 18, 30))
land_on(13.8, "pigeon")
land_on(14.1, "pigeon", dur=0.3, apex=14)
# two jitneys back to back
mv_t(14.9, TB0, 0, ROOF, 10)
mv_t(17.1, 17.9, ROOF, ROOF, ROOF + 22)
mv_t(TB1, 19.65, ROOF, 0, 6)
label(15.4, "JITNEY HOP!")
land_on(20.3, "rat")
peak(21.1, "coin", dur=0.52); peak(21.7, "coin", dur=0.52); peak(22.3, "coin", dur=0.52)
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
stomp_at(39.3, "pigeon")
coin_t(39.53)
mv_t(40.45, 41.45, 0, 0, 40)
coin_t(40.67, 40.77, 41.0, 41.1, 41.33)
coin_t(42.1, 42.2, 42.3, 42.53)
# ---- pipe down -> WORLD 1-2: Tonnelle Ave light rail tunnel
for p in PIPES:
    mv_t(p["land"] - 0.4, p["land"], 0, 20, 32)
mv_t(PIPES[0]["up"], 45.1, 20, 0, 34)
stomp_at(45.1, "rat")
for tb in [45.7, 46.3, 46.9, 47.5, 48.1]:
    peak(tb, "brick", dur=0.56, apex=40)
coin_t(46.7, 47.17, 47.67)
brick_rows.append((blocks[-5]["x"] - 12, blocks[-1]["x"] + 24, blocks[-1]["y"]))
mv_t(48.45, 48.97, 0, 0, 30)
coin_t(48.63, 48.8)
stomp_at(48.97, "rat")
peak(49.9, "coin")
label(T_HIT, "OUCH! RUNAWAY CART!", (255, 120, 120))
land_on(51.7, "rat")
land_on(52.9, "rat")
# ---- pipe up -> WORLD 1-3: Braddock Park
mv_t(PIPES[1]["up"], PIPES[1]["up"] + 0.45, 20, 0, 28)
peak(55.9, "coin")
PIN_M = peak(T_PINATA, None, apex=40)
PINATA_POS = (x_of_t(T_PINATA) + KW_t(T_PINATA) / 2 - 8, GROUND - (40 + 16) - 16)
label(T_PINATA, "PINATA!")
label(T_CAFE + 0.05, "CAFECITO SPEED BOOST!")
over(59.0, "net")
knock(60.9, "duck"); knock(61.3, "goose"); knock(61.7, "goose"); knock(62.5, "duck")
over(63.9, "net", 38, 0.5)
label(64.6, "CHECKPOINT!", (255, 255, 255))
knock(65.3, "goose")
over(66.3, "net", 38, 0.5)
for dt_, k_ in ((-0.15, "duck"), (-0.05, "goose"), (0.05, "duck")):
    knock(67.3 + dt_, k_)
coin_t(67.3)
for dt_, k_ in ((-0.15, "goose"), (-0.05, "duck"), (0.05, "goose")):
    knock(69.3 + dt_, k_)
coin_t(69.3)
knock(69.7, "duck")
# ---- pipe -> WORLD 1-4: back on Bergenline, 83rd -> 84th, library
mv_t(PIPES[2]["up"], PIPES[2]["up"] + 0.45, 20, 0, 28)
label(72.4, "HURRY UP!", (255, 90, 90))
over(72.9, "hydrant")
over(74.1, "pothole", 32, 0.7)
st = [75.6, 76.13, 76.66, 77.19, 77.72]
for i in range(4):
    mv_t(st[i], st[i + 1], i * 10, (i + 1) * 10, (i + 1) * 10 + 8)
for i in range(4):
    x_a = x_of_t(st[i + 1]) - 2
    x_b = x_of_t(st[i + 2]) - 2 if i < 3 else X_FINAL + 22
    steps.append((x_a, x_b, (i + 1) * 10))

moves.sort(key=lambda m: m["t0"])
for a_, b_ in zip(moves, moves[1:]):
    assert a_["t1"] <= b_["t0"] + 0.001, ("overlap", a_["t0"], b_["t0"])

PIPE_SPOTS = []
for p in PIPES:
    PIPE_SPOTS.append(x_of_t(p["land"]) + KW_t(p["land"]) / 2 - 14)
    PIPE_SPOTS.append(x_of_t(p["up"]) + KW_t(p["up"]) / 2 - 14)


def run_height(t):
    h = 0
    for m in moves:
        if m["t0"] <= t < m["t1"]:
            x = x_of_t(t)
            if m["x1"] - m["x0"] < 1e-6:
                return m["h1"], True
            return move_h(m, x), True
        if m["t1"] <= t:
            h = m["h1"]
    return h, False


for c in coins:
    h, _ = run_height(c["t"])
    c["x"] = x_of_t(c["t"]) + KW_t(c["t"]) / 2 - 3
    c["hb"] = h + KH_t(c["t"]) / 2 - 4

FJ_DUR = T_GRAB - T_FINAL
GRAB_X = POLE_X - 16
GRAB_H = 72
SLIDE = 1.1
T_LAND = T_GRAB + SLIDE
DOOR_X = LIB_X + LIB_W // 2 - 9
T_CLEAR = 82.07
T_END = 85.9


def player_state(t):
    if t < T_RUN:
        return X0, 0, "stand"
    for p in PIPES:
        if p["land"] <= t < p["up"]:
            x = x_of_t(t)
            kh = KH_t(t)
            if t < p["sunk"]:
                return x, 20 - kh * (t - p["land"]) / (p["sunk"] - p["land"]), "stand"
            if t < p["black"]:
                return x, 0, "gone"
            return x, 20 - kh + kh * (t - p["black"]) / (p["up"] - p["black"]), "stand"
    if t < T_FINAL:
        h, air = run_height(t)
        return x_of_t(t), h, "jump" if air else "run"
    if t < T_GRAB:
        p = (t - T_FINAL) / FJ_DUR
        h = 40 + (GRAB_H - 40) * p + 30 * 4 * p * (1 - p) * (1 - p)
        return X_FINAL + (GRAB_X - X_FINAL) * p, h, "jump"
    if t < T_LAND:
        return GRAB_X, GRAB_H * (1 - (t - T_GRAB) / SLIDE), "pole"
    if t < T_CLEAR + 1.5:
        if t - T_LAND < 0.25:
            return POLE_X + 2, 0, "stand"
        x = POLE_X + 2 + (t - T_LAND - 0.25) * 34
        return (x, 0, "run") if x < DOOR_X else (DOOR_X, 0, "gone")
    return DOOR_X, 0, "gone"


def camera(px):
    return int(max(0, min(LEVEL_W - W, px - 50)))


def bus_x(t, k):
    xb0 = x_of_t(TB0)
    return xb0 - 2 + BUS_V * (t - TB0) + k * 76


def score_at(t):
    return sum(d for tt, d in REF_SCORE if tt <= t)


def time_at(t):
    return max(0, 400 - int(t * 2.45))


def lerp(a, b, k):
    return tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(len(a)))


def sky_colors(t, w):
    if w == 1:
        k = min(1, t / 40)
        return lerp((150, 180, 245), (96, 160, 255), k), lerp((255, 214, 190), (175, 215, 255), k)
    if w == 3:
        k = (t - 54) / 16
        return lerp((250, 170, 90), (230, 120, 90), k), lerp((255, 225, 150), (255, 190, 120), k)
    k = min(1, max(0, (t - 71.5) / 10))
    return lerp((80, 50, 130), (20, 16, 60), k), lerp((240, 120, 110), (110, 60, 140), k)


def tint_for(t, w):
    if w == 3:
        return (255, 228, 195)
    if w == 4:
        return lerp((225, 190, 215), (150, 135, 210), min(1, max(0, (t - 71.5) / 9)))
    return None


def night_k(t, w):
    return 0 if w != 4 else min(1, max(0, (t - 71.5) / 7))


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
    h, _ = run_height(min(t, T_FINAL - 0.01))
    return x_of_t(min(t, T_FINAL)), GROUND - h - KH_t(t) - 10


def enemy_img(kind, w, t, flip_dir=True):
    if w == 3:
        kind = {"pigeon": "goose", "rat": "duck", "cart": "goose"}.get(kind, kind)
    if w == 2 and kind == "pigeon":
        kind = "rat"
    if kind == "pigeon":
        return PIGEON[int(t * 5) % 2].transpose(Image.FLIP_LEFT_RIGHT), kind
    if kind == "rat":
        return RAT[int(t * 8) % 2], kind
    if kind == "goose":
        return GOOSE[int(t * 6) % 2], kind
    if kind == "duck":
        return DUCK[int(t * 6) % 2], kind
    return CART, kind


def centered(frame, y, s, col, sc=1, sh=None):
    draw_text(frame, (W - text_w(s, sc)) // 2, y, s, col, sc, sh)


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
    for (tt, d_) in REF_SCORE:
        if tt == T_GRAB:
            pops.append((tt, POLE_X + 4, GROUND - GRAB_H - 20, str(d_), (255, 255, 255)))
        else:
            px_, py_ = popup_pos(tt)
            pops.append((tt, px_, py_, str(d_), (255, 255, 255)))
    pb = [b for b in blocks if b["kind"] == "batido"][0]
    stars = [(random.Random(k).randint(0, W), random.Random(k + 99).randint(30, 150)) for k in range(40)]
    white, sh = (255, 255, 255), (30, 30, 60)
    for fi in range(n):
        t = fi / FPS
        w = world_at(t)
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

        # ---------------- sky
        top, bot = sky_colors(t, w)
        frame = Image.new("RGBA", (W, H), top + (255,))
        dr = ImageDraw.Draw(frame)
        for yy in range(30, GROUND):
            dr.line([0, yy, W, yy], fill=lerp(top, bot, (yy - 30) / (GROUND - 30)))
        nk = night_k(t, w)
        if nk > 0:
            for sx, sy in stars:
                if (sx * 7 + int(t * 3)) % 11 != 0:
                    dr.point((sx, sy), fill=lerp(bot, (255, 255, 230), nk))
            dr.ellipse([108, 40, 122, 54], fill=lerp(top, (250, 245, 210), nk))
        if w in (1, 3):
            co = int(cam * 0.25 + t * 3) % CLOUDS.width
            _paste_clip(frame, CLOUDS, -co, 0)
            _paste_clip(frame, CLOUDS, -co + CLOUDS.width, 0)
        if w in (1, 4):
            sky_img = SKYLINE if nk == 0 else Image.blend(SKYLINE, SKYLINE_NIGHT, nk)
            _paste_clip(frame, sky_img, -int(cam * 0.5), 0)
        _paste_clip(frame, LEVEL, -cam, 0)

        # light rail train in the tunnel
        if w == 2:
            for t0 in (45.2, 49.4, 52.2):
                tx_ = x_of_t(t0) + 160 - (t - t0) * 150
                if -190 < tx_ - cam < W + 10:
                    _paste_clip(frame, TRAIN, int(tx_ - cam), 155)

        # ---------------- street props
        for (a_, b_) in cellars:
            cx0, cx1 = a_ - cam, b_ - cam
            if cx1 < -10 or cx0 > W + 10:
                continue
            dr.rectangle([cx0, GROUND, cx1, GROUND + 9], fill=(20, 18, 22))
            dr.rectangle([cx0 + 2, GROUND + 2, cx1 - 2, GROUND + 4], fill=(45, 40, 45))
            _paste_clip(frame, CONE, int(cx0 - 9), GROUND - 9)
            _paste_clip(frame, CONE, int(cx1 + 2), GROUND - 9)
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
        for nx in nets:
            _paste_clip(frame, NET, int(nx - cam), GROUND - 13)
        for i, (a_, b_, hh) in enumerate(steps):
            for lvl in range(hh // 10):
                for cx_ in np.arange(a_, b_ - 1, 18):
                    cw = int(min(18, b_ - cx_))
                    _paste_clip(frame, CRATES[(i + lvl) % 3].crop((0, 0, cw, 10)), int(cx_ - cam), GROUND - 10 - lvl * 10)
        # ducks paddling on Woodcliff Lake
        if w == 3:
            for k in range(6):
                dx = (k * 61 + t * (6 + k)) % (W + 40) - 20
                _paste_clip(frame, DUCK[int(t * 2 + k) % 2], int(dx), 222 + (k % 3) * 9)
        # pinata on a tree branch
        pnx, pny = PINATA_POS
        if w == 3:
            dr.rectangle([pnx - 20 - cam, 72, pnx + 30 - cam, 75], fill=(100, 65, 35))
            if t < T_PINATA:
                sway = math.sin(t * 3) * 2
                dr.line([pnx + 8 - cam, 75, pnx + 8 + sway - cam, pny], fill=(240, 240, 240))
                _paste_clip(frame, PINATA, int(pnx + sway - cam), int(pny))
            else:
                dt = t - T_PINATA
                dr.line([pnx + 8 - cam, 75, pnx + 8 - cam, pny - 10], fill=(240, 240, 240))
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
            if b["x"] - cam < -20 or b["x"] - cam > W + 20:
                continue
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
                ix, iy = pb["x"] + 2, pb["y"] - 11 * (t - T_POWER_HIT) / 0.3
            else:
                ix, iy = item_path(t, T_POWER_HIT + 0.3, (pb["x"] + 2, pb["y"] - 11),
                                   T_BIG, (x_of_t(T_BIG) + 8, GROUND - 16), 6)
            _paste_clip(frame, BATIDO, int(ix - cam), int(iy))
        if T_PINATA <= t < T_CAFE:
            ix, iy = item_path(t, T_PINATA, (PINATA_POS[0] + 4, PINATA_POS[1] + 4),
                               T_CAFE, (x_of_t(T_CAFE) + 6, GROUND - 16), 22)
            _paste_clip(frame, CAFECITO, int(ix - cam), int(iy))

        # ---------------- coins
        for c in coins:
            if c["x"] - cam < -10 or c["x"] - cam > W + 10:
                continue
            cy = GROUND - c["hb"] - 8
            if t < c["t"]:
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
            if e["x"] - cam > W + 40 or e["x"] - cam < -80:
                continue
            img, kind = enemy_img(e["kind"], w, t)
            if t < e["t"]:
                ex = e["x"]
                if kind in ("rat", "duck"):
                    ex += (e["t"] - t) * 12
                elif kind == "cart":
                    ex += (e["t"] - t) * 18
                _paste_clip(frame, img, int(ex - cam), GROUND - img.height)
                continue
            dt = t - e["t"]
            if e["mode"] == "stomp":
                if kind == "pigeon" and dt < 2.0:
                    _paste_clip(frame, PIGEON_FLY[int(t * 12) % 2], int(e["x"] + dt * 50 - cam), int(GROUND - 10 - dt * 70))
                elif dt < 0.4:
                    _paste_clip(frame, img.resize((img.width, 3), Image.NEAREST), int(e["x"] - cam), GROUND - 3)
            elif dt < 1.5:
                im2 = img.transpose(Image.FLIP_TOP_BOTTOM)
                ex = e["x"] + 50 * dt - cam
                ey = GROUND - im2.height - (60 * dt - 200 * dt * dt)
                _paste_clip(frame, im2, int(ex), int(ey))
                if dt < 0.12:
                    for a in range(6):
                        ang = a * math.pi / 3
                        dr.point((e["x"] + 6 + math.cos(ang) * 8 - cam, GROUND - 6 + math.sin(ang) * 8), fill=(255, 255, 200))
        for (ta, xc) in carts:
            _paste_clip(frame, CART, int(xc - 6 + (ta - t) * 18 - cam), GROUND - 12)
        # the runaway cart that hits him
        if 48.8 < t < T_HIT + 1.2:
            xh = x_of_t(T_HIT) + KW_t(T_HIT - 0.01) - 2
            if t < T_HIT:
                cx_ = xh + (T_HIT - t) * 110
                _paste_clip(frame, CART, int(cx_ - cam), GROUND - 12)
            else:
                dt = t - T_HIT
                _paste_clip(frame, CART.rotate(-40 * dt * 4, expand=True), int(xh + 40 * dt - cam), int(GROUND - 14 - 50 * dt + 120 * dt * dt))

        # ---------------- vehicles
        if w == 1:
            for k in (0, 1):
                bxp = bus_x(t, k)
                if -70 < bxp - cam < W + 10:
                    _paste_clip(frame, BUS, int(bxp - cam), GROUND - ROOF)
        if w in (1, 4):
            for t0 in (29.0, 74.6):
                if t0 - 2 < t < t0 + 3 and world_at(t0) == w:
                    tx_ = x_of_t(t0) + 100 - (t - t0) * 70
                    if -90 < tx_ - cam < W + 10:
                        _paste_clip(frame, TRUCK, int(tx_ - cam), 206)
            for k, (spd, off, col) in enumerate([(75, 0, CAR), (60, 260, CAR_R), (90, 520, CAR_B)]):
                cxs = (off + t * spd - cam) % 780 - 200
                if -50 < cxs < W + 10 and not (14.0 < t < 20.0):
                    _paste_clip(frame, col, int(cxs), 226)

        # ---------------- flag pole (World 1-4)
        pxs = POLE_X - cam
        if w == 4:
            dr.rectangle([pxs - 4, GROUND - 8, pxs + 5, GROUND - 1], fill=(170, 160, 140))
            dr.rectangle([pxs, GROUND - 108, pxs + 1, GROUND - 9], fill=(220, 220, 225))
            dr.ellipse([pxs - 2, GROUND - 113, pxs + 3, GROUND - 108], fill=(250, 200, 40))
            fy = GROUND - 34 if t < T_GRAB else (GROUND - 34 - (t - T_GRAB) / SLIDE * 72 if t < T_LAND else GROUND - 106)
            fy = int(fy)
            dr.rectangle([pxs + 2, fy, pxs + 33, fy + 11], fill=(170, 30, 35))
            dr.rectangle([pxs + 2, fy + 12, pxs + 33, fy + 23], fill=(250, 200, 40))
            _paste_clip(frame, LOGO_FLAG, pxs + 8, fy + 2)

        # ---------------- player
        if pose != "gone":
            is_big = kid_big_t(t)
            if 0 <= t - T_BIG < 0.6 or 0 <= t - T_CAFE < 0.6:
                tt0 = T_BIG if 0 <= t - T_BIG < 0.6 else T_CAFE
                is_big = int((t - tt0) / 0.08) % 2 == 1
            if 0 <= t - T_HIT < 0.6:
                is_big = int((t - T_HIT) / 0.08) % 2 == 0
            blink = T_HIT + 0.6 <= t < T_HIT + 1.9 and fi % 2 == 0
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
            if not blink:
                paste(frame, img, px - cam, feet - img.height)
            trail.append((px, feet - img.height, img))
            trail[:] = trail[-8:]
            if hyper:
                for _ in range(3):
                    sx = px + rng.uniform(-4, img.width + 4) - cam
                    sy = feet - rng.uniform(0, img.height + 6)
                    dr.point((sx, sy), fill=rng.choice([(255, 255, 255), (255, 240, 120), (150, 230, 255)]))
        # pipes are drawn over the kid so he slides into them
        for sx in PIPE_SPOTS:
            if -30 < sx - cam < W + 10:
                _paste_clip(frame, PIPE, int(sx - cam), GROUND - 20)

        # ---------------- lighting
        tint = tint_for(t, w)
        if tint:
            frame = ImageChops.multiply(frame, Image.new("RGBA", (W, H), tint + (255,)))
            dr = ImageDraw.Draw(frame)
        if nk > 0:
            glow = lerp((60, 50, 40), (255, 220, 120), nk)
            for (wx, wy) in WINDOWS:
                sx = wx - cam
                if -10 < sx < W and wx >= WR[4][0] and (wx * 13 + wy) % 5 != 0:
                    dr.rectangle([sx, wy, sx + 7, wy + 5], fill=glow)

        # ---------------- score pops + labels
        for (st_, sx, sy, txt, col) in pops:
            if 0 <= t - st_ < 0.8:
                draw_text(frame, int(sx - cam), int(sy - (t - st_) * 25), txt, col, shadow=(0, 0, 0))
        for (lt, txt, col) in labels:
            if 0 <= t - lt < 1.1:
                yb = 104 - int(min(1, (t - lt) / 0.15) * 8)
                bw = text_w(txt) + 8
                dr.rounded_rectangle([(W - bw) // 2, yb - 3, (W + bw) // 2, yb + 7], 2, fill=(20, 20, 40))
                centered(frame, yb, txt, col)

        # ---------------- HUD
        draw_text(frame, 6, 10, "SCORE", white, shadow=sh)
        draw_text(frame, 6, 17, f"{min(score, 999999):06d}", white, shadow=sh)
        _paste_clip(frame, COIN_FRAMES[int(t * 6) % 4], 34, 16)
        draw_text(frame, 42, 17, f"x{ncoins:02d}", white, shadow=sh)
        draw_text(frame, 66, 10, "N.BERGEN", white, shadow=sh)
        draw_text(frame, 76, 17, f"1-{w}", white, shadow=sh)
        draw_text(frame, 116, 10, "TIME", white, shadow=sh)
        draw_text(frame, 118, 17, f"{max(0, time_left):03d}", white, shadow=sh)

        # ---------------- progress bar
        if T_RUN <= t < T_END:
            dr.rounded_rectangle([4, 240, W - 5, 254], 3, fill=(15, 15, 35))
            marks = [(T_RUN, "1-1", (240, 200, 60)), (PIPES[0]["land"], "1-2", (90, 120, 230)),
                     (PIPES[1]["land"], "1-3", (90, 200, 90)), (PIPES[2]["land"], "1-4", (240, 120, 90))]
            x0b, x1b = 10, W - 26
            fx = lambda tt: x0b + (x1b - x0b) * (tt - T_RUN) / (T_GRAB - T_RUN)
            for i, (tm, lbl, col) in enumerate(marks):
                xa = fx(tm)
                xb = fx(marks[i + 1][0]) if i < 3 else x1b
                dr.rectangle([xa, 243, xb - 1, 245], fill=col)
                draw_text(frame, int(xa), 248, lbl, col)
            draw_text(frame, W - 23, 243, "LIB", white)
            kx = fx(min(t, T_GRAB))
            dr.rectangle([kx - 1, 241, kx + 2, 246], fill=(255, 255, 255))
            dr.point((kx, 240), fill=(232, 64, 40))

        # ---------------- PRESS START screen
        if t < T_RUN:
            frame.alpha_composite(Image.new("RGBA", (W, H), (10, 10, 30, 255)))
            _paste_clip(frame, LOGO_CARD, (W - 44) // 2, 40)
            centered(frame, 96, "BERGENLINE", (255, 210, 60), 2, (120, 40, 20))
            centered(frame, 110, "AVENUE", (255, 210, 60), 2, (120, 40, 20))
            centered(frame, 130, "WORLD 1-1", white)
            centered(frame, 137, "NORTH BERGEN, NJ", white)
            if int(t * 4) % 2 == 0:
                centered(frame, 160, "PRESS START", (255, 120, 120))
        elif t < T_RUN + 0.15:
            frame.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, int(255 * (1 - (t - T_RUN) / 0.15)))))

        # ---------------- pipe black screens with world cards
        for p in PIPES:
            if p["sunk"] <= t < p["black"]:
                frame.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 255)))
                a_, b_, c_ = WORLD_CARDS[p["world"]]
                centered(frame, 96, a_, white, 2)
                centered(frame, 116, b_, (255, 210, 60))
                centered(frame, 124, c_, (255, 210, 60))

        # ---------------- clear + fireworks
        if t >= T_CLEAR:
            centered(frame, 70, "COURSE CLEAR!", white, 1, sh)
            if t >= T_CLEAR + 0.3:
                centered(frame, 80, "TIME BONUS", (255, 210, 60), 1, sh)
            for k, (fx2, fy2, ft) in enumerate([(30, 60, 0.3), (110, 50, 0.8), (70, 40, 1.4), (40, 100, 2.0), (100, 95, 2.6)]):
                dt = t - T_CLEAR - ft
                if 0 <= dt < 0.7:
                    rad = 4 + dt * 22
                    colr = [(255, 90, 90), (255, 230, 90), (120, 220, 255), (150, 255, 150), (255, 150, 230)][k]
                    for a in range(12):
                        ang = a * math.pi / 6
                        dr.rectangle([fx2 + math.cos(ang) * rad, fy2 + math.sin(ang) * rad,
                                      fx2 + math.cos(ang) * rad + 1, fy2 + math.sin(ang) * rad + 1], fill=colr)

        # ---------------- end card
        if t >= T_END:
            a = min(1.0, (t - T_END) / 0.6)
            frame.alpha_composite(Image.new("RGBA", (W, H), (15, 15, 35, int(235 * a))))
            if a >= 1.0:
                _paste_clip(frame, LOGO_CARD, (W - 44) // 2, 36)
                centered(frame, 86, "BERGENLINE", (255, 210, 60), 2, (120, 40, 20))
                centered(frame, 100, "AVENUE", (255, 210, 60), 2, (120, 40, 20))
                centered(frame, 118, "NORTH BERGEN, NJ", white)
                centered(frame, 132, f"SCORE {score:06d}", white)
                centered(frame, 140, f"COINS x{ncoins:02d}", (255, 210, 60))
                if int(t * 2.5) % 2 == 0:
                    centered(frame, 160, "CONTINUE TO WORLD 2-1?", (255, 120, 120))
                centered(frame, 176, "DROP YOUR FAVORITE", white)
                centered(frame, 183, "NORTH BERGEN SPOT", white)
                centered(frame, 190, "WE MISSED!", white)
                centered(frame, 204, "COMMENT BELOW", (255, 210, 60))

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
    if kind == "pipe":
        out = np.concatenate([square(f, 0.06, 0.5, 0.12) for f in (523, 392, 330, 262, 523, 392, 330, 262)])
        return out
    if kind == "hit":
        n = int(0.35 * SR); tt = np.arange(n) / SR
        f = 900 - 1800 * tt
        return np.where((np.cumsum(f) / SR) % 1 < 0.5, 1, -1) * 0.16 * np.linspace(1, 0, n)
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
    # soundtrack: the reference video's song, plus pipe and hit effects on top
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(OUT_DIR / "reference_audio.m4a"),
                    "-ac", "2", "-ar", str(SR), str(OUT_DIR / "_ref.wav")], check=True)
    with wave.open(str(OUT_DIR / "_ref.wav")) as wf:
        ref = np.frombuffer(wf.readframes(wf.getnframes()), np.int16).reshape(-1, 2).astype(float) / 32768
    extra = [(p["land"], "pipe") for p in PIPES] + [(p["black"], "pipe") for p in PIPES] + [(T_HIT, "hit")]
    for t0, kind in extra:
        w_ = sfx_wave(kind) * 0.8
        k = int(t0 * SR)
        n_ = min(len(w_), len(ref) - k)
        ref[k:k + n_] += w_[:n_, None]
    ref = np.clip(ref, -1, 1)
    with wave.open(str(OUT_DIR / "_mix.wav"), "wb") as wf:
        wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR)
        wf.writeframes((ref * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(OUT_DIR / "_video.mp4"),
                    "-i", str(OUT_DIR / "_mix.wav"), "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                    str(OUT_DIR / "bergenline_run.mp4")], check=True)
    (OUT_DIR / "_ref.wav").unlink()
    (OUT_DIR / "_mix.wav").unlink()
    (OUT_DIR / "_video.mp4").unlink()
    print("done:", OUT_DIR / "bergenline_run.mp4", f"{DURATION:.1f}s")

