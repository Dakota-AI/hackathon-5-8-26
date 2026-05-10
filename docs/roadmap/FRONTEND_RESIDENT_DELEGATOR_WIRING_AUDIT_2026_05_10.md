# Frontend Resident Delegator Wiring Audit — 2026-05-10

## Scope

Audit whether the web and Flutter desktop/mobile clients are wired for the deployed ECS resident Codex 5.5 Agent Delegator flow.

Backend evidence from the deployed smoke path:

- `run.status` events: `queued`, `planning`, `running`, `succeeded`
- `agent.delegated`
- `artifact.created`
- main delegator `AgentInstances` row: `agent-delegator-codex-55`, provider `openai-codex`, model `gpt-5.5`

Expected near-term product events:

- `work_item.created`
- `work_item.assigned`
- `user.notification.requested`
- `user.call.requested`
- `webpage.published`

## Executive verdict

The frontends are partially wired, not fully glued together for the full resident-agent product experience.

Web is ready for the direct run lifecycle and artifact loop:

- create run
- fetch run
- poll run events
- subscribe to run realtime events
- render `run.status`
- render `artifact.created`
- show inline loading/error/done states

Flutter desktop/mobile is less ready for the deployed resident path:

- Cognito auth and Control API client methods exist.
- Work item/run/event/artifact HTTP methods exist.
- Local/mobile notification primitives exist.
- Realtime transport exists.
- But realtime is not connected to the work/run state model, notification service, or agent dashboard.
- Main agent roster/team UI is still mostly fixture-backed.

The biggest product gaps are:

1. `agent.delegated` is accepted as a raw event but not rendered as a meaningful delegation/team update in either client.
2. Child agents are not materialized in the dashboard because backend materialization is not done yet, and clients do not synthesize that from events.
3. `work_item.created` and `work_item.assigned` currently conflict with the shared protocol event-type regex because underscores are rejected.
4. Mobile notifications are local/demo-ready but not production push-ready for resident-run lifecycle events.

## Web audit

### Works

Files:

- `apps/web/lib/control-api.ts`
- `apps/web/lib/realtime-client.ts`
- `apps/web/lib/use-run-realtime-events.ts`
- `apps/web/lib/run-ledger.ts`
- `apps/web/components/app/hero-command-panel.tsx`
- `apps/web/components/app/runs-chat.tsx`

Confirmed wiring:

- `createControlApiRun` posts to `/runs` with `workspaceId`, `objective`, `idempotencyKey`, and bearer Cognito ID token.
- `getControlApiRun` fetches `/runs/{runId}`.
- `listControlApiRunEvents` fetches `/runs/{runId}/events`.
- Realtime client uses the deployed API Gateway contract:
  - websocket URL with `?token=<id token>`
  - subscribe message: `{ "action": "subscribeRun", "workspaceId": "...", "runId": "..." }`
- Realtime parser accepts generic run events with `runId`, `workspaceId`, `seq`, `type`, `createdAt`, `payload`.
- Run ledger de-duplicates and sorts events by sequence.
- `run.status` drives latest status and terminal polling behavior.
- `artifact.created` becomes a user-facing artifact card/event.
- Loading, submitting, error, signed-out, fixture/offline-ish, and empty states exist in the run/work surfaces.

Validation:

```bash
pnpm --filter @agents-cloud/web test -- realtime-client work-items admin-lineage
```

Result: 32 tests passed.

### Gaps

- No specialized web rendering for `agent.delegated`.
- No specialized web rendering for `work_item.created` or `work_item.assigned`.
- No specialized web rendering for `user.notification.requested`, `user.call.requested`, or `webpage.published`.
- No global toast/notification layer was found in the web app; status and errors are inline.
- AgentInstances/delegator rows are not exposed as a first-class user dashboard model in web.
- Preview URL UX is still incomplete for generated websites unless the artifact route provides and the UI explicitly renders `previewUrl`.

## Flutter desktop/mobile audit

### Works

Files:

- `apps/desktop_mobile/lib/backend_config.dart`
- `apps/desktop_mobile/lib/src/auth/auth_controller.dart`
- `apps/desktop_mobile/lib/src/api/control_api.dart`
- `apps/desktop_mobile/lib/src/realtime/realtime_client.dart`
- `apps/desktop_mobile/lib/src/data/http_work_repository.dart`
- `apps/desktop_mobile/lib/src/notifications/notification_service.dart`
- `apps/desktop_mobile/lib/src/notifications/background_reply.dart`
- `apps/desktop_mobile/lib/main.dart`

Confirmed wiring:

- Amplify/Cognito config is present.
- Auth controller fetches Cognito ID token for API calls.
- Control API wrapper supports:
  - list/get/create/update WorkItems
  - start WorkItem run
  - list runs
  - list events
  - list artifacts
  - get artifact download URL
- HTTP repository maps API WorkItem/run/event/artifact responses into Flutter UI summaries.
- Artifact download action calls the Control API and opens the presigned URL.
- Realtime client can connect to WebSocket with token and send `subscribeRun`.
- Local notification service initializes local notifications, iOS text-reply category, and local proactive banners.
- Background reply handler can persist a reply and call a configured Hermes/OpenAI-style text endpoint.
- Mobile responsive navigation test exists.

