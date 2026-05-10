import 'dart:convert';

import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'agent_browser_protocol.dart';

const String agentBrowserBootstrapScript = r'''
(() => {
  if (window.__agentsCloudBrowser && window.__agentsCloudBrowser.version === 1) {
    return;
  }

  const state = { nextId: 1, elements: new Map() };
  const interactiveSelector = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    'summary',
    '[role]',
    '[onclick]',
    '[contenteditable="true"]',
    '[tabindex]'
  ].join(',');

  function compact(value, max = 240) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function visible(element) {
    if (!element || !(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
      return false;
    }
    return rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left <= window.innerWidth;
  }

  function elementLabel(element) {
    return compact(
      element.getAttribute('aria-label') ||
      element.getAttribute('alt') ||
      element.getAttribute('title') ||
      element.getAttribute('placeholder') ||
      element.value ||
      element.innerText ||
      element.textContent ||
      element.href ||
      element.name ||
      element.id ||
      element.tagName
    );
  }

  function elementRole(element) {
    return compact(element.getAttribute('role') || element.type || element.tagName.toLowerCase(), 80);
  }

  function idFor(element) {
    for (const [id, existing] of state.elements.entries()) {
      if (existing === element) return id;
    }
    const id = `ac-${state.nextId++}`;
    state.elements.set(id, element);
    return id;
  }

  function describe(element) {
    const rect = element.getBoundingClientRect();
    const escapedId = element.id
      ? (window.CSS && CSS.escape ? CSS.escape(element.id) : element.id.replace(/"/g, '\\"'))
      : '';
    return {
      id: idFor(element),
      tag: element.tagName.toLowerCase(),
      role: elementRole(element),
      label: elementLabel(element),
      text: compact(element.innerText || element.textContent, 500),
      href: element.href || null,
      selector: escapedId ? `#${escapedId}` : null,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  function collectElements(maxElements) {
    const nodes = Array.from(document.querySelectorAll(interactiveSelector));
    return nodes.filter(visible).slice(0, maxElements || 80).map(describe);
  }

  function markdown(maxChars) {
    const out = [];
    const nodes = Array.from(document.body ? document.body.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,p,li,a,button,label,input,textarea,select,th,td'
    ) : []);
    for (const node of nodes) {
      if (!visible(node)) continue;
      const tag = node.tagName.toLowerCase();
      const text = elementLabel(node);
      if (!text) continue;
      if (tag === 'h1') out.push(`# ${text}`);
      else if (tag === 'h2') out.push(`## ${text}`);
      else if (tag === 'h3') out.push(`### ${text}`);
      else if (tag === 'li') out.push(`- ${text}`);
      else if (tag === 'a' && node.href) out.push(`[${text}](${node.href})`);
      else if (tag === 'button') out.push(`[button: ${text}]`);
      else if (tag === 'input' || tag === 'textarea' || tag === 'select') out.push(`[field: ${text}]`);
      else out.push(text);
      if (out.join('\n').length > (maxChars || 8000)) break;
    }
    return out.join('\n').slice(0, maxChars || 8000);
  }

  function snapshot(options = {}) {
    const maxElements = options.maxElements || 80;
    const maxTextChars = options.maxTextChars || 8000;
    const elements = collectElements(maxElements);
    return {
      ok: true,
      action: 'snapshot',
      message: `Captured ${elements.length} visible controls`,
      url: location.href,
      title: document.title || '',
      text: compact(document.body ? document.body.innerText : '', maxTextChars),
      markdown: markdown(maxTextChars),
      scroll: {
        x: Math.round(window.scrollX),
        y: Math.round(window.scrollY),
        viewportWidth: Math.round(window.innerWidth),
        viewportHeight: Math.round(window.innerHeight),
        bodyWidth: Math.round(document.documentElement.scrollWidth || 0),
        bodyHeight: Math.round(document.documentElement.scrollHeight || 0)
      },
      elements
    };
  }

  function byText(text) {
    const needle = compact(text, 240).toLowerCase();
    if (!needle) return null;
    const nodes = Array.from(document.querySelectorAll(interactiveSelector));
    return nodes.find((node) => visible(node) && elementLabel(node).toLowerCase().includes(needle)) || null;
  }

  function targetElement(target = {}) {
    if (target.agentId && state.elements.has(target.agentId)) return state.elements.get(target.agentId);
    if (target.selector) {
      try {
        const bySelector = document.querySelector(target.selector);
        if (bySelector) return bySelector;
      } catch (_) {}
    }
    if (target.text) return byText(target.text);
    return null;
  }

  function find(options = {}) {
    const query = compact(options.query || options.text || options.selector, 240);
    let matches = [];
    if (options.selector) {
      try {
        matches = Array.from(document.querySelectorAll(options.selector)).filter(visible);
      } catch (_) {
        matches = [];
      }
    } else if (query) {
      const needle = query.toLowerCase();
      matches = Array.from(document.querySelectorAll(interactiveSelector))
        .filter((node) => visible(node) && elementLabel(node).toLowerCase().includes(needle));
    }
    return {
      ...snapshot(options),
      action: 'find',
      message: `Found ${matches.length} matching controls`,
      matches: matches.slice(0, options.maxElements || 20).map(describe)
    };
  }

  function scrollByCommand(options = {}) {
    window.scrollBy({ top: Number(options.y || options.deltaY || 0), left: Number(options.x || 0), behavior: 'auto' });
    return { ...snapshot(options), action: 'scroll', message: 'Scrolled page' };
  }

  function click(options = {}) {
    const element = targetElement(options.target || options);
    if (!element) return { ...snapshot(options), ok: false, action: 'click', message: 'No matching element' };
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
    return { ...snapshot(options), action: 'click', message: `Clicked ${elementLabel(element) || element.tagName}` };
  }

  function fill(options = {}) {
    const element = targetElement(options.target || options);
    if (!element) return { ...snapshot(options), ok: false, action: 'fill', message: 'No matching field' };
    const value = String(options.value || '');
    element.focus();
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ...snapshot(options), action: 'fill', message: `Filled ${elementLabel(element) || element.tagName}` };
  }

  window.__agentsCloudBrowser = {
    version: 1,
    snapshot,
    find,
    scrollBy: scrollByCommand,
    click,
    fill
  };
})();
''';

