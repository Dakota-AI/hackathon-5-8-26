# Agent-Created Interfaces and GenUI Product Vision

_Last updated: 2026-05-09_

## Purpose

This document captures the product direction for Agents Cloud as a CEO-grade autonomous work platform where agents can create useful interfaces, dashboards, reports, tools, and artifacts without writing arbitrary frontend code.

The key idea:

```text
User delegates an objective
  -> agent creates/updates a durable WorkItem
  -> agent runs work in isolated workers
  -> agent emits progress, artifacts, datasets, approvals, and validated GenUI surfaces
  -> user sees status, dashboards, reports, websites, PDFs, data tables, charts, and next actions across web/desktop/mobile
```

The platform should move beyond constant manual monitoring. A CEO/user should be able to delegate, leave, get a mobile notification when a meaningful result is ready, review a concise artifact or dashboard, approve/redirect work, and continue later on desktop/web.

## Product thesis

Agents Cloud should not be a chatbot with some cards. It should become an operating system for delegated AI work.

For serious work, the user needs:

- durable objectives,
- visible progress,
- status and liveness,
- generated reports,
- generated dashboards,
- generated tools/forms,
- generated websites/apps/previews,
- generated datasets,
- approvals and risk gates,
- notifications,
- artifacts that can be shared, reviewed, exported, and reopened.

GenUI is the mechanism that lets agents create useful interfaces safely. The agent does not write React, Dart, Flutter, JS, HTML, or CSS. The agent fills predefined, validated component boxes with safe data references and props.

The result should feel like:

```text
Salesforce dashboards + Linear/Jira work OS + executive reporting + agent run ledger + artifact workspace
```

Not:

```text
random chatbot cards
Trello clone only
unbounded low-code app builder
agent-generated frontend code
technical AWS console
```

## North-star example: scraper dashboard

User asks:

```text
Create a web scraper that scrapes data for XYZ.
```

Good platform behavior:

1. Agent interprets objective and creates a WorkItem.
2. Agent starts small: identifies sources, assumptions, data fields, legal/safety caveats, and a first scraping plan.
3. Agent runs a first scrape and writes raw/normalized dataset artifacts.
4. Agent generates a short Markdown report: what was scraped, field coverage, source quality, early findings.
5. Agent registers the dataset as a DataSourceRef.
6. Agent proposes a dashboard if the data is ongoing or exploratory:
   - crawl progress,
   - source status table,
   - extracted records table,
   - charts/trends,
   - filters,
   - quality/errors,
   - latest changes,
   - export CSV/PDF.
7. Server validates the dashboard spec against the GenUI catalog and data-source permissions.
8. Web/desktop/mobile render the same validated dashboard using native components.
9. User receives a mobile notification when the first useful artifact or approval is ready.
10. User opens the dashboard/report, reviews, filters, gives feedback, or asks for a PDF/website/app next.

Bad platform behavior:

- ask ten questions before doing anything,
- create a giant dashboard before any data exists,
- output raw JSON to the user,
- generate arbitrary frontend code,
- hide progress in logs,
- create charts from invented data,
- publish/send/delete externally without approval,
- require the user to babysit every step.

## Core object model

Recommended durable hierarchy:

```text
Workspace
  -> WorkItem
      -> Runs
          -> Tasks / Steps
          -> Events
          -> Artifacts
          -> DataSources
          -> Surfaces
          -> Approvals
          -> Notifications
```

### WorkItem

The durable user-facing unit of delegated work.

Examples:

- Research competitors.
- Build landing page.
- Monitor pricing pages.
- Prepare Q3 board memo.
- Create scraper dashboard.
- Build an MVP app.
- Produce weekly sales report.

WorkItem owns:

- objective,
- assumptions,
- constraints,
- status,
- priority,
- owner/subscribers,
- linked runs,
- artifacts,
- dashboards/surfaces,
- approvals,
- comments/activity,
- notifications.

### Run

A single execution attempt or phase under a WorkItem.

Examples:

- initial research run,
- scrape refresh run,
- build preview run,
- PDF export run,
- retry/fix run.

### Artifact

A durable output.

Examples:

- Markdown report,
- PDF report,
- CSV/JSON dataset,
- generated website preview,
- code patch,
- screenshot,
- dashboard spec,
- Miro board,
- test results,
- export bundle.

### DataSourceRef

A server-owned, scoped reference to data that can power GenUI components.

Examples:

- artifact JSON/CSV,
- scraper dataset,
- run event stream,
- work item query,
- report metrics,
- external connector snapshot.

