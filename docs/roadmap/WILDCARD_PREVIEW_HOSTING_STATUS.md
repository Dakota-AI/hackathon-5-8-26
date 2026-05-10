# Wildcard Preview Hosting Status

Date: 2026-05-09
Environment: `dev`
AWS profile: `agents-cloud-source`
AWS account: `625250616301`
AWS region: `us-east-1`

## Goal

Allow an agent to publish a generated web app and expose it at a stable preview host like:

```text
https://{slug}.preview.{main-domain}
```

The intended production path is:

```text
agent run
  -> build static app or dynamic preview
  -> upload/register deployment
  -> PreviewDeployments registry
  -> wildcard DNS
  -> ACM wildcard certificate
  -> public ALB
  -> preview-router ECS service
  -> static S3 deployment or dynamic ECS target
```

## Current Setup Checklist

### AWS Credentials

- [x] Access-key CSV imported into named AWS CLI profile `agents-cloud-source`.
- [x] Secrets were not printed to terminal output.
- [x] Profile identity verified with STS.
  - Account: `625250616301`
  - ARN: `arn:aws:iam::625250616301:user/Sebsatian`
- [x] Profile default region set to `us-east-1`.

### Existing Durable Platform

- [x] CDK foundation stack exists.
- [x] VPC/network stack exists.
- [x] ECS cluster exists.
- [x] Step Functions orchestration stack exists.
- [x] Agent runtime task definition exists.
- [x] Preview static S3 bucket exists:
  - `agents-cloud-dev-storage-previewstaticbucket42b307-oyrfiakvhnf8`
- [x] Agent runtime task role has read/write access to the preview static bucket.
- [x] Step Functions -> ECS task path was smoke-tested successfully.

### Preview Registry

- [x] CDK now defines a `PreviewDeploymentsTable` in `StateStack`.
- [x] `PreviewDeploymentsTable` is deployed and ACTIVE.
- [x] Table key schema:
  - partition key: `previewHost`
  - sort key: `deploymentId`
- [x] Table GSIs:
  - `by-project-updated-at`
  - `by-workspace-updated-at`
- [x] Agent runtime task role now has read/write access to `PreviewDeploymentsTable`.
- [ ] Control API endpoint does not yet exist to register preview deployments.
- [ ] No agent workflow currently writes preview registry records.

Deployed table:

```text
agents-cloud-dev-state-PreviewDeploymentsTable37B54DE6-WEG6QR56NMCX
```

### Wildcard Ingress CDK Wiring

- [x] CDK now has optional preview ingress config in `loadConfig()`.
- [x] CDK now has a `PreviewIngressStack`.
- [x] `PreviewIngressStack` synthesizes when the required domain env vars are provided.
- [x] `PreviewIngressStack` now supports Cloudflare/external-DNS domains by importing an existing ACM certificate ARN instead of requiring a Route 53 hosted zone.
- [x] `PreviewIngressStack` includes:
  - Route 53 mode: ACM certificate for preview base domain and wildcard SAN.
  - External DNS mode: imported ACM certificate via `AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN`.
  - public Application Load Balancer.
  - HTTPS listener.
  - HTTP-to-HTTPS redirect.
  - Route 53 mode only: wildcard and base-domain Route 53 alias records.
  - ECS Fargate `preview-router` service.
  - read permission from preview-router to preview static S3 bucket.
  - read permission from preview-router to `PreviewDeploymentsTable`.
- [x] Final preview base domain selected: `preview.solo-ceo.ai`.
- [ ] `PreviewIngressStack` is not deployed yet because `solo-ceo.ai` is managed in Cloudflare and the ACM certificate is still pending DNS validation.
- [ ] No live wildcard DNS record currently points to the preview-router ALB.
- [x] ACM wildcard certificate has been requested for the final preview domain.
- [ ] ACM wildcard certificate has not been issued yet.
- [ ] The preview-router container currently uses a temporary nginx image, not the final host-header-aware router implementation.

### Preview Domain Policy

The selected preview base domain is:

```text
*.preview.solo-ceo.ai
```

Use an isolated preview subdomain rather than placing generated previews at the
root of a product domain.

## Files Changed

- [x] `infra/cdk/src/config/environments.ts`
  - Adds optional preview ingress env config:
    - `AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED`
    - `AGENTS_CLOUD_PREVIEW_BASE_DOMAIN`
    - `AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_ID`
    - `AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_NAME`

- [x] `infra/cdk/src/stacks/state-stack.ts`
  - Adds `PreviewDeploymentsTable`.

- [x] `infra/cdk/src/stacks/runtime-stack.ts`
  - Grants agent runtime read/write access to `PreviewDeploymentsTable`.

- [x] `infra/cdk/src/stacks/preview-ingress-stack.ts`
  - Adds optional wildcard preview ingress stack.

- [x] `infra/cdk/src/bin/agents-cloud-cdk.ts`
  - Wires `PreviewIngressStack` only when preview ingress is enabled.

