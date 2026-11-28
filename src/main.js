// "shut the world off" — deterministic WebGL renderer.
// window.renderAtTime(seconds) draws exactly one frame as a pure function of
// time plus the baked physics in build/bake.json. No clocks, no Math.random.
import * as THREE from 'three';
import * as TL from './shared/timeline.js';
import * as S from './gl/shaders.js';

const params = new URLSearchParams(location.search);
const SCALE = parseFloat(params.get('scale') || '1');
const W = Math.round(TL.WIDTH * SCALE);
const H = Math.round(TL.HEIGHT * SCALE);
const MSAA = parseInt(params.get('msaa') || '4', 10);

const canvas = document.getElementById('c');
canvas.width = W;
canvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.autoClear = false;
renderer.setClearColor(0x000000, 1);

const bake = await (await fetch('../build/bake.json')).json();

// ------------------------------------------------------------------ targets
const rt = (w, h, depth = false, samples = 0) =>
  new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: depth, samples, generateMipmaps: false,
  });
const farRT = rt(W, H, true, 0);
const farBlurRT = rt(W / 2, H / 2);
const mainRT = rt(W, H, true, MSAA);
const rackRT = rt(W / 2, H / 2);
const bA = rt(W / 4, H / 4), bA2 = rt(W / 4, H / 4);
const bB = rt(W / 8, H / 8), bB2 = rt(W / 8, H / 8);
const bC = rt(W / 16, H / 16), bC2 = rt(W / 16, H / 16);

// ------------------------------------------------------------------ passes
const quadGeo = new THREE.PlaneGeometry(2, 2);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function makePass(frag, uniforms) {
  const m = new THREE.RawShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: frag, uniforms, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(quadGeo, m);
  mesh.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(mesh);
  return { m, sc, u: m.uniforms };
}
function run(pass, target) {
  renderer.setRenderTarget(target);
  renderer.render(pass.sc, orthoCam);
}
const v4arr = (n) => Array.from({ length: n }, () => new THREE.Vector4());

const bgPass = makePass(S.BG_FRAG, {
  uTime: { value: 0 }, uBreath: { value: 0 }, uLiqT: { value: 0 }, uCurT: { value: 0 }, uFlow: { value: 0 },
  uW1: { value: new THREE.Vector4() }, uW5: { value: 0 },
  uLiquid: { value: v4arr(10) }, uCurrent: { value: v4arr(5) },
});
const discPass = makePass(S.DISC_BLUR_FRAG, { uTex: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0 } });
const gaussPass = makePass(S.GAUSS_FRAG, { uTex: { value: null }, uDir: { value: new THREE.Vector2() } });
const brightPass = makePass(S.BRIGHT_FRAG, { uTex: { value: null }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) }, uThreshold: { value: 0.8 } });
const compPass = makePass(S.COMPOSITE_FRAG, { uFar: { value: farRT.texture }, uFarBlur: { value: farBlurRT.texture }, uFarAmt: { value: 0 }, uSnapR: { value: 0 } });
const finalPass = makePass(S.FINAL_FRAG, {
  uMain: { value: mainRT.texture }, uRack: { value: rackRT.texture },
  uBloomA: { value: bA.texture }, uBloomB: { value: bB.texture }, uBloomC: { value: bC.texture },
  uText: { value: null }, uRes: { value: new THREE.Vector2(W, H) },
  uRackAmt: { value: 0 }, uExposure: { value: 1 }, uBloomStr: { value: 0.4 }, uSnapR: { value: 0 },
  uFrame: { value: 0 }, uProgress: { value: 0 }, uTextAlpha: { value: 0 }, uTextShift: { value: 0 }, uGlobalCA: { value: 0.0035 },
});

// ------------------------------------------------------------------ 3-D
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const farScene = new THREE.Scene();
const nearScene = new THREE.Scene();
const HALF_H0 = Math.tan(THREE.MathUtils.degToRad(17.5)) * 10;
const halfHAt = (z) => Math.tan(THREE.MathUtils.degToRad(17.5)) * (10 - z);

const sceneSampler = () => ({ uFar: { value: farRT.texture }, uFarBlur: { value: farBlurRT.texture }, uFarAmt: { value: 0 } });
function meshMat(frag, uniforms, { instanced = false, transparent = true, blending = THREE.NormalBlending, side = THREE.FrontSide } = {}) {
  return new THREE.RawShaderMaterial({
    vertexShader: S.MESH_VERT, fragmentShader: frag, uniforms, glslVersion: THREE.GLSL3,
    defines: instanced ? { INSTANCED: '' } : {}, transparent, blending, side, depthWrite: true, depthTest: true,
  });
}

const rnd = TL.prng(77);
const R = () => rnd();

