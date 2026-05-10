import 'package:desktop_mobile/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

void main() {
  testWidgets('boots Agents Cloud command center', (WidgetTester tester) async {
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
    expect(find.text('Autonomous control plane'), findsOneWidget);
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
    await tester.tap(find.byType(NavigationItem).at(2));
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text(
        'Agent-team org chart, specialist profiles, team staffing, budgets, and heartbeats.',
      ),
      findsOneWidget,
    );
    expect(find.text('Executive agent'), findsOneWidget);

    await tester.tap(find.byType(NavigationItem).at(4));
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text(
        'Miro OAuth + MCP broker for board context, diagrams, docs, tables, prototypes, and Sidekick-like collaboration.',
      ),
      findsOneWidget,
    );
    expect(find.text('Create diagrams'), findsOneWidget);
  });

  testWidgets('renders compact mobile shell without desktop sidebar', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: AgentsCloudConsoleApp()),
    );
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Command, runs, approvals'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Files'), findsOneWidget);
    expect(find.text('Command Center'), findsNothing);
    expect(find.text('Command the company. Track every run.'), findsOneWidget);
    expect(find.text('Create run'), findsOneWidget);
  });

  testWidgets('renders artifact, markdown, and browser preview surfaces', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: AgentsCloudConsoleApp()),
    );
    await tester.tap(find.byType(NavigationItem).at(3));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Artifact workspace'), findsOneWidget);
    expect(find.text('Markdown document viewer'), findsOneWidget);
    expect(find.text('Embedded browser shell'), findsOneWidget);
    expect(find.text('CEO launch memo.md'), findsOneWidget);
    expect(find.text('Embedded WebView preview slot'), findsOneWidget);
  });
}
