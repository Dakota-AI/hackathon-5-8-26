# Clients Current Plan

Workstream: Clients
Owner: Clients Workstream Agent
Updated: 2026-05-10
Status: Hidden Flutter WKWebView agent-control probe plus dev CLI bridge implemented

## Current Scope

Own the user-facing Agents Cloud experience across:

- `apps/web/` Next.js web app.
- `apps/desktop_mobile/` Flutter desktop/mobile app.
- client-facing roadmap/status docs.
- client expectations against shared protocol, Control API, realtime, artifact, approval, and generated UI contracts.
- future agent-controlled GenUI/client-control UX described in `docs/roadmap/AGENT_CONTROLLED_GENUI_ARCHITECTURE_AND_PHASE_PLAN_2026_05_10.md`, including Surface renderers, streaming patches, client observation, command application/rejection, user takeover states, and Flutter/mobile agent presence.
- This session adds clear/new-session controls to both web and mobile chat surfaces, with
  Hermes session state reset on mobile when users start a fresh chat.

This session is intentionally scope-first. The first required deliverable is this plan. Broad UI implementation should not start until this file exists and records current state, gaps, risks, dependencies, expected files, validation, and definition of done.

Out of scope for this workstream:

- AWS/CDK infrastructure implementation.
- server-side runtime/tool execution internals.
- realtime transport internals.
- server-side authorization rules beyond documenting client expectations.
- durable schema ownership except through agreed protocol changes.
- Production WebSocket/CLI browser-control transport. The current WKWebView
  control work has a development-only loopback WebSocket bridge and CLI probe;
  production auth/session policy is still future work.

## Current State

### Repository / worktree state

Start command run:

```bash
git status --short --branch
```

Observed state:

```text
## main...origin/main
 M AGENTS.md
 M docs/README.md
 M docs/adr/README.md
 M docs/roadmap/BEST_NEXT_STEPS_EXECUTION_PLAN.md
 M docs/roadmap/README.md
 M infra/cdk/src/stacks/control-api-stack.ts
 M services/control-api/src/dynamo-store.ts
 M services/control-api/src/handlers.ts
 M services/control-api/src/ports.ts
 M services/control-api/test/admin-runs.test.ts
 M services/control-api/test/create-run.test.ts
 M services/control-api/test/dynamo-store.test.ts
 M services/control-api/test/idempotency.test.ts
 M services/control-api/test/query-runs.test.ts
?? docs/adr/0009-proactive-communication-plane.md
?? docs/agent-workstreams/
?? docs/plans/2026-05-10-agent-creator-hermes-profiles-apify.md
?? docs/plans/2026-05-10-agent-creator-next-implementation-slices.md
?? docs/roadmap/AICALLER_IOS_FOUNDATION_AUDIT_2026_05_10.md
?? docs/roadmap/COMMUNICATION_EVENT_CONTRACTS_2026_05_10.md
?? docs/roadmap/PROACTIVE_COMMUNICATION_ARCHITECTURE_AUDIT_2026_05_10.md
?? docs/roadmap/PROACTIVE_COMMUNICATION_REMAINING_WORK_2026_05_10.md
?? docs/roadmap/VOICE_CALL_AUDIO_MESSAGE_ARCHITECTURE_2026_05_10.md
?? docs/roadmap/WORKITEM_CONTROL_API_IMPLEMENTATION.md
?? docs/roadmap/WORKITEM_CONTROL_API_PROGRESS_HANDOFF_2026_05_10.md
?? services/control-api/src/work-items.ts
?? services/control-api/test/work-items.test.ts
```

Client-owned diff inspection:

```bash
git diff --name-status -- apps/web apps/desktop_mobile docs/agent-workstreams/clients docs/roadmap/WEB_APP_STATUS.md docs/roadmap/DESKTOP_MOBILE_BOILERPLATE_STATUS.md docs/roadmap/DESKTOP_MOBILE_IMPLEMENTATION_PLAN.md docs/roadmap/SHADCN_FLUTTER_UI_SYSTEM.md docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md
git status --short -- apps/web apps/desktop_mobile docs/agent-workstreams/clients docs/roadmap/WEB_APP_STATUS.md docs/roadmap/DESKTOP_MOBILE_BOILERPLATE_STATUS.md docs/roadmap/DESKTOP_MOBILE_IMPLEMENTATION_PLAN.md docs/roadmap/SHADCN_FLUTTER_UI_SYSTEM.md docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md
```

