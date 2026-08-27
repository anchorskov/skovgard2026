import argparse
import contextlib
import csv
import importlib.util
import sys
import tempfile
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


parser = load_module(
    "county_parser", ROOT / "scripts" / "extract_election_results_county_pdf.py"
)
generator = load_module(
    "results_generator", ROOT / "scripts" / "generate_election_results_sql.py"
)
sys.path.insert(0, str(ROOT / "scripts"))
verified_parser = load_module(
    "verified_markdown_parser",
    ROOT / "scripts" / "extract_election_results_verified_md.py",
)
precinct_verifier = load_module(
    "precinct_verifier",
    ROOT / "scripts" / "verify_election_results_precinct_pdf.py",
)
sys.path.pop(0)


class CountyResultsParserTests(unittest.TestCase):
    def test_percentage_column_uses_vote_total(self):
        contests = parser.extract(
            "\n".join(
                (
                    "REP COUNTY SHERIFF",
                    "Vote For 1",
                    "TOTAL VOTE %",
                    "JANE EXAMPLE 123 98.40%",
                    "Write-In Totals 2 1.60%",
                    "Total Votes Cast 125 100.00%",
                    "Overvotes 0",
                    "Undervotes 5",
                )
            )
        )
        self.assertEqual([123, 2, 0, 5], [row["votes"] for row in contests[0]["rows"]])
        self.assertEqual(125, contests[0]["total_votes_cast"])

    def test_named_write_in_breakdown_is_not_double_counted(self):
        contests = parser.extract(
            "\n".join(
                (
                    "REP COUNTY SHERIFF",
                    "Vote For 1",
                    "TOTAL VOTE %",
                    "JANE EXAMPLE 90 90.00%",
                    "Write-In Totals 10 10.00%",
                    "Write-In: JOHN EXAMPLE 6 6.00%",
                    "Write-In: INVALID 3 3.00%",
                    "Not Assigned 1 1.00%",
                    "Total Votes Cast 100 100.00%",
                    "Overvotes 0",
                    "Undervotes 5",
                    "Contest Totals 105",
                )
            )
        )
        self.assertEqual(1, len(contests))
        self.assertEqual(
            [("candidate", 90), ("write_in_aggregate", 10), ("overvote", 0), ("undervote", 5)],
            [(row["row_type"], row["votes"]) for row in contests[0]["rows"]],
        )

    def test_repeated_heading_continues_open_contest_after_page_break(self):
        contests = parser.extract(
            "\n".join(
                (
                    "MAYOR CITY OF EXAMPLE",
                    "Vote For 1",
                    "TOTAL VOTE %",
                    "JANE EXAMPLE 90 90.00%",
                    "Write-In Totals 10 10.00%",
                    "Write-In: JOHN EXAMPLE 6 6.00%",
                    "Election Summary - 08/26/2026 12:23PM Page 1 of 2",
                    "Example County, Wyoming OFFICIAL RESULTS",
                    "PRIMARY ELECTION",
                    "August 18, 2026 Election Summary Report",
                    "MAYOR CITY OF EXAMPLE",
                    "Vote For 1",
                    "TOTAL VOTE %",
                    "Write-In: INVALID 3 3.00%",
                    "Not Assigned 1 1.00%",
                    "Total Votes Cast 100 100.00%",
                    "Overvotes 0",
                    "Undervotes 5",
                    "Contest Totals 105",
                )
            )
        )
        self.assertEqual(1, len(contests))
        self.assertEqual(105, contests[0]["contest_total"])
        self.assertEqual([90, 10, 0, 5], [row["votes"] for row in contests[0]["rows"]])

    def test_2026_page_mastheads_are_boilerplate(self):
        examples = (
            "Election Summary - 08/18/2026 10:47PM Page 1 of 26",
            "2026 Primary Election",
            "Carbon Primary 2026",
            "Precincts Reporting 14 of 14",
            "1-1",
            "23-1 NORTHEAST DOUGLAS",
        )
        self.assertTrue(all(parser.is_page_boilerplate(value) for value in examples))

    def test_precinct_statistics_block_ends_the_preceding_contest(self):
        contests = parser.extract(
            "\n".join(
                (
                    "REP COUNTY SHERIFF",
                    "Vote For 1",
                    "JANE EXAMPLE 100",
                    "Write-In Totals 2",
                    "Total Votes Cast 102",
                    "Overvotes 0",
                    "Undervotes 5",
                    "STATISTICS",
                    "TOTAL",
                    "Registered Voters - Total 500",
                    "Ballots Cast - Total 200",
                    "REP COUNTY CLERK",
                    "Vote For 1",
                    "JOHN EXAMPLE 90",
                    "Write-In Totals 1",
                    "Total Votes Cast 91",
                    "Overvotes 0",
                    "Undervotes 4",
                )
            )
        )
        self.assertEqual(2, len(contests))
        self.assertEqual(102, sum(row["votes"] for row in contests[0]["rows"] if row["row_type"] in ("candidate", "write_in_aggregate")))
        self.assertEqual("JANE EXAMPLE", contests[0]["rows"][0]["candidate_name_raw"])

    def test_county_variants_normalize(self):
        cases = {
            "REP U.S. REP REP": ("United States Representative", "federal"),
            "DEM STATE REP HD15 DEM DISTRICT 15": ("House District 15", "wy_house"),
            "REP US REP": ("United States Representative", "federal"),
            "REP 1-1 COMMITTEEMAN": ("Precinct Committeeman 1-1", "county"),
            "REP COMMITTEEMEN 1-01": ("Precinct Committeeman 1-1", "county"),
            "DEM COMMITTEEWOMEN 4-09": ("Precinct Committeewoman 4-9", "county"),
            "WHEATLAND MAYOR": ("Wheatland Mayor", "city"),
            "REP SUPERINTENDENT OF PUB INSTRUCTION": (
                "Superintendent Of Public Instruction",
                "statewide",
            ),
            "REP SUPER PUBLIC INSTRUCT": (
                "Superintendent Of Public Instruction",
                "statewide",
            ),
            "REP DISTRICT 11 STATE SENATOR": ("Senate District 11", "wy_senate"),
            "REP STATE SENATOR, DIST #1": ("Senate District 1", "wy_senate"),
            "REP STATE SEN SENATE DIST #23": ("Senate District 23", "wy_senate"),
            "REP STATE HOUSE 38": ("House District 38", "wy_house"),
            "DEM STATE HOUSE 62": ("House District 62", "wy_house"),
            "REP STATE REP, DIST #1": ("House District 1", "wy_house"),
            "REP STATE REP HOUSE DIST #52": ("House District 52", "wy_house"),
            "REP COMMISSIONER DIST 1": ("County Commissioner District 1", "county"),
            "DEM COMMISSIONER DISTRICT 4 DISTRICT 4": (
                "County Commissioner District 4",
                "county",
            ),
            "REP CLERK DIST COURT": ("Clerk Of District Court", "county"),
        }
        for raw, expected in cases.items():
            normalized = parser.normalize_contest(raw)
            self.assertEqual(expected, normalized[:2])

    def test_sweetwater_municipality_only_titles_normalize(self):
        for raw in ("SUPERIOR", "SUPERIOR SUPERIOR", "WAMSUTTER", "GRANGER"):
            normalized = parser.normalize_contest(raw, "Sweetwater")
            self.assertEqual((raw.title(), "city", None, "city", None), normalized)

        self.assertEqual("unknown", parser.normalize_contest("SUPERIOR", "Carbon")[1])

    def test_ballot_measures_classify_as_ballot_measure_not_county(self):
        # Confirmed real bug on Laramie's 14 "PROPOSITION N" contests and
        # already-live Sublette data: these are not candidate races and
        # must not be stored with "FOR THE TAX"/"AGAINST THE TAX" as a
        # candidate_name_raw. level="ballot_measure" is its own value
        # (not "unknown") so --local-only excludes it silently instead of
        # hard-failing the way it correctly does for a genuinely
        # unrecognized title.
        for raw in ("PROPOSITION 1", "PRO 1 PERCENT SALES AND USE TAX", "SENIOR CITIZEN TAX QUESTION"):
            self.assertEqual("ballot_measure", parser.normalize_contest(raw)[1])

    def test_local_only_excludes_ballot_measures_without_failing(self):
        text = "\n".join((
            "PROPOSITION 1",
            "Vote For 1",
            "FOR 100",
            "AGAINST 50",
            "Contest Totals 150",
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "Write-In Totals 5",
            "Overvotes 0",
            "Undervotes 2",
            "Contest Totals 107",
        ))
        contests = parser.extract(text)
        levels = {c["contest_raw"]: c["level"] for c in contests}
        self.assertEqual("ballot_measure", levels["PROPOSITION 1"])
        self.assertEqual("county", levels["REP COUNTY SHERIFF"])

    def test_local_key_includes_county(self):
        contest = {
            "level": "county",
            "contest_name": "County Commissioner",
            "party_raw": "REP",
        }
        self.assertEqual(
            "wy-2026-primary|county|carbon|county-commissioner|rep",
            parser.contest_key_base("wy-2026-primary", "Carbon", contest),
        )

    def test_generator_accepts_county_local_source_role(self):
        row = {
            "source_key": "source",
            "election_key": "wy-2026-primary",
            "county": "Carbon",
            "source_url": "https://example.test/results.pdf",
        }
        output = []
        generator.emit_sources([row], output, "county_local_summary")
        self.assertIn("'county_local_summary'", output[0])

    def test_generator_records_source_succession_in_insert(self):
        row = {
            "source_key": "wy|natrona|official",
            "election_key": "wy-2026-primary",
            "county": "Natrona",
            "source_url": "https://example.test/official.pdf",
        }
        output = []
        generator.emit_sources(
            [row],
            output,
            "county_local_summary",
            {"wy|natrona|official": "wy|natrona|unofficial"},
        )
        self.assertIn("supersedes_source_id", output[0])
        self.assertIn("FROM election_sources", output[0])
        self.assertIn("'wy|natrona|unofficial'", output[0])

    def test_generator_rejects_unknown_superseding_input_key(self):
        with self.assertRaises(ValueError):
            generator.parse_supersedes(
                ["wy|natrona|official=wy|natrona|unofficial"],
                {"wy|campbell|official"},
            )

    def test_generator_sets_county_for_precinct_committee_contest(self):
        row = {
            "contest_key": "contest",
            "election_key": "wy-2026-primary",
            "contest_name_raw": "REP PRECINCT COMMITTEEMAN 1-1",
            "contest_name_normalized": "Precinct Committeeman 1-1",
            "level": "county",
            "district": "",
            "ballot_party": "REP",
            "ballot_party_raw": "REP",
            "reporting_scope": "precinct",
            "county": "Natrona",
        }
        output = []
        generator.emit_contests([row], output)
        self.assertIn("'Natrona'", output[0])


