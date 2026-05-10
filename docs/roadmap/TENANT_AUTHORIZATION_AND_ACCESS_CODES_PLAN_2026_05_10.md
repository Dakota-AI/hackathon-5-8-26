# Tenant Authorization And Access Code Plan

_Last updated: 2026-05-10_

## Purpose

This is the implementation plan for making Agents Cloud access-controlled,
tenant-aware, and invite/access-code gated.

The product should not allow arbitrary public sign-up where any new user can
start consuming ECS, model, realtime, and storage resources. The first
production-shaped access model should require:

- a valid Cognito identity,
- membership in an allowed Cognito group,
- an accepted invite/access code before first use,
- a durable workspace membership row before accessing workspace data,
- server-side authorization for every Control API route and realtime
  subscription.

## Current Problem

The current platform has a real Control API and realtime spine, but
authorization is still mostly user-row ownership:

- `workspaceId` can be supplied by clients in create flows.
- WorkItems enforce owner checks, but not a full workspace membership model.
- Realtime subscriptions accept user/run/workspace information without a proper
  workspace ACL check.
- Admin-style views exist and must remain group-gated.
- Client shells still use fixture or hardcoded workspace behavior in places.

This is acceptable for smoke testing. It is not acceptable for a multi-user
autonomous agent platform.

## Concrete Code Gaps From 2026-05-10 Audit

- `POST /runs` accepts a client-provided `workspaceId` before membership is
  proven.
- State CDK does not yet define users, organizations, workspaces, memberships,
  access codes, or redemption audit tables.
- Cognito Auth is currently email sign-in without platform groups or signup
  triggers.
- Control API auth helpers do not yet read or enforce `cognito:groups`.
- Admin behavior still depends on an email allowlist instead of
  `agents-cloud-admin` plus capabilities.
- AWS-native realtime `subscribeRun` must load the stored run and authorize
  membership before saving subscriptions.
- Worker context can inherit spoofed workspace IDs until Control API create
  authorization is fixed.
- Web and Flutter need workspace picker, access-code flow, and access-denied
  states before broad onboarding.

## Official AWS Constraints Checked

The plan uses current AWS behavior:

- API Gateway HTTP API JWT authorizers validate JWT issuer/audience/expiry and
  optional scopes, then pass token claims to Lambda integrations. Fine-grained
  authorization still belongs in backend logic when it depends on workspace
  membership or business state.
- Cognito user pool groups appear in the `cognito:groups` claim in ID/access
  tokens. Groups are useful for coarse RBAC such as `agents-cloud-user` or
  `agents-cloud-admin`.
- Cognito pre sign-up Lambda triggers can inspect `validationData` and
  `clientMetadata` and can reject sign-up by returning an error.
- Cognito `SignUp` supports `ValidationData` and `ClientMetadata`, but
  `ClientMetadata` is not stored, validated, or encrypted by Cognito. Access
  codes must therefore be treated as short-lived credentials and stored/checked
  server-side as hashes.

References:

- API Gateway HTTP API JWT authorizers:
  https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html
- Cognito user pool groups:
  https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-user-groups.html
- Cognito pre sign-up Lambda trigger:
  https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html
- Cognito SignUp API:
  https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SignUp.html

## Design Decision

Use a layered authorization model:

```text
Cognito user
  -> Cognito group gate
  -> platform user profile
  -> organization membership
  -> workspace membership
  -> resource ownership/capability check
  -> route/action-specific authorization
```

API Gateway and WebSocket authorizers prove token validity. Lambdas enforce
platform authorization.

## Cognito Groups

Initial groups:

- `agents-cloud-user`: can access normal product routes after membership checks.
- `agents-cloud-admin`: can create access codes, view admin run lineage, manage
  users, and inspect operational state.
- `agents-cloud-suspended`: explicitly blocked even if other group claims remain
  stale in a token.
- `agents-cloud-internal`: reserved for trusted private operator/dev access.

Rules:

- Every Control API request must require `agents-cloud-user` or
  `agents-cloud-admin`.
