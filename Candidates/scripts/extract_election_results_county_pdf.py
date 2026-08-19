# Candidates/scripts/extract_election_results_county_pdf.py
#
# Stage 1 parser for the county-hosted "Summary Results Report" PDF format
# (confirmed on Albany and Campbell counties' verified 2024 results.
# same underlying report generator, evidenced by identical "Summary
# Results Report" / "Election Summary - MM/DD/YYYY HH:MMPM" markers).
# Outputs the SAME normalized CSV contract as
# extract_election_results_xlsx.py, see that file's header for the
# contract this is additive to, not a replacement for.
#
# CRITICAL: requires pdfplumber, not pypdf. pypdf's naive text extraction
# scrambles this report's layout into an unusable form (all candidate-name
# labels grouped separately from a trailing value block, order-dependent
# and un-recoverable without guessing). pdfplumber's layout-aware
# extraction preserves each line as label-then-value(s), which is what
# makes this parser possible at all. This was empirically confirmed, not
# assumed, see tests/fixtures/elections/2024-albany-county-hosted/README.md.
#
# Unlike the SOS xlsx sheets, this report has NO precinct-level grain.
# every row is already a county-wide total. It also has no free Total-row
# reconciliation checksum the way the SOS sheets do; this format's own
# "Contest Totals" line is used instead: sum(candidates + write-ins +
# overvotes + undervotes) must equal it exactly, per contest, or the
# script hard-fails rather than emit unverified data (same discipline as
# the xlsx adapter).
#
# Confirmed real-data anomalies this parser has to tolerate (do not
# "clean up" by assuming they can't recur):
#   - Trailer labels can themselves carry extraction artifacts, e.g.
#     "Contest -Totals" instead of "Contest Totals" (seen on Albany).
#     Matched by a whitespace/punctuation-insensitive comparison, not an
#     exact string.
#   - Candidate names can carry stray internal spaces/hyphens from PDF
#     kerning, e.g. "HARRIE - T HAGEMAN" for "HARRIET HAGEMAN" (seen on
#     Albany). NOT cleaned up here, candidate_name_raw is preserved
#     exactly as extracted; fixing this is election_candidate_aliases'
#     job (a human-reviewed alias table), not this parser's.
#   - A contest can have zero named candidates (fully write-in / nobody
#     filed), must not crash the parser or the reconciliation check.
#   - Reported "Vote For N" can be structurally inconsistent with the
#     candidate count actually listed (seen on Albany's "REP COUNTY
#     COMMISSIONER Vote For 1" with 4 candidates listed). This parser
#     does NOT trust "Vote For N" for anything, it is not stored,
#     not used for validation, and must never be treated as an
#     authoritative seat count. This project already has a dedicated,
#     human-reviewed system for seat counts (multi_seat_race_sources /
#     selection-limit.ts) precisely because trusting ballot-instruction
#     text at face value has been wrong before.
#   - Number of value columns per row varies by county (Albany: 1 total
#     column; Campbell: 4, TOTAL/Election Day/Absentee/Early-ABS). Only
#     the first (TOTAL) value is used; extra columns are ignored, not
#     validated.
#   - A repeating page footer ("Election Summary - MM/DD/YYYY HH:MMPM
#     Page N of M") and a repeating 3-line masthead (county/report title,
#     election name, report title again) sit between whichever contest
#     happens to be open at a page break and the next contest's real
#     header (seen on Laramie, confirmed by reading the real file: the
#     page-N footer for one contest is immediately followed by the
#     masthead for page N+1 before the next contest header appears). Both
#     contain digits ("Page 24 of 49", "August 18, 2026") and neither
#     matches any real trailer label, so without an explicit skip they
#     get swept in as spurious extra "candidate" rows on whatever contest
#     is still open, confirmed empirically: roughly one inflated contest
#     per page, every one of them off by exactly the digits in that
#     page's own footer and masthead. Recognized structurally, not by
#     hardcoding Laramie's county name, so this generalizes to any county
#     using the same report generator with its own masthead text.