### Surface

A durable saved GenUI interface.

Examples:

- dashboard,
- report view,
- tool/form,
- inspector,
- command center,
- artifact review room,
- scraper monitor.

Surfaces reference component catalog items and DataSourceRefs. They are validated and stored, then rendered by clients.

## Agent decision policy

Agents should act like autonomous employees, not chatbots.

Default loop:

```text
interpret intent + sentiment + risk
  -> choose smallest useful output
  -> create/update WorkItem when durable work is needed
  -> start if safe and reversible
  -> expose progress and assumptions
  -> produce artifact/surface/report if useful
  -> ask for approval/clarification only when needed
  -> notify on milestones/failures/completion/action-required
```

### Clarify only when needed

Ask a clarifying question when the answer materially changes correctness, risk, cost, legality, or output type.

Clarify when:

- goal is ambiguous with materially different outcomes,
- action is irreversible or high-impact,
- required input is missing and cannot be retrieved,
- instructions conflict,
- safety/compliance boundary is involved,
- external publish/send/delete/spend/deploy is requested.

Do not clarify when:

- an obvious default exists,
- a small reversible first pass is possible,
- assumptions can be labeled,
- user asked for exploration/research/planning,
- the agent can create a useful draft/brief/report first.

### Progressive complexity ladder

Agents should start at the lowest useful level and climb only when the work warrants it.

| Level | Output | Use when |
|---:|---|---|
| 0 | Direct answer | Simple question, no durable work needed |
| 1 | Small draft/first pass | Exploratory or clear enough to start |
| 2 | WorkItem + status events | Nontrivial delegated work, user may return later |
| 3 | Report artifact | Research/audit/strategy/summary needs persistence |
| 4 | Dashboard | Ongoing/changing state, metrics, monitoring, pipelines |
| 5 | Interactive GenUI surface | User needs filtering, review, comparison, approval, exploration |
| 6 | Website/app/prototype | User asks for external/interactive product artifact |
| 7 | Autonomous operation | Recurring monitoring/automation with alerts/approvals |

### Report vs dashboard vs website

Create a report when:

- user asks for research, analysis, audit, strategy, memo, summary, comparison, postmortem;
- output needs to be read or shared;
- work is mostly narrative/evidence/recommendation.

Default report format:

- Markdown first.
- PDF when user asks for PDF, board/client-ready, fixed layout, final/formal artifact.

Create a dashboard when:

- user asks to track/monitor/status/progress/pipeline;
- multiple metrics/sources/tasks exist;
- data changes over time;
- user benefits from glanceability and filtering;
- work remains active after a run completes.

Create a website/app/prototype when:

- user explicitly asks to build/design a site/app;
- output is externally consumable;
- interactivity/business logic is the core deliverable;
- a report/dashboard is insufficient.

### Anti-overengineering rules

Do not:

- create an app when a paragraph answers the question,
- create a dashboard for one static answer,
- create a PDF for a rough draft unless asked,
- spawn multiple agents for a simple task,
- ask many questions when one assumption is enough,
- build custom UI/code when a GenUI component covers it,
- use arbitrary generated UI code,
- mutate external systems without approval,
- hide assumptions or uncertainty,
- continue optimizing after the goal is satisfied.

Every complexity increase should have a reason:

- more durable,
- more shareable,
- more interactive,
- more operational,
- more recurring,
- explicitly requested.

## GenUI catalog philosophy

The catalog should be boring, safe, professional, and reusable.

It should cover common workplace and CEO interfaces:

- dashboards,
- reports,
- tables,
- charts,
- work boards,
- timelines,
- approval cards,
- artifact galleries,
- browser previews,
- scraper monitors,
- forms/tools,
- executive summaries.

Agents should create surfaces by selecting components, layout presets, data sources, filters, and actions.

They should not create custom code.

## Component catalog v0/v1

### Layout components

- `dashboard`
- `workspace`
- `section`
- `tabs`
- `split_pane`
- `card_grid`
- `two_column_layout`
- `three_column_layout`
- `master_detail`
- `kanban_layout`
- `table_detail_layout`
- `timeline_layout`
- `report_layout`
- `empty_state`
- `loading_state`
- `error_state`

Validation:

- max component count: 100,
- max tree depth: 6,
- no arbitrary absolute positioning in v0,
- responsive behavior chosen from presets,
- component IDs unique,
- child references valid.

### Executive components

