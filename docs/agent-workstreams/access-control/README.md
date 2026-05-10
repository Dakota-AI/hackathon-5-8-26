# Access Control Workstream

Status: active planning
Updated: 2026-05-10

## Mission

Own tenant authorization, access-code gating, Cognito group policy, workspace
membership, and API/realtime authorization rules.

This workstream exists because the platform now has real durable execution
resources. Access control must be fixed before broader user onboarding or
autonomous worker expansion.

## Primary Docs

- `docs/roadmap/TENANT_AUTHORIZATION_AND_ACCESS_CODES_PLAN_2026_05_10.md`
- `docs/adr/0001-platform-control-plane.md`
- `docs/agent-workstreams/COORDINATION.md`

## Ownership

Own:

- Cognito group strategy.
- Access code/invite code table and lifecycle.
- User/org/workspace/membership model.
- Control API `resolveAuthContext` behavior.
- Realtime subscription authorization.
- Admin access-code management routes.
- Authorization tests and denial cases.

Do not own:

- Client UI polish beyond required access states.
- Runtime worker internals beyond auth context passed to workers.
- Third-party OAuth implementation beyond policy boundaries.

## Current State

- Cognito Auth exists through Amplify.
- Control API and realtime validate Cognito tokens.
- Admin-style routes exist.
- WorkItem ownership checks exist.
- Full workspace membership and access-code gating do not exist.

## Current Audit Findings

P0 gaps found on 2026-05-10:

- `POST /runs` accepts a client-supplied `workspaceId` without proving workspace
  membership.
- No durable `Users`, `Organizations`, `Workspaces`, `WorkspaceMemberships`,
  `AccessCodes`, or `AccessCodeRedemptions` tables exist yet.
- Cognito Auth is email sign-in only; groups and signup triggers are not wired.
- Control API helpers do not read `cognito:groups` yet.
- Admin routes still rely on an email allowlist instead of group/capability
  policy.
- AWS-native realtime validates a token at `$connect`, but `subscribeRun` does
  not load the run and verify membership before storing a subscription.
- Runtime receives workspace/user context from orchestration, so spoofed
  workspace IDs can propagate into artifact paths until Control API create
  authorization is fixed.

## Near-Term Plan

1. Add ADR for access-code and tenant authorization.
2. Add CDK tables/entities for users, orgs, workspaces, memberships, access
   codes, and redemptions.
3. Add Cognito groups.
4. Add signup/redeem trigger design.
5. Add `resolveAuthContext` shared helper.
6. Apply membership/capability checks to Control API.
7. Apply membership checks to realtime subscriptions.
8. Add web/native access-code flow handoff.

## Validation

Required:

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
- concurrent code redemption,
- no workspace membership,
- wrong workspace,
- insufficient capability,
- admin-only route denial,
- realtime subscribe denial.

## Handoffs

Expected handoffs:

- To Clients: access-code screen, workspace picker, access-denied states.
- To Realtime Streaming: shared subscribe authorization contract.
- To Agent Harness: auth context and scoped runner token contract.
- To Infrastructure: Cognito trigger/table/grant deployment needs.
