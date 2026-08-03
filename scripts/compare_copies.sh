#!/usr/bin/env bash
# Reports size, modification time and frame signatures for every copy of the
# episode, so it is obvious which one is stale and which one is being watched.
set -uo pipefail

name='July 22 250710_1714'
copies=(
  "/mnt/c/Users/ancho/Downloads/$name.mp4"
  "/mnt/c/Users/ancho/OneDrive/Desktop/Episode Test Output/July 22 WITH MEMES.mp4"
)

frames_out='/mnt/c/Users/ancho/OneDrive/Desktop/Episode Test Output/frames'
mkdir -p "$frames_out"

i=0
for f in "${copies[@]}"; do
  i=$((i + 1))
  echo "=== copy $i ==="
  echo "  path: $f"
  if [[ ! -f "$f" ]]; then
    echo "  MISSING"
    echo
    continue
  fi
  echo "  size:     $(stat -c%s "$f") bytes"
  echo "  modified: $(stat -c%y "$f")"
  echo "  duration: $(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f")"

  for t in 60 250 340 400; do
    sig=$(ffmpeg -nostdin -y -ss $t -i "$f" -frames:v 1 -vf "scale=4:4,format=gray" \
          -f rawvideo - 2>/dev/null | od -An -tu1 | tr -s ' ' | tr -d '\n')
    echo "    t=${t}s sig:$sig"
    ffmpeg -nostdin -y -ss $t -i "$f" -frames:v 1 -vf "scale=480:-1" \
      "$frames_out/copy${i}-t${t}.png" >/dev/null 2>&1
  done
  echo
done

echo "Frames written to $frames_out as copy1-*.png and copy2-*.png"
