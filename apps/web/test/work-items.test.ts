import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
  buildWorkItemDetailView,
  deriveWorkItemSummary,
  filterWorkItemsByState,
  getPrimaryWorkItem,
  listFixtureWorkItems,
  normalizeWorkItemState,
  rejectUnsafeSurfacePayload,
  type WorkItemDetail
} from "../lib/work-items.ts";

test("listFixtureWorkItems returns WorkItems ordered by urgency and recent activity", () => {
  const items = listFixtureWorkItems();

  assert.ok(items.length >= 3);
  assert.deepEqual(
    items.slice(0, 3).map((item) => item.id),
    ["work_competitor_pricing", "work_launch_preview", "work_miro_research"]
  );
});

test("deriveWorkItemSummary makes WorkItem status more important than raw run state", () => {
  const item = getPrimaryWorkItem();
  const summary = deriveWorkItemSummary(item);

  assert.equal(summary.title, "Track competitor pricing");
  assert.equal(summary.primaryStatusLabel, "Needs review");
  assert.equal(summary.nextAction, "Review dashboard and approve weekly monitoring");
  assert.equal(summary.runSummary, "1 active / 3 total");
  assert.equal(summary.artifactSummary, "4 artifacts");
  assert.equal(summary.surfaceSummary, "2 generated surfaces");
});

test("buildWorkItemDetailView exposes runs, events, artifacts, approvals, and validated surfaces", () => {
  const detail = buildWorkItemDetailView(getPrimaryWorkItem());

  assert.equal(detail.id, "work_competitor_pricing");
  assert.equal(detail.sections.runs.length, 3);
  assert.equal(detail.sections.events[0]?.label, "Dashboard generated");
  assert.equal(detail.sections.artifacts.map((artifact) => artifact.kind).includes("report"), true);
  assert.equal(detail.sections.approvals[0]?.decision, "pending");
  assert.deepEqual(
    detail.sections.surfaces.map((surface) => surface.validation),
    ["server-validated", "server-validated"]
  );
});

test("filterWorkItemsByState covers loading, empty, denied, offline, stale, and ready states", () => {
  const ready = filterWorkItemsByState({ kind: "ready", items: listFixtureWorkItems() });
  const loading = filterWorkItemsByState({ kind: "loading" });
  const empty = filterWorkItemsByState({ kind: "ready", items: [] });
  const denied = filterWorkItemsByState({ kind: "denied", message: "No workspace access" });
  const offline = filterWorkItemsByState({ kind: "offline" });
  const stale = filterWorkItemsByState({ kind: "stale", items: [getPrimaryWorkItem()], lastUpdatedLabel: "7 min ago" });

  assert.equal(ready.mode, "ready");
  assert.equal(ready.items.length, listFixtureWorkItems().length);
  assert.equal(loading.mode, "loading");
  assert.equal(empty.mode, "empty");
  assert.equal(denied.mode, "denied");
  assert.equal(offline.mode, "offline");
  assert.equal(stale.mode, "stale");
  assert.equal(stale.statusText, "Last saved update was 7 min ago");
});

test("normalizeWorkItemState keeps product labels stable for clients", () => {
  assert.equal(normalizeWorkItemState("new"), "Intake");
  assert.equal(normalizeWorkItemState("planning"), "Planning");
  assert.equal(normalizeWorkItemState("running"), "In progress");
  assert.equal(normalizeWorkItemState("needs_review"), "Needs review");
  assert.equal(normalizeWorkItemState("blocked"), "Blocked");
  assert.equal(normalizeWorkItemState("done"), "Done");
});

test("rejectUnsafeSurfacePayload fails closed for unvalidated generated UI", () => {
  const detail: WorkItemDetail = buildWorkItemDetailView(getPrimaryWorkItem());

  assert.equal(rejectUnsafeSurfacePayload(detail.sections.surfaces[0]), false);
  assert.equal(
    rejectUnsafeSurfacePayload({
      id: "surface_raw_html",
      title: "Raw HTML preview",
      kind: "dashboard",
      validation: "unvalidated",
      componentCount: 1,
      dataSources: ["inline-data"],
      lastUpdated: "now"
    }),
    true
  );
});

// Real-data path: when NEXT_PUBLIC_AGENTS_CLOUD_API_URL is set and a Cognito
// session is available, listControlApiWorkItems() must call the right URL with
// a bearer token. This is what powers the WorkDashboard for an authed user
// in the live app.
test("listControlApiWorkItems hits /work-items with bearer token (real-data path)", async (t) => {
  if (typeof (t.mock as { module?: unknown }).module !== "function") {
    t.skip("node:test module mocks unavailable; rerun with --experimental-test-module-mocks");
    return;
  }

  process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL = "https://example.invalid/api";
  delete process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK;

  t.mock.module("aws-amplify/auth", {
    namedExports: {
      fetchAuthSession: async () => ({
        tokens: { idToken: { toString: () => "test-id-token" } }
      })
    }
  });

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        workItems: [
          {
            workspaceId: "ws-test",
            workItemId: "wi-1",
            objective: "Track competitor pricing",
            status: "needs_review"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const mod = await import("../lib/control-api.ts");
    assert.equal(mod.getControlApiHealth().configured, true);

    const response = await mod.listControlApiWorkItems({ workspaceId: "ws-test", limit: 5 });
    assert.equal(response.workItems.length, 1);
    assert.equal(response.workItems[0]!.workItemId, "wi-1");

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/work-items\?/);
    assert.match(calls[0]!.url, /workspaceId=ws-test/);
    const headers = calls[0]!.init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.authorization, "Bearer test-id-token");
  } finally {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  }
});

test("listControlApiWorkItemArtifacts maps Control API uri fields for artifact board display", async (t) => {
  if (typeof (t.mock as { module?: unknown }).module !== "function") {
    t.skip("node:test module mocks unavailable; rerun with --experimental-test-module-mocks");
    return;
  }

  process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL = "https://example.invalid/api";
  delete process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK;

  t.mock.module("aws-amplify/auth", {
    namedExports: {
      fetchAuthSession: async () => ({
        tokens: { idToken: { toString: () => "test-id-token" } }
      })
    }
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        artifacts: [
          {
            artifactId: "artifact-1",
            runId: "run-1",
            workItemId: "wi-1",
            workspaceId: "ws-test",
            userId: "user-1",
            kind: "report",
            name: "Hermes Report",
            uri: "s3://bucket/workspaces/ws-test/runs/run-1/artifacts/artifact-1/report.md",
            contentType: "text/markdown",
            createdAt: "2026-05-10T00:00:00.000Z"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  try {
    const mod = await import("../lib/control-api.ts");
    const response = await mod.listControlApiWorkItemArtifacts({ workspaceId: "ws-test", workItemId: "wi-1" });
    assert.equal(
      response.artifacts[0]?.s3Uri,
      "s3://bucket/workspaces/ws-test/runs/run-1/artifacts/artifact-1/report.md"
    );
  } finally {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  }
});