// ---- glass orbs (physics driven)
const ORB_N = bake.orbs.radii.length;
const RIBBONS = [[1.0, 0.7, 0.25], [0.2, 0.85, 1.0], [1.0, 0.3, 0.75], [0.6, 0.4, 1.0], [0.35, 1.0, 0.7], [1.0, 0.5, 0.4], [0.4, 0.7, 1.0], [1.0, 0.45, 0.65], [0.8, 1.0, 0.4]];
const orbGeo = new THREE.SphereGeometry(1, 96, 64);
const orbs = [];
for (let i = 0; i < ORB_N; i++) {
  const mat = meshMat(S.GLASS_FRAG, {
    ...sceneSampler(), uCamObj: { value: new THREE.Vector3() }, uCenterUV: { value: new THREE.Vector2() },
    uOpacity: { value: 1 }, uDissolve: { value: 0 }, uSeed: { value: R() }, uTime: { value: 0 }, uCausT: { value: 0 },
    uBreath: { value: 0 }, uRibbon: { value: new THREE.Vector3(...RIBBONS[i % RIBBONS.length]) },
  });
  const m = new THREE.Mesh(orbGeo, mat);
  m.renderOrder = 2;
  nearScene.add(m);
  orbs.push({ mesh: m, r: bake.orbs.radii[i], delay: R() * 1.1, axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), phase: R() * 6.28 });
}

// ---- holographic foil stars
function starShape(outer, inner, points = 5) {
  const s = new THREE.Shape();
  for (let k = 0; k < points * 2; k++) {
    const a = (k / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const rr = k % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (k === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
const bigStarGeo = new THREE.ExtrudeGeometry(starShape(1, 0.48), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 3, curveSegments: 1 });
bigStarGeo.center();
bigStarGeo.computeVertexNormals();
const holoUniforms = (useEnv = 1) => ({ ...sceneSampler(), uTime: { value: 0 }, uOpacity: { value: 1 }, uSeed: { value: R() * 10 }, uGlint: { value: 1 }, uDissolve: { value: 0 }, uUseEnv: { value: useEnv } });
const stars = [];
for (let i = 0; i < bake.stars.track[0].length / 3; i++) {
  const m = new THREE.Mesh(bigStarGeo, meshMat(S.HOLO_FRAG, holoUniforms(1), { side: THREE.DoubleSide }));
  m.renderOrder = 2;
  nearScene.add(m);
  stars.push({ mesh: m, delay: R() * 1.0, axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() * 0.3).normalize(), phase: R() * 6.28, spin: 0.25 + R() * 0.2 });
}

// ---- instanced helpers
function instanced(geo, mat, count, scene, order = 3) {
  const g = geo.clone();
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute('iData2', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
  const m = new THREE.InstancedMesh(g, mat, count);
  m.frustumCulled = false;
  m.renderOrder = order;
  scene.add(m);
  return m;
}
const PASTEL = [[0.62, 0.95, 0.85], [1.0, 0.78, 0.66], [0.80, 0.70, 1.0], [0.66, 0.86, 1.0], [1.0, 0.93, 0.62], [1.0, 0.72, 0.86]];
const NEON = [[1.0, 0.12, 0.62], [0.05, 0.92, 1.0], [0.55, 1.0, 0.15], [0.62, 0.22, 1.0], [1.0, 0.55, 0.05]];
function beadColor() {
  const neon = R() < 0.4;
  const c = neon ? NEON[Math.floor(R() * NEON.length)] : PASTEL[Math.floor(R() * PASTEL.length)];
  return { c, neon };
}

// ---- micro-beads
const beadGeo = new THREE.SphereGeometry(1, 20, 14);
const beadNearMat = meshMat(S.BEAD_FRAG, { ...sceneSampler(), uOpacity: { value: 1 }, uSampleBg: { value: 1 } }, { instanced: true });
const beadFarMat = meshMat(S.BEAD_FRAG, { ...sceneSampler(), uOpacity: { value: 1 }, uSampleBg: { value: 0 } }, { instanced: true });
const VORTICES = [
  { c: [0.05, 1.15, 0.1], dir: 1 },
  { c: [-0.05, -1.35, 0.0], dir: -1 },
];
function makeBeads(count, far) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const { c, neon } = beadColor();
    const v = i % 2;
    const orb = i % ORB_N;
    list.push({
      v, c, neon,
      r: far ? 0.5 + Math.sqrt(R()) * 2.4 : 0.15 + Math.sqrt(R()) * 1.75,
      th: R() * Math.PI * 2,
      h: (R() - 0.5) * (far ? 1.6 : 1.1),
      size: far ? 0.06 + R() * 0.05 : 0.038 + Math.pow(R(), 1.6) * 0.055,
      orb, off: randInBall(), delay: orbs[orb].delay + R() * 0.6,
      wob: R() * 6.28,
    });
  }
  return list;
}
function randInBall() {
  for (;;) {
    const v = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
    if (v.lengthSq() <= 1) return v;
  }
}
const beadsNear = makeBeads(390, false);
const beadsFar = makeBeads(240, true);
const beadNearMesh = instanced(beadGeo, beadNearMat, beadsNear.length, nearScene);
const beadFarMesh = instanced(beadGeo, beadFarMat, beadsFar.length, farScene);
for (const [mesh, list] of [[beadNearMesh, beadsNear], [beadFarMesh, beadsFar]]) {
  const d = mesh.geometry.attributes.iData.array, d2 = mesh.geometry.attributes.iData2.array;
  list.forEach((b, i) => { d.set([...b.c, 0], i * 4); d2.set([R(), 1, b.neon ? 1 : 0, 0], i * 4); });
}

// ---- star confetti
const smallStarGeo = new THREE.ExtrudeGeometry(starShape(1, 0.5), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 1 });
smallStarGeo.center();
const confNearMat = meshMat(S.HOLO_FRAG, holoUniforms(1), { instanced: true, side: THREE.DoubleSide });
const confFarMat = meshMat(S.HOLO_FRAG, holoUniforms(0), { instanced: true, side: THREE.DoubleSide });
function makeConfetti(count, far) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      v: i % 2, r: far ? 0.6 + Math.sqrt(R()) * 2.3 : 0.25 + Math.sqrt(R()) * 1.65, th: R() * Math.PI * 2,
      h: (R() - 0.5) * (far ? 1.6 : 1.1), size: far ? 0.09 + R() * 0.05 : 0.06 + R() * 0.045,
      star: i % 6, off: randInBall(), delay: R() * 1.2,
      axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), spin: 0.6 + R() * 1.4, phase: R() * 6.28,
      // far confetti also drifts through the orb scene
      p0: [(R() - 0.5) * 5.5, (R() - 0.5) * 9.5, -2.5 - R() * 4.5],
    });
  }
  return list;
}
const confNear = makeConfetti(120, false);
const confFar = makeConfetti(70, true);
const confNearMesh = instanced(smallStarGeo, confNearMat, confNear.length, nearScene);
const confFarMesh = instanced(smallStarGeo, confFarMat, confFar.length, farScene);
// Far-layer materials render INTO farRT, so they must never bind it.
const dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
dummyTex.needsUpdate = true;
for (const m of [beadFarMat, confFarMat]) { m.uniforms.uFar.value = dummyTex; m.uniforms.uFarBlur.value = dummyTex; }
for (const [mesh, list] of [[confNearMesh, confNear], [confFarMesh, confFar]]) {
  const d2 = mesh.geometry.attributes.iData2.array;
  list.forEach((c, i) => d2.set([R() * 10, 1, 0, 0], i * 4));
}