- `executive_summary_panel`
- `metric_card`
- `metric_grid`
- `kpi_trend_card`
- `status_ribbon`
- `risk_register`
- `decision_log`
- `priority_stack`
- `attention_queue`
- `budget_burn_card`
- `forecast_card`
- `milestone_tracker`

Use cases:

- daily CEO briefing,
- weekly operating review,
- budget/risk review,
- what needs attention,
- what changed overnight.

### Work management components

- `work_board_summary`
- `work_column_summary`
- `work_item_card`
- `work_item_list`
- `work_item_table`
- `work_item_properties`
- `task_plan`
- `progress_steps`
- `milestone_plan`
- `dependency_map`
- `blocker_list`
- `execution_lock_card`
- `deferred_wakeup_card`
- `work_item_activity_timeline`
- `liveness_panel`

Important rule:

Generated UI can present work state and recommended changes. Actual status/priority/assignment mutations must route through Control API actions with server validation.

### Data/analytics components

- `data_table`
- `pivot_table_summary`
- `comparison_matrix`
- `sortable_list`
- `filter_bar`
- `saved_view_selector`
- `line_chart`
- `bar_chart`
- `stacked_bar_chart`
- `donut_chart`
- `area_chart`
- `scatter_plot`
- `funnel_chart`
- `cohort_table`
- `heatmap_grid`
- `sparkline`
- `chart_insight_card`

Use cases:

- sales pipeline,
- competitor comparison,
- SEO keyword table,
- scraper output,
- lead list,
- cost by agent/model,
- throughput by work status.

Validation:

- inline table max 100 rows x 12 columns,
- chart max 500 points,
- max 8 series,
- all charts require text summaries,
- chart data must come from DataSourceRefs or small inline data,
- large data must be artifact-backed.

### Report/document components

- `markdown_block`
- `markdown_document`
- `report_cover`
- `report_section`
- `executive_memo`
- `table_of_contents`
- `citation_list`
- `appendix_list`
- `callout`
- `finding_card`
- `recommendation_card`
- `source_card`
- `pdf_report_card`
- `export_options_card`

Validation:

- no raw HTML,
- safe Markdown renderer,
- long reports stored as artifacts,
- citations reference source artifacts/URLs/dataset rows,
- PDFs are generated/exported artifacts, not inline binary blobs.

### Artifact/preview components

- `artifact_card`
- `artifact_grid`
- `artifact_list`
- `artifact_bundle`
- `preview_card`
- `browser_preview_card`
- `website_preview_card`
- `pdf_preview_card`
- `image_preview_card`
- `code_artifact_card`
- `diff_artifact_card`
- `dataset_artifact_card`
- `miro_board_card`
- `export_package_card`

Validation:

- preview URLs are backend-issued/signed,
- no `javascript:`, `data:`, `file:` URLs,
- unknown content types render metadata/download cards,
- browser previews run only on approved origins,
- no WebView token bridge.

### Approval/decision components

- `approval_card`
- `approval_queue`
- `approval_detail`
- `risk_review_card`
- `command_preview`
- `diff_review`
- `spend_approval_card`
- `external_write_approval`
- `destructive_action_warning`
- `decision_required_card`

Validation:

- actions reference approvalId/actionId,
- labels are allowlisted,
- risk level required,
- audit target required,
- risky actions require approval.

### Agent/run operations components

- `run_timeline`
- `run_status_card`
- `run_ledger`
- `transcript_view`
- `tool_call_card`
- `terminal_output`
- `code_block`
- `cost_usage_card`
- `model_provider_card`
- `agent_roster`
- `agent_org_chart`
- `active_agents_panel`
- `runtime_health_card`
- `checkpoint_card`
- `retry_recovery_card`

Validation:

- server-derived statuses and costs only,
- logs redacted before persistence/render,
- large logs as artifacts,
- no fake model-invented system states.

### Tool/form components

- `form_card`
- `input_text`
- `input_textarea`
- `input_select`
- `input_multiselect`
- `input_date`
- `input_number`
- `input_currency`
- `input_url`
- `input_file_ref`
- `toggle_group`
- `checklist`
- `action_button`
- `action_group`
- `wizard`
- `configuration_panel`
- `calculator_summary`

Validation:

- form schema required,
- input limits required,
- sensitive fields require secret policy,
- submissions have idempotency keys,
- actions map to allowlisted Control API commands.

### Scraper/research components

- `scraper_job_card`
- `source_status_table`
- `crawl_progress_card`
- `extracted_records_table`
- `source_quality_card`
- `change_detection_feed`
- `competitor_tracker`
- `lead_pipeline_table`
- `evidence_board`
- `citation_graph`
- `research_matrix`
- `monitoring_alert_card`