Observed client-owned status before writing this plan:

```text
?? docs/agent-workstreams/clients/
```

No active diffs were observed in `apps/web/` or `apps/desktop_mobile/` at the time of planning. There are many non-client backend/infra/docs changes in the working tree. Do not overwrite or revert them.

### What is implemented in web

Location: `apps/web/`

Current implementation shape:

- Next.js App Router app with static export constraints for current Amplify static `WEB` hosting.
- Root page routes through `components/host-routed-home.tsx`:
  - normal host -> `CommandCenter`.
  - `admin.solo-ceo.ai` -> `AdminConsole`.
- Amplify Authenticator wraps normal and admin surfaces unless local dev auth bypass is enabled.
- `components/command-center.tsx` is the normal user surface.
- `components/admin-console.tsx` is an admin/operations surface.
- `lib/control-api.ts` has typed helpers for current run-centric Control API routes:
  - create run.
  - get run.
  - list run events.
  - list admin runs.
  - list admin run events.
  - mock mode for local/self-test behavior.
- `lib/realtime-client.ts` exists and the command center can open an AWS-native WebSocket when `NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL` is configured.
- `lib/run-ledger.ts` reduces run events into user-facing run ledger state and artifact cards.
- Tests exist for run ledger behavior, realtime client parsing, auth storage/session reset, and admin lineage.
- The normal command center is now minimal and chat/workflow oriented: a user submits an objective, the app creates a run, polls durable events, optionally listens to realtime, and renders friendly assistant/status messages plus generated artifacts.
- The admin surface separately exposes operational lineage and failure watch, keeping debug/admin concepts out of the default user UI.

Current web limitations:

- The normal user surface is still run-first, not WorkItem-first.
- There is no `/work` app surface yet.
- No WorkItem list/detail UI exists in web.
- No typed WorkItem client methods exist in `apps/web/lib/control-api.ts` yet.
- No WorkItem fixture repository/adaptor boundary exists yet.
- Generated UI rendering is not implemented beyond planned/placeholder docs; no server-validated Surface renderer exists in web.
- Artifact browsing is event-card based, not a real artifact API/browser/download flow.
- Approval UI is not connected to real approval APIs.
- Empty/loading/error/reconnect states exist for parts of the run flow, but WorkItem-level empty/loading/error/denied/offline/stale states do not exist.

### What is implemented in Flutter

Location: `apps/desktop_mobile/`

Current implementation shape:

- Flutter desktop/mobile app using `shadcn_flutter` as the primary UI system.
- `lib/main.dart` is still a large monolithic app file.
- `lib/backend_config.dart` contains Amplify/Cognito config constants and a minimal `ControlApiClient.createRun` helper.
- Responsive shell exists:
  - desktop sidebar/topbar layout.
  - compact mobile topbar/bottom-nav layout.
- Current pages:
  - Command Center.
  - Runs.
  - Agents & Teams.
  - Artifacts.
  - Miro Boards.
  - Approvals.
- Current UI surfaces include:
  - command composer mock.
  - metrics strip.
  - live run timeline fixture.
  - local GenUI `SurfaceController` seeded with `BasicCatalogItems.asCatalog()`.
  - shadcn-native chat/timeline fixture.
  - run ledger fixture.
  - artifact gallery fixture.
  - Markdown report viewer via `markdown_widget`.
  - embedded browser preview shell placeholder.
  - approval queue fixture.
- Widget tests cover boot/navigation/mobile/artifact/Markdown/browser surfaces.

Current Flutter limitations:

- WorkItems now have a tested client-side domain model and fixture repository under `apps/desktop_mobile/lib/src/`, but they are not yet rendered as the primary object in the Flutter UI.
- A first repository/domain-model split exists for WorkItem groundwork; the visible UI is still mostly hardcoded fixture widgets in `main.dart`.
- No real authenticated session flow is exposed to the user despite backend config constants being present.
- Control API integration is only a minimal helper and not wired into UI state.
- Realtime is not wired.
- Artifact, approval, generated surface, offline, denied, reconnecting, stale-state behavior is fixture/placeholder only.
- The app currently shows status labels such as Control API configured/live that may overstate actual native client wiring. This should be made honest as client data binding is added.

## Gaps

### Product / UX gaps

