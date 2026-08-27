#!/usr/bin/env python3
"""Normalize a reviewed Markdown transcription of a county summary report.

The Markdown must contain one or more fenced ``text`` blocks in the same
layout consumed by extract_election_results_county_pdf.py. An optional JSON
file can replace explicitly named contest blocks when visual PDF review found
that the Markdown's embedded OCR scrambled line order or characters.

The underlying county parser still performs the normal per-contest arithmetic
gate. A replacement supplies source-printed values, not an exception to that
gate. The emitted snapshot hash identifies the exact corrected text passed to
the parser, while the JSON records hashes for both source artifacts.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import extract_election_results_county_pdf as county_parser


PARSER_NAME = "verified_markdown_transcription_v1"
PARSER_VERSION = "1.0.0"


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def fenced_text(path):
    content = Path(path).read_text(encoding="utf-8")
    blocks = re.findall(r"```text\s*\n(.*?)\n```", content, flags=re.DOTALL | re.IGNORECASE)
    if not blocks:
        raise ValueError(f"No fenced text blocks found in {path}")
    return "\n".join(blocks)


def contest_starts(lines):
    starts = []
    for index, line in enumerate(lines):
        if not county_parser.looks_like_contest_header(line.strip()):
            continue
        next_index = index + 1
        while next_index < len(lines) and not lines[next_index].strip():
            next_index += 1
        if next_index < len(lines) and county_parser.VOTE_FOR_RE.match(lines[next_index].strip()):
            starts.append(index)
    return starts


def replacement_lines(contest):
    lines = [contest["contest_header"], f"Vote For {contest['vote_for']}", "TOTAL VOTE %"]
    for row in contest["rows"]:
        lines.append(f"{row['label']} {int(row['votes'])}")
    lines.append(f"Contest Totals {int(contest['contest_total'])}")
    return lines


def apply_overrides(text, override_data):
    lines = text.splitlines()
    overrides = override_data.get("contests", [])
    for contest in overrides:
        starts = contest_starts(lines)
        matching = [index for index in starts if lines[index].strip() == contest["contest_header"]]
        if len(matching) != 1:
            raise ValueError(
                f"Expected exactly one contest block named {contest['contest_header']!r}; "
                f"found {len(matching)}"
            )
        start = matching[0]
        later_starts = [index for index in starts if index > start]
        end = later_starts[0] if later_starts else len(lines)
        lines[start:end] = replacement_lines(contest) + [""]
    return "\n".join(lines)


def validate_artifacts(args, override_data):
    expected_pdf = override_data.get("source_pdf_sha256")
    if expected_pdf and sha256_file(args.pdf) != expected_pdf:
        raise ValueError(f"Source PDF hash does not match the reviewed artifact: {args.pdf}")

    expected_md = override_data.get("verified_markdown_sha256")
    if expected_md and sha256_file(args.verified_md) != expected_md:
        raise ValueError(
            f"Verified Markdown hash does not match the reviewed artifact: {args.verified_md}"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verified-md", required=True)
    parser.add_argument("--overrides-json")
    county_parser.add_common_args(parser)
    args = parser.parse_args()

    override_data = {}
    if args.overrides_json:
        override_data = json.loads(Path(args.overrides_json).read_text(encoding="utf-8"))

    try:
        validate_artifacts(args, override_data)
        text = fenced_text(args.verified_md)
        if override_data:
            text = apply_overrides(text, override_data)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"Verified-transcription input error: {exc}", file=sys.stderr)
        sys.exit(1)

    args.sha256 = hashlib.sha256(text.encode("utf-8")).hexdigest()
    args.parser_name = PARSER_NAME
    args.parser_version = PARSER_VERSION
    if not args.retrieved_at:
        args.retrieved_at = county_parser.datetime.now(
            county_parser.timezone.utc
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

    county_parser.run_from_text(text, args)


if __name__ == "__main__":
    main()
