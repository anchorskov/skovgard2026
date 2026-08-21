import importlib.util
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
            "WHEATLAND MAYOR": ("Wheatland Mayor", "city"),
            "REP SUPERINTENDENT OF PUB INSTRUCTION": (
                "Superintendent Of Public Instruction",
                "statewide",
            ),
            "REP DISTRICT 11 STATE SENATOR": ("Senate District 11", "wy_senate"),
        }
        for raw, expected in cases.items():
            normalized = parser.normalize_contest(raw)
            self.assertEqual(expected, normalized[:2])

    def test_sweetwater_municipality_only_titles_normalize(self):
        for raw in ("SUPERIOR", "SUPERIOR SUPERIOR", "WAMSUTTER", "GRANGER"):
            normalized = parser.normalize_contest(raw, "Sweetwater")
            self.assertEqual((raw.title(), "city", None, "city", None), normalized)

        self.assertEqual("unknown", parser.normalize_contest("SUPERIOR", "Carbon")[1])

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


if __name__ == "__main__":
    unittest.main()
