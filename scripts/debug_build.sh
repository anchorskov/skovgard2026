#!/usr/bin/env bash
# Checks whether the drives holding the media are actually visible from WSL,
# then rebuilds one episode with the meme plan and reports every exit code.

cd "$(dirname "${BASH_SOURCE[0]}")/.."

dl=/mnt/c/Users/ancho/Downloads
name='July 22 250710_1714'
plan="$dl/$name-render.json"
audio_g='/mnt/g/My Drive/Skovgard Media/26 July/July 22 250710_1714.mp3'
audio_c="$dl/$name.mp3"

echo "=== what WSL can see ==="
echo "  mounted drives:"
ls /mnt | sed 's/^/    \/mnt\//'
echo
for f in "$audio_g" "$audio_c"; do
  if [[ -f "$f" ]]; then
    echo "  ok      $f"
  else
    echo "  MISSING $f"
  fi
done
echo

audio=""
[[ -f "$audio_g" ]] && audio="$audio_g"
[[ -z "$audio" && -f "$audio_c" ]] && audio="$audio_c"
if [[ -z "$audio" ]]; then
  echo "Neither audio path is reachable from WSL. That is the whole problem."
  exit 1
fi
echo "Using audio: $audio"
echo

echo "=== build ==="
rm -f "$dl/debug-out.mp4"
bash scripts/build_still_video.sh \
  --audio "$audio" \
  --image "$dl/$name-cover.png" \
  --output "$dl/debug-out.mp4" \
  --plan "$plan" 2>&1 | grep -Ev '^( *(built with|configuration:|lib[a-z]+ )|ffmpeg version)' | tail -30
echo "  build exit code: ${PIPESTATUS[0]}"
echo

echo "=== result ==="
if [[ -f "$dl/debug-out.mp4" ]]; then
  echo "  debug-out.mp4: $(stat -c%s "$dl/debug-out.mp4") bytes"
  out='/mnt/c/Users/ancho/OneDrive/Desktop/Episode Test Output/frames'
  mkdir -p "$out"
  for t in 104 111 306; do
    ffmpeg -nostdin -y -ss $t -i "$dl/debug-out.mp4" -frames:v 1 -vf "scale=480:-1" \
      "$out/debug-t${t}.png" >/dev/null 2>&1
    echo "  wrote debug-t${t}.png"
  done
else
  echo "  no output file produced"
fi
