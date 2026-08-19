import importlib.util
import pathlib
import unittest


SCRIPT = pathlib.Path(__file__).parents[1] / "scripts" / "extract_election_results_statewide_pdf.py"
SPEC = importlib.util.spec_from_file_location("statewide_parser", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StatewideSummaryParserTests(unittest.TestCase):
    def test_federal_contest_normalization(self):
        self.assertEqual(
            MODULE.normalize_contest("United States Senator, Continued"),
            ("United States Senator", "federal", None, "statewide"),
        )

    def test_legislative_contest_normalization(self):
        self.assertEqual(
            MODULE.normalize_contest("House District 27"),
            ("House District 27", "wy_house", 27, "legislative_district"),
        )

    def test_statewide_title_matches_office_vocabulary(self):
        self.assertEqual(
            MODULE.normalize_contest("Secretary of State")[0],
            "Secretary Of State",
        )

    def test_withdrawn_candidate_name_comes_from_footnote(self):
        text = "Last Updated: * Frank Chapman withdrew his candidacy after ballots were printed."
        self.assertEqual(MODULE.withdrawn_name(text), "Frank Chapman")

    def test_reviewed_name_overrides_preserve_a_canonical_match(self):
        self.assertEqual(MODULE.NORMALIZED_NAME_OVERRIDES["Scott Smitth"], "Scott Smith")
        self.assertEqual(MODULE.NORMALIZED_NAME_OVERRIDES["Kenneth R. Casner"], "Kenneth R Casner")


if __name__ == "__main__":
    unittest.main()
