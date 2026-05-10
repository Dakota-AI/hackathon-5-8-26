# GenUI, Markdown Rendering, and Chat UI Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a professional, shadcn_flutter-native Agents Cloud desktop/mobile chat and GenUI surface that renders canonical run events, markdown, tool/artifact cards, approvals, and validated A2UI/GenUI components safely.

**Architecture:** Agents Cloud should keep AWS/DynamoDB/S3 as durable truth and render replayable canonical events into typed chat parts and GenUI surfaces. Flutter renders only allowlisted native components through `shadcn_flutter` and Flutter `genui`; agents never emit arbitrary Flutter code. Markdown is rendered through a hardened wrapper with safe links, shadcn code blocks, and table overflow handling.

**Tech Stack:** Flutter, Dart, shadcn_flutter, Riverpod, genui, markdown_widget, url_launcher, fl_chart, optional syntax_highlight, Control API event models, future Cloudflare realtime stream.

---

## Product Direction

This UI should feel like an executive operating cockpit, not a generic chatbot.

Primary shape:

```text
Desktop/mobile shell
  left nav / workspace switcher
  main command + run workspace
    top run summary / status
    conversation timeline
    generated UI workspace
  right inspector / artifacts / approvals, collapsible
```

The chat is a command and trace surface. GenUI is the work output surface.

Design rules:

- Use `shadcn_flutter` components by default.
- Keep black/white/neutral styling.
- Use compact card/table/timeline density.
- Hide raw JSON and protocol internals behind Diagnostics/Advanced only.
- Make artifacts, approvals, generated tables/charts, and reports first-class outputs.
- Every generated UI must be replayable from canonical events.

## Current Starting Point

Existing app:

- `apps/desktop_mobile/lib/main.dart`
  - Monolithic command center scaffold.
  - Uses `ShadcnApp` dark neutral theme.
  - Uses Riverpod `StateProvider` for page selection.
  - Includes `_GenUiPreviewPanel` with local `SurfaceController` + `BasicCatalogItems`.
- `apps/desktop_mobile/lib/backend_config.dart`
  - Amplify/Cognito + Control API config shell.
- `apps/desktop_mobile/pubspec.yaml`
  - Has `shadcn_flutter`, `flutter_riverpod`, `genui`, `http`, Amplify packages.
  - Does not yet have markdown, link launcher, charts, or syntax highlighting deps.

Reference audit:

- `docs/research/OPEN_SOURCE_GENUI_MARKDOWN_CHAT_UI_AUDIT.md`
- Local clone directory: `tools/research/genui_ui_audit/`

## Proposed File Layout

Create these folders under `apps/desktop_mobile/lib/`:

```text
lib/
  app/
    agents_cloud_console_app.dart
    console_shell.dart
    navigation.dart
  theme/
    agents_palette.dart
    agents_theme.dart
    shadcn_extensions.dart
  chat/
    agents_chat_models.dart
    agents_chat_controller.dart
    agents_chat_state.dart
    agents_chat_surface.dart
    agents_message_list.dart
    agents_message_bubble.dart
    agents_message_part_renderer.dart
    agents_chat_composer.dart
    agents_markdown.dart
    agents_code_block.dart
    agents_markdown_table.dart
  genui/
    agents_catalog.dart
    agents_component_models.dart
    agents_component_validator.dart
    agents_surface_controller.dart
    agents_surface_panel.dart
    components/
      metric_card_component.dart
      metric_grid_component.dart
      run_timeline_component.dart
      task_plan_component.dart
      data_table_component.dart
      chart_components.dart
      artifact_card_component.dart
      approval_card_component.dart
      terminal_output_component.dart
  runs/
    run_event_models.dart
    run_event_adapter.dart
    run_repository.dart
  artifacts/
    artifact_models.dart
    artifact_cards.dart
  approvals/
    approval_models.dart
    approval_cards.dart
```

Keep `main.dart` as a thin entrypoint:

