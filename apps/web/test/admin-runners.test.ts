import assert from "node:assert/strict";
import test from "node:test";
import { describeRunnerHealth, sortRunnerRows } from "../lib/admin-runners.ts";
import type { AdminRunnerRecord } from "../lib/control-api.ts";

const runners: AdminRunnerRecord[] = [
  {
    userId: "user-a",
    runnerId: "runner-stale",
    workspaceId: "workspace-a",
    status: "stale",
    desiredState: "running",
    hostStatus: "host-1#stale",
    resourceLimits: {},
    health: {},
    lastHeartbeatAt: "2026-05-10T01:00:00.000Z",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T01:00:00.000Z"
  },
  {
    userId: "user-b",
    runnerId: "runner-online",
    workspaceId: "workspace-b",
    status: "online",
    desiredState: "running",
    hostStatus: "host-2#online",
    resourceLimits: {},
    health: {},
    lastHeartbeatAt: "2026-05-10T02:00:00.000Z",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T02:00:00.000Z"
  }
];

test("describeRunnerHealth turns admin runner totals into operator copy", () => {
  assert.equal(
    describeRunnerHealth({ hosts: 2, runners: 4, failedHosts: 1, failedRunners: 0, staleRunners: 2 }),
    "2 stale runners and 1 failed host need attention."
  );
  assert.equal(
    describeRunnerHealth({ hosts: 1, runners: 1, failedHosts: 0, failedRunners: 0, staleRunners: 0 }),
    "1 runner online/known across 1 host."
  );
});

test("sortRunnerRows shows unhealthy runners first, then newest heartbeat", () => {
  assert.deepEqual(sortRunnerRows(runners).map((runner) => runner.runnerId), ["runner-stale", "runner-online"]);
});