Validation:

- source URLs pass backend URL policy,
- scraped data is artifact-backed when large,
- source capture timestamp displayed,
- extraction confidence displayed when available,
- no cookies/credentials shown,
- external links open safely.

## Data source model

Agents bind components to data through references, not direct arbitrary queries or raw credentials.

DataRef types:

- `inlineData` for tiny static data only,
- `artifactRef` for JSON/CSV/Markdown/PDF/datasets,
- `queryRef` for backend-approved queries,
- `workItemQueryRef` for work boards/lists,
- `runEventRef` for ledgers/transcripts,
- `controlApiQueryRef` for server-owned dashboard data,
- `s3ObjectRef` as metadata only; clients fetch through Control API signed URLs,
- `externalUrlRef` for safe external links.

Example:

```json
{
  "type": "artifactRef",
  "artifactId": "artifact-123",
  "path": "tables/competitors.json",
  "contentType": "application/json",
  "sha256": "...",
  "schemaRef": "schemas/competitor_matrix.v1"
}
```

Rules:

- no raw AWS credentials,
- no arbitrary signed URLs from agents,
- no hidden external fetches from clients,
- server resolves and authorizes refs,
- large data is paginated/sampled.

## GenUI surface spec shape

A saved surface should look like this conceptually:

```json
{
  "schemaVersion": "2026-05-GenUI-v1",
  "surfaceKind": "dashboard",
  "title": "Scraped Pricing Intelligence",
  "layout": {
    "type": "grid",
    "columns": 12,
    "sections": [
      {
        "id": "overview",
        "title": "Overview",
        "components": ["metric-total-products", "chart-price-distribution", "products-table"]
      }
    ]
  },
  "dataSources": [
    {
      "id": "products",
      "ref": "ds_abc123",
      "projection": {
        "fields": ["name", "price", "vendor", "url", "capturedAt"]
      }
    }
  ],
  "components": [
    {
      "id": "metric-total-products",
      "type": "metric_card",
      "title": "Products scraped",
      "data": { "source": "products", "operation": "count" }
    },
    {
      "id": "chart-price-distribution",
      "type": "bar_chart",
      "title": "Average price by vendor",
      "data": { "source": "products", "x": "vendor", "y": "price", "aggregate": "avg" }
    },
    {
      "id": "products-table",
      "type": "data_table",
      "title": "Product table",
      "data": { "source": "products" },
      "columns": [
        { "field": "name", "label": "Name" },
        { "field": "price", "label": "Price", "format": "currency" },
        { "field": "vendor", "label": "Vendor" },
        { "field": "url", "label": "URL", "format": "link" }
      ]
    }
  ],
  "actions": [
    {
      "id": "export-csv",
      "type": "export",
      "label": "Export CSV",
      "policy": "none",
      "target": "products"
    }
  ]
}
```

## Protocol/events needed

Keep `packages/protocol` as source of truth.

Event families:

```text
work_item.created
work_item.updated
work_item.status_changed
work_item.run_linked
work_item.artifact_linked
work_item.surface_linked

data_source.registered
data_source.updated
data_source.invalidated

surface.proposed
surface.validated
surface.created
surface.updated
surface.published
surface.validation_failed
surface.action_requested
surface.action_result

report.generation_started
report.generated
report.exported
```

Existing events stay:

```text
run.status
artifact.created
a2ui.delta    # live/incremental only, not long-term durable saved surface identity
```

Recommended event payloads:

```json
{
  "type": "surface.created",
  "workspaceId": "workspace-123",
  "workItemId": "work-123",
  "runId": "run-123",
  "surfaceId": "surface-123",
  "surfaceKind": "dashboard",
  "title": "Scraped Pricing Intelligence",
  "catalogId": "agents_cloud.business.v0",
  "version": 1,
  "specRef": {
    "uri": "s3://.../surface-v1.genui.json",
    "contentType": "application/vnd.agents-cloud.genui+json",
    "sha256": "...",
    "bytes": 12345
  },
  "dataSourceIds": ["ds_abc123"],
  "artifactIds": ["artifact-123"],
  "validation": {
    "status": "validated",
    "validatorVersion": "0.1.0"
  }
}
```

## Server validation pipeline

