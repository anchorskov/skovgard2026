// Results/src/source-policy.js

import { FAST_CRON } from "./config.js";

const RESULT_TERMS = [
  "result",
  "results",
  "unofficial",
  "official",
  "summary",
  "precinct",
  "detail",
  "download",
  "statement of votes",
  "canvass",
];

const TEST_TERMS = [
  "public test",
  "public testing",
  "test deck",
  "expected test",
  "equipment test",
  "logic and accuracy",
  "testing summary",
  "sample ballot",
];

const TEST_URL_TERMS = [
  "public-test",
  "public_test",
  "test-deck",
  "test_deck",
  "expected-test",
  "expected_test",
  "logic-and-accuracy",
  "logic_accuracy",
];

const SAMPLE_URL_TERMS = ["sample-ballot", "sample_ballot"];

export function normalizedHaystack(...values) {
  return values.filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}

// Query strings routinely carry cache-busting timestamps (e.g. "?t=202608181024430")
// whose digits can accidentally contain the target election year even though the
// path itself points at a different year's archive. Year matching must only look
// at the URL's origin+path and the link text, never the query string.
function yearMatchTarget(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

export function screenTestMaterial({ url = "", text = "", linkText = "" } = {}) {
  const haystack = normalizedHaystack(url, linkText, text.slice(0, 250_000));
  if (haystack.includes("sample ballot") || SAMPLE_URL_TERMS.some((term) => haystack.includes(term))) {
    return "rejected_sample_ballot";
  }
  if (TEST_TERMS.some((term) => haystack.includes(term)) || TEST_URL_TERMS.some((term) => haystack.includes(term))) {
    return "rejected_test_data";
  }
  return "clean";
}

export function classifyDiscoveredLink({ url, linkText, electionYear }) {
  const haystack = normalizedHaystack(url, linkText);
  const screen = screenTestMaterial({ url, linkText });
  if (screen !== "clean") {
    return { classification: screen, reason: "Link matched an excluded test or sample-material term." };
  }

  const yearHaystack = normalizedHaystack(yearMatchTarget(url), linkText);
  const hasYear = !electionYear || yearHaystack.includes(String(electionYear));
  const hasResultTerm = RESULT_TERMS.some((term) => haystack.includes(term));
  if (hasYear && hasResultTerm) {
    return { classification: "candidate_result", reason: "Link matched the election year and a result-discovery term." };
  }
  if (hasResultTerm) {
    return { classification: "result_other_year_or_unknown", reason: "Link matched a result term without the target election year." };
  }
  return { classification: "irrelevant", reason: "Link did not match result-discovery terms." };
}

export function extractLinks(html, baseUrl, electionYear) {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";
    const linkText = match[4].replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    let resolved;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(resolved.protocol) || seen.has(resolved.href)) continue;
    seen.add(resolved.href);
    const classified = classifyDiscoveredLink({ url: resolved.href, linkText, electionYear });
    if (classified.classification === "irrelevant") continue;
    links.push({
      url: resolved.href,
      linkText: linkText || null,
      ...classified,
    });
    if (links.length >= 100) break;
  }
  return links;
}

export function allowedRedirectHost(originalUrl, nextUrl, additionalAllowedHosts = new Set()) {
  const original = new URL(originalUrl);
  const next = new URL(nextUrl, original);
  return next.hostname.toLowerCase() === original.hostname.toLowerCase()
    || additionalAllowedHosts.has(next.hostname.toLowerCase());
}

export function minutesBetween(later, earlier) {
  return (later.getTime() - earlier.getTime()) / 60_000;
}

export function collectionPhase(now, pollsCloseAt, config) {
  const close = new Date(pollsCloseAt);
  if (Number.isNaN(close.getTime())) return "baseline";
  const minutesFromClose = minutesBetween(now, close);
  if (minutesFromClose >= -config.fastWindowBeforeMinutes && minutesFromClose <= config.fastWindowAfterMinutes) {
    return "fast";
  }
  return "baseline";
}

export function sourceIsDue({ now, lastCheckedAt, phase, cron }) {
  if (cron === FAST_CRON && phase !== "fast") return false;
  const minimumMinutes = phase === "fast" ? 2 : 360;
  if (!lastCheckedAt) return true;
  const checked = new Date(lastCheckedAt);
  if (Number.isNaN(checked.getTime())) return true;
  return minutesBetween(now, checked) >= minimumMinutes;
}