// ---- prism crystals
const crystalGeo = new THREE.OctahedronGeometry(1, 0);
crystalGeo.scale(0.75, 1.25, 0.75);
const prismNearMat = meshMat(S.PRISM_FRAG, { uOpacity: { value: 1 }, uTime: { value: 0 } }, { instanced: true, side: THREE.DoubleSide });
const prismFarMat = meshMat(S.PRISM_FRAG, { uOpacity: { value: 1 }, uTime: { value: 0 } }, { instanced: true, side: THREE.DoubleSide });
function makeCrystals(count, far) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const z = far ? -3 - R() * 7 : -1.6 + R() * 3.2;
    const hh = halfHAt(z);
    list.push({
      p: [(R() * 2 - 1) * hh * TL.ASPECT * 1.1, (R() * 2 - 1) * hh * 1.08, z], hh,
      vel: [(R() - 0.5) * 0.04, 0.02 + R() * 0.035, (R() - 0.5) * 0.02],
      size: far ? 0.025 + R() * 0.025 : 0.014 + Math.pow(R(), 2) * 0.03,
      axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), spin: 0.25 + R() * 0.6, phase: R() * 6.28,
    });
  }
  return list;
}
const crystNear = makeCrystals(190, false);
const crystFar = makeCrystals(160, true);
const crystNearMesh = instanced(crystalGeo, prismNearMat, crystNear.length, nearScene);
const crystFarMesh = instanced(crystalGeo, prismFarMat, crystFar.length, farScene);
for (const [mesh, list] of [[crystNearMesh, crystNear], [crystFarMesh, crystFar]]) {
  const d2 = mesh.geometry.attributes.iData2.array;
  list.forEach((c, i) => d2.set([R(), 1, 0, 0], i * 4));
}

