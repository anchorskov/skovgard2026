#!/usr/bin/env bash
# Pull sample frames out of a built episode so they can be looked at directly,
# rather than trusted to a similarity score.
#
#   extract_frames.sh OUTPUT.mp4 DEST_DIR [seconds...]
set -euo pipefail

mp4="${1:?usage: extract_frames.sh OUTPUT.mp4 DEST_DIR [seconds...]}"
dest="${2:?usage: extract_frames.sh OUTPUT.mp4 DEST_DIR [seconds...]}"
shift 2
times=("$@")
if [[ ${#times[@]} -eq 0 ]]; then
  times=(10 104 111 114 306 308 400)
fi

mkdir -p "$dest"
rm -f "$dest"/t*.png

echo "Source: $mp4"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$mp4" \
  | awk '{printf "Duration: %.1f seconds\n", $1}'
echo

for t in "${times[@]}"; do
  ffmpeg -nostdin -y -ss "$t" -i "$mp4" -frames:v 1 -vf "scale=480:-1" \
    "$dest/t${t}.png" >/dev/null 2>&1 || true
  if [[ -f "$dest/t${t}.png" ]]; then
    # Mean brightness makes an identical run of frames obvious at a glance.
    mean=$(ffmpeg -nostdin -i "$dest/t${t}.png" -vf "scale=1:1,format=gray" \
             -f rawvideo - 2>/dev/null | od -An -tu1 | tr -d ' ')
    echo "  t=${t}s  written, mean grey ${mean:-?}"
  else
    echo "  t=${t}s  FAILED"
  fi
done

echo
echo "Frames in $dest"
