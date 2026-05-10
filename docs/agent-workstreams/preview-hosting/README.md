# Preview Hosting Workstream

Status: planned
Updated: 2026-05-10

## Mission

Own wildcard preview hosting for agent-created websites and artifacts.

The platform must support many projects at once with URLs like:

```text
project-slug.preview.example.com
```

Preview hosting must be tied to workspace authorization, deployment records,
artifact storage, and teardown/cost controls.

## Primary Docs

- `docs/adr/0007-preview-hosting.md`
- `docs/roadmap/WILDCARD_PREVIEW_HOSTING_STATUS.md`
- `docs/roadmap/NEXT_SYSTEM_AUDIT_AND_EXECUTION_PLAN_2026_05_10.md`
- `docs/agent-workstreams/COORDINATION.md`

## Ownership

Own:

- Preview deployment registry API.
- Wildcard DNS/domain wiring.
- Preview router/ingress behavior.
- Static preview artifact publishing from S3.
- Optional dynamic preview container routing when needed.
- Preview access policy, teardown, TTL, and cost controls.

Do not own:

- General artifact creation.
- Full agent runtime build process beyond preview publish contracts.
- Client UI except preview cards and management handoffs.

## Current State

- Preview deployment registry table exists.
- Optional preview ingress CDK scaffold exists and synth-validates with dummy
  domain inputs.
- Preview static bucket exists.
- No production preview publish API, preview router, artifact build pipeline, or
  wildcard live domain is fully wired yet.

## Near-Term Plan

1. Decide the first live preview domain and wildcard certificate path.
2. Add Control API routes to register/list/retire preview deployments.
3. Add preview artifact layout under S3 per user/workspace/work item.
4. Add preview-router behavior for static S3 previews first.
5. Add workspace membership and capability checks for preview publish/read.
6. Add runtime handoff so workers can publish a preview artifact and receive a
   durable preview URL.
7. Add teardown/TTL job before allowing broad preview generation.

## Validation

Required before implementation is considered product-ready:

```bash
pnpm control-api:test
pnpm agent-runtime:test
pnpm infra:test
pnpm infra:synth
```

Add tests for:

- unauthorized preview read/publish,
- invalid slug,
- slug collision,
- expired preview,
- missing artifact,
- static preview routing,
- teardown path,
- preview deployment event creation.

## Handoffs

Expected handoffs:

- To Access Control: `preview:publish` and preview read policy.
- To Agent Harness: artifact-to-preview publish contract.
- To Clients: preview cards, open/manage/retire actions.
- To Infrastructure: DNS, ACM, ALB/router, bucket policy, and cache settings.