Validation:

```bash
cd apps/desktop_mobile
flutter analyze
flutter test test/widget_test.dart test/browser --reporter expanded
```

Result:

- `flutter analyze`: no issues.
- focused Flutter tests: 15 passed.

During audit, the assistant-control test path had drifted. I repaired the widget test timing/expectations so the current foreground control harness validates again.

### Gaps

- `subscribeRun` exists but is not used to update WorkItem/run/artifact state.
- Realtime events are only shown in a generic GenUI/event-tail area, not applied to the app model.
- `WorkItemRunStatus` lacks backend statuses such as `planning`, `waiting_for_approval`, `testing`, and `archiving`.
- Event decoding flattens events into `WorkItemEventSummary` and loses canonical fields like `runId`, `seq`, `source`, and full `payload`.
- `agent.delegated` is not rendered as a delegated helper/specialist agent or team event.
- Agent/team dashboard roster is fixture-backed; it does not list live AgentInstances.
- The primary command composer still contains mock/disabled actions rather than creating real work and runs end-to-end.
- Local notifications are not bound to backend lifecycle events.
- No APNs/FCM device-token registration or backend push-token path was found.
- No event-to-notification bridge was found for `run.status succeeded`, `artifact.created`, `agent.delegated`, `user.notification.requested`, or `user.call.requested`.
- Android inline reply is not wired; iOS local inline reply exists but is not production remote push.
- Background replies call direct configured LLM/Hermes endpoints, not the deployed resident ECS Control API run path.

## Shared protocol / contract audit

Files:

- `packages/protocol/src/events.ts`
- `packages/protocol/schemas/event-envelope.schema.json`
- `services/agent-runtime/src/resident-runner.ts`

Confirmed:

- `run.status` is fully typed.
- `artifact.created` is fully typed.
- `agent.delegated`, `user.notification.requested`, `user.call.requested`, and `webpage.published` pass the generic dotted event-type regex.

Critical gap:

- `work_item.created` and `work_item.assigned` are allowlisted by the resident runner, but the shared protocol regex rejects underscores.
- Current regex shape in `packages/protocol/src/events.ts` is dotted lowercase alphanumeric segments; underscore is invalid.
- Therefore a resident runner attempt to emit `work_item.created` through `buildCanonicalEvent` will fail unless the event name changes or the regex/schema changes.

Recommended fix:

- Prefer changing event names to dotted style for consistency:
  - `work.item.created`
  - `work.item.assigned`
- Or explicitly update the protocol regex and JSON schema to allow underscores, then add tests.

## Readiness matrix

| Capability | Web | Flutter desktop/mobile | Verdict |
| --- | --- | --- | --- |
| Auth for API | Yes | Yes | Mostly ready |
| Create direct run | Yes | API exists, primary UI not wired | Partial |
| WorkItem API | Yes | Yes | Partial, depends on backend materialization |
| Realtime subscribeRun | Yes | Transport exists, not state-applied | Partial |
| `run.status` | Rendered/applied | Generic/partial | Web ready, Flutter partial |
| `artifact.created` | Rendered/extracted | Generic + artifact endpoint | Partial |
| `agent.delegated` | Accepted, not rendered | Accepted, not rendered | Not product-ready |
| Child agent dashboard row | No | No | Not ready |
| Work item event stream | Not specialized | Not specialized | Not ready |
| Local loading/error/done states | Yes inline | Yes for auth/chat/work fetch | Partial |
| Web notifications/toasts | No | N/A | Not ready |
| Mobile local notifications | N/A | Local/demo yes | Demo-ready only |
| Mobile remote push | N/A | No | Not ready |
| User call/notification events | Accepted raw only | Accepted raw only | Not wired |

## Next implementation slice

1. Fix event naming/protocol first.
   - Decide `work.item.created` / `work.item.assigned` vs allowing underscores.
   - Add protocol tests and resident-runner tests.

2. Materialize delegation server-side.
   - `agent.delegated` should create/update child AgentInstance and WorkItem rows.
   - Clients should consume materialized rows, not invent durable state locally.

3. Add frontend semantic event reducers.
   - Web: update `run-ledger.ts`, `runs-chat.tsx`, and hero/event renderers for delegation/work/page/user-contact events.
   - Flutter: add canonical run event model and status/kind enums aligned to protocol.

4. Wire Flutter realtime into app state.
   - Subscribe to active run.
   - Merge events by `runId + seq`.
   - Update WorkItem run cards, artifact list, agent/team surface, and local notification service.

5. Wire mobile notification bridge.
   - Local immediate notification on foreground/background event receipt.
   - Backend push-token registration for real mobile remote notifications.
   - Map `user.notification.requested` and `user.call.requested` to NotificationService/CallKit flows.

6. Make agent/team dashboards live.
   - Add AgentInstances API or client endpoint if missing.
   - Web and Flutter should show the main delegator plus child/specialist agents once materialized.
