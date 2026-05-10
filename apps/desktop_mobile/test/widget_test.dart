import 'package:desktop_mobile/main.dart';
import 'package:desktop_mobile/src/auth/sign_in_page.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart' hide Tooltip;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

Widget _bootApp() {
  return ProviderScope(
    overrides: [authBypassProvider.overrideWith((ref) => true)],
    child: const AgentsCloudConsoleApp(),
  );
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 200));
}

void main() {
  testWidgets('boots into the agents workspace with no clutter', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_bootApp());
    await _settle(tester);

    expect(find.text('Workspace'), findsOneWidget);
    expect(find.text('Executive'), findsOneWidget);
    expect(find.text('Builder'), findsOneWidget);
    // No legacy clutter copy
    expect(find.text('CEO command center'), findsNothing);
    expect(find.text('Local · fixtures'), findsNothing);
    expect(find.text('Amplify Auth configured'), findsNothing);
  });

  testWidgets('opens an agent detail with shadcn-style tabs', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_bootApp());
    await _settle(tester);

    await tester.tap(find.text('Executive'));
    await _settle(tester);

    expect(find.text('Overview'), findsOneWidget);
    expect(find.text('Activity'), findsOneWidget);
    expect(find.text('Artifacts'), findsOneWidget);
    expect(find.text('Approvals'), findsWidgets);
    expect(find.text('Current focus'), findsOneWidget);
  });

  testWidgets('navigates the sidebar to Kanban, Browser, GenUI, and UI Kit', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_bootApp());
    await _settle(tester);

    // Sidebar order: Agents(0), Kanban(1), Approvals(2), Browser(3),
    // GenUI Lab(4), UI Kit(5).
    final navItems = find.byType(NavigationItem);
    expect(navItems, findsNWidgets(6));

    await tester.tap(navItems.at(1));
    await tester.pumpAndSettle(const Duration(milliseconds: 300));
    expect(find.text('TODO'), findsOneWidget);
    expect(find.text('IN PROGRESS'), findsOneWidget);
    expect(find.text('REVIEW'), findsOneWidget);
    expect(find.text('DONE'), findsOneWidget);

    await tester.tap(navItems.at(3));
    await _settle(tester);
    expect(find.text('Embedded browser'), findsOneWidget);
    expect(find.text('Load URL'), findsOneWidget);

    await tester.tap(navItems.at(4));
    await _settle(tester);
    expect(find.byType(LineChart), findsOneWidget);
    expect(find.byType(BarChart), findsOneWidget);
    expect(find.byType(PieChart), findsOneWidget);

    await tester.tap(navItems.at(5));
    await _settle(tester);
    expect(find.text('UI testing suite'), findsOneWidget);
  });

  testWidgets('every sidebar nav item exposes a shadcn tooltip', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_bootApp());
    await _settle(tester);

    expect(find.byType(Tooltip), findsWidgets);

    // Collapse rail.
    await tester.tap(find.byKey(const ValueKey('sidebar-collapse-button')));
    await _settle(tester);
    expect(find.text('Kanban'), findsNothing);
    expect(find.byType(Tooltip), findsWidgets);
  });

  testWidgets('shows sign-in page when auth bypass is off and no session', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: AgentsCloudConsoleApp()),
    );
    await _settle(tester);
    await _settle(tester);

    expect(find.byType(SignInPage), findsOneWidget);
    expect(find.text('Sign in to continue'), findsOneWidget);
  });
}