const String agentBrowserSmokePageHtml = r'''
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Browser Smoke</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 32px; line-height: 1.45; }
    main { max-width: 760px; margin: 0 auto; }
    label, input, button, a { display: block; margin-top: 12px; }
    input { box-sizing: border-box; width: 100%; max-width: 360px; padding: 10px 12px; font: inherit; }
    button { padding: 10px 14px; font: inherit; }
    .spacer { height: 840px; border-top: 1px solid rgba(128, 128, 128, 0.35); margin-top: 28px; }
  </style>
</head>
<body>
  <main>
    <h1>Agent Browser Smoke</h1>
    <p>This local page validates observe, find, fill, click, and scroll commands inside the embedded WKWebView.</p>
    <label for="agent-probe-input">Agent probe name</label>
    <input id="agent-probe-input" name="agentProbeName" placeholder="Agent probe name" autocomplete="off">
    <button id="agent-probe-button" type="button">Confirm probe</button>
    <p id="agent-probe-result" role="status">Waiting for probe</p>
    <a id="agent-probe-link" href="https://example.com/#agent-probe">Example follow-up link</a>
    <div class="spacer"></div>
    <button id="agent-probe-bottom" type="button">Bottom checkpoint</button>
  </main>
  <script>
    document.getElementById('agent-probe-button').addEventListener('click', () => {
      const value = document.getElementById('agent-probe-input').value || 'empty';
      document.getElementById('agent-probe-result').textContent = `Probe confirmed: ${value}`;
    });
  </script>
</body>
</html>
''';

class AgentBrowserTarget {
  const AgentBrowserTarget({this.agentId, this.selector, this.text});

  factory AgentBrowserTarget.fromJson(Map<String, Object?> json) {
    return AgentBrowserTarget(
      agentId: _nullableString(json['agentId'] ?? json['id']),
      selector: _nullableString(json['selector']),
      text: _nullableString(json['text'] ?? json['label']),
    );
  }

  final String? agentId;
  final String? selector;
  final String? text;

  Map<String, Object?> toJson() => {
    if (agentId != null) 'agentId': agentId,
    if (selector != null) 'selector': selector,
    if (text != null) 'text': text,
  };
}

class AgentBrowserScroll {
  const AgentBrowserScroll({
    required this.x,
    required this.y,
    required this.viewportWidth,
    required this.viewportHeight,
    required this.bodyWidth,
    required this.bodyHeight,
  });

  factory AgentBrowserScroll.fromJson(Map<String, Object?> json) {
    return AgentBrowserScroll(
      x: _int(json['x']),
      y: _int(json['y']),
      viewportWidth: _int(json['viewportWidth']),
      viewportHeight: _int(json['viewportHeight']),
      bodyWidth: _int(json['bodyWidth']),
      bodyHeight: _int(json['bodyHeight']),
    );
  }

