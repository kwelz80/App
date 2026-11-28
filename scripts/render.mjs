// Deterministic frame stepper: headless Chromium (WebGL2) -> PNG -> FFmpeg.
//
//   node scripts/render.mjs preview                 contact sheet (0:03 0:12 0:27 0:42 0:52 0:58)
//   node scripts/render.mjs frames 3 12.5 ...        individual full-res PNGs
//   node scripts/render.mjs full [--workers 3]       all 3600 frames -> out/shut_the_world_off.mp4
//   node scripts/render.mjs clip --start 0 --end 10 --scale 0.5   A/V sync check clip
//
// Options: --scale 0.5 (fast drafts), --gpu (use the host GPU instead of
// SwiftShader), --preset medium, --crf 16, --from F --to F (frame range).
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS, FRAMES, WIDTH, HEIGHT } from '../src/shared/timeline.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const mode = argv[0] || 'preview';
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes(`--${name}`);
const SCALE = parseFloat(opt('scale', '1'));
const W = Math.round(WIDTH * SCALE), H = Math.round(HEIGHT * SCALE);
const CRF = opt('crf', '16');
const PRESET = opt('preset', 'medium');

// ---------------------------------------------------------------- static server
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
function serve() {
  return new Promise((ok) => {
    const srv = createServer(async (req, res) => {
      const p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
      try {
        const body = await readFile(p);
        res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(body);
      } catch { res.writeHead(404).end(); }
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

async function openPage(port) {
  const args = flag('gpu')
    ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GPU stall')) console.log(`[page ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/src/index.html?scale=${SCALE}`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  return { browser, page };
}

async function grab(page, t) {
  const url = await page.evaluate((tt) => { window.renderAtTime(tt); return window.captureFrame(); }, t);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

function ffmpegEncoder(outFile) {
  const args = [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-profile:v', 'high', '-level:v', '4.2', '-x264-params', 'keyint=120:min-keyint=60:aq-mode=3',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    outFile,
  ];
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, bad) => p.on('close', (c) => (c === 0 ? ok() : bad(new Error('ffmpeg exit ' + c)))));
  return { p, done };
}
const write = (stream, buf) => new Promise((ok) => (stream.write(buf) ? ok() : stream.once('drain', ok)));

// ---------------------------------------------------------------- modes
async function renderStills(times, outDir) {
  mkdirSync(outDir, { recursive: true });
  const srv = await serve();
  const { browser, page } = await openPage(srv.address().port);
  const files = [];
  for (const t of times) {
    const t0 = Date.now();
    const png = await grab(page, t);
    const f = join(outDir, `frame_${t.toFixed(2).padStart(5, '0')}s.png`);
    writeFileSync(f, png);
    files.push(f);
    console.log(`  t=${t}s  ${((Date.now() - t0) / 1000).toFixed(2)}s  -> ${f}`);
  }
  const report = await page.evaluate(() => window.textReport());
  await browser.close();
  srv.close();
  return { files, report };
}

async function preview() {
  const times = [3, 12, 27, 42, 52, 58];
  const outDir = resolve(root, 'out/review');
  const { files, report } = await renderStills(times, outDir);
  // 3x2 sheet of half-size frames with small time labels.
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const inputs = files.flatMap((f) => ['-i', f]);
  const label = (i) => `[${i}:v]scale=540:960:flags=lanczos,drawtext=fontfile=${font}:text='0\\:${String(times[i]).padStart(2, '0')}':x=14:y=14:fontsize=26:fontcolor=white@0.85:box=1:boxcolor=black@0.45:boxborderw=8[v${i}]`;
  const filter = times.map((_, i) => label(i)).join(';') + ';' +
    times.map((_, i) => `[v${i}]`).join('') + 'xstack=inputs=6:layout=0_0|540_0|1080_0|0_960|540_960|1080_960:fill=black[out]';
  const sheet = resolve(root, 'out/contact_sheet.png');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', sheet], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('contact sheet failed');
  console.log('contact sheet ->', sheet);
  console.log('text blocks (px at 1080x1920):', JSON.stringify(report));
}

async function full() {
  const workers = parseInt(opt('workers', '2'), 10);
  const from = parseInt(opt('from', '0'), 10);
  const to = parseInt(opt('to', String(FRAMES)), 10);
  const chunkDir = resolve(root, 'build/chunks');
  mkdirSync(chunkDir, { recursive: true });
  const CHUNK = 240; // 4 s per chunk; finished chunks are skipped on re-run
  const chunks = [];
  for (let a = from; a < to; a += CHUNK) chunks.push([a, Math.min(a + CHUNK, to)]);
  const srv = await serve();
  const port = srv.address().port;
  const started = Date.now();
  let framesDone = 0;
  const total = to - from;
  let next = 0;
  async function worker(id) {
    const { browser, page } = await openPage(port);
    while (next < chunks.length) {
      const [a, b] = chunks[next++];
      const name = join(chunkDir, `chunk_${String(a).padStart(4, '0')}_${String(b).padStart(4, '0')}.mp4`);
      if (existsSync(name + '.done')) { framesDone += b - a; continue; }
      const enc = ffmpegEncoder(name);
      for (let f = a; f < b; f++) {
        await write(enc.p.stdin, await grab(page, f / FPS));
        framesDone++;
        if (framesDone % 30 === 0) {
          const el = (Date.now() - started) / 1000;
          console.log(`[w${id}] frame ${f}  ${framesDone}/${total}  ${(framesDone / el).toFixed(2)} fps  eta ${((total - framesDone) / (framesDone / el) / 60).toFixed(1)} min`);
        }
      }
      enc.p.stdin.end();
      await enc.done;
      writeFileSync(name + '.done', '');
    }
    await browser.close();
  }
  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));
  srv.close();

  // concat chunks (stream copy) and mux the lossless WAV as AAC
  const list = readdirSync(chunkDir).filter((f) => f.endsWith('.mp4')).sort();
  writeFileSync(join(chunkDir, 'list.txt'), list.map((f) => `file '${join(chunkDir, f)}'`).join('\n'));
  const video = resolve(root, 'build/video.mp4');
  run(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(chunkDir, 'list.txt'), '-c', 'copy', video]);
  const wav = resolve(root, 'build/audio.wav');
  if (!existsSync(wav)) throw new Error('build/audio.wav missing: run `npm run audio` first');
  mkdirSync(resolve(root, 'out'), { recursive: true });
  const final = resolve(root, 'out/shut_the_world_off.mp4');
  run(['-y', '-loglevel', 'error', '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    '-t', '60', '-movflags', '+faststart', final]);
  console.log('done ->', final, `(${((Date.now() - started) / 60000).toFixed(1)} min)`);
}
// Short A/V clip for checking sync (e.g. 0-10 s at half scale).
async function clip() {
  const a = parseFloat(opt('start', '0')), b = parseFloat(opt('end', '10'));
  const srv = await serve();
  const { browser, page } = await openPage(srv.address().port);
  const tmp = resolve(root, `build/clip_${a}-${b}.mp4`);
  const enc = ffmpegEncoder(tmp);
  const t0 = Date.now();
  for (let f = Math.round(a * FPS); f < Math.round(b * FPS); f++) {
    await write(enc.p.stdin, await grab(page, f / FPS));
    if (f % 60 === 0) console.log(`  frame ${f}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  enc.p.stdin.end();
  await enc.done;
  await browser.close();
  srv.close();
  const out = resolve(root, `out/sync_check_${a}-${b}s.mp4`);
  run(['-y', '-loglevel', 'error', '-i', tmp, '-ss', String(a), '-t', String(b - a), '-i', resolve(root, 'build/audio.wav'),
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out]);
  console.log('clip ->', out);
}
function run(args) {
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
}

if (mode === 'preview') await preview();
else if (mode === 'frames') await renderStills(argv.slice(1).filter((x, i, a) => /^[\d.]+$/.test(x) && !String(a[i - 1] || '').startsWith('--')).map(Number), resolve(root, 'out/frames'));
else if (mode === 'full') await full();
else if (mode === 'clip') await clip();
else console.log('usage: render.mjs preview | frames <t...> | full');