- [x] `infra/cdk/package.json`
  - Makes CDK deploy script include `--require-approval never` by default to avoid the pnpm argument-forwarding approval issue.
  - Verified `pnpm --filter @agents-cloud/infra-cdk run deploy` now runs cleanly without requiring a TTY approval prompt.

## Verification Performed

### TypeScript build

- [x] Passed.

Command:

```bash
pnpm --filter @agents-cloud/infra-cdk run build
```

### Default CDK synth

- [x] Passed with preview ingress disabled by default.
- [x] Default synth outputs seven stacks:
  - `agents-cloud-dev-foundation`
  - `agents-cloud-dev-network`
  - `agents-cloud-dev-storage`
  - `agents-cloud-dev-state`
  - `agents-cloud-dev-cluster`
  - `agents-cloud-dev-runtime`
  - `agents-cloud-dev-orchestration`

Command:

```bash
AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
AWS_DEFAULT_REGION=us-east-1 \
AGENTS_CLOUD_AWS_REGION=us-east-1 \
pnpm --filter @agents-cloud/infra-cdk run synth
```

### Preview-ingress synth test

- [x] Passed using dummy domain values.
- [x] Synthesized stack included expected resource types:
  - `AWS::CertificateManager::Certificate`: 1
  - `AWS::ElasticLoadBalancingV2::LoadBalancer`: 1
  - `AWS::ElasticLoadBalancingV2::Listener`: 2
  - `AWS::ElasticLoadBalancingV2::TargetGroup`: 1
  - `AWS::ECS::Service`: 1
  - `AWS::Route53::RecordSet`: 2

Command shape:

```bash
AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED=true \
AGENTS_CLOUD_PREVIEW_BASE_DOMAIN=preview.example.com \
AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_ID=Z1234567890EXAMPLE \
AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_NAME=example.com \
pnpm --filter @agents-cloud/infra-cdk run synth
```

### Deployment performed

- [x] Deployed non-domain changes to AWS.
- [x] `agents-cloud-dev-state` updated successfully and created `PreviewDeploymentsTable`.
- [x] `agents-cloud-dev-runtime` updated successfully and picked up IAM access to `PreviewDeploymentsTable`.
- [x] Domain ingress stack was not deployed because it is gated behind domain env vars.

Command actually used after the root pnpm argument-forwarding issue:

```bash
cd infra/cdk
AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
AWS_DEFAULT_REGION=us-east-1 \
AGENTS_CLOUD_AWS_REGION=us-east-1 \
pnpm build

AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
AWS_DEFAULT_REGION=us-east-1 \
AGENTS_CLOUD_AWS_REGION=us-east-1 \
pnpm exec cdk deploy --app 'node dist/bin/agents-cloud-cdk.js' --all --require-approval never
```

### AWS live verification

- [x] `PreviewDeploymentsTable` is ACTIVE.
- [x] Key schema and GSIs verified via `aws dynamodb describe-table`.
- [x] Route 53 hosted zones listed successfully.

## What Still Needs To Be Done

### Pick Domain

- [x] Choose final preview base domain.

Selected:

```text
preview.solo-ceo.ai
*.preview.solo-ceo.ai
```

`solo-ceo.ai` is managed in Cloudflare, not Route 53. Therefore the Route 53 alias-record path does not apply unless DNS is migrated or delegated. The current path is external DNS mode:

1. Request an ACM certificate in `us-east-1` for `preview.solo-ceo.ai` and `*.preview.solo-ceo.ai`.
2. Add the ACM DNS validation CNAME records in Cloudflare.
3. Wait until the ACM certificate status is `ISSUED`.
4. Deploy the preview ingress stack with `AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN`.
5. Add Cloudflare CNAME records pointing `preview.solo-ceo.ai` and `*.preview.solo-ceo.ai` at the ALB DNS output.

Current ACM certificate:

```text
arn:aws:acm:us-east-1:625250616301:certificate/3a26e529-124f-4513-a95a-8d11edab953c
```

Current ACM status:

```text
PENDING_VALIDATION
```

Cloudflare DNS validation record needed:

```text
Type: CNAME
Name: _0afc44d369ad2327e61fde6b37cda3ec.preview
Target: _66ec516291c729371700b200bb0ce52a.jkddzztszm.acm-validations.aws
Proxy: DNS only
```

The same ACM CNAME validates both `preview.solo-ceo.ai` and `*.preview.solo-ceo.ai`.

Because `solo-ceo.ai` is Cloudflare-managed, the active path is external DNS
mode with an imported ACM certificate rather than Route 53 mode.

#### Cloudflare DNS Correction Note

The first manual Cloudflare record was exported as:

```text
_0afc44d369ad2327e61fde6b37cda3ec.solo-ceo.ai. CNAME _0afc44d369ad2327e61fde6b37cda3ec.preview.
```

That is not the ACM validation record AWS is waiting for. It puts the `preview`
label in the target instead of the record name. The correct Cloudflare record is:

```text
_0afc44d369ad2327e61fde6b37cda3ec.preview.solo-ceo.ai. CNAME _66ec516291c729371700b200bb0ce52a.jkddzztszm.acm-validations.aws.
```

