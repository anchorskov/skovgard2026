// Results/src/repository.js

export async function loadPollingSources(db, electionKey) {
  const { results } = await db.prepare(`
    SELECT
      s.id,
      s.source_key,
      s.county,
      s.source_role,
      s.source_type,
      s.endpoint_url,
      s.status,
      e.election_key,
      e.election_date,
      e.polls_close_at,
      (
        SELECT c.checked_at FROM election_source_checks c
        WHERE c.source_id = s.id ORDER BY c.id DESC LIMIT 1
      ) AS last_checked_at,
      (
        SELECT c.etag FROM election_source_checks c
        WHERE c.source_id = s.id ORDER BY c.id DESC LIMIT 1
      ) AS etag,
      (
        SELECT c.last_modified FROM election_source_checks c
        WHERE c.source_id = s.id ORDER BY c.id DESC LIMIT 1
      ) AS last_modified,
      (
        SELECT c.sha256 FROM election_source_checks c
        WHERE c.source_id = s.id AND c.sha256 IS NOT NULL ORDER BY c.id DESC LIMIT 1
      ) AS sha256
    FROM election_sources s
    JOIN election_events e ON e.id = s.election_id
    WHERE e.election_key = ?1
      AND s.status IN ('pending', 'active')
      AND s.endpoint_url IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM election_sources successor
        WHERE successor.supersedes_source_id = s.id
      )
    ORDER BY CASE s.source_role WHEN 'landing_page' THEN 0 ELSE 1 END, s.county, s.id
  `).bind(electionKey).all();
  return results;
}

export async function insertSourceCheck(db, sourceId, check) {
  const result = await db.prepare(`
    INSERT INTO election_source_checks (
      source_id, checked_at, http_status, redirect_to, content_type,
      content_length, etag, last_modified, sha256,
      test_data_screen_result, error_message
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
  `).bind(
    sourceId,
    check.checkedAt,
    check.httpStatus,
    check.redirectTo,
    check.contentType,
    check.contentLength,
    check.etag,
    check.lastModified,
    check.sha256,
    check.screenResult,
    check.errorMessage,
  ).run();
  return Number(result.meta?.last_row_id);
}

export async function insertDiscoveries(db, sourceId, checkId, discoveries) {
  if (!checkId || discoveries.length === 0) return 0;
  const statements = discoveries.map((discovery) => db.prepare(`
    INSERT OR IGNORE INTO election_source_discoveries (
      check_id, source_id, discovered_url, link_text, classification,
      discovery_reason
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(
    checkId,
    sourceId,
    discovery.url,
    discovery.linkText,
    discovery.classification,
    discovery.reason,
  ));
  const results = await db.batch(statements);
  return results.reduce((total, result) => total + Number(result.meta?.changes || 0), 0);
}

export async function statusSummary(db, electionKey) {
  const event = await db.prepare(`
    SELECT id, election_key, election_name, election_phase, election_date, polls_close_at
    FROM election_events WHERE election_key = ?1
  `).bind(electionKey).first();
  if (!event) return null;

  const sourceCounts = await db.prepare(`
    SELECT
      COUNT(*) AS sources,
      SUM(CASE WHEN last_check.http_status BETWEEN 200 AND 399 THEN 1 ELSE 0 END) AS reachable,
      SUM(CASE WHEN last_check.error_message IS NOT NULL THEN 1 ELSE 0 END) AS errors,
      MAX(last_check.checked_at) AS latest_checked_at
    FROM election_sources s
    LEFT JOIN election_source_checks last_check ON last_check.id = (
      SELECT c.id FROM election_source_checks c
      WHERE c.source_id = s.id ORDER BY c.id DESC LIMIT 1
    )
    WHERE s.election_id = ?1
      AND s.status IN ('pending', 'active')
      AND NOT EXISTS (
        SELECT 1 FROM election_sources successor
        WHERE successor.supersedes_source_id = s.id
      )
  `).bind(event.id).first();

  const discoveries = await db.prepare(`
    SELECT classification, COUNT(*) AS count
    FROM election_source_discoveries d
    JOIN election_sources s ON s.id = d.source_id
    WHERE s.election_id = ?1
    GROUP BY classification
  `).bind(event.id).all();

  return { event, sourceCounts, discoveries: discoveries.results };
}
