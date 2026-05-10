# Cognito Auth Reference

[← reference](README.md) · [wiki index](../README.md) · related: [secondary-infra](../infrastructure/secondary-infra.md), [control-api](../services/control-api.md), [realtime-api](../services/realtime-api.md)

> How a userId reaches every layer of the system. Single source: Cognito JWT `sub` claim.

---

## User pool

| Field | Value |
|---|---|
| User pool id | `us-east-1_1UeU1hTME` |
| User pool client id | `3kq79rodc3ofjkulh0b31sfpos` |
| Owner | **Amplify Gen 2 sandbox** (not CDK) |
| Sandbox stack | `amplify-agentscloudinfraamplify-sebastian-sandbox-9f28c677ec` |

CDK imports the pool via `UserPool.fromUserPoolId(...)`. Defaults are hardcoded in `infra/cdk/src/config/environments.ts`. Override via `AGENTS_CLOUD_COGNITO_USER_POOL_ID` and `AGENTS_CLOUD_COGNITO_USER_POOL_CLIENT_ID` for a fresh deployment.

Login: email-only.

---

## Token flow

```
1. User opens web app
2. <Authenticator> presents sign-in modal
3. Cognito issues ID token (JWT) and access token
4. Web stores tokens via Amplify (localStorage)
5. fetchAuthSession() returns tokens.idToken
6. control-api.ts attaches Authorization: Bearer <idToken>
7. realtime-client.ts attaches ?token=<idToken>
```

---

## Where userId is extracted

| Layer | File | Code |
|---|---|---|
| Control API HTTP | `services/control-api/src/handlers.ts:391` | `event.requestContext.authorizer.jwt.claims.sub` |
| Control API helper | `services/control-api/src/handlers.ts:391` | `userFromEvent` — throws if missing |
| Realtime API connect | `services/realtime-api/src/auth.ts:30` | `aws-jwt-verify` on `?token=` query |
| Realtime API store | `services/realtime-api/src/handlers.ts:33` | persists `userId` on connection |

The Lambda authorizer is instantiated at `infra/cdk/src/stacks/control-api-stack.ts:36`:
```ts
new HttpJwtAuthorizer("...", userPool, {
  jwtAudience: [config.auth.userPoolClientId],
})
```

---

## userId propagates through the stack

```
Cognito sub
   │
   ▼
Control API JWT authorizer
   │
   ▼
Lambda handler.userId  (handlers.ts:391)
   │
   ▼
DynamoDB row.userId  (RunsTable, TasksTable, EventsTable, WorkItemsTable, UserRunnersTable, AgentProfilesTable)
   │
   ▼
Step Functions input.userId  (step-functions.ts:30)
   │
   ▼
ECS container env USER_ID  (orchestration-stack.ts:50)
   │
   ▼
Worker mustEnv("USER_ID")  (services/agent-runtime/src/index.ts:34)
   │
   ▼
Worker stamps event.userId  (worker.ts:37, 52, 95)
   │
   ▼
DDB Stream → Realtime relay
   │
   ▼
relay.ts filter: conn.userId === event.userId
   │
   ▼
WebSocket broadcast to that user only
```

---

## Authorization patterns

### Owner-scoped reads

Every read endpoint checks `record.userId !== user.userId → 404`:

```ts
// services/control-api/src/query-runs.ts:14
if (run.userId !== user.userId) {
  return notFound();
}

// services/control-api/src/work-items.ts:193
function requireOwnedWorkItem(record, userId) {
  if (record.userId !== userId) throw notFound();
}

// services/control-api/src/agent-profiles.ts:230
function requireOwnedProfile(record, userId) { ... }
```

### Per-user listing

GSI lookups by `userId`:

```ts
listWorkItemsForUser(userId)        // by-user-created-at GSI
listAgentProfilesForUser(userId)    // by-user-created-at GSI
getUserRunner(userId, runnerId)     // PK is userId
```

❌ **No `listRunsForUser`** — GSI exists, handler missing.

### Admin gate

`services/control-api/src/query-runs.ts:130`:

```ts
function isAdminUser(user, env) {
  const adminEmails = parseAdminEmails(env.ADMIN_EMAILS); // hardcoded "seb4594@gmail.com"
  return adminEmails.includes(user.email.trim().toLowerCase());
}
```

The web admin console is **not** gated client-side — anyone authenticated sees the page chrome. Every admin endpoint returns 403 if not in `ADMIN_EMAILS`.

⚠️ `ADMIN_EMAILS` is hardcoded in `infra/cdk/src/stacks/control-api-stack.ts:63`. Adding admins requires source edit + redeploy.

---

## Realtime authorization

WebSocket auth has its own quirks because token can't go in headers (browsers don't send headers on `new WebSocket()`).

```ts
// apps/web/lib/realtime-client.ts
const url = `${realtimeBaseUrl}?token=${idToken}`
new WebSocket(url)
```

API Gateway authorizer reads the token from `route.request.querystring.token` (`realtime-api-stack.ts:identitySource`).

⚠️ Token in query string is logged by API Gateway access logs. Acceptable for hackathon, not for production.

After `$connect`, `subscribeRun` writes a topic row but **does not check ownership**. The relay mitigates this by filtering events on `userId === conn.userId`. Topic-squatting on guessable run-ids would just produce silence.

---

## What's NOT implemented

Per [ADR-0010](../adrs.md#adr-0010-tenant-access-control--access-codes), the production design includes:

- ❌ Cognito groups (`agents-cloud-user`, `-admin`, `-suspended`, `-internal`)
- ❌ AccessCodes table + redemption flow
- ❌ Users / Organizations / Workspaces / WorkspaceMemberships tables
- ❌ Pre-sign-up Lambda triggers
- ❌ Workspace membership checks on every route

🗑️ **All explicitly skipped for hackathon.** The userId table-routing pattern above is the simplification.

---

## Dev bypass

For local development without Cognito:

```sh
NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS=1
```

Skips the Authenticator widget entirely. Doesn't bypass server-side JWT — Control API will return 401. Useful for offline UI iteration with mock mode.

```sh
NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK=1
```

Web client returns synthetic data instead of hitting Control API. Doesn't require auth.

[← reference](README.md) · [→ control-api](../services/control-api.md) · [→ realtime-api](../services/realtime-api.md)
