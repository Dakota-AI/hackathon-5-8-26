# Idempotency Reference

[← reference](README.md) · [wiki index](../README.md) · related: [run-creation flow](../flows/run-creation.md), [control-api](../services/control-api.md)

> How `POST /runs` and `POST /work-items` deduplicate retries. Two layers: DynamoDB scope check + Step Functions execution name.

---

## The idempotency scope

```
idempotencyScope = `${userId}#${workspaceId}#${idempotencyKey}`
```

Stored as a top-level attribute on Run and WorkItem rows. Indexed via GSI `by-idempotency-scope`.

The client provides `idempotencyKey` in the request body. The server prepends `userId` (from JWT) and `workspaceId` so that the same key from different users or workspaces is not collapsed.

---

## `POST /runs` flow

`services/control-api/src/create-run.ts:32-56`:

```
1. Build idempotencyScope.
2. Query runsTable.GSI(by-idempotency-scope, idempotencyScope, limit 1).
3. If a row exists:
   a. If row has executionArn:
      → return 202 with existing run (full idempotent hit).
   b. If row exists but no executionArn:
      → restart Step Functions, patch row with new executionArn.
4. Otherwise: TransactWrite RUNS + TASKS + EVENTS(seq=1) with attribute_not_exists(runId).
   → Then StartExecution Step Function.
```

The `attribute_not_exists` condition on the TransactWrite is a second guard against simultaneous duplicate writes — even if two concurrent requests pass the idempotency probe, only one TransactWrite succeeds.

---

## Step Functions name = runId

`services/control-api/src/step-functions.ts:18-39`:

```
StartExecutionCommand({
  stateMachineArn,
  name: input.runId,   // ← uses runId as name
  input: JSON.stringify(input)
})
```

Step Functions execution names are unique per state machine for ~90 days. A second `StartExecution` with the same name throws `ExecutionAlreadyExists` — a third idempotency layer that catches retries even after the DDB row was patched but Step Functions wasn't.

---

## Web idempotency key

`apps/web/lib/control-api.ts:515` `stableBrowserIdempotencyKey`:

```
key = `web-${base36(Date.now())}-${rolling32bitHash(workspaceId + ":" + objective.slice(0, 96))}`
```

Same objective + workspace within the same millisecond → same key. Collision resolved server-side via `(userId, workspaceId, key)` scope. Different users typing the same objective at the same instant don't collide.

---

## What can still go wrong

- **Lambda restarts mid-run.** If Control API Lambda starts the SFN execution but crashes before patching the row, the DDB row has no `executionArn`. A retry (step 3b) will start a NEW execution, but Step Functions guards on `name=runId` so the second `StartExecution` throws `ExecutionAlreadyExists`. The handler must handle that error gracefully — the current code does.

- **Worker retries.** Step Functions `runTask.sync` will retry on Fargate failures (default behavior). The worker writes events at hardcoded `seq=2,3,4`. The `EventsTable` `attribute_not_exists(runId, seq)` conditional check causes a retried task to crash. ⚠️ This is an idempotency bug — retries are not handled. See [agent-runtime](../services/agent-runtime.md).

- **Realtime relay retries.** `DynamoEventSource` has `retryAttempts: 3`. Repeat deliveries on the same stream record can re-broadcast an event to clients. Web client `mergeRunEvents` deduplicates by `id` so this is harmless.

---

## `POST /work-items` flow

`services/control-api/src/work-items.ts` follows the same pattern: hash → GSI probe → conditional write. Same scope key, same `attribute_not_exists` condition.

`POST /work-items/{id}/runs` re-uses `create-run.ts` so its idempotency is the same.

---

## Other endpoints

- `POST /runner-hosts`, `POST /user-runners`, `POST /agent-profiles/drafts` — **no idempotency** (just creates rows; relies on application-level dedup or accepts duplicates).
- `POST /user-runners/{runnerId}/heartbeat` — idempotent by virtue of being an UpdateCommand on a fixed key.

[← reference](README.md) · [→ run-creation flow](../flows/run-creation.md)