- WorkItems are not yet the primary user-facing object in either client.
- Users cannot browse a durable WorkItem list/inbox/board.
- Users cannot open one WorkItem and see runs, ordered events, artifacts, approvals, and generated surfaces together.
- Normal web UX still starts from a single objective/run composer rather than a durable work object surface.
- Flutter UX is impressive as a shell but is fixture-heavy and monolithic.
- Web and Flutter concepts are not aligned around a shared client domain model yet.
- Client surfaces do not yet communicate backend missing states cleanly at WorkItem level.

### API / data gaps

- WorkItem backend APIs are in transition. Infrastructure route skeletons exist, and a local backend handoff doc exists, but Clients should not depend on those routes being fully production-ready yet.
- No shared protocol schemas for client WorkItem, Artifact summary, Approval request, DataSourceRef, or Surface payloads are available for UI consumption.
- Existing web client types are local TypeScript shapes, not imported/generated from `packages/protocol`.
- Flutter client has no shared contract consumption path yet.
- Artifact browser/download and approval decision APIs are not usable from clients yet.
- Generated Surface contracts and validation outputs are not finalized for client renderers.
- Agent-controlled UI contracts are not defined yet: clients need observation snapshots, command envelopes/results, control lease states, user takeover events, and a platform capability matrix before the main agent can safely drive web/desktop/mobile surfaces.

### State coverage gaps

Need fixture/test coverage for:

- empty WorkItem list.
- loading WorkItems.
- WorkItem load failure.
- permission denied / not found.
- offline / API not configured.
- realtime connecting / live / reconnecting / stale.
- WorkItem with no runs yet.
- WorkItem with active run.
- WorkItem with terminal failed run.
- WorkItem with artifacts but no generated surface.
- WorkItem requiring approval.
- invalid generated UI payload rejected safely.

## Risks

### UX/product risks

- Building more run-centric UI will delay the shift to WorkItems as the actual product object.
- Exposing debug/admin concepts in the normal user UI would make the product feel like an infra dashboard instead of a CEO-grade work OS.
- Fixture UI can look complete while backend contracts remain unfinished. Keep fixture-backed surfaces honest in code and docs.
- Flutter status pills currently imply live backend readiness; this risks confusing users until real native auth/API/realtime paths are wired.
- Adding full Kanban drag/drop too early would spend effort on interaction mechanics before WorkItem detail and data model are useful.

### Technical risks

- Web static export means direct dynamic routes need care. A client-routed Work page or statically exported path is safer than server routes while Amplify remains static `WEB` hosting.
- WorkItem Control API is not fully stable/deployed as product logic. Client should use fixture/adaptor boundary first.
- Web and Flutter may diverge if each invents separate WorkItem/artifact/approval payload shapes.
- Generated UI rendering is unsafe unless tied to server-validated, allowlisted Surface payloads.
- Client-control will become unsafe if implemented as broad remote-control primitives; it must remain an allowlisted command protocol with client-side validation, explicit control leases, user takeover/yield behavior, and main-agent-only authority.
- Current Flutter monolithic `main.dart` increases risk of broad, conflicting edits. Client slices should either be small targeted patches or first create a tested domain/repository layer before large refactors.

## Files Expected To Change

Smallest next client slice should avoid backend/infra files and stay in client-owned paths.

Expected web files for the recommended next slice:

- Create: `apps/web/lib/work-items.ts` ✅ implemented
- Create: `apps/web/test/work-items.test.ts` ✅ implemented
- Create or modify: `apps/web/components/work-dashboard.tsx` ✅ implemented as combined WorkItem list/detail surface
- Create or modify later: `apps/web/components/work-board.tsx`
- Create or modify later: `apps/web/components/work-item-detail.tsx`
- Modify: `apps/web/components/command-center.tsx` or `apps/web/components/host-routed-home.tsx` to make WorkItems primary in normal UX ✅ `command-center.tsx` now renders WorkItems before the composer
- Modify: `apps/web/app/page.tsx` only if needed to route the static-export-compatible Work shell
- Modify: `apps/web/app/globals.css` for dense WorkItem layout states ✅ implemented
- Modify: `docs/agent-workstreams/clients/CURRENT_PLAN.md` ✅ updated with implementation progress

Potential later Flutter files:

- Create: `apps/desktop_mobile/lib/src/domain/work_item_models.dart` ✅ implemented
- Create: `apps/desktop_mobile/lib/src/data/fixture_work_repository.dart` ✅ implemented
- Create: `apps/desktop_mobile/test/domain/work_item_models_test.dart` ✅ implemented
- Create: `apps/desktop_mobile/test/data/fixture_work_repository_test.dart` ✅ implemented
- Modify later: `apps/desktop_mobile/lib/main.dart` only after the tested model/repository boundary exists
- Modify: `apps/desktop_mobile/test/widget_test.dart`

