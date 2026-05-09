# ADR 0004: Workspace Storage

Date: 2026-05-09
Status: Accepted

## Context

Agents need a live filesystem for coding/building and durable storage for artifacts, reports, datasets, previews, event archives, and audit trails.

S3 is durable object storage, not a POSIX filesystem. EFS gives shared POSIX semantics but has cost and throughput tradeoffs.

## Decision

Use S3 as the durable workspace and artifact ledger.

Use EFS only for hot mounted workspaces that need POSIX semantics.

Split buckets by mutability:

- `workspace-live-artifacts`: mutable versioned workspace outputs.
- `workspace-audit-log`: append-only audit archive with Object Lock from creation.
- `preview-static`: static website preview outputs.
- `research-datasets`: curated research and eval corpora.

Use prefix and ABAC policies first. Add S3 Access Points for larger tenants or special policy boundaries when needed.

## Consequences

- Workspace state can be snapshotted and restored.
- Audit retention does not block normal mutable workspace workflows.
- EFS remains a performance/cost-sensitive hot layer, not the permanent record.
