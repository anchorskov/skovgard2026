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

// Never-checked sources first, then oldest last_checked_at, then a
// deterministic id tie-break. Applied before the per-run cap so a source
// added after the current 24 (a direct result PDF, a vendor page) gets
// picked up ahead of sources that have already been checked recently,
// instead of permanently sitting past the slice point behind a fixed
// role/county ordering.
function byStaleness(a, b) {
  const aNever = !a.last_checked_at;
  const bNever = !b.last_checked_at;
  if (aNever !== bNever) return aNever ? -1 : 1;
  if (!aNever) {
    const aTime = new Date(a.last_checked_at).getTime();
    const bTime = new Date(b.last_checked_at).getTime();
    if (aTime !== bTime) return aTime - bTime;
  }
  return a.id - b.id;
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
    .sort(byStaleness)
    .slice(0, config.maxSourcesPerRun);

  const results = await mapWithConcurrency(eligible, config.maxConcurrency, async (source) => {
    const base = { sourceId: source.id, county: source.county };
    let inspected = null;
    let checkId = null;
    try {
      inspected = await inspectSource({
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
      checkId = await insertSourceCheck(env.WY_DB, source.id, inspected.check);
      const { inserted, deferred } = await insertDiscoveries(
        env.WY_DB,
        source.id,
        checkId,
        inspected.discoveries,
        config.maxDiscoveriesPerSourcePerRun,
      );
      return {
        ...base,
        status: inspected.check.httpStatus,
        changed: inspected.changed,
        discoveries: inserted,
        discoveriesDeferred: deferred,
        error: inspected.check.errorMessage,
        persistenceError: null,
      };
    } catch (error) {
      // inspectSource catches its own fetch-level failures internally and
      // never throws; reaching this catch means a database write failed
      // after a check was already attempted (or something unexpected broke
      // before one could be). checkId === null here means no check row was
      // ever persisted for this source on this run, so this result must
      // never be counted as a success, even if the fetch itself returned
      // 200 (recorded in `status` for diagnostic visibility only).
      return {
        ...base,
        status: inspected?.check.httpStatus ?? null,
        changed: false,
        discoveries: 0,
        discoveriesDeferred: 0,
        error: inspected?.check.errorMessage ?? null,
        persistenceError: error instanceof Error ? error.message : String(error),
        checkPersisted: checkId !== null,
      };
    }
  });

  return {
    electionKey: config.targetElectionKey,
    cron,
    checkedAt: now.toISOString(),
    availableSources: allSources.length,
    eligibleSources: eligible.length,
    successfulChecks: results.filter((result) => (
      result.status && result.status >= 200 && result.status < 400 && !result.persistenceError
    )).length,
    changedSources: results.filter((result) => result.changed).length,
    discoveriesInserted: results.reduce((sum, result) => sum + result.discoveries, 0),
    discoveriesDeferred: results.reduce((sum, result) => sum + result.discoveriesDeferred, 0),
    errors: results.filter((result) => result.error).length,
    persistenceErrors: results.filter((result) => result.persistenceError).length,
    results,
  };
}
