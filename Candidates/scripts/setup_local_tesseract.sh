#!/bin/bash
# Candidates/scripts/setup_local_tesseract.sh
#
# Installs tesseract 4.1.1 and its runtime libraries into
# ~/.local/share/tesseract-local WITHOUT root/apt install, by downloading
# the .deb packages (apt-get download does not require root) and extracting
# them with dpkg -x (also does not require root or touch the system
# package database). Needed because this machine has no passwordless sudo
# and extract_election_results_county_pdf_ocr.py requires the real
# tesseract binary (pytesseract is just a subprocess wrapper around it).
#
# Re-running this script is safe and idempotent -- it just re-downloads and
# re-extracts into the same directory.
set -euo pipefail

DEST="$HOME/.local/share/tesseract-local"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Downloading tesseract packages to $WORK ..."
cd "$WORK"
apt-get download \
  tesseract-ocr \
  tesseract-ocr-eng \
  tesseract-ocr-osd \
  libtesseract4 \
  liblept5 \
  libarchive13

mkdir -p "$DEST"
for f in *.deb; do
  dpkg -x "$f" "$DEST"
done

echo "Verifying ..."
LD_LIBRARY_PATH="$DEST/usr/lib/x86_64-linux-gnu" \
TESSDATA_PREFIX="$DEST/usr/share/tesseract-ocr/4.00/tessdata" \
  "$DEST/usr/bin/tesseract" --version

echo
echo "Installed to $DEST"
echo "extract_election_results_county_pdf_ocr.py finds this automatically."
