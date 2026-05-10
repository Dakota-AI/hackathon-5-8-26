# 0010 Tenant Access Control And Access Codes

Date: 2026-05-10
Status: Accepted

## Context

Agents Cloud now has enough deployed infrastructure to consume real compute,
model, storage, and realtime resources. The platform cannot remain open to any
new sign-up or trust client-supplied `workspaceId` values once autonomous agents,
workspace storage, previews, source-control operations, and third-party tools are
enabled.

The next platform slice must make access explicit:

- users are authenticated through Cognito,
- users must be admitted through an access code or admin invite,
- users must be in a platform Cognito group,
- workspace data access requires durable membership,
- realtime subscriptions must run the same membership checks as HTTP routes,
- workers must receive scoped context derived from server-side authorization.

## Decision

Use layered authorization:

```text
Cognito token
  -> Cognito group gate
  -> platform user profile
  -> organization membership
  -> workspace membership
  -> capability check
  -> route/action-specific authorization
```

Use access codes for private onboarding:

```text
client validates access code with platform API
  -> client calls Cognito SignUp with validation data
  -> Cognito pre-sign-up Lambda validates the code again
  -> email confirmation completes
  -> post-confirmation/redeem path consumes code transactionally
  -> platform creates user/org/workspace membership
  -> user is added to the required Cognito group
```

Cognito groups are coarse gates only. Workspace membership and capability checks
remain in platform services.

Initial groups:

- `agents-cloud-user`
- `agents-cloud-admin`
- `agents-cloud-suspended`
- `agents-cloud-internal`

Initial durable entities:

- `Users`
- `Organizations`
- `Workspaces`
- `WorkspaceMemberships`
- `AccessCodes`
- `AccessCodeRedemptions`

## Consequences

Positive:

- invite-only access controls cost and abuse risk,
- admin routes can be group-gated,
- workspace isolation becomes a first-class platform invariant,
- realtime and worker authorization can share the same access context,
- future Miro, GitHub, preview, and self-improvement capabilities have a safe
  tenant boundary.

Tradeoffs:

- signup becomes a product flow, not a raw Cognito default screen,
- Control API and realtime routes need more table reads before returning data,
- tests must cover denial and concurrency cases, not just happy paths,
- existing fixture/client flows need access-denied, no-workspace, and invite
  states.

## Implementation Notes

- Store only salted hashes of access codes.
- Never log raw access codes.
- Use TTL and status fields for code expiry/revocation.
- Make code redemption idempotent for a user/code pair where appropriate.
- Use DynamoDB conditional writes or transactions for concurrent redemption.
- Prefer `404` over `403` for object reads where existence should not leak.
- Treat `agents-cloud-suspended` as an explicit deny.
- Do not rely on client-visible group claims for authorization decisions.

## References

- API Gateway HTTP API JWT authorizers:
  https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html
- Cognito user pool groups:
  https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-user-groups.html
- Cognito pre sign-up Lambda trigger:
  https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html
- Cognito SignUp API:
  https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SignUp.html