  final int x;
  final int y;
  final int viewportWidth;
  final int viewportHeight;
  final int bodyWidth;
  final int bodyHeight;

  Map<String, Object?> toJson() => {
    'x': x,
    'y': y,
    'viewportWidth': viewportWidth,
    'viewportHeight': viewportHeight,
    'bodyWidth': bodyWidth,
    'bodyHeight': bodyHeight,
  };
}

class AgentBrowserElement {
  const AgentBrowserElement({
    required this.id,
    required this.tag,
    required this.role,
    required this.label,
    required this.text,
    required this.href,
    required this.selector,
  });

  factory AgentBrowserElement.fromJson(Map<String, Object?> json) {
    return AgentBrowserElement(
      id: _string(json['id']),
      tag: _string(json['tag']),
      role: _string(json['role']),
      label: _string(json['label']),
      text: _string(json['text']),
      href: _nullableString(json['href']),
      selector: _nullableString(json['selector']),
    );
  }

  final String id;
  final String tag;
  final String role;
  final String label;
  final String text;
  final String? href;
  final String? selector;

  Map<String, Object?> toJson() => {
    'id': id,
    'tag': tag,
    'role': role,
    'label': label,
    'text': text,
    if (href != null) 'href': href,
    if (selector != null) 'selector': selector,
  };
}

class AgentBrowserResult {
  const AgentBrowserResult({
    required this.ok,
    required this.action,
    required this.message,
    required this.url,
    required this.title,
    required this.text,
    required this.markdown,
    required this.scroll,
    required this.elements,
    required this.matches,
  });

  factory AgentBrowserResult.fromJson(Map<String, Object?> json) {
    return AgentBrowserResult(
      ok: json['ok'] != false,
      action: _string(json['action']),
      message: _string(json['message']),
      url: _string(json['url']),
      title: _string(json['title']),
      text: _string(json['text']),
      markdown: _string(json['markdown']),
      scroll: AgentBrowserScroll.fromJson(_map(json['scroll'])),
      elements: _elements(json['elements']),
      matches: _elements(json['matches']),
    );
  }

  final bool ok;
  final String action;
  final String message;
  final String url;
  final String title;
  final String text;
  final String markdown;
  final AgentBrowserScroll scroll;
  final List<AgentBrowserElement> elements;
  final List<AgentBrowserElement> matches;

  Map<String, Object?> toJson() => {
    'ok': ok,
    'action': action,
    'message': message,
    'url': url,
    'title': title,
    'text': text,
    'markdown': markdown,
    'scroll': scroll.toJson(),
    'elements': elements.map((element) => element.toJson()).toList(),
    if (matches.isNotEmpty)
      'matches': matches.map((element) => element.toJson()).toList(),
  };
}

class AgentBrowserSmokeStep {
  const AgentBrowserSmokeStep({
    required this.name,
    required this.ok,
    required this.message,
  });

  final String name;
  final bool ok;
  final String message;

  Map<String, Object?> toJson() => {'name': name, 'ok': ok, 'message': message};
}

class AgentBrowserSmokeReport {
  const AgentBrowserSmokeReport({
    required this.steps,
    required this.lastResult,
  });

  final List<AgentBrowserSmokeStep> steps;
  final AgentBrowserResult? lastResult;

  int get passedCount => steps.where((step) => step.ok).length;

  bool get ok => steps.isNotEmpty && passedCount == steps.length;

  String get message {
    final status = ok ? 'passed' : 'failed';
    return 'Bridge smoke workflow $status ($passedCount/${steps.length})';
  }

  Map<String, Object?> toJson() => {
    'ok': ok,
    'message': message,
    'passedCount': passedCount,
    'stepCount': steps.length,
    'steps': steps.map((step) => step.toJson()).toList(),
    if (lastResult != null) 'lastResult': lastResult!.toJson(),
  };
}

class AgentBrowserJavaScript {
  const AgentBrowserJavaScript._();

  static String invoke(String method, Map<String, Object?> args) {
    final encodedArgs = jsonEncode(args);
    final encodedMethod = jsonEncode(method);
    return '''
(() => {
  $agentBrowserBootstrapScript
  const method = window.__agentsCloudBrowser[$encodedMethod];
  if (typeof method !== 'function') {
    return JSON.stringify({ ok: false, action: $encodedMethod, message: 'Unknown browser command' });
  }
  return JSON.stringify(method($encodedArgs));
})()
''';
  }
}

