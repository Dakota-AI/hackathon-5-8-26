import 'package:desktop_mobile/main.dart';
import 'package:fl_chart/fl_chart.dart';
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

    expect(find.text('Agents Cloud'), findsWidgets);
    expect(find.text('Work'), findsWidgets);
    expect(find.text('CEO command center'), findsNothing);
    expect(find.text('Autonomous company console'), findsNothing);
    expect(find.text('Amplify Auth configured'), findsNothing);
    expect(find.text('Control API live'), findsNothing);
    expect(find.text('GenUI ready'), findsNothing);
    expect(find.text('Work board'), findsOneWidget);
  });

  testWidgets('renders fixture-backed WorkItem UI in the command center', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: AgentsCloudConsoleApp()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Work board'), findsOneWidget);
    expect(find.text('Track competitor pricing'), findsWidgets);
    expect(find.text('Prepare launch preview site'), findsOneWidget);
    expect(
      find.text('Review dashboard and approve weekly monitoring'),
      findsWidgets,
    );
    expect(find.text('Dashboard generated'), findsOneWidget);
    expect(find.text('Pricing review dashboard'), findsOneWidget);
    expect(find.text('Approve weekly monitor'), findsOneWidget);
  });

  testWidgets('navigates to GenUI lab, browser, and UI kit pages', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: AgentsCloudConsoleApp()),
    );

    await tester.tap(find.byType(NavigationItem).at(1));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('GenUI component lab'), findsOneWidget);
    expect(find.text('Generated surface preview'), findsOneWidget);
    expect(find.text('Live GenUI Surface'), findsWidgets);
    expect(find.byType(LineChart), findsOneWidget);
    expect(find.byType(BarChart), findsOneWidget);
    expect(find.byType(PieChart), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Agent chat states'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Agent chat states'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Loading states'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Loading states'), findsOneWidget);

    await tester.tap(find.byType(NavigationItem).at(2));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Embedded browser'), findsOneWidget);
    expect(find.text('https://example.com'), findsWidgets);
    expect(find.text('Load URL'), findsOneWidget);
    expect(find.text('Back'), findsOneWidget);
    expect(find.text('Reload'), findsOneWidget);
    expect(find.text('WebView ready'), findsOneWidget);
    expect(find.text('Preview opened inside the app'), findsOneWidget);

    await tester.tap(find.byType(NavigationItem).at(3));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('UI testing suite'), findsOneWidget);
    expect(find.text('Buttons'), findsOneWidget);
    expect(find.text('Indicators'), findsOneWidget);
    expect(find.text('Approval card'), findsOneWidget);
  });

  testWidgets('collapses sidebar to icon rail with shadcn tooltips', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: AgentsCloudConsoleApp()),
    );
    await tester.tap(find.byKey(const ValueKey('sidebar-collapse-button')));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('GenUI Lab'), findsNothing);
    expect(find.byType(Tooltip), findsWidgets);

    await tester.tap(find.byKey(const ValueKey('sidebar-collapse-button')));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('GenUI Lab'), findsOneWidget);
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

    expect(find.text('Work'), findsWidgets);
    expect(find.text('Browser'), findsOneWidget);
    expect(find.text('Kit'), findsOneWidget);
    expect(find.text('Command Center'), findsNothing);
    expect(find.text('Work board'), findsOneWidget);
    expect(find.text('Create WorkItem'), findsOneWidget);
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
    await tester.tap(find.byType(NavigationItem).at(2));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Embedded browser'), findsOneWidget);
    expect(find.text('Preview opened inside the app'), findsOneWidget);
    expect(find.text('Load URL'), findsOneWidget);
    expect(find.text('Back'), findsOneWidget);
    expect(find.text('Reload'), findsOneWidget);
    expect(find.text('WebView ready'), findsOneWidget);
    expect(find.text('Open external'), findsOneWidget);
    expect(find.text('Copy URL'), findsOneWidget);
  });
}
