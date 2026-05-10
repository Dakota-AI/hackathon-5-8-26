# Handoff Template
From: Infrastructure
To: Agent Harness
Status: proposed
Date: 2026-05-10
Urgency: high

## Summary

Runner state tables and the first Control API routes for HostNode/UserRunner registration and heartbeat are deployed. The v0 HostNode write path is admin-gated through Cognito as a stand-in. Agent Harness should now define and implement the trusted local/ECS supervisor side: token broker contract, local Docker supervisor heartbeat client, and runner ownership proof for heartbeat writes.

## Why It Matters

The platform can now persist HostNode and UserRunner state, but real local/ECS runner processes should not rely on an admin user's Cognito session to heartbeat. Before resident runners are productized, heartbeat writes need a scoped machine credential or token exchange that proves which host/runner is allowed to update which record.

## Requested Action

Implement or propose the next Agent Harness slice:

1. Trusted runner/supervisor auth contract
   - Define token claims or signed payload fields for `hostId`, `runnerId`, `userId`, `workspaceId`, `placementTarget`, expiry, and audience.
   - Decide whether v0 token issuance lives in Control API, Secrets Manager, SSM, or a supervisor bootstrap command.
   - Make tokens scoped to one host/runner/user boundary, never broad admin credentials.

2. Local Docker supervisor heartbeat client
   - Register or update HostNode through the existing Control API route.
   - Create/update UserRunner records for local resident runners.
   - Heartbeat status/capacity/health on an interval.
   - Emit enough local logs for admin/operator debugging.

3. ECS resident runner compatibility
   - Keep the payloads compatible with future ECS resident services.
   - Do not require Docker socket access from arbitrary user runner containers.

4. Failure and stale behavior
   - Define status transitions for `online`, `starting`, `stale`, `failed`, `draining`, `offline`, and `restoring`.
   - Define timeout thresholds for stale runners and who marks them stale.

## Existing Deployed Routes

```text
POST /runner-hosts
POST /runner-hosts/{hostId}/heartbeat
POST /user-runners
GET /user-runners/{runnerId}
PATCH /user-runners/{runnerId}
POST /user-runners/{runnerId}/heartbeat
GET /admin/runners
```

## Files Or Contracts Affected

Expected Agent Harness files depend on your current lane, but likely include:

- `services/agent-runtime/` or a new local supervisor package if that is the chosen home.
- `docs/agent-workstreams/agent-harness/CURRENT_PLAN.md`.
- Any shared runner auth contract docs.
- Future handoff back to Infrastructure if new CDK/Secrets/API resources are needed.

## Validation Needed

Minimum once implemented:

```bash
pnpm control-api:test
pnpm agent-runtime:test
pnpm infra:build
pnpm infra:synth
```

After deployment/client wiring:

- Register a local HostNode.
- Create/heartbeat a UserRunner.
- Verify `GET /admin/runners` shows the host/runner state.
- Verify cross-user runner read/write is denied.

## Notes

Keep the single production-shaped CDK path. Do not create a parallel runner stack family or an alternate dev/prod architecture. The current `agents-cloud-dev-*` names are legacy/bootstrap names for the active stack family.