import argparse
import hashlib
import re
import sys
from datetime import datetime, timezone

import pdfplumber

NORMALIZED_FIELDNAMES = [
    "election_key", "source_key", "county",
    "contest_key", "contest_name_raw", "contest_name_normalized",
    "level", "district", "ballot_party", "ballot_party_raw", "reporting_scope",
    "sha256", "retrieved_at", "source_published_at",
    "parser_name", "parser_version", "is_unofficial", "verification_status",
    "source_url",
    "precincts_reporting", "precincts_total", "reporting_status",
    "row_type", "reporting_county", "precinct_code", "precinct_name_raw",
    "candidate_name_raw", "candidate_name_normalized", "external_candidate_id",
    "votes", "percentage_reported",
    "result_row_key",
]

PARSER_NAME = "county_summary_pdf_v1"
PARSER_VERSION = "1.0.0"

# Must start with an actual digit (not just "-?[\d,]+", which can match a
# lone stray comma with zero real digits and then crash float('').
# confirmed by a real crash on real data, not a hypothetical).
NUM = re.compile(r"-?\d[\d,]*(?:\.\d+)?")

# Real lines carry the label AND its trailing number(s) together, e.g.
# "Contest Totals 7,190 4,479 616 2,095", these match against the
# digit-stripped TEXT PREFIX of a line (see text_only()), never the whole
# raw line, and never anchored with a trailing $.
TRAILER_PATTERNS = {
    "write_in_aggregate": re.compile(r"^write\s*-?\s*in\s*totals?\b", re.I),
    "overvote": re.compile(r"^overvotes?\b", re.I),
    "undervote": re.compile(r"^undervotes?\b", re.I),
}
# No trailing $ anchor, a page footer/certification block can spatially
# overlap the results table and bleed extra words onto the same extracted
# line (confirmed real: "Contest Totals 715 Nam" from a "Name:" signature
# label bleeding into the totals line on a page boundary). Match on the
# label prefix, tolerate whatever garbage follows.
CONTEST_TOTAL_RE = re.compile(r"^contest\s*-?\s*totals?\b", re.I)
TOTAL_VOTES_CAST_RE = re.compile(r"^total\s*votes\s*cast\b", re.I)

# Page footer/masthead noise, matched structurally, not by county name, see
# the module docstring's anomaly list for why this exists.
PAGE_FOOTER_RE = re.compile(r"^election summary\s*-\s*\d", re.I)
REPORT_TITLE_RE = re.compile(r"election summary results report$", re.I)
RESULTS_LABEL_RE = re.compile(r"(unofficial|official)\s+results$", re.I)
ELECTION_NAME_RE = re.compile(r"^(primary|general|special)\s+election$", re.I)


def is_page_boilerplate(line):
    return bool(
        PAGE_FOOTER_RE.match(line)
        or REPORT_TITLE_RE.search(line)
        or RESULTS_LABEL_RE.search(line)
        or ELECTION_NAME_RE.match(line)
    )


def text_only(line):
    """Strip numeric tokens and surrounding punctuation/whitespace, leaving
    just the label portion of a line for trailer/header matching."""
    stripped = re.sub(r"[\d,.\-]+", " ", line).strip()
    return re.sub(r"\s+", " ", stripped)
VOTE_FOR_RE = re.compile(r"^vote\s*for\s*\d+$", re.I)
COLUMN_HEADER_WORDS = {"total", "election", "day", "absentee", "early-abs", "early", "abs"}

PARTY_PREFIXES = {"REP": "REP", "DEM": "DEM", "LIB": "LIB", "NP": "NP"}


def parse_first_number(text):
    m = NUM.search(text)
    if not m:
        return None
    return int(round(float(m.group(0).replace(",", ""))))


def parse_last_number(text):
    matches = NUM.findall(text)
    if not matches:
        return None
    return int(round(float(matches[-1].replace(",", ""))))


EXTRA_COLUMN_WORDS = {"election", "day", "absentee", "early-abs", "early", "abs"}


