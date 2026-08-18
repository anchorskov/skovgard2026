# Candidates/scripts/seed_election_source_registry.py
#
# Registers the 23-county source registry into election_sources, separate
# from and additive to the SOS xlsx_wide_header pipeline
# (extract_election_results_xlsx.py / generate_election_results_sql.py).
# This script only writes REGISTRY rows (which endpoints exist, where, in
# what format), it does not ingest any result data. Per
# Candidates/docs/wyoming_2026_election_results_sources.md ("Do not automate
# ingestion until at least one real 2026 artifact from that source has
# passed schema and content review"), no 2026 county-hosted source is
# ingested here; registering it as `status='pending'` is the correct first
# step, not a shortcut around that rule.
#
# Two source rows per county where verified:
#   - wy-2026-primary, source_role='landing_page': the official page to poll
#     after polls close tonight. status='pending', nothing has been
#     ingested from it, it doesn't exist yet.
#   - wy-2024-primary, source_role='county_local_summary': the verified
#     2024 county-hosted result page/PDF, when the research doc confirmed
#     one exists. status='active' (it's a real, examined, working source)
#     but distinct from the SOS-track 'county_pbp_summary' rows already
#     registered by generate_election_results_sql.py, this one is the
#     target for a FUTURE county-hosted-format adapter (PDF/HTML), not yet
#     ingested into election_results_rows. 5 counties (Crook, Johnson,
#     Platte, Sweetwater, Uinta) have no verified county-hosted 2024 source
#     at all, their only 2024 source is the SOS fallback, already
#     registered, and they get no county_local_summary row here.
#
# Source: Candidates/docs/wyoming_2026_election_results_sources.md,
# sections 3-5, verified 2026-08-18 13:11 MDT.

import argparse

# (county, county_fips, 2026_landing_page_url, 2024_county_hosted_url_or_None, format_or_None)
COUNTIES = [
    ("Albany", "56001", "https://www.albanycountywy.gov/177/Previous-Election-Results",
     "https://www.albanycountywy.gov/DocumentCenter/View/6819/OFFICIAL-RESULTS---2024-Primary-Election-", "pdf_text"),
    ("Big Horn", "56003", "https://www.bighorncountywy.gov/departments/clerk/elections",
     "https://www.bighorncountywy.gov/component/edocman/county-clerk/2024-election/election-night-unofficial-results", "vendor_page"),
    ("Campbell", "56005", "https://www.campbellcountywy.gov/2077/Election-Results",
     "https://www.campbellcountywy.gov/DocumentCenter/View/23726/2024-Primary-Election", "pdf_text"),
    ("Carbon", "56007", "https://carboncountywy.gov/997/Election-Results",
     "https://carboncountywy.gov/997/Election-Results", "static_html"),
    ("Converse", "56009", "https://conversecountywy.gov/538/2024-Election-Results",
     "https://conversecountywy.gov/538/2024-Election-Results", "static_html"),
    ("Crook", "56011", "https://www.crookcounty.wy.gov/elected_officials/clerk/election/index.php", None, None),
    ("Fremont", "56013", "https://fremontcountywy.gov/government/elections___voting.php",
     "https://fremontcountywy.gov/government/elections___voting.php", "static_html"),
    ("Goshen", "56015", "https://www.goshencountywy.gov/Archive.aspx?AMID=37",
     "https://www.goshencountywy.gov/Archive.aspx?AMID=37", "static_html"),
    ("Hot Springs", "56017", "https://hscounty.com/component/edocman/election-results-archives/election-2024?Itemid=100",
     "https://hscounty.com/component/edocman/election-results-archives/election-2024?Itemid=100", "vendor_page"),
    ("Johnson", "56019", "https://www.johnsoncowy.gov/departments/elections", None, None),
    ("Laramie", "56021", "https://www.laramiecountywy.gov/County-Government/Elected-Officials/County-Clerk/Elections/Election-Results",
     "https://www.laramiecountywy.gov/County-Government/Elected-Officials/County-Clerk/Elections/Election-Results", "static_html"),
    ("Lincoln", "56023", "https://www.lincolncountywy.gov/government/clerk/elections_voting_information/election_results.php",
     "https://www.lincolncountywy.gov/government/clerk/elections_voting_information/election_results.php", "static_html"),
    ("Natrona", "56025", "https://www.natronacounty-wy.gov/659/Results-Archive",
     "https://www.natronacounty-wy.gov/659/Results-Archive", "static_html"),
    ("Niobrara", "56027", "https://www.niobraracounty.org/_departments/_county_clerk/Pastelectionresults.asp",
     "https://www.niobraracounty.org/_departments/_county_clerk/Pastelectionresults.asp", "static_html"),
    ("Park", "56029", "https://parkcounty-wy.gov/county-elections/results/",
     "https://parkcounty-wy.gov/county-elections/results/", "static_html"),
    ("Platte", "56031", "https://www.plattecountywyoming.com/directory/Elections", None, None),
    ("Sheridan", "56033", "https://www.sheridancountywy.gov/news_detail_T10_R91.php",
     "https://www.sheridancountywy.gov/news_detail_T10_R91.php", "static_html"),
    ("Sublette", "56035", "https://www.sublettecountywy.gov/110/Election-Information",
     "https://www.sublettecountywy.gov/110/Election-Information", "static_html"),
    ("Sweetwater", "56037", "https://www.sweetwatercountywy.gov/departments/county_clerk/elections.php", None, None),
    ("Teton", "56039", "https://www.tetoncountywy.gov/271/Election-Results",
     "https://www.tetoncountywy.gov/271/Election-Results", "static_html"),
    ("Uinta", "56041", "https://uintacountywy.gov/438/FAQs-Wyoming-Elections", None, None),
    ("Washakie", "56043", "https://www.washakiecountywy.gov/196/Elections",
     "https://www.washakiecountywy.gov/196/Elections", "static_html"),
    ("Weston", "56045", "https://www.westongov.com/county-clerk/elections/election-results/",
     "https://www.westongov.com/county-clerk/elections/election-results/", "static_html"),
]

