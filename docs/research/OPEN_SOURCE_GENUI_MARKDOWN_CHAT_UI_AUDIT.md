# Open Source GenUI, Markdown, Chat, and shadcn Flutter UI Audit

_Date: 2026-05-10_

## Purpose

This audit identifies open-source package choices worth evaluating while building the Agents Cloud desktop/mobile GenUI, markdown, and chat experience.

The target client is:

- Flutter desktop/mobile under `apps/desktop_mobile`.
- Primary UI system: `shadcn_flutter`.
- Product feel: professional command center, minimal neutral palette, CEO/workflow-first, not a toy chatbot.
- Safety model: agents emit validated data and A2UI/GenUI component references, never arbitrary Flutter/React code.

## Local Clone Location

Reference repositories cloned for source audit:

```text
tools/research/genui_ui_audit/
  A2UI/
  fl_chart/
  flutter_chat_ui/
  gpt_markdown/
  markdown_widget/
  panes/
  shadcn_flutter/
  table_view_ex/
```

These are research references. Do not vendor or edit them as product source.

## Current Agents Cloud Flutter State

Current app files:

- `apps/desktop_mobile/lib/main.dart`
- `apps/desktop_mobile/lib/backend_config.dart`
- `apps/desktop_mobile/pubspec.yaml`

Current GenUI state:

- `genui: ^0.9.0` is already installed.
- `main.dart` imports `package:genui/genui.dart` as `genui`.
- `_GenUiPreviewPanel` creates a local `genui.SurfaceController` with `genui.BasicCatalogItems.asCatalog()`.
- The preview seeds a basic `CreateSurface` + `UpdateComponents` surface using `Column` and `Text` components.
- There is no custom Agents Cloud component catalog yet.
- There is no markdown renderer yet.
- There is no production chat message model/controller yet.
- There is no real Control API/realtime event-to-UI adapter yet.

## Highest-Level Recommendation

Build Agents Cloud's chat and GenUI UI in-house on top of `shadcn_flutter`, using a small number of focused dependencies.

Recommended initial dependency direction:

1. Keep `shadcn_flutter` as the visual/system component layer.
2. Keep `genui` as the A2UI/SurfaceController foundation.
3. Add `markdown_widget` first for markdown rendering if implementation begins now.
4. Add `url_launcher` for safe links when markdown rendering starts.
5. Add `fl_chart` for native chart components.
6. Consider `syntax_highlight` for a custom shadcn-styled code block if `markdown_widget`'s built-in `flutter_highlight` path is not enough.
7. Do not adopt a full chat UI package initially; audit `flutter_chat_ui` and implement a native shadcn chat surface around Agents Cloud event models.
8. Use `table_view_ex` and `two_dimensional_scrollables` as future advanced data tables, not immediate dependencies.
9. Use `panes` as a future dependency only if shadcn's built-in `Resizable` is insufficient.

## Package Audit

### 1. `shadcn_flutter`
- License: BSD-3-Clause
- Current audited commit: `e25e27c 2026-04-19 Merge pull request #410 from mcquenji/patch-1`

Why it matters:

This is the required visual system for Agents Cloud desktop/mobile. It should own the shell, chat bubbles, cards, badges, forms, command palette, sheets, dialogs, tables, tabs, resizable panes, and icons wherever practical.

Source audit highlights:

- `lib/src/components/control/command.dart`
  - `showCommandDialog<T>()` exists and supports async stream-based search results, loading/empty/error builders, debouncing, autofocus, and keyboard navigation.
  - Good fit for Cmd/Ctrl-K command palette.
- `lib/src/components/layout/resizable.dart`
  - Has `ResizablePaneController`, collapse/expand/resize semantics, and configurable dragger theme.
  - Good first choice for left nav/main/right inspector layouts.
