# 90s Nostalgia Minis: wax vs. nail polish

Format copies the reference video beat for beat: 18.73s, 9:16, 7 shots, same audio.

## Timing map (locked to the original audio)

| # | Shot | Starts | Length | Caption | Squish beats (sec into the clip) |
|---|------|--------|--------|---------|------|
| 01 | Opener: all 6 on the tray | 0.00 | 1.97 | 90s nostalgia ASMR / \*wax vs. nail polish\* / ~1 vs. 2 vs. 3 layers~ | none, audio is silent until 2.19 |
| 02 | Wax 1: Tamagotchi egg | 1.97 | 4.23 | wax / 1 layer | 0.2-0.9 first crack, 1.7-2.3 press, 3.0-3.7 crumble |
| 03 | Nail polish 1: cassette | 6.20 | 4.77 | nail polish / 1 layer | 0.35 peel start, 1.25-1.55, 2.25-2.4, 2.95-3.5 big squish, 3.9-4.05 |
| 04 | Wax 2: Furby face | 10.97 | 1.50 | wax / 2 layers | 0.3-0.6 crack, 1.1 |
| 05 | Nail polish 2: Game Boy | 12.47 | 2.16 | nail polish / 2 layers | 0.3-0.5, 0.8, 1.2-1.5 |
| 06 | Wax 3: flip phone | 14.63 | 1.07 | wax / 3 layers | 0.2-0.6 one hard crack |
| 07 | Nail polish 3: roller skate | 15.70 | 3.03 | nail polish / 3 layers | 0.2-0.65, 1.05-1.35, 1.9-2.45, 2.8 |

Wax = matte opaque shell that cracks into flakes. Nail polish = glossy shell that peels like a film. Every nail polish shell is cute bubblegum pink. Peeling it shows the object's real color underneath (neon cassette, purple Game Boy, white skate). That keeps the pink request and the purple Game Boy from fighting each other.

## Shared style block (paste at the end of every prompt)

> Vertical 9:16, locked-off overhead camera looking straight down at a warm beige tabletop. Two female hands with almond-shaped nails in soft pink polish. Soft warm key light, shallow depth of field. Background, softly out of focus: 1980s toys on a shelf, a colorful 3x3 puzzle cube, a pastel rainbow toy pony, a plush bear with a rainbow on its tummy, a yellow portable cassette player with orange foam headphones, a neon slap bracelet, warm fairy light bokeh in pink and orange. Squishy oversized clay toy with chunky rounded proportions, no text, no thin parts. Real ASMR footage, photorealistic, satisfying, slow pressure.

## Shot prompts

**01 Opener (2s)**
> Overhead shot of a round warm honey-wood tray holding six chunky clay toys packed close together: a pastel lavender egg-shaped virtual pet with a blank pink screen, a neon cassette tape with rounded edges, a fluffy round owl-like toy face with big eyes and a small beak, a translucent purple handheld game console with chunky buttons, a fat pink flip phone that is closed, a white and pink roller skate with big round wheels. Hands rest at the bottom edge, fingertips touching the tray. Nothing moves except a tiny hand settle. [style block]

**02 Wax 1 layer: Tamagotchi egg (4.2s)**
> Hands hold a palm-sized pastel lavender egg-shaped virtual pet toy coated in one thin matte wax shell. Both thumbs press into the center. The wax cracks in a web, flakes pop off, soft clay squishes out between the fingers. [style block]

**03 Nail polish 1 layer: neon cassette (4.8s)**
> Hands hold a chunky rounded cassette tape toy coated in one glossy bubblegum pink nail polish shell, neon green and orange showing faintly through. Thumbs press, the pink shell wrinkles and peels like a film, revealing neon colors, clay bulges up. [style block]

**04 Wax 2 layers: Furby face (1.5s)**
> Hands hold a round fluffy-textured owl-like toy face with big eyes, coated in two layers of thick matte wax. Thumbs press hard, the wax shell splits in two big cracks. [style block]

**05 Nail polish 2 layers: Game Boy (2.2s)**
> Hands hold a chunky translucent purple handheld game console toy with big rounded buttons and a blank screen, coated in two layers of glossy bubblegum pink nail polish. Thumbs press the middle, the thick pink shell folds and peels back to show purple clay. [style block]

**06 Wax 3 layers: flip phone (1.1s)**
> Hands hold a fat rounded pink flip phone toy, closed, coated in three thick layers of matte wax. One hard thumb press, the shell cracks loudly into large chunks. [style block]

**07 Nail polish 3 layers: roller skate (3s)**
> Hands hold a chunky white roller skate toy with big round pink wheels, coated in three thick layers of glossy bubblegum pink nail polish. Fingers squeeze and twist, the thick shell stretches, splits and peels off in a long pink sheet. [style block]

## Build steps

1. Generate each shot in Kling, Veo, Sora or Runway at 5s. For 02-07, upload a still of the tray from shot 01 as a reference image so the objects match.
2. Save them as `clips/01.mp4` ... `clips/07.mp4`.
3. Run `./assemble.sh`. It cuts each clip to the exact length, adds the captions, and puts the original audio under it. Output: `nostalgia_minis.mp4`.
4. If a squish lands early or late against a crunch, shift that clip's start: `OFF3=0.4 ./assemble.sh` starts clip 03 0.4s in.