Current WKWebView browser-control files:

- `apps/desktop_mobile/packages/webview_flutter_wkwebview/`: local fork of
  `webview_flutter_wkwebview` v3.25.1.
- `apps/desktop_mobile/pubspec.yaml` and `pubspec.lock`: override the endorsed
  WKWebView package to the local fork.
- `apps/desktop_mobile/lib/src/browser/agent_browser_control.dart`: typed
  DOM-first control bridge and JS bootstrap.
- `apps/desktop_mobile/lib/src/browser/agent_browser_protocol.dart`: wire-shaped
  request/response/logging protocol shared by the hidden bridge and tests.
- `apps/desktop_mobile/lib/src/browser/agent_browser_websocket_bridge.dart`:
  opt-in loopback WebSocket bridge for development probes.
- `apps/desktop_mobile/tool/agent_browser_bridge_probe.dart`: CLI smoke probe
  for driving the hidden bridge.
- `apps/desktop_mobile/test/browser/agent_browser_control_test.dart`: command
  parsing/script-generation/protocol tests.
- `apps/desktop_mobile/lib/main.dart`: Browser page keeps the bridge hidden,
  installs it into the WKWebView, and optionally starts the dev loopback bridge.
- `docs/roadmap/FLUTTER_WKWEBVIEW_AGENT_CONTROL_AUDIT_2026_05_10.md`: package
  audit, fork delta, limits, and deferred native sidecar work.

Files to avoid in this workstream unless a handoff explicitly requests a contract change:

- `infra/cdk/**`
- `services/control-api/**`
- `services/agent-runtime/**`
- `services/realtime-api/**`
- `infra/cloudflare/**`

## Cross-Workstream Dependencies

- Dependency: stable WorkItem API response shapes and deployed behavior for base list/detail/create routes.
  Owning workstream: Infrastructure / backend Control API implementer.
  Handoff file: none created yet in this session; use existing `docs/roadmap/WORKITEM_CONTROL_API_PROGRESS_HANDOFF_2026_05_10.md` as background. Create a formal handoff if client implementation needs a route guarantee.

- Dependency: canonical WorkItem, Artifact summary, Approval request, DataSourceRef, Surface, and generated UI payload schemas.
  Owning workstream: Product Coordination + Agent Harness + backend/protocol owner.
  Handoff file: create when the client slice must consume or validate a new shape.

- Dependency: websocket subscribe/replay/reconnect semantics for WorkItem-scoped timelines.
  Owning workstream: Realtime Streaming.
  Handoff file: create before wiring WorkItem realtime beyond placeholder states.

- Dependency: artifact metadata shape and signed-open/download URL rules.
  Owning workstream: Agent Harness + Infrastructure.
  Handoff file: create before real artifact browser/download UI.

- Dependency: approval payload shape and decision API.
  Owning workstream: Agent Harness + Product Coordination + backend.
  Handoff file: create before real approval decisions.

## Implementation Plan

### Recommended smallest next client slice: fixture-backed web Work page/surface

Goal: make WorkItems visible as the primary product object without waiting for unfinished backend APIs.

1. Add a local WorkItem view-model/reducer module in `apps/web/lib/work-items.ts`.
   - Include fixture data for several WorkItems.
   - Include runs/events/artifacts/approvals/surface summaries under each WorkItem.
   - Include explicit state helpers for empty/loading/error/denied/offline/stale.
   - Keep these as client view models, not durable backend schemas.

2. Add tests in `apps/web/test/work-items.test.ts`.
   - Verify WorkItems sort by updated time / priority.
   - Verify detail aggregation counts runs, events, artifacts, approvals, surfaces.
   - Verify state helpers return correct user-facing labels.
   - Verify invalid/unknown generated surface records are not rendered as trusted UI.

3. Build a dense WorkBoard / WorkList component.
   - Show WorkItems as primary rows/cards.
   - Columns or groups can be simple status groupings: Active, Waiting, Review, Done.
   - No drag/drop in this slice.
   - Include empty/loading/error/denied/offline placeholders.

4. Build a WorkItem detail component.
   - Header: objective, status, priority, owner, updated time.
   - Run ledger preview: ordered events, terminal state, stale/reconnecting placeholder.
   - Artifacts panel: report/website/diff/log cards without raw S3 URI exposure.
   - Approvals panel: pending/resolved cards with disabled actions until API exists.
   - Generated surfaces panel: constrained Surface preview placeholder, not arbitrary HTML/React.

