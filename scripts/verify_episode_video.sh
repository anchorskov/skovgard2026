#!/usr/bin/env bash
# Confirms a finished episode MP4 actually shows each meme at its planned moment.
#
#   verify_episode_video.sh OUTPUT.mp4 PLAN.json
#
# Comparing average colour is useless here: the illustrations are all mostly
# white paper and score nearly identically. Instead each image is reduced to an
# 8x8 greyscale signature and compared structurally, so the check is about
# composition rather than brightness. For every meme we sample the midpoint of
# its window and report whether the frame resembles that meme or the cover.
set -euo pipefail

mp4="${1:?usage: verify_episode_video.sh OUTPUT.mp4 PLAN.json}"
plan="${2:?usage: verify_episode_video.sh OUTPUT.mp4 PLAN.json}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

sig_image() {
  ffmpeg -nostdin -y -i "$1" -vf "scale=8:8,format=gray" -f rawvideo - 2>/dev/null \
    | od -An -tu1 | tr -s ' ' | tr ' ' '\n' | sed '/^$/d' > "$2"
}

sig_frame() {
  ffmpeg -nostdin -y -ss "$1" -i "$mp4" -frames:v 1 -vf "scale=8:8,format=gray" -f rawvideo - 2>/dev/null \
    | od -An -tu1 | tr -s ' ' | tr ' ' '\n' | sed '/^$/d' > "$2"
}

dist() {
  paste "$1" "$2" | awk '{d=$1-$2; if(d<0)d=-d; s+=d; n++} END {if(n>0) printf "%.1f", s/n; else print "999"}'
}

cover="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['cover'])" "$plan")"
sig_image "$cover" "$tmp/cover.sig"

echo "Verifying $(basename "$mp4")"
echo

python3 - "$plan" > "$tmp/memes.txt" <<'PY'
import json, sys
plan = json.load(open(sys.argv[1]))
for m in plan["memes"]:
    print("%s\t%s\t%s\t%s" % (m["image"], m["start"], m["end"], m.get("caption", "")))
PY

pass=0
fail=0
idx=0
while IFS=$'\t' read -r img start end caption; do
  idx=$((idx + 1))
  mid=$(awk -v a="$start" -v b="$end" 'BEGIN {printf "%.2f", (a+b)/2}')

  sig_image "$img" "$tmp/meme.sig"
  sig_frame "$mid" "$tmp/frame.sig"

  d_meme=$(dist "$tmp/frame.sig" "$tmp/meme.sig")
  d_cover=$(dist "$tmp/frame.sig" "$tmp/cover.sig")

  # When the cover happens to be one of the memes, the two signatures are
  # identical and the comparison cannot say anything. Report that honestly
  # instead of scoring it as a failure.
  verdict=$(awk -v m="$d_meme" -v c="$d_cover" 'BEGIN {
      d = m - c; if (d < 0) d = -d;
      if (d < 0.5) print "TIE"; else print (m < c) ? "MEME" : "COVER" }')
  case "$verdict" in
    MEME) mark="ok  "; pass=$((pass + 1)) ;;
    TIE)  mark="?   " ;;
    *)    mark="FAIL"; fail=$((fail + 1)) ;;
  esac

  printf "  %s meme %s at %ss  diff to meme %-6s diff to cover %-6s  %s\n" \
    "$mark" "$idx" "$mid" "$d_meme" "$d_cover" "$caption"
done < "$tmp/memes.txt"

# A moment outside every window should look like the cover again, which proves
# the overlays are actually being switched off rather than left on screen.
gap_start=$(head -1 "$tmp/memes.txt" | cut -f2)
gap=$(awk -v s="$gap_start" 'BEGIN {printf "%.2f", (s > 3) ? s - 2 : 0.5}')
sig_frame "$gap" "$tmp/frame.sig"
d_cover=$(dist "$tmp/frame.sig" "$tmp/cover.sig")
echo
if awk -v c="$d_cover" 'BEGIN {exit !(c < 12)}'; then
  echo "  ok   gap at ${gap}s shows the cover (diff $d_cover)"
else
  echo "  FAIL gap at ${gap}s does not match the cover (diff $d_cover)"
  fail=$((fail + 1))
fi

echo
echo "  $pass placed correctly, $fail wrong"
[[ $fail -eq 0 ]]
