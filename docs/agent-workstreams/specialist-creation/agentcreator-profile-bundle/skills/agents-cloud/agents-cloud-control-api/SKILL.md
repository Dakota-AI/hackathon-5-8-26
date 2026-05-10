---
name: agents-cloud-control-api
description: "Live Control API endpoints, payload shapes, and auth pattern for staging and approving AgentProfileVersion artifacts in Agents Cloud."
version: 1.0.0
metadata:
  hermes:
    tags: [agents-cloud, control-api, http, agent-profile, deploy]
---

# Agents Cloud Control API (agent-profile slice)

Base URL (dev): `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`.
Live admin UI: `https://main.dkqxgsrxe1fih.amplifyapp.com/admin`.
Custom domain (staging): `https://solo-ceo.ai` (admin subdomain DNS is broken
as of 2026-05-10 — do not rely on `admin.solo-ceo.ai`).

All `/agent-profiles*` routes require Cognito-issued `Authorization: Bearer
<idToken>`. Unauthenticated requests get HTTP 401.

## Endpoints

```
POST   /agent-profiles                      Stage a new draft (lifecycleState=draft)
GET    /agent-profiles                      List drafts/profiles for caller's workspace
GET    /agent-profiles/{profileId}          Inspect latest version
GET    /agent-profiles/{profileId}/versions Optional: enumerate versions
GET    /agent-profiles/{profileId}/versions/{version}
POST   /agent-profiles/{profileId}/versions/{version}/approve
POST   /agent-profiles/{profileId}/versions/{version}/reject
```

## POST /agent-profiles (stage draft)

Body is the full `AgentProfileVersion` JSON (see skill
`agent-profile-schema`). Server re-validates with
`@agents-cloud/agent-profile`; invalid drafts return 400 with the
`ValidationResult.errors` array.

On success: 201 with `{ profileId, version, s3Key, dynamoPk }`. The artifact is
written to S3 at:

```
s3://<workspace-live-artifacts-bucket>/workspaces/{workspaceId}/agent-profiles/{profileId}/versions/{version}/profile.json
```

and DynamoDB `agents-cloud-dev-state-AgentProfilesTable...` is updated.

## POST /agent-profiles/{profileId}/versions/{version}/approve

Body:

```json
{
  "approvedByUserId": "<cognito-sub>",
  "notes": "optional reviewer comment"
}
```

On success: 200, sets `lifecycleState=approved`, stamps
`approval.approvedAt` (ISO), `approvedByUserId`, and `approvalEventId`. The
S3 artifact is rewritten with the approval block. Promotion to `promoted`
happens through the runtime/specialist-creation workstream, NOT this slice.

## Required validation BEFORE you POST

You (Agent Creator) must:

1. Local-validate the draft (skill `agent-profile-lifecycle` Phase 5).
2. Confirm `lifecycleState === "draft"`.
3. Confirm `changeLog.length >= 1`.
4. Confirm `mcpPolicy.allowDynamicServers === false`.
5. Confirm no high-risk tool sits in `allowedTools`.

If any of those fail, do NOT call the API. Hand the draft back to the user
with the validator output.

## Auth helper (when the user wants to test)

The user gets a Cognito ID token via the admin UI's playground (Amplify Auth
sandbox). They paste it into `~/.hermes/profiles/agentcreator/.env` as:

```
AGENTS_CLOUD_ID_TOKEN=<id-token>
AGENTS_CLOUD_API=https://ajmonuqk61.execute-api.us-east-1.amazonaws.com
```

Then a smoke call:

```bash
curl -sS -X POST "$AGENTS_CLOUD_API/agent-profiles" \
  -H "Authorization: Bearer $AGENTS_CLOUD_ID_TOKEN" \
  -H "Content-Type: application/json" \
  --data @/tmp/agent-creator/<profileId>-draft.json | jq .
```

## What you NEVER do from this profile

- POST to `/agent-profiles` without explicit `APPROVE: post draft for <id>`.
- Call `/approve` for any profile. Approval is a human action.
- Write directly to DynamoDB or S3.
- Invent endpoints not listed above. If the user asks for one (e.g. canary,
  reject, retire), check `services/control-api/src/` first; if it doesn't
  exist, say so.

## Source of truth in repo

- Routes: `services/control-api/src/agent-profiles.ts` (or similar).
- Tests: `services/control-api/test/agent-profiles*.test.ts`.
- Web client wrapper: `apps/web/lib/agent-workshop.ts`.
- Validator: `packages/agent-profile/src/validators.ts`.

Read those before you assume API behavior.