- Table tests and examples exist under `test/components/table_*` and `docs/lib/pages/docs/components/table*`.
- Chat examples exist under `docs/lib/pages/docs/components/chat*`, useful to inspect for first-party chat primitives.
- Includes Lucide/Radix-style icon sets already; avoid extra icon deps until needed.

Implementation notes:

- Use `ShadcnApp` + `ThemeData.dark(colorScheme: ColorSchemes.darkNeutral)` as the top-level baseline.
- Do not import `package:flutter/widgets.dart` or Material unaliased into large shadcn files; it causes `Row`/`Column`/`Expanded` ambiguous imports. If needed, alias Flutter imports.
- Use shadcn's `Command` for global command search and command-driven chat actions.
- Use shadcn's `Resizable` before adding external split-pane packages.
- Use shadcn's `Table` for small/medium tables. For heavy grids, build a custom shadcn table on top of `two_dimensional_scrollables` later.

### 2. Google `A2UI`
- License: Apache-2.0
- Audited commit: `e3724ff 2026-05-08 [react] Exclude SVG elements from CSS reset (#1252)`

Why it matters:

Agents Cloud already accepted ADR 0005 to use A2UI v0.8 stable as the initial GenUI baseline. A2UI is the right model: declarative JSON UI, trusted component catalogs, no arbitrary code execution, and cross-platform native renderers.

Source audit highlights:

- `docs/specification/v0.9-a2ui.md` warns v0.9 is draft and recommends v0.8 stable for production.
- Web renderer files show surface/component model patterns:
  - `renderers/web_core/src/v0_9/state/surface-model.ts`
  - `renderers/web_core/src/v0_9/state/surface-components-model.ts`
- Lit/Angular renderers show catalog/component mapping patterns.
- Markdown renderer exists under `renderers/markdown/markdown-it`.

Implementation notes:

- Use A2UI v0.8 semantics as production baseline.
- Borrow v0.9 operation names only behind a version gate:
  - `createSurface`
  - `updateComponents`
  - `updateDataModel`
  - `deleteSurface`
- Keep Agents Cloud event types stable and replayable:
  - `ui.surface.create`
  - `ui.components.update`
  - `ui.data.update`
  - `ui.surface.delete`
- Validate server-side before events reach clients, and validate client-side before rendering.

### 3. Flutter `genui`

Package:

- https://pub.dev/packages/genui
- Current app dependency: `genui: ^0.9.0`
- Publisher: `labs.flutter.dev`
- License: BSD-3-Clause

Why it matters:

The package already provides the core Flutter concepts we need:

- `SurfaceController`
- `Surface`
- `Catalog`
- `CatalogItem`
- `DataModel`
- A2UI parser/transport adapters

Implementation notes:

- The current app only uses `BasicCatalogItems.asCatalog()`.
- The next step is an Agents Cloud catalog package under `apps/desktop_mobile/lib/genui/` with shadcn renderers.
- Do not let the basic catalog become the product surface. Replace it with a first-party catalog with explicit schemas and limits.

### 4. `flutter_chat_ui` / Flyer Chat
- License: Apache-2.0
- Audited commit: `7e743f4 2026-04-19 feat: expose cacheExtent on ChatAnimatedList (#892)`

Why it matters:

This is the strongest mature Flutter chat architecture input.

Source audit highlights:

- `packages/flutter_chat_core/lib/src/chat_controller/chat_controller.dart`
  - Excellent controller interface with insert, insertAll, update, remove, setMessages, current messages, and operations stream.
  - This pattern maps well to canonical event streams and replay.
- `packages/flyer_chat_text_stream_message/lib/src/flyer_chat_text_stream_message.dart`
  - Supports two streaming modes: chunk fade-in and instant markdown rerender.
  - Uses `gpt_markdown` internally for markdown rendering.
  - Has loading/shimmer states and link tap callbacks.
- Modular package structure separates core models/controllers from UI widgets.

Recommendation:

Do not adopt the default chat UI now. Build Agents Cloud's own shadcn UI and borrow these patterns:

