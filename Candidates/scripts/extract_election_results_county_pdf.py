# Candidates/scripts/extract_election_results_county_pdf.py
#
# Stage 1 parser for the county-hosted summary-results PDF family. It was first
# confirmed on Albany and Campbell counties' verified 2024 results, then
# extended and reverified against Carbon, Goshen, Natrona, Park, Platte, and
# Sweetwater 2026 primary reports. These reports share the same contest and trailer
# structure even though their titles, page mastheads, and value columns vary.
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
#   - 2026 reports commonly add a VOTE % column. The printed vote total is
#     still the first numeric value and the percentage is never stored as a
#     vote. Every contest must reconcile after this selection.
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
#   - A source can print two distinct contests with the exact same title.
#     Carbon and Park 2026 do this for separate municipal ballot positions.
#     The source does not always print a term or seat qualifier, so duplicate
#     canonical keys receive a stable source-occurrence suffix in report order
#     instead of being merged or assigned an invented semantic label.

import argparse
from collections import Counter, defaultdict
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
PARSER_VERSION = "1.1.6"

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
PAGE_FOOTER_RE = re.compile(r"\bpage\s+\d+\s+of\s+\d+\s*$", re.I)
REPORT_TITLE_RE = re.compile(
    r"(?:summary results report|election summary results report|"
    r"county contest summary|municipal contest summary|"
    r"precinct committee contest summary|election summary)$",
    re.I,
)
RESULTS_LABEL_RE = re.compile(r"(unofficial|official)\s+results$", re.I)
ELECTION_NAME_RE = re.compile(r"^(primary|general|special)\s+election$", re.I)
ELECTION_MASTHEAD_RE = re.compile(
    r"^(?:20\d{2}\s+)?(?:primary|general|special)(?:\s+election)?"
    r"(?:\s+recount)?(?:\s+20\d{2})?$",
    re.I,
)
COUNTY_ELECTION_MASTHEAD_RE = re.compile(
    r"^[A-Za-z .'-]+\s+(?:primary|general|special)(?:\s+election)?\s+20\d{2}$",
    re.I,
)
# \s* (not \s+) around "of": confirmed on OCR'd 2026 Washakie data that
# tesseract can read "5 of 5" as one glued token "5of5" with no space at
# all, which a stricter \s+ silently let fall through as an unrecognized
# candidate row worth "5" votes -- inflating every contest's sum by
# exactly the reporting count, a systematic error, not noise.
PRECINCTS_REPORTING_RE = re.compile(r"^precincts\s+reporting\s+\d+\s*of\s*\d+", re.I)
DATE_MASTHEAD_RE = re.compile(
    r"^(?:january|february|march|april|may|june|july|august|september|"
    r"october|november|december)\s+\d{1,2},\s+\d{4}\b",
    re.I,
)
# Tolerant fallback for OCR'd masthead lines the anchored patterns above
# miss because OCR garbled surrounding text: confirmed on Weston 2026,
# where "WY Weston County Primary Election" OCR'd as "WY Weston 260818
# Primary Election_6060" (a misread date and trailing noise glued onto an
# otherwise-recognizable masthead line). None of the anchored patterns
# above match because of the extra characters, and the stray "260818" was
# read as a real vote count on the next contest, corrupting it. A contest
# header or data row in this report family never contains the words
# "Primary/General/Special Election" together, so matching that phrase
# anywhere in the line, not just when the whole line is otherwise clean,
# is safe. No trailing \b: also confirmed on the same data that OCR can
# glue trailing noise directly onto "Election" with an underscore
# ("Election_6060"), and \w includes "_", so a trailing \b would silently
# fail to match right where it's needed most.
MASTHEAD_ELECTION_PHRASE_RE = re.compile(r"\b(?:primary|general|special)\s+election", re.I)


def is_page_boilerplate(line):
    return bool(
        PAGE_FOOTER_RE.search(line)
        or REPORT_TITLE_RE.search(line)
        or RESULTS_LABEL_RE.search(line)
        or ELECTION_NAME_RE.match(line)
        or ELECTION_MASTHEAD_RE.match(line)
        or COUNTY_ELECTION_MASTHEAD_RE.match(line)
        or PRECINCTS_REPORTING_RE.match(line)
        or DATE_MASTHEAD_RE.match(line)
        or MASTHEAD_ELECTION_PHRASE_RE.search(line)
    )


