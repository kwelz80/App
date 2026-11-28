// Deterministic physics + event bake.
// Output: build/bake.json — orb/star trajectories sampled per video frame and
// the exact timestamps of every orb collision and metaball merge. The
// renderer interpolates these tracks; the audio synth fires chimes on them.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FPS, FRAMES, DURATION, prng, flowTime, breath, scenes, clamp,
  LIQUID_BLOBS, CURRENT_BLOBS, blobCenter, blobField, liquidClock, currentClock,
  swirlAngle, PENTATONIC, CHIME_WINDOW, ASPECT,
} from '../src/shared/timeline.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIM_HZ = 600;
const SUB = SIM_HZ / FPS;
const T0 = 4.4;   // orbs exist from here...
const T1 = 23.0;  // ...to here

// World units: camera at z=10, fov 35 -> visible half-height 3.153 at z=0.
const HALF_H = 3.153;
const HALF_W = HALF_H * ASPECT;
const Z_MIN = -1.3;
const Z_MAX = 0.7;

const rand = prng(20261128);
const ORB_RADII = [0.60, 0.54, 0.49, 0.45, 0.41, 0.38, 0.35, 0.32, 0.29];
const STAR_COUNT = 6;
const STAR_R = 0.30;

const bodies = [];
function place(r, kind, idx) {
  for (let tries = 0; tries < 5000; tries++) {
    const p = [
      (rand() * 2 - 1) * (HALF_W - r * 0.6),
      (rand() * 2 - 1) * (HALF_H - r * 1.4),
      Z_MIN + r + rand() * (Z_MAX - Z_MIN - 2 * r),
    ];
    if (bodies.every((b) => Math.hypot(p[0] - b.p[0], p[1] - b.p[1], p[2] - b.p[2]) > b.r + r + 0.08)) {
      return {
        kind, idx, r, p, v: [(rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2, 0],
        m: r * r * r,
        // slow wander target (Lissajous) so paths cross and bodies meet
        wa: [0.55 + rand() * 0.6, 1.3 + rand() * 1.0, 0.4 + rand() * 0.4],
        ww: [0.21 + rand() * 0.17, 0.16 + rand() * 0.14, 0.19 + rand() * 0.15],
        wp: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
        wc: [p[0] * 0.5, p[1] * 0.5],
      };
    }
  }
  throw new Error('could not place body');
}
ORB_RADII.forEach((r, i) => bodies.push(place(r, 'orb', i)));
for (let i = 0; i < STAR_COUNT; i++) bodies.push(place(STAR_R, 'star', i));

// Gentle water current (divergence-light swirl field).
function current(p, ft) {
  return [
    0.10 * Math.sin(0.9 * p[1] + 0.35 * ft) + 0.05 * Math.sin(1.7 * p[2] - 0.2 * ft),
    0.07 * Math.cos(0.8 * p[0] - 0.3 * ft) + 0.025,
    0.05 * Math.sin(0.7 * p[0] + 0.6 * p[1] + 0.25 * ft),
  ];
}

const events = [];
const contact = new Set();
const orbTrack = [];   // [frame][orb] -> x,y,z
const starTrack = [];
const trackStart = Math.round(T0 * FPS);
const trackEnd = Math.round(T1 * FPS);

function stepPhysics(t, dft) {
  for (const b of bodies) {
    const tgt = [
      b.wc[0] + b.wa[0] * Math.sin(b.ww[0] * flowTime(t) + b.wp[0]),
      b.wc[1] + b.wa[1] * Math.sin(b.ww[1] * flowTime(t) + b.wp[1]),
      mix3(Z_MIN, Z_MAX, 0.5 + 0.5 * Math.sin(b.ww[2] * flowTime(t) + b.wp[2])),
    ];
    const c = current(b.p, flowTime(t));
    for (let k = 0; k < 3; k++) {
      let a = 0.22 * (tgt[k] - b.p[k]) + 0.9 * (c[k] - b.v[k]);
      b.v[k] += a * dft;
    }
    // soft walls
    const lim = [HALF_W + b.r * 0.2, HALF_H - b.r * 0.3];
    for (let k = 0; k < 2; k++) {
      const over = Math.abs(b.p[k]) - (lim[k] - b.r);
      if (over > 0) b.v[k] -= Math.sign(b.p[k]) * over * 3.0 * dft;
    }
    if (b.p[2] - b.r < Z_MIN) b.v[2] += (Z_MIN - (b.p[2] - b.r)) * 3 * dft;
    if (b.p[2] + b.r > Z_MAX) b.v[2] -= ((b.p[2] + b.r) - Z_MAX) * 3 * dft;
  }
  for (const b of bodies) for (let k = 0; k < 3; k++) b.p[k] += b.v[k] * dft;

  // sphere-sphere contacts
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      const d = [B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]];
      const dist = Math.hypot(d[0], d[1], d[2]);
      const minD = A.r + B.r;
      const key = i * 64 + j;
      if (dist < minD) {
        const n = d.map((x) => x / dist);
        const rv = (B.v[0] - A.v[0]) * n[0] + (B.v[1] - A.v[1]) * n[1] + (B.v[2] - A.v[2]) * n[2];
        if (!contact.has(key)) {
          contact.add(key);
          if (rv < -0.015) onContact(t, A, B, -rv, n);
        }
        if (rv < 0) {
          const e = 0.45;
          const jimp = (-(1 + e) * rv) / (1 / A.m + 1 / B.m);
          for (let k = 0; k < 3; k++) {
            A.v[k] -= (jimp / A.m) * n[k];
            B.v[k] += (jimp / B.m) * n[k];
          }
        }
        const pen = minD - dist;
        const wa = (1 / A.m) / (1 / A.m + 1 / B.m);
        for (let k = 0; k < 3; k++) {
          A.p[k] -= n[k] * pen * wa;
          B.p[k] += n[k] * pen * (1 - wa);
        }
      } else if (dist > minD + 0.01) {
        contact.delete(key);
      }
    }
  }
}
function mix3(a, b, k) { return a + (b - a) * k; }

