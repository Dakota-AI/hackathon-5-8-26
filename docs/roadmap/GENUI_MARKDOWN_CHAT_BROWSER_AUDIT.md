# GenUI, Markdown, Chat UI, Artifacts, and Embedded Browser Audit

_Last updated: 2026-05-10_

## Purpose

This audit documents the product/UI scope for Agents Cloud's native and web clients around:

- workflow-first chat and command surfaces,
- Markdown and document rendering,
- GenUI/A2UI generated component surfaces,
- artifact workspaces,
- embedded preview/browser surfaces,
- package choices for high-quality Flutter implementation.

The goal is a professional autonomous-agent command center, not a generic chatbot and not an AWS-console wrapper.

## Current repository reality

Current client state:

- `apps/web` is a static-export Next.js command center hosted by Amplify Hosting.
- `apps/desktop_mobile` is a Flutter desktop/mobile app using `shadcn_flutter`, Riverpod, and `genui`.
- Flutter has a command-center shell, compact mobile layout, placeholder pages, and a local GenUI `SurfaceController` preview.
- Full Auth, Control API run workflows, artifact APIs, realtime subscriptions, and production GenUI event reducers are not wired into Flutter yet.

Current architecture constraints:

- AWS remains durable truth for runs, events, approvals, artifacts, and previews.
- Clients render canonical events and validated A2UI/GenUI surfaces.
- Agents must not emit arbitrary Dart, Flutter, React, JS, or raw HTML for client execution.
- Generated UI is data that references an approved component catalog.
- Realtime is fanout only; replay/gap repair must use durable event queries.

## Product UX principle

The primary UI should be a shadcn-native command center:

```text
objective composer
  -> run ledger / event timeline
  -> agent messages and tool cards
  -> approval gates
  -> generated UI workspace
  -> artifact/document/browser preview pane
```

Do not make a generic messenger package the core product surface. Chat is one interaction pattern inside a larger run/artifact/control workflow.

## Flutter package recommendations

### Use now

1. `markdown_widget`

Use for:

- assistant reports,
- executive memos,
- research artifacts,
- Markdown document previews,
- tables and code blocks inside generated reports.

Why:

- mature enough for rich Markdown rendering,
- supports selectable rendering through `MarkdownBlock`,
- customizable enough to wrap inside shadcn panels,
- better fit for report/artifact rendering than raw `Text`.

2. `url_launcher`

Use for:

- Open in Browser,
- fallback when embedded preview is unavailable,
- external links from Markdown and artifact cards.

3. `share_plus`

Use for:

- Share preview link,
- share artifact URL,
- mobile native share sheets.

4. `webview_flutter`

Use for:

- inline preview domains on iOS, Android, and macOS,
- generated website artifact previews,
- controlled preview-browser routes.

Important: do not wire arbitrary web content directly to a privileged bridge. Keep origin allowlists, blocked schemes, and token isolation in place before live use.

### Consider later

- `flutter_chat_ui` / `flutter_chat_core`: good for a dedicated agent/team chat pane, not for the main command center.
- `gpt_markdown`: worth benchmarking if model output becomes LaTeX/math-heavy.
- `streaming_markdown`: possible for polished animated text reveal, but do not make it the event model.
- `pdfrx`: high-quality PDF artifact viewer when PDF artifacts enter scope.
- `two_dimensional_scrollables`: large tables, datasets, research matrices, eval tables.
- `re_editor`: code artifact and patch review surfaces.
- `flutter_inappwebview`: only if official `webview_flutter` cannot meet browser requirements.
- `super_editor`: later for editable rich documents; not first slice.

## Embedded browser model

First production-shaped browser UX:

Desktop/macOS:

- Artifact or preview card opens an in-app preview panel.
- Toolbar includes Back, Forward, Reload, URL/domain display, Open in Browser, Copy Link, Share, Close.
- `webview_flutter` renders only approved preview URLs.
- Unknown/external navigation opens externally or requires confirmation.

Mobile:

- Preview opens as a full-screen route.
- Top bar shows Close, current domain, overflow menu.
- Overflow exposes Open in Browser, Share, Copy Link, Reload.

Security rules:

- Treat preview sites as untrusted web content.
- Do not expose Cognito tokens or local secrets to WebView content.
- Do not add JavaScript channels in the first slice.
- Allow `https:` only by default; block `javascript:`, `data:`, `file:`, and unknown schemes.
- Prefer preview content on isolated wildcard preview origins.
- Use signed preview URLs from the backend, not agent-minted URLs.
- Show the current origin visibly.
- Keep Open External available for trust/debug/download flows.