class AgentBrowserControl {
  AgentBrowserControl(this._controller, {AgentBrowserLogSink? logSink})
    : _logSink = logSink;

  final WebViewController _controller;
  final AgentBrowserLogSink? _logSink;
  bool _installed = false;

  Future<void> install() async {
    _log(AgentBrowserLogLevel.debug, 'install.start', 'Installing bridge');
    if (!_installed) {
      await _controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      final platform = _controller.platform;
      if (platform is WebKitWebViewController) {
        await platform.setInspectable(true);
      }
      _installed = true;
    }
    await _controller.runJavaScript(agentBrowserBootstrapScript);
    _log(AgentBrowserLogLevel.info, 'install.done', 'Bridge injected');
  }

  Future<AgentBrowserResult> snapshot({
    int maxElements = 80,
    int maxTextChars = 8000,
  }) {
    return _invoke('snapshot', {
      'maxElements': maxElements,
      'maxTextChars': maxTextChars,
    });
  }

  Future<AgentBrowserResult> find(String query, {int maxElements = 20}) {
    return _invoke('find', {'query': query, 'maxElements': maxElements});
  }

  Future<AgentBrowserResult> scrollBy({int x = 0, int y = 640}) {
    return _invoke('scrollBy', {'x': x, 'y': y});
  }

  Future<AgentBrowserResult> click(AgentBrowserTarget target) {
    return _invoke('click', {'target': target.toJson()});
  }

  Future<AgentBrowserResult> fill(AgentBrowserTarget target, String value) {
    return _invoke('fill', {'target': target.toJson(), 'value': value});
  }

  Future<AgentBrowserSmokeReport> runSmokeWorkflow({
    String fillValue = 'agent smoke passed',
  }) async {
    final steps = <AgentBrowserSmokeStep>[];
    AgentBrowserResult? lastResult;
    _log(
      AgentBrowserLogLevel.info,
      'smoke.start',
      'Starting browser smoke workflow',
    );

    Future<AgentBrowserResult?> runStep(
      String name,
      Future<AgentBrowserResult> Function() command,
      bool Function(AgentBrowserResult result) passed,
    ) async {
      final timer = Stopwatch()..start();
      _log(
        AgentBrowserLogLevel.info,
        'smoke.step.start',
        'Starting smoke step',
        fields: {'step': name},
      );
      try {
        final result = await command();
        timer.stop();
        lastResult = result;
        final ok = result.ok && passed(result);
        steps.add(
          AgentBrowserSmokeStep(
            name: name,
            ok: ok,
            message: ok
                ? result.message
                : 'Unexpected result: ${result.message}',
          ),
        );
        _log(
          ok ? AgentBrowserLogLevel.info : AgentBrowserLogLevel.warning,
          ok ? 'smoke.step.done' : 'smoke.step.failed',
          ok ? 'Completed smoke step' : 'Smoke step produced unexpected output',
          durationMs: timer.elapsedMilliseconds,
          fields: {'step': name, 'message': result.message},
        );
        return result;
      } catch (error) {
        timer.stop();
        steps.add(
          AgentBrowserSmokeStep(
            name: name,
            ok: false,
            message: error.toString(),
          ),
        );
        _log(
          AgentBrowserLogLevel.error,
          'smoke.step.error',
          'Smoke step threw',
          durationMs: timer.elapsedMilliseconds,
          fields: {'step': name, 'error': error.toString()},
        );
        return null;
      }
    }

    await runStep(
      'observe',
      () => snapshot(maxElements: 40, maxTextChars: 4000),
      (result) => _resultContains(result, 'Agent Browser Smoke'),
    );

    final fieldResult = await runStep(
      'find field',
      () => find('Agent probe name'),
      (result) => result.matches.isNotEmpty,
    );
    final fieldTarget =
        _firstTarget(fieldResult) ??
        const AgentBrowserTarget(selector: '#agent-probe-input');

    await runStep(
      'fill field',
      () => fill(fieldTarget, fillValue),
      (result) => _resultContains(result, fillValue),
    );

    final buttonResult = await runStep(
      'find button',
      () => find('Confirm probe'),
      (result) => result.matches.isNotEmpty,
    );
    final buttonTarget =
        _firstTarget(buttonResult) ??
        const AgentBrowserTarget(selector: '#agent-probe-button');

    await runStep(
      'click button',
      () => click(buttonTarget),
      (result) => result.ok,
    );

    await runStep(
      'confirm result',
      () => find('Probe confirmed'),
      (result) => _resultContains(result, 'Probe confirmed'),
    );

    await runStep(
      'scroll',
      () => scrollBy(y: 520),
      (result) => result.scroll.y > 0,
    );

    final report = AgentBrowserSmokeReport(
      steps: steps,
      lastResult: lastResult,
    );
    _log(
      report.ok ? AgentBrowserLogLevel.info : AgentBrowserLogLevel.warning,
      report.ok ? 'smoke.done' : 'smoke.failed',
      report.message,
      fields: {'passed': report.passedCount, 'total': report.steps.length},
    );
    return report;
  }

