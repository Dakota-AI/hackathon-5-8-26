import 'package:desktop_mobile/main.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('boots Paperclip-style Agents Cloud command center', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: AgentsCloudConsoleApp()),
    );
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Agents Cloud'), findsOneWidget);
    expect(find.text('Command Center'), findsOneWidget);
    expect(find.text('CEO command center'), findsOneWidget);
    expect(find.text('Paperclip-style control plane'), findsOneWidget);
    expect(find.text('Live GenUI surface'), findsOneWidget);
    expect(find.text('Google GenUI bridge'), findsOneWidget);
    expect(find.text('A2UI v0.9'), findsOneWidget);
    expect(find.text('Autonomous run timeline'), findsOneWidget);
  });

  testWidgets('navigates to planning pages', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: AgentsCloudConsoleApp()),
    );
    await tester.tap(find.text('Agents & Teams'));
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text(
        'Paperclip-inspired org chart, specialist profiles, team staffing, budgets, and heartbeats.',
      ),
      findsOneWidget,
    );
    expect(find.text('Executive agent'), findsOneWidget);

    await tester.tap(find.text('Miro Boards'));
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text(
        'Miro OAuth + MCP broker for board context, diagrams, docs, tables, prototypes, and Sidekick-like collaboration.',
      ),
      findsOneWidget,
    );
    expect(find.text('Create diagrams'), findsOneWidget);
  });
}
