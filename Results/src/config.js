// Results/src/config.js

export const FAST_CRON = "*/2 * * * *";
export const BASELINE_CRON = "17 */6 * * *";

function numberFromEnv(env, key, fallback) {
  const value = Number(env?.[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(env = {}) {
  return {
    environment: env.ENVIRONMENT || "local",
    targetElectionKey: env.TARGET_ELECTION_KEY || "wy-2026-primary",
    userAgent: env.RESULTS_USER_AGENT || "skovgard-results/1.0 (candidates.skovgard2026.org)",
    maxResponseBytes: numberFromEnv(env, "MAX_RESPONSE_BYTES", 10 * 1024 * 1024),
    fetchTimeoutMs: numberFromEnv(env, "FETCH_TIMEOUT_MS", 12_000),
    maxSourcesPerRun: numberFromEnv(env, "MAX_SOURCES_PER_RUN", 24),
    maxDiscoveriesPerSourcePerRun: numberFromEnv(env, "MAX_DISCOVERIES_PER_SOURCE_PER_RUN", 20),
    maxConcurrency: numberFromEnv(env, "MAX_CONCURRENCY", 4),
    fastWindowBeforeMinutes: numberFromEnv(env, "FAST_WINDOW_BEFORE_MINUTES", 60),
    fastWindowAfterMinutes: numberFromEnv(env, "FAST_WINDOW_AFTER_MINUTES", 18 * 60),
    additionalAllowedHosts: new Set(
      String(env.ADDITIONAL_ALLOWED_HOSTS || "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
  };
}