class VerifiedMarkdownAdapterTests(unittest.TestCase):
    def test_explicit_contest_override_replaces_only_named_block(self):
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "SCRAMBLED OCR 999",
            "Contest Totals 999",
            "REP COUNTY CLERK",
            "Vote For 1",
            "JANE CLERK 40",
            "Write-In Totals 1",
            "Overvotes 0",
            "Undervotes 9",
            "Contest Totals 50",
        ))
        override = {
            "contests": [{
                "contest_header": "REP COUNTY SHERIFF",
                "vote_for": 1,
                "rows": [
                    {"label": "JANE SHERIFF", "votes": 30},
                    {"label": "Write-In Totals", "votes": 2},
                    {"label": "Overvotes", "votes": 0},
                    {"label": "Undervotes", "votes": 8},
                ],
                "contest_total": 40,
            }]
        }

        corrected = verified_parser.apply_overrides(text, override)
        contests = parser.extract(corrected, "Converse")

        self.assertEqual(2, len(contests))
        self.assertEqual("JANE SHERIFF", contests[0]["rows"][0]["candidate_name_raw"])
        self.assertEqual(40, sum(row["votes"] for row in contests[0]["rows"]))
        self.assertEqual("JANE CLERK", contests[1]["rows"][0]["candidate_name_raw"])