- Admin routes require `agents-cloud-admin`.
- A user with `agents-cloud-suspended` must be denied.
- Group checks are coarse gates only; workspace membership is still required.
- Clients may use group claims to hide UI, but server checks are authoritative.

## Access Code Model

Create a DynamoDB `AccessCodes` table or equivalent entity.

Recommended table shape:

```text
PK: codeId
GSI1PK: codeHash
GSI1SK: createdAt
```

Fields:

- `codeId`
- `codeHash`
- `status`: `active | exhausted | revoked | expired`
- `kind`: `private-beta | workspace-invite | admin-bootstrap | service-test`
- `targetOrgId`
- `targetWorkspaceId`
- `targetRole`: `owner | admin | member | viewer`
- `groupsToAssign`: usually `agents-cloud-user`
- `allowedEmail`
- `allowedEmailDomain`
- `maxUses`
- `uses`
- `expiresAt`
- `createdByUserId`
- `createdAt`
- `lastRedeemedAt`
- `metadata`

Create `AccessCodeRedemptions` for audit:

```text
PK: codeId
SK: redeemedAt#userSub
```

Fields:

- `codeId`
- `userSub`
- `email`
- `ipHash`
- `userAgentHash`
- `result`: `accepted | rejected`
- `reason`
- `createdOrgId`
- `createdWorkspaceId`
- `createdMembershipId`

Security rules:

- Store only salted hashes of codes.
- Make codes high entropy and one-time or low-use.
- Never log raw codes.
- Rate-limit validation/redeem routes.
- Expire unused codes with TTL.
- Make redemption idempotent per code/user where appropriate.

## Signup And Redeem Flow

Recommended V1:

```text
User enters access code in web/native app
  -> client calls public validate endpoint with code
  -> server returns limited sign-up eligibility, not durable access
  -> client calls Cognito SignUp with ValidationData/accessCode
  -> Cognito pre-sign-up Lambda validates code hash/status again
  -> user confirms email
  -> post-confirmation/redeem Lambda consumes code transactionally
  -> user is added to Cognito group
  -> platform user profile + org/workspace membership rows are created
```

Why this shape:

- It blocks random signups before account creation.
- It does not trust the client to decide access.
- It uses Cognito-native signup while preserving a durable platform audit.
- It lets us keep invite code redemption atomic in DynamoDB.

Fallback private-alpha flow:

```text
Admin creates user with AdminCreateUser
  -> user receives invite/temp password
  -> post-confirmation/admin tool creates membership
```

This is simpler but less product-like.

## Platform Tables Needed

Add or formalize these tables/entities:

### Users

```text
PK: userId
```

Fields:

- `userId`: Cognito `sub`
- `email`
- `status`: `active | invited | suspended | deleted`
- `primaryOrgId`
- `createdAt`
- `lastSeenAt`

### Organizations

```text
PK: orgId
```

Fields:

- `orgId`
- `name`
- `status`
- `createdByUserId`
- `createdAt`

### Workspaces

```text
PK: workspaceId
```

Fields:

- `workspaceId`
- `orgId`
- `name`
- `status`
- `createdByUserId`
- `createdAt`

### WorkspaceMemberships

```text
PK: workspaceId
SK: userId
GSI1PK: userId
GSI1SK: workspaceId
```

Fields:

- `workspaceId`
- `orgId`
- `userId`
- `role`: `owner | admin | member | viewer`
- `status`: `active | invited | suspended | removed`
- `capabilities`: list of capability strings
- `createdAt`
- `updatedAt`

Capabilities:

- `run:create`
- `run:read`
- `run:cancel`
- `artifact:read`
- `artifact:write`
- `approval:decide`
- `workspace:admin`
- `agent:create`
- `preview:publish`
- `integration:connect`

## Authorization API Layer

Create a shared Control API auth helper:

```text
resolveAuthContext(event)
  -> token claims
  -> userId/email/groups
  -> group gate
  -> user profile
  -> workspace membership
  -> capability check
```

Every route should call the helper before doing durable reads/writes.