def text_only(line):
    """Strip numeric tokens and surrounding punctuation/whitespace, leaving
    just the label portion of a line for trailer/header matching."""
    stripped = re.sub(r"[\d,.\-]+", " ", line).strip()
    return re.sub(r"\s+", " ", stripped)
VOTE_FOR_RE = re.compile(r"^vote\s*for\s*\d+$", re.I)
COLUMN_HEADER_WORDS = {
    "total", "vote", "election", "day", "absentee", "early-abs", "early", "abs"
}

PARTY_PREFIXES = {"REP": "REP", "DEM": "DEM", "LIB": "LIB", "NP": "NP"}

# Sweetwater's report prints five small-town contests using only the town name
# (or the town name twice), while the adjacent mayor contests include "MAYOR".
# These exact names are also established as Sweetwater municipalities by the
# existing county import. Preserve the source title and classify only its level.
MUNICIPALITY_ONLY_TITLES_BY_COUNTY = {
    "sweetwater": {"SUPERIOR", "SUPERIOR SUPERIOR", "WAMSUTTER", "WAMSUTTER WAMSUTTER", "GRANGER"},
}


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


EXTRA_COLUMN_WORDS = {"vote", "election", "day", "absentee", "early-abs", "early", "abs"}


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
    if not re.match(r'''^[A-Z0-9 .,'"/&()\-]+$''', line):
        return False
    if VOTE_FOR_RE.match(line) or CONTEST_TOTAL_RE.match(line) or TOTAL_VOTES_CAST_RE.match(line):
        return False
    for pat in TRAILER_PATTERNS.values():
        if pat.match(line):
            return False
    return line.strip() != "" and not is_column_header_noise(line)