  Future<AgentBrowserResult> _invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (!_installed) {
      await install();
    }
    final timer = Stopwatch()..start();
    _log(
      AgentBrowserLogLevel.info,
      'dom.command.start',
      'Running DOM browser command',
      command: method,
      fields: {'args': _redactedArgs(args)},
    );
    try {
      final raw = await _controller.runJavaScriptReturningResult(
        AgentBrowserJavaScript.invoke(method, args),
      );
      final decoded = raw is String ? jsonDecode(raw) : raw;
      if (decoded is! Map) {
        throw StateError('Browser command returned ${decoded.runtimeType}');
      }
      final result = AgentBrowserResult.fromJson(
        decoded.cast<String, Object?>(),
      );
      timer.stop();
      _log(
        result.ok ? AgentBrowserLogLevel.info : AgentBrowserLogLevel.warning,
        result.ok ? 'dom.command.done' : 'dom.command.rejected',
        result.message,
        command: method,
        durationMs: timer.elapsedMilliseconds,
        fields: {
          'url': result.url,
          'title': result.title,
          'elements': result.elements.length,
          'matches': result.matches.length,
          'scrollY': result.scroll.y,
        },
      );
      return result;
    } catch (error) {
      timer.stop();
      _log(
        AgentBrowserLogLevel.error,
        'dom.command.error',
        'DOM browser command failed',
        command: method,
        durationMs: timer.elapsedMilliseconds,
        fields: {'error': error.toString()},
      );
      rethrow;
    }
  }

  void _log(
    AgentBrowserLogLevel level,
    String event,
    String message, {
    String? command,
    int? durationMs,
    Map<String, Object?> fields = const <String, Object?>{},
  }) {
    _logSink?.call(
      AgentBrowserLogEntry(
        level: level,
        event: event,
        message: message,
        command: command,
        durationMs: durationMs,
        fields: fields,
      ),
    );
  }
}

AgentBrowserTarget? _firstTarget(AgentBrowserResult? result) {
  final match = result == null || result.matches.isEmpty
      ? null
      : result.matches.first;
  if (match == null) return null;
  return AgentBrowserTarget(
    agentId: match.id,
    selector: match.selector,
    text: match.label.isEmpty ? match.text : match.label,
  );
}

bool _resultContains(AgentBrowserResult result, String needle) {
  final normalizedNeedle = needle.toLowerCase();
  bool contains(String value) => value.toLowerCase().contains(normalizedNeedle);
  return contains(result.title) ||
      contains(result.text) ||
      contains(result.markdown) ||
      result.elements.any(
        (element) => contains(element.label) || contains(element.text),
      ) ||
      result.matches.any(
        (element) => contains(element.label) || contains(element.text),
      );
}

Map<String, Object?> _redactedArgs(Map<String, Object?> args) {
  return args.map((key, value) {
    final lower = key.toLowerCase();
    if (lower.contains('value') ||
        lower.contains('password') ||
        lower.contains('token') ||
        lower.contains('secret')) {
      return MapEntry(key, '<redacted>');
    }
    if (value is Map) {
      return MapEntry(key, _redactedArgs(value.cast<String, Object?>()));
    }
    return MapEntry(key, value);
  });
}

int _int(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return 0;
}

String _string(Object? value) => value == null ? '' : value.toString();

String? _nullableString(Object? value) {
  final string = _string(value);
  return string.isEmpty ? null : string;
}

Map<String, Object?> _map(Object? value) {
  if (value is Map) return value.cast<String, Object?>();
  return const <String, Object?>{};
}

List<AgentBrowserElement> _elements(Object? value) {
  if (value is! List) return const <AgentBrowserElement>[];
  return value
      .whereType<Map>()
      .map((json) => AgentBrowserElement.fromJson(json.cast<String, Object?>()))
      .toList(growable: false);
}
