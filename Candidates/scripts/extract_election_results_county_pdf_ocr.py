# Candidates/scripts/extract_election_results_county_pdf_ocr.py
#
# Stage 1 OCR variant for county-hosted summary-results PDFs that have no
# embedded text layer at all: confirmed via pdfplumber returning zero
# characters on every page for Campbell, Johnson, Washakie, Weston, and
# Teton counties' 2026 primary reports (each page carries a single scanned
# image and nothing else). extract_election_results_county_pdf.py cannot
# read these regardless of how its regexes are tuned; there is no text
# layer to tune against.
#
# This script rasterizes each page with PyMuPDF, OCRs it with tesseract
# (via pytesseract), reconstructs layout-aware lines from tesseract's
# word-level bounding boxes (grouped by block/paragraph/line, sorted
# left-to-right within a line, iterated in the top-to-bottom reading order
# tesseract already returns), and hands the result to
# extract_election_results_county_pdf.run_from_text(), the SAME parser,
# SAME per-contest reconciliation gate (sum of rows must exactly equal the
# source's own printed Contest Totals / Total Votes Cast line), and SAME
# CSV contract the text-layer script uses. Nothing about the safety
# discipline is loosened for OCR input: a misread digit makes a contest's
# sum disagree with its printed total, which makes that contest fail
# reconciliation and get withheld, exactly like a bad text-layer contest
# would. OCR only changes where the text comes from, never what counts as
# verified.
#
# Requires the real tesseract binary, not just the pytesseract wrapper.
# This machine has no passwordless sudo, so tesseract-ocr cannot be
# apt-installed normally. Run scripts/setup_local_tesseract.sh once first
# -- it downloads and extracts the .deb packages into
# ~/.local/share/tesseract-local without root, and this script finds it
# there automatically. A machine with a real system tesseract install
# (`which tesseract` succeeds) needs no setup step at all.
#
# CRITICAL: OCR accuracy depends heavily on --dpi and --psm. Confirmed on
# Washakie's 2026 report during development: 400 DPI reconciled 21 of 39
# local contests against 18 of 39 at 300 DPI, for about 4 extra seconds on
# a 13-page report, so it's the default. --psm 6 ("assume a single uniform
# block of text") was the working page-segmentation mode for that report;
# a different county's scan quality or layout may need --psm 4 ("assume a
# single column of text of variable sizes") or a still-higher --dpi. Even
# at the better setting, most of a scanned county's contests will likely
# still fail reconciliation and get correctly withheld -- this adapter
# recovers a meaningful fraction of a county that was previously 0%
# available, not a clean sweep. Always inspect --save-ocr-text output
# by eye for a new county before trusting its reconciliation results --
# the gate catches wrong digits, but it cannot catch an entire contest
# section OCR skipped or merged into another one, which shows up as a
# quieter symptom (fewer contests than the source actually has) rather
# than a loud reconciliation failure.

import argparse
import hashlib
import importlib.util
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import fitz  # PyMuPDF
import pytesseract
from PIL import Image

_SPEC = importlib.util.spec_from_file_location(
    "county_pdf_text", Path(__file__).resolve().parent / "extract_election_results_county_pdf.py"
)
county_pdf_text = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(county_pdf_text)

TESSERACT_LOCAL = Path.home() / ".local/share/tesseract-local"


def configure_tesseract():
    """Point pytesseract at the local, root-free install if one exists;
    otherwise fall back to a system tesseract if this machine has one."""
    binary = TESSERACT_LOCAL / "usr/bin/tesseract"
    if binary.exists():
        pytesseract.pytesseract.tesseract_cmd = str(binary)
        tessdata = TESSERACT_LOCAL / "usr/share/tesseract-ocr/4.00/tessdata"
        libdir = TESSERACT_LOCAL / "usr/lib/x86_64-linux-gnu"
        os.environ["TESSDATA_PREFIX"] = str(tessdata)
        os.environ["LD_LIBRARY_PATH"] = str(libdir) + os.pathsep + os.environ.get("LD_LIBRARY_PATH", "")
        return
    if shutil.which("tesseract"):
        return
    print(
        "tesseract not found. Run `bash scripts/setup_local_tesseract.sh` once "
        "to install it locally without root (this machine has no passwordless "
        "sudo), or install tesseract-ocr system-wide.",
        file=sys.stderr,
    )
    sys.exit(1)


def page_to_lines(page, dpi, psm):
    """Rasterize one page and OCR it, reconstructing pdfplumber-style
    label-then-value text lines from tesseract's word boxes. Grayscale
    rendering, not color, since these are black-text-on-white government
    reports and color adds nothing but slower OCR."""
    zoom = dpi / 72
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)

    data = pytesseract.image_to_data(
        img, config=f"--psm {psm}", output_type=pytesseract.Output.DICT
    )

    lines_by_key = {}
    order = []
    for i in range(len(data["text"])):
        word = data["text"][i].strip()
        if not word:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        if key not in lines_by_key:
            lines_by_key[key] = []
            order.append(key)
        lines_by_key[key].append((data["left"][i], word))

    lines = []
    for key in order:
        words = sorted(lines_by_key[key], key=lambda t: t[0])
        lines.append(" ".join(w for _, w in words))
    return lines


def ocr_pdf_text(pdf_path, dpi, psm, first_page, last_page):
    doc = fitz.open(pdf_path)
    try:
        start = (first_page - 1) if first_page else 0
        end = last_page if last_page else len(doc)
        all_lines = []
        for i in range(start, end):
            print(f"  OCR page {i + 1}/{len(doc)} ...", file=sys.stderr)
            all_lines.extend(page_to_lines(doc[i], dpi, psm))
        return "\n".join(all_lines)
    finally:
        doc.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    county_pdf_text.add_common_args(p)
    p.add_argument(
        "--dpi", type=int, default=400,
        help="Rasterization resolution before OCR. 400 measurably beat 300 on real "
             "2026 Washakie data (21/39 vs 18/39 contests reconciled); still under 15s "
             "for a 13-page county report, so there's little cost to defaulting high.",
    )
    p.add_argument(
        "--psm", type=int, default=6,
        help="Tesseract page segmentation mode. 6 = single uniform block (default), "
             "4 = single column of variable-size text. Try 4 if 6 merges columns badly.",
    )
    p.add_argument("--first-page", type=int, default=None, help="1-indexed, inclusive.")
    p.add_argument("--last-page", type=int, default=None, help="1-indexed, inclusive.")
    p.add_argument(
        "--save-ocr-text", default=None,
        help="Also write the raw OCR'd text here, for eyeballing before trusting the CSV.",
    )
    args = p.parse_args()

    configure_tesseract()

    with open(args.pdf, "rb") as f:
        args.sha256 = hashlib.sha256(f.read()).hexdigest()
    args.retrieved_at = args.retrieved_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    full_text = ocr_pdf_text(args.pdf, args.dpi, args.psm, args.first_page, args.last_page)
    if args.save_ocr_text:
        Path(args.save_ocr_text).write_text(full_text, encoding="utf-8")
        print(f"OCR text saved to {args.save_ocr_text}", file=sys.stderr)

    county_pdf_text.run_from_text(full_text, args)


if __name__ == "__main__":
    main()
