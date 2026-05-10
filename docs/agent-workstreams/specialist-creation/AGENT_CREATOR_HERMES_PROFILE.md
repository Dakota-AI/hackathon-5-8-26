# Agent Creator Hermes profile

Updated: 2026-05-10
Status: local profile working; Apify CLI tool discovery/prototyping verified

The Agents Cloud Agent Creator runs as a dedicated Hermes profile, not as an
ad-hoc prompt embedded in the admin UI. The admin Agent Workshop remains the
human review/approval surface. The profile itself owns the slow, iterative work:
researching the requested role, discovering candidate tools, prototyping those
tools, measuring cost/risk, generating evals, validating the resulting
`AgentProfileVersion`, and handing the draft to the Control API review flow.

## Current verified local setup

Local Hermes profile:

```text
~/.hermes/profiles/agentcreator/
```

Committed reproducible bundle:

```text
docs/agent-workstreams/specialist-creation/agentcreator-profile-bundle/
  SOUL.md
  config.agentcreator.yaml
  install-agentcreator-profile.sh
  skills/agents-cloud/
    agent-profile-schema/SKILL.md
    agent-profile-lifecycle/SKILL.md
    agent-tool-policy/SKILL.md
    agents-cloud-control-api/SKILL.md
    apify-tool-discovery/SKILL.md
    iterative-tool-assembly/SKILL.md
```

Apify CLI:

```text
tools/apifycli/apifycli
~/.local/bin/apifycli -> tools/apifycli/apifycli
```

The Apify token is local only and must not be committed:

```text
~/.hermes/profiles/agentcreator/.env
APIFY_TOKEN=apify_api_...
```

## What changed from the first prototype

The first profile was too one-shot oriented. It could render valid profile JSON,
but it did not have enough surface area to behave like a real workshop. The
current profile intentionally has more tools and stronger process rules:

- `browser` for reading tool/catalog pages when web extraction is not enough.
- `code_execution` for tiny local prototypes and scoring scripts.
- `terminal` for `apifycli`, pnpm validators, harnesses, and replayable shell
  prototypes.
- `cronjob` for delayed follow-up on long-running actor runs or user-held tests.
- `delegation` for parallel candidate-tool evaluation.
- `web` for research and non-Apify alternatives.
- `memory`/`session_search` so later workshops reuse prior discoveries.

It still has strict role boundaries:

- no Control API POST unless the user says `APPROVE: post draft for <profileId>`;
- no profile promotion from this profile;
- no plaintext secrets in generated profile artifacts;
- no wildcard Apify access;
- no external write/publish/email/social tools outside `approvalRequiredTools`;
- every candidate tool must have a prototype trace before being wired into the
  final policy.

## Why a local CLI instead of MCP for Apify

The workshop initially tried Apify MCP, but the better local development shape
is a drop-in CLI generated/implemented from `/Users/sebastian/Downloads/openapi.json`:

- no long-lived MCP server;
- no dynamic tool registration or MCP description injection;
- no empty-token startup failure;
- no SDK dependency;
- trivial terminal transcript/audit trail;
- every candidate call is replayable from a shell script;
- easier to enforce per-call budget and approval gates.

The local CLI is intentionally small and direct. It exposes the exact API
families the Agent Creator needs during tool discovery:

```bash
apifycli search --q "pricing scraper" --limit 10
apifycli get apify/website-content-crawler
apifycli openapi apify/website-content-crawler
apifycli readme apify/website-content-crawler
apifycli validate apify/website-content-crawler input.json
apifycli run-sync apify/website-content-crawler input.json --timeout 60 --max-items 3
apifycli run apify/website-content-crawler input.json
apifycli status <runId>
apifycli log <runId>
apifycli items <runId> --limit 20
apifycli abort <runId>
apifycli me
apifycli runs --limit 20
```

See `tools/apifycli/README.md` for details.

## Install/reproduce

From repo root:

```bash
./docs/agent-workstreams/specialist-creation/agentcreator-profile-bundle/install-agentcreator-profile.sh
```

Then add a token locally:

```bash
$EDITOR ~/.hermes/profiles/agentcreator/.env
# APIFY_TOKEN=apify_api_...
```

Verify:

```bash
hermes --profile agentcreator skills list | grep agents-cloud
apifycli me
```

Expected skills:

```text
agent-profile-schema
agent-profile-lifecycle
agent-tool-policy
agents-cloud-control-api
apify-tool-discovery
iterative-tool-assembly
```

## Standard workshop invocation

```bash
cd /Users/sebastian/Developer/agents-cloud
hermes --profile agentcreator \
  --skills agent-profile-lifecycle,agent-profile-schema,agent-tool-policy,agents-cloud-control-api,iterative-tool-assembly,apify-tool-discovery \
  chat -Q -q 'Workshop a "saas-pricing-watcher" specialist for workspace "workspace-dev", createdByUserId "test-user". Mission: every Monday, scan public pricing pages for a configurable list of competitor SaaS products, detect changes vs the prior week, and produce a brief markdown report with diffs and source links. Constraints: read-only public data, no login walls, no posting, no email. userPreferences: communicationCadence=weekly, reportStyle=markdown, verbosity=concise.

Run the FULL iterative workshop:
1. Use todo to lay out your plan with status updates.
2. Discover candidate tools using apifycli and web research.
3. Prototype each promising candidate with apifycli validate/run-sync.
4. Keep total Apify spend under $0.50.
5. Save scripts/inputs/outputs to /tmp/agent-creator/prototypes/saas-pricing-watcher/.
6. Append TRACE.md decisions.
7. Build /tmp/agent-creator/saas-pricing-watcher-draft.json.
8. Run validateAgentProfileVersion.
9. Do not POST to Control API.'
```

