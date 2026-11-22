"""Brick-breaker simulation matching the timing/feel of the reference video."""
import math
import numpy as np
from level import build, EMPTY, WALL, BRICK, GATE, ROWS, COLS

FPS = 60
NFRAMES = 3112                      # 51.867 s, same as the reference
P = 21.9                            # cell pitch (px)
X0, Y0 = 1.6, 50.5                  # center of cell (0,0)
XE0, YE0 = X0 - P / 2, Y0 - P / 2   # top-left edge of cell (0,0)
FIELD_BOTTOM = YE0 + P * ROWS       # 1134.55
SPEED = 13.57                       # px / frame
NSUB = 2
PADDLE_TOP, PADDLE_H = 1464, 22
PAD_W_NORMAL, PAD_W_WIDE = 217, 282
PAD_MIN_X, PAD_MAX_X = 6, 1074
PAD_VMAX = 11.0
BALL_R = 9
PU_R = 27
PU_FALL = 2.7
LOSS_Y = 1700
WIDE_FRAMES = int(5.2 * FPS)


def cell_x(c):
    return X0 + P * c


def cell_y(r):
    return Y0 + P * r


def cidx(x):
    return np.floor((x - XE0) / P).astype(np.int32)


def ridx(y):
    return np.floor((y - YE0) / P).astype(np.int32)


