# Runtime Autonomy And Event Policy

Workstream: Agent Harness
Date: 2026-05-10
Status: initial runtime contract

## Position

Agents Cloud should make agents as autonomous as possible inside a scoped
workspace, but the platform should gate actions that can cause meaningful harm,
spend, public exposure, user interruption, credential exposure, or irreversible
state changes.

The durable product ledger should not record every tool call. A long-running
agent may execute thousands of small reads, writes, searches, checks, retries,
and local commands. Persisting every one as a canonical event would make the
database noisy, expensive, and less useful.

## Durable Event Rule

Canonical durable events should represent product-significant transitions:

- run/task status changes,
- artifacts created or updated,
- approval requests and decisions,
- user-visible messages,
- user questions and answers,
- audio messages,
- call requests and call lifecycle changes,
- generated UI/surface changes,
- critical failures,
- cancellation,
- resume/recovery,
- budget or policy violations,
- profile materialization/promotion once those contracts exist.

Routine internal tool activity should stay out of the durable user/product event
ledger.

## Local Trace Rule

The runner may still keep local trace data for debugging and control:

- aggregate tool call counts,
- counts by tool ID,
- counts by status,
- current active tool,
- repeated error counters,
- stuck-loop indicators,
- last progress timestamp,
- optional sampled spans for debugging.

This trace should be local, bounded, sampled, or short-retention unless a
specific issue becomes product-significant. When it does become significant, the
runner emits a normal canonical event such as `run.status` with an error or a
future `agent.health`/`tool.policy` event.

## Approval Gates

Agents should not need approval for normal workspace work. They should require
approval or a pre-approved budget/policy for:

- deleting data,
- publishing publicly,
- sending email/messages to external people,
- initiating calls to users,
- spending money or credits,
- accessing sensitive credentials,
- changing permissions,
- modifying infrastructure,
- writing to source control,
- starting long-lived compute,
- any action explicitly blocked by user/org/workspace policy.

The model can propose these actions, but runtime policy enforces the gate.

## Autonomy Contract

The runner should make this explicit in state:

```json
{
  "policy": {
    "autonomy": "mostly_autonomous",
    "durableEventMode": "critical_only",
    "traceMode": "local_aggregate"
  }
}
```

The local harness now proves this behavior:

- internal planning/research/generation tools increment local aggregate metrics,
- they do not emit canonical `tool.call` events,
- approval-gated preview publishing emits `tool.approval`,
- artifacts emit `artifact.created`,
- status transitions emit `run.status`.

## Stuck Or Error Detection

Because routine tool calls are not durable events, the runner still needs health
controls:

- heartbeat with last progress time,
- active task count,
- active tool count,
- repeated error count,
- no-progress timeout,
- max tool calls per task or per time window,
- max spend/budget per task,
- cancellation flag,
- stale-runner detection.

When a threshold trips, the runner should emit a user/product-significant status
or failure event. The platform does not need every internal step to detect that
the runner is stuck.

## Database Implication

Persist these durably:

- canonical events,
- run/task status,
- artifact records,
- approval records,
- question/message/call records,
- snapshots,
- aggregate runner health/status,
- policy violations.

Do not persist every internal tool call by default.

Optional future storage:

- short-retention trace blob in S3,
- sampled traces for debugging,
- per-run aggregate metrics row,
- detailed trace only when debug mode is enabled.
