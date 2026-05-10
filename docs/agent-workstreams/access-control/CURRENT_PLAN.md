# Access Control Current Plan

Workstream: Access Control
Owner: Access Control Workstream
Updated: 2026-05-10
Status: in progress; critical hardening slice

## Current Scope

Own the next platform-critical slice:

- Cognito group strategy.
- Access-code/private invite onboarding.
- Durable users, organizations, workspaces, workspace memberships, access codes,
  and redemption audit.
- Control API authorization helper and route retrofits.
- Realtime subscription authorization.
- Client handoffs for access code, workspace picker, denied states, and group
  states.

## Current State

- Cognito authentication exists through the current Amplify Auth sandbox.
- API Gateway HTTP API routes use a Cognito JWT authorizer.
- AWS-native realtime `$connect` validates a Cognito token.
- Control API has owner checks for run reads and WorkItem first-pass behavior.
- Admin behavior now accepts `agents-cloud-admin` group in Cognito tokens and
  falls back to allowlist for compatibility.
- Product routes now fail fast with a Cognito group gate (`agents-cloud-user` or
  `agents-cloud-admin`) before handler business logic executes.
- No durable workspace membership or access-code gate exists yet.

## Gaps

P0:

- `POST /runs` accepts a client-provided `workspaceId` without membership proof.
- Access-code signup is not implemented.
- Users/orgs/workspaces/memberships tables are not present.

P1:

- Realtime should move from ID token in query string to short-lived scoped
  tickets.
- Workers need scoped runner context after route authorization exists.
- Clients need workspace picker/access-denied states and must stop hardcoding
  `workspace-web`.

## Risks

- Enabling advanced agents before tenant checks can leak data, write artifacts
  under spoofed workspace prefixes, or spend compute/model credits for
  unauthorized users.
- Cognito group claims can be stale until token refresh; backend checks must
  treat durable user status and workspace membership as authoritative.
- Access codes are credentials. Raw codes must never be logged or stored.
- Realtime subscriptions are a common cross-tenant leak point if they trust
  client-provided workspace/run pairs.

## Files Expected To Change

Likely implementation files:

- `infra/cdk/src/stacks/state-stack.ts`
- `infra/cdk/src/stacks/control-api-stack.ts`
- `infra/cdk/src/stacks/realtime-api-stack.ts`
- `infra/cdk/src/test/*access*.test.ts`
- `infra/amplify/amplify/auth/resource.ts` or a CDK Cognito migration path
- `services/control-api/src/*auth*.ts`
- `services/control-api/src/handlers.ts`
- `services/control-api/src/ports.ts`
- `services/control-api/test/*auth*.test.ts`
- `services/realtime-api/src/handlers.ts`
- `services/realtime-api/src/subscriptions.ts`
- `services/realtime-api/test/*auth*.test.ts`
- client files for access-code and workspace selection after backend contracts
  exist

## Cross-Workstream Dependencies

- Dependency: membership tables, groups, triggers, grants.
  Owning workstream: Infrastructure.
  Handoff file: create once the table/trigger contract is ready.

- Dependency: `subscribeRun` authorization and realtime ticket flow.
  Owning workstream: Realtime Streaming.
  Handoff file: create before changing the WebSocket message contract.

- Dependency: access-code UI and workspace picker.
  Owning workstream: Clients.
  Handoff file: create after API request/response shapes are decided.

- Dependency: scoped runner context and token.
  Owning workstream: Agent Harness.
  Handoff file: create after `resolveAuthContext` shape is stable.

## Implementation Plan

1. Add CDK state tables and tests for users/orgs/workspaces/memberships/access
   codes/redemptions.
2. Add Cognito groups and decide whether to extend current Amplify Auth or move
   Cognito ownership fully into CDK.
3. Add pre-sign-up validation and post-confirmation redemption design/code.
4. Add `resolveAuthContext` in Control API.
5. Retrofit `POST /runs`, `GET /runs/{runId}`, events, admin routes, and
   WorkItem routes with group/membership/capability checks.
6. Add realtime subscribe authorization by loading the run and deriving
   workspace from durable state.
7. Add short-lived realtime ticket design after membership checks land.
8. Add client access-code and workspace-picker handoff.
9. Add runtime scoped-context handoff.

## Validation Plan

Run:

```bash
pnpm control-api:test
pnpm realtime-api:test
pnpm infra:test
pnpm infra:synth
```

Add tests for:

- missing group,
- suspended group,
- invalid/expired/revoked access code,
- concurrent redemption,
- no workspace membership,
- wrong workspace,
- insufficient capability,
- admin route denial,
- realtime subscribe denial,
- run create cannot spoof `workspaceId`,
- worker context derives workspace from the authorized run record.

## Progress Log

- 2026-05-10: Workstream created and aligned with ADR 0010 plus tenant
  authorization roadmap.
- 2026-05-10: Read-only audit confirmed P0 gaps in run creation, realtime
  subscription authorization, Cognito groups, durable membership state, and
  access-code onboarding.
- 2026-05-10: Implemented global product-route group gating across Control API
  handlers, admin `cognito:groups` parsing, and run-scoped realtime subscribe
  authorization. Remaining work is workspace membership and access-code
  enforcement.

## Completion Criteria

- Code/docs changed.
- CDK tables/groups/triggers are implemented and tested.
- Control API denies unauthorized workspace access.
- Realtime denies unauthorized subscriptions.
- Access-code redemption is transactional and audited.
- Clients no longer require hardcoded workspace IDs.
- Handoffs exist for any remaining client/runtime/realtime work.