def normalize_contest(raw, county=None):
    """Map this format's contest wording to the SAME canonical form the
    SOS xlsx adapter produces, so contest_key values collide correctly
    across both source tracks rather than creating duplicate canonical
    contests for the same real-world race."""
    text = raw.strip()
    # OCR occasionally glues a stray quote or other punctuation onto the
    # very start of a contest header (confirmed on Campbell 2026 OCR:
    # '"REP CLERK OF DISTRICT COURT'), which would otherwise block the
    # party-prefix check below from ever firing.
    text = re.sub(r"^[^A-Za-z0-9]+", "", text)
    # Same idea, trailing: confirmed on Teton 2026 OCR ("DEM COUNTY ATTORNEY ,").
    text = re.sub(r"[^A-Za-z0-9]+$", "", text)
    party_raw = None
    for prefix in PARTY_PREFIXES:
        if text.startswith(prefix + " "):
            party_raw = prefix
            text = text[len(prefix):].strip()
            break

    # Some county exports repeat the party token after the normal leading
    # token, at the end of the contest label, or both. Remove only a token
    # that exactly matches the party already established above. Do not
    # remove embedded "REP" text because it can mean representative.
    if party_raw:
        while text.startswith(party_raw + " "):
            text = text[len(party_raw):].strip()
        if text.endswith(" " + party_raw) and text not in ("US REP", "U.S. REP"):
            text = text[:-len(party_raw)].strip()

    # Converse 2026 splits a word with a stray space at a consistent point
    # ("ST ATE AUDITOR", "SECRET ARY OF ST ATE"), confirmed by reading the
    # real file, a kerning artifact like the ones already documented in the
    # module docstring, not a different word. Collapse only these two
    # observed splits rather than guessing at word boundaries in general.
    text = re.sub(r"\bST ATE\b", "STATE", text)
    text = re.sub(r"\bSECRET ARY\b", "SECRETARY", text)

    # Sublette 2026 prefixes every county office with the county's own name
    # ("SUBLETTE COUNTY COMMISSIONER") instead of the generic "COUNTY" used
    # elsewhere. Strip it so the office matching below stays county-agnostic.
    if county:
        county_prefix = county.strip().upper() + " COUNTY "
        if text.startswith(county_prefix):
            text = text[len(county_prefix):].strip()

    # Johnson 2026 (OCR track) titles every contest "[PARTY] FOR [OFFICE]"
    # ("REP FOR COUNTY COMMISSIONER"), confirmed on real data. "FOR" is
    # never part of any office name recognized below, so it's always safe
    # to drop once it appears as the leading word after the party prefix.
    if text.startswith("FOR "):
        text = text[4:].strip()

    # Laramie's own report uses "U.S. SENATOR" / "U.S. REPRESENTATIVE" and
    # "STATE SENATOR SENATE DISTRICT N" / "STATE REPRESENTATIVE HD N"
    # rather than Albany/Campbell's "UNITED STATES SENATOR" / "STATE
    # SENATOR DISTRICT N" wording, confirmed by reading the real file, not
    # assumed. Both spellings are recognized so contest_key still collides
    # with the SOS xlsx track's canonical form.
    if text in ("UNITED STATES SENATOR", "U.S. SENATOR", "US SENATOR", "SENATOR"):
        return "United States Senator", "federal", None, "statewide", party_raw
    if text in (
        "UNITED STATES REPRESENTATIVE", "U.S. REPRESENTATIVE", "U.S. REP", "US REP",
        "U.S. HOUSE OF REPRESENTATIVES", "US HOUSE OF REPRESENTATIVES", "US REPRESENTATIVE",
    ):
        return "United States Representative", "federal", None, "statewide", party_raw
    if text in ("US SENATE", "UNITED STATES SENATE", "U.S. SENATE"):
        return "United States Senator", "federal", None, "statewide", party_raw
    if text in ("GOVERNOR", "STATE GOVERNOR"):
        return "Governor", "statewide", None, "statewide", party_raw
    if text in ("SECRETARY OF STATE", "SEC OF STATE", "SOS"):
        return "Secretary Of State", "statewide", None, "statewide", party_raw
    if text in ("STATE AUDITOR", "STATEAUDITOR"):
        return "State Auditor", "statewide", None, "statewide", party_raw
    if text in ("STATE TREASURER", "STATETREASURER"):
        return "State Treasurer", "statewide", None, "statewide", party_raw
    if text in (
        "SUPERINTENDENT", "SUPERINTENDENT PUBLIC INSTRUCTION",
        "SUPER PUBLIC INSTRUCT",
        "SUPERINTENDENT OF PUB INSTRUCTION",
        "SUPERINTENDENT OF PUBLIC INST", "SUPERINTENDENT OF PUBLIC INSTRUCTION",
        "STATE SUPERINTENDENT OF PUBLIC INSTRUCTION",
        "SPI", "SUP OF PUB INST", "SUPT PUB INSTR", "SUPERINTENDENT OF PUBLIC INST.",
    ):
        return "Superintendent Of Public Instruction", "statewide", None, "statewide", party_raw
    # Senate/house wording varies more than the two spellings originally
    # confirmed on Laramie: "ST"/"STATE", "SEN"/"SENATE"/"SENATOR"/"SD",
    # "HSE", and a bare trailing number with no "DISTRICT" word at all have
    # all been seen on real 2026 county reports.
    m = re.match(
        r"^(?:STATE |ST )?SEN(?:ATE|ATOR)?\.?(?: SEN(?:ATE)?)?(?: (?:DIST(?:RICT)?\.?|SD))? ?(\d+)$",
        text,
    )
    if m:
        d = int(m.group(1))
        return f"Senate District {d}", "wy_senate", d, "legislative_district", party_raw
    m = re.match(r"^DISTRICT (\d+) STATE SENATOR$", text)
    if m:
        d = int(m.group(1))
        return f"Senate District {d}", "wy_senate", d, "legislative_district", party_raw
    # Washakie 2026 (OCR track) spells this out word-for-word like the
    # federal "US HOUSE OF REPRESENTATIVES" alias above, but for the state
    # house: "STATE HOUSE OF REPRESENTATIVES HD27". Checked before the
    # general pattern below since the word order ("HOUSE" before
    # "REPRESENTATIVES") doesn't fit it.
    m = re.match(r"^STATE HOUSE OF REPRESENTATIVES HD ?(\d+)$", text)
    if m:
        d = int(m.group(1))
        return f"House District {d}", "wy_house", d, "legislative_district", party_raw
    m = re.match(
        r"^(?:STATE |ST )?(?:HSE )?(?:REPRESENTATIVE(?: HOUSE)?|REP)\.?(?: HOUSE)?"
        r"(?: (?:DISTRICT|DIST\.?|HD))? ?(\d+)(?: (?:REP|DEM|LIB) DISTRICT \d+)?$",
        text,
    )
    if m:
        d = int(m.group(1))
        return f"House District {d}", "wy_house", d, "legislative_district", party_raw

    # Abbreviation families seen across 2026 counties for the same offices:
    # "COUNTY"/"CO"/"CO."/"CNTY"/"CNTV" (Crook's OCR misreads Y as V), with
    # or without a space or period before the office word (Crook concatenates
    # some, e.g. "CNTYASSESSOR", with zero separator).
    county_prefix = r"(?:COUNTY|CO\.?|CNTY|CNTV)\s*"
    county_offices = (
        (rf"^(?:{county_prefix})?COMMISSIONERS?$", "County Commissioner"),
        (rf"^(?:{county_prefix})?CORONER$", "County Coroner"),
        (rf"^(?:{county_prefix})?ATTORNEY$", "County Attorney"),
        (rf"^(?:{county_prefix})?SHERIFF$", "County Sheriff"),
        (rf"^(?:{county_prefix})?CLERK$", "County Clerk"),
        (rf"^(?:{county_prefix})?TREASURER$", "County Treasurer"),
        (rf"^(?:{county_prefix})?ASSESSOR$", "County Assessor"),
        (r"^(?:COUNTY )?CLERK OF (?:THE )?DIST(?:RICT)?\.? COURT$", "Clerk Of District Court"),
        (r"^(?:COUNTY )?CLERK OF COURT$", "Clerk Of District Court"),
        (r"^DIST(?:RICT)?\.? COURT CLERK$", "Clerk Of District Court"),
        (r"^CLRK DIST(?:RICT)?\.? COURT$", "Clerk Of District Court"),
        (r"^CLERK DIST(?:RICT)?\.? COURT$", "Clerk Of District Court"),
        (r"^DISTRICT ATTORNEY$", "District Attorney"),
    )
    for pattern, normalized in county_offices:
        if re.match(pattern, text):
            return normalized, "county", None, "county", party_raw

    # Fremont 2026 elects commissioners by numbered county district and
    # prints both "DIST" and "DISTRICT" forms. One Democratic title repeats
    # its district suffix. Keep the district in the canonical title without
    # treating it as a legislative district.
    m = re.match(
        r"^(?:COUNTY )?COMMISSIONERS? DIST(?:RICT)?\.? (\d+)"
        r"(?: DISTRICT \1)?$",
        text,
    )
    if m:
        return f"County Commissioner District {int(m.group(1))}", "county", None, "county", party_raw

    committee_role = None
    if re.search(r"COMMITTEE(?:MAN|MEN)\b", text) or re.match(r"^PCM\b", text) or "PRECINCT MAN" in text or "PCT COMM MAN" in text:
        committee_role = "Precinct Committeeman"
    elif re.search(r"COMMITTEE(?:WOMAN|WOMEN)\b", text) or re.match(r"^PCW\b", text) or "PRECINCT WOMAN" in text or "PCT COMM WOMAN" in text:
        committee_role = "Precinct Committeewoman"
    if committee_role:
        # Teton 2026 (OCR track) codes precincts as "DIST N PCT M" rather
        # than a single "N-M" pair, e.g. "PCT COMM MAN DIST 1 PCT 12".
        # Checked first since the generic digit-pair search below can't
        # find two adjacent digit groups once letters ("DIST"/"PCT")
        # separate them.
        dist_pct_match = re.search(r"DIST\s*0*(\d+)\s*PCT\s*0*(\d+)", text, re.I)
        if dist_pct_match:
            code = f"{int(dist_pct_match.group(1))}-{int(dist_pct_match.group(2))}"
            return f"{committee_role} {code}", "county", None, "precinct", party_raw
        # Precinct codes ride along with kerning/OCR noise of their own:
        # a "." separator instead of "-" (Crook), and stray internal spaces
        # splitting a single digit sequence in two ("1 1 -1 1" for "11-11").
        # Stripping whitespace before matching collapses both without
        # affecting well-formed "N-N" codes already handled.
        compact = re.sub(r"\s+", "", text)
        code_match = re.search(r"0*(\d+)[.\-]0*(\d+)", compact)
        if not code_match:
            return text.title(), "unknown", None, "precinct", party_raw
        code = f"{int(code_match.group(1))}-{int(code_match.group(2))}"
        return f"{committee_role} {code}", "county", None, "precinct", party_raw

    if re.search(r"\b(MAYOR|COUNCIL|COUNCILPERSON|WARD|AT-LARGE)\b", text):
        return text.title(), "city", None, "city", party_raw

    county_key = county.strip().lower() if county else ""
    if text in MUNICIPALITY_ONLY_TITLES_BY_COUNTY.get(county_key, set()):
        return text.title(), "city", None, "city", party_raw

    if re.search(r"\b(?:SERVICE|CONSERVATION) DISTRICT\b", text):
        return text.title(), "county", None, "county", party_raw

    # Local ballot measures (sales/use tax renewals, mill levies, bond
    # questions) are recognized by keyword -- every county titles its own
    # measure differently ("SENIOR CITIZEN TAX QUESTION", "PRO 1 PERCENT
    # SALES AND USE TAX", "BALLOT PROP. 1") -- but are NOT a candidate
    # contest: a FOR/AGAINST measure has no candidates schema-wise, and
    # storing "FOR THE TAX"/"AGAINST THE TAX" as candidate_name_raw is a
    # real bug, caught 2026-08-21 on Laramie's 14 propositions (already
    # live in production for Sublette's "PRO 1 PERCENT SALES AND USE TAX"
    # from the 2026-08-20 13-county seed, confirmed inert there only
    # because no matching office/candidate roster exists for card-scoped
    # resolution to find -- not because the data itself is correct).
    # level="ballot_measure" is deliberately its own value, not "unknown":
    # this format IS recognized, just genuinely out of the current
    # schema's scope, so --local-only must exclude it silently rather than
    # hard-failing the way it correctly does for a truly unrecognized
    # title. See docs/election_results_2026_path_forward.md finding #14.
    if re.search(r"\b(QUESTION|PROPOSITION|PROP\.?|BALLOT|LEVY|BOND|TAX)\b", text):
        return text.title(), "ballot_measure", None, "county", party_raw

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


