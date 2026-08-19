# Candidates/scripts/extract_election_results_statewide_pdf.py
#
# Stage 1 parser for the Wyoming SOS statewide unofficial summary PDFs first
# published on 2026 primary election night. The PDFs contain county subtotal
# rows and a printed statewide Total row. County subtotals are emitted as
# county-scoped logical sources so the existing per-contest, per-county source
# precedence views can consume them without double-counting. The printed Total
# row is used only as a reconciliation checksum and is never emitted.

import argparse
import csv
import hashlib
import re
import sys
from collections import defaultdict
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

PARSER_NAME = "sos_statewide_summary_pdf_v1"
PARSER_VERSION = "1.0.0"

COUNTIES = [
    "Albany", "Big Horn", "Campbell", "Carbon", "Converse", "Crook",
    "Fremont", "Goshen", "Hot Springs", "Johnson", "Laramie", "Lincoln",
    "Natrona", "Niobrara", "Park", "Platte", "Sheridan", "Sublette",
    "Sweetwater", "Teton", "Uinta", "Washakie", "Weston",
]

PARTIES = {"Republican": "REP", "Democratic": "DEM"}
SPECIAL_ROWS = {
    "Write-Ins": "write_in_aggregate",
    "Overvotes": "overvote",
    "Undervotes": "undervote",
}
NORMALIZED_NAME_OVERRIDES = {
    # The raw source spellings remain in candidate_name_raw. These reviewed
    # normalized forms match the filed candidate roster used by the guide.
    "Kenneth R. Casner": "Kenneth R Casner",
    "Scott Smitth": "Scott Smith",
}
NUMERIC_TOKEN = re.compile(r"^\d[\d,]*$")
CONTEST_RE = re.compile(
    r"^(United States Senator|United States Representative|Governor|"
    r"Secretary of State|State Auditor|State Treasurer|"
    r"Superintendent of Public Instruction|Senate District \d+|House District \d+)"
    r"(?:, Continued)?$"
)


def slugify(value):
    value = re.sub(r"[^\w\s-]", "", value.lower())
    return re.sub(r"[\s_]+", "-", value).strip("-")


def county_slug(value):
    return slugify(value)


def normalize_contest(raw):
    normalized = re.sub(r",\s*Continued$", "", raw).strip()
    district_match = re.fullmatch(r"(Senate|House) District (\d+)", normalized)
    if district_match:
        level = "wy_senate" if district_match.group(1) == "Senate" else "wy_house"
        return normalized, level, int(district_match.group(2)), "legislative_district"
    if normalized in ("United States Senator", "United States Representative"):
        return normalized, "federal", None, "statewide"
    if normalized in (
        "Governor", "Secretary of State", "State Auditor", "State Treasurer",
        "Superintendent of Public Instruction",
    ):
        office_title = {
            "Secretary of State": "Secretary Of State",
            "Superintendent of Public Instruction": "Superintendent Of Public Instruction",
        }.get(normalized, normalized)
        return office_title, "statewide", None, "statewide"
    raise ValueError(f"Unrecognized contest heading: {raw}")


def group_words_by_top(words, tolerance=1.5):
    groups = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        if not groups or abs(groups[-1][0]["top"] - word["top"]) > tolerance:
            groups.append([word])
        else:
            groups[-1].append(word)
    return groups


def extract_county_row_positions(page):
    positions = {}
    left_words = [word for word in page.extract_words(x_tolerance=1, y_tolerance=2) if word["x0"] < 100]
    for group in group_words_by_top(left_words):
        text = " ".join(word["text"] for word in sorted(group, key=lambda item: item["x0"]))
        if text in COUNTIES or text == "Total":
            positions[text] = sum(word["top"] for word in group) / len(group)
    missing = [county for county in COUNTIES if county not in positions]
    if missing or "Total" not in positions:
        raise ValueError(f"County row labels missing from page: {missing}")
    return positions


def find_heading(text):
    for line in text.splitlines():
        candidate = line.strip()
        if CONTEST_RE.fullmatch(candidate):
            return candidate
    raise ValueError("No supported contest heading found")


