# Desktop and Mobile Implementation Plan

_Last updated: 2026-05-09_

This is the task-by-task implementation plan for turning the local Flutter
boilerplate into the production desktop and mobile app. The
current scaffold exists under `apps/desktop_mobile`, but backend auth,
Control API, Cloudflare realtime, notifications, and production A2UI event
streams are not wired yet.

**Goal:** Build the desktop and mobile app for Agents Cloud so users can issue CEO-level commands, watch autonomous agent teams live, approve actions, and open artifacts/previews.

**Architecture:** Flutter owns the native shell and validated GenUI rendering. Amplify/Cognito provides auth, Control API owns durable run/artifact/approval state, and Cloudflare Durable Objects provide synchronized realtime events across desktop/mobile/web. Agents emit declarative A2UI/GenUI packets only; clients render approved components.

**Tech Stack:** Flutter 3.41, Dart 3.11, shadcn_flutter, flutter_riverpod, genui/A2UI, Amplify Auth later, Cloudflare WebSockets later.

---

## Phase 0: Boilerplate foundation

Status: complete in the initial pass.

Files:

- Create: `apps/desktop_mobile/`
- Modify: `apps/desktop_mobile/lib/main.dart`
- Modify: `apps/desktop_mobile/test/widget_test.dart`
- Create: `docs/roadmap/DESKTOP_MOBILE_BOILERPLATE_STATUS.md`

Verification:

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

## Phase 1: Shared client domain models

### Task 1: Create run/event/artifact models

**Objective:** Add typed models before wiring any API clients.

**Files:**

- Create: `apps/desktop_mobile/lib/src/domain/run_models.dart`
- Test: `apps/desktop_mobile/test/domain/run_models_test.dart`

**Models:**

- `AgentRun`
- `AgentTask`
- `RunEvent`
- `ArtifactSummary`
- `ApprovalRequest`
- `PreviewDeploymentSummary`

**Verification:**

```bash
flutter test test/domain/run_models_test.dart
```

### Task 2: Create fixture repository

**Objective:** Keep UI useful before Control API exists.

**Files:**

- Create: `apps/desktop_mobile/lib/src/data/fixture_console_repository.dart`
- Create: `apps/desktop_mobile/lib/src/data/console_repository.dart`
- Test: `apps/desktop_mobile/test/data/fixture_console_repository_test.dart`

**Repository methods:**

- `listRuns()`
- `getRun(runId)`
- `listEvents(runId)`
- `listArtifacts(runId)`
- `listApprovals()`

**Verification:**

```bash
flutter test test/data/fixture_console_repository_test.dart
```

## Phase 2: Control API client shell

### Task 3: Add API client interface

**Objective:** Define the backend boundary before the CDK Control API is complete.

**Files:**

- Create: `apps/desktop_mobile/lib/src/data/control_api_client.dart`
- Test: `apps/desktop_mobile/test/data/control_api_client_test.dart`

**Methods:**

- `createRun(CreateRunRequest request)`
- `getRun(String runId)`
- `listRunEvents(String runId)`
- `listArtifacts(String runId)`
- `resolveApproval(String approvalId, ApprovalDecision decision)`

**Verification:**

Use a fake HTTP client once an HTTP package is chosen. Until then, keep interface-only and test JSON serialization.

## Phase 3: Command Center real state

### Task 4: Move current main.dart into feature files

**Objective:** Split the boilerplate into maintainable files.

**Files:**

- Create: `lib/src/app/agents_cloud_console_app.dart`
- Create: `lib/src/app/console_shell.dart`
- Create: `lib/src/features/command_center/command_center_page.dart`
- Create: `lib/src/features/runs/runs_page.dart`
- Create: `lib/src/features/agents/agents_page.dart`
- Create: `lib/src/theme/console_palette.dart`
- Modify: `lib/main.dart`

**Verification:**

```bash
dart format lib test
flutter analyze
flutter test
```

### Task 5: Wire Riverpod repository providers

**Objective:** Replace hardcoded page text with fixture repository state.

**Files:**

- Create: `lib/src/app/providers.dart`
- Modify: command center/runs/artifacts/approvals pages
- Test: `test/features/command_center_test.dart`