def contest_key_base(election_key, county, contest):
    parts = [election_key, contest["level"]]
    if contest["level"] in ("county", "city"):
        parts.append(slugify(county))
    parts.extend([
        slugify(contest["contest_name"]),
        (party_norm(contest["party_raw"]) or "na").lower(),
    ])
    return "|".join(parts)


def extract(text, county=None):
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
                # A "VOTE %" column (Natrona 2026, confirmed on real data)
                # leaves a stray "%" behind: NUM strips "3774" and "48.66"
                # from "CHAD MCNUTT 3774 48.66%" but not the percent sign
                # itself, corrupting the stored name to "CHAD MCNUTT  %".
                name = None if row_type != "candidate" else re.sub(
                    r"\s+", " ", NUM.sub("", cur).replace("%", "")
                ).strip()
                rows.append({"row_type": row_type, "candidate_name_raw": name, "votes": val})
                i += 1
            else:
                contest_total = None

            contest_name, level, district, scope, party_raw = normalize_contest(contest_raw, county)
            contests.append({
                "contest_raw": contest_raw, "contest_name": contest_name, "level": level,
                "district": district, "scope": scope, "party_raw": party_raw,
                "rows": rows, "contest_total": contest_total,
                "total_votes_cast": total_votes_cast,
            })
        else:
            i += 1
    return contests


