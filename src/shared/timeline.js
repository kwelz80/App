// Shared deterministic timeline. Imported by the browser renderer AND by
// scripts/bake.mjs (Node). Everything here is a pure function of time `t`
// (seconds) so any frame can be rendered in any order.

export const FPS = 60;
export const DURATION = 60;
export const FRAMES = FPS * DURATION; // 3600
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const ANC_SNAP = 1.5; // the "noise-canceling" moment

// ---------------------------------------------------------------- helpers
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mix = (a, b, k) => a + (b - a) * k;
export function smoothstep(a, b, x) {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
}
export const easeInOutSine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);

// mulberry32: tiny seeded PRNG, identical output in every JS engine.
export function prng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- breathing
// Hidden 10 s asymmetric cycle: 4 s inhale (0 -> 1), 6 s exhale (1 -> 0).
// First inhale starts exactly at the ANC snap.
export const BREATH_PERIOD = 10;
export const BREATH_INHALE = 4;
export function breath(t) {
  let u = (t - ANC_SNAP) % BREATH_PERIOD;
  if (u < 0) u += BREATH_PERIOD;
  if (u < BREATH_INHALE) return easeInOutSine(u / BREATH_INHALE);
  return 1 - easeInOutSine((u - BREATH_INHALE) / (BREATH_PERIOD - BREATH_INHALE));
}

// Playback speed of all procedural motion. Before the snap the world is
// fast and restless; after it everything drops into slow motion, breathes,
// and keeps slowing toward the finale.
export function motionSpeed(t) {
  const pre = 1 + 0.9 * (1 - smoothstep(ANC_SNAP, ANC_SNAP + 0.4, t));
  const settle = mix(1.0, 0.55, smoothstep(34, 56, t));
  return pre * settle * (1 + 0.35 * breath(t));
}

// flowTime(t) = integral of motionSpeed. Tabulated once at 1200 Hz so the
// browser and the Node bake get bit-identical values.
const FT_RATE = 1200;
const FT_TABLE = (() => {
  const n = DURATION * FT_RATE + 2;
  const tab = new Float64Array(n);
  let acc = 0;
  let prev = motionSpeed(0);
  for (let i = 1; i < n; i++) {
    const s = motionSpeed(i / FT_RATE);
    acc += 0.5 * (prev + s) / FT_RATE;
    tab[i] = acc;
    prev = s;
  }
  return tab;
})();
export function flowTime(t) {
  const x = clamp(t, 0, DURATION) * FT_RATE;
  const i = Math.min(Math.floor(x), FT_TABLE.length - 2);
  return mix(FT_TABLE[i], FT_TABLE[i + 1], x - i);
}

// ---------------------------------------------------------------- scenes
// Crossfade weights. Overlaps are deliberate: no hard cuts anywhere.
const win = (t, a0, a1, b0, b1) => smoothstep(a0, a1, t) * (1 - smoothstep(b0, b1, t));
export function scenes(t) {
  return {
    liquid: 1 - smoothstep(5.0, 7.8, t),            // 0:00-0:05 oil & water metaballs
    orbs: win(t, 4.6, 7.2, 19.6, 22.8),             // 0:05-0:20 glass orbs + foil stars + caustics
    beads: win(t, 19.4, 22.4, 33.8, 37.6),          // 0:20-0:35 micro-bead swirl
    sunset: win(t, 33.8, 37.6, 47.2, 50.6),         // 0:35-0:48 aurora dim-down
    void: smoothstep(47.2, 50.6, t),                // 0:48-0:60 prism dust
  };
}

// Eye-relief arc: full brightness until 0:35, glides down, then the void
// is dark on its own. Final fade to black over the last 0.8 s.
export function exposure(t) {
  const dim = mix(1.0, 0.62, smoothstep(34.5, 48.5, t));
  const tail = 1 - smoothstep(59.2, 60.0, t);
  return dim * tail;
}

// Grain + desaturation + jitter before the ANC snap. Returns the radius of
// the expanding "silence" wavefront (normalised screen units, centre = 0,
// corners ~1.15). Pixels inside the radius are clean.
export function snapRadius(t) {
  if (t < ANC_SNAP) return -0.05;
  return mix(-0.05, 1.6, easeOutCubic((t - ANC_SNAP) / 0.42));
}

// Rack-focus pulse that hides every scene seam (0 = sharp, 1 = soft).
export function focusPulse(t) {
  const bump = (c, w) => Math.exp(-Math.pow((t - c) / w, 2));
  return Math.min(1, 0.55 * bump(6.4, 0.9) + 0.6 * bump(21.0, 1.1) + 0.7 * bump(35.7, 1.3) + 0.6 * bump(48.9, 1.2));
}

