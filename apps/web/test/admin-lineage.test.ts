import assert from "node:assert/strict";
import test from "node:test";
import { describeAdminLineageEvent, summarizePipelinePosition } from "../lib/admin-lineage.ts";

test("describeAdminLineageEvent explains status, artifact, and failure events", () => {
  assert.equal(
    describeAdminLineageEvent({
      runId: "run-1",
      seq: 1,
      type: "run.status",
      createdAt: "2026-05-10T00:00:01.000Z",
      source: { kind: "control-api", name: "Control API" },
      payload: { status: "queued" }
    }).summary,
    "Request accepted by Control API and queued."
  );

  assert.equal(
    describeAdminLineageEvent({
      runId: "run-1",
      seq: 2,
      type: "run.status",
      createdAt: "2026-05-10T00:00:02.000Z",
      source: { kind: "worker", name: "ECS worker" },
      payload: { status: "failed", error: { message: "worker crashed" } }
    }).summary,
    "Run failed: worker crashed"
  );

  assert.equal(
    describeAdminLineageEvent({
      runId: "run-1",
      seq: 3,
      type: "artifact.created",
      createdAt: "2026-05-10T00:00:03.000Z",
      source: { kind: "worker", name: "ECS worker" },
      payload: { name: "Hermes worker report", kind: "report" }
    }).summary,
    "Artifact created: Hermes worker report (report)."
  );
});

test("summarizePipelinePosition reports the current stage and likely failure boundary", () => {
  assert.equal(
    summarizePipelinePosition([
      { runId: "run-1", seq: 1, type: "run.status", createdAt: "2026-05-10T00:00:01.000Z", payload: { status: "queued" } },
      { runId: "run-1", seq: 2, type: "run.status", createdAt: "2026-05-10T00:00:02.000Z", payload: { status: "running" } }
    ]),
    "Currently in worker execution. If it stalls here, inspect Step Functions/ECS worker logs."
  );

  assert.equal(
    summarizePipelinePosition([
      { runId: "run-1", seq: 1, type: "run.status", createdAt: "2026-05-10T00:00:01.000Z", payload: { status: "failed", error: { message: "boom" } } }
    ]),
    "Failed at run.status: boom"
  );
});