// ---- sprites (instanced billboards with circle-of-confusion)
const spriteBase = new THREE.PlaneGeometry(2, 2);
function spriteSet(count, aperture, focus = 10) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = spriteBase.index;
  g.setAttribute('position', spriteBase.attributes.position);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const iCol = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  const iParam = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  g.setAttribute('iPos', iPos); g.setAttribute('iCol', iCol); g.setAttribute('iParam', iParam);
  g.instanceCount = count;
  const mat = new THREE.RawShaderMaterial({
    vertexShader: S.SPRITE_VERT, fragmentShader: S.SPRITE_FRAG, glslVersion: THREE.GLSL3,
    uniforms: { uFocus: { value: focus }, uAperture: { value: aperture }, uGlobalAlpha: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  nearScene.add(mesh);
  return { mesh, iPos, iCol, iParam, count, mat };
}
const spectralJS = (x) => [0, 0.33, 0.67].map((o) => Math.min(1, Math.max(0, 0.5 + 0.5 * Math.cos(2 * Math.PI * (x + o)))));

// water motes (orb scene)
const motes = Array.from({ length: 150 }, () => ({ p: [(R() - 0.5) * 7, (R() - 0.5) * 12, -7 + R() * 11], size: 0.012 + R() * 0.02, v: 0.04 + R() * 0.06, ph: R() * 6.28, c: R() < 0.5 ? [1.0, 0.9, 0.7] : [0.6, 0.95, 1.0], seed: R() }));
const moteSet = spriteSet(motes.length, 0.16);
// bead-scene glints
const glints = Array.from({ length: 110 }, () => ({ v: Math.floor(R() * 2), r: 0.2 + Math.sqrt(R()) * 1.6, th: R() * 6.28, h: (R() - 0.5) * 0.6, size: 0.05 + R() * 0.05, ph: R() * 6.28, k: 0.8 + R() * 1.6, hue: R() }));
const glintSet = spriteSet(glints.length, 0.1);
// sunset bokeh orbs + star lights
const BOKEH_COLS = [[1.0, 0.55, 0.30], [1.0, 0.35, 0.55], [0.85, 0.30, 0.85], [0.55, 0.35, 1.0], [1.0, 0.70, 0.45]];
const bokeh = Array.from({ length: 60 }, () => ({ p: [(R() - 0.5) * 6, (R() - 0.5) * 10, -3 + R() * 9], size: 0.07 + R() * 0.14, v: 0.03 + R() * 0.05, ph: R() * 6.28, c: BOKEH_COLS[Math.floor(R() * BOKEH_COLS.length)], amp: 0.6 + R() * 0.6 }));
const bokehSet = spriteSet(bokeh.length, 0.42, 10);
const starLights = Array.from({ length: 75 }, () => ({ p: [(R() - 0.5) * 4.2, (R() - 0.5) * 7.5, -2.5 + R() * 4], size: 0.035 + R() * 0.05, v: 0.02 + R() * 0.04, ph: R() * 6.28, rot: R() * 6.28, spin: (R() - 0.5) * 0.3, c: BOKEH_COLS[Math.floor(R() * BOKEH_COLS.length)] }));
const starLightSet = spriteSet(starLights.length, 0.22, 10);
// prism sparkles (void)
const sparkles = Array.from({ length: 750 }, () => {
  const z = -7 + R() * 10.5;
  const hh = halfHAt(z);
  return { p: [(R() * 2 - 1) * hh * TL.ASPECT * 1.1, (R() * 2 - 1) * hh * 1.1, z], hh, size: 0.010 + Math.pow(R(), 2.5) * 0.03, v: 0.015 + R() * 0.03, ph: R() * 6.28, k: 0.4 + R() * 1.4, hue: R() };
});
const sparkleSet = spriteSet(sparkles.length, 0.025, 10);

// ------------------------------------------------------------------ text
await (async () => {
  const ff = new FontFace('Nunito', "url('../node_modules/@fontsource/nunito/files/nunito-latin-700-normal.woff2')", { weight: '700' });
  await ff.load();
  document.fonts.add(ff);
})();
const textTex = {};
for (const cue of TL.TEXT_CUES) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const fs = 74 * SCALE;
  ctx.font = `700 ${fs}px Nunito`;
  ctx.letterSpacing = `${0.6 * SCALE}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = fs * 1.24;
  const y0 = H / 2 - ((cue.lines.length - 1) * lh) / 2;
  const draw = (blur, oy, col) => {
    ctx.shadowColor = col; ctx.shadowBlur = blur * SCALE; ctx.shadowOffsetY = oy * SCALE; ctx.shadowOffsetX = 0;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    cue.lines.forEach((ln, i) => ctx.fillText(ln, W / 2, y0 + i * lh));
  };
  draw(70, 0, 'rgba(12,6,24,0.34)');
  draw(22, 2, 'rgba(10,4,20,0.30)');
  draw(5, 2, 'rgba(0,0,0,0.30)');
  ctx.shadowColor = 'transparent';
  draw(0, 0, 'transparent');
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  textTex[cue.id] = tex;
  // record max text width for the safe-zone report
  cue.maxWidthPx = Math.max(...cue.lines.map((l) => ctx.measureText(l).width)) / SCALE;
  cue.blockHeightPx = (cue.lines.length * lh) / SCALE;
}

// ------------------------------------------------------------------ helpers
function trackAt(track, startFrame, t, idx, out) {
  const fi = Math.min(Math.max(t * TL.FPS - startFrame, 0), track.length - 1);
  const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, track.length - 1), k = fi - i0;
  const a = track[i0], b = track[i1];
  out.set(TL.mix(a[idx * 3], b[idx * 3], k), TL.mix(a[idx * 3 + 1], b[idx * 3 + 1], k), TL.mix(a[idx * 3 + 2], b[idx * 3 + 2], k));
  return out;
}
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpM = new THREE.Matrix4(), invM = new THREE.Matrix4();
const wrap = (x, lo, hi) => { const r = hi - lo; return lo + ((((x - lo) % r) + r) % r); };

function swirlPos(b, t, ft, out, far) {
  const vx = VORTICES[b.v];
  const exitK = TL.smoothstep(33.6, 38.0, t);
  const rr = b.r * (1 + 0.07 * TL.breath(t)) * (1 + 0.55 * exitK);
  const omega = (0.62 / (0.45 + b.r)) * vx.dir;
  const th = b.th + omega * ft * 0.55;
  const cz = far ? -3.2 : vx.c[2];
  out.set(
    vx.c[0] * (far ? 1.6 : 1) + rr * Math.cos(th) + 0.07 * Math.sin(ft * 0.35 + b.th * 2.0 + vx.c[1]),
    vx.c[1] * (far ? 1.35 : 1) + b.h + rr * Math.sin(th) * 0.42 + 0.1 * Math.sin(ft * 0.5 + b.th * 3.0),
    cz + rr * Math.sin(th) * 0.7,
  );
  return out;
}

// ------------------------------------------------------------------ frame update
function update(t) {
  const frame = Math.round(t * TL.FPS);
  const w = TL.scenes(t);
  const ft = TL.flowTime(t);
  const br = TL.breath(t);

  // background
  const bu = bgPass.u;
  bu.uTime.value = ft * 1.2;
  bu.uBreath.value = br;
  bu.uLiqT.value = TL.liquidClock(t);
  bu.uCurT.value = TL.currentClock(t);
  bu.uFlow.value = ft;
  bu.uW1.value.set(w.liquid, w.orbs, w.beads, w.sunset);
  bu.uW5.value = w.void;
  const lc = TL.liquidClock(t), cc = TL.currentClock(t);
  TL.LIQUID_BLOBS.forEach((b, i) => { const [x, y] = TL.blobCenter(b, lc); bu.uLiquid.value[i].set(x, y, b[0], b[9]); });
  TL.CURRENT_BLOBS.forEach((b, i) => { const [x, y] = TL.blobCenter(b, cc); bu.uCurrent.value[i].set(x, y, b[0], b[9]); });

  // depth-of-field mix per scene
  const sumW = w.liquid + w.orbs + w.beads + w.sunset + w.void + 1e-6;
  const farAmt = (w.orbs * 0.55 + w.beads * 0.85 + w.sunset * 0.9 + w.void * 0.9) / sumW;
  const farRadius = ((w.orbs * 9 + w.beads * 13 + w.sunset * 16 + w.void * 10) / sumW) * SCALE;
  const snapR = TL.snapRadius(t);
  const preActive = snapR < 1.6;
  state.farAmt = farAmt;
  state.farRadius = preActive ? Math.max(farRadius, 7 * SCALE) : farRadius;
  state.snapR = snapR;
  compPass.u.uFarAmt.value = farAmt;
  compPass.u.uSnapR.value = snapR;
  for (const m of [beadNearMat, beadFarMat, confNearMat, confFarMat, ...orbs.map((o) => o.mesh.material), ...stars.map((s) => s.mesh.material)]) {
    if (m.uniforms.uFarAmt) m.uniforms.uFarAmt.value = farAmt;
  }

  // glass orbs
  const orbVisible = t > 4.5 && t < 23.2;
  orbs.forEach((o, i) => {
    o.mesh.visible = orbVisible;
    if (!orbVisible) return;
    trackAt(bake.orbs.track, bake.orbs.startFrame, t, i, o.mesh.position);
    const uIn = TL.smoothstep(4.7 + o.delay, 6.6 + o.delay, t);
    const uOut = TL.smoothstep(19.5 + o.delay, 21.7 + o.delay, t);
    o.mesh.scale.setScalar(o.r * (0.85 + 0.15 * uIn));
    o.mesh.quaternion.setFromAxisAngle(o.axis, ft * 0.12 + o.phase);
    o.mesh.updateMatrixWorld();
    const u = o.mesh.material.uniforms;
    u.uDissolve.value = Math.max(1 - uIn, uOut);
    u.uOpacity.value = TL.smoothstep(0, 0.25, uIn) * (1 - TL.smoothstep(0.7, 1.0, uOut));
    u.uTime.value = ft;
    u.uCausT.value = ft * 0.85;
    invM.copy(o.mesh.matrixWorld).invert();
    u.uCamObj.value.copy(camera.position).applyMatrix4(invM);
    tmpV.copy(o.mesh.position).project(camera);
    u.uCenterUV.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5);
  });
  stars.forEach((s, i) => {
    s.mesh.visible = orbVisible;
    if (!orbVisible) return;
    trackAt(bake.stars.track, bake.stars.startFrame, t, i, s.mesh.position);
    const uIn = TL.smoothstep(5.0 + s.delay, 6.8 + s.delay, t);
    const uOut = TL.smoothstep(19.4 + s.delay, 21.4 + s.delay, t);
    s.mesh.scale.setScalar(0.27 * (0.7 + 0.3 * uIn));
    // mostly face-on foil with a slow wobble, spinning in the image plane
    tmpE.set(0.55 * Math.sin(ft * 0.37 + s.phase), 0.65 * Math.sin(ft * 0.29 + s.phase * 1.7), ft * s.spin * (i % 2 ? 1 : -1) + s.phase);
    s.mesh.quaternion.setFromEuler(tmpE);
    const u = s.mesh.material.uniforms;
    u.uDissolve.value = Math.max(1 - uIn, uOut) * 0.999;
    u.uOpacity.value = TL.smoothstep(0, 0.3, uIn) * (1 - TL.smoothstep(0.7, 1.0, uOut));
    u.uTime.value = ft;
  });

  // micro-beads: emerge from dissolving orbs, then swirl
  const beadVis = t > 19.3 && t < 38.5;
  beadNearMesh.visible = beadVis;
  beadFarMesh.visible = w.beads > 0.001;
  if (beadVis) {
    beadsNear.forEach((b, i) => {
      const u = TL.smoothstep(19.7 + b.delay, 22.0 + b.delay, t);
      swirlPos(b, t, ft, tmpV, false);
      if (u < 1) {
        trackAt(bake.orbs.track, bake.orbs.startFrame, Math.min(t, 23), b.orb, tmpV2);
        tmpV2.addScaledVector(b.off, orbs[b.orb].r * (0.75 + 0.4 * u));
        tmpV.lerpVectors(tmpV2, tmpV, TL.easeInOutSine(u));
      }
      const s = b.size * TL.smoothstep(0.0, 0.3, u) * (1 - 0.35 * TL.smoothstep(34, 38, t));
      tmpS.setScalar(Math.max(s, 1e-5));
      tmpQ.identity();
      tmpM.compose(tmpV, tmpQ, tmpS);
      beadNearMesh.setMatrixAt(i, tmpM);
    });
    beadNearMesh.instanceMatrix.needsUpdate = true;
    beadNearMat.uniforms.uOpacity.value = t < 30 ? 1 : TL.clamp(w.beads * 1.15);
  }
  if (beadFarMesh.visible) {
    beadsFar.forEach((b, i) => {
      swirlPos(b, t, ft, tmpV, true);
      tmpS.setScalar(b.size);
      tmpM.compose(tmpV, tmpQ.identity(), tmpS);
      beadFarMesh.setMatrixAt(i, tmpM);
    });
    beadFarMesh.instanceMatrix.needsUpdate = true;
    beadFarMat.uniforms.uOpacity.value = w.beads;
  }

  // star confetti: near set bursts out of the big foil stars
  confNearMesh.visible = beadVis;
  if (beadVis) {
    confNear.forEach((c, i) => {
      const u = TL.smoothstep(19.6 + c.delay, 21.9 + c.delay, t);
      swirlPos(c, t, ft, tmpV, false);
      if (u < 1) {
        trackAt(bake.stars.track, bake.stars.startFrame, Math.min(t, 23), c.star, tmpV2);
        tmpV2.addScaledVector(c.off, 0.25);
        tmpV.lerpVectors(tmpV2, tmpV, TL.easeInOutSine(u));
      }
      tmpQ.setFromAxisAngle(c.axis, ft * c.spin + c.phase);
      tmpS.setScalar(c.size * TL.smoothstep(0, 0.3, u));
      tmpM.compose(tmpV, tmpQ, tmpS);
      confNearMesh.setMatrixAt(i, tmpM);
    });
    confNearMesh.instanceMatrix.needsUpdate = true;
    confNearMat.uniforms.uOpacity.value = t < 30 ? 1 : TL.clamp(w.beads * 1.15);
    confNearMat.uniforms.uTime.value = ft;
  }
  const confFarW = Math.max(w.orbs, w.beads);
  confFarMesh.visible = confFarW > 0.001;
  if (confFarMesh.visible) {
    confFar.forEach((c, i) => {
      // during the orb scene they drift; during the bead scene they join the swirl
      tmpV2.set(c.p0[0] + 0.25 * Math.sin(ft * 0.2 + c.phase), wrap(c.p0[1] + ft * 0.05, -5, 5), c.p0[2]);
      swirlPos(c, t, ft, tmpV, true);
      tmpV.lerpVectors(tmpV2, tmpV, TL.smoothstep(19.5, 23.5, t));
      tmpQ.setFromAxisAngle(c.axis, ft * c.spin + c.phase);
      tmpS.setScalar(c.size);
      tmpM.compose(tmpV, tmpQ, tmpS);
      confFarMesh.setMatrixAt(i, tmpM);
    });
    confFarMesh.instanceMatrix.needsUpdate = true;
    confFarMat.uniforms.uOpacity.value = confFarW;
    confFarMat.uniforms.uTime.value = ft;
  }

  // prism crystals
  for (const [mesh, list, mat] of [[crystNearMesh, crystNear, prismNearMat], [crystFarMesh, crystFar, prismFarMat]]) {
    mesh.visible = w.void > 0.001;
    if (!mesh.visible) continue;
    const ex = 1 + 0.05 * br;
    const ftv = ft - TL.flowTime(47);
    list.forEach((c, i) => {
      const hw = c.hh * TL.ASPECT * 1.15;
      tmpV.set(
        wrap(c.p[0] + c.vel[0] * ftv, -hw, hw) * ex,
        wrap(c.p[1] + c.vel[1] * ftv, -c.hh * 1.12, c.hh * 1.12) * ex,
        c.p[2] + c.vel[2] * Math.sin(ftv * 0.3 + c.phase) * 4,
      );
      tmpQ.setFromAxisAngle(c.axis, ftv * c.spin + c.phase);
      tmpS.setScalar(c.size);
      tmpM.compose(tmpV, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mat.uniforms.uOpacity.value = w.void * (mat === prismFarMat ? 0.45 : 1);
    mat.uniforms.uTime.value = ft;
  }

  // sprites
  function fillSprites(set, list, weight, fn) {
    set.mesh.visible = weight > 0.001;
    if (!set.mesh.visible) return;
    set.mat.uniforms.uGlobalAlpha.value = weight;
    list.forEach((it, i) => fn(it, i));
    set.iPos.needsUpdate = set.iCol.needsUpdate = set.iParam.needsUpdate = true;
  }
  fillSprites(moteSet, motes, w.orbs, (m, i) => {
    const hh = halfHAt(m.p[2]) + 0.3;
    moteSet.iPos.array.set([m.p[0] + 0.15 * Math.sin(ft * 0.3 + m.ph), wrap(m.p[1] + m.v * ft, -hh, hh), m.p[2]], i * 3);
    moteSet.iCol.array.set([...m.c, 0.55 * (0.6 + 0.4 * Math.sin(ft * 0.7 + m.ph))], i * 4);
    moteSet.iParam.array.set([3, m.size, 0, m.seed], i * 4);
  });
  fillSprites(glintSet, glints, w.beads, (g, i) => {
    swirlPos(g, t, ft, tmpV, false);
    const tw = Math.pow(0.5 + 0.5 * Math.sin(ft * g.k * 2.2 + g.ph), 8);
    glintSet.iPos.array.set([tmpV.x, tmpV.y, tmpV.z + 0.05], i * 3);
    glintSet.iCol.array.set([...spectralJS(g.hue + ft * 0.05).map((x) => 0.4 + 0.6 * x), 1.6 * tw], i * 4);
    glintSet.iParam.array.set([2, g.size, g.ph, 0], i * 4);
  });
  fillSprites(bokehSet, bokeh, w.sunset, (b, i) => {
    const hh = halfHAt(b.p[2]) + 0.8;
    const ex = 1 + 0.05 * br;
    bokehSet.iPos.array.set([(b.p[0] + 0.2 * Math.sin(ft * 0.15 + b.ph)) * ex, wrap(b.p[1] + b.v * ft, -hh, hh) * ex, b.p[2]], i * 3);
    bokehSet.iCol.array.set([...b.c, 0.95 * b.amp * (0.75 + 0.25 * Math.sin(ft * 0.5 + b.ph))], i * 4);
    bokehSet.iParam.array.set([0, b.size, 0, 0], i * 4);
  });
  fillSprites(starLightSet, starLights, w.sunset, (s, i) => {
    const hh = halfHAt(s.p[2]) + 0.3;
    const ex = 1 + 0.06 * br;
    const tw = 0.55 + 0.45 * Math.sin(ft * 0.9 + s.ph);
    starLightSet.iPos.array.set([(s.p[0] + 0.12 * Math.sin(ft * 0.2 + s.ph)) * ex, wrap(s.p[1] + s.v * ft, -hh, hh) * ex, s.p[2]], i * 3);
    starLightSet.iCol.array.set([...s.c.map((x) => 0.25 + 0.75 * x), 0.55 * tw], i * 4);
    starLightSet.iParam.array.set([1, s.size * (0.9 + 0.1 * tw), s.rot + s.spin * ft, 0], i * 4);
  });
  fillSprites(sparkleSet, sparkles, w.void, (s, i) => {
    const hw = s.hh * TL.ASPECT * 1.12;
    const ex = 1 + 0.05 * br;
    const ftv = ft - TL.flowTime(47);
    const tw = Math.pow(0.5 + 0.5 * Math.sin(ftv * s.k * 1.6 + s.ph), 10);
    sparkleSet.iPos.array.set([wrap(s.p[0] + 0.01 * ftv, -hw, hw) * ex, wrap(s.p[1] + s.v * ftv, -s.hh * 1.12, s.hh * 1.12) * ex, s.p[2]], i * 3);
    sparkleSet.iCol.array.set([...spectralJS(s.hue).map((x) => 0.55 + 0.45 * x), 0.12 + 1.8 * tw], i * 4);
    sparkleSet.iParam.array.set([2, s.size * (0.6 + 0.4 * tw), 0.785 * Math.floor(s.hue * 2), 0], i * 4);
  });

  // final
  const fu = finalPass.u;
  fu.uFrame.value = frame;
  fu.uSnapR.value = snapR;
  fu.uExposure.value = TL.exposure(t);
  fu.uProgress.value = TL.clamp(t / TL.DURATION);
  fu.uRackAmt.value = TL.focusPulse(t);
  const bloomBase = (w.liquid * 0.30 + w.orbs * 0.45 + w.beads * 0.28 + w.sunset * 0.6 + w.void * 0.8) / sumW;
  fu.uBloomStr.value = bloomBase * (1 + 0.35 * br);
  brightPass.u.uThreshold.value = (w.liquid * 0.95 + w.orbs * 0.8 + w.beads * 1.0 + w.sunset * 0.45 + w.void * 0.35) / sumW;
  fu.uTextAlpha.value = 0;
  for (const cue of TL.TEXT_CUES) {
    const a = TL.textOpacity(cue, t);
    if (a > 0) {
      fu.uText.value = textTex[cue.id];
      fu.uTextAlpha.value = a;
      fu.uTextShift.value = 0.006 * (1 - a);
    }
  }
}
const state = {};

function renderFrame() {
  // 1. far layer: background + far meshes
  renderer.setRenderTarget(farRT);
  renderer.clear(true, true, true);
  renderer.render(bgPass.sc, orthoCam);
  renderer.render(farScene, camera);
  // 2. far layer depth-of-field
  discPass.u.uTex.value = farRT.texture;
  discPass.u.uTexel.value.set(1 / W, 1 / H);
  discPass.u.uRadius.value = state.farRadius;
  run(discPass, farBlurRT);
  // 3. main: composited far layer + crisp near layer
  renderer.setRenderTarget(mainRT);
  renderer.clear(true, true, true);
  renderer.render(compPass.sc, orthoCam);
  renderer.render(nearScene, camera);
  // 4. rack-focus pulse that hides scene seams
  if (finalPass.u.uRackAmt.value > 0.001) {
    discPass.u.uTex.value = mainRT.texture;
    discPass.u.uRadius.value = 15 * SCALE;
    run(discPass, rackRT);
  }
  // 5. bloom
  brightPass.u.uTex.value = mainRT.texture;
  run(brightPass, bA);
  const g = (src, dst, dx, dy) => { gaussPass.u.uTex.value = src.texture; gaussPass.u.uDir.value.set(dx / src.width, dy / src.height); run(gaussPass, dst); };
  g(bA, bA2, 1, 0); g(bA2, bA, 0, 1);
  g(bA, bB2, 1, 0); g(bB2, bB, 0, 1);
  g(bB, bC2, 1, 0); g(bC2, bC, 0, 1);
  // 6. final grade to canvas
  renderer.setRenderTarget(null);
  run(finalPass, null);
}

window.renderAtTime = (t) => {
  update(t);
  renderFrame();
  renderer.getContext().finish();
  return true;
};
window.captureFrame = () => canvas.toDataURL('image/png');
window.textReport = () => TL.TEXT_CUES.map((c) => ({ id: c.id, maxWidthPx: Math.round(c.maxWidthPx), blockHeightPx: Math.round(c.blockHeightPx) }));
window.__ready = true;