```text
agent output
  -> parse JSON
  -> validate event envelope
  -> validate GenUI schema version/catalog
  -> validate component tree/layout
  -> validate props per component type
  -> validate data refs and permissions
  -> validate actions and approval policy
  -> enforce size/rate limits
  -> store normalized spec/artifacts
  -> emit durable events
  -> realtime fanout only after durable commit
  -> client fetches authoritative spec/data through Control API
```

Validation must reject:

- arbitrary code,
- raw HTML/JS/CSS,
- unsafe URLs,
- unscoped data refs,
- cross-workspace references,
- oversized inline payloads,
- unsupported components,
- hidden destructive actions,
- fake server/system state,
- credentials/secrets in props.

## UX: what the user should see

### During work

The user sees:

- WorkItem status,
- active run status,
- latest meaningful step,
- current agent/team,
- next expected output,
- blockers/approvals,
- partial artifacts as they appear.

### At completion

The user receives:

- concise summary,
- final artifact(s),
- generated dashboard/report/tool if appropriate,
- confidence/limitations,
- suggested next steps,
- option to make it recurring, deeper, PDF, dashboard, or website/app.

### On mobile

Mobile should emphasize:

- notification cards,
- short status summaries,
- approve/reject/request changes,
- artifact preview/read mode,
- dashboard summary tabs,
- open full dashboard later on desktop/web.

### On desktop/web

Desktop/web should emphasize:

- command center,
- board/list/table of WorkItems,
- artifact workspaces,
- rich dashboards/tables/charts,
- embedded website/browser previews,
- report/PDF review,
- detailed run ledger/transcript.

## Product quality bar

Every generated surface should answer at least one of these questions:

- What happened?
- What matters?
- What changed?
- What is blocked?
- What needs approval?
- What is the risk/cost?
- What artifact was produced?
- What should happen next?
- Who/which agent owns it?
- Can I inspect, approve, retry, stop, or delegate safely?

If a component does not help answer those questions, it probably does not belong in v0/v1.

## Implementation architecture

### New/expanded durable entities

Recommended additions:

```text
WorkItemsTable
DataSourcesTable
SurfacesTable
WorkItemEvents or generalized EventsTable envelope
```

### DataSourcesTable

Purpose: register safe data refs for GenUI.

Primary key:

```text
workspaceId + dataSourceId
```

Fields:

