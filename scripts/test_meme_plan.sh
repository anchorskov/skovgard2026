#!/usr/bin/env bash
# Verifies the --plan path of build_still_video.sh end to end, using generated
# audio and solid-colour stand-in memes. Costs nothing: no API calls, no real
# media. Samples frames from the finished MP4 and prints the colour found at
# each moment, so a wrong overlay time shows up as a wrong colour.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

work=/tmp/meme-plan-test
rm -rf "$work"
mkdir -p "$work"

echo "Generating test media in $work"
ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 30 "$work/audio.mp3" >/dev/null 2>&1
ffmpeg -y -f lavfi -i color=c=0x000080:s=1280x720 -frames:v 1 "$work/cover.png" >/dev/null 2>&1
ffmpeg -y -f lavfi -i color=c=0xC00000:s=1280x720 -frames:v 1 "$work/meme1.png" >/dev/null 2>&1
ffmpeg -y -f lavfi -i color=c=0x008000:s=1280x720 -frames:v 1 "$work/meme2.png" >/dev/null 2>&1

cat > "$work/plan.json" <<EOF
{
  "version": 1,
  "duration": 30,
  "fade": 0.4,
  "cover": "$work/cover.png",
  "memes": [
    { "image": "$work/meme1.png", "caption": "first meme",  "start": 5,  "end": 11 },
    { "image": "$work/meme2.png", "caption": "second meme", "start": 18, "end": 24 }
  ]
}
EOF

echo
echo "--- generated filtergraph ---"
python3 ./meme_plan_args.py "$work/plan.json" --first-index 2 --size 1280x720 | head -1
echo

echo "--- building ---"
./build_still_video.sh \
  --audio "$work/audio.mp3" \
  --image "$work/cover.png" \
  --output "$work/out.mp4" \
  --plan "$work/plan.json" 2>&1 | grep -Ev '^(frame|size|video:|\[)' || true

echo
echo "--- sampled frames ---"
echo "    expect navy outside the windows, red at 8s, green at 21s"
for t in 2 8 14 21 27; do
  rgb=$(ffmpeg -ss "$t" -i "$work/out.mp4" -frames:v 1 -vf "scale=1:1" \
        -f rawvideo -pix_fmt rgb24 - 2>/dev/null | od -An -tu1 | tr -s ' ')
  set -- $rgb
  r=${1:-0}; g=${2:-0}; b=${3:-0}
  name="unknown"
  if   [[ $b -gt 80 && $r -lt 80 && $g -lt 80 ]]; then name="navy  (cover)"
  elif [[ $r -gt 120 && $g -lt 90 ]];             then name="red   (meme 1)"
  elif [[ $g -gt 90 && $r -lt 90 ]];              then name="green (meme 2)"
  fi
  printf "    t=%-3ss  rgb=%3s,%3s,%3s  %s\n" "$t" "$r" "$g" "$b" "$name"
done

dest=/mnt/c/Users/ancho/OneDrive/Desktop/meme-plan-test.mp4
cp "$work/out.mp4" "$dest" 2>/dev/null && echo && echo "Test video copied to the Desktop as meme-plan-test.mp4"
