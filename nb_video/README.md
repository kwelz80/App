# N B brick-breaker video

Recreation of the reference "ball breaks out of the letter" video with the letters **N B**,
yellow and red bricks, and white balls. Output: `NB_brick_breaker.mp4`
(1080x1920, 60 fps, 3112 frames = 51.87 s, same length as the reference).

- `level.py` – 50x50 grid: N and B channels, gray walls, yellow (left) / red (right) bricks, gates
- `sim.py` – point-ball physics on the grid, power-up schedule (same catch times as the reference), paddle AI
- `render.py` – draws frames with Pillow, pipes them to ffmpeg, builds the tick audio
- `tune_angles.py` / `tune_curve.py` – scans used to pick launch angles and the random seed

Rebuild: `python3 render.py video <outdir>` (needs ffmpeg, numpy, Pillow).