```json
{
  "workspaceId": "...",
  "dataSourceId": "...",
  "ownerUserId": "...",
  "workItemId": "...",
  "runId": "...",
  "artifactId": "...",
  "kind": "artifact_json|artifact_csv|dataset|query_result|run_events|work_items",
  "name": "...",
  "storage": {
    "bucket": "...",
    "key": "...",
    "contentType": "application/json",
    "sha256": "...",
    "bytes": 12345
  },
  "schema": {
    "fields": [{ "name": "price", "type": "number", "semanticType": "currency" }],
    "rowCount": 1000
  },
  "accessPolicy": { "scope": "work_item" },
  "status": "active",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### SurfacesTable

Purpose: durable saved dashboards/reports/tools.

Primary key:

```text
workspaceId + surfaceId
```

Fields:

```json
{
  "workspaceId": "...",
  "surfaceId": "...",
  "workItemId": "...",
  "runId": "...",
  "ownerUserId": "...",
  "title": "Scraped Pricing Dashboard",
  "surfaceKind": "dashboard|report|tool|inspector|workflow",
  "catalogId": "agents_cloud.business.v0",
  "version": 1,
  "status": "draft|validated|published|archived|deleted",
  "specArtifactId": "artifact-123",
  "specUri": "s3://...",
  "specSha256": "...",
  "dataSourceIds": ["ds_123"],
  "artifactIds": ["artifact-123"],
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Control API endpoints

WorkItems first:

```text
POST   /work-items
GET    /work-items
GET    /work-items/{workItemId}
PATCH  /work-items/{workItemId}
POST   /work-items/{workItemId}/status
```

DataSources:

```text
POST   /data-sources
GET    /data-sources/{dataSourceId}
GET    /data-sources/{dataSourceId}/sample
GET    /work-items/{workItemId}/data-sources
GET    /runs/{runId}/data-sources
```

Surfaces:

```text
POST   /surfaces/proposals
POST   /surfaces/{surfaceId}/validate
POST   /surfaces/{surfaceId}/publish
GET    /surfaces/{surfaceId}
GET    /surfaces/{surfaceId}/spec
GET    /work-items/{workItemId}/surfaces
GET    /runs/{runId}/surfaces
PATCH  /surfaces/{surfaceId}
DELETE /surfaces/{surfaceId}
```

Actions:

```text
POST   /surfaces/{surfaceId}/actions/{actionId}
```

All mutating actions require server validation, authz, idempotency, and approval when required.

## Implementation phases

### Phase 1: WorkItem v0

Build the durable work object first.

Files likely touched:

- `packages/protocol/src/events.ts`
- `packages/protocol/schemas/events/work-item.schema.json`
- `infra/cdk/src/stacks/state-stack.ts`
- `services/control-api/src/work-items.ts`
- `services/control-api/src/dynamo-store.ts`
- `services/control-api/src/handlers.ts`
- `services/control-api/test/work-items.test.ts`
- `apps/web/lib/control-api.ts`
- `apps/web/app/work/page.tsx`

Validation:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm infra:build
pnpm infra:synth
pnpm web:typecheck
pnpm web:build
```

### Phase 2: DataSource registry

Make datasets queryable/reusable safely.

Files likely touched:

- `packages/protocol/schemas/events/data-source.schema.json`
- `infra/cdk/src/stacks/state-stack.ts`
- `services/control-api/src/data-sources.ts`
- `services/control-api/test/data-sources.test.ts`
- `services/agent-runtime/src/aws-artifact-sink.ts`
- `services/agent-runtime/src/worker.ts`

### Phase 3: GenUI validator and saved surfaces

Let agents propose dashboards/tools, but server validates before storage/render.

Files likely touched:

- `packages/protocol/schemas/genui/surface.schema.json`
- `packages/protocol/schemas/genui/components/*.schema.json`
- `services/control-api/src/genui/catalog.ts`
- `services/control-api/src/genui/validator.ts`
- `services/control-api/src/surfaces.ts`
- `services/control-api/test/surfaces.test.ts`
- `infra/cdk/src/stacks/state-stack.ts`

### Phase 4: Runtime generation path

Let workers create dataset/report/surface artifacts.

Files likely touched:

- `services/agent-runtime/src/worker.ts`
- `services/agent-runtime/src/ports.ts`
- `services/agent-runtime/src/aws-artifact-sink.ts`
- `services/agent-runtime/test/worker.test.ts`

### Phase 5: Web renderer

Render validated surfaces in the web app.

Files likely touched:

- `apps/web/lib/genui-types.ts`
- `apps/web/lib/genui-client.ts`
- `apps/web/components/genui/*`
- `apps/web/app/surfaces/[surfaceId]/page.tsx`
- `apps/web/app/work/[workItemId]/page.tsx`

### Phase 6: Flutter renderer

Render the same surfaces natively with `shadcn_flutter`.

Files likely touched:

- `apps/desktop_mobile/lib/features/genui/*`
- `apps/desktop_mobile/lib/features/work_board/*`
- `apps/desktop_mobile/test/*`

Validation:

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

### Phase 7: Actions, approvals, notifications

Turn dashboards/tools into safe interactive surfaces.

Files likely touched:

- `services/control-api/src/surface-actions.ts`
- `services/control-api/src/approvals.ts`
- `services/control-api/src/authz.ts`
- `packages/protocol/schemas/events/surface-action.schema.json`
- `apps/web/components/genui/action-button.tsx`
- `apps/desktop_mobile/lib/features/genui/presentation/components/action_button.dart`

### Phase 8: Evals and hardening

Add security and quality gates.

Tests/evals:

- prompt injection in Markdown/table cells,
- malicious URLs,
- cross-workspace DataSourceRef,
- unsupported components,
- oversized inline data,
- fake cost/status values,
- action without approval,
- large dataset pagination,
- mobile dashboard rendering.

## What to build next

Keep the earlier highest-ROI call:

```text
WorkItem v0 first.
```

But design WorkItem v0 to leave clean seams for:

- DataSourceRef,
- SurfaceRef,
- ArtifactRef,
- report/dashboard/tool artifacts,
- notifications,
- mobile review handoff.

Do not build a full GenUI low-code engine before WorkItem exists. Build the durable object first, then the safe data/component layer.

## Final product direction

Agents Cloud should make agents feel like reliable autonomous coworkers.

The user should be able to say:

```text
Track competitor pricing and send me a weekly report.
```

And the platform should create:

- a WorkItem,
- a scraping/monitoring run plan,
- dataset artifacts,
- a dashboard for live/recurring state,
- a Markdown/PDF report when ready,
- notifications for milestones/approvals/completion,
- an approval gate before publishing/sending/spending,
- a reusable surface the user can reopen later.

That is the direction: modular, configurable, agent-created interfaces powered by predefined, validated, battle-tested components.