class PrecinctVerifierTests(unittest.TestCase):
    def test_matrix_multiset_comparison_allows_alphabetized_columns(self):
        expected = [938, 869, 9, 1816, 0, 67]
        actual = [869, 938, 9, 1816, 0, 67]
        self.assertFalse(precinct_verifier.matrix_values_match(expected, actual))
        self.assertTrue(
            precinct_verifier.matrix_values_match(
                expected,
                actual,
                ignore_column_order=True,
            )
        )

    def test_matrix_sequence_uses_total_votes_cast_before_trailers(self):
        contest = {
            "rows": [
                {"row_type": "candidate", "votes": 938},
                {"row_type": "candidate", "votes": 869},
                {"row_type": "write_in_aggregate", "votes": 9},
                {"row_type": "overvote", "votes": 0},
                {"row_type": "undervote", "votes": 67},
            ],
            "total_votes_cast": 1816,
            "contest_total": 1883,
        }
        self.assertEqual(
            [938, 869, 9, 1816, 0, 67],
            precinct_verifier.contest_total_sequence(contest),
        )
        expected_options = precinct_verifier.matrix_expected_sequences(
            [contest],
            allow_omitted_undervotes=True,
        )
        self.assertIn([938, 869, 9, 1816, 0], expected_options)

    def test_matrix_sequence_accepts_exact_contest_total_trailer_order(self):
        contest = {
            "rows": [
                {"row_type": "candidate", "votes": 62},
                {"row_type": "candidate", "votes": 2156},
                {"row_type": "candidate", "votes": 70},
                {"row_type": "candidate", "votes": 489},
                {"row_type": "candidate", "votes": 69},
                {"row_type": "write_in_aggregate", "votes": 2},
                {"row_type": "overvote", "votes": 1},
                {"row_type": "undervote", "votes": 70},
            ],
            "total_votes_cast": 2848,
            "contest_total": 2919,
        }
        expected_options = precinct_verifier.matrix_expected_sequences([contest])
        self.assertIn([62, 2156, 70, 489, 69, 2, 1, 70, 2919], expected_options)


