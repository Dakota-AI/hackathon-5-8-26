# Surface: Approvals & Notifications

[← surfaces](README.md) · [wiki index](../README.md)

Two related concepts. Approvals exist as schema + table; routes don't. Notifications don't exist at any layer.

---

## Approvals

> Human-in-the-loop gates on tool calls.

### Schema — ✅

- `packages/protocol/schemas/events/tool-approval.schema.json`
- Discriminated union in `events.ts:18-37`:
  - `ToolApprovalRequestPayload`
  - `ToolApprovalDecisionPayload`
- Risk levels: `low / medium / high / critical`
- Builder: `buildToolApprovalEvent` at `events.ts:186-211`
- Examples: `packages/protocol/examples/tool-approval-{request,decision}-event.json`

### Storage — ✅

`ApprovalsTable` (`state-stack.ts:140-146`): partition `workspaceId`, sort `approvalId`. GSI `by-run-created-at`.

### Control API — ✅ implemented

`approvalsHandler` in `services/control-api/src/approvals.ts`. Routes:

| Method | Path | Notes |
|---|---|---|
| POST | `/approvals` | Create approval (typically called by worker emitting a `tool.approval` request) |
| GET | `/approvals` | List approvals (owner-scoped) |
| GET | `/runs/{runId}/approvals` | Owner-scoped approval list per run |
| POST | `/approvals/{approvalId}/decision` | Approve/reject decision endpoint — writes a `tool.approval` decision event |

Backed by `ApprovalStore` against `ApprovalsTable` (PK `workspaceId`, SK `approvalId`, GSI `by-run-created-at`).

### Worker output — ⚠️ harness only

- ✅ Local harness emits both `tool.approval` request and decision events (`local-harness.ts:365-400`) into EventsTable.
- ❌ The shipping `worker.ts` does not currently emit them — only `run.status` and `artifact.created`.
- ❌ The resident runner references approvals only as runtime state.

### Realtime — ✅ via EventsTable

`tool.approval` flows through EventsTable → DDB stream → relay. No dedicated subscription topic.

### Web UI — ✅ live (since commit `b515e14`)

- `apps/web/app/(console)/approvals/page.tsx` — `<ApprovalsBoard/>` route.
- `apps/web/components/app/approvals-board.tsx`:
  1. `listControlApiWorkItems({workspaceId, limit:25})`.
  2. Fan out to `listControlApiWorkItemRuns` → unique runIds (capped 50).
  3. Fan out to `listControlApiRunApprovals` per runId.
  4. Render each pending approval with risk pill, tool name, status, last-8 of runId, requested action, JSON `argumentsPreview`, optional reason.
  5. **Approve / Deny buttons POST `decideControlApiApproval({workspaceId, approvalId, decision})`.** Returned record replaces the row in state.
- ⚠️ "Request revision" button hard-disabled (no backend route).
- ⚠️ No reason input field (API accepts `reason`, UI doesn't collect it).
- Demo cards (`<DemoApprovals/>`) render for signed-out visitors.

### Flutter UI — ⚠️ fixture

`_ApprovalsPage` (`main.dart:1849-1856`) → `_ApprovalQueuePanel` (`main.dart:2296-2326`) renders two hardcoded `_ApprovalCard` widgets with disabled buttons.

### Approvals checklist

| Layer | Status |
|---|---|
| Schema | ✅ |
| Storage | ✅ |
| API | ✅ implemented |
| Worker | ⚠️ harness only (live worker doesn't emit `tool.approval` requests yet) |
| Realtime | ✅ (carries the event) |
| Web | ✅ ApprovalsBoard with Approve/Deny POST |
| Flutter | ⚠️ fixture (buttons disabled) |

### What needs to ship (only if demo storyline includes approvals)

- [x] ~~Add `ApprovalsStore` and routes~~ — done; `POST /approvals`, `GET /approvals`, `GET /runs/{runId}/approvals`, `POST /approvals/{approvalId}/decision` are live
- [x] ~~Implement `approvalsHandler`~~ — done
- [x] ~~Web Approvals UI with Approve/Reject POSTing decisions~~ — done at `/approvals`
- [ ] Have worker (or resident-runner) gate risky tool calls and emit `tool.approval` requests, mirroring `local-harness.ts:365`
- [ ] Add reason input to web ApprovalsBoard (API already accepts `reason`)
- [ ] (Flutter) replace fixture cards in `_ApprovalQueuePanel` with `controlApiProvider`-backed fetch

---

## Notifications

> User-visible alerts (push, email, badge counts).

### Status — entirely unscoped

| Layer | Status |
|---|---|
| Schema | 🔘 |
| Storage | 🔘 |
| API | 🔘 |
| Worker | 🔘 |
| Realtime | 🔘 |
| Web | 🔘 |
| Flutter | 🔘 (no notification surface) |

No notifications table in `state-stack.ts`. Whether this is intentional (folded into approvals + run-status) depends on planning docs but is not represented in code at all.

### Hackathon decision

🗑️ **Defer.** For the demo, derive notifications client-side from the existing event stream and add a header bell. Don't build a backend.

If first-class is wanted later:
- [ ] Add `NotificationsTable` to `state-stack.ts`
- [ ] Define `notification.created` in `packages/protocol/`
- [ ] Add `/notifications` routes

[→ approvals callout in artifacts.md](artifacts.md) · [→ runs-and-tasks](runs-and-tasks.md)