```dart
import 'app/agents_cloud_console_app.dart';
import 'backend_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AgentsCloudBackend.configureAmplify();
  runApp(const AgentsCloudConsoleApp());
}
```

## Core Data Model

### Chat message model

Create typed chat messages and parts instead of one markdown string.

```dart
enum AgentsChatRole { user, assistant, system, tool, event }

enum AgentsMessageStatus { pending, streaming, complete, failed }

class AgentsChatMessage {
  const AgentsChatMessage({
    required this.id,
    required this.runId,
    required this.role,
    required this.createdAt,
    required this.parts,
    this.status = AgentsMessageStatus.complete,
    this.authorName,
    this.seq,
  });

  final String id;
  final String runId;
  final int? seq;
  final AgentsChatRole role;
  final String? authorName;
  final DateTime createdAt;
  final AgentsMessageStatus status;
  final List<AgentsMessagePart> parts;
}

sealed class AgentsMessagePart {
  const AgentsMessagePart();
}

class MarkdownPart extends AgentsMessagePart {
  const MarkdownPart(this.markdown);
  final String markdown;
}

class ToolCallPart extends AgentsMessagePart {
  const ToolCallPart({required this.toolName, required this.status, this.summary});
  final String toolName;
  final String status;
  final String? summary;
}

class ArtifactPart extends AgentsMessagePart {
  const ArtifactPart({required this.artifactId, required this.title, required this.kind});
  final String artifactId;
  final String title;
  final String kind;
}

class ApprovalRequestPart extends AgentsMessagePart {
  const ApprovalRequestPart({required this.approvalId, required this.title, required this.risk});
  final String approvalId;
  final String title;
  final String risk;
}

class UiSurfacePart extends AgentsMessagePart {
  const UiSurfacePart({required this.surfaceId});
  final String surfaceId;
}

class ErrorPart extends AgentsMessagePart {
  const ErrorPart(this.message);
  final String message;
}
```

### GenUI component model

Create a typed wrapper around catalog components even if `genui.Component` is used underneath.

```dart
enum AgentsComponentType {
  metricCard,
  metricGrid,
  runTimeline,
  taskPlan,
  dataTable,
  lineChart,
  barChart,
  donutChart,
  artifactCard,
  codeBlock,
  codeDiff,
  terminalOutput,
  approvalCard,
  form,
}

class AgentsSurfacePatch {
  const AgentsSurfacePatch({
    required this.surfaceId,
    required this.catalogVersion,
    required this.components,
    this.data = const {},
  });

  final String surfaceId;
  final String catalogVersion;
  final List<AgentsComponentSpec> components;
  final Map<String, Object?> data;
}

class AgentsComponentSpec {
  const AgentsComponentSpec({
    required this.id,
    required this.type,
    required this.props,
    this.children = const [],
  });

  final String id;
  final AgentsComponentType type;
  final Map<String, Object?> props;
  final List<String> children;
}
```

## Component Catalog v0

Implement first:

1. `metric_card`
2. `metric_grid`
3. `run_timeline`
4. `task_plan`
5. `markdown_block`
6. `data_table`
7. `artifact_card`
8. `approval_card`
9. `terminal_output`
10. `line_chart` after adding `fl_chart`

Defer:

- forms
- code diff
- sandboxed artifact previews
- Miro previews
- advanced sortable/resizable data table
- custom workflow graph

### Component schema constraints

Every component schema should include limits:

```text
component id: <= 128 chars, [a-zA-Z0-9_.:-]
title: <= 140 chars
markdown: <= 20k chars initially
rows: <= 100 initially
columns: <= 20 initially
chart points: <= 500 initially
children depth: <= 6
payload size: <= 256 KB per UI event initially
unknown props: rejected
unknown component type: rejected
```

## Implementation Tasks

### Task 1: Add markdown and link dependencies

**Objective:** Add the first markdown rendering dependency set.

**Files:**