def printed_metadata(text):
    reporting_match = re.search(r"Counties Reporting:\s*(\d+) of 23", text, re.S)
    updated_match = re.search(
        r"Last Updated:.*?(\d{1,2}/\d{1,2}/\d{2})\s+(\d{1,2}:\d{2}:\d{2})\s+MDT",
        text,
        re.S,
    )
    if not reporting_match or not updated_match:
        raise ValueError("Missing Counties Reporting or Last Updated metadata")
    published = datetime.strptime(
        f"{updated_match.group(1)} {updated_match.group(2)} -0600",
        "%m/%d/%y %H:%M:%S %z",
    ).isoformat()
    return int(reporting_match.group(1)), published


def withdrawn_name(text):
    match = re.search(r"\*\s+(.+?)\s+withdrew (?:his|her|their) candidacy", text, re.I | re.S)
    if not match:
        raise ValueError("Withdrawn Candidate column found without a readable footnote name")
    name = re.sub(r"\s+", " ", match.group(1)).strip()
    # The match can begin after the Last Updated label if extraction places
    # the footnote beside it. Keep only the text after the last asterisk.
    if "*" in name:
        name = name.rsplit("*", 1)[-1].strip()
    return name


def parse_page(page):
    text = page.extract_text(x_tolerance=1, y_tolerance=2) or ""
    contest_raw = find_heading(text)
    contest_name, level, district, reporting_scope = normalize_contest(contest_raw)
    reporting_count, published_at = printed_metadata(text)

    tables = page.find_tables()
    if len(tables) != 1:
        raise ValueError(f"Expected one table, found {len(tables)}")
    table = tables[0]
    extracted = table.extract()
    party_index = next(
        (index for index, row in enumerate(extracted)
         if any(cell and any(party in cell for party in PARTIES) for cell in row)),
        None,
    )
    if party_index is None or party_index + 1 >= len(extracted):
        raise ValueError("Could not locate party and result-column header rows")
    header_index = party_index + 1
    party_spans = []
    for cell, value in zip(table.rows[party_index].cells, extracted[party_index]):
        if cell and value:
            party = next((name for name in PARTIES if name in value), None)
            if party:
                party_spans.append((cell[0], cell[2], party))
    if not party_spans:
        raise ValueError("No Republican or Democratic header span found")

    columns = []
    page_withdrawn_name = None
    for cell, value in zip(table.rows[header_index].cells, extracted[header_index]):
        if not cell or not value:
            continue
        center = (cell[0] + cell[2]) / 2
        party = next((name for x0, x1, name in party_spans if x0 <= center <= x1), None)
        if not party:
            continue
        label = re.sub(r"\s+", " ", value).strip()
        if "Withdrawn" in label and "Candidate" in label:
            page_withdrawn_name = page_withdrawn_name or withdrawn_name(text)
            label = page_withdrawn_name
        row_type = SPECIAL_ROWS.get(label, "candidate")
        columns.append({
            "center": center,
            "party_raw": party,
            "party": PARTIES[party],
            "label": label,
            "row_type": row_type,
        })
    if not columns:
        raise ValueError("No result columns found")

    row_positions = extract_county_row_positions(page)
    numeric_words = [
        word for word in page.extract_words(x_tolerance=1, y_tolerance=2)
        if word["x0"] > 100 and NUMERIC_TOKEN.fullmatch(word["text"])
    ]

    values = defaultdict(dict)
    for row_name, row_top in row_positions.items():
        row_words = [word for word in numeric_words if abs(word["top"] - row_top) <= 2.5]
        for word in row_words:
            center = (word["x0"] + word["x1"]) / 2
            column_index = min(range(len(columns)), key=lambda index: abs(columns[index]["center"] - center))
            if abs(columns[column_index]["center"] - center) > 45:
                raise ValueError(f"Numeric value {word['text']} did not align to a result column")
            if column_index in values[row_name]:
                raise ValueError(f"Two numeric values aligned to one column for {row_name}")
            values[row_name][column_index] = int(word["text"].replace(",", ""))

    mismatches = []
    for column_index, column in enumerate(columns):
        expected = values["Total"].get(column_index)
        computed = sum(values[county].get(column_index, 0) for county in COUNTIES)
        if expected is None or computed != expected:
            mismatches.append({
                "contest": contest_raw,
                "party": column["party_raw"],
                "label": column["label"],
                "computed": computed,
                "printed": expected,
            })

    return {
        "contest_raw": contest_raw,
        "contest_name": contest_name,
        "level": level,
        "district": district,
        "reporting_scope": reporting_scope,
        "reporting_count": reporting_count,
        "published_at": published_at,
        "columns": columns,
        "values": values,
        "mismatches": mismatches,
    }


