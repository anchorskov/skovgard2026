#!/usr/bin/env python3
"""Turn a render plan into ffmpeg arguments for build_still_video.sh.

Reads the <name>-render.json written by MakeVideo.ps1 and prints:

    line 1      the filter_complex fragment
    lines 2..n  extra ffmpeg input arguments, one per line

The fragment consumes a base video label and produces [vout]. Every meme is a
full-frame 16:9 still, the same shape as the video, so it cross-fades over the
cover rather than sitting on top of it as a badge.

Usage:
    meme_plan_args.py PLAN.json --first-index N [--base-label LABEL]
                                [--size WxH] [--out-label LABEL] [--fps N]

--first-index is the ffmpeg input index the first meme will occupy, i.e. the
number of inputs the calling script already has. Get it wrong and the overlays
reference the wrong streams, so pass it explicitly.

Note on scaling: the cover is fitted with scale-up-and-crop, but memes are
padded instead. A meme carries hand-lettered text along its bottom edge, and
cropping would cut it off if the image ever comes back at an unexpected aspect
ratio. Padding is white, which matches the paper background of the artwork.
"""

import argparse
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("--first-index", type=int, required=True)
    ap.add_argument("--base-label", default="0:v")
    ap.add_argument("--out-label", default="vout")
    ap.add_argument("--size", default="1280x720")
    ap.add_argument("--fps", type=int, default=30)
    args = ap.parse_args()

    try:
        with open(args.plan, "r", encoding="utf-8-sig") as fh:
            plan = json.load(fh)
    except (OSError, ValueError) as exc:
        print(f"could not read plan {args.plan}: {exc}", file=sys.stderr)
        return 2

    memes = plan.get("memes") or []
    fade = float(plan.get("fade", 0.4))
    duration = float(plan.get("duration", 0) or 0)

    try:
        width, height = (int(v) for v in args.size.lower().split("x"))
    except ValueError:
        print(f"bad --size {args.size!r}, expected WxH", file=sys.stderr)
        return 2

    # Sort and reject overlaps here as well as in the GUI: this script can be
    # run by hand on a plan nobody reviewed.
    memes = sorted(memes, key=lambda m: float(m["start"]))
    prev_end = None
    for m in memes:
        start, end = float(m["start"]), float(m["end"])
        if end <= start:
            print(f"empty range for {m.get('caption','?')!r}", file=sys.stderr)
            return 2
        if duration and end > duration + 0.5:
            print(f"{m.get('caption','?')!r} ends after the audio does", file=sys.stderr)
            return 2
        # In tiled mode each segment deliberately runs a fade past the next one's
        # start, so the incoming image cross-fades over the outgoing one rather
        # than briefly revealing the base layer. Allow exactly that much.
        if prev_end is not None and start < prev_end - fade - 0.05:
            print(f"{m.get('caption','?')!r} overlaps the meme before it", file=sys.stderr)
            return 2
        prev_end = end

    if not memes:
        # Nothing to place: hand the base straight through so the caller can
        # use the same filtergraph either way.
        print(f"[{args.base_label}]null[{args.out_label}]")
        return 0

    inputs = []
    chains = []
    current = args.base_label

    for i, m in enumerate(memes):
        idx = args.first_index + i
        start, end = float(m["start"]), float(m["end"])

        # Keep the fade inside the visible window so the meme is fully opaque
        # for at least a moment, even on a short hold.
        f = min(fade, max(0.05, (end - start) / 3.0))
        fade_out_at = end - f

        # A tiled segment is covered by the next image rather than being faded
        # away, so fading it out would dip both layers and flash the base.
        want_fade_out = m.get("fadeOut", True)

        filters = [
            f"scale={width}:{height}:force_original_aspect_ratio=decrease",
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=white",
            "setsar=1",
            "format=rgba",
            f"fade=t=in:st={start:.3f}:d={f:.3f}:alpha=1",
        ]
        if want_fade_out:
            filters.append(f"fade=t=out:st={fade_out_at:.3f}:d={f:.3f}:alpha=1")

        inputs.extend(["-loop", "1", "-framerate", str(args.fps), "-i", m["image"]])
        chains.append(f"[{idx}:v]" + ",".join(filters) + f"[m{i}]")

        nxt = args.out_label if i == len(memes) - 1 else f"ov{i}"
        chains.append(
            f"[{current}][m{i}]overlay=0:0:"
            f"enable='between(t,{start:.3f},{end:.3f})'[{nxt}]"
        )
        current = nxt

    print(";".join(chains))
    for a in inputs:
        print(a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
