# Preview Hosting Current Plan

Workstream: Preview Hosting
Owner: Preview Hosting Workstream
Updated: 2026-05-10
Status: planned; infra-adjacent V1 candidate after access control/product APIs

## Current Scope

Own the first live wildcard preview path for agent-created websites:

- preview registry API,
- static preview artifact layout,
- wildcard DNS/certificate/ingress,
- preview-router contract,
- publish/retire events,
- workspace and capability authorization.

## Current State

- `PreviewDeploymentsTable` exists.
- Preview static S3 bucket exists.
- Optional `PreviewIngressStack` exists and synth-validates.
- Preview base domain is selected as `*.preview.solo-ceo.ai`.
- ACM wildcard certificate has been requested but not issued.
- `services/preview-router` is still a README boundary, not a real router.
- Control API has no preview publish/list/retire routes yet.

## Gaps

- Real host-header-aware preview-router implementation.
- Preview registration API.
- Runtime publish contract.
- Preview artifact S3 layout and metadata.
- TTL/cleanup/retire flow.
- Workspace membership and `preview:publish` capability checks.
- Live wildcard DNS record and issued certificate.

## Risks

- Public previews can leak workspace artifacts if read policy is not explicit.
- Per-preview infrastructure would not scale; use one wildcard ingress and a
  registry lookup.
- Preview publishing can create cost/security risk if agents can publish without
  approval or TTL.

## Files Expected To Change

- `services/preview-router/**`
- `services/control-api/**`
- `infra/cdk/src/stacks/preview-ingress-stack.ts`
- `infra/cdk/src/stacks/control-api-stack.ts`
- `infra/cdk/src/stacks/state-stack.ts`
- `packages/protocol/**`
- `docs/roadmap/WILDCARD_PREVIEW_HOSTING_STATUS.md`

## Cross-Workstream Dependencies

- Access Control: workspace membership and `preview:publish` capability.
- Agent Harness: artifact-to-preview publish contract.
- Clients: preview cards, open/manage/retire actions.
- Infrastructure: DNS, ACM, ALB/router, bucket policy, and cleanup job.

## Implementation Plan

1. Define `PREVIEW_ROUTER_CONTRACT.md`.
2. Define `PREVIEW_REGISTRATION_API.md`.
3. Add protocol events for preview publish/retire/failure.
4. Implement static S3 preview-router first.
5. Add Control API preview routes with auth/capability checks.
6. Add runtime publish helper that writes artifacts and registers preview.
7. Add TTL/cleanup before broad preview use.

## Validation Plan

```bash
pnpm contracts:test
pnpm control-api:test
pnpm infra:test
pnpm infra:synth
```

Add route tests for unauthorized preview read/publish, invalid slug, collision,
missing artifact, retired/expired preview, and workspace mismatch.

## Completion Criteria

- Static preview can be published under the wildcard domain.
- Preview records are durable and workspace-scoped.
- Retire/TTL works.
- Unauthorized users cannot read or publish previews.
- Docs and client handoffs are updated.
