import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRunLedgerView,
  extractArtifactCards,
  formatRunEventSource,
  isTerminalRunStatus,
  mergeRunEvents,
  type RunEventLike
} from "../lib/run-ledger.ts";

const queued: RunEventLike = {
  id: "event-1",
  runId: "run-1",
  seq: 1,
  type: "run.status",
  createdAt: "2026-05-10T00:00:01.000Z",
  payload: { status: "queued" }
};

const running: RunEventLike = {
  id: "event-2",
  runId: "run-1",
  seq: 2,
  type: "run.status",
  createdAt: "2026-05-10T00:00:02.000Z",
  payload: { status: "running" }
};

const artifact: RunEventLike = {
  id: "event-3",
  runId: "run-1",
  seq: 3,
  type: "artifact.created",
  createdAt: "2026-05-10T00:00:03.000Z",
  payload: {
    artifactId: "artifact-1",
    kind: "report",
    name: "Hermes Smoke Report",
    uri: "s3://bucket/workspaces/workspace-web/runs/run-1/artifacts/artifact-1/hermes-report.md"
  }
};

const succeeded: RunEventLike = {
  id: "event-4",
  runId: "run-1",
  seq: 4,
  type: "run.status",
  createdAt: "2026-05-10T00:00:04.000Z",
  payload: { status: "succeeded" }
};

test("mergeRunEvents de-duplicates by event id/sequence and preserves ledger order", () => {
  const merged = mergeRunEvents([queued, artifact], [running, queued, succeeded, artifact]);

  assert.deepEqual(
    merged.map((event) => event.seq),
    [1, 2, 3, 4]
  );
  assert.equal(merged.length, 4);
});

test("deriveRunLedgerView summarizes latest status, last sequence, polling state, and artifacts", () => {
  const view = deriveRunLedgerView({
    initialStatus: "queued",
    events: [queued, running, artifact, succeeded]
  });

  assert.equal(view.status, "succeeded");
  assert.equal(view.lastSeq, 4);
  assert.equal(view.isTerminal, true);
  assert.equal(view.pollingLabel, "Run complete");
  assert.equal(view.artifacts.length, 1);
  assert.equal(view.artifacts[0]?.name, "Hermes Smoke Report");
});

test("extractArtifactCards returns user-facing artifact cards without raw payload JSON", () => {
  const cards = extractArtifactCards([queued, artifact]);

  assert.deepEqual(cards, [
    {
      id: "artifact-1",
      name: "Hermes Smoke Report",
      kind: "report",
      uri: "s3://bucket/workspaces/workspace-web/runs/run-1/artifacts/artifact-1/hermes-report.md"
    }
  ]);
});

test("isTerminalRunStatus only stops polling for final statuses", () => {
  assert.equal(isTerminalRunStatus("queued"), false);
  assert.equal(isTerminalRunStatus("running"), false);
  assert.equal(isTerminalRunStatus("succeeded"), true);
  assert.equal(isTerminalRunStatus("failed"), true);
  assert.equal(isTerminalRunStatus("cancelled"), true);
});

test("formatRunEventSource renders canonical source objects as text", () => {
  assert.equal(formatRunEventSource({ source: "worker.mock" }), "worker.mock");
  assert.equal(formatRunEventSource({ source: { name: "agents-cloud-worker", kind: "worker" } }), "agents-cloud-worker (worker)");
  assert.equal(formatRunEventSource({ source: { name: "agents-cloud-worker" } }), "agents-cloud-worker");
  assert.equal(formatRunEventSource({ source: { kind: "worker" } }), "worker");
  assert.equal(formatRunEventSource({}), "durable ledger");
});
