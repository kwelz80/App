// All GLSL lives here (GLSL ES 3.00, used through THREE.RawShaderMaterial).

export const COMMON = /* glsl */ `
precision highp float;
precision highp int;
#define PI 3.14159265
#define TAU 6.2831853
#define ASPECT 0.5625

// Hash functions without sine (Dave Hoskins, MIT).
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = r * p * 2.03 + 1.7; a *= 0.5; }
  return s;
}
float fbm3(vec2 p){
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = r * p * 2.03 + 1.7; a *= 0.5; }
  return s / 0.875;
}

// Smooth rainbow.
vec3 spectral(float x){ return clamp(0.5 + 0.5 * cos(TAU * (x + vec3(0.0, 0.33, 0.67))), 0.0, 1.0); }

// Thin-film interference (soap / oil film): thickness in ~microns, cos of view angle.
vec3 thinFilm(float thick, float cosT){
  vec3 k = vec3(1.0, 1.22, 1.44); // 650 / 532 / 450 nm
  return 0.5 + 0.5 * cos(TAU * thick * 2.0 * cosT * k);
}

// Voronoi F2-F1 (cell edge distance), animated points.
float voronoiEdge(vec2 p, float t){
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    o = 0.5 + 0.42 * sin(t + TAU * o);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
// Sunlight-through-water caustic network.
float caustic(vec2 p, float t){
  vec2 w = p + 0.22 * vec2(sin(p.y * 3.1 + t * 0.6), cos(p.x * 2.7 - t * 0.5));
  w += 0.10 * vec2(sin(w.y * 7.3 - t * 0.8), cos(w.x * 6.1 + t * 0.7));
  float e1 = voronoiEdge(w * 2.6, t * 0.55);
  float e2 = voronoiEdge((w + 0.08 * vec2(sin(w.y * 9.0 + t), cos(w.x * 8.0 - t))) * 4.1 + 5.3, -t * 0.6);
  float c = exp(-e1 * 20.0) + 0.55 * exp(-e2 * 26.0);
  return c * c * 0.6;
}

vec3 acesFilm(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

// ------------------------------------------------------------------ quad
export const QUAD_VERT = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ------------------------------------------------------------------ background
export const BG_FRAG = COMMON + /* glsl */ `
in vec2 vUv;
out vec4 fragColor;
uniform float uTime, uBreath;
uniform float uLiqT, uCurT, uFlow;
uniform vec4 uW1;   // liquid, orbs, beads, sunset
uniform float uW5;  // void
uniform vec4 uLiquid[10];   // cx, cy, r, tint
uniform vec4 uCurrent[5];

vec3 tintColor(float k){
  if (k < 0.5) return vec3(1.00, 0.70, 0.22);   // warm gold
  if (k < 1.5) return vec3(0.18, 0.82, 1.00);   // cyan
  return vec3(1.00, 0.26, 0.72);                // magenta
}

vec3 glitter(vec2 p, float scale, float t, float density, float seed){
  vec2 q = p * scale;
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hash12(id + seed);
  if (h > density) return vec3(0.0);
  vec2 o = (hash22(id + seed + 3.1) - 0.5) * 0.6;
  float d = length(f - o);
  float h2 = hash12(id + 17.0);
  float tw = pow(0.5 + 0.5 * sin(t * (1.2 + h2 * 2.5) + h2 * 40.0), 10.0);
  float core = smoothstep(0.17, 0.0, d);
  return spectral(h2 * 3.0 + t * 0.05) * core * tw;
}

vec3 waterBack(vec2 p, float t){
  // saturated coloured backlight: gold core, magenta and cyan pools
  float r = length((p - vec2(0.0, 0.10)) * vec2(1.2, 0.85));
  float n1 = fbm3(p * 1.1 + vec2(t * 0.05, 0.0));
  float n2 = fbm3(p * 1.3 + vec2(4.0, -t * 0.04));
  vec3 gold = vec3(1.00, 0.62, 0.16);
  vec3 mag = vec3(0.90, 0.14, 0.52);
  vec3 cyan = vec3(0.08, 0.62, 0.95);
  vec3 col = mix(gold, mag, smoothstep(0.40, 0.75, n1 + p.y * 0.25));
  col = mix(col, cyan, smoothstep(0.45, 0.78, n2 - p.y * 0.2) * 0.85);
  float glow = exp(-r * 1.5);
  col *= 0.22 + 0.95 * glow;
  col += vec3(1.0, 0.85, 0.55) * pow(glow, 3.0) * 0.45;
  return col;
}