class MissingUndervoteOvervoteExceptionTests(unittest.TestCase):
    """--allow-missing-undervote-overvote: Fremont 2026 prints candidate and
    write-in rows plus a Contest Totals checksum, but never an Overvotes or
    Undervotes trailer line anywhere in the document -- confirmed on the
    real PDF, zero matches for either label. The exception must accept a
    contest ONLY when that document-wide absence holds, and must never
    accept an overage or paper over a single dropped line in a document
    that has real undervote/overvote lines elsewhere (that's the Albany
    silently-dropped-value case, which must stay rejected)."""

    def _args(self, out_path, allow_exception):
        p = argparse.ArgumentParser()
        parser.add_common_args(p)
        argv = [
            "--pdf", "unused.pdf",
            "--county", "Fremont",
            "--election-key", "wy-2026-primary",
            "--source-key", "wy|fremont|wy-2026-primary|county_local_summary",
            "--source-url", "https://example.test/fremont.pdf",
            "--out", str(out_path),
        ]
        if allow_exception:
            argv.append("--allow-missing-undervote-overvote")
        args = p.parse_args(argv)
        args.sha256 = "deadbeef"
        args.retrieved_at = "2026-08-21T00:00:00Z"
        return args

    def _run(self, text, out_path, allow_exception):
        args = self._args(out_path, allow_exception)
        parser.run_from_text(text, args)
        with open(out_path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def test_accepts_shortfall_when_document_never_prints_undervote_overvote(self):
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "Write-In Totals 5",
            "Contest Totals 120",  # shortfall of 15 -- no undervote/overvote line anywhere
        ))
        with tempfile_out() as out_path:
            rows = self._run(text, out_path, allow_exception=True)
        self.assertEqual(2, len(rows))
        self.assertTrue(all(r["verification_status"] == "needs_review" for r in rows))
        self.assertEqual({"100", "5"}, {r["votes"] for r in rows})

    def test_rejects_shortfall_without_the_flag(self):
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "Write-In Totals 5",
            "Contest Totals 120",
        ))
        with tempfile_out() as out_path:
            with self.assertRaises(SystemExit):
                self._run(text, out_path, allow_exception=False)

    def test_rejects_overage_even_with_the_flag(self):
        # summed > target is a different bug class (e.g. a misread digit),
        # never a missing-undervote-row situation -- must still hard-fail.
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "Write-In Totals 5",
            "Contest Totals 90",
        ))
        with tempfile_out() as out_path:
            with self.assertRaises(SystemExit):
                self._run(text, out_path, allow_exception=True)

    def test_rejects_when_document_has_a_real_undervote_line_elsewhere(self):
        # A second contest in the same document DOES print Undervotes, so a
        # missing line on the first contest means extraction dropped it,
        # not that this report format omits it -- the exception must not
        # apply to the first contest even with the flag set. The second
        # contest reconciles normally on its own merits, so the run as a
        # whole still succeeds (same "withhold the bad ones, keep the
        # good ones" behavior as every other partial-county import) --
        # what matters here is that SHERIFF specifically is withheld.
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "Write-In Totals 5",
            "Contest Totals 120",
            "REP COUNTY CLERK",
            "Vote For 1",
            "JOHN EXAMPLE 50",
            "Write-In Totals 1",
            "Overvotes 0",
            "Undervotes 3",
            "Contest Totals 54",
        ))
        with tempfile_out() as out_path:
            rows = self._run(text, out_path, allow_exception=True)
        self.assertEqual(set(), {r["candidate_name_raw"] for r in rows} & {"JANE EXAMPLE"})
        self.assertIn("JOHN EXAMPLE", {r["candidate_name_raw"] for r in rows})
        self.assertTrue(all(r["verification_status"] == "verified" for r in rows))