## Verified saas-pricing-watcher run

Run session:

```text
session_id: 20260510_045007_ef0d2a
log: /tmp/agent-creator/saas-pricing-watcher-session.log
```

Primary artifacts:

```text
/tmp/agent-creator/saas-pricing-watcher-research.md
/tmp/agent-creator/saas-pricing-watcher-draft.json
/tmp/agent-creator/prototypes/saas-pricing-watcher/TRACE.md
/tmp/agent-creator/agent-creator-smoke-output.txt
/tmp/agent-creator/saas-pricing-watcher-harness-output.txt
```

Prototype directory contained:

```text
candidates-*.json
apify~website-content-crawler.{meta,openapi,readme}.json/md
apify~web-scraper.{meta,openapi,readme}.json/md
apify~cheerio-scraper.{meta,openapi,readme}.json/md
prototype-wcc.sh
prototype-web-scraper.sh
prototype-cheerio.sh
prototype-internal-diff.py
wcc.input.json
wcc.validate.json
wcc.sample.json
wcc.final-status.json
web-scraper.input.json
web-scraper.validate.json
cheerio.input.json
cheerio.validate.json
platform-web-extract.sample.md
internal-diff.sample.diff
TRACE.md
```

Actual tool decisions in `TRACE.md`:

| Candidate | Result | Cost | Decision | Reason |
| --- | --- | ---: | --- | --- |
| `apify.run-actor.apify~website-content-crawler` | pass | `$0.0217` actual prototype spend | `approvalRequiredTools` | returned HTTP 200 Stripe pricing-page metadata/markdown; external paid compute/proxy usage must be gated |
| `apify.run-actor.apify~web-scraper` | fail | `$0.00` | `deniedTools` | input validated but run-sync returned `403 full-permission-actor-not-approved` |
| `apify.run-actor.apify~cheerio-scraper` | fail | `$0.00` | `deniedTools` | input validated but run-sync returned `403`; also weaker for JS-heavy pricing pages |
| `platform.web.search` | pass | `$0.00` | `allowedTools` | found role patterns and non-Apify alternatives with no external write risk |
| `platform.web.extract` | pass | `$0.00` | `allowedTools` | extracted Stripe pricing into markdown with source URL |
| `internal.diff.weekly-snapshot` | pass | `$0.00` | `allowedTools` | produced deterministic markdown diff from prior/current snapshots |
| `changedetection.io` | inconclusive | `$0.00` | `deniedTools` | promising future self-hosted option but not prototyped as runtime connector; notification channels conflict with no-email/no-posting constraint |

Generated profile validation was re-run manually after the workshop:

```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "summary": {
    "allowedToolCount": 5,
    "approvalRequiredToolCount": 1,
    "evalScenarioCount": 4,
    "mcpServerCount": 0
  }
}
```

Generated policy buckets:

```text
allowedTools:
  platform.web.search
  platform.web.extract
  internal.snapshot.read
  internal.snapshot.write
  internal.diff.weekly-snapshot

approvalRequiredTools:
  apify.run-actor.apify~website-content-crawler

deniedTools:
  apify.run-actor.apify~web-scraper
  apify.run-actor.apify~cheerio-scraper
  email.send
  social.post
  browser.write
  changedetection.io.external-alerts
```

Eval pack:

```text
weekly-price-change-report
no-change-report
guardrail-login-wall
approval-apify-fallback
```

Scorecard:

```text
readyForUserReview: true
readyForPromotion: false
policyCoverage: 1.0
evalScenarioCount: 4
approvalGateCount: 1
```

## Control API handoff

The workshop intentionally did not POST the draft. The required approval phrase
is:

```text
APPROVE: post draft for saas-pricing-watcher
```

Then the Agent Creator may call:

```text
POST https://ajmonuqk61.execute-api.us-east-1.amazonaws.com/agent-profiles
Authorization: Bearer $AGENTS_CLOUD_ID_TOKEN
Content-Type: application/json
Body: /tmp/agent-creator/saas-pricing-watcher-draft.json
```

## Current limitations / next implementation tasks

1. `services/agent-creator` scenario mode emits simulation output but does not
   write a full bundle directory. Bundle writing currently lives in interactive
   mode. Add `--bundle-dir` support to scenario mode.
2. Quarantine evals are specified but not yet executed against a throwaway
   specialist Hermes profile. Add an eval runner that writes `eval-results.json`.
3. Control API promotion should stamp real catalog hashes and immutable bundle
   hashes before any profile reaches `approved`/`promoted`.
4. Production specialists should not receive the raw Apify token. Runtime should
   call a curated platform connector with actor allowlists, workspace/run IDs,
   and budget enforcement.
5. The local `agentcreator` profile is intentionally operator-local. The repo
   only stores the reproducible bundle and install script, never auth material.
