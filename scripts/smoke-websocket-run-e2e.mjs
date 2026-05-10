const token = process.env.AGENTS_CLOUD_ID_TOKEN;
const apiUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL || "https://ajmonuqk61.execute-api.us-east-1.amazonaws.com";
const wsUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL || "wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev";
const workspaceId = process.env.AGENTS_CLOUD_E2E_WORKSPACE_ID || "workspace-websocket-e2e";
const timeoutMs = Number(process.env.AGENTS_CLOUD_E2E_TIMEOUT_MS || "180000");
const pollMs = Number(process.env.AGENTS_CLOUD_E2E_POLL_MS || "3000");
const createRunMaxMs = Number(process.env.AGENTS_CLOUD_E2E_CREATE_RUN_MAX_MS || "20000");
const suffix = Date.now().toString(36);

if (!token) {
  throw new Error("Missing AGENTS_CLOUD_ID_TOKEN.");
}

const created = await createRun();
const result = await subscribeBackfillAndCollect(created.runId);
const merged = result.events;
const eventSummary = merged.map((event) => `${event.seq}:${event.type}:${event.payload?.status ?? ""}`).join(",");
const hasTerminalSucceeded = merged.some((event) => event.type === "run.status" && event.payload?.status === "succeeded");
const hasArtifact = merged.some((event) => event.type === "artifact.created");

console.log(`WEBSOCKET_E2E_RUN_ID=${created.runId}`);
console.log(`WEBSOCKET_E2E_CREATE_RUN_MS=${created.createRunMs}`);
console.log(`WEBSOCKET_E2E_EXECUTION_REF=${created.executionArn ?? ""}`);
console.log(`WEBSOCKET_E2E_WS_RECEIVED_COUNT=${result.websocketCount}`);
console.log(`WEBSOCKET_E2E_MERGED_EVENT_COUNT=${merged.length}`);
console.log(`WEBSOCKET_E2E_FINAL_RUN_STATUS=${result.run?.status ?? "unknown"}`);
console.log(`WEBSOCKET_E2E_EVENT_TYPES=${eventSummary}`);
console.log(`WEBSOCKET_E2E_HAS_TERMINAL=${hasTerminalSucceeded}`);
console.log(`WEBSOCKET_E2E_HAS_ARTIFACT=${hasArtifact}`);

if (result.run?.status !== "succeeded" && !hasTerminalSucceeded) {
  throw new Error(`Run did not reach succeeded. Final run=${JSON.stringify(result.run)} events=${eventSummary}`);
}
if (!hasArtifact) {
  throw new Error(`Did not observe artifact.created via merged WebSocket/HTTP ledger. Events: ${eventSummary}`);
}
if (result.websocketCount < 1) {
  throw new Error("Did not receive any live WebSocket events for the run.");
}

async function createRun() {
  const startedAt = Date.now();
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/runs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      workspaceId,
      objective: `WebSocket realtime e2e smoke for durable run loop ${suffix}`,
      idempotencyKey: `websocket-e2e-${suffix}`
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Create run failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  if (!body.runId) {
    throw new Error(`Create run response did not include runId: ${JSON.stringify(body)}`);
  }
  const createRunMs = Date.now() - startedAt;
  if (createRunMs > createRunMaxMs) {
    throw new Error(`Create run took ${createRunMs}ms, above ${createRunMaxMs}ms; async dispatch is not returning quickly enough.`);
  }
  return { ...body, createRunMs };
}

function subscribeBackfillAndCollect(runId) {
  return new Promise((resolve, reject) => {
    const url = `${wsUrl}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    let websocketCount = 0;
    let lastSeq = 0;
    let terminal = false;
    let finalRun;
    let settled = false;
    let events = [];

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      try { ws.close(); } catch {}
      if (error) reject(error);
      else resolve({ events, websocketCount, run: finalRun });
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Timed out after ${timeoutMs}ms waiting for run ${runId}. Events: ${summarize(events)}`));
    }, timeoutMs);

    const poll = setInterval(() => {
      void backfill().catch(finish);
    }, pollMs);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ action: "subscribeRun", workspaceId, runId }));
      void backfill().catch(finish);
    });

    ws.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data));
        if (event.runId === runId && typeof event.seq === "number") {
          websocketCount += 1;
          merge([event]);
          if (isTerminalEvent(event)) {
            terminal = true;
          }
        }
      } catch (error) {
        finish(error);
      }
    });

    ws.addEventListener("error", () => {
      // Keep HTTP backfill alive; a transient socket error should still produce a useful ledger failure.
    });

    async function backfill() {
      const [run, nextEvents] = await Promise.all([fetchRun(runId), fetchEvents(runId, lastSeq)]);
      finalRun = run;
      merge(nextEvents);
      if (shouldFinish(run.status)) {
        finish();
      }
    }

    function shouldFinish(status) {
      if (!isTerminalStatus(status) && !terminal) {
        return false;
      }
      if (String(status) !== "succeeded" && !hasSucceededTerminalEvent(events)) {
        return true;
      }
      return hasArtifactEvent(events);
    }

    function merge(incoming) {
      const map = new Map();
      for (const event of [...events, ...incoming]) {
        map.set(event.id || `${event.runId}-${event.seq}-${event.type}`, event);
      }
      events = [...map.values()].sort((a, b) => a.seq - b.seq);
      lastSeq = highestContiguousSeq(events);
    }
  });
}

async function fetchRun(runId) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/runs/${encodeURIComponent(runId)}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Get run failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return body.run ?? body;
}

async function fetchEvents(runId, afterSeq) {
  const params = new URLSearchParams({ limit: "100" });
  if (afterSeq > 0) params.set("afterSeq", String(afterSeq));
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/runs/${encodeURIComponent(runId)}/events?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`List events failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return body.events ?? [];
}

function isTerminalEvent(event) {
  return event.type === "run.status" && isTerminalStatus(event.payload?.status);
}

function isTerminalStatus(status) {
  return ["succeeded", "failed", "cancelled", "timed_out"].includes(String(status));
}

function hasSucceededTerminalEvent(events) {
  return events.some((event) => event.type === "run.status" && event.payload?.status === "succeeded");
}

function hasArtifactEvent(events) {
  return events.some((event) => event.type === "artifact.created");
}

function highestContiguousSeq(events) {
  const sequences = new Set(events.map((event) => Number(event.seq)).filter((seq) => Number.isInteger(seq) && seq > 0));
  let seq = 0;
  while (sequences.has(seq + 1)) {
    seq += 1;
  }
  return seq;
}

function summarize(events) {
  return events.map((event) => `${event.seq}:${event.type}:${event.payload?.status ?? ""}`).join(",");
}
