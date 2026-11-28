#!/usr/bin/env bash
# Stitches 7 generated clips to the exact cut points of the reference video,
# adds the on-screen captions, and lays the original audio underneath.
#
# Put your clips in ./clips named 01.mp4 ... 07.mp4, then run: ./assemble.sh
# Optional: shift where each clip starts (seconds) to line a squish up with a crunch:
#   OFF3=0.4 ./assemble.sh     (starts clip 03 0.4s in)
set -euo pipefail
cd "$(dirname "$0")"

FONT=${FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf}
AUDIO=${AUDIO:-original_audio.m4a}
OUT=${OUT:-nostalgia_minis.mp4}

# Segment lengths taken from the reference cuts (1.97, 6.20, 10.97, 12.47, 14.63, 15.70, 18.73)
DUR=(1.97 4.23 4.77 1.50 2.16 1.07 3.03)
L1=("90s nostalgia ASMR" "wax" "nail polish" "wax" "nail polish" "wax" "nail polish")
L2=("*wax vs. nail polish*" "1 layer" "1 layer" "2 layers" "2 layers" "3 layers" "3 layers")
L3=("~1 vs. 2 vs. 3 layers~" "" "" "" "" "" "")

inputs=(); filters=""; concat=""
for i in 0 1 2 3 4 5 6; do
  n=$((i+1)); f=$(printf "clips/%02d.mp4" "$n")
  [[ -f $f ]] || { echo "missing $f"; exit 1; }
  offvar="OFF$n"; off=${!offvar:-0}
  inputs+=(-ss "$off" -t "${DUR[$i]}" -i "$f")
  txt="drawtext=fontfile=$FONT:fontcolor=white:fontsize=34:shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-text_w)/2"
  dt="$txt:text='${L1[$i]}':y=150"
  dt="$dt,$txt:text='${L2[$i]}':y=192"
  [[ -n ${L3[$i]} ]] && dt="$dt,$txt:text='${L3[$i]}':y=234"
  filters+="[$i:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,trim=duration=${DUR[$i]},setpts=PTS-STARTPTS,$dt[v$i];"
  concat+="[v$i]"
done
filters+="${concat}concat=n=7:v=1:a=0[v]"

ffmpeg -y "${inputs[@]}" -i "$AUDIO" -filter_complex "$filters" \
  -map "[v]" -map 7:a -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k \
  -t 18.73 -movflags +faststart "$OUT"
echo "done -> $OUT"
