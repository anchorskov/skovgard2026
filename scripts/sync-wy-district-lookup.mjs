#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIRECTIONAL_MAP = new Map([
  ["NORTH", "N"],
  ["SOUTH", "S"],
  ["EAST", "E"],
  ["WEST", "W"],
  ["NORTHEAST", "NE"],
  ["NORTHWEST", "NW"],
  ["SOUTHEAST", "SE"],
  ["SOUTHWEST", "SW"],
]);

const STREET_TYPE_MAP = new Map([
  ["ALLEY", "ALY"],
  ["ALY", "ALY"],
  ["AV", "AVE"],
  ["AVE", "AVE"],
  ["AVENUE", "AVE"],
  ["BLVD", "BLVD"],
  ["BOULEVARD", "BLVD"],
  ["CIR", "CIR"],
  ["CIRCLE", "CIR"],
  ["COURT", "CT"],
  ["CT", "CT"],
  ["DR", "DR"],
  ["DRIVE", "DR"],
  ["HIGHWAY", "HWY"],
  ["HWY", "HWY"],
  ["LANE", "LN"],
  ["LN", "LN"],
  ["LOOP", "LOOP"],
  ["PARKWAY", "PKWY"],
  ["PKWY", "PKWY"],
  ["PLACE", "PL"],
  ["PL", "PL"],
  ["RD", "RD"],
  ["ROAD", "RD"],
  ["ST", "ST"],
  ["STREET", "ST"],
  ["TER", "TER"],
  ["TERRACE", "TER"],
  ["TRL", "TRL"],
  ["TRAIL", "TRL"],
  ["WAY", "WAY"],
]);

const UNIT_MAP = new Map([
  ["APARTMENT", "APT"],
  ["APT", "APT"],
  ["BLDG", "BLDG"],
  ["BUILDING", "BLDG"],
  ["FL", "FL"],
  ["FLOOR", "FL"],
  ["LOT", "LOT"],
  ["NO", "UNIT"],
  ["NUMBER", "UNIT"],
  ["PMB", "PMB"],
  ["RM", "RM"],
  ["ROOM", "RM"],
  ["STE", "STE"],
  ["SUITE", "STE"],
  ["TRAILER", "TRLR"],
  ["TRLR", "TRLR"],
  ["UNIT", "UNIT"],
]);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_DB_NAME = "ballot_sources";
const DEFAULT_SOURCE_DIR = "/home/anchor/projects/grassrootsmvt/worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeZip5(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 5);
}

function canonicalizeToken(token) {
  const cleaned = String(token || "")
    .trim()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9/]+$/g, "");
  if (!cleaned) return "";
  if (DIRECTIONAL_MAP.has(cleaned)) return DIRECTIONAL_MAP.get(cleaned);
  if (UNIT_MAP.has(cleaned)) return UNIT_MAP.get(cleaned);
  if (STREET_TYPE_MAP.has(cleaned)) return STREET_TYPE_MAP.get(cleaned);
  return cleaned;
}

function canonicalizeCityForLookup(value) {
  return normalizeWhitespace(value).toUpperCase();
}