def parse_row_value(text, multi_column):
    """Multi-column layouts (e.g. Campbell: TOTAL/Election Day/Absentee/
    Early-ABS) put the county-wide TOTAL first, use the first number.
    Single-column layouts (e.g. Albany) have exactly one real number per
    row, but a candidate name can rarely contain a stray extracted digit
    (confirmed real: "MARK 0. ZIERES", an "O." initial misread as "0."),
    which would be the FIRST number and is never the real vote count.
    use the last number instead, since the vote value always trails the
    name."""
    return parse_first_number(text) if multi_column else parse_last_number(text)


def is_column_header_noise(line):
    words = re.findall(r"[A-Za-z-]+", line.lower())
    return bool(words) and all(w in COLUMN_HEADER_WORDS for w in words)


def looks_like_contest_header(line):
    # All-caps text, no digits, not itself a reserved label.
    if any(ch.isdigit() for ch in line.replace("13-2", "").replace("V1", "")):
        # allow precinct-code-style contest names like "PRECINCT COMMITTEEMAN 13-2 V1"
        pass
    if not re.match(r"^[A-Z0-9 .'\-]+$", line):
        return False
    if VOTE_FOR_RE.match(line) or CONTEST_TOTAL_RE.match(line) or TOTAL_VOTES_CAST_RE.match(line):
        return False
    for pat in TRAILER_PATTERNS.values():
        if pat.match(line):
            return False
    return line.strip() != "" and not is_column_header_noise(line)


def normalize_contest(raw):
    """Map this format's contest wording to the SAME canonical form the
    SOS xlsx adapter produces, so contest_key values collide correctly
    across both source tracks rather than creating duplicate canonical
    contests for the same real-world race."""
    text = raw.strip()
    party_raw = None
    for prefix in PARTY_PREFIXES:
        if text.startswith(prefix + " "):
            party_raw = prefix
            text = text[len(prefix):].strip()
            break

    # Laramie's own report uses "U.S. SENATOR" / "U.S. REPRESENTATIVE" and
    # "STATE SENATOR SENATE DISTRICT N" / "STATE REPRESENTATIVE HD N"
    # rather than Albany/Campbell's "UNITED STATES SENATOR" / "STATE
    # SENATOR DISTRICT N" wording, confirmed by reading the real file, not
    # assumed. Both spellings are recognized so contest_key still collides
    # with the SOS xlsx track's canonical form.
    if text in ("UNITED STATES SENATOR", "U.S. SENATOR"):
        return "United States Senator", "federal", None, "statewide", party_raw
    if text in ("UNITED STATES REPRESENTATIVE", "U.S. REPRESENTATIVE"):
        return "United States Representative", "federal", None, "statewide", party_raw
    if text == "GOVERNOR":
        return "Governor", "statewide", None, "statewide", party_raw
    if text == "SECRETARY OF STATE":
        return "Secretary Of State", "statewide", None, "statewide", party_raw
    if text == "STATE AUDITOR":
        return "State Auditor", "statewide", None, "statewide", party_raw
    if text == "STATE TREASURER":
        return "State Treasurer", "statewide", None, "statewide", party_raw
    if text in ("SUPERINTENDENT OF PUBLIC INSTRUCTION", "STATE SUPERINTENDENT OF PUBLIC INSTRUCTION"):
        return "Superintendent Of Public Instruction", "statewide", None, "statewide", party_raw
    m = re.match(r"^STATE SENATOR (?:SENATE )?DISTRICT (\d+)$", text)
    if m:
        d = int(m.group(1))
        return f"Senate District {d}", "wy_senate", d, "legislative_district", party_raw
    m = re.match(r"^STATE REPRESENTATIVE (?:DISTRICT |HD )(\d+)$", text)
    if m:
        d = int(m.group(1))
        return f"House District {d}", "wy_house", d, "legislative_district", party_raw
    if text.startswith("COUNTY COMMISSIONER"):
        return "County Commissioner", "county", None, "county", party_raw
    m = re.match(r"^PRECINCT COMMITTEE(MAN|WOMAN) (.+)$", text)
    if m:
        code = m.group(2).strip()
        role = "Precinct Committeeman" if m.group(1) == "MAN" else "Precinct Committeewoman"
        return f"{role} {code}", "county", None, "precinct", party_raw
    # Unknown contest type, keep raw as normalized, flag level as unknown
    # rather than guess. Never silently misclassify.
    return text.title(), "unknown", None, "county", party_raw


