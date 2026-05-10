# Handoff Template
From: Infrastructure
To: Agent Harness / Control API
Status: proposed
Date: 2026-05-10
Urgency: high

## Summary

The user-runner state tables are deployed and active. The next backend slice should add production-shaped Control API endpoints for HostNode registration/heartbeat and UserRunner state/heartbeat using the existing Control API stack, not a new stack family.

## Why It Matters

Resident user runners cannot be supervised, restored, or surfaced in admin without a write/read API over the deployed state tables. This is the smallest useful bridge between the new infrastructure state model and the future local/ECS runner supervisor.

## Requested Action

Implement the next TDD slice in the existing Control API package and CDK stack:

1. HostNode registration/update
   - authenticated/admin or trusted-supervisor path only,
   - writes `hostId`, `hostRecordType`, `placementTarget`, `status`, capacity fields, `lastHeartbeatAt`, `updatedAt`, and `placementTargetStatus`.

2. HostNode heartbeat
   - updates `status`, capacity/health fields, `lastHeartbeatAt`, `updatedAt`, and derived index keys.

3. UserRunner create/update/get
   - user/admin boundary enforced,
   - writes `userId`, `runnerId`, `workspaceId`, `status`, `desiredState`, placement fields, resource limits, `lastHeartbeatAt`, and `updatedAt`.

4. UserRunner heartbeat
   - trusted runner/supervisor path only,
   - updates status/heartbeat/host fields without allowing cross-user writes.

5. Admin list/query
   - bounded recent/stale/failed runner views for `/admin`, so operators can see what is online, stale, restoring, or failed.

## Files Or Contracts Affected

Expected files:

- `services/control-api/src/ports.ts`
- `services/control-api/src/dynamo-store.ts`
- `services/control-api/src/handlers.ts`
- new `services/control-api/src/user-runners.ts` or similar
- new/updated `services/control-api/test/*runner*.test.ts`
- `infra/cdk/src/stacks/control-api-stack.ts`
- `docs/agent-workstreams/infrastructure/CURRENT_PLAN.md`

Do not create a new CDK app or alternate stack family.

## Expected Output

- Tests for auth boundaries, validation, idempotent upserts, stale heartbeat query patterns, and cross-user denial.
- Control API routes wired behind the existing API Gateway/Cognito/admin/trusted-supervisor boundary.
- DynamoDB store methods use the deployed runner table GSIs; no scans for product paths unless bounded admin/audit-only and documented.
- Deployed AWS smoke invoking the changed Lambda/HTTP routes with Cognito-shaped or supervisor-shaped test events.

## Validation Needed

Minimum:

```bash
pnpm control-api:test
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
pnpm --filter @agents-cloud/infra-amplify run typecheck
```

If protocol event types are added:

```bash
pnpm contracts:test
```

After deploy:

- `agents-cloud-dev-control-api` must reach `UPDATE_COMPLETE`.
- Directly invoke changed Lambda handler(s) with representative events.
- Verify DynamoDB writes/queries against the deployed HostNodes/UserRunners tables.

## Notes

The active infra direction is one production-shaped CDK path. Current `agents-cloud-dev-*` stack names are legacy/bootstrap names for the active stack family, not a reason to create parallel dev/prod stacks.

The current Auth provider is still the Amplify Auth sandbox `amplify-agentscloudinfraamplify-sebastian-sandbox-9f28c677ec` with user pool `us-east-1_1UeU1hTME` and client `3kq79rodc3ofjkulh0b31sfpos`. Do not delete it until Cognito/Auth is migrated into CDK and clients are switched.
