import 'package:desktop_mobile/src/browser/agent_browser_control.dart';
import 'package:desktop_mobile/src/browser/agent_browser_protocol.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AgentBrowserControl models', () {
    test('parses page snapshots and visible element metadata', () {
      final result = AgentBrowserResult.fromJson({
        'ok': true,
        'action': 'snapshot',
        'message': 'Captured 1 visible controls',
        'url': 'https://example.com',
        'title': 'Example',
        'text': 'Example Domain',
        'markdown': '# Example Domain',
        'scroll': {
          'x': 0,
          'y': 120,
          'viewportWidth': 1024,
          'viewportHeight': 768,
          'bodyWidth': 1024,
          'bodyHeight': 1400,
        },
        'elements': [
          {
            'id': 'ac-1',
            'tag': 'a',
            'role': 'a',
            'label': 'More information',
            'text': 'More information',
            'href': 'https://iana.org/domains/example',
            'selector': '#more',
          },
        ],
      });

      expect(result.ok, isTrue);
      expect(result.markdown, '# Example Domain');
      expect(result.scroll.y, 120);
      expect(result.elements.single.id, 'ac-1');
      expect(result.elements.single.href, contains('iana.org'));
    });

    test('target JSON omits empty selector fields', () {
      final target = const AgentBrowserTarget(agentId: 'ac-2').toJson();

      expect(target, {'agentId': 'ac-2'});
    });
  });

  group('AgentBrowserJavaScript', () {
    test(
      'uses JSON encoded method arguments instead of string interpolation',
      () {
        final script = AgentBrowserJavaScript.invoke('find', {
          'query': 'Log in"; window.bad = true; //',
        });

        expect(script, contains('window.__agentsCloudBrowser'));
        expect(script, contains('JSON.stringify(method('));
        expect(script, contains(r'Log in\"; window.bad = true; //'));
        expect(script, isNot(contains('method(Log in')));
      },
    );

    test('keeps raw eval out of the command vocabulary', () {
      final script = AgentBrowserJavaScript.invoke('eval', {
        'source': 'document.cookie',
      });

      expect(script, contains('Unknown browser command'));
      expect(agentBrowserBootstrapScript, isNot(contains('eval(')));
    });
  });

  group('AgentBrowser smoke workflow', () {
    test('ships with a deterministic local probe page', () {
      expect(agentBrowserSmokePageHtml, contains('Agent Browser Smoke'));
      expect(agentBrowserSmokePageHtml, contains('agent-probe-input'));
      expect(agentBrowserSmokePageHtml, contains('Confirm probe'));
      expect(agentBrowserSmokePageHtml, contains('Probe confirmed'));
    });

    test('summarizes smoke pass and fail counts', () {
      const report = AgentBrowserSmokeReport(
        lastResult: null,
        steps: [
          AgentBrowserSmokeStep(name: 'observe', ok: true, message: 'ok'),
          AgentBrowserSmokeStep(name: 'click', ok: false, message: 'miss'),
        ],
      );

      expect(report.ok, isFalse);
      expect(report.passedCount, 1);
      expect(report.message, 'Bridge smoke workflow failed (1/2)');
    });
  });

  group('AgentBrowserCommandDispatcher', () {
    test('dispatches wire-shaped commands and logs redacted args', () async {
      final logs = <AgentBrowserLogEntry>[];
      final dispatcher = AgentBrowserCommandDispatcher(
        logSink: logs.add,
        handlers: {
          'fill': (request) async => {
            'received': request.args['value'],
            'target': request.args['target'],
          },
        },
      );

      final response = await dispatcher.dispatch(
        AgentBrowserCommandRequest.fromJson({
          'id': 'cmd-1',
          'command': 'fill',
          'args': {
            'target': {'selector': '#name'},
            'value': 'secret-ish user text',
          },
        }),
      );

      expect(response.ok, isTrue);
      expect(response.toJson()['id'], 'cmd-1');
      expect(response.toJson()['command'], 'fill');
      expect(logs.map((entry) => entry.event), contains('command.start'));
      expect(logs.first.toLine(), contains('<redacted>'));
      expect(logs.first.toLine(), isNot(contains('secret-ish user text')));
    });

    test('returns structured errors for unknown commands', () async {
      final dispatcher = AgentBrowserCommandDispatcher(handlers: const {});

      final response = await dispatcher.dispatch(
        AgentBrowserCommandRequest(id: 'cmd-2', command: 'eval'),
      );

      expect(response.ok, isFalse);
      expect(response.error, contains('Unknown browser command'));
    });
  });
}
