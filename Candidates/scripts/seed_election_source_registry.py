# Candidates/scripts/seed_election_source_registry.py
#
# Registers the 23-county source registry into election_sources, separate
# from and additive to the SOS xlsx_wide_header pipeline
# (extract_election_results_xlsx.py / generate_election_results_sql.py).
# This script only writes REGISTRY rows (which endpoints exist, where, in
# what format), it does not ingest any result data. Direct 2026 result
# artifacts that passed source review are recorded in notes so operators can
# audit each county without adding more URLs to the cron fetch set.
#
# Two source rows per county where verified:
#   - wy-2026-primary, source_role='landing_page' or 'landing_page_v2': the
#     official page to poll. A v2 row supersedes a stale original row while
#     preserving the original under the WORM protocol.
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
# Source: Candidates/docs/wyoming_2026_election_results_sources.md.
# Monitoring URLs and current-result links were reverified during the
# 2026-08-18 election-night audit. Existing registry rows are append-only, so
# changed monitoring URLs use a versioned source role and supersede the old row.

import argparse

# (county, county_fips, 2026_monitoring_url, 2024_county_hosted_url_or_None, format_or_None)
COUNTIES = [
    ("Albany", "56001", "https://www.albanycountywy.gov/176/Results-of-Election",
     "https://www.albanycountywy.gov/DocumentCenter/View/6819/OFFICIAL-RESULTS---2024-Primary-Election-", "pdf_text"),
    ("Big Horn", "56003", "https://www.bighorncountywy.gov/departments/clerk/elections",
     "https://www.bighorncountywy.gov/component/edocman/county-clerk/2024-election/election-night-unofficial-results", "vendor_page"),
    ("Campbell", "56005", "https://www.campbellcountywy.gov/867/Elections",
     "https://www.campbellcountywy.gov/DocumentCenter/View/23726/2024-Primary-Election", "pdf_text"),
    ("Carbon", "56007", "https://carboncountywy.gov/997/Election-Results",
     "https://carboncountywy.gov/997/Election-Results", "static_html"),
    ("Converse", "56009", "https://conversecountywy.gov/556/2026-Election-Results",
     "https://conversecountywy.gov/538/2024-Election-Results", "static_html"),
    ("Crook", "56011", "https://www.crookcounty.wy.gov/elected_officials/clerk/election/2026ElectionResults.php", None, None),
    ("Fremont", "56013", "https://fremontcountywy.gov/government/elections___voting.php",
     "https://fremontcountywy.gov/government/elections___voting.php", "static_html"),
    ("Goshen", "56015", "https://www.goshencountywy.gov/Archive.aspx?AMID=37",
     "https://www.goshencountywy.gov/Archive.aspx?AMID=37", "static_html"),
    ("Hot Springs", "56017", "https://hscounty.com/elections",
     "https://hscounty.com/component/edocman/election-results-archives/election-2024?Itemid=100", "vendor_page"),
    ("Johnson", "56019", "https://www.johnsoncowy.gov/departments/elections", None, None),
    ("Laramie", "56021", "https://www.laramiecountywy.gov/County-Government/Elected-Officials/County-Clerk/Elections/Election-Results",
     "https://www.laramiecountywy.gov/County-Government/Elected-Officials/County-Clerk/Elections/Election-Results", "static_html"),
    ("Lincoln", "56023", "https://www.lincolncountywy.gov/government/clerk/elections_voting_information/2026_primary_election_results.php",
     "https://www.lincolncountywy.gov/government/clerk/elections_voting_information/election_results.php", "static_html"),
    ("Natrona", "56025", "https://www.natronacounty-wy.gov/659/Results-Archive",
     "https://www.natronacounty-wy.gov/659/Results-Archive", "static_html"),
    ("Niobrara", "56027", "https://www.niobraracounty.org/_departments/_county_clerk/ElectionResults.asp",
     "https://www.niobraracounty.org/_departments/_county_clerk/Pastelectionresults.asp", "static_html"),
    ("Park", "56029", "https://parkcounty-wy.gov/county-elections/results/",
     "https://parkcounty-wy.gov/county-elections/results/", "static_html"),
    ("Platte", "56031", "https://www.plattecountywyoming.com/departments/Elections/ResultsofElection", None, None),
    ("Sheridan", "56033", "https://www.sheridancountywy.gov/departments/elections/2026_election_results.php",
     "https://www.sheridancountywy.gov/news_detail_T10_R91.php", "static_html"),
    ("Sublette", "56035", "https://www.sublettecountywy.gov/110/Election-Information",
     "https://www.sublettecountywy.gov/110/Election-Information", "static_html"),
    ("Sweetwater", "56037", "https://www.sweetwatercountywy.gov/departments/county_clerk/election_returns/index.php", None, None),
    ("Teton", "56039", "https://www.tetoncountywy.gov/271/Election-Results",
     "https://www.tetoncountywy.gov/271/Election-Results", "static_html"),
    ("Uinta", "56041", "https://uintacountywy.gov/26/Elections", None, None),
    ("Washakie", "56043", "https://www.washakiecountywy.gov/196/Elections",
     "https://www.washakiecountywy.gov/196/Elections", "static_html"),
    ("Weston", "56045", "https://www.westongov.com/county-clerk/elections/election-results/",
     "https://www.westongov.com/county-clerk/elections/election-results/", "static_html"),
]