vec3 liquidLayer(vec2 p){
  float t = uLiqT;
  float f = 0.0; vec2 g = vec2(0.0); vec3 tint = vec3(0.0);
  for (int i = 0; i < 10; i++){
    vec2 d = p - uLiquid[i].xy;
    float dd = dot(d, d) + 1e-4;
    float r2 = uLiquid[i].z * uLiquid[i].z;
    float fi = r2 / dd;
    f += fi;
    g += -2.0 * r2 * d / (dd * dd);
    tint += fi * tintColor(uLiquid[i].w);
  }
  tint /= max(f, 1e-4);
  vec2 gn = g / (f * f);                     // gradient of -1/f
  float inside = smoothstep(0.97, 1.03, f);
  vec3 N = normalize(vec3(gn * 0.33, 1.0));

  // lens refraction of the backlit water inside each droplet
  vec2 rp = p + gn * 0.05 * inside;
  vec3 back = waterBack(p, t);
  vec3 backR = waterBack(rp, t);

  float thick = 0.9 + 1.4 / f + 0.5 * fbm3(p * 5.0 + vec2(t * 0.08, -t * 0.05));
  vec3 film = thinFilm(thick, N.z);
  // droplets act as lenses: they gather the backlight and glow in their own tint
  float lensGlow = 0.55 + 0.9 * smoothstep(1.0, 3.5, f);
  vec3 drop = (backR * 0.75 + vec3(0.10)) * tint * 1.65 * lensGlow;
  drop = mix(drop, drop * (film * 1.1 + 0.25), 0.30);

  // refractive dark rim with RGB-split fringe (chromatic aberration)
  vec3 rim;
  rim.r = smoothstep(0.93, 1.00, f) * (1.0 - smoothstep(1.02, 1.30, f));
  rim.g = smoothstep(0.96, 1.03, f) * (1.0 - smoothstep(1.05, 1.36, f));
  rim.b = smoothstep(0.99, 1.06, f) * (1.0 - smoothstep(1.08, 1.42, f));
  vec3 col = mix(back, drop, inside);
  col *= 1.0 - 0.62 * rim;
  col += 0.20 * rim.gbr * tint;

  // specular: soft window reflection + tight sparkle
  vec3 L = normalize(vec3(-0.45, 0.65, 0.75));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(N, H), 0.0);
  col += inside * (pow(nh, 70.0) * 1.3 + pow(nh, 12.0) * 0.10) * vec3(1.0, 0.97, 0.92);
  // inner focused light crescent (backlight concentrated by the lens)
  float focus = pow(max(dot(N, normalize(vec3(0.35, -0.5, 0.8))), 0.0), 18.0);
  col += inside * focus * tint * 0.55;

  // microscopic iridescent glitter, two parallax layers
  float gl = 0.35 + 0.65 * inside;
  col += glitter(p + vec2(0.0, t * 0.010), 230.0, uTime, 0.16, 0.0) * 3.0 * gl;
  col += glitter(p + vec2(t * 0.006, t * 0.022), 130.0, uTime * 0.8, 0.08, 9.0) * 2.2 * gl;
  return col;
}

vec3 orbWater(vec2 p){
  float t = uFlow;
  float top = smoothstep(-1.2, 1.1, p.y);
  vec3 col = mix(vec3(0.006, 0.040, 0.070), vec3(0.030, 0.200, 0.260), top);
  // sun glow from above the surface
  vec2 sun = vec2(0.18, 1.25);
  float ds = length(p - sun);
  col += vec3(1.0, 0.82, 0.52) * exp(-ds * 2.1) * 0.70;
  // god rays fanning down from the sun
  float ang = atan(p.x - sun.x, sun.y - p.y);
  float rays = fbm3(vec2(ang * 9.0, t * 0.08)) ;
  rays = pow(smoothstep(0.35, 0.95, rays), 2.0);
  col += vec3(0.85, 0.95, 0.85) * rays * exp(-ds * 0.9) * 0.40;
  // caustic network with a touch of chromatic dispersion
  float ct = t * 0.85;
  vec2 cp = p * vec2(1.0, 0.85) + vec2(0.0, -t * 0.02);
  vec3 c = vec3(caustic(cp * 1.000, ct), caustic(cp * 1.010 + 0.002, ct), caustic(cp * 1.022 + 0.004, ct));
  float patchy = smoothstep(0.30, 0.80, fbm3(p * 0.9 + vec2(t * 0.03, -t * 0.02)));
  col += c * vec3(1.0, 0.95, 0.78) * (0.10 + 0.45 * top) * (0.25 + 0.75 * patchy);
  // faint suspended particulate haze
  col += vec3(0.06, 0.10, 0.10) * fbm3(p * 3.0 + vec2(0.0, t * 0.04)) * 0.5;
  return col;
}