// Orb notes: biggest orb = lowest pitch.
const orbNote = (i) => PENTATONIC[i];

function onContact(t, A, B, speed, n) {
  const p = [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2, (A.p[2] + B.p[2]) / 2];
  const type = A.kind === 'orb' && B.kind === 'orb' ? 'orb_collide' : 'star_touch';
  events.push({
    t: +t.toFixed(5),
    frame: Math.round(t * FPS),
    type,
    a: `${A.kind}${A.idx}`,
    b: `${B.kind}${B.idx}`,
    notes: type === 'orb_collide' ? [orbNote(A.idx), orbNote(B.idx)] : [],
    velocity: +clamp(speed / 0.3, 0.12, 1).toFixed(3),
    pan: +clamp(p[0] / HALF_W, -1, 1).toFixed(3),
    pos: p.map((x) => +x.toFixed(4)),
  });
}

// ------------------------------------------------------------ metaball merges
function connected(blobs, centers, i, j, iso) {
  const [ax, ay] = centers[i];
  const [bx, by] = centers[j];
  let minF = Infinity;
  for (let s = 1; s < 40; s++) {
    const k = s / 40;
    minF = Math.min(minF, blobField(blobs, centers, ax + (bx - ax) * k, ay + (by - ay) * k));
  }
  return minF >= iso;
}
function scanMerges(blobs, clock, iso, label, notesFor, [tA, tB]) {
  const state = new Map();
  for (let s = Math.round(tA * SIM_HZ); s <= tB * SIM_HZ; s++) {
    const t = s / SIM_HZ;
    const ft = clock(t);
    const centers = blobs.map((b) => blobCenter(b, ft));
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const key = i * 16 + j;
        // hysteresis: join at iso, split only below 0.85*iso
        const was = state.get(key);
        const c = connected(blobs, centers, i, j, was ? iso * 0.85 : iso);
        if (c && was === false) {
          const x = (centers[i][0] + centers[j][0]) / 2;
          events.push({
            t: +t.toFixed(5), frame: Math.round(t * FPS), type: label,
            a: `${label}${i}`, b: `${label}${j}`,
            notes: notesFor(i, j), velocity: 0.45,
            pan: +clamp(x / ASPECT, -1, 1).toFixed(3),
            pos: [+x.toFixed(4), +((centers[i][1] + centers[j][1]) / 2).toFixed(4), 0],
          });
        }
        state.set(key, c);
      }
    }
  }
}
// Liquid merges sit high and bright; current merges sit in the middle.
scanMerges(LIQUID_BLOBS, liquidClock, 1.0, 'liquid_merge', (i, j) => [PENTATONIC[5 + (i % 4)], PENTATONIC[5 + (j % 4)]], [0, 8]);
scanMerges(CURRENT_BLOBS, currentClock, 1.0, 'current_merge', (i, j) => [PENTATONIC[3 + (i % 5)]], [18, 38]);