def add_common_args(p):
    """Shared CLI contract between this text-layer parser and the OCR
    variant (extract_election_results_county_pdf_ocr.py) -- everything
    downstream of "how do we get text out of the PDF" is identical between
    the two, so both build an args namespace with these exact attribute
    names and hand it to run_from_text()."""
    p.add_argument("--pdf", required=True)
    p.add_argument("--county", required=True)
    p.add_argument("--election-key", required=True)
    p.add_argument("--source-key", required=True)
    p.add_argument("--source-url", required=True)
    p.add_argument("--source-published-at", default=None)
    p.add_argument("--retrieved-at", default=None)
    p.add_argument("--certified", action="store_true")
    p.add_argument(
        "--local-only", action="store_true",
        help="Emit only county, municipal, special-district, and precinct committee contests.",
    )
    exceptions = p.add_mutually_exclusive_group()
    exceptions.add_argument(
        "--allow-missing-undervote-overvote", action="store_true",
        help=(
            "Accept a contest whose candidate+write-in sum falls short of its "
            "printed Contest Totals, IF AND ONLY IF this entire document never "
            "prints a single Overvotes/Undervotes trailer line anywhere (i.e. "
            "the report format structurally omits them, confirmed Fremont "
            "2026). Refuses if even one contest elsewhere in the same document "
            "has a real overvote/undervote line -- that means this contest's "
            "own line was dropped by extraction, not omitted by the format, "
            "and must not be waved through (see Albany's missing-value finding "
            "in docs/election_results_2026_path_forward.md). Never accepts an "
            "overage (summed > target) -- that is a different bug class. "
            "Accepted rows are stamped verification_status='needs_review', "
            "never 'verified', since the true ballots-cast total for the "
            "contest is unknown."
        ),
    )
    exceptions.add_argument(
        "--allow-missing-contest-total", action="store_true",
        help=(
            "Stage candidate and write-in totals from a report that never "
            "prints Contest Totals, Total Votes Cast, Overvotes, or "
            "Undervotes anywhere in the document. Refuses mixed documents "
            "that contain any such checksum or trailer line. Emits only "
            "source-printed candidate and write-in rows, stamps every row "
            "verification_status='needs_review' and "
            "reporting_status='manual_required', and never represents the "
            "contests as reconciled. Intended for the Sheridan 2026 report "
            "class documented in "
            "docs/election_results_unreconciled_sources.md."
        ),
    )
    p.add_argument("--out", required=True)
    return p