**Verification:**

Widget test should override repository provider with fake data and assert run counts/status labels render.

## Phase 4: Runs and run detail

### Task 6: Build runs list

**Objective:** Show recent runs as a workflow table/list.

**Files:**

- Create/modify: `lib/src/features/runs/runs_page.dart`
- Test: `test/features/runs_page_test.dart`

**UI:**

- run title
- status
- current phase
- started time
- assigned team
- artifact count

### Task 7: Build run detail page

**Objective:** Show the actual autonomous company workflow for one run.

**Files:**

- Create: `lib/src/features/runs/run_detail_page.dart`
- Test: `test/features/run_detail_page_test.dart`

**UI:**

- status header
- event timeline
- task list
- artifacts panel
- approvals panel
- GenUI workspace panel

## Phase 5: GenUI event handling

### Task 8: Define GenUI patch event model

**Objective:** Support server-sent UI patches safely.

**Files:**

- Create: `lib/src/genui/genui_patch.dart`
- Create: `lib/src/genui/genui_surface_host.dart`
- Test: `test/genui/genui_patch_test.dart`

**Rules:**

- accept only A2UI messages matching expected schema
- reject unknown component catalogs unless explicitly allowlisted
- keep debug/raw JSON hidden in normal UI

### Task 9: Add Agents Cloud component catalog

**Objective:** Move beyond BasicCatalog for domain-specific dashboard components.

**Files:**

- Create: `lib/src/genui/agents_cloud_catalog.dart`
- Test: `test/genui/agents_cloud_catalog_test.dart`

**Initial components:**

- `RunTimelineCard`
- `TaskBoardCard`
- `ApprovalCard`
- `ArtifactGalleryCard`
- `PreviewTile`
- `MiroBoardCard`

## Phase 6: Realtime client

### Task 10: Add realtime client interface

**Objective:** Prepare for Cloudflare Durable Object WebSocket channels.

**Files:**

- Create: `lib/src/realtime/realtime_client.dart`
- Create: `lib/src/realtime/realtime_event.dart`
- Test: `test/realtime/realtime_event_test.dart`

**Channels:**

- `workspace:{workspaceId}`
- `run:{runId}`
- `thread:{threadId}`

### Task 11: Add WebSocket implementation

**Objective:** Connect to Cloudflare Worker endpoint once available.

**Files:**

- Create: `lib/src/realtime/cloudflare_realtime_client.dart`
- Test: `test/realtime/cloudflare_realtime_client_test.dart`

**Behavior:**

- connect with auth token
- reconnect with backoff
- expose stream of typed events
- batch local outbound messages where needed

## Phase 7: Auth

### Task 12: Add auth state abstraction

**Objective:** Keep app independent from a specific auth package until Amplify Flutter wiring is chosen.

**Files:**

- Create: `lib/src/auth/auth_session.dart`
- Create: `lib/src/auth/auth_controller.dart`
- Test: `test/auth/auth_controller_test.dart`

### Task 13: Wire Amplify Auth

**Objective:** Sign in with Cognito and attach tokens to API/realtime calls.

**Files:**

- Create: `lib/src/auth/amplify_auth_controller.dart`
- Modify: `pubspec.yaml`
- Modify: app shell to show signed-in user/session status

**Verification:**

Requires Amplify outputs and a real/sandbox Cognito app client.

## Phase 8: Miro and previews

### Task 14: Add Miro placeholder-to-real flow

**Objective:** Let users connect boards and attach them to projects/runs.

**Files:**

- Create: `lib/src/features/miro/miro_page.dart`
- Create: `lib/src/domain/miro_models.dart`
- Test: `test/features/miro_page_test.dart`

### Task 15: Add preview browser

**Objective:** Show generated websites and documents from preview deployments.

**Files:**

- Create: `lib/src/features/previews/preview_gallery.dart`
- Test: `test/features/preview_gallery_test.dart`

## Quality gates for every phase

Run after each phase:

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

If desktop UI changes are visible, launch the app:

```bash
open build/macos/Build/Products/Debug/desktop_mobile.app
```