# Counties whose original registry URL was stale or too broad. All 23 audited
# rows use a v2 source role because WORM also prohibits updating the audit notes
# on the original rows. Eleven of those v2 rows also correct the endpoint URL.
MONITORING_URL_CORRECTIONS = {
    "Albany",
    "Campbell",
    "Converse",
    "Crook",
    "Hot Springs",
    "Lincoln",
    "Niobrara",
    "Platte",
    "Sheridan",
    "Sweetwater",
    "Uinta",
}

# Direct 2026 result artifacts verified as links on the corresponding county
# clerk page. These remain audit metadata here. The Worker polls one official
# monitoring page per county to avoid unnecessary scheduled fetches.
CURRENT_2026_RESULTS = {
    "Albany": ("https://www.albanycountywy.gov/DocumentCenter/View/8357/2026-UNOFFICIAL-Primary-Election-Summary",),
    "Big Horn": (
        "https://www.bighorncountywy.gov/images/Unofficial_BHC_Primary_Election_Summary_Report_2026.pdf",
        "https://www.bighorncountywy.gov/images/Unofficial_BHC_Primary_Precinct_Summary_Report_2026.pdf",
    ),
    "Converse": ("https://conversecountywy.gov/DocumentCenter/View/6486/2026-UNOFFICIAL-RESULTS-ELECTION-SUMMARY-REPORT",),
    "Crook": ("https://www.crookcounty.wy.gov/elected_officials/clerk/Election/2026/Unofficial%202026%20Primary%20Election%20Results%20.pdf",),
    "Fremont": ("https://fremontcountywy.gov/government/Government/Clerk/Elections/2026%20Election%20Results/Primary/Unofficial%20Summary%20by%20Precinct.pdf",),
    "Hot Springs": (
        "https://hscounty.com/component/edocman/2026-hot-springs-co-primary-election-unofficial-results-2/viewdocument/1369?Itemid=",
        "https://hscounty.com/component/edocman/2026-hot-springs-co-primary-election-precinct-unofficial-results-2/viewdocument/1368?Itemid=",
    ),
    "Johnson": ("https://drive.google.com/file/d/14VhWna_5e7VOT6lNFHHVnKW5_1DNmPEW/view?usp=drive_link",),
    "Lincoln": ("https://www.lincolncountywy.gov/government/clerk/elections_voting_information/Documents/Government/Clerk/Election%20And%20Voting%20Information/Election%20Results%20And%20Upcoming%20Elections/2026/summary%20report%20unofficial.pdf",),
    "Niobrara": (
        "https://www.niobraracounty.org/_departments/_county_clerk/_pdfs/2026/2026%20Primary%20County%20Summary%20Report.pdf",
        "https://www.niobraracounty.org/_departments/_county_clerk/_pdfs/2026/2026%20Primary%20County%20Precinct%20Summary.pdf",
    ),
    "Sheridan": ("https://www.sheridancountywy.gov/Document%20Center/Departments/Elected%20Office/2026%20Election%20Documents/Primary/Election%20Summary.pdf",),
    "Sublette": ("https://www.sublettecountywy.gov/DocumentCenter/View/8005/2026-Unofficial-Primary-Election-Results",),
    "Sweetwater": (
        "https://www.sweetwatercountywy.gov/departments/county_clerk/election_returns/Unofficial%20Sweetwater%20Election%20Summary%20Report.pdf",
        "https://www.sweetwatercountywy.gov/departments/county_clerk/election_returns/Unofficial%20Sweetwater%20County%20Precinct%20Summary.pdf",
    ),
    "Teton": (
        "https://www.tetoncountywy.gov/DocumentCenter/View/41801/2026-Unofficial-Primary-Election---Summary-Results",
        "https://www.tetoncountywy.gov/DocumentCenter/View/41800/2026--Unofficial-Primary-Election---Precinct-Results--",
    ),
    "Uinta": (
        "https://uintacountywy.gov/DocumentCenter/View/8645/2026-Primary-Results-UNOFFICIAL",
        "https://uintacountywy.gov/DocumentCenter/View/8644/2026-Primary-Results-by-Precinct-UNOFFICIAL",
    ),
    "Washakie": (
        "https://www.washakiecountywy.gov/DocumentCenter/View/604/2026-PRIMARY-UNOFFICIAL-RESULTS",
        "https://www.washakiecountywy.gov/DocumentCenter/View/603/2026-PRIMARY-UNOFFICIAL-PRECINCT-SUMMARY-RESULTS",
    ),
    "Weston": ("https://www.westongov.com/wp-content/uploads/2026/08/2026-PRIMARY-UNOFFICIAL-RESULTS.pdf",),
}