def run_from_text(full_text, args):
    """Everything after text acquisition: parsing, the hard reconciliation
    gate, and CSV emission. Shared verbatim by the text-layer parser
    (pdfplumber) and the OCR parser (tesseract) -- args must carry the
    same attributes add_common_args() declares, plus sha256 and a resolved
    retrieved_at, which the two callers compute differently (OCR has no
    single pdfplumber-opened file handle to hash inline) but must both set
    before calling this."""
    contests = extract(full_text, args.county)
    if not contests:
        print("No contests parsed, refusing to emit unverified data.", file=sys.stderr)
        sys.exit(1)

    # Computed against every contest in the document (before --local-only
    # filtering), not just the ones being emitted, so the check is a
    # genuine document-wide signal. See --allow-missing-undervote-overvote's
    # help text: a document that prints an overvote/undervote line for even
    # one contest is a document where a missing line elsewhere means
    # extraction dropped it, not that the format never has one.
    document_has_undervote_or_overvote_row = any(
        r["row_type"] in ("overvote", "undervote") for c in contests for r in c["rows"]
    )
    document_has_reconciliation_total = any(
        c["contest_total"] is not None or c["total_votes_cast"] is not None
        for c in contests
    )

    if args.allow_missing_contest_total:
        if args.certified:
            print(
                "--allow-missing-contest-total cannot be combined with --certified; "
                "the staged rows require human review.",
                file=sys.stderr,
            )
            sys.exit(1)
        if document_has_reconciliation_total:
            print(
                "This document contains at least one Contest Totals or Total Votes Cast "
                "line. Refusing the missing-total exception for a mixed report.",
                file=sys.stderr,
            )
            sys.exit(1)
        if document_has_undervote_or_overvote_row:
            print(
                "This document contains at least one Overvotes or Undervotes line. "
                "Refusing the missing-total exception for a mixed report.",
                file=sys.stderr,
            )
            sys.exit(1)

    if args.local_only:
        unknown = [c["contest_raw"] for c in contests if c["level"] == "unknown"]
        if unknown:
            print("Unclassified contests remain in --local-only mode, refusing to omit or guess:", file=sys.stderr)
            for contest_raw in unknown:
                print(f"  {contest_raw}", file=sys.stderr)
            sys.exit(1)
        ballot_measures = [c["contest_raw"] for c in contests if c["level"] == "ballot_measure"]
        if ballot_measures:
            print(f"Excluding {len(ballot_measures)} recognized ballot measure(s) (out of schema scope):", file=sys.stderr)
            for contest_raw in ballot_measures:
                print(f"  {contest_raw}", file=sys.stderr)
        contests = [c for c in contests if c["level"] in ("county", "city")]
        if not contests:
            print("No local contests found, refusing to emit an empty local result set.", file=sys.stderr)
            sys.exit(1)

    mismatches = []
    rows_out = []
    staged_unreconciled_contests = 0
    is_unofficial = 0 if args.certified else 1
    reporting_status = "certified" if args.certified else "county_complete"

    key_counts = Counter(contest_key_base(args.election_key, args.county, c) for c in contests)
    key_occurrences = defaultdict(int)

    for c in contests:
        contest_verification_status = "verified"
        contest_reporting_status = reporting_status
        if c["contest_total"] is not None:
            target = c["contest_total"]
            summed = sum(r["votes"] for r in c["rows"])
            target_label = "Contest Totals"
        elif c["total_votes_cast"] is not None:
            target = c["total_votes_cast"]
            summed = sum(r["votes"] for r in c["rows"] if r["row_type"] in ("candidate", "write_in_aggregate"))
            target_label = "Total Votes Cast"
        elif args.allow_missing_contest_total:
            unexpected_row_types = sorted({
                r["row_type"] for r in c["rows"]
                if r["row_type"] not in ("candidate", "write_in_aggregate")
            })
            if not c["rows"]:
                mismatches.append((c["contest_raw"], "no source-printed result rows found", 0, None))
                continue
            if unexpected_row_types:
                mismatches.append((
                    c["contest_raw"],
                    f"unexpected row types in missing-total mode: {', '.join(unexpected_row_types)}",
                    sum(r["votes"] for r in c["rows"]),
                    None,
                ))
                continue
            target = None
            summed = sum(r["votes"] for r in c["rows"])
            target_label = None
            contest_verification_status = "needs_review"
            contest_reporting_status = "manual_required"
            staged_unreconciled_contests += 1
        else:
            summed = sum(r["votes"] for r in c["rows"])
            mismatches.append((c["contest_raw"], "no Contest Totals or Total Votes Cast line found", summed, None))
            continue
        if target is not None and summed != target:
            exception_applies = (
                args.allow_missing_undervote_overvote
                and target_label == "Contest Totals"
                and summed < target  # never wave through an overage -- a different bug class
                and not document_has_undervote_or_overvote_row
            )
            if not exception_applies:
                mismatches.append((c["contest_raw"], f"sum != {target_label}", summed, target))
                continue
            # Candidate and write-in figures are exactly what was printed;
            # only the overvote/undervote split (never captured, since this
            # format has no such rows to capture) is unknown. Do not invent
            # a row to cover the shortfall -- stamp needs_review instead of
            # verified so this snapshot cannot surface as a confirmed result
            # until a human decides it should (see docs/election_results_2026_path_forward.md).
            contest_verification_status = "needs_review"

        contest_key = contest_key_base(args.election_key, args.county, c)
        if key_counts[contest_key] > 1:
            key_occurrences[contest_key] += 1
            contest_key = f"{contest_key}|source-occurrence-{key_occurrences[contest_key]}"
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
                "is_unofficial": is_unofficial, "verification_status": contest_verification_status,
                "source_url": args.source_url,
                "precincts_reporting": "", "precincts_total": "", "reporting_status": contest_reporting_status,
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
        print(f"Proceeding with {len(contests) - len(mismatches)} accepted contest(s).", file=sys.stderr)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        import csv
        w = csv.DictWriter(f, fieldnames=NORMALIZED_FIELDNAMES)
        w.writeheader()
        w.writerows(rows_out)

    accepted_contests = len(contests) - len(mismatches)
    if args.allow_missing_contest_total:
        print(
            f"OK: {len(rows_out)} normalized rows from "
            f"{staged_unreconciled_contests}/{len(contests)} staged unreconciled "
            f"contests (needs_review) -> {args.out}"
        )
    else:
        print(
            f"OK: {len(rows_out)} normalized rows from "
            f"{accepted_contests}/{len(contests)} reconciled contests -> {args.out}"
        )


def main():
    p = argparse.ArgumentParser(description=__doc__)
    add_common_args(p)
    args = p.parse_args()

    with open(args.pdf, "rb") as f:
        args.sha256 = hashlib.sha256(f.read()).hexdigest()
    args.retrieved_at = args.retrieved_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with pdfplumber.open(args.pdf) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    run_from_text(full_text, args)


if __name__ == "__main__":
    main()