// ---------------------------------------------------------------- text
export const TEXT_CUES = [
  { id: 'hook', lines: ['shut the world off', 'for 60 seconds'], start: 1.8, end: 5.5, fadeIn: 0.7, fadeOut: 0.8 },
  { id: 'jaw', lines: ['unclench your jaw.', 'drop your shoulders.'], start: 50.0, end: 55.0, fadeIn: 1.1, fadeOut: 1.0 },
  { id: 'bye', lines: ['see you next time.'], start: 56.0, end: 59.5, fadeIn: 1.0, fadeOut: 0.9 },
];
export function textOpacity(cue, t) {
  if (t <= cue.start || t >= cue.end) return 0;
  const a = smoothstep(cue.start, cue.start + cue.fadeIn, t);
  const b = 1 - smoothstep(cue.end - cue.fadeOut, cue.end, t);
  return a * b;
}

// ---------------------------------------------------------------- metaballs
// 2-D blob fields in screen space: y in [-1, 1], x in [-ASPECT, ASPECT].
export const ASPECT = WIDTH / HEIGHT; // 0.5625

// Hook liquid: warm gold / cyan / magenta oil droplets.
export const LIQUID_BLOBS = [
  // [radius, cx, cy, ax, ay, wx, wy, px, py, tint(0 gold,1 cyan,2 magenta)]
  [0.150, -0.18, 0.34, 0.16, 0.20, 0.31, 0.23, 0.0, 1.2, 0],
  [0.125, 0.22, 0.12, 0.17, 0.24, 0.27, 0.19, 2.1, 0.4, 1],
  [0.140, -0.08, -0.30, 0.20, 0.18, 0.23, 0.29, 4.0, 2.6, 2],
  [0.105, 0.26, -0.55, 0.14, 0.16, 0.35, 0.25, 1.3, 5.0, 0],
  [0.115, -0.28, -0.05, 0.13, 0.28, 0.29, 0.21, 3.3, 3.9, 1],
  [0.095, 0.06, 0.66, 0.20, 0.14, 0.37, 0.33, 5.2, 0.9, 2],
  [0.080, -0.32, 0.70, 0.10, 0.16, 0.41, 0.27, 0.7, 2.2, 1],
  [0.075, 0.32, 0.44, 0.12, 0.18, 0.33, 0.39, 2.9, 4.4, 0],
  [0.070, -0.30, -0.70, 0.12, 0.15, 0.39, 0.31, 1.9, 0.2, 2],
  [0.060, 0.12, -0.82, 0.16, 0.10, 0.43, 0.37, 4.6, 3.3, 1],
];

// Bead-scene background: large soft translucent current blobs.
export const CURRENT_BLOBS = [
  [0.175, -0.20, 0.50, 0.26, 0.32, 0.23, 0.17, 0.4, 1.0, 0],
  [0.150, 0.22, -0.05, 0.24, 0.36, 0.19, 0.25, 2.2, 3.1, 1],
  [0.165, -0.18, -0.55, 0.22, 0.30, 0.27, 0.18, 4.4, 0.3, 2],
  [0.135, 0.24, 0.62, 0.20, 0.26, 0.29, 0.21, 1.1, 4.8, 1],
  [0.145, 0.02, 0.05, 0.34, 0.44, 0.17, 0.15, 3.6, 2.5, 0],
];

export function blobCenter(b, ft) {
  return [b[1] + b[3] * Math.sin(b[5] * ft + b[7]), b[2] + b[4] * Math.sin(b[6] * ft + b[8])];
}
export function blobField(blobs, centers, x, y) {
  let f = 0;
  for (let i = 0; i < blobs.length; i++) {
    const dx = x - centers[i][0];
    const dy = y - centers[i][1];
    f += (blobs[i][0] * blobs[i][0]) / (dx * dx + dy * dy + 1e-6);
  }
  return f;
}
// Liquid motion runs on its own clock offset so the hook opens on a
// pleasing arrangement; current blobs drift slower.
export const liquidClock = (t) => flowTime(t) * 0.55 + 3.0;
export const currentClock = (t) => flowTime(t) * 0.42 + 11.0;

// ---------------------------------------------------------------- swirl
// Micro-bead vortex: global rotation angle (also drives rainstick panning).
export const swirlAngle = (t) => flowTime(t) * 0.32;

// ---------------------------------------------------------------- audio
export const PENTATONIC = [62, 64, 66, 69, 71, 74, 76, 78, 81]; // D major pentatonic, MIDI
export const CHIME_WINDOW = [5.0, 35.0];
