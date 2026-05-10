# Flutter WKWebView Agent Control Audit

Date: 2026-05-10
Status: Local control probe implemented

## Purpose

This note records the current audit and implementation slice for agent-style
control of the embedded Flutter browser on macOS/iOS.

The goal is not system-wide iOS automation. The goal is a bounded control layer
for the `WKWebView` embedded inside `apps/desktop_mobile`, with a future
`CLI -> WebSocket -> Flutter app -> WKWebView bridge` transport.

## Package Audited

Primary package:

- `webview_flutter_wkwebview` v3.25.1 from pub.dev
- Public package docs: https://pub.dev/packages/webview_flutter_wkwebview
- Dart API docs:
  https://pub.dev/documentation/webview_flutter_wkwebview/latest/webview_flutter_wkwebview/WebKitWebViewController-class.html
- Changelog: https://pub.dev/packages/webview_flutter_wkwebview/changelog

## Capability Findings

The upstream package is strong enough for a DOM-first browser-control layer.

Available through public Flutter/Dart APIs:

- `WebViewController.loadRequest`, `reload`, `goBack`, and `goForward`.
- `runJavaScript` and `runJavaScriptReturningResult`.
- `addJavaScriptChannel` for JavaScript-to-Dart callbacks.
- `WebKitWebViewController.setInspectable` for Safari/Web Inspector debugging.
- `scrollTo`, `scrollBy`, and `getScrollPosition`.
- `setOnScrollPositionChange` on iOS.
- navigation delegate callbacks, URL changes, load errors, console callbacks,
  cookies, permission callbacks, and user-agent controls.
- `webViewIdentifier` for a future native sidecar plugin to recover the
  underlying `WKWebView`.

Important limits:

- Upstream does not expose an app-level arbitrary `WKUserScript` helper.
- Upstream does not expose `WKContentWorld`, `callAsyncJavaScript`,
  snapshot/PDF/web-archive export, or macOS Accessibility fallback behavior.
- `setOnScrollPositionChange` is not implemented for macOS in the audited
  version, though `scrollBy`, `scrollTo`, and `getScrollPosition` exist.
- JavaScript channels are message callbacks, not a direct
  `WKScriptMessageHandlerWithReply` RPC surface.

## App Integration Delta

This slice intentionally avoids vendoring or patching the Flutter WebKit package.
The app uses upstream public APIs only:

- `WebKitWebViewController.setInspectable(true)` for local debugging.
- `WebViewController.runJavaScript(...)` to inject the bridge into the current
  page when the control layer installs or runs a command.

No native Swift/Pigeon changes were added in this slice.

## Implemented App Bridge

New app bridge:

- `apps/desktop_mobile/lib/src/browser/agent_browser_control.dart`

Current local command vocabulary:

- `snapshot`: title, URL, page text, markdown-ish extraction, scroll state, and
  visible controls.
- `find`: visible interactive elements by text/label or selector.
- `scrollBy`: bounded page scrolling.
- `click`: click a previously observed element id, selector, or text match.
- `fill`: fill a matched input-like element.

The browser page installs the bridge into the embedded WKWebView without
rendering any agent-control panel in the product UI.

The panel also includes a deterministic local smoke workflow:

1. Load a local in-memory smoke page.
2. Observe title, markdown, scroll state, and visible controls.
3. Find the probe input.
4. Fill the probe input.
5. Find and click the confirmation button.
6. Confirm the page changed through DOM extraction.
7. Scroll the page and capture the final state.

This gives the current slice a repeatable manual verification path on macOS and
iOS devices.

The app also has a dev-only loopback WebSocket bridge prepared for CLI-driven
testing:

- Enable it with `--dart-define=AGENTS_CLOUD_BROWSER_BRIDGE=true`.
- For local CLI smoke runs without signing in, also pass
  `--dart-define=AGENTS_CLOUD_AUTH_BYPASS=true`.
- Add `--dart-define=AGENTS_CLOUD_BROWSER_BRIDGE_AUTO_OPEN_BROWSER=true` to
  open directly to the Browser page for CLI smoke runs.
- The server binds to `127.0.0.1:48765` by default while the Browser page is
  mounted.
- Set `AGENTS_CLOUD_BROWSER_BRIDGE_PORT` to change the port.
- Set `AGENTS_CLOUD_BROWSER_BRIDGE_TOKEN` to require a matching `?token=...`.
- Run `dart run tool/agent_browser_bridge_probe.dart --verbose` from
  `apps/desktop_mobile` to drive the hidden bridge.

The bridge currently accepts JSON commands for `load_smoke_page`, `run_smoke`,
`snapshot`, `find`, `scroll_by`, `click`, `fill`, `navigate`, `reload`, `back`,
and `forward`. It logs command start, completion, failures, durations, scroll
state, page metadata, element counts, and WebSocket lifecycle events. Fill
values and token-like fields are redacted in structured logs.

Local macOS validation was run against the compiled app binary with the bridge
enabled on a non-default port. The CLI probe loaded the smoke page, extracted
markdown/text/control metadata, filled the input, clicked the confirmation
button, observed the DOM change, scrolled, and completed `run_smoke` with
`7/7` steps passing.

## Security And Product Boundary

This is intentionally client-local and foreground-only:

- no background iOS daemon,
- no system-wide UI automation,
- no WebSocket server enabled unless an explicit development dart-define is set,
- no raw production eval command,
- no tenant/workspace authority change,
- no external credential exposure.

Future transport must be explicit, authenticated, and bounded to the active
user/session. The client should only accept allowlisted browser commands and
must surface user takeover/yield states before an agent drives a visible page.

## Deferred Native Sidecar Work

Next native work, if needed:

1. Add snapshot/PDF/web-archive export through a small macOS/iOS plugin.
2. Add macOS Accessibility fallback behind explicit user permission and
   macOS-only gates.
3. Add richer WebKit script worlds or reply channels only if the DOM-first
   bridge proves insufficient.
4. Add a local WebSocket/CLI bridge with command allowlist, session tokens,
   user-visible status, and test coverage.
