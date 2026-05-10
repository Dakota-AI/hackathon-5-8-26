# Local Runtime Testing Playbook

Workstream: Agent Harness
Date: 2026-05-10
Status: initial executable test harness

## Purpose

This playbook documents how to test the agent runtime as a user-facing local
resident runner instead of only checking that an ECS smoke worker starts.

The current implementation is deterministic and no-network. It does not call
real Hermes, OpenAI, MCP, Apify, Miro, GitHub, Cloudflare, or AWS services. It
proves the runtime control loop shape:

```text
user objective
  -> local resident runner
  -> manager and specialist logical agents
  -> user question
  -> approval gate
  -> artifact creation
  -> canonical events
  -> inspectable runner state
```

## CLI Commands

Build and run the local harness:

```bash
pnpm agent-runtime:local -- run \
  --objective "Create a stock dashboard preview site and concise report" \
  --agent-role "Coder Agent" \
  --answer "Keep it concise and ask before publishing." \
  --approve-preview approved \
  --print-inspection
```

Run it interactively:

```bash
pnpm agent-runtime:local -- run --interactive
```

Inspect a generated run:

```bash
pnpm agent-runtime:local -- inspect \
  --root .agents/local-runs/<run-id>
```

Machine-readable output:

```bash
pnpm agent-runtime:local -- run \
  --objective "Create a competitor dashboard" \
  --approve-preview approved \
  --json
```

## Docker Command

After building the image, override the one-shot ECS command with the local CLI:

```bash
pnpm agent-runtime:docker:build

pnpm agent-runtime:docker:harness -- run \
  --objective "Create a stock dashboard preview site" \
  --approve-preview approved \
  --json
```

The image default command remains the deployed one-shot worker entrypoint. The
local CLI is intentionally explicit so it does not change ECS smoke behavior.

## What To Inspect

Each local run writes:

```text
events.ndjson
runner-state.json
transcript.md
artifacts/<artifact-id>/...
```

The most important checks:

- `events.ndjson` has ordered canonical events with deterministic sequence
  numbers.
- `runner-state.json` shows runner mode `resident-dev`, logical agents, tasks,
  tools, approvals, wait states, artifacts, and final status.
- `transcript.md` shows the user-facing conversation flow.
- report artifacts are always created after approval handling.
- website artifacts are created only when preview approval is approved.

## User Scenarios

### Approved Preview

```bash
pnpm agent-runtime:local -- run \
  --objective "Create a product launch dashboard" \
  --approve-preview approved \
  --print-inspection
```

Expected:

- final status `succeeded`,
- `tool.approval` request and approved decision events,
- report artifact,
- website artifact with preview URL,
- no wait states.

### Pending Approval

```bash
pnpm agent-runtime:local -- run \
  --objective "Create a website preview but wait for approval" \
  --approve-preview pending \
  --print-inspection
```

Expected:

- final status `waiting_for_approval`,
- `tool.approval` request event,
- one persisted wait state,
- no artifacts created after the blocked approval point.

### Rejected Approval

```bash
pnpm agent-runtime:local -- run \
  --objective "Create a public website preview" \
  --approve-preview rejected \
  --print-inspection
```

Expected:

- final status `succeeded`,
- `tool.approval` request and rejected decision events,
- report artifact,
- no website artifact,
- transcript explains preview publishing was skipped.

## Validation

Run:

```bash
pnpm contracts:test
pnpm agent-runtime:test
pnpm agent-runtime:build
docker build -f services/agent-runtime/Dockerfile -t agents-cloud-agent-runtime:local .
```

The runtime tests cover:

- approved workflow,
- pending approval wait state,
- rejected approval behavior,
- CLI run and inspect commands.

## Current Limits

- The harness uses a synthetic run because canonical protocol envelopes still
  require `runId`.
- It simulates manager/specialist agents deterministically rather than running a
  model loop.
- It uses local files instead of S3/DynamoDB.
- It does not yet restore from snapshots.
- It does not yet process multiple inbox items.
- It does not yet materialize real Agent Workshop profile bundles.
- It does not yet test actual MCP/Apify/Miro/GitHub adapters.

These are intentional limits for the first executable slice. The next slices
should replace deterministic internals one boundary at a time while preserving
the same CLI and tests.
