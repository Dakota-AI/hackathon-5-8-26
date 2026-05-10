import 'package:desktop_mobile/src/assistant_control/orb_control_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'client.control.requested moves orb controller to requested surface',
    () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final controller = container.read(orbControlControllerProvider.notifier);
      controller.applyRealtimeEvent({
        'type': 'client.control.requested',
        'payload': {
          'commandId': 'cmd-open-browser',
          'kind': 'show_page',
          'surface': 'browser',
          'message': 'Opening the report preview.',
        },
      });

      final state = container.read(orbControlControllerProvider);
      expect(state.presence, OrbControlPresence.topBar);
      expect(state.mode, OrbControlMode.controlling);
      expect(state.targetSurface, OrbControlSurface.browser);
      expect(state.statusLine, 'Opening the report preview.');
      expect(state.events.first.title, 'Client control requested');
    },
  );

  test('browser.control.requested targets the browser surface', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final controller = container.read(orbControlControllerProvider.notifier);
    controller.applyRealtimeEvent({
      'type': 'browser.control.requested',
      'payload': {
        'commandId': 'cmd-snapshot',
        'kind': 'snapshot',
        'message': 'Checking the generated report.',
      },
    });

    final state = container.read(orbControlControllerProvider);
    expect(state.targetSurface, OrbControlSurface.browser);
    expect(state.mode, OrbControlMode.controlling);
    expect(state.statusLine, 'Checking the generated report.');
  });

  test('user.call.requested becomes a top-bar approval prompt', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final controller = container.read(orbControlControllerProvider.notifier);
    controller.applyRealtimeEvent({
      'type': 'user.call.requested',
      'payload': {
        'title': 'Report ready',
        'summary': 'Want me to walk you through it?',
      },
    });

    final state = container.read(orbControlControllerProvider);
    expect(state.presence, OrbControlPresence.topBar);
    expect(state.mode, OrbControlMode.awaitingApproval);
    expect(state.pendingApproval, 'Want me to walk you through it?');
  });
}