5. Make the normal web first screen WorkItem-first.
   - Prefer integrating WorkBoard + detail into `CommandCenter` as the first screen rather than adding a hidden route.
   - Keep the objective composer but make it a way to create/start a WorkItem, not the whole product surface.
   - If adding a path, keep static-export constraints in mind.

6. Update this plan with progress, exact files touched, validation output, and any handoffs needed.

### Later web slices

1. Add typed Control API WorkItem methods behind the same adapter once backend routes are stable.
2. Replace fixtures with live list/detail calls while keeping fixtures for tests/self-test.
3. Add WorkItem-linked run creation from the composer.
4. Add artifact browsing/download once API exists.
5. Add approval actions once API exists.
6. Add server-validated Surface renderer once protocol exists.
7. Add WorkItem realtime subscribe/backfill behavior.

### Later Flutter parity slices

1. Add WorkItem domain models and fixture repository with tests.
2. Add WorkBoard and WorkItem detail page backed by the fixture repository.
3. Keep visual language aligned with web concepts.
4. Only then wire native Control API/auth/realtime methods.
5. Refactor `main.dart` gradually into feature files as tests protect behavior.

## Validation Plan

For this planning-only update:

```bash
git diff --check -- docs/agent-workstreams/clients/CURRENT_PLAN.md
git status --short -- docs/agent-workstreams/clients/CURRENT_PLAN.md
```

For the recommended web slice:

```bash
pnpm web:typecheck
pnpm web:test
pnpm web:build
```

If the web slice affects shared payload assumptions:

```bash
pnpm contracts:test
```

If Flutter changes are made later:

