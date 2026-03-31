#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/build_still_video.sh \
    --audio /path/to/input.mp3 \
    --image /path/to/input.png \
    --output /path/to/output.mp4 \
    [--size 1280x720] \
    [--crop-x 0] \
    [--crop-y 0] \
    [--prepared-image /path/to/prepared.png] \
    [--review-only]

Defaults:
  --size 1280x720
  --crop-x center
  --crop-y center

Examples:
  scripts/build_still_video.sh \
    --audio "/mnt/c/Users/ancho/Downloads/EPISODE_AUDIO.mp3" \
    --image "/mnt/c/Users/ancho/OneDrive/Pictures/Art/March/EPISODE_ART.png" \
    --output "/mnt/c/Users/ancho/Downloads/EPISODE_OUTPUT.mp4"

  scripts/build_still_video.sh \
    --audio "/mnt/c/Users/ancho/Downloads/EPISODE_AUDIO.mp3" \
    --image "/mnt/c/Users/ancho/OneDrive/Pictures/Art/March/EPISODE_ART.png" \
    --output "/mnt/c/Users/ancho/Downloads/EPISODE_OUTPUT.mp4" \
    --crop-y 40

  scripts/build_still_video.sh \
    --audio "/mnt/c/Users/ancho/Downloads/EPISODE_AUDIO.mp3" \
    --image "/mnt/c/Users/ancho/OneDrive/Pictures/Art/March/EPISODE_ART.png" \
    --output "/mnt/c/Users/ancho/Downloads/EPISODE_OUTPUT.mp4" \
    --review-only
EOF
}

audio=""
image=""
output=""
size="1280x720"
crop_x="center"
crop_y="center"
prepared_image=""
review_only="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --audio)
      audio="${2:-}"
      shift 2
      ;;
    --image)
      image="${2:-}"
      shift 2
      ;;
    --output)
      output="${2:-}"
      shift 2
      ;;
    --size)
      size="${2:-}"
      shift 2
      ;;
    --crop-x)
      crop_x="${2:-}"
      shift 2
      ;;
    --crop-y)
      crop_y="${2:-}"
      shift 2
      ;;
    --prepared-image)
      prepared_image="${2:-}"
      shift 2
      ;;
    --review-only)
      review_only="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$audio" || -z "$output" ]]; then
  echo "--audio and --output are required" >&2
  usage >&2
  exit 1
fi

if [[ -z "$prepared_image" && -z "$image" ]]; then
  echo "Provide either --image or --prepared-image" >&2
  usage >&2
  exit 1
fi

if [[ ! -f "$audio" ]]; then
  echo "Audio file not found: $audio" >&2
  exit 1
fi

if [[ -n "$image" && ! -f "$image" ]]; then
  echo "Image file not found: $image" >&2
  exit 1
fi

if [[ -n "$prepared_image" && ! -f "$prepared_image" ]]; then
  echo "Prepared image not found: $prepared_image" >&2
  exit 1
fi

if [[ ! "$size" =~ ^[0-9]+x[0-9]+$ ]]; then
  echo "Invalid --size value: $size" >&2
  exit 1
fi

width="${size%x*}"
height="${size#*x}"

if [[ -n "$prepared_image" ]]; then
  image_input="$prepared_image"
else
  mkdir -p /tmp/skovgard-media-work/out

  base_name="$(basename "$output" .mp4)"
  prepared_png="/tmp/skovgard-media-work/out/${base_name}-${size}.png"
  crop_x_expr="(iw-${width})/2"
  crop_y_expr="(ih-${height})/2"

  if [[ "$crop_x" != "center" ]]; then
    crop_x_expr="$crop_x"
  fi

  if [[ "$crop_y" != "center" ]]; then
    crop_y_expr="$crop_y"
  fi

  image_filter="scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:${crop_x_expr}:${crop_y_expr}"

  echo "Preparing PNG: $prepared_png"
  ffmpeg -y \
    -i "$image" \
    -vf "$image_filter" \
    "$prepared_png"

  image_input="$prepared_png"
fi

echo "Prepared image: $image_input"

if [[ "$review_only" == "true" ]]; then
  echo "Review-only mode enabled. Inspect the prepared PNG before building the MP4." >&2
  echo "If bottom text is clipped, rerun with --crop-y or pass --prepared-image after manual adjustment." >&2
  exit 0
fi

mkdir -p "$(dirname "$output")"

echo "Building MP4: $output"
ffmpeg -y \
  -loop 1 \
  -framerate 30 \
  -i "$image_input" \
  -i "$audio" \
  -c:v libx264 \
  -tune stillimage \
  -pix_fmt yuv420p \
  -r 30 \
  -g 300 \
  -c:a aac \
  -b:a 128k \
  -movflags +faststart \
  -shortest \
  "$output"

echo "Output video: $output"