function canonicalizeAddressForLookup(value) {
  const text = normalizeWhitespace(value)
    .toUpperCase()
    .replace(/#/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/[^A-Z0-9/& -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text
    .split(" ")
    .map(canonicalizeToken)
    .filter(Boolean)
    .join(" ");
}

function buildAddressLookupCandidates(address1, address2) {
  const primary = normalizeWhitespace(address1);
  const secondary = normalizeWhitespace(address2);
  const combined = canonicalizeAddressForLookup([primary, secondary].filter(Boolean).join(" "));
  const base = canonicalizeAddressForLookup(primary);
  return Array.from(new Set([combined, base].filter(Boolean)));
}

function resolveSourceDbPath(explicitPath) {
  if (explicitPath) return explicitPath;
  const entries = fs
    .readdirSync(DEFAULT_SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sqlite"))
    .map((entry) => path.join(DEFAULT_SOURCE_DIR, entry.name))
    .sort();
  if (!entries.length) {
    throw new Error(`No sqlite source DB found in ${DEFAULT_SOURCE_DIR}`);
  }
  return entries[0];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
    stdio: options.captureStdout === false ? ["ignore", "ignore", "pipe"] : undefined,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function sqliteRows(dbPath, sql) {
  const raw = run("sqlite3", [dbPath, "-separator", "\t", sql], { cwd: ROOT });
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildInsertStatements(table, columns, rows, batchSize = 500) {
  const statements = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    if (!batch.length) continue;
    const values = batch
      .map((row) => `(${columns.map((column) => sqlValue(row[column])).join(", ")})`)
      .join(",\n");
    statements.push(`INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES\n${values};`);
  }
  return statements;
}

function wranglerArgs(dbName, remote, extraArgs = []) {
  const args = ["wrangler", "d1", "execute", dbName];
  args.push(remote ? "--remote" : "--local");
  args.push("--config", "worker/wrangler.toml");
  args.push(...extraArgs);
  return args;
}

function queryTarget(dbName, remote, sql) {
  const out = run("npx", wranglerArgs(dbName, remote, ["--json", "--command", sql]));
  return JSON.parse(out);
}

function executeTargetFile(dbName, remote, filePath) {
  run("npx", wranglerArgs(dbName, remote, ["--file", filePath]), { captureStdout: false });
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(token, true);
      continue;
    }
    args.set(token, next);
    i += 1;
  }
  return args;
}

function buildLookupRows(dbPath) {
  const rows = sqliteRows(
    dbPath,
    `WITH normalized AS (
       SELECT
         UPPER(TRIM(va.addr1)) AS canonical_address1,
         UPPER(TRIM(va.city)) AS canonical_city,
         CASE
           WHEN TRIM(COALESCE(va.zip, '')) = '' THEN ''
           ELSE SUBSTR(TRIM(va.zip), 1, 5)
         END AS zip5,
         UPPER(TRIM(COALESCE(cc.county, ''))) AS county,
         COALESCE(NULLIF(TRIM(va.house), ''), '') AS house_district,
         COALESCE(NULLIF(TRIM(va.senate), ''), '') AS senate_district
       FROM voters_addr_norm va
       LEFT JOIN wy_city_county cc ON cc.id = va.city_county_id
       WHERE va.addr1 IS NOT NULL
         AND TRIM(va.addr1) != ''
         AND va.city IS NOT NULL
         AND TRIM(va.city) != ''
     ),
     grouped AS (
       SELECT
         canonical_address1,
         canonical_city,
         zip5,
         county,
         house_district,
         senate_district,
         COUNT(*) AS source_count
       FROM normalized
       GROUP BY 1, 2, 3, 4, 5, 6
     ),
     variants AS (
       SELECT
         canonical_address1,
         canonical_city,
         zip5,
         COUNT(*) AS district_variant_count,
         SUM(source_count) AS total_source_count
       FROM grouped
       GROUP BY 1, 2, 3
     )
     SELECT
       v.canonical_address1,
       v.canonical_city,
       v.zip5,
       MAX(g.county) AS county,
       CASE WHEN v.district_variant_count = 1 THEN MAX(g.house_district) ELSE '' END AS house_district,
       CASE WHEN v.district_variant_count = 1 THEN MAX(g.senate_district) ELSE '' END AS senate_district,
       v.total_source_count,
       v.district_variant_count
     FROM variants v
     JOIN grouped g
       ON g.canonical_address1 = v.canonical_address1
      AND g.canonical_city = v.canonical_city
      AND g.zip5 = v.zip5
     GROUP BY
       v.canonical_address1,
       v.canonical_city,
       v.zip5,
       v.total_source_count,
       v.district_variant_count
     ORDER BY v.canonical_city, v.canonical_address1, v.zip5;`
  );

  return rows
    .map(([canonicalAddress1, canonicalCity, zip5, county, houseDistrict, senateDistrict, sourceCount, variantCount]) => ({
      address_key: canonicalizeAddressForLookup(canonicalAddress1),
      city_key: canonicalizeCityForLookup(canonicalCity),
      zip5: normalizeZip5(zip5),
      canonical_address1: canonicalAddress1,
      canonical_city: canonicalCity,
      county: county || null,
      state_house_district: houseDistrict || null,
      state_senate_district: senateDistrict || null,
      source_count: Number(sourceCount || 0),
      district_variant_count: Number(variantCount || 0),
      updated_at: new Date().toISOString(),
    }))
    .filter((row) => row.address_key && row.city_key);
}

function collapseLookupRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.address_key}|${row.city_key}|${row.zip5}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  let canonicalCollisionRows = 0;
  let canonicalConflictRows = 0;
  const collapsed = [];

  for (const groupRows of grouped.values()) {
    const sortedRows = [...groupRows].sort((left, right) =>
      String(left.canonical_address1 || "").localeCompare(String(right.canonical_address1 || ""))
    );
    const districtVariants = new Map();
    const counties = new Map();

    for (const row of sortedRows) {
      if (row.county) counties.set(row.county, row.county);
      const districtKey = `${row.state_house_district || ""}|${row.state_senate_district || ""}`;
      districtVariants.set(districtKey, row);
    }

    if (sortedRows.length > 1) canonicalCollisionRows += 1;

    const nonBlankDistrictVariants = Array.from(districtVariants.entries())
      .filter(([key]) => key !== "|")
      .map(([, row]) => row);

    if (nonBlankDistrictVariants.length > 1) canonicalConflictRows += 1;

    const chosen =
      nonBlankDistrictVariants.length === 1
        ? nonBlankDistrictVariants[0]
        : sortedRows[0];

    collapsed.push({
      ...chosen,
      county: counties.size === 1 ? Array.from(counties.values())[0] : chosen.county || null,
      state_house_district:
        nonBlankDistrictVariants.length === 1 ? chosen.state_house_district : null,
      state_senate_district:
        nonBlankDistrictVariants.length === 1 ? chosen.state_senate_district : null,
      source_count: sortedRows.reduce((sum, row) => sum + Number(row.source_count || 0), 0),
      district_variant_count: Math.max(
        ...sortedRows.map((row) => Number(row.district_variant_count || 0)),
        nonBlankDistrictVariants.length || 0,
        1
      ),
    });
  }

  return {
    rows: collapsed,
    canonicalCollisionRows,
    canonicalConflictRows,
  };
}

