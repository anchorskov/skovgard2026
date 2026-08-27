#!/usr/bin/env python3
"""Verify a county summary PDF against its precinct-detail PDF.

Both supported layouts require an exact row-for-row vote match. The
``repeated`` layout aggregates the same contest rows repeated once per
precinct. The ``matrix`` layout compares each summary contest to the
precinct report's final Totals row in source order.
"""

import argparse
from collections import Counter
from itertools import product
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


def contest_total_sequence(contest, include_undervote=True):
    vote_rows = [
        row["votes"]
        for row in contest["rows"]
        if row["row_type"] in ("candidate", "write_in_aggregate")
    ]
    trailer_rows = [
        row["votes"]
        for row in contest["rows"]
        if row["row_type"] == "overvote"
        or (include_undervote and row["row_type"] == "undervote")
    ]
    total_votes_cast = contest["total_votes_cast"]
    if total_votes_cast is None:
        total_votes_cast = sum(vote_rows)
    return vote_rows + [total_votes_cast] + trailer_rows


def contest_total_sequence_with_contest_total(contest, include_undervote=True):
    """Return the alternate matrix order used by several official reports.

    Crook, Park, and Sweetwater print candidate/write-in values, then
    overvotes and undervotes, then the full Contest Totals value. This is a
    different exact ordering from the Natrona-style matrix above, not a
    relaxed comparison.
    """
    vote_rows = [
        row["votes"]
        for row in contest["rows"]
        if row["row_type"] in ("candidate", "write_in_aggregate")
    ]
    trailer_rows = [
        row["votes"]
        for row in contest["rows"]
        if row["row_type"] == "overvote"
        or (include_undervote and row["row_type"] == "undervote")
    ]
    if contest["contest_total"] is None:
        return None
    return vote_rows + trailer_rows + [contest["contest_total"]]


def matrix_expected_sequences(contests, allow_omitted_undervotes=False):
    choices = []
    for contest in contests:
        contest_choices = [contest_total_sequence(contest)]
        alternate = contest_total_sequence_with_contest_total(contest)
        if alternate is not None and alternate not in contest_choices:
            contest_choices.append(alternate)
        if allow_omitted_undervotes and any(
            row["row_type"] == "undervote" for row in contest["rows"]
        ):
            without_undervote = contest_total_sequence(
                contest, include_undervote=False
            )
            if without_undervote not in contest_choices:
                contest_choices.append(without_undervote)
            alternate_without_undervote = contest_total_sequence_with_contest_total(
                contest, include_undervote=False
            )
            if (
                alternate_without_undervote is not None
                and alternate_without_undervote not in contest_choices
            ):
                contest_choices.append(alternate_without_undervote)
        choices.append(contest_choices)
    return [
        [value for sequence in combination for value in sequence]
        for combination in product(*choices)
    ]


def matrix_values_match(expected, actual, ignore_column_order=False):
    if ignore_column_order:
        return sorted(expected) == sorted(actual)
    return expected == actual


def verify_matrix(
    summary,
    precinct_pdf,
    ignore_column_order=False,
    allow_omitted_undervotes=False,
):
    index = 0
    pages_checked = 0
    last_matched_contests = []
    with pdfplumber.open(precinct_pdf) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            lines = text.splitlines()
            vote_for_indexes = [
                line_number
                for line_number, line in enumerate(lines)
                if "VOTE FOR" in line
            ]
            totals_lines = [
                (line_number, line)
                for line_number, line in enumerate(lines)
                if line.startswith("Totals ") and NUM.search(line)
            ]
            if not vote_for_indexes or not totals_lines:
                continue
            result_totals = [
                line
                for line_number, line in totals_lines
                if line_number > vote_for_indexes[0]
            ]
            if not result_totals:
                continue
            actual = parse_totals_line(result_totals[-1])
            if allow_omitted_undervotes and last_matched_contests:
                supplemental_undervotes = [
                    row["votes"]
                    for contest in last_matched_contests
                    for row in contest["rows"]
                    if row["row_type"] == "undervote"
                ]
                if supplemental_undervotes and sorted(actual) == sorted(supplemental_undervotes):
                    pages_checked += 1
                    continue
            matched = None
            for count in range(1, 5):
                if index + count > len(summary):
                    break
                contests = summary[index:index + count]
                for contest in contests:
                    if not reconciles(contest):
                        raise ValueError(f"Summary contest did not reconcile: {contest['contest_raw']}")
                expected_options = matrix_expected_sequences(
                    contests,
                    allow_omitted_undervotes=allow_omitted_undervotes,
                )
                if any(
                    matrix_values_match(expected, actual, ignore_column_order)
                    for expected in expected_options
                ):
                    matched = count
                    break
            if matched is None:
                next_name = summary[index]["contest_raw"] if index < len(summary) else "none"
                raise ValueError(
                    f"Precinct totals page {page_number} did not match summary contest "
                    f"{index + 1}: {next_name}"
                )
            index += matched
            pages_checked += 1
            last_matched_contests = summary[index - matched:index]
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
    parser.add_argument(
        "--matrix-ignore-column-order",
        action="store_true",
        help=(
            "Compare each matrix Totals row as a multiset. Use this when the "
            "matrix alphabetizes candidate columns instead of preserving the "
            "summary report order, as Natrona's numbered-key canvass does."
        ),
    )
    parser.add_argument(
        "--matrix-allow-omitted-undervotes",
        action="store_true",
        help=(
            "Allow a matrix contest to omit its undervote column while every "
            "printed value still matches exactly. Natrona's numbered-key "
            "canvass does this for some multi-selection contests."
        ),
    )
    args = parser.parse_args()

    summary = extract(pdf_text(args.summary_pdf), args.county)
    if not summary:
        print("No summary contests parsed.", file=sys.stderr)
        return 1

    if args.layout == "matrix":
        pages, contests = verify_matrix(
            summary,
            args.precinct_pdf,
            ignore_column_order=args.matrix_ignore_column_order,
            allow_omitted_undervotes=args.matrix_allow_omitted_undervotes,
        )
        print(f"OK: {contests} summary contests matched exactly across {pages} precinct-total pages")
    else:
        precinct = extract(pdf_text(args.precinct_pdf), args.county)
        rows, contests = verify_repeated(
            summary, precinct, args.election_key, args.county, args.local_only
        )
        print(f"OK: {rows} aggregate rows matched exactly across {contests} contests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
