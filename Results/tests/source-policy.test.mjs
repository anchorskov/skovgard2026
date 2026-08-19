// Results/tests/source-policy.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import { FAST_CRON } from "../src/config.js";
import {
  allowedRedirectHost,
  classifyDiscoveredLink,
  collectionPhase,
  extractLinks,
  screenTestMaterial,
  sourceIsDue,
} from "../src/source-policy.js";

test("classifies a current primary results link", () => {
  const result = classifyDiscoveredLink({
    url: "https://county.gov/files/2026-primary-results.pdf",
    linkText: "2026 Primary Unofficial Results",
    electionYear: "2026",
  });
  assert.equal(result.classification, "candidate_result");
});

test("a cache-busting query timestamp does not fake a match on the election year", () => {
  const result = classifyDiscoveredLink({
    url: "https://county.gov/results/PREVIOUS%20ELECTION%20OFFICIAL%20RESULTS/2024/2024%20PRIMARY%20ELECTION/OFFICIAL%202-4.pdf?t=202608181024430",
    linkText: "Bedford 2-4 official",
    electionYear: "2026",
  });
  assert.equal(result.classification, "result_other_year_or_unknown");
});

test("rejects sample ballots and equipment tests", () => {
  assert.equal(screenTestMaterial({ url: "https://county.gov/2026-sample-ballot.pdf" }), "rejected_sample_ballot");
  assert.equal(screenTestMaterial({ url: "https://county.gov/2026-public-test.pdf" }), "rejected_test_data");
  assert.equal(screenTestMaterial({ text: "Logic and Accuracy Test Results" }), "rejected_test_data");
});

test("extracts result candidates and preserves rejected test links", () => {
  const links = extractLinks(`
    <a href="/2026-results.pdf">Unofficial 2026 Results</a>
    <a href="/2026-sample-ballot.pdf">2026 Sample Ballot</a>
    <a href="/contact">Contact</a>
  `, "https://county.gov/elections", "2026");
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((link) => link.classification), ["candidate_result", "rejected_sample_ballot"]);
});

test("redirects stay on the source host unless explicitly allowed", () => {
  assert.equal(allowedRedirectHost("https://county.gov/results", "https://county.gov/file.pdf"), true);
  assert.equal(allowedRedirectHost("https://county.gov/results", "https://vendor.example/results"), false);
  assert.equal(
    allowedRedirectHost("https://county.gov/results", "https://vendor.example/results", new Set(["vendor.example"])),
    true,
  );
});

test("fast cron runs only inside the configured election window", () => {
  const config = { fastWindowBeforeMinutes: 60, fastWindowAfterMinutes: 1080 };
  const close = "2026-08-18T19:00:00-06:00";
  const before = new Date("2026-08-18T18:30:00-06:00");
  const tooEarly = new Date("2026-08-18T12:00:00-06:00");
  assert.equal(collectionPhase(before, close, config), "fast");
  assert.equal(collectionPhase(tooEarly, close, config), "baseline");
  assert.equal(sourceIsDue({ now: before, lastCheckedAt: null, phase: "fast", cron: FAST_CRON }), true);
  assert.equal(sourceIsDue({ now: tooEarly, lastCheckedAt: null, phase: "baseline", cron: FAST_CRON }), false);
});

test("a source whose latest status is 403 is not due again within the backoff window", () => {
  const now = new Date("2026-08-18T18:10:00-06:00");
  const checkedFiveMinutesAgo = new Date("2026-08-18T18:05:00-06:00").toISOString();
  const due = sourceIsDue({
    now,
    lastCheckedAt: checkedFiveMinutesAgo,
    lastHttpStatus: 403,
    phase: "fast",
    cron: FAST_CRON,
    http403BackoffMinutes: 360,
  });
  assert.equal(due, false);
});

test("a source whose latest status is 403 becomes due once the backoff expires", () => {
  const now = new Date("2026-08-19T00:10:00-06:00");
  const checkedSixHoursAgo = new Date("2026-08-18T18:05:00-06:00").toISOString();
  const due = sourceIsDue({
    now,
    lastCheckedAt: checkedSixHoursAgo,
    lastHttpStatus: 403,
    phase: "fast",
    cron: FAST_CRON,
    http403BackoffMinutes: 360,
  });
  assert.equal(due, true);
});

test("a source whose latest status is a different failure keeps the normal fast-window cadence", () => {
  const now = new Date("2026-08-18T18:10:00-06:00");
  const checkedThreeMinutesAgo = new Date("2026-08-18T18:07:00-06:00").toISOString();
  const due = sourceIsDue({
    now,
    lastCheckedAt: checkedThreeMinutesAgo,
    lastHttpStatus: 500,
    phase: "fast",
    cron: FAST_CRON,
    http403BackoffMinutes: 360,
  });
  assert.equal(due, true);
});

test("a source whose latest status is 200 keeps the normal two-minute fast-window cadence", () => {
  const now = new Date("2026-08-18T18:10:00-06:00");
  const checkedThreeMinutesAgo = new Date("2026-08-18T18:07:00-06:00").toISOString();
  const due = sourceIsDue({
    now,
    lastCheckedAt: checkedThreeMinutesAgo,
    lastHttpStatus: 200,
    phase: "fast",
    cron: FAST_CRON,
    http403BackoffMinutes: 360,
  });
  assert.equal(due, true);
});

test("a never-checked source is immediately eligible regardless of backoff config", () => {
  const now = new Date("2026-08-18T18:10:00-06:00");
  const due = sourceIsDue({
    now,
    lastCheckedAt: null,
    lastHttpStatus: null,
    phase: "fast",
    cron: FAST_CRON,
    http403BackoffMinutes: 360,
  });
  assert.equal(due, true);
});

test("the 403 backoff default of 360 minutes applies when no override is given", () => {
  const now = new Date("2026-08-18T18:10:00-06:00");
  const checkedFiveMinutesAgo = new Date("2026-08-18T18:05:00-06:00").toISOString();
  const due = sourceIsDue({
    now,
    lastCheckedAt: checkedFiveMinutesAgo,
    lastHttpStatus: 403,
    phase: "fast",
    cron: FAST_CRON,
  });
  assert.equal(due, false);
});

test("no county or source is named in the scheduling policy source", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const source = await readFile(path.join(__dirname, "..", "src", "source-policy.js"), "utf8");
  assert.doesNotMatch(source, /Laramie/i);
});