function buildCoverageRows(dbPath) {
  return sqliteRows(
    dbPath,
    `SELECT district_type,
            district_code,
            UPPER(TRIM(county)) AS county,
            UPPER(TRIM(city)) AS city
       FROM district_coverage
      ORDER BY district_type, CAST(district_code AS INTEGER), county, city;`
  ).map(([districtType, districtCode, county, city]) => ({
    district_type: districtType,
    district_code: districtCode,
    county,
    city,
  }));
}

function resolveLookupForConsent(lookupMap, row) {
  const cityKey = canonicalizeCityForLookup(row.city);
  const zip5 = normalizeZip5(row.zip);
  const candidates = buildAddressLookupCandidates(row.address1, row.address2);

  for (const addressKey of candidates) {
    if (zip5) {
      const exactZip = lookupMap.get(`${addressKey}|${cityKey}|${zip5}`);
      if (exactZip && (exactZip.state_house_district || exactZip.state_senate_district || exactZip.county)) {
        return exactZip;
      }
    }
    const sameAddressRows = [];
    for (const [key, value] of lookupMap) {
      if (!key.startsWith(`${addressKey}|${cityKey}|`)) continue;
      if (!value.state_house_district && !value.state_senate_district && !value.county) continue;
      sameAddressRows.push(value);
    }
    const unique = new Map(
      sameAddressRows.map((value) => [
        `${value.state_house_district || ""}|${value.state_senate_district || ""}|${value.county || ""}`,
        value,
      ])
    );
    if (unique.size === 1) return Array.from(unique.values())[0];
  }

  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const remote = args.has("--remote");
  const dbName = String(args.get("--db") || DEFAULT_DB_NAME);
  const sourceDbPath = resolveSourceDbPath(args.get("--source-db"));

  const rawLookupRows = buildLookupRows(sourceDbPath);
  const {
    rows: lookupRows,
    canonicalCollisionRows,
    canonicalConflictRows,
  } = collapseLookupRows(rawLookupRows);
  const coverageRows = buildCoverageRows(sourceDbPath);
  const ambiguousLookupRows = lookupRows.filter((row) => Number(row.district_variant_count || 0) > 1).length;
  const lookupMap = new Map(
    lookupRows.map((row) => [`${row.address_key}|${row.city_key}|${row.zip5}`, row])
  );

  const seedStatements = [
    "DELETE FROM wy_district_coverage;",
    "DELETE FROM wy_address_district_lookup;",
    ...buildInsertStatements(
      "wy_district_coverage",
      ["district_type", "district_code", "county", "city"],
      coverageRows
    ),
    ...buildInsertStatements(
      "wy_address_district_lookup",
      [
        "address_key",
        "city_key",
        "zip5",
        "canonical_address1",
        "canonical_city",
        "county",
        "state_house_district",
        "state_senate_district",
        "source_count",
        "district_variant_count",
        "updated_at",
      ],
      lookupRows
    ),
  ];

  const seedFile = path.join(os.tmpdir(), `skovgard-district-sync-${Date.now()}-seed.sql`);
  fs.writeFileSync(seedFile, `${seedStatements.join("\n")}\n`, "utf8");
  executeTargetFile(dbName, remote, seedFile);

  const consentResponse = queryTarget(
    dbName,
    remote,
    `SELECT phone_e164, address1, address2, city, zip, state, county,
            state_house_district, state_senate_district
       FROM consent_status
      ORDER BY phone_e164;`
  );
  const consentRows = consentResponse?.[0]?.results || [];
  const updates = [];
  let matchedRows = 0;
  let updatedRows = 0;

  for (const row of consentRows) {
    const resolved = resolveLookupForConsent(lookupMap, row);
    if (!resolved) continue;
    matchedRows += 1;
    const nextCounty = row.county || resolved.county || null;
    const nextHouse = resolved.state_house_district || row.state_house_district || null;
    const nextSenate = resolved.state_senate_district || row.state_senate_district || null;
    const changed =
      String(row.county || "") !== String(nextCounty || "") ||
      String(row.state_house_district || "") !== String(nextHouse || "") ||
      String(row.state_senate_district || "") !== String(nextSenate || "");
    if (!changed) continue;
    updatedRows += 1;
    updates.push(
      `UPDATE consent_status
          SET county = ${sqlValue(nextCounty)},
              state_house_district = ${sqlValue(nextHouse)},
              state_senate_district = ${sqlValue(nextSenate)},
              updated_at = datetime('now')
        WHERE phone_e164 = ${sqlValue(row.phone_e164)};`
    );
  }

  if (updates.length) {
    const updateFile = path.join(os.tmpdir(), `skovgard-district-sync-${Date.now()}-backfill.sql`);
    fs.writeFileSync(updateFile, `${updates.join("\n")}\n`, "utf8");
    executeTargetFile(dbName, remote, updateFile);
  }

  const verification = queryTarget(
    dbName,
    remote,
    `SELECT COUNT(*) AS consent_rows,
            SUM(CASE WHEN COALESCE(address1, '') != '' AND COALESCE(city, '') != '' AND COALESCE(zip, '') != '' THEN 1 ELSE 0 END) AS consent_with_full_address,
            SUM(CASE WHEN COALESCE(state_house_district, '') != '' THEN 1 ELSE 0 END) AS consent_with_house_district,
            SUM(CASE WHEN COALESCE(state_senate_district, '') != '' THEN 1 ELSE 0 END) AS consent_with_senate_district,
            SUM(CASE WHEN COALESCE(county, '') != '' THEN 1 ELSE 0 END) AS consent_with_county
       FROM consent_status;
     SELECT COUNT(*) AS lookup_rows,
            SUM(CASE WHEN COALESCE(state_house_district, '') != '' OR COALESCE(state_senate_district, '') != '' THEN 1 ELSE 0 END) AS exact_lookup_rows,
            SUM(CASE WHEN district_variant_count > 1 THEN 1 ELSE 0 END) AS ambiguous_lookup_rows
       FROM wy_address_district_lookup;
     SELECT COUNT(*) AS coverage_rows
       FROM wy_district_coverage;`
  );

  const consentSummary = verification?.[0]?.results?.[0] || {};
  const lookupSummary = verification?.[1]?.results?.[0] || {};
  const coverageSummary = verification?.[2]?.results?.[0] || {};

  console.log(
    JSON.stringify(
      {
        ok: true,
        target: remote ? "remote" : "local",
        source_db: sourceDbPath,
        source_summary: {
          raw_lookup_rows: rawLookupRows.length,
          canonical_lookup_rows: lookupRows.length,
          ambiguous_lookup_rows: ambiguousLookupRows,
          canonical_collision_rows: canonicalCollisionRows,
          canonical_conflict_rows: canonicalConflictRows,
          coverage_rows: coverageRows.length,
        },
        consent_backfill: {
          consent_rows: consentRows.length,
          matched_rows: matchedRows,
          updated_rows: updatedRows,
        },
        target_summary: {
          consent_rows: Number(consentSummary.consent_rows || 0),
          consent_with_full_address: Number(consentSummary.consent_with_full_address || 0),
          consent_with_county: Number(consentSummary.consent_with_county || 0),
          consent_with_house_district: Number(consentSummary.consent_with_house_district || 0),
          consent_with_senate_district: Number(consentSummary.consent_with_senate_district || 0),
          lookup_rows: Number(lookupSummary.lookup_rows || 0),
          exact_lookup_rows: Number(lookupSummary.exact_lookup_rows || 0),
          ambiguous_lookup_rows: Number(lookupSummary.ambiguous_lookup_rows || 0),
          coverage_rows: Number(coverageSummary.coverage_rows || 0),
        },
      },
      null,
      2
    )
  );
}

main();