```bash
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

Optional web browser dogfood after implementation:

```bash
pnpm web:dev
```

Then open local web, inspect the browser console, and verify the first screen presents WorkItems as the primary product object.

## Progress Log

- 2026-05-10: Read required workstream docs in order: `AGENTS.md`, workstream README files, coordination protocol, start prompt template, remaining work audit, web status, Flutter status/plan, shadcn Flutter UI rules, and Amplify Next frontend plan.
- 2026-05-10: Ran `git status --short --branch`; working tree has many unrelated backend/infra/docs changes. No app code diff was found in `apps/web` or `apps/desktop_mobile` before this planning update.
- 2026-05-10: Audited current web app files: `command-center.tsx`, `admin-console.tsx`, `host-routed-home.tsx`, `control-api.ts`, `run-ledger.ts`, fixtures, and tests.
- 2026-05-10: Audited current Flutter files: `main.dart`, `backend_config.dart`, and widget tests.
- 2026-05-10: Created this Clients current plan. No broad UI work had started yet.
- 2026-05-10: Implemented the first fixture-backed web WorkItem slice in client-owned files only: `apps/web/lib/work-items.ts`, `apps/web/test/work-items.test.ts`, `apps/web/components/work-dashboard.tsx`, `apps/web/components/command-center.tsx`, and `apps/web/app/globals.css`.
- 2026-05-10: Added TDD coverage for WorkItem ordering, summary/detail aggregation, loading/empty/denied/offline/stale view states, status labels, and fail-closed generated-surface validation.
- 2026-05-10: Verified the web slice with `pnpm web:typecheck`, `pnpm web:test`, and `pnpm web:build`. Also dogfooded locally with dev auth bypass at `http://localhost:3002`; page title was `Agents Cloud`, first screen showed the WorkItem dashboard, and browser console reported 0 JavaScript errors.
- 2026-05-10: Used subagents to audit Flutter `shadcn_flutter` conventions and confirm the safest next slice should preserve the current dark neutral shadcn shell with no major visual changes.
- 2026-05-10: Added Flutter WorkItem domain models and a fixture repository under `apps/desktop_mobile/lib/src/` with tests under `apps/desktop_mobile/test/domain/` and `apps/desktop_mobile/test/data/`. No visible Flutter UI or navigation changes were made in this groundwork slice.
- 2026-05-10: Implemented the first visible Flutter WorkItem UI inside the existing shadcn shell. `apps/desktop_mobile/lib/main.dart` now renders a fixture-backed Work board above the command composer with a delegated-work queue, selected WorkItem detail, event timeline, artifact list, disabled approval action, and validated generated-surface preview placeholder. `apps/desktop_mobile/test/widget_test.dart` verifies the WorkItem UI is visible and updates the existing command-center smoke test to scroll to lower GenUI/run panels after the Work board becomes the first screen.
- 2026-05-10: Verified the Flutter UI slice with `dart format lib test`, `flutter analyze`, `flutter test`, and `flutter build macos --debug`, then launched `apps/desktop_mobile/build/macos/Build/Products/Debug/desktop_mobile.app` for hands-on testing.
- 2026-05-10: Applied a Paperclip-style Flutter shell cleanup based on user feedback: removed exposed auth/API/GenUI status clutter, removed the CEO command-center title, added a collapsible shadcn sidebar with tooltips, added first-class GenUI Lab, Browser, and UI Kit pages, embedded a WebView-backed preview browser for generated domains, and hid the macOS title text with a transparent full-size titlebar. Verified with `dart format lib test`, `flutter analyze`, `flutter test`, `plutil -lint macos/Runner/Info.plist`, and `flutter build macos --debug`, then relaunched the debug app.
- 2026-05-10: Reworked the Flutter GenUI/browser slice from scaffold previews into working package-backed UI after package research. Added `fl_chart` and `webview_flutter_wkwebview`, wired a WKWebView-backed HTTPS browser with URL entry, load, reload, back, navigation status, widget-test fallback, and macOS network-client entitlements. Added real `fl_chart` line/bar/pie widgets to GenUI Lab and seeded an actual `genui.SurfaceController`/`genui.Surface` with local A2UI component messages. Updated widget tests to assert the working chart, GenUI, and browser controls. Verified with `dart format lib test`, `flutter analyze`, `flutter test`, `plutil -lint macos/Runner/DebugProfile.entitlements macos/Runner/Release.entitlements macos/Runner/Info.plist`, and `flutter build macos --debug`, then relaunched the debug app and captured `/tmp/agents_cloud_after_final.png` for visual audit. Remaining visible UX issues from screenshot audit: fixture copy still feels internal, compact icon rail depends on tooltips for discoverability, app preview was partially obstructed by a macOS local-network prompt, and the current viewport did not show charts/browser without navigation.
- 2026-05-10: Audited upstream `webview_flutter_wkwebview` v3.25.1 from the Flutter packages repository, then vendored a minimal local fork under `apps/desktop_mobile/packages/webview_flutter_wkwebview`.
- 2026-05-10: Added the fork-only `WebKitWebViewController.addUserScript(...)` helper so app code can install a document-start `WKUserScript` without importing generated WebKit internals.
- 2026-05-10: Implemented `AgentBrowserControl`, a DOM-first command bridge for snapshot/markdown-ish extraction, visible element discovery, find, scroll, click, and fill. Raw eval remains intentionally absent.
- 2026-05-10: Added then removed the visible Browser page "Agent browser bridge" panel after user feedback. The Browser page now keeps the control bridge hidden and preserves the normal embedded-browser UI.
- 2026-05-10: Added structured command/protocol logging, an opt-in loopback WebSocket bridge behind `AGENTS_CLOUD_BROWSER_BRIDGE=true`, and `tool/agent_browser_bridge_probe.dart` for CLI smoke testing against the hidden bridge.
- 2026-05-10: Verified the hidden bridge against a live compiled macOS app binary on port `48767`; the CLI probe loaded the smoke page and passed observe/find/fill/click/confirm/scroll plus `run_smoke` (`7/7`).
- 2026-05-10: Verified the slice with `flutter analyze`, `flutter test`, `flutter build macos --debug`, `flutter build ios --release --config-only --no-codesign`, and targeted `git diff --check`.

## Completion Criteria

For this planning session:

- `docs/agent-workstreams/clients/CURRENT_PLAN.md` exists and follows `CURRENT_PLAN_TEMPLATE.md`.
- Plan records current web state, current Flutter state, missing work, UX risks, dependencies, expected files, validation commands, and definition of done.
- Plan identifies the smallest next client slice.
- Planning doc passes whitespace validation.
- No unrelated backend/infra/client files are overwritten or reverted.

Definition of done for the next implementation session:

- WorkItems become visible as the primary normal-user web object, at least fixture-backed.
- WorkItem detail shows runs, ordered events, artifacts, approvals, and generated surface placeholders.
- Empty/loading/error/denied/offline/stale states are real in the component model and covered by tests.
- `pnpm web:typecheck`, `pnpm web:test`, and `pnpm web:build` pass.
- Any unresolved backend/realtime/protocol needs are documented as handoff files.