SOS_2026_RESULTS_ARCHIVE = "https://sos.wyo.gov/elections/electionresults.aspx"


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def slugify(county):
    return county.lower().replace(" ", "_")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", required=True)
    p.add_argument(
        "--scope",
        choices=("all", "2026-primary"),
        default="all",
        help="Limit output to the 2026 primary landing-page registry when needed.",
    )
    args = p.parse_args()

    out = [
        "-- Generated by Candidates/scripts/seed_election_source_registry.py",
        "-- Idempotent: INSERT OR IGNORE against election_sources.source_key UNIQUE.",
        "-- Registry only, no result data. See file header for status semantics.",
        "",
    ]

    out.append(
        "INSERT OR IGNORE INTO election_sources "
        "(source_key, election_id, county, county_fips, source_role, source_type, landing_page_url, endpoint_url, status, notes) "
        "SELECT 'wy|statewide|wy-2026-primary|landing_page', "
        "(SELECT id FROM election_events WHERE election_key = 'wy-2026-primary'), "
        "NULL, NULL, 'landing_page', 'static_html', "
        f"{sql_str(SOS_2026_RESULTS_ARCHIVE)}, {sql_str(SOS_2026_RESULTS_ARCHIVE)}, 'pending', "
        "'Official Wyoming Secretary of State election-results archive monitoring page.';"
    )

    for county, fips, landing_2026, hosted_2024, fmt in COUNTIES:
        slug = slugify(county)

        out.append(
            "INSERT OR IGNORE INTO election_sources "
            "(source_key, election_id, county, county_fips, source_role, source_type, landing_page_url, endpoint_url, status, notes) "
            "SELECT "
            f"{sql_str(f'wy|{slug}|wy-2026-primary|landing_page')}, "
            f"(SELECT id FROM election_events WHERE election_key = 'wy-2026-primary'), "
            f"{sql_str(county)}, {sql_str(fips)}, 'landing_page', 'static_html', "
            f"{sql_str(landing_2026)}, {sql_str(landing_2026)}, 'pending', "
            f"'Official monitoring page for 2026 primary results. No 2026 result file published as of research cutoff 2026-08-18 13:11 MDT.';"
        )

        if hosted_2024 and args.scope == "all":
            out.append(
                "INSERT OR IGNORE INTO election_sources "
                "(source_key, election_id, county, county_fips, source_role, source_type, landing_page_url, endpoint_url, status, notes) "
                "SELECT "
                f"{sql_str(f'wy|{slug}|wy-2024-primary|county_local_summary')}, "
                f"(SELECT id FROM election_events WHERE election_key = 'wy-2024-primary'), "
                f"{sql_str(county)}, {sql_str(fips)}, 'county_local_summary', {sql_str(fmt)}, "
                f"{sql_str(hosted_2024)}, {sql_str(hosted_2024)}, 'active', "
                f"'Verified county-hosted 2024 result source, includes county/local contests the SOS archive omits. "
                f"Not yet ingested, target for the county-hosted-format adapter (not yet built).';"
            )

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")

    n_2026 = len(COUNTIES)
    n_2024_hosted = sum(1 for c in COUNTIES if c[3]) if args.scope == "all" else 0
    print(f"OK: wrote {args.out}")
    print(f"    {n_2026} county landing_page rows plus 1 statewide landing_page row (2026)")
    print(f"    {n_2024_hosted} county_local_summary rows (2024)")
    if args.scope == "all":
        print(f"    {n_2026 - n_2024_hosted} counties have NO verified county-hosted 2024 source (SOS fallback only)")


if __name__ == "__main__":
    main()
