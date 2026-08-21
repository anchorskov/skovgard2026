#!/usr/bin/env python3
"""Verify a county summary PDF against its precinct-detail PDF.

Both supported layouts require an exact row-for-row vote match. The
``repeated`` layout aggregates the same contest rows repeated once per
precinct. The ``matrix`` layout compares each summary contest to the
precinct report's final Totals row in source order.
"""

import argparse
from collections import Counter
import sys

import pdfplumber

from extract_election_results_county_pdf import NUM, contest_key_base, extract


def pdf_text(path):
    with pdfplumber.open(path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def reconciles(contest):
    if contest["contest_total"] is not None:
        return sum(row["votes"] for row in contest["rows"]) == contest["contest_total"]
    if contest["total_votes_cast"] is not None:
        return (
            sum(
                row["votes"]
                for row in contest["rows"]
                if row["row_type"] in ("candidate", "write_in_aggregate")
            )
            == contest["total_votes_cast"]
        )
    return False


def selected(contests, local_only):
    if local_only:
        unknown = [contest["contest_raw"] for contest in contests if contest["level"] == "unknown"]
        if unknown:
            raise ValueError("Unclassified contest(s): " + "; ".join(unknown))
        return [contest for contest in contests if contest["level"] in ("county", "city")]
    return contests


def aggregate(contests, election_key, county, allow_repeated=False):
    result = Counter()
    seen_keys = Counter(contest_key_base(election_key, county, contest) for contest in contests)
    duplicates = [key for key, count in seen_keys.items() if count > 1]
    if duplicates and not allow_repeated:
        raise ValueError(
            "Repeated contest labels cannot be aggregated without source occurrence identity: "
            + "; ".join(duplicates)
        )
    for contest in contests:
        if not reconciles(contest):
            raise ValueError(f"Contest did not reconcile: {contest['contest_raw']}")
        key = contest_key_base(election_key, county, contest)
        for row in contest["rows"]:
            identity = (key, row["row_type"], row["candidate_name_raw"] or "")
            result[identity] += row["votes"]
    return result


def verify_repeated(summary, precinct, election_key, county, local_only):
    expected = aggregate(selected(summary, local_only), election_key, county)
    actual = aggregate(
        selected(precinct, local_only), election_key, county, allow_repeated=True
    )
    if expected != actual:
        missing = expected - actual
        extra = actual - expected
        raise ValueError(
            f"Vote mismatch: {len(missing)} summary-only difference(s), "
            f"{len(extra)} precinct-only difference(s)"
        )
    return len(expected), len({identity[0] for identity in expected})


def parse_totals_line(line):
    return [int(value.replace(",", "")) for value in NUM.findall(line)]


def contest_total_sequence(contest):
    votes = [row["votes"] for row in contest["rows"]]
    return votes + [sum(votes)]


def verify_matrix(summary, precinct_pdf):
    index = 0
    pages_checked = 0
    with pdfplumber.open(precinct_pdf) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            totals_lines = [line for line in text.splitlines() if line.startswith("Totals ")]
            if "VOTE FOR" not in text or not totals_lines:
                continue
            actual = parse_totals_line(totals_lines[-1])
            matched = None
            for count in range(1, 5):
                if index + count > len(summary):
                    break
                expected = []
                for contest in summary[index:index + count]:
                    if not reconciles(contest):
                        raise ValueError(f"Summary contest did not reconcile: {contest['contest_raw']}")
                    expected.extend(contest_total_sequence(contest))
                if expected == actual:
                    matched = count
                    break
            if matched is None:
                next_name = summary[index]["contest_raw"] if index < len(summary) else "none"
                raise ValueError(
                    f"Precinct totals page {page_number} did not match the next summary contest: {next_name}"
                )
            index += matched
            pages_checked += 1
    if index != len(summary):
        raise ValueError(f"Only {index} of {len(summary)} summary contests matched precinct totals")
    return pages_checked, len(summary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summary-pdf", required=True)
    parser.add_argument("--precinct-pdf", required=True)
    parser.add_argument("--layout", required=True, choices=("repeated", "matrix"))
    parser.add_argument("--county", required=True)
    parser.add_argument("--election-key", required=True)
    parser.add_argument("--local-only", action="store_true")
    args = parser.parse_args()

    summary = extract(pdf_text(args.summary_pdf))
    if not summary:
        print("No summary contests parsed.", file=sys.stderr)
        return 1

    if args.layout == "matrix":
        pages, contests = verify_matrix(summary, args.precinct_pdf)
        print(f"OK: {contests} summary contests matched exactly across {pages} precinct-total pages")
    else:
        precinct = extract(pdf_text(args.precinct_pdf))
        rows, contests = verify_repeated(
            summary, precinct, args.election_key, args.county, args.local_only
        )
        print(f"OK: {rows} aggregate rows matched exactly across {contests} contests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
