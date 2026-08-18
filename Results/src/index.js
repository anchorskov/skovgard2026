// Results/src/index.js

import { loadConfig } from "./config.js";
import { statusSummary } from "./repository.js";
import { runScheduledPoll } from "./scheduler.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = loadConfig(env);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, worker: "skovgard-results", environment: config.environment });
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      try {
        const summary = await statusSummary(env.WY_DB, url.searchParams.get("election") || config.targetElectionKey);
        return summary ? json(summary) : json({ error: "Election not found" }, 404);
      } catch (error) {
        return json({ error: "Election status unavailable", detail: error instanceof Error ? error.message : String(error) }, 503);
      }
    }
    return json({ error: "Not found" }, 404);
  },

  async scheduled(controller, env) {
    const summary = await runScheduledPoll({
      env,
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
    });
    console.log(JSON.stringify({ event: "election_source_poll_complete", ...summary }));
  },
};
