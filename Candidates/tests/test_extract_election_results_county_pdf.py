import argparse
import contextlib
import csv
import importlib.util
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

    def test_2026_page_mastheads_are_boilerplate(self):
        examples = (
            "Election Summary - 08/18/2026 10:47PM Page 1 of 26",
            "2026 Primary Election",
            "Carbon Primary 2026",
            "Precincts Reporting 14 of 14",
        )
        self.assertTrue(all(parser.is_page_boilerplate(value) for value in examples))

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


class LocalOnlyBallotMeasureEndToEndTest(unittest.TestCase):
    def test_ballot_measure_excluded_silently_candidate_contest_still_emitted(self):
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
                "--local-only",
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
