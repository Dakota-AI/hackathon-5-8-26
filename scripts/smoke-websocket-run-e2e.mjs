const token = process.env.AGENTS_CLOUD_ID_TOKEN;
const apiUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL || "https://ajmonuqk61.execute-api.us-east-1.amazonaws.com";
const wsUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL || "wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev";
const workspaceId = process.env.AGENTS_CLOUD_E2E_WORKSPACE_ID || "workspace-websocket-e2e";
const suffix = Date.now().toString(36);

if (!token) {
  throw new Error("Missing AGENTS_CLOUD_ID_TOKEN.");
}

const created = await createRun();
const received = await subscribeAndCollect(created.runId);
const eventSummary = received.map((event) => `${event.seq}:${event.type}:${event.payload?.status ?? ""}`).join(",");

console.log(`WEBSOCKET_E2E_RUN_ID=${created.runId}`);
console.log(`WEBSOCKET_E2E_RECEIVED_COUNT=${received.length}`);
console.log(`WEBSOCKET_E2E_EVENT_TYPES=${eventSummary}`);
console.log(`WEBSOCKET_E2E_HAS_TERMINAL=${received.some((event) => event.type === "run.status" && event.payload?.status === "succeeded")}`);

if (!received.some((event) => event.type === "run.status" && event.payload?.status === "succeeded")) {
  throw new Error(`Did not receive terminal succeeded event over WebSocket. Received: ${eventSummary}`);
}

async function createRun() {
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
  return body;
}

function subscribeAndCollect(runId) {
  return new Promise((resolve, reject) => {
    const url = `${wsUrl}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    const received = [];
    const timeout = setTimeout(() => {
      ws.close();
      resolve(received);
    }, 45000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ action: "subscribeRun", workspaceId, runId }));
    });

    ws.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data));
        if (event.runId === runId && typeof event.seq === "number") {
          received.push(event);
          if (event.type === "run.status" && event.payload?.status === "succeeded") {
            clearTimeout(timeout);
            ws.close();
            resolve(received);
          }
        }
      } catch (error) {
        reject(error);
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed."));
    });
  });
}