def normalize_ws(s):
    return re.sub(r"[\s\-]+", "", s.lower())


def party_norm(raw):
    return raw or None


def slugify(value):
    value = re.sub(r"[^\w\s-]", "", value.lower())
    return re.sub(r"[\s_]+", "-", value).strip("-")


def extract(text):
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    contests = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if looks_like_contest_header(line) and i + 1 < len(lines) and VOTE_FOR_RE.match(lines[i + 1]):
            contest_raw = line
            i += 2  # skip header + "Vote For N"
            # skip any column-header noise lines (e.g. "TOTAL", "Election\nDay"),
            # noting whether any of them name a column beyond the single
            # TOTAL column, that's what tells parse_row_value() which end
            # of the line the real vote count is on (see its docstring).
            multi_column = False
            while i < len(lines) and is_column_header_noise(lines[i]):
                words = set(re.findall(r"[a-z-]+", lines[i].lower()))
                if words & EXTRA_COLUMN_WORDS:
                    multi_column = True
                i += 1
            rows = []
            # Two different reconciliation lines exist across the county
            # variants of this report, not one. Albany has neither line at
            # all (its own "Contest Totals" line is the only checksum, see
            # module docstring). Campbell has both "Total Votes Cast" AND
            # "Contest Totals" per contest, "Contest Totals" is the real
            # checksum there (sum of candidates + write-ins + overvotes +
            # undervotes) and "Total Votes Cast" (candidates + write-ins
            # only) is correctly ignored. Laramie's variant has ONLY
            # "Total Votes Cast", no "Contest Totals" line exists anywhere
            # in the document, confirmed by reading the real file, not
            # assumed. "Contest Totals" is preferred whenever present, on
            # any variant; "Total Votes Cast" is kept as a fallback
            # reconciliation target, checked against candidate and
            # write-in rows only, never against overvotes/undervotes,
            # since that is what it actually sums to on every contest
            # checked by hand against Laramie's real data.
            total_votes_cast = None
            while i < len(lines):
                cur = lines[i]
                cur_text = text_only(cur)
                if CONTEST_TOTAL_RE.match(cur_text):
                    contest_total = parse_row_value(cur, multi_column)
                    i += 1
                    break
                if looks_like_contest_header(cur) and i + 1 < len(lines) and VOTE_FOR_RE.match(lines[i + 1]):
                    # next contest started without a "Contest Totals" line;
                    # fall back to "Total Votes Cast" if one was captured,
                    # otherwise this contest is genuinely unreconciled.
                    contest_total = None
                    break
                if TOTAL_VOTES_CAST_RE.match(cur_text):
                    total_votes_cast = parse_row_value(cur, multi_column)
                    i += 1
                    continue  # derived subtotal, not a stored row
                if is_page_boilerplate(cur):
                    i += 1
                    continue  # page footer/masthead, never real contest data
                row_type = "candidate"
                for rt, pat in TRAILER_PATTERNS.items():
                    if pat.match(cur_text):
                        row_type = rt
                        break
                val = parse_row_value(cur, multi_column)
                if val is None:
                    i += 1
                    continue  # unparseable noise line, skip defensively
                name = None if row_type != "candidate" else NUM.sub("", cur).strip()
                rows.append({"row_type": row_type, "candidate_name_raw": name, "votes": val})
                i += 1
            else:
                contest_total = None

            contest_name, level, district, scope, party_raw = normalize_contest(contest_raw)
            contests.append({
                "contest_raw": contest_raw, "contest_name": contest_name, "level": level,
                "district": district, "scope": scope, "party_raw": party_raw,
                "rows": rows, "contest_total": contest_total,
                "total_votes_cast": total_votes_cast,
            })
        else:
            i += 1
    return contests


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pdf", required=True)
    p.add_argument("--county", required=True)
    p.add_argument("--election-key", required=True)
    p.add_argument("--source-key", required=True)
    p.add_argument("--source-url", required=True)
    p.add_argument("--source-published-at", default=None)
    p.add_argument("--retrieved-at", default=None)
    p.add_argument("--certified", action="store_true")
    p.add_argument("--out", required=True)
    args = p.parse_args()

    with open(args.pdf, "rb") as f:
        args.sha256 = hashlib.sha256(f.read()).hexdigest()
    args.retrieved_at = args.retrieved_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with pdfplumber.open(args.pdf) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    contests = extract(full_text)
    if not contests:
        print("No contests parsed, refusing to emit unverified data.", file=sys.stderr)
        sys.exit(1)

    mismatches = []
    rows_out = []
    is_unofficial = 0 if args.certified else 1
    reporting_status = "certified" if args.certified else "county_complete"

    for c in contests:
        if c["contest_total"] is not None:
            target = c["contest_total"]
            summed = sum(r["votes"] for r in c["rows"])
            target_label = "Contest Totals"
        elif c["total_votes_cast"] is not None:
            target = c["total_votes_cast"]
            summed = sum(r["votes"] for r in c["rows"] if r["row_type"] in ("candidate", "write_in_aggregate"))
            target_label = "Total Votes Cast"
        else:
            summed = sum(r["votes"] for r in c["rows"])
            mismatches.append((c["contest_raw"], "no Contest Totals or Total Votes Cast line found", summed, None))
            continue
        if summed != target:
            mismatches.append((c["contest_raw"], f"sum != {target_label}", summed, target))
            continue

        contest_key = "|".join([
            args.election_key, c["level"], slugify(c["contest_name"]),
            (party_norm(c["party_raw"]) or "na").lower(),
        ])
        for r in c["rows"]:
            key_parts = [args.source_key, args.sha256, contest_key, r["row_type"],
                         r["candidate_name_raw"] or r["row_type"], args.county, "COUNTY"]
            rows_out.append({
                "election_key": args.election_key, "source_key": args.source_key, "county": args.county,
                "contest_key": contest_key, "contest_name_raw": c["contest_raw"],
                "contest_name_normalized": c["contest_name"], "level": c["level"],
                "district": c["district"] if c["district"] is not None else "",
                "ballot_party": party_norm(c["party_raw"]) or "", "ballot_party_raw": c["party_raw"] or "",
                "reporting_scope": c["scope"],
                "sha256": args.sha256, "retrieved_at": args.retrieved_at,
                "source_published_at": args.source_published_at or "",
                "parser_name": PARSER_NAME, "parser_version": PARSER_VERSION,
                "is_unofficial": is_unofficial, "verification_status": "verified",
                "source_url": args.source_url,
                "precincts_reporting": "", "precincts_total": "", "reporting_status": reporting_status,
                "row_type": r["row_type"], "reporting_county": args.county, "precinct_code": "",
                "precinct_name_raw": "",
                "candidate_name_raw": r["candidate_name_raw"] or "",
                "candidate_name_normalized": r["candidate_name_raw"] or "",
                "external_candidate_id": "",
                "votes": r["votes"], "percentage_reported": "",
                "result_row_key": "|".join(str(x) for x in key_parts),
            })

    if mismatches:
        print(f"Reconciliation FAILED for {len(mismatches)} contest(s), refusing to emit them:", file=sys.stderr)
        for m in mismatches:
            print(f"  {m}", file=sys.stderr)
        if not rows_out:
            sys.exit(1)
        print(f"Proceeding with {len(contests) - len(mismatches)} contest(s) that DID reconcile.", file=sys.stderr)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        import csv
        w = csv.DictWriter(f, fieldnames=NORMALIZED_FIELDNAMES)
        w.writeheader()
        w.writerows(rows_out)

    print(f"OK: {len(rows_out)} normalized rows from {len(contests) - len(mismatches)}/{len(contests)} reconciled contests -> {args.out}")


if __name__ == "__main__":
    main()