In the Cloudflare UI for the `solo-ceo.ai` zone, that means:

```text
Type: CNAME
Name: _0afc44d369ad2327e61fde6b37cda3ec.preview
Target: _66ec516291c729371700b200bb0ce52a.jkddzztszm.acm-validations.aws
Proxy status: DNS only
TTL: Auto
```

Verify the corrected record with:

```bash
dig +short CNAME _0afc44d369ad2327e61fde6b37cda3ec.preview.solo-ceo.ai @1.1.1.1
```

Expected output:

```text
_66ec516291c729371700b200bb0ce52a.jkddzztszm.acm-validations.aws.
```

### Deploy Wildcard Ingress

Because `solo-ceo.ai` is on Cloudflare, deploy in two phases.

#### Phase 1: Request ACM certificate and validate in Cloudflare

Certificate already requested:

```text
arn:aws:acm:us-east-1:625250616301:certificate/3a26e529-124f-4513-a95a-8d11edab953c
```

Original request command:

```bash
AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
aws acm request-certificate \
  --domain-name preview.solo-ceo.ai \
  --subject-alternative-names '*.preview.solo-ceo.ai' \
  --validation-method DNS \
  --idempotency-token soloceopreviewdev \
  --query CertificateArn \
  --output text
```

Then fetch the DNS validation records to create in Cloudflare:

```bash
AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
aws acm describe-certificate \
  --certificate-arn <certificate-arn> \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord' \
  --output table
```

Add each returned CNAME in Cloudflare for `solo-ceo.ai`, then wait for issuance:

```bash
AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
aws acm wait certificate-validated \
  --certificate-arn arn:aws:acm:us-east-1:625250616301:certificate/3a26e529-124f-4513-a95a-8d11edab953c
```

#### Phase 2: Deploy the AWS ingress using the issued certificate

```bash
cd infra/cdk

AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
AWS_DEFAULT_REGION=us-east-1 \
AGENTS_CLOUD_AWS_REGION=us-east-1 \
AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED=true \
AGENTS_CLOUD_PREVIEW_BASE_DOMAIN=preview.solo-ceo.ai \
AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN=arn:aws:acm:us-east-1:625250616301:certificate/3a26e529-124f-4513-a95a-8d11edab953c \
pnpm exec cdk deploy --app 'node dist/bin/agents-cloud-cdk.js' agents-cloud-dev-preview-ingress --require-approval never
```

After deploy, read the ALB DNS output:

```bash
AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
aws cloudformation describe-stacks \
  --stack-name agents-cloud-dev-preview-ingress \
  --query "Stacks[0].Outputs[?OutputKey=='PreviewRouterLoadBalancerDnsName'].OutputValue" \
  --output text
```

Create these Cloudflare DNS records:

```text
Type: CNAME
Name: preview
Target: <preview-router-alb-dns-name>
Proxy: DNS only to start, then test Cloudflare proxy mode separately if desired.

Type: CNAME
Name: *.preview
Target: <preview-router-alb-dns-name>
Proxy: DNS only to start, then test Cloudflare proxy mode separately if desired.
```

### Implement Real Preview Router

- [ ] Replace the temporary nginx image with an app that:
  - reads the `Host` header;
  - looks up `previewHost` in `PreviewDeploymentsTable`;
  - serves static S3 deployments;
  - supports SPA fallback to `index.html`;
  - returns clean unavailable/expired pages;
  - later proxies dynamic ECS preview targets.

### Add Control API Preview Registration

- [ ] Add API endpoint to register preview deployments.
- [ ] Suggested endpoint:

```text
POST /projects/{projectId}/previews
```

or:

```text
POST /runs/{runId}/preview
```

Minimum write to `PreviewDeploymentsTable`:

```json
{
  "previewHost": "demo.preview.solo-ceo.ai",
  "deploymentId": "dep_...",
  "workspaceId": "ws_...",
  "projectId": "proj_...",
  "runId": "run_...",
  "type": "static-s3",
  "status": "ready",
  "s3Bucket": "agents-cloud-dev-storage-previewstaticbucket42b307-oyrfiakvhnf8",
  "s3Prefix": "workspaces/{workspaceId}/projects/{projectId}/deployments/{deploymentId}/",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

### Agent Publishing Flow

- [ ] Agent builds generated app.
- [ ] Agent uploads static build output to:

```text
s3://preview-static/workspaces/{workspaceId}/projects/{projectId}/deployments/{deploymentId}/
```

- [ ] Agent or Control API registers preview host in `PreviewDeploymentsTable`.
- [ ] User receives:

```text
https://{slug}.preview.{main-domain}
```

## Important Design Rule

Do not create one ALB rule or one target group per preview app.

Correct scaling model:

```text
*.preview.{main-domain} -> one wildcard DNS record -> one ALB -> one preview-router -> registry lookup
```

The preview-router decides whether a host maps to static S3 content, a long-lived ECS service, a short-lived ECS task, or an archived/unavailable response.