- Modify: `apps/desktop_mobile/pubspec.yaml`
- Modify: `apps/desktop_mobile/pubspec.lock`

**Step 1: Add dependencies**

Run:

```bash
cd apps/desktop_mobile
flutter pub add markdown_widget url_launcher
```

Optional later:

```bash
flutter pub add syntax_highlight
```

Do not add `flutter_markdown`; it is discontinued.

**Step 2: Verify dependency resolution**

Run:

```bash
flutter pub get
```

Expected: succeeds with no dependency conflict.

**Step 3: Commit**

```bash
git add apps/desktop_mobile/pubspec.yaml apps/desktop_mobile/pubspec.lock
git commit -m "feat(desktop-mobile): add markdown rendering dependencies"
```

### Task 2: Extract app shell from monolithic main.dart

**Objective:** Move app shell classes out of `main.dart` before adding chat/GenUI complexity.

**Files:**

- Create: `apps/desktop_mobile/lib/app/agents_cloud_console_app.dart`
- Create: `apps/desktop_mobile/lib/app/console_shell.dart`
- Create: `apps/desktop_mobile/lib/app/navigation.dart`
- Modify: `apps/desktop_mobile/lib/main.dart`
- Test: `apps/desktop_mobile/test/widget_test.dart`

**Step 1: Move top-level app and shell widgets**

Move these classes from `main.dart` into app files:

- `ConsolePage`
- `selectedPageProvider`
- `AgentsCloudConsoleApp`
- `ConsoleShell`
- `_Sidebar`
- `_BrandHeader`
- `_LogoMark`
- `_NavButton`
- `_ConnectionCard`
- `_TopBar`
- `_PageBody`

Preserve behavior exactly.

**Step 2: Keep main.dart thin**

`main.dart` should only configure backend and run the app.