- `ChatController` interface shape.
- Operation stream for incremental UI changes.
- Separate message model from renderer.
- Streaming text state as a first-class message state.
- Builder registry for message part types.

If later we need faster delivery, evaluate `flutter_chat_core` as a dependency while keeping custom shadcn renderers.

### 5. `markdown_widget`
- License: MIT
- Audited commit: `7a80eb3 2026-01-18 chore: update README for more infomation (#258)`

Why it matters:

Best initial markdown renderer candidate for Agents Cloud.

Source audit highlights:

- `lib/widget/blocks/leaf/code_block.dart`
  - `PreConfig.builder`, `PreConfig.contentWrapper`, and `PreConfig.wrapper` allow custom code block widgets.
  - This is enough to insert shadcn-style code block chrome with language label and copy button.
- `lib/widget/blocks/container/table.dart`
  - `TableConfig.wrapper` allows wrapping markdown tables in horizontal scrolling and shadcn-styled containers.
  - Supports header/body styles, padding, borders, and decorations.
- `lib/config/markdown_generator.dart`
  - Visitor/generator architecture can be adapted for custom syntax if needed.

Recommendation:

Use `markdown_widget` for the first production markdown pass:

- Render assistant Markdown in `AgentsMarkdown` widget.
- Configure dark shadcn theme styles.
- Use `PreConfig.wrapper` for `AgentsCodeBlock`.
- Use `TableConfig.wrapper` for horizontal-scrolling shadcn table wrapper.
- Intercept links through `url_launcher` and an allowlist.

Caveats:

- It uses `flutter_highlight`/`highlight`, which are stable and serviceable.
- Streaming is not optimized; rerendering full markdown on every chunk may be okay initially, but benchmark before long responses.

### 6. `gpt_markdown`
- License: BSD-3-Clause
- Audited commit: `619b2ee 2026-05-08 Merge pull request #137 from Infinitix-LLC/fix/link-hover-color`

Why it matters:

Useful input for AI-output-specific Markdown and code block UX.

Source audit highlights:

- `lib/custom_widgets/code_field.dart`
  - Simple language/header/copy-button pattern for code blocks.
  - Uses Material styling, but the structure should be copied conceptually into shadcn widgets.
- Supports tables, LaTeX, links, selectable text, and AI-flavored output.

Recommendation:

Use as design input, not first dependency, unless `markdown_widget` fails AI-output edge cases.

Caveats:

- It includes LaTeX dependencies that may be unnecessary at first.
- Styling is Material-oriented and will require adaptation.

### 7. `fl_chart`
- License: MIT
- Audited commit: `a9147f0 2026-04-29 feat: Add the gauge marker painter (#2096)`

Why it matters:

Best default chart dependency for native Flutter chart components.

Recommendation:

Add when implementing chart components:

- `AgentsLineChart`
- `AgentsBarChart`
- `AgentsAreaChart`
- `AgentsDonutChart`
- `AgentsSparkline`

Style all charts through shadcn tokens. Do not let chart package defaults control the product look.

### 8. `table_view_ex`
- License: MIT
- Audited commit: `725c146 2025-08-27 Bump version to 0.1.6 and update CHANGELOG; fix bug in contentCellWidgetBuilder invocation`

Why it matters:

Useful input for advanced desktop data table behavior.

Source audit highlights:

- Built on `two_dimensional_scrollables`.
- `ViewOnlyTableViewEx` supports:
  - column resize
  - column reordering
  - sortable headers
  - row/cell selection
  - custom scrollbars
  - row background provider
  - content max-width provider for auto-fit

Recommendation:

Use as a design input for `AgentsDataTable` v2. Do not add dependency in the first GenUI slice unless shadcn Table is inadequate.

### 9. `panes`
- License: MIT
- Audited commit: `3cb399b 2026-04-28 🔖 Release 1.3.0`

Why it matters:

