# shut the world off

Deterministic offline pipeline for a 60 s, 1080x1920, 60 fps TikTok video with procedural stereo audio.

## Pipeline

1. `src/shared/timeline.js` holds every timing rule: scene crossfades, the hidden 10 s breathing curve (4 s inhale, 6 s exhale), the eye-relief exposure arc, the ANC snap at 1.5 s, text cues, metaball paths. The browser and the bake both import it.
2. `scripts/bake.mjs` runs the glass-orb and foil-star physics at 600 Hz and scans the metaball fields for merges. It writes `build/bake.json` with per-frame tracks and the exact timestamp of every collision and merge.
3. `src/index.html` + `src/main.js` + `src/gl/shaders.js` is the Three.js / GLSL renderer. `window.renderAtTime(seconds)` draws one frame as a pure function of time plus the bake. No clocks, no `Math.random`.
4. `scripts/audio.py` reads the same `bake.json` and synthesizes the soundtrack. Chimes land on the exact collision/merge samples. Output: `build/audio.wav` (48 kHz float, -14 LUFS, -1 dBTP ceiling) and `out/audio_events.txt`.
5. `scripts/render.mjs` steps headless Chromium frame by frame (`t = frame / 60`), pipes PNGs to FFmpeg (`libx264 -crf 16 -pix_fmt yuv420p -r 60`), then muxes AAC audio.

## Commands

```bash
npm install
pip install numpy scipy pyloudnorm

npm run bake                                   # physics + event timestamps
python3 scripts/audio.py --sample 0 10         # full mix + 10 s review sample
node scripts/render.mjs preview                # out/contact_sheet.png (0:03 0:12 0:27 0:42 0:52 0:58)
node scripts/render.mjs clip --start 0 --end 10 --scale 0.5   # A/V sync check
node scripts/render.mjs full --workers 2       # out/shut_the_world_off.mp4
```

Options: `--scale 0.5` for fast drafts, `--gpu` to use a host GPU instead of SwiftShader, `--preset`, `--crf`. The full render writes 4-second chunks to `build/chunks/` and skips finished ones, so it can resume after an interruption.

## Timeline

| Time | Visual | Audio |
|---|---|---|
| 0:00–0:01.5 | muffled, grainy, jittery liquid | low room static + mains hum |
| 0:01.5 | radial "silence" wavefront clears grain, slow motion begins | muted click, low-pass whoosh, drop into underwater bed |
| 0:01.8–0:05.5 | text: "shut the world off for 60 seconds" | bed breathes with the visual cadence |
| 0:05–0:20 | glass marbles + holographic stars in caustic water | bubbles + pentatonic glass chimes on each collision |
| 0:20–0:35 | orbs dissolve into micro-beads and star confetti swirl | rainstick panned with the swirl, chimes on current merges |
| 0:35–0:48 | rose-amber / magenta / violet aurora, bokeh, star lights, dimming | warm pad, D add9 to Bm7 to Gmaj7 |
| 0:48–0:60 | indigo void, prism dust with rainbow glints | resolving D chord thins out, silent at 60.0 s |
| 0:50–0:55 | "unclench your jaw. drop your shoulders." | |
| 0:56–0:59.5 | "see you next time." | |

A 3 px, 25 % opacity progress line fills along the bottom edge. Text stays centered inside the middle 50 % of the frame.