vec3 currentLayer(vec2 p){
  float t = uCurT;
  float top = smoothstep(-1.1, 1.2, p.y);
  vec3 col = mix(vec3(0.030, 0.014, 0.060), vec3(0.030, 0.070, 0.110), top);
  col += vec3(0.30, 0.14, 0.34) * exp(-length(p - vec2(0.0, 0.1)) * 1.6) * 0.35;
  // silky current streaks (domain warped flow lines)
  vec2 w = p + 0.35 * vec2(fbm3(p * 1.2 + t * 0.05), fbm3(p * 1.2 - t * 0.04 + 4.0));
  float lines = sin((w.y * 7.0 + fbm3(w * 1.5) * 6.0) + t * 0.3);
  lines = pow(abs(lines), 18.0);
  col += lines * vec3(0.30, 0.22, 0.40) * 0.18;
  // large translucent current blobs
  float f = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < 5; i++){
    vec2 d = p - uCurrent[i].xy;
    float dd = dot(d, d) + 1e-4;
    float r2 = uCurrent[i].z * uCurrent[i].z;
    f += r2 / dd;
    g += -2.0 * r2 * d / (dd * dd);
  }
  vec2 gn = g / (f * f);
  float inside = smoothstep(0.9, 1.1, f);
  vec3 N = normalize(vec3(gn * 0.3, 1.0));
  vec3 film = thinFilm(1.1 + 1.2 / f, N.z);
  col = mix(col, col * 1.35 + film * 0.06, inside * 0.55);
  float rim = smoothstep(0.92, 1.0, f) * (1.0 - smoothstep(1.0, 1.25, f));
  col += rim * film * 0.10;
  vec3 H = normalize(normalize(vec3(-0.4, 0.6, 0.7)) + vec3(0, 0, 1));
  col += inside * pow(max(dot(N, H), 0.0), 50.0) * 0.30;
  return col;
}

vec3 sunsetLayer(vec2 p){
  float t = uFlow;
  float y = p.y;
  vec3 low = vec3(0.30, 0.09, 0.05);   // rose amber
  vec3 mid = vec3(0.20, 0.035, 0.15);   // soft magenta
  vec3 high = vec3(0.07, 0.03, 0.15);  // violet
  vec3 col = mix(low, mid, smoothstep(-1.1, 0.0, y));
  col = mix(col, high, smoothstep(0.0, 1.1, y));
  // aurora curtains
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    float y0 = -0.25 + 0.45 * fk + 0.28 * (fbm3(vec2(p.x * 1.1 + fk * 3.1, t * 0.045 + fk)) - 0.5);
    float band = exp(-pow((y - y0) / (0.16 + 0.05 * fk), 2.0));
    float stri = 0.55 + 0.45 * fbm3(vec2(p.x * 7.0 + fk * 11.0, y * 0.6 + t * 0.06));
    vec3 c = fk < 0.5 ? vec3(1.0, 0.48, 0.22) : (fk < 1.5 ? vec3(0.95, 0.25, 0.62) : vec3(0.52, 0.28, 0.95));
    col += c * band * stri * 0.26;
  }
  // mist
  float m = fbm(p * 1.3 + vec2(t * 0.025, t * 0.012));
  col += vec3(0.30, 0.12, 0.22) * smoothstep(0.35, 0.85, m) * 0.40;
  return col;
}

vec3 voidLayer(vec2 p){
  float t = uFlow;
  float r = length((p - vec2(0.0, 0.05)) * vec2(1.3, 0.8));
  vec3 col = mix(vec3(0.020, 0.016, 0.060), vec3(0.0030, 0.0025, 0.0100), smoothstep(0.0, 1.3, r));
  float n = fbm(p * 1.1 + vec2(t * 0.012, -t * 0.008));
  col += vec3(0.020, 0.010, 0.045) * smoothstep(0.45, 0.9, n);
  return col;
}