Useful input for future IDE-like multi-pane workspaces.

Source audit highlights:

- `lib/src/multi_pane.dart` supports pane controllers, hidden/maximized panes, animated resize, resizers, and pane builders.
- Useful if Agents Cloud wants workspace layouts with a command rail, run timeline, generated surface, and inspector.

Recommendation:

Use shadcn `Resizable` first. Consider `panes` only when we need named pane persistence, maximize/restore, or complex IDE-style panes.

## Other Packages Worth Tracking

### `mixin_markdown_widget`

Strong conceptual match for streaming markdown because it offers controller-based chunk appends and trailing-block reparse semantics. It is very new, so audit before adopting.

### `flutter_smooth_markdown`

Feature-rich AI streaming markdown, tool/artifact/thinking plugins, Mermaid/SVG/math. High capability but high audit surface; use as design input before dependency.

### `syntax_highlight`

Modern TextMate/VS Code-style highlighting from Serverpod. Good candidate for custom shadcn code blocks if we outgrow `markdown_widget`'s built-in highlighter.

### `two_dimensional_scrollables`

Official low-level foundation for advanced two-axis scrolling tables. Use if building `AgentsDataTable` v2 from scratch.

### `data_table_2`

Pragmatic Material-derived admin table. Consider only if shadcn Table + custom wrappers are too slow to build.

### `Syncfusion`

Professional, but licensing is not plain OSS. Avoid unless licensing is explicitly approved.

## Safety Rules for Agents Cloud GenUI

Hard rules:

- No arbitrary Flutter/React code from agents.
- No raw HTML in normal markdown surfaces.
- No JavaScript execution in native component catalog.
- Unknown component type: reject or render a safe error card.
- Unknown props: reject or ignore only if explicitly allowed by schema.
- Model-specified URLs must not be fetched directly by client components unless type/host/scheme is allowlisted.
- All actions are semantic IDs mapped to trusted handlers; no model-provided callbacks.
- Every component has max size limits.
- Every surface is replayable from canonical events.

Recommended validators:

- Web: Zod or JSON Schema/AJV.
- Flutter: generated Dart models/validators or a JSON Schema validator.
- Backend: validate before persisting/broadcasting.

## Recommended First Component Catalog

`agents_cloud_v0` catalog:

- `metric_card`
- `metric_grid`
- `run_timeline`
- `task_plan`
- `progress_steps`
- `markdown_block`
- `data_table`
- `line_chart`
- `bar_chart`
- `donut_chart`
- `artifact_card`
- `code_block`
- `code_diff`
- `terminal_output`
- `approval_card`
- `form`
- `text_input`
- `select`
- `checkbox`
- `textarea`
- `link_preview`
- `image_preview`
- `sandboxed_artifact_preview`

Start with only the first 8-10 in implementation; keep the full list as roadmap.

## Recommended First Chat Parts

`AgentsChatMessage` should contain typed parts:

- `text` markdown part
- `thinking` / status part
- `tool_call` part
- `tool_result` part
- `artifact` part
- `approval_request` part
- `ui_surface` part
- `error` part

This mirrors Vercel AI SDK UI/assistant-ui patterns while staying native Flutter and replayable.

## Immediate Implementation Direction

1. Split the current `main.dart` into feature directories before adding heavy UI.
2. Add `lib/theme/agents_palette.dart` and shared shadcn styling wrappers.
3. Add `lib/chat/` with models, controller, message list, composer, and markdown renderer.
4. Add `lib/genui/` with catalog models, validators, and shadcn-backed components.
5. Add `lib/runs/` event adapter that maps Control API/realtime events to chat messages and GenUI surface updates.
6. Add tests before each layer.

## Verification Commands

For Flutter desktop/mobile changes:

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

For broader protocol/backend changes:

```bash
pnpm contracts:test
pnpm infra:build
pnpm infra:synth
pnpm amplify:hosting:build
```
