"""Level layout: 50x50 grid with N and B letter channels."""
import numpy as np

ROWS = COLS = 50
EMPTY, WALL, BRICK, GATE = 0, 1, 2, 3
SPLIT_COL = 25  # cols < SPLIT_COL are yellow, >= are red


def _hline(cells, r, c0, c1):
    for c in range(min(c0, c1), max(c0, c1) + 1):
        cells.add((r, c))


def _vline(cells, c, r0, r1):
    for r in range(min(r0, r1), max(r0, r1) + 1):
        cells.add((r, c))


def build():
    chan = set()
    gates = set()

    # ---- N ----  left stem col 6 (entry at bottom), diagonal, right stem col 20
    NL, NR, TOP, BOT = 6, 20, 15, 41
    _vline(chan, NL, TOP, ROWS - 1)            # left stem down through bottom border
    for r in range(TOP, BOT + 1):               # 2-wide steep diagonal
        c0 = NL + int(round((r - TOP) * (NR - 1 - NL) / (BOT - TOP)))
        chan.add((r, c0)); chan.add((r, c0 + 1))
    _vline(chan, NR, TOP, BOT)                  # right stem
    _hline(chan, BOT, NR - 2, NR + 1)           # small foot chamber at bottom-right
    n_gate = [(BOT + 1, c) for c in range(NR - 3, NR + 3)]

    # ---- B ----  stem col 28 (entry at bottom)
    BS = 28
    UR, MID, LTOP, LR, BB, INNER = 41, 27, 29, 44, 41, 33
    _vline(chan, BS, TOP, ROWS - 1)             # stem
    _hline(chan, TOP, BS, UR)                   # top bar
    _vline(chan, UR, TOP, MID)                  # upper bowl right side
    _hline(chan, MID, UR, INNER)                # middle bar (upper bowl bottom)
    _vline(chan, INNER, MID, LTOP)              # U-turn
    _hline(chan, LTOP, INNER, LR)               # lower bowl top
    _vline(chan, LR, LTOP, BB)                  # lower bowl right side
    _hline(chan, BB, LR, INNER)                 # bottom bar
    b_gate = [(BB + 1, c) for c in range(INNER - 1, INNER + 5)]

    for g in n_gate + b_gate:
        gates.add(g)

    G = np.full((ROWS, COLS), BRICK, np.int8)
    G[0, :] = WALL; G[-1, :] = WALL; G[:, 0] = WALL; G[:, -1] = WALL
    for (r, c) in chan:
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                rr, cc = r + dr, c + dc
                if 0 <= rr < ROWS and 0 <= cc < COLS and (rr, cc) not in chan:
                    G[rr, cc] = WALL
    for (r, c) in gates:
        G[r, c] = GATE
    for (r, c) in chan:
        G[r, c] = EMPTY
    return G


if __name__ == "__main__":
    G = build()
    ch = {EMPTY: ' ', WALL: '#', BRICK: '.', GATE: 'Y'}
    for r in range(ROWS):
        print('%2d|%s|' % (r, ''.join(ch[v] for v in G[r])))
    print('bricks', (G == BRICK).sum(), 'gates', (G == GATE).sum())
