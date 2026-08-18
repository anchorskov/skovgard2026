// Results/tests/poller.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import { inspectSource } from "../src/poller.js";

const source = {
  endpoint_url: "https://county.gov/elections",
  source_role: "landing_page",
};

const config = {
  userAgent: "test-agent",
  maxResponseBytes: 100_000,
  fetchTimeoutMs: 1_000,
  additionalAllowedHosts: new Set(),
};

test("records an HTML check and discovers result links", async () => {
  const html = '<a href="/files/2026-primary-results.pdf">2026 Primary Results</a>';
  const fetchImpl = async () => new Response(html, {
    status: 200,
    headers: { "content-type": "text/html", etag: '"abc"' },
  });
  const result = await inspectSource({ source, previousCheck: {}, electionYear: "2026", config, fetchImpl });
  assert.equal(result.check.httpStatus, 200);
  assert.equal(result.check.screenResult, "clean");
  assert.equal(result.discoveries.length, 1);
  assert.equal(result.discoveries[0].classification, "candidate_result");
  assert.equal(result.changed, true);
});

test("uses conditional headers and treats 304 as unchanged", async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(options.headers.get("If-None-Match"), '"abc"');
    return new Response(null, { status: 304, headers: { etag: '"abc"' } });
  };
  const result = await inspectSource({
    source,
    previousCheck: { etag: '"abc"', sha256: "old-sha" },
    electionYear: "2026",
    config,
    fetchImpl,
  });
  assert.equal(result.changed, false);
  assert.equal(result.check.sha256, "old-sha");
});

test("blocks a redirect to an unapproved vendor", async () => {
  const fetchImpl = async () => new Response(null, {
    status: 302,
    headers: { location: "https://vendor.example/live" },
  });
  const result = await inspectSource({ source, previousCheck: {}, electionYear: "2026", config, fetchImpl });
  assert.equal(result.check.httpStatus, null);
  assert.match(result.check.errorMessage, /not allowlisted/);
});

test("rejects responses over the configured size", async () => {
  const fetchImpl = async () => new Response("x".repeat(20), {
    status: 200,
    headers: { "content-type": "text/html", "content-length": "20" },
  });
  const result = await inspectSource({
    source,
    previousCheck: {},
    electionYear: "2026",
    config: { ...config, maxResponseBytes: 10 },
    fetchImpl,
  });
  assert.match(result.check.errorMessage, /Content-Length exceeded/);
});