def build_rows(args, pages, sha256):
    rows = []
    source_published_values = {page["published_at"] for page in pages}
    if len(source_published_values) != 1 and not args.source_published_at:
        raise ValueError(f"PDF pages disagree on Last Updated: {sorted(source_published_values)}")
    published_at = args.source_published_at or next(iter(source_published_values))

    for page in pages:
        contest_key_base = "|".join([
            args.election_key,
            page["level"],
            slugify(page["contest_name"]),
        ])
        reporting_status = "certified" if args.certified else (
            "county_complete" if page["reporting_count"] == 23 else "partial"
        )
        for county in COUNTIES:
            for column_index, votes in page["values"][county].items():
                column = page["columns"][column_index]
                source_key = "|".join([
                    "wy", county_slug(county), args.election_key, args.source_role,
                ])
                contest_key = f"{contest_key_base}|{column['party'].lower()}"
                candidate_name = column["label"] if column["row_type"] == "candidate" else ""
                candidate_name_normalized = NORMALIZED_NAME_OVERRIDES.get(candidate_name, candidate_name)
                result_row_key = "|".join([
                    source_key, sha256, contest_key, column["row_type"],
                    candidate_name or column["row_type"], county, "COUNTY",
                    column["party_raw"],
                ])
                rows.append({
                    "election_key": args.election_key,
                    "source_key": source_key,
                    "county": county,
                    "contest_key": contest_key,
                    "contest_name_raw": page["contest_raw"],
                    "contest_name_normalized": page["contest_name"],
                    "level": page["level"],
                    "district": page["district"] if page["district"] is not None else "",
                    "ballot_party": column["party"],
                    "ballot_party_raw": column["party_raw"],
                    "reporting_scope": page["reporting_scope"],
                    "sha256": sha256,
                    "retrieved_at": args.retrieved_at,
                    "source_published_at": published_at,
                    "parser_name": PARSER_NAME,
                    "parser_version": PARSER_VERSION,
                    "is_unofficial": 0 if args.certified else 1,
                    "verification_status": "verified",
                    "source_url": args.source_url,
                    "precincts_reporting": "",
                    "precincts_total": "",
                    "reporting_status": reporting_status,
                    "row_type": column["row_type"],
                    "reporting_county": county,
                    "precinct_code": "",
                    "precinct_name_raw": "",
                    "candidate_name_raw": candidate_name,
                    "candidate_name_normalized": candidate_name_normalized,
                    "external_candidate_id": "",
                    "votes": votes,
                    "percentage_reported": "",
                    "result_row_key": result_row_key,
                })
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--election-key", required=True)
    parser.add_argument("--source-role", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-published-at", default=None)
    parser.add_argument("--retrieved-at", default=None)
    parser.add_argument("--certified", action="store_true")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    with open(args.pdf, "rb") as source_file:
        source_bytes = source_file.read()
    sha256 = hashlib.sha256(source_bytes).hexdigest()
    args.retrieved_at = args.retrieved_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with pdfplumber.open(args.pdf) as pdf:
        pages = [parse_page(page) for page in pdf.pages]

    mismatches = [mismatch for page in pages for mismatch in page["mismatches"]]
    if mismatches:
        print(f"Reconciliation FAILED for {len(mismatches)} result column(s):", file=sys.stderr)
        for mismatch in mismatches:
            print(f"  {mismatch}", file=sys.stderr)
        sys.exit(1)

    rows = build_rows(args, pages, sha256)
    if not rows:
        print("No reporting-county result rows found, refusing to emit an empty CSV.", file=sys.stderr)
        sys.exit(1)

    with open(args.out, "w", newline="", encoding="utf-8") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=NORMALIZED_FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    contests = len({row["contest_key"] for row in rows})
    counties = len({row["county"] for row in rows})
    print(f"OK: {len(rows)} rows, {contests} contests, {counties} reporting counties -> {args.out}")
    print(f"    sha256={sha256} reconciled=YES parser={PARSER_NAME}@{PARSER_VERSION}")


if __name__ == "__main__":
    main()