// ------------------------------------------------------------ run physics
for (let f = trackStart; f <= trackEnd; f++) {
  if (f > trackStart) {
    for (let s = 0; s < SUB; s++) {
      const t0 = (f - 1) / FPS + s / SIM_HZ;
      const dft = flowTime(t0 + 1 / SIM_HZ) - flowTime(t0);
      stepPhysics(t0 + 1 / SIM_HZ, dft);
    }
  }
  orbTrack.push(bodies.filter((b) => b.kind === 'orb').flatMap((b) => b.p.map((x) => +x.toFixed(5))));
  starTrack.push(bodies.filter((b) => b.kind === 'star').flatMap((b) => b.p.map((x) => +x.toFixed(5))));
}

// ------------------------------------------------------------ chime selection
// A chime fires for orb collisions and metaball merges that happen while the
// owning scene is clearly on screen and inside 0:05-0:35.
events.sort((a, b) => a.t - b.t);
let lastChime = -1;
for (const e of events) {
  const w = scenes(e.t);
  const visible =
    (e.type === 'orb_collide' && w.orbs > 0.35) ||
    (e.type === 'liquid_merge' && w.liquid > 0.35) ||
    (e.type === 'current_merge' && w.beads > 0.5);
  e.chime = visible && e.notes.length > 0 && e.t >= CHIME_WINDOW[0] && e.t <= CHIME_WINDOW[1];
  // Keep it calm: events closer than 0.3 s to the previous chime stay
  // silent (still logged), anything inside 0.6 s plays softer.
  if (e.chime) {
    if (e.t - lastChime < 0.3) e.chime = false;
    else {
      if (e.t - lastChime < 0.6) e.velocity = +(e.velocity * 0.6).toFixed(3);
      lastChime = e.t;
    }
  }
}

// ------------------------------------------------------------ per-frame curves
const curves = { breath: [], flow: [], swirlPan: [] };
for (let f = 0; f <= FRAMES; f++) {
  const t = f / FPS;
  curves.breath.push(+breath(t).toFixed(5));
  curves.flow.push(+flowTime(t).toFixed(5));
  curves.swirlPan.push(+Math.sin(swirlAngle(t)).toFixed(5));
}

const out = {
  version: 1,
  fps: FPS,
  frames: FRAMES,
  orbs: { radii: ORB_RADII, notes: ORB_RADII.map((_, i) => orbNote(i)), startFrame: trackStart, track: orbTrack },
  stars: { radius: STAR_R, startFrame: trackStart, track: starTrack },
  anc: { t: 1.5 },
  events,
  curves,
};
mkdirSync(resolve(root, 'build'), { recursive: true });
writeFileSync(resolve(root, 'build/bake.json'), JSON.stringify(out));

const chimes = events.filter((e) => e.chime);
console.log(`bake: ${events.length} events, ${chimes.length} chimes`);
for (const e of events) {
  console.log(`  ${e.t.toFixed(3).padStart(7)}s  f${String(e.frame).padStart(4)}  ${e.type.padEnd(13)} ${e.a}+${e.b}${e.chime ? '  ♪ ' + e.notes.join(',') + ' v' + e.velocity : ''}`);
}