class MissingContestTotalStagingTests(unittest.TestCase):
    """The Sheridan exception stages source-printed rows without claiming
    reconciliation. It is valid only for a uniformly checksum-free report."""

    def _args(self, out_path, *extra_flags):
        p = argparse.ArgumentParser()
        parser.add_common_args(p)
        args = p.parse_args([
            "--pdf", "unused.pdf",
            "--county", "Sheridan",
            "--election-key", "wy-2026-primary",
            "--source-key", "wy|sheridan|wy-2026-primary|county_local_summary",
            "--source-url", "https://example.test/sheridan.pdf",
            "--local-only",
            "--out", str(out_path),
            *extra_flags,
        ])
        args.sha256 = "deadbeef"
        args.retrieved_at = "2026-08-21T00:00:00Z"
        return args

    def _run(self, text, out_path, *extra_flags):
        parser.run_from_text(text, self._args(out_path, *extra_flags))
        with open(out_path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def test_stages_only_printed_rows_as_needs_review(self):
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "Write-In Totals 5",
        ))
        with tempfile_out() as out_path:
            rows = self._run(text, out_path, "--allow-missing-contest-total")
        self.assertEqual(2, len(rows))
        self.assertEqual({"candidate", "write_in_aggregate"}, {r["row_type"] for r in rows})
        self.assertTrue(all(r["verification_status"] == "needs_review" for r in rows))
        self.assertTrue(all(r["reporting_status"] == "manual_required" for r in rows))
        self.assertTrue(all(r["percentage_reported"] == "" for r in rows))

    def test_rejects_missing_total_without_flag(self):
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
        ))
        with tempfile_out() as out_path:
            with self.assertRaises(SystemExit):
                self._run(text, out_path)

    def test_rejects_mixed_document_with_a_checksum(self):
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "REP COUNTY CLERK",
            "Vote For 1",
            "JOHN EXAMPLE 50",
            "Contest Totals 50",
        ))
        with tempfile_out() as out_path:
            with self.assertRaises(SystemExit):
                self._run(text, out_path, "--allow-missing-contest-total")

    def test_rejects_document_with_undervote_or_overvote_rows(self):
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "Undervotes 5",
        ))
        with tempfile_out() as out_path:
            with self.assertRaises(SystemExit):
                self._run(text, out_path, "--allow-missing-contest-total")

    def test_rejects_certified_label(self):
        text = "\n".join((
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
        ))
        with tempfile_out() as out_path:
            with self.assertRaises(SystemExit):
                self._run(
                    text,
                    out_path,
                    "--allow-missing-contest-total",
                    "--certified",
                )

    def test_exception_flags_are_mutually_exclusive(self):
        with tempfile_out() as out_path:
            with self.assertRaises(SystemExit):
                self._args(
                    out_path,
                    "--allow-missing-contest-total",
                    "--allow-missing-undervote-overvote",
                )


class BallotMeasureEndToEndTest(unittest.TestCase):
    def test_ballot_measure_excluded_from_full_candidate_result_set(self):
        text = "\n".join((
            "PROPOSITION 1",
            "Vote For 1",
            "FOR 100",
            "AGAINST 50",
            "Contest Totals 150",
            "REP COUNTY SHERIFF",
            "Vote For 1",
            "JANE EXAMPLE 100",
            "Write-In Totals 5",
            "Overvotes 0",
            "Undervotes 2",
            "Contest Totals 107",
        ))
        p = argparse.ArgumentParser()
        parser.add_common_args(p)
        with tempfile_out() as out_path:
            args = p.parse_args([
                "--pdf", "unused.pdf",
                "--county", "Laramie",
                "--election-key", "wy-2026-primary",
                "--source-key", "wy|laramie|wy-2026-primary|county_local_summary",
                "--source-url", "https://example.test/laramie.pdf",
                "--out", str(out_path),
            ])
            args.sha256 = "deadbeef"
            args.retrieved_at = "2026-08-21T00:00:00Z"
            parser.run_from_text(text, args)  # must not sys.exit
            with open(out_path, newline="", encoding="utf-8") as f:
                rows = list(csv.DictReader(f))
        self.assertNotIn("FOR", {r["candidate_name_raw"] for r in rows})
        self.assertNotIn("AGAINST", {r["candidate_name_raw"] for r in rows})
        self.assertIn("JANE EXAMPLE", {r["candidate_name_raw"] for r in rows})


@contextlib.contextmanager
def tempfile_out():
    with tempfile.TemporaryDirectory() as d:
        yield Path(d) / "out.csv"


if __name__ == "__main__":
    unittest.main()