class Sim:
    def __init__(self, starts, schedule, seed=23):
        """starts: list of (x, y, angle_deg_from_vertical_up)
        schedule: list of (catch_time_s, kind) kind in x3,+3,wide,star,minus"""
        self.G = build()
        self.rng = np.random.default_rng(seed)
        xs, ys, vxs, vys = [], [], [], []
        for (x, y, a) in starts:
            t = math.radians(a)
            xs.append(x); ys.append(y)
            vxs.append(SPEED * math.sin(t)); vys.append(-SPEED * math.cos(t))
        self.x = np.array(xs, float); self.y = np.array(ys, float)
        self.vx = np.array(vxs, float); self.vy = np.array(vys, float)
        self.pad_c = 400.0
        self.pad_w = float(PAD_W_NORMAL)
        self.wide_until = -1
        self.frame = 0
        self.powerups = []          # dicts
        self.flashes = []           # dicts: kind, x, y, age
        self.pending = sorted([(int(round(t * FPS)), k) for (t, k) in schedule])
        self.total_bricks = int(((self.G == BRICK) | (self.G == GATE)).sum())
        self.broken_log = []        # (frame, r, c, kind)
        self.events = []            # (frame, name)
        self.hit_frames = []        # frames with any wall/brick collision
        self.brick_hit_frames = []
        self.catch_frames = []

    # ---------- grid lookup ----------
    def lookup(self, r, c):
        out = np.full(r.shape, WALL, np.int8)
        inside = (r >= 0) & (r < ROWS) & (c >= 0) & (c < COLS)
        out[inside] = self.G[r[inside], c[inside]]
        below = (r >= ROWS) & (c >= 1) & (c <= COLS - 2)
        out[below] = EMPTY
        return out

    # ---------- ball physics ----------
    def step_balls(self):
        h = 1.0 / NSUB
        any_hit = False
        brick_hit = False
        broken = []
        for _ in range(NSUB):
            x, y, vx, vy = self.x, self.y, self.vx, self.vy
            # x move
            nx = x + vx * h
            c_old = cidx(x); c_new = cidx(nx); r_cur = ridx(y)
            t = self.lookup(r_cur, c_new)
            hx = (t != EMPTY) & (c_new != c_old)
            if hx.any():
                any_hit = True
                edge = np.where(vx[hx] > 0, XE0 + P * c_new[hx], XE0 + P * (c_new[hx] + 1))
                nx[hx] = 2 * edge - nx[hx]
                vx[hx] = -vx[hx]
                bm = (t[hx] == BRICK) | (t[hx] == GATE)
                if bm.any():
                    broken += list(zip(r_cur[hx][bm].tolist(), c_new[hx][bm].tolist()))
            x = nx
            # y move
            ny = y + vy * h
            r_old = ridx(y); r_new = ridx(ny); c_cur = cidx(x)
            t = self.lookup(r_new, c_cur)
            hy = (t != EMPTY) & (r_new != r_old)
            if hy.any():
                any_hit = True
                edge = np.where(vy[hy] > 0, YE0 + P * r_new[hy], YE0 + P * (r_new[hy] + 1))
                ny[hy] = 2 * edge - ny[hy]
                vy[hy] = -vy[hy]
                bm = (t[hy] == BRICK) | (t[hy] == GATE)
                if bm.any():
                    broken += list(zip(r_new[hy][bm].tolist(), c_cur[hy][bm].tolist()))
            y = ny
            # paddle
            pl = self.pad_c - self.pad_w / 2; pr = self.pad_c + self.pad_w / 2
            contact = PADDLE_TOP - 6
            hp = (vy > 0) & (y >= contact) & (y - vy * h < contact) & (x >= pl - 4) & (x <= pr + 4)
            if hp.any():
                off = np.clip((x[hp] - self.pad_c) / (self.pad_w / 2), -1.0, 1.0)
                ang = np.radians(off * 38.0 + self.rng.uniform(-4, 4, hp.sum()))
                vx[hp] = SPEED * np.sin(ang)
                vy[hp] = -SPEED * np.cos(ang)
                y[hp] = 2 * contact - y[hp]
            self.x, self.y, self.vx, self.vy = x, y, vx, vy
            # break bricks hit in this substep
            if broken:
                for (r, c) in set(broken):
                    if self.G[r, c] in (BRICK, GATE):
                        self.broken_log.append((self.frame, r, c, int(self.G[r, c])))
                        self.G[r, c] = EMPTY
                        brick_hit = True
                broken = []
        # losses
        keep = self.y < LOSS_Y
        if not keep.all():
            self.x, self.y, self.vx, self.vy = self.x[keep], self.y[keep], self.vx[keep], self.vy[keep]
        if any_hit:
            self.hit_frames.append(self.frame)
        if brick_hit:
            self.brick_hit_frames.append(self.frame)

    # ---------- power-ups ----------
    def spawn_scheduled(self, new_broken):
        if not self.pending or not new_broken:
            return
        f = self.frame
        catch_y = PADDLE_TOP - PU_R
        remaining = []
        used = set()
        for (T, kind) in self.pending:
            done = False
            if True:
                best = None
                for (r, c) in new_broken:
                    if (r, c) in used:
                        continue
                    yb = cell_y(r); xb = cell_x(c)
                    v = (catch_y - yb) / max(T - f, 1)
                    if kind == 'minus':
                        if not (xb < 140 or xb > 940):
                            continue
                    if 2.45 <= v <= 3.0:
                        score = abs(v - PU_FALL)
                        if best is None or score < best[0]:
                            best = (score, r, c, v)
                if best is None and f > T - 50:
                    # overdue: take any fresh brick, fall at the normal speed (late catch)
                    for (r, c) in new_broken:
                        if (r, c) in used:
                            continue
                        if kind == 'minus' and not (cell_x(c) < 140 or cell_x(c) > 940):
                            continue
                        best = (0, r, c, PU_FALL)
                        break
                if best is not None:
                    _, r, c, v = best
                    used.add((r, c))
                    self.powerups.append(dict(kind=kind, x=cell_x(c), y=cell_y(r), vy=v, T=T))
                    self.events.append((f, 'spawn ' + kind))
                    done = True
            if not done:
                remaining.append((T, kind))
        self.pending = remaining

    def apply(self, kind):
        f = self.frame
        if kind == 'x3':
            n = len(self.x)
            sp = np.hypot(self.vx, self.vy)
            base = np.arctan2(self.vx, -self.vy)  # angle from vertical-up
            xs = [self.x]; ys = [self.y]; vxs = [self.vx]; vys = [self.vy]
            for sgn in (-1, 1):
                d = np.radians(self.rng.uniform(18, 42, n)) * sgn
                a = base + d
                xs.append(self.x.copy()); ys.append(self.y.copy())
                vxs.append(SPEED * np.sin(a)); vys.append(-SPEED * np.cos(a))
            self.x = np.concatenate(xs); self.y = np.concatenate(ys)
            self.vx = np.concatenate(vxs); self.vy = np.concatenate(vys)
            self._fix_angles()
        elif kind == '+3':
            angs = np.radians(np.array([-28.0, 0.0, 28.0]) + self.rng.uniform(-6, 6, 3))
            self.x = np.concatenate([self.x, np.full(3, self.pad_c)])
            self.y = np.concatenate([self.y, np.full(3, PADDLE_TOP - 12.0)])
            self.vx = np.concatenate([self.vx, SPEED * np.sin(angs)])
            self.vy = np.concatenate([self.vy, -SPEED * np.cos(angs)])
        elif kind == 'wide':
            self.wide_until = f + WIDE_FRAMES
        self.events.append((f, 'catch ' + kind))
        self.catch_frames.append((f, kind))

    def _fix_angles(self):
        # keep every ball within 66 deg of vertical so nothing skims horizontally forever
        a = np.arctan2(self.vx, -self.vy)
        up = np.abs(a) <= math.pi / 2
        dev = np.where(up, a, np.sign(a) * math.pi - a)  # deviation from nearest vertical
        lim = math.radians(66)
        bad = np.abs(dev) > lim
        if bad.any():
            dev2 = np.clip(dev, -lim, lim)
            a2 = np.where(up, dev2, np.sign(a) * math.pi - dev2)
            self.vx[bad] = SPEED * np.sin(a2[bad])
            self.vy[bad] = -SPEED * np.cos(a2[bad])

    def step_powerups(self):
        pl = self.pad_c - self.pad_w / 2; pr = self.pad_c + self.pad_w / 2
        keep = []
        for p in self.powerups:
            p['y'] += p['vy']
            caught = (p['y'] + PU_R >= PADDLE_TOP and p['y'] - PU_R <= PADDLE_TOP + PADDLE_H
                      and pl - PU_R * 0.6 <= p['x'] <= pr + PU_R * 0.6)
            if caught:
                self.apply(p['kind'])
                self.flashes.append(dict(kind=p['kind'], x=p['x'], y=p['y'], age=0))
            elif p['y'] - PU_R > LOSS_Y + 40:
                pass
            else:
                keep.append(p)
        self.powerups = keep
        for fl in self.flashes:
            fl['age'] += 1
        self.flashes = [fl for fl in self.flashes if fl['age'] < 24]

    # ---------- paddle AI ----------
    def step_paddle(self):
        f = self.frame
        target_w = PAD_W_WIDE if f < self.wide_until else PAD_W_NORMAL
        self.pad_w += np.clip(target_w - self.pad_w, -12, 12)
        target = None
        # power-ups that need attention now
        catch_y = PADDLE_TOP - PU_R
        best = None
        for p in self.powerups:
            if p['kind'] == 'minus' or p['y'] > PADDLE_TOP:
                continue
            tp = (catch_y - p['y']) / p['vy']
            need = abs(p['x'] - self.pad_c) / PAD_VMAX
            if need >= tp - 25:
                if best is None or tp < best[0]:
                    best = (tp, p['x'])
        if best is not None:
            target = best[1]
        else:
            below = (self.y > FIELD_BOTTOM) & (self.vy > 0) & (self.y < PADDLE_TOP - 6)
            if below.any():
                tb = (PADDLE_TOP - 6 - self.y[below]) / self.vy[below]
                xl = self.x[below] + self.vx[below] * tb
                lo, hi = XE0 + P, XE0 + P * (COLS - 1)
                span = hi - lo
                u = np.mod(xl - lo, 2 * span)
                xl = lo + np.where(u > span, 2 * span - u, u)
                k = int(np.argmin(tb))
                target = float(xl[k])
        if target is None:
            return
        half = self.pad_w / 2
        target = min(max(target, PAD_MIN_X + half), PAD_MAX_X - half)
        d = target - self.pad_c
        self.pad_c += float(np.clip(d * 0.35, -PAD_VMAX, PAD_VMAX))
        self.pad_c = min(max(self.pad_c, PAD_MIN_X + half), PAD_MAX_X - half)

    # ---------- main ----------
    def step(self):
        nb = len(self.broken_log)
        self.step_balls()
        new = [(r, c) for (_, r, c, _) in self.broken_log[nb:]]
        self.spawn_scheduled(new)
        self.step_powerups()
        self.step_paddle()
        self.frame += 1

    def bricks_left(self):
        return int(((self.G == BRICK) | (self.G == GATE)).sum())


ENTRY_N = (cell_x(6), FIELD_BOTTOM + 4.5)
ENTRY_B = (cell_x(28), FIELD_BOTTOM + 4.5)

SCHEDULE = [
    (18.8, 'wide'), (19.8, 'x3'), (20.6, 'x3'), (21.3, '+3'),
    (25.0, '+3'), (25.9, 'x3'), (26.5, 'x3'),
    (29.0, 'star'), (32.2, 'star'), (32.6, '+3'), (34.5, 'x3'), (37.5, 'star'),
    (44.5, 'wide'), (50.0, 'x3'), (51.95, 'minus'),
]


def first_gate_frames(aN, aB, maxf=1400):
    s = Sim([(ENTRY_N[0], ENTRY_N[1], aN), (ENTRY_B[0], ENTRY_B[1], aB)], [])
    gn = gb = None
    while s.frame < maxf and (gn is None or gb is None):
        nb = len(s.broken_log)
        s.step()
        for (f, r, c, k) in s.broken_log[nb:]:
            if c < 25 and gn is None:
                gn = f
            if c >= 25 and gb is None:
                gb = f
    return gn, gb