HTTP result policy:

- Invalid/missing token: `401`
- Valid token but missing required Cognito group: `403`
- Suspended user: `403`
- No workspace membership: `404` for object reads where object existence should
  be hidden, otherwise `403`
- Missing capability: `403`
- Malformed JSON/request: `400`

## Realtime Authorization

AWS-native realtime is the primary product path for now. Cloudflare Durable
Objects remain an alternate/fallback path and should track the same contract.

Realtime must not trust client-supplied workspace/run IDs.

For `subscribeRun`:

```text
connection userId
  -> load run by runId
  -> load workspace membership for run.workspaceId + userId
  -> require run:read
  -> save subscription
```

For future `subscribeWorkspace`:

```text
connection userId
  -> load workspace membership
  -> require workspace read capability
  -> save subscription
```

Cloudflare must use the same authorization semantics before it becomes
production-facing.

## Client Behavior

Web and Flutter should implement:

- access-code required screen before signup if no active session,
- sign-in/signup flow using Cognito,
- first-run workspace bootstrap after access code redemption,
- clear "pending access" and "access denied" states,
- workspace picker once multiple memberships exist,
- no hardcoded `workspace-web` after membership APIs exist.

## Implementation Phases

### Phase 1: Planning And Contract

- [x] Document access-control architecture.
- [ ] Add ADR for access-code and tenant authorization decision.
- [ ] Add protocol/API request/response contracts for access code validation and
  workspace memberships.
- [ ] Update `.agent.md`, `AGENTS.md`, and roadmap docs to call this the next
  top priority.

### Phase 2: CDK State And Cognito Resources

- [ ] Add `Users`, `Organizations`, `Workspaces`, `WorkspaceMemberships`,
  `AccessCodes`, and `AccessCodeRedemptions` tables or table entities.
- [ ] Add Cognito groups.
- [ ] Add pre-sign-up trigger.
- [ ] Add post-confirmation/redeem trigger or equivalent redeem Lambda.
- [ ] Add IAM grants for the relevant Lambdas.
- [ ] Add CDK assertions for tables, groups, triggers, and grants.

### Phase 3: Control API Enforcement

- [ ] Add `resolveAuthContext`.
- [ ] Require group gate on all product routes.
- [ ] Add workspace membership checks for run, WorkItem, artifact, DataSource,
  Surface, approval, and admin routes.
- [ ] Add admin-only access-code management endpoints.
- [ ] Add malformed JSON handling for `400` responses.
- [ ] Add tests for no group, suspended group, no membership, wrong workspace,
  insufficient capability, and admin-only routes.

### Phase 4: Realtime Enforcement

- [ ] Enforce membership on `subscribeRun`.
- [ ] Add subscription denial tests.
- [ ] Add replay/gap-repair cursor contract.
- [ ] Align Cloudflare realtime protocol with AWS-native realtime.

### Phase 5: Client Integration

- [ ] Web access-code screen.
- [ ] Flutter access-code screen.
- [ ] Workspace picker.
- [ ] Replace hardcoded workspace IDs.
- [ ] Connect Work dashboard to real WorkItem APIs.

## Required Tests

- [ ] Access code validates by hash, not raw value.
- [ ] Expired/revoked/exhausted codes are rejected.
- [ ] Reusing one-time code fails after first redemption.
- [ ] Concurrent redemption cannot exceed `maxUses`.
- [ ] Signup without code is denied.
- [ ] User without `agents-cloud-user` is denied product routes.
- [ ] `agents-cloud-suspended` blocks access.
- [ ] User cannot read another workspace's run.
- [ ] Realtime subscribe denies wrong workspace/run.
- [ ] Admin endpoints require `agents-cloud-admin`.

## Open Questions

- Should private-alpha use AdminCreateUser only before opening access-code
  self-signup?
- Should access codes create a default personal workspace or join a pre-created
  workspace?
- Should `orgId` exist from day one, or is `workspaceId` enough until teams
  arrive?
- Should workspace roles map directly to capabilities or use a separate policy
  table?
