# Web + Flutter Real-API Wiring (2026-05-10)

Scope: hand the freshly-deployed Control API (WorkItems, Runs, Events,
Artifacts + presigned-download, DataSourceRefs, Surfaces) to both clients
and stop them from rendering fixture data when a real user is signed in.

## Backend baseline this slice consumes

- Live API: `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`
- Live web: `https://main.dkqxgsrxe1fih.amplifyapp.com/`
- Auth: Cognito JWT via Amplify Auth.
- Routes wired (already deployed before this slice): see
  `docs/roadmap/ARTIFACT_API_DEPLOYMENT_2026_05_10.md` and
  `docs/roadmap/DATASOURCE_SURFACE_API_DEPLOYMENT_2026_05_10.md`.

## Workspace membership decision

Skipped for this slice. Rationale:

- Every existing record has a single `userId` and every read enforces
  `record.userId === user.userId` server-side.
- For single-tenant-per-user wiring (which is the current product reality
  while access-code onboarding is not yet built), this is sufficient
  isolation: a user can only see their own WorkItems, Runs, Events,
  Artifacts, DataSourceRefs, and Surfaces.
- Workspace membership becomes a hard requirement as soon as more than one
  Cognito identity needs to share a workspace. That work is tracked in
  `docs/roadmap/TENANT_AUTHORIZATION_AND_ACCESS_CODES_PLAN_2026_05_10.md`
  and will be picked up after access-code onboarding lands.

## Web changes (Next.js, apps/web)

Audit found the web client was **already** wired end-to-end against the
real Control API via `apps/web/lib/control-api.ts` (createWorkItem,
listWorkItems, listRunArtifacts, getArtifactDownloadUrl, etc) and
`apps/web/lib/use-work-items.ts` already loaded real data when
`getControlApiHealth().configured` AND user is signed-in. ArtifactsBoard
already opens the presigned URL with `window.open(...)`.

Concrete change: `apps/web/test/work-items.test.ts` got a new test
asserting that `listControlApiWorkItems` actually hits
`/work-items?...workspaceId=...` with `Authorization: Bearer <id-token>`,
and parses the `workItems` array. The web `test` script now passes
`--experimental-test-module-mocks` so the test can stub
`aws-amplify/auth` and `global.fetch`.

Validation: `pnpm --filter @agents-cloud/web test` 29/29; typecheck
clean; build clean (9 routes, static export). Amplify build #41 RUNNING
for the latest commit; build #40 already SUCCEED for the web-only pass.

Commit: `42e0961 test(web): cover real-data path for listControlApiWorkItems`.

## Flutter changes (apps/desktop_mobile)

The big work landed in sibling commit `3c3cc0e`:

- `apps/desktop_mobile/lib/src/data/http_work_repository.dart` (NEW, 345 lines)
  — implements the same `WorkRepository` interface as
  `FixtureWorkRepository` but delegates to the existing
  `apps/desktop_mobile/lib/src/api/control_api.dart` `ControlApi` class.
  Exposes `workRepositoryProvider` (Riverpod) which returns
  `HttpWorkRepository` when authed and `FixtureWorkRepository` when not.
- `apps/desktop_mobile/lib/src/api/control_api.dart` (+15) — added
  `getArtifactDownload({runId, artifactId})` that calls
  `GET /runs/{runId}/artifacts/{artifactId}/download` and returns the
  decoded `{url, expiresAt, expiresInSeconds, artifact}` body.
- `apps/desktop_mobile/lib/src/widgets/kanban_board.dart` — switched
  from `kanbanWorkRepositoryProvider` (fixture-only) to the unified
  `workRepositoryProvider` so the board renders live Control API data
  when signed in.
- `apps/desktop_mobile/lib/src/domain/work_item_models.dart` (+4) —
  optional `runId` on `WorkItemArtifactSummary` so the UI can call the
  presigned-download endpoint with the right `(runId, artifactId)` tuple.
- `apps/desktop_mobile/pubspec.yaml` — `url_launcher: ^6.3.2` so
  presigned URLs open in the OS browser.

Independent code review (delegated to a sub-agent) flagged two real
risks in the original sibling code; this hand-off (`f49f990`) fixes
both:

1. Trust default flip in `_decodeValidation`: the original switch used
   `serverValidated` as the default branch, so any unknown / missing /
   misspelled validation field marked surfaces as server-validated in
   the UI. **Fixed**: only explicit `server_validated` / `validated` /
   `server-validated` strings now grant the validated badge; everything
   else falls through to `unvalidated`.

2. Silent fallback to fixtures masking real errors: original
   `listWorkItems` / `getWorkItem` caught every throwable with `catch
   (_)` and returned demo fixture data. So a 500 / parse error on a
   signed-in account would silently show "Track competitor pricing"
   etc as if it were the user's real work. **Fixed**: only `StateError`
   (the unauthenticated path that ControlApi throws) falls back to
   fixtures; real HTTP/network/parse errors are now logged via
   `dart:developer` and `rethrow`n so the FutureProvider surfaces a
   proper error state. Per-side-endpoint failures inside `getWorkItem`
   (runs/events/artifacts) are still tolerated as empty lists but each
   failure is logged.

Test rewrite: `apps/desktop_mobile/test/data/http_work_repository_test.dart`
now uses a `_FakeControlApi` that injects throws on demand. New
coverage:

- side-endpoint failure inside `getWorkItem` → empty list (not crash)
- empty `getWorkItem` body → `null` (no fixture leak)
- unknown validation token → `unvalidated` (regression test for fix #1)
- `StateError` → fallback returns the *exact* `FixtureWorkRepository`
  set, not just any non-empty list
- non-StateError exception → rethrows (regression test for fix #2)

Validation: `flutter analyze` clean (only pre-existing infos / warnings
in unrelated sibling files), `flutter test` 20/20 pass.

## Files committed in this hand-off

- `apps/web/package.json` — added node test runner module-mocks flag.
- `apps/web/test/work-items.test.ts` — added real-API path test.
- `apps/desktop_mobile/lib/src/data/http_work_repository.dart` —
  hardened failure policy + flipped trust default.
- `apps/desktop_mobile/test/data/http_work_repository_test.dart` —
  expanded negative-path coverage including the two regression tests.

## What was deliberately not committed

- `apps/desktop_mobile/lib/main.dart` — heavily entangled with sibling
  voice-mode + chat-screen + conversation work that lives in untracked
  `lib/src/screens/`, `lib/src/conversation/`, `lib/src/llm/`,
  `lib/src/notifications/`, `lib/src/tts/`, `lib/src/ui/` directories.
  The sibling agent shipping that slice owns the main.dart wiring
  commit. Confirmed the `HttpWorkRepository` itself is already wired
  via `workRepositoryProvider` + `kanban_board.dart` (committed in
  `3c3cc0e`) so this slice is functionally complete without touching
  main.dart.
- Sibling-added pubspec dependencies (`amplify_api`, `flutter_webrtc`,
  `flutter_callkit_incoming`, `flutter_tts`, `speech_to_text`,
  `audioplayers`, `flutter_local_notifications`, `path_provider`,
  `flutter_timezone`, `timezone`) — all already in committed pubspec
  via `3c3cc0e`; not in scope for this hand-off.

## Next steps

The product spine is now real on both clients. Reasonable next picks:

1. Workspace membership authorization (cross-cutting, gates all reads
   when multiple users share a workspace).
2. Resident-runner real model/provider execution boundary so produced
   artifacts contain real generated app output instead of the smoke
   worker report.
3. Wildcard preview hosting for published Surfaces.
4. Stale-runner alerts + admin failure-first views.
