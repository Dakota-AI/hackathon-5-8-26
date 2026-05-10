# Desktop/Mobile Console

Flutter app for the native command center.

Current status:

- command-center shell exists,
- planning pages exist for runs, agents, artifacts, Miro, and approvals,
- local GenUI/A2UI preview surface exists,
- embedded WKWebView browser includes a local DOM-first agent-control probe,
- backend auth/API/realtime integrations are not wired yet.

Browser-control note:

- `webview_flutter_wkwebview` is overridden to the local fork at
  `packages/webview_flutter_wkwebview`.
- The fork currently exposes a tiny public `WKUserScript` helper used by
  `lib/src/browser/agent_browser_control.dart`.
- The Browser page keeps the bridge hidden and installs it in the embedded
  WKWebView. It does not render an agent-control sidebar.
- A dev-only loopback WebSocket bridge is available behind
  `AGENTS_CLOUD_BROWSER_BRIDGE=true` and is exercised by
  `tool/agent_browser_bridge_probe.dart`.
- The probe loads a local smoke page, then runs observe, find, fill, click,
  confirm, scroll, and full smoke workflow commands through the same wire-shaped
  command dispatcher planned for the future agent transport.

Useful commands:

```bash
flutter analyze
flutter test
flutter run -d macos
flutter run -d macos --dart-define=LLM_PROVIDER=hermes --dart-define=HERMES_BASE_URL=http://127.0.0.1:8643
flutter run -d macos --dart-define=AGENTS_CLOUD_AUTH_BYPASS=true --dart-define=AGENTS_CLOUD_BROWSER_BRIDGE=true --dart-define=AGENTS_CLOUD_BROWSER_BRIDGE_AUTO_OPEN_BROWSER=true
dart run tool/agent_browser_bridge_probe.dart --dry-run
dart run tool/agent_browser_bridge_probe.dart --verbose
```

The Dart package name is currently `desktop_mobile`; the app directory is
`apps/desktop_mobile`.