**Step 3: Run tests**

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
```

Expected: all pass.

**Step 4: Commit**

```bash
git add apps/desktop_mobile/lib apps/desktop_mobile/test/widget_test.dart
git commit -m "refactor(desktop-mobile): split console shell from entrypoint"
```

### Task 3: Create theme and shared shadcn wrappers

**Objective:** Centralize palette and reusable shell primitives.

**Files:**

- Create: `apps/desktop_mobile/lib/theme/agents_palette.dart`
- Create: `apps/desktop_mobile/lib/theme/agents_theme.dart`
- Create: `apps/desktop_mobile/lib/theme/shadcn_extensions.dart`
- Modify: moved shell files from Task 2

**Step 1: Move `_Palette` into theme file**

Create `AgentsPalette` with the current colors.

```dart
abstract final class AgentsPalette {
  static const background = Color(0xFF050506);
  static const sidebar = Color(0xFF09090B);
  static const panel = Color(0xFF0D0D10);
  static const panelRaised = Color(0xFF121216);
  static const border = Color(0xFF24242A);
  static const muted = Color(0xFF8D8D96);
  static const text = Color(0xFFF4F4F5);
  static const input = Color(0xFF111114);
  static const accent = Color(0xFFEDEDED);
  static const success = Color(0xFFB8F6CF);
  static const warning = Color(0xFFF6D38A);
  static const destructive = Color(0xFFFFA3A3);
  static const info = Color(0xFFA7C7FF);
}
```

**Step 2: Create reusable wrappers**

Add:

- `AgentsPanel`
- `AgentsStatusPill`
- `AgentsSectionHeader`
- `AgentsEmptyState`
- `AgentsSkeletonLine`

Use shadcn widgets where available, but keep layout compact.

**Step 3: Replace duplicated private widgets**

Replace `_Panel`, `_StatusPill`, `_SectionHeader` references with exported wrappers.

**Step 4: Verify**

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

### Task 4: Add chat models and controller

**Objective:** Implement replayable chat state independent of UI.

**Files:**

- Create: `apps/desktop_mobile/lib/chat/agents_chat_models.dart`
- Create: `apps/desktop_mobile/lib/chat/agents_chat_controller.dart`
- Create: `apps/desktop_mobile/lib/chat/agents_chat_state.dart`
- Test: `apps/desktop_mobile/test/chat/agents_chat_controller_test.dart`

**Step 1: Write tests first**

Test cases:

- inserts user message
- inserts assistant streaming message
- appends streaming markdown chunk
- marks message complete
- adds artifact part
- replaces message by id without duplicating
- preserves seq ordering

**Step 2: Implement controller**

Use a `StateNotifier` or plain `ChangeNotifier` wrapped by Riverpod. Inspired by Flyer Chat's `ChatController`, expose:

```dart
abstract interface class AgentsChatController {
  List<AgentsChatMessage> get messages;
  void setMessages(List<AgentsChatMessage> messages);
  void insertMessage(AgentsChatMessage message);
  void updateMessage(String id, AgentsChatMessage Function(AgentsChatMessage) update);
  void appendMarkdownChunk({required String messageId, required String chunk});
  void addPart({required String messageId, required AgentsMessagePart part});
  void clear();
}
```

**Step 3: Verify**

```bash
cd apps/desktop_mobile
flutter test test/chat/agents_chat_controller_test.dart
flutter analyze
```

### Task 5: Build shadcn chat surface

**Objective:** Render messages using native shadcn widgets, not a generic chat package.

**Files:**

- Create: `apps/desktop_mobile/lib/chat/agents_chat_surface.dart`
- Create: `apps/desktop_mobile/lib/chat/agents_message_list.dart`
- Create: `apps/desktop_mobile/lib/chat/agents_message_bubble.dart`
- Create: `apps/desktop_mobile/lib/chat/agents_message_part_renderer.dart`
- Create: `apps/desktop_mobile/lib/chat/agents_chat_composer.dart`
- Test: `apps/desktop_mobile/test/chat/agents_chat_surface_test.dart`

**Required UI:**

- Compact message list.
- User messages aligned right but restrained.
- Assistant/event/tool messages aligned left/full-width where useful.
- Role label and timestamp available but subtle.
- Loading/streaming state with skeleton/thinking indicator.
- Copy button on assistant messages.
- Retry/regenerate affordance placeholder hidden behind menu.
- Composer with multiline input and primary Send button.
- Quick prompt chips above composer.

**Do not implement yet:**

- Real network send.
- Realtime streaming.
- Provider/model selection.

**Verification:**

Widget test should render:

- user markdown message
- assistant markdown with code block
- tool call part
- artifact part
- approval request part
- composer input

### Task 6: Build markdown renderer wrapper

**Objective:** Render AI markdown safely with shadcn styling.

**Files:**

- Create: `apps/desktop_mobile/lib/chat/agents_markdown.dart`
- Create: `apps/desktop_mobile/lib/chat/agents_code_block.dart`
- Create: `apps/desktop_mobile/lib/chat/agents_markdown_table.dart`
- Test: `apps/desktop_mobile/test/chat/agents_markdown_test.dart`

**Markdown requirements:**

- headings
- paragraphs
- bullet/numbered lists
- links
- inline code
- fenced code blocks
- markdown tables
- blockquotes
- horizontal rules

**Safety requirements:**

- no raw HTML rendering
- safe link schemes only: `https`, `http`, maybe `mailto`
- external link open through `url_launcher`
- code is text only, no execution
- code block copy button copies exact code
- markdown tables horizontally scroll instead of overflowing

**Implementation sketch:**

Use `markdown_widget`:

```dart
MarkdownWidget(
  data: markdown,
  shrinkWrap: true,
  physics: const NeverScrollableScrollPhysics(),
  config: MarkdownConfig.darkConfig.copy(
    configs: [
      PreConfig(
        wrapper: (child, code, language) => AgentsCodeBlock(
          code: code,
          language: language,
          child: child,
        ),
      ),
      TableConfig(
        wrapper: (child) => AgentsMarkdownTable(child: child),
      ),
      LinkConfig(
        onTap: (url) => safeOpenLink(url),
      ),
    ],
  ),
)
```

Use actual package API after inspection; adjust as needed.

**Tests:**

- markdown heading text appears
- table cell text appears
- code language appears
- copy button exists
- unsafe `javascript:` link is not launched

### Task 7: Define Agents Cloud GenUI catalog models and validators

**Objective:** Add a typed catalog layer before rendering custom components.

**Files:**

- Create: `apps/desktop_mobile/lib/genui/agents_component_models.dart`
- Create: `apps/desktop_mobile/lib/genui/agents_component_validator.dart`
- Test: `apps/desktop_mobile/test/genui/agents_component_validator_test.dart`

**Validation tests:**

- accepts valid metric card
- rejects unknown type
- rejects oversized markdown
- rejects too many table rows
- rejects unknown props
- rejects invalid action id
- validates chart point limit

**Implementation:**

Start with manual Dart validation. Do not add a JSON schema dependency until needed.

### Task 8: Build shadcn-backed GenUI components

**Objective:** Render first catalog components with shadcn styling.

**Files:**

- Create under `apps/desktop_mobile/lib/genui/components/`:
  - `metric_card_component.dart`
  - `metric_grid_component.dart`
  - `run_timeline_component.dart`
  - `task_plan_component.dart`
  - `data_table_component.dart`
  - `artifact_card_component.dart`
  - `approval_card_component.dart`
  - `terminal_output_component.dart`
- Test: `apps/desktop_mobile/test/genui/agents_components_test.dart`

**Initial components:**

`metric_card` props:

```json
{
  "title": "Active runs",
  "value": "3",
  "delta": "+1 today",
  "tone": "neutral|success|warning|destructive|info"
}
```

`run_timeline` props:

```json
{
  "items": [
    {"title":"Plan created", "status":"complete", "body":"...", "time":"..."}
  ]
}
```

`data_table` props:

```json
{
  "columns": [{"key":"name", "label":"Name", "align":"left"}],
  "rows": [{"name":"Research agent"}],
  "rowLimit": 50
}
```

`artifact_card` props:

```json
{
  "artifactId":"artifact-123",
  "title":"CEO report",
  "kind":"markdown_report",
  "summary":"..."
}
```

`approval_card` props:

```json
{
  "approvalId":"approval-123",
  "title":"Publish preview site",
  "risk":"external_publish",
  "summary":"..."
}
```

### Task 9: Create Agents GenUI catalog bridge

**Objective:** Connect typed components to Flutter `genui`/Surface rendering.

**Files:**

- Create: `apps/desktop_mobile/lib/genui/agents_catalog.dart`
- Create: `apps/desktop_mobile/lib/genui/agents_surface_controller.dart`
- Create: `apps/desktop_mobile/lib/genui/agents_surface_panel.dart`
- Modify: `apps/desktop_mobile/lib/app/console_shell.dart` or command center page file
- Test: `apps/desktop_mobile/test/genui/agents_surface_panel_test.dart`

**Implementation notes:**

- Keep `genui.SurfaceController` behind an app wrapper.
- Register `agents_cloud_v0` catalog instead of only `BasicCatalogItems`.
- Map surface events into controller calls.
- If `genui` custom CatalogItem APIs are insufficient, create a parallel renderer first and keep A2UI compatibility in models.

**Exit criteria:**

- Existing `_GenUiPreviewPanel` replaced by `AgentsSurfacePanel`.
- Panel renders metric cards/timeline/table from a local validated fixture.
- Invalid component renders safe error card without crashing.

### Task 10: Add chart dependency and chart components

**Objective:** Add native charts for generated UI surfaces.

**Files:**

- Modify: `apps/desktop_mobile/pubspec.yaml`
- Modify: `apps/desktop_mobile/pubspec.lock`
- Create: `apps/desktop_mobile/lib/genui/components/chart_components.dart`
- Test: `apps/desktop_mobile/test/genui/chart_components_test.dart`

**Step 1: Add dependency**

```bash
cd apps/desktop_mobile
flutter pub add fl_chart
```

**Step 2: Implement wrappers**

- `AgentsLineChart`
- `AgentsBarChart`
- `AgentsDonutChart`
- `AgentsSparkline`

**Style rules:**

- Use shadcn chart color tokens where available.
- Use muted axes/gridlines.
- Keep legends compact.
- No random model-provided colors in v0.

### Task 11: Map Control API/realtime events into chat and GenUI state

**Objective:** Convert canonical run events to visible UI.

**Files:**

- Create: `apps/desktop_mobile/lib/runs/run_event_models.dart`
- Create: `apps/desktop_mobile/lib/runs/run_event_adapter.dart`
- Modify: `apps/desktop_mobile/lib/chat/agents_chat_controller.dart`
- Modify: `apps/desktop_mobile/lib/genui/agents_surface_controller.dart`
- Test: `apps/desktop_mobile/test/runs/run_event_adapter_test.dart`

**Event mapping:**

```text
run.created/status        -> event/system chat part + timeline state
agent.message.delta       -> append markdown chunk
agent.message.completed   -> mark assistant message complete
tool.started              -> tool_call part
/tool.completed           -> tool_result part
artifact.created          -> artifact part + artifact card
approval.requested        -> approval part + approval card
ui.surface.create         -> create surface
ui.components.update      -> update surface components
ui.data.update            -> update data model
ui.surface.delete         -> remove surface
```

**Important:**

- All updates must be idempotent by event id/seq.
- Out-of-order events must not corrupt UI state.
- Replaying the same event stream must produce the same UI.

### Task 12: Add first command-center integration

**Objective:** Replace static command panel behavior with local chat + generated workspace fixture.

**Files:**

- Modify command center page file from Task 2.
- Add fixture file: `apps/desktop_mobile/lib/runs/run_fixtures.dart`
- Test: `apps/desktop_mobile/test/command_center_integration_test.dart`

**Behavior:**

- User sees command composer.
- Quick prompt chips populate composer.
- Sending a command inserts user message and a local assistant fixture response.
- Fixture response includes markdown, task plan, artifact card, and generated metric/table surface.
- No network call yet unless explicitly behind a feature flag.

### Task 13: Add Control API create-run path behind auth readiness

**Objective:** Send real `POST /runs` when user is authenticated.

**Files:**

- Modify: `apps/desktop_mobile/lib/backend_config.dart`
- Create/modify: `apps/desktop_mobile/lib/runs/run_repository.dart`
- Modify: chat composer submit logic.
- Test: `apps/desktop_mobile/test/runs/run_repository_test.dart`

**Behavior:**

- If signed in and id token is available, call Control API.
- If not signed in, keep local fixture mode and show sign-in required state.
- Do not block UI on backend if fixture mode is configured.

### Task 14: Prepare realtime adapter seam

**Objective:** Add interface for future Cloudflare WebSocket without implementing it yet.

**Files:**

- Create: `apps/desktop_mobile/lib/runs/run_event_stream.dart`
- Test: `apps/desktop_mobile/test/runs/run_event_stream_test.dart`

**Interface:**

```dart
abstract interface class RunEventStream {
  Stream<RunEvent> subscribe({required String workspaceId, required String runId, int? afterSeq});
  Future<List<RunEvent>> poll({required String runId, int? afterSeq});
  Future<void> dispose();
}
```

Start with polling Control API only. Add WebSocket implementation later.

### Task 15: Add diagnostics hidden behind Advanced

**Objective:** Preserve debuggability without making the UI feel like an engineer console.

**Files:**

- Create: `apps/desktop_mobile/lib/app/diagnostics_panel.dart`
- Modify shell or run detail page.
- Test: diagnostics hidden by default.

Diagnostics can show:

- run id
- last seq
- event count
- surface ids
- validation errors
- raw JSON only in explicit expandable panel

## Testing Strategy

### Unit tests

- chat controller ordering/idempotency
- markdown safe link filtering
- component validator accept/reject cases
- event adapter replay/idempotency

### Widget tests

- chat surface renders markdown, code, table, tool, artifact, approval parts
- GenUI surface renders metric/table/timeline fixtures
- invalid component shows safe error card
- command center can send fixture prompt
- desktop viewport test at 1280x760 and 1800x1100 to catch overflow

### Build validation

Always run:

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

For protocol/backend changes:

```bash
pnpm contracts:test
pnpm infra:build
pnpm infra:synth
pnpm amplify:hosting:build
```

## Package Adoption Decision Matrix

Adopt immediately:

- `markdown_widget`
- `url_launcher`

Adopt when needed:

- `fl_chart`
- `syntax_highlight`

Reference only for now:

- `flutter_chat_ui`
- `gpt_markdown`
- `table_view_ex`
- `panes`
- `A2UI` source repo

Avoid initially:

- `flutter_markdown` because discontinued
- Syncfusion until license approved
- open-ended HTML/JS GenUI except sandboxed artifact preview tier
- full chat UI package that fights shadcn styling

## Security Checklist

Before rendering any agent-generated UI:

- [ ] Validate component type.
- [ ] Validate props schema.
- [ ] Enforce max payload size.
- [ ] Enforce max rows/columns/points.
- [ ] Reject unknown action IDs.
- [ ] Strip or reject raw HTML in markdown.
- [ ] Sanitize links and schemes.
- [ ] Render invalid components as safe error cards.
- [ ] Log validation failures as diagnostic events.
- [ ] Never execute model-provided code.

## UX Checklist

Before shipping first GenUI/chat slice:

- [ ] Chat is not the whole product; generated workspace is prominent.
- [ ] Quick prompts are concrete CEO workflows.
- [ ] Markdown tables/code are readable at desktop widths.
- [ ] Tool calls and artifacts are compact and professional.
- [ ] Approvals clearly show risk and action.
- [ ] Empty states explain what the user can ask for.
- [ ] Advanced/raw protocol details are hidden by default.
- [ ] The UI works at desktop, tablet, and mobile-ish widths.

## Suggested Commit Sequence

1. `docs: plan desktop genui markdown chat architecture`
2. `feat(desktop-mobile): add markdown renderer dependencies`
3. `refactor(desktop-mobile): split console shell files`
4. `feat(desktop-mobile): add chat controller models`
5. `feat(desktop-mobile): render shadcn chat surface`
6. `feat(desktop-mobile): add safe markdown renderer`
7. `feat(desktop-mobile): add genui catalog validators`
8. `feat(desktop-mobile): render first agents genui catalog`
9. `feat(desktop-mobile): add generated chart components`
10. `feat(desktop-mobile): map run events to chat and genui state`

## Open Questions

- Should Flutter use the official `genui` renderer for every custom component, or should Agents Cloud run a parallel renderer and only translate to/from A2UI at the event boundary?
- Should markdown rendering be dependency-based (`markdown_widget`) or eventually custom AST-based for tighter security and streaming performance?
- How much of chat history should be persisted locally before backend replay is complete?
- Should the generated workspace be the primary pane by default, with chat collapsed, once real runs are available?
- Should web and Flutter share JSON Schema from `packages/protocol`, with Dart generated models, before custom components are implemented?

## Recommendation

Implement in this order:

1. Documentation and package audit.
2. Monolithic file split.
3. Markdown renderer wrapper.
4. Chat state/controller.
5. Shadcn chat UI.
6. Typed GenUI component validators.
7. First shadcn GenUI catalog.
8. Event adapter.
9. Control API create-run integration.
10. Realtime stream later.

This keeps the work safe, testable, and aligned with the platform architecture: durable event truth first, native shadcn rendering second, rich autonomous agent UX third.