# Counties for which the official clerk monitoring source did not expose a
# retrievable public 2026 result artifact during the same audit. Keeping this
# list explicit makes the 16 verified plus 7 unresolved partition testable.
CURRENT_2026_GAPS = {
    "Campbell": "No public 2026 result artifact was located on the official clerk page.",
    "Carbon": "No public 2026 result artifact was located on the official clerk page.",
    "Goshen": "No public 2026 result artifact was located in the official clerk archive.",
    "Laramie": "The official clerk result page returned HTTP 403 to the Worker, so no direct artifact was verified.",
    "Natrona": "No public 2026 result artifact was located in the official clerk archive.",
    "Park": "No public 2026 result artifact was located on the official clerk result page.",
    "Platte": "No public 2026 result artifact was located on the official clerk result page.",
}

SOS_2026_RESULTS_ARCHIVE = "https://sos.wyo.gov/elections/electionresults.aspx"
AUDIT_VERIFIED_AT = "2026-08-18 23:13 MDT"


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def slugify(county):
    return county.lower().replace(" ", "_")


def validate_registry():
    counties = [row[0] for row in COUNTIES]
    fips_codes = [row[1] for row in COUNTIES]
    county_set = set(counties)
    if len(COUNTIES) != 23 or len(county_set) != 23:
        raise ValueError("The registry must contain exactly 23 unique Wyoming counties.")
    if len(set(fips_codes)) != 23:
        raise ValueError("Every county must have a unique FIPS code.")
    if not MONITORING_URL_CORRECTIONS.issubset(county_set):
        raise ValueError("A monitoring URL correction names a county outside the registry.")
    if not set(CURRENT_2026_RESULTS).issubset(county_set):
        raise ValueError("A current-result artifact names a county outside the registry.")
    if not set(CURRENT_2026_GAPS).issubset(county_set):
        raise ValueError("A current-result gap names a county outside the registry.")
    if set(CURRENT_2026_RESULTS) & set(CURRENT_2026_GAPS):
        raise ValueError("A county cannot have both a verified result and an unresolved gap.")
    if set(CURRENT_2026_RESULTS) | set(CURRENT_2026_GAPS) != county_set:
        raise ValueError("Every county must have either verified result artifacts or an explicit gap.")
    for county, _fips, monitoring_url, _hosted_2024, _format in COUNTIES:
        if not monitoring_url.startswith("https://"):
            raise ValueError(f"{county} monitoring URL must use HTTPS.")
    for county, result_urls in CURRENT_2026_RESULTS.items():
        if not result_urls or any(not url.startswith("https://") for url in result_urls):
            raise ValueError(f"{county} must have one or more HTTPS result URLs.")


def main():
    validate_registry()
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
        source_role = "landing_page_v2"
        source_key = f"wy|{slug}|wy-2026-primary|{source_role}"
        old_source_key = f"wy|{slug}|wy-2026-primary|landing_page"
        supersedes_sql = (
            "(SELECT id FROM election_sources WHERE source_key = "
            f"{sql_str(old_source_key)})"
        )
        result_urls = CURRENT_2026_RESULTS.get(county, ())
        if result_urls:
            result_note = " Verified direct 2026 result artifact(s): " + " ; ".join(result_urls) + "."
        else:
            result_note = " " + CURRENT_2026_GAPS[county]

        out.append(
            "INSERT OR IGNORE INTO election_sources "
            "(source_key, election_id, county, county_fips, source_role, source_type, landing_page_url, endpoint_url, status, notes, supersedes_source_id) "
            "SELECT "
            f"{sql_str(source_key)}, "
            f"(SELECT id FROM election_events WHERE election_key = 'wy-2026-primary'), "
            f"{sql_str(county)}, {sql_str(fips)}, {sql_str(source_role)}, 'static_html', "
            f"{sql_str(landing_2026)}, {sql_str(landing_2026)}, 'pending', "
            f"{sql_str('Official county clerk monitoring page for 2026 primary results, reverified ' + AUDIT_VERIFIED_AT + '.' + result_note)}, "
            f"{supersedes_sql};"
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
    n_successors = len(COUNTIES)
    n_url_corrections = len(MONITORING_URL_CORRECTIONS)
    n_with_results = len(CURRENT_2026_RESULTS)
    n_2024_hosted = sum(1 for c in COUNTIES if c[3]) if args.scope == "all" else 0
    print(f"OK: wrote {args.out}")
    print(f"    {n_2026} county landing_page rows plus 1 statewide landing_page row (2026)")
    print(f"    {n_successors} county rows are WORM-safe v2 audit successors")
    print(f"    {n_url_corrections} v2 rows also correct a stale monitoring URL")
    print(f"    {n_with_results} counties have verified direct 2026 result artifacts in audit notes")
    print(f"    {n_2024_hosted} county_local_summary rows (2024)")
    if args.scope == "all":
        print(f"    {n_2026 - n_2024_hosted} counties have NO verified county-hosted 2024 source (SOS fallback only)")


if __name__ == "__main__":
    main()
