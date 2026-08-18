// Results/src/scheduler.js

import { loadConfig } from "./config.js";
import { inspectSource } from "./poller.js";
import { insertDiscoveries, insertSourceCheck, loadPollingSources } from "./repository.js";
import { collectionPhase, sourceIsDue } from "./source-policy.js";

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

export async function runScheduledPoll({ env, cron, scheduledTime = Date.now(), fetchImpl = fetch }) {
  const config = loadConfig(env);
  const now = new Date(scheduledTime);
  const allSources = await loadPollingSources(env.WY_DB, config.targetElectionKey);
  const eligible = allSources
    .filter((source) => sourceIsDue({
      now,
      lastCheckedAt: source.last_checked_at,
      phase: collectionPhase(now, source.polls_close_at, config),
      cron,
    }))
    .slice(0, config.maxSourcesPerRun);

  const results = await mapWithConcurrency(eligible, config.maxConcurrency, async (source) => {
    const inspected = await inspectSource({
      source,
      previousCheck: {
        etag: source.etag,
        last_modified: source.last_modified,
        sha256: source.sha256,
      },
      electionYear: String(source.election_date || "").slice(0, 4),
      config,
      fetchImpl,
      now,
    });
    const checkId = await insertSourceCheck(env.WY_DB, source.id, inspected.check);
    const discoveriesInserted = await insertDiscoveries(env.WY_DB, source.id, checkId, inspected.discoveries);
    return {
      sourceId: source.id,
      county: source.county,
      status: inspected.check.httpStatus,
      changed: inspected.changed,
      discoveries: discoveriesInserted,
      error: inspected.check.errorMessage,
    };
  });

  return {
    electionKey: config.targetElectionKey,
    cron,
    checkedAt: now.toISOString(),
    availableSources: allSources.length,
    eligibleSources: eligible.length,
    successfulChecks: results.filter((result) => result.status && result.status >= 200 && result.status < 400).length,
    changedSources: results.filter((result) => result.changed).length,
    discoveriesInserted: results.reduce((sum, result) => sum + result.discoveries, 0),
    errors: results.filter((result) => result.error).length,
    results,
  };
}