## GenUI/A2UI validation architecture

Agents Cloud should use a validated wrapper around A2UI messages.

Recommended event family:

- `ui.surface.create`
- `ui.components.update`
- `ui.data.update`
- `ui.surface.delete`
- `ui.validation.failed`

Recommended payload wrapper:

```json
{
  "protocol": "a2ui",
  "a2uiVersion": "0.9",
  "catalogId": "agents_cloud.v0",
  "catalogVersion": "0.1.0",
  "surfaceId": "run-123-main",
  "message": {
    "updateComponents": {
      "surfaceId": "run-123-main",
      "components": []
    }
  },
  "actionPolicy": "none"
}
```

Notes:

- The repo ADR says A2UI v0.8 baseline, while Flutter `genui` and current schema shape are v0.9-style. This should be made explicit with a version gate or translation layer.
- `packages/protocol/schemas/events/a2ui-delta.schema.json` is currently too shallow for production. It should grow into event-specific UI schemas plus catalog schemas.

Validation pipeline:

```text
agent output
  -> parse JSON
  -> validate canonical event envelope
  -> validate UI wrapper and A2UI version
  -> validate catalog ID/version allowlist
  -> validate component graph, data paths, actions, URL policy, size limits
  -> persist to DynamoDB / S3 only after validation
  -> relay realtime event
  -> client validates again
  -> client renders native shadcn/web components
```

## Component catalog v0

First catalog should be boring, safe, and useful:

- `metric_card`
- `metric_grid`
- `run_timeline`
- `task_plan`
- `progress_steps`
- `markdown_block`
- `data_table`
- `artifact_card`
- `approval_card`
- `terminal_output`
- `code_block`
- `line_chart`
- `bar_chart`
- `donut_chart`

Initial implementation can ship only:

- `markdown_block`
- `artifact_card`
- `approval_card`
- `run_timeline`
- `task_plan`
- `data_table`
- `terminal_output`

Charts should wait until a chart dependency and accessibility summaries are added.

Hard limits for v0:

- max component count: 100,
- max tree depth: 6,
- max inline Markdown: 20 KB,
- max inline code/log: 20 KB,
- max table rows: 100,
- max table columns: 12,
- max chart points: 500,
- no arbitrary colors,
- no raw HTML,
- no executable code,
- unknown components render safe error cards.

## Artifact model

Artifacts should not be embedded as huge UI payloads. They should be durable pointers:

```json
{
  "artifactId": "artifact-123",
  "kind": "report",
  "name": "CEO report",
  "uri": "s3://workspace/runs/run-123/artifacts/report.md",
  "contentType": "text/markdown; charset=utf-8",
  "sha256": "...",
  "bytes": 12345,
  "metadata": {},
  "previewUrl": "https://..."
}
```

Rendering rules:

- Markdown reports render through safe Markdown renderer.
- PDFs render through a PDF viewer once supported.
- Website previews use sandboxed preview domains and the embedded browser shell.
- Logs/code/diffs show small excerpts inline; full content remains an artifact.
- Downloads/previews/share links come from Control API or signed URL issuance, not from arbitrary model output.

## First Flutter UI slice implemented from this audit

The Flutter client now has first-slice boilerplate for:

- shadcn `TextArea` command composer mock,
- shadcn-native agent conversation surface,
- tool-call card,
- run ledger card,
- artifact workspace cards,
- `markdown_widget` document preview panel,
- embedded browser shell placeholder with preview URL toolbar,
- approval queue cards.

These are fixture UI surfaces only. They intentionally do not claim backend integration.

## Next implementation steps

1. Split `apps/desktop_mobile/lib/main.dart` into feature modules.
2. Add typed Dart view models for chat messages, artifacts, previews, approvals, and A2UI deltas.
3. Implement a client-side catalog validator before passing deltas into `genui.SurfaceController`.
4. Add protocol catalog schemas under `packages/protocol` and TS/Dart test fixtures.
5. Wire Flutter polling to `GET /runs/{runId}/events` before realtime.
6. Add signed artifact URL/open/download/share APIs.
7. Activate WebView only behind preview URL/origin policy.
8. Add web client equivalent renderers for the same component catalog.

## Validation evidence

After the first Flutter UI slice:

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

Result: passed on 2026-05-10. macOS build emitted non-fatal Apple Metal toolchain search-path warnings and produced `build/macos/Build/Products/Debug/desktop_mobile.app`.