void main(){
  vec2 p = (vUv * 2.0 - 1.0) * vec2(ASPECT, 1.0);
  vec3 col = vec3(0.0);
  if (uW1.x > 0.001) col += uW1.x * liquidLayer(p);
  if (uW1.y > 0.001) col += uW1.y * orbWater(p);
  if (uW1.z > 0.001) col += uW1.z * currentLayer(p);
  if (uW1.w > 0.001) col += uW1.w * sunsetLayer(p);
  if (uW5 > 0.001)   col += uW5 * voidLayer(p);
  fragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------ blurs
// Golden-angle disc blur (bokeh-like) for the far depth layer and rack focus.
export const DISC_BLUR_FRAG = COMMON + /* glsl */ `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uTexel;      // 1/size of SOURCE
uniform float uRadius;    // in source pixels
void main(){
  vec3 acc = vec3(0.0); float wsum = 0.0;
  const int N = 28;
  float ga = 2.39996323;
  for (int i = 0; i < N; i++){
    float fi = float(i) + 0.5;
    float r = sqrt(fi / float(N)) * uRadius;
    float a = fi * ga;
    vec3 c = texture(uTex, vUv + vec2(cos(a), sin(a)) * r * uTexel).rgb;
    float w = 1.0 + 1.5 * dot(c, vec3(0.3, 0.5, 0.2)); // bright highlights bloom into discs
    acc += c * w; wsum += w;
  }
  fragColor = vec4(acc / wsum, 1.0);
}
`;

export const GAUSS_FRAG = COMMON + /* glsl */ `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDir; // texel step * direction
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += texture(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(c, 1.0);
}
`;

export const BRIGHT_FRAG = COMMON + /* glsl */ `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
void main(){
  vec3 c = vec3(0.0);
  c += texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.6, l);
  fragColor = vec4(c * k, 1.0);
}
`;

export const COPY_FRAG = COMMON + /* glsl */ `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
void main(){ fragColor = vec4(texture(uTex, vUv).rgb, 1.0); }
`;

// Far layer composite: crisp far layer blended with its blurred version.
// Before the ANC snap, everything outside the expanding wavefront is muffled.
export const COMPOSITE_FRAG = COMMON + /* glsl */ `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uFar, uFarBlur;
uniform float uFarAmt, uSnapR;
void main(){
  vec2 p = (vUv * 2.0 - 1.0) * vec2(ASPECT, 1.0);
  float pre = smoothstep(uSnapR - 0.10, uSnapR, length(p));
  float amt = mix(uFarAmt, 1.0, pre);
  vec3 c = mix(texture(uFar, vUv).rgb, texture(uFarBlur, vUv).rgb, amt);
  fragColor = vec4(c, 1.0);
}
`;

// ------------------------------------------------------------------ final
export const FINAL_FRAG = COMMON + /* glsl */ `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uMain, uRack, uBloomA, uBloomB, uBloomC, uText;
uniform vec2 uRes;
uniform float uRackAmt, uExposure, uBloomStr, uSnapR, uFrame, uProgress, uTextAlpha, uTextShift, uGlobalCA;
void main(){
  vec2 uv = vUv;
  vec2 p = (uv * 2.0 - 1.0) * vec2(ASPECT, 1.0);
  float dist = length(p);
  float pre = smoothstep(uSnapR - 0.10, uSnapR, dist);

  // restless micro-jitter before the snap (per-frame, deterministic)
  vec2 jit = (hash22(vec2(uFrame, 7.3)) - 0.5) * vec2(5.0, 5.0) / uRes;
  uv += jit * pre;

  // the snap wavefront: a thin refractive ripple of silence
  float live = step(0.0, uSnapR) * (1.0 - smoothstep(1.15, 1.55, uSnapR));
  float ring = exp(-pow((dist - uSnapR) / 0.035, 2.0)) * live;
  uv += (p / max(dist, 1e-3)) * vec2(1.0 / ASPECT, 1.0) * ring * 0.0045;

  // lens chromatic aberration, stronger toward the edges
  vec2 d = uv - 0.5;
  float ca = uGlobalCA * (0.4 + 1.6 * dot(d, d) * 4.0) + 0.002 * pre;
  vec3 col;
  col.r = texture(uMain, uv + d * ca).r;
  col.g = texture(uMain, uv).g;
  col.b = texture(uMain, uv - d * ca).b;

  if (uRackAmt > 0.001) col = mix(col, texture(uRack, uv).rgb, uRackAmt);
  vec3 bloom = texture(uBloomA, uv).rgb * 0.55 + texture(uBloomB, uv).rgb * 0.75 + texture(uBloomC, uv).rgb * 0.95;
  col += bloom * uBloomStr;

  // pre-snap: muddy, desaturated, a little dim
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lum) * vec3(0.95, 0.93, 0.9), pre * 0.65);
  col *= 1.0 - 0.22 * pre;
  col += ring * vec3(0.85, 0.95, 1.0) * 0.18;

  // vignette + exposure arc
  col *= mix(1.0, smoothstep(1.55, 0.25, dist), 0.5);
  col *= uExposure;

  col = acesFilm(col * 1.05);
  col = toSRGB(col);

  // grain: heavy static before the snap, whisper-fine dither afterward
  float gseed = uFrame * 13.37;
  float g = hash12(gl_FragCoord.xy + vec2(gseed, gseed * 0.61)) + hash12(gl_FragCoord.xy * 1.3 + vec2(gseed * 0.37, 11.0)) - 1.0;
  float gc = hash12(gl_FragCoord.xy * 0.71 + vec2(3.0, gseed));
  col += g * (0.11 * pre) * mix(vec3(1.0), spectral(gc) * 1.5, 0.25 * pre);
  col += g * (1.4 / 255.0);

  // text (pre-rendered with its soft shadow, straight alpha)
  if (uTextAlpha > 0.001){
    vec4 tx = texture(uText, vUv + vec2(0.0, uTextShift));
    col = mix(col, tx.rgb, tx.a * uTextAlpha);
  }

  // silent progress line: 3 px, 25% opacity, soft glow
  vec2 px = vUv * uRes;
  float fill = clamp(uProgress * uRes.x - px.x + 0.5, 0.0, 1.0);
  float line = 1.0 - smoothstep(2.5, 3.5, px.y);
  float glow = exp(-max(px.y - 1.5, 0.0) / 3.5) * (1.0 - line);
  vec3 lc = vec3(1.0, 0.97, 0.93);
  col = mix(col, lc, 0.25 * line * fill);
  col += lc * glow * 0.05 * fill;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// ------------------------------------------------------------------ meshes
// Shared vertex shader for meshes and instanced meshes.
export const MESH_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 normal;
#ifdef INSTANCED
in mat4 instanceMatrix;
in vec4 iData;   // rgb colour (or hue seed), w = extra
in vec4 iData2;  // x seed, y opacity, z emissive, w unused
#endif
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
out vec3 vWPos, vWNorm, vOPos;
out vec4 vClip;
out vec4 vData, vData2;
void main(){
  mat4 m = modelMatrix;
#ifdef INSTANCED
  m = modelMatrix * instanceMatrix;
  vData = iData; vData2 = iData2;
#else
  vData = vec4(0.0); vData2 = vec4(0.0, 1.0, 0.0, 0.0);
#endif
  vec4 wp = m * vec4(position, 1.0);
  vWPos = wp.xyz;
  vWNorm = normalize(mat3(m) * normal);
  vOPos = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
  vClip = gl_Position;
}
`;

const SCENE_SAMPLER = /* glsl */ `
uniform sampler2D uFar, uFarBlur;
uniform float uFarAmt;
vec3 sceneAt(vec2 uv){
  uv = clamp(uv, vec2(0.002), vec2(0.998));
  return mix(texture(uFar, uv).rgb, texture(uFarBlur, uv).rgb, uFarAmt);
}
vec3 sceneBlur(vec2 uv){ uv = clamp(uv, vec2(0.002), vec2(0.998)); return texture(uFarBlur, uv).rgb; }
`;

// Translucent iridescent glass marble with an inner twisted ribbon.
export const GLASS_FRAG = COMMON + SCENE_SAMPLER + /* glsl */ `
in vec3 vWPos, vWNorm, vOPos;
in vec4 vClip;
in vec4 vData, vData2;
out vec4 fragColor;
uniform vec3 cameraPosition;
uniform vec3 uCamObj;       // camera position in the orb's object space
uniform vec2 uCenterUV;     // orb centre in screen uv
uniform float uOpacity, uDissolve, uSeed, uTime, uCausT, uBreath;
uniform vec3 uRibbon;       // ribbon base hue

void main(){
  // materialise / dissolve with a noisy threshold and a glowing edge
  float dn = vnoise3(vOPos * 3.2 + uSeed * 7.0) * 0.75 + vnoise3(vOPos * 9.0 + uSeed) * 0.25;
  if (dn < uDissolve) discard;
  float edgeGlow = smoothstep(uDissolve + 0.07, uDissolve, dn) * step(0.001, uDissolve);

  vec3 N = normalize(vWNorm);
  vec3 V = normalize(cameraPosition - vWPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;

  // refraction through a solid glass sphere: inverted, minified backdrop with RGB-split
  vec2 rel = suv - uCenterUV;
  float bend = 0.62 + 0.55 * pow(1.0 - ndv, 2.0);
  vec3 trans;
  trans.r = sceneAt(uCenterUV - rel * bend * 0.94).r;
  trans.g = sceneAt(uCenterUV - rel * bend * 1.00).g;
  trans.b = sceneAt(uCenterUV - rel * bend * 1.07).b;
  trans *= vec3(0.93, 0.98, 1.0) * 1.08;

  // inner ribbon (cat's-eye vane) marched through the sphere in object space
  vec3 o = normalize(vOPos);
  vec3 rd = refract(normalize(vOPos - uCamObj), o, 1.0 / 1.5);
  float tExit = max(-2.0 * dot(o, rd), 0.0);
  vec3 rib = vec3(0.0); float acc = 0.0;
  for (int i = 0; i < 9; i++){
    vec3 q = o + rd * tExit * (float(i) + 0.5) / 9.0;
    float a = q.y * 2.4 + uSeed * 6.0 + uTime * 0.05;
    float x = q.x * cos(a) - q.z * sin(a);
    float vane = exp(-x * x / 0.0035) * smoothstep(0.80, 0.45, length(q.xz)) * smoothstep(0.95, 0.6, abs(q.y));
    vec3 c = mix(uRibbon, spectral(uSeed + q.y * 0.6 + 0.1), 0.45);
    rib += c * vane * (1.0 - acc) * 0.42;
    acc = min(1.0, acc + vane * 0.12);
  }

  // thin-film iridescence on the surface (strongest near the rim)
  float thick = 0.8 + 0.6 * vnoise3(vOPos * 2.0 + uSeed * 3.0);
  vec3 film = thinFilm(thick, ndv);

  // reflections: blurred environment + softbox window + sharp key glint
  vec3 R = reflect(-V, N);
  vec3 env = sceneBlur(vec2(0.5) + R.xy * vec2(0.45, 0.3)) * 1.1 + vec3(0.06, 0.08, 0.09);
  float window = smoothstep(0.08, 0.0, abs(R.x + 0.38) - 0.16) * smoothstep(0.08, 0.0, abs(R.y - 0.55) - 0.22);
  vec3 L1 = normalize(vec3(-0.5, 0.8, 0.6));
  vec3 L2 = normalize(vec3(0.7, -0.35, 0.6));
  float spec = pow(max(dot(R, L1), 0.0), 260.0) * 7.0 + pow(max(dot(R, L2), 0.0), 60.0) * 0.5;

  // backlight focused through the lens onto the near face (bright crescent)
  float focus = pow(max(dot(N, normalize(vec3(0.25, -0.55, 0.8))), 0.0), 14.0);
  // caustic light dancing over the upper surface
  float caus = caustic(vWPos.xy * 0.45 + vec2(uSeed, 0.0), uCausT) * smoothstep(-0.2, 0.8, N.y);

  vec3 col = trans * (1.0 - fres) + rib;
  col += focus * trans * 0.9;
  col += env * fres * mix(vec3(1.0), film * 1.4, 0.55);
  col += window * 0.55 * vec3(1.0, 0.98, 0.95) * (0.4 + fres);
  col += spec * vec3(1.0, 0.98, 0.94);
  col += caus * vec3(1.0, 0.95, 0.8) * 0.35;

  // refractive edge: total internal reflection darkens + colours the silhouette
  float edge = smoothstep(0.32, 0.02, ndv);
  col = mix(col, col * 0.45 + film * vec3(0.20, 0.22, 0.26), edge * 0.65);

  col += edgeGlow * spectral(dn * 4.0 + uSeed) * 2.2;
  fragColor = vec4(col, uOpacity);
}
`;

// Holographic foil (big stars, confetti stars). Faceted micro-normals give
// metallic specular glints that flicker as the foil tumbles.
export const HOLO_FRAG = COMMON + SCENE_SAMPLER + /* glsl */ `
in vec3 vWPos, vWNorm, vOPos;
in vec4 vClip;
in vec4 vData, vData2;
out vec4 fragColor;
uniform vec3 cameraPosition;
uniform float uTime, uOpacity, uSeed, uGlint, uDissolve, uUseEnv;
void main(){
  float seed = uSeed + vData2.x;
  float opacity = uOpacity * vData2.y;
  float dn = vnoise3(vOPos * 4.0 + seed * 5.0);
  if (dn < uDissolve) discard;

  vec3 N = normalize(vWNorm);
  vec3 V = normalize(cameraPosition - vWPos);
  if (dot(N, V) < 0.0) N = -N;
  // crinkled-foil facets
  vec2 cell = floor(vOPos.xy * 70.0 + seed * 13.0);
  vec3 jitter = hash32(cell) - 0.5;
  vec3 Nf = normalize(N + jitter * 0.22);
  float ndv = clamp(dot(N, V), 0.0, 1.0);

  // diffraction-grating rainbow sweeps smoothly with view angle and position
  float hue = dot(N, V) * 1.3 + dot(N.xy, vec2(0.8, 0.5)) + dot(vOPos.xy, vec2(0.35, 0.22)) + seed * 0.37 + uTime * 0.04;
  vec3 holo = spectral(hue);
  holo = mix(holo, vec3(1.0), 0.12);

  vec3 R = reflect(-V, Nf);
  vec3 Rs = reflect(-V, N);
  // far-layer foil must not read the far blur target (it is being built)
  vec3 env = uUseEnv > 0.5 ? sceneBlur(vec2(0.5) + Rs.xy * vec2(0.4, 0.3)) : vec3(0.25, 0.22, 0.3) * (0.6 + 0.6 * Rs.y);
  float envL = dot(env, vec3(0.3, 0.5, 0.2));
  vec3 L1 = normalize(vec3(-0.5, 0.8, 0.6));
  vec3 L2 = normalize(vec3(0.6, 0.3, 0.75));
  float g1 = pow(max(dot(R, L1), 0.0), 60.0) * (0.35 + 0.65 * step(0.82, hash12(cell + floor(uTime * 3.0))));
  float g2 = pow(max(dot(Rs, L2), 0.0), 24.0);
  vec3 col = holo * (0.16 + 1.25 * envL + 0.35 * g2);
  col += (g1 * 6.0 * uGlint) * mix(vec3(1.0), holo, 0.35);
  col += pow(1.0 - ndv, 3.0) * holo * 0.4;
  col += vData2.z * holo * 0.25;
  fragColor = vec4(col, opacity);
}
`;

// Glossy translucent micro-beads (pastel & neon).
export const BEAD_FRAG = COMMON + SCENE_SAMPLER + /* glsl */ `
in vec3 vWPos, vWNorm, vOPos;
in vec4 vClip;
in vec4 vData, vData2;
out vec4 fragColor;
uniform vec3 cameraPosition;
uniform float uOpacity, uSampleBg;
void main(){
  vec3 base = vData.rgb;
  vec3 N = normalize(vWNorm);
  vec3 V = normalize(cameraPosition - vWPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
  float wrap = 0.5 + 0.5 * dot(N, L);

  vec3 col = base * (0.12 + 0.70 * wrap);
  if (uSampleBg > 0.5){
    vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
    vec3 behind = sceneAt(suv - N.xy * 0.012);
    col = mix(col, behind * base * 1.6 + base * 0.12, 0.42);
  }
  // translucent body glows where the backlight passes through the centre
  col += base * pow(ndv, 2.5) * 0.22;
  // neon emission
  col += base * vData2.z * 0.22;
  // dark refractive edge gives each bead a solid, glassy silhouette
  col *= mix(1.0, 0.55, smoothstep(0.35, 0.0, ndv));
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, L), 0.0), 150.0) * 3.2 + pow(max(dot(R, normalize(vec3(0.6, 0.2, 0.8))), 0.0), 30.0) * 0.25;
  col += spec * vec3(1.0, 0.98, 0.96);
  col += fres * vec3(0.75, 0.8, 0.9) * 0.55;
  fragColor = vec4(col, uOpacity * vData2.y);
}
`;

// Dark prism crystals: flat facets that throw tiny dispersed rainbow glints.
export const PRISM_FRAG = COMMON + /* glsl */ `
in vec3 vWPos, vWNorm, vOPos;
in vec4 vClip;
in vec4 vData, vData2;
out vec4 fragColor;
uniform vec3 cameraPosition;
uniform float uOpacity, uTime;
void main(){
  vec3 N = normalize(vWNorm);
  vec3 V = normalize(cameraPosition - vWPos);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 4.0);
  vec3 col = vec3(0.010, 0.008, 0.030) + fres * vec3(0.06, 0.05, 0.16);
  vec3 R = reflect(-V, N);
  vec3 T = refract(-V, N, 1.0 / 1.6);
  vec3 L1 = normalize(vec3(-0.35, 0.8, 0.5));
  vec3 L2 = normalize(vec3(0.65, 0.25, 0.7));
  vec3 Lb = normalize(vec3(0.1, 0.3, -1.0));
  // per-channel offsets on the light direction = dispersion
  vec3 off = vec3(-0.055, 0.0, 0.055);
  vec3 glint;
  for (int c = 0; c < 3; c++){
    float o = off[c];
    vec3 l1 = normalize(L1 + vec3(o, -o * 0.5, 0.0));
    vec3 l2 = normalize(L2 + vec3(0.0, o, -o * 0.5));
    vec3 lb = normalize(Lb + vec3(o * 1.5, 0.0, 0.0));
    glint[c] = pow(max(dot(R, l1), 0.0), 160.0) * 7.0 + pow(max(dot(R, l2), 0.0), 120.0) * 4.0 + pow(max(dot(T, lb), 0.0), 60.0) * 2.5;
  }
  col += glint * mix(vec3(1.0), spectral(vData2.x + dot(N, vec3(0.7, 0.3, 0.2))), 0.5);
  fragColor = vec4(col, uOpacity * vData2.y);
}
`;

// ------------------------------------------------------------------ billboards
// Instanced camera-facing quads with physically motivated circle-of-confusion.
export const SPRITE_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 iPos;
in vec4 iCol;     // rgb, intensity
in vec4 iParam;   // x shape (0 bokeh, 1 star light, 2 prism sparkle, 3 mote), y size, z rotation, w seed
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
uniform float uFocus, uAperture, uGlobalAlpha;
out vec2 vUv;
out vec4 vCol;
out vec4 vParam;
out float vSharp;
void main(){
  vec4 mv = viewMatrix * modelMatrix * vec4(iPos, 1.0);
  float depth = -mv.z;
  float coc = uAperture * abs(depth - uFocus) / max(depth, 0.1);
  float size = iParam.y + coc;
  vSharp = iParam.y / size;
  float energy = clamp(vSharp * vSharp, 0.06, 1.0);
  float c = cos(iParam.z), s = sin(iParam.z);
  vec2 q = mat2(c, s, -s, c) * position.xy;
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy;
  vCol = vec4(iCol.rgb, iCol.a * energy * uGlobalAlpha);
  vParam = iParam;
}
`;

export const SPRITE_FRAG = COMMON + /* glsl */ `
in vec2 vUv;
in vec4 vCol;
in vec4 vParam;
in float vSharp;
out vec4 fragColor;
float starShape(vec2 uv, float k){
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float spikes = 0.55 + 0.45 * pow(abs(cos(2.5 * a)), 3.0);
  return smoothstep(spikes * k, spikes * k * 0.35, r);
}
void main(){
  vec2 uv = vUv;
  float r = length(uv);
  if (r > 1.0) discard;
  vec3 col = vec3(0.0);
  float shape = vParam.x;
  if (shape < 0.5){
    // out-of-focus bokeh disc: flat body, brighter rim, soft fringe
    float soft = mix(0.05, 0.35, vSharp);
    float body = smoothstep(1.0, 1.0 - soft, r);
    float rim = smoothstep(0.70, 0.96, r) * body;
    vec3 fr = vec3(smoothstep(1.0, 0.93, r), smoothstep(0.97, 0.90, r), smoothstep(0.94, 0.86, r));
    col = vCol.rgb * (body * 0.75 + rim * 0.45) * mix(vec3(1.0), fr, 0.5);
  } else if (shape < 1.5){
    // soft star-shaped light particle
    float s = starShape(uv, 0.9);
    float core = exp(-r * r * 30.0);
    float halo = exp(-r * r * 5.0) * 0.25;
    col = vCol.rgb * (s * 0.8 + halo) + vec3(1.0) * core * 0.6;
  } else if (shape < 2.5){
    // prism sparkle: tiny core + 4-ray glint with RGB split
    vec3 c3;
    for (int k = 0; k < 3; k++){
      vec2 o = uv * (1.0 + (float(k) - 1.0) * 0.16);
      float core = exp(-dot(o, o) * 60.0);
      float rays = exp(-abs(o.x) * 40.0) * exp(-abs(o.y) * 4.0) + exp(-abs(o.y) * 40.0) * exp(-abs(o.x) * 4.0);
      c3[k] = core * 1.6 + rays * 0.45;
    }
    col = c3 * vCol.rgb;
  } else {
    // drifting mote / soft dot
    col = vCol.rgb * exp(-r * r * 6.0) * (1.0 - r);
  }
  fragColor = vec4(col * vCol.a, 1.0);
}
`;
