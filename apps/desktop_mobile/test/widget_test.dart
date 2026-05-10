import 'package:desktop_mobile/main.dart';
import 'package:desktop_mobile/src/auth/sign_in_page.dart';
import 'package:desktop_mobile/src/data/fixture_work_repository.dart';
import 'package:desktop_mobile/src/data/http_work_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

Widget _bootApp() {
  return ProviderScope(
    overrides: [
      authBypassProvider.overrideWith((ref) => true),
      workRepositoryProvider.overrideWith((ref) => FixtureWorkRepository()),
    ],
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

    expect(find.text('Agents'), findsWidgets);
    expect(find.text('Actions'), findsNothing);
    expect(find.text('Builder'), findsOneWidget);
    expect(find.byIcon(LucideIcons.audioLines), findsOneWidget);
    expect(find.byIcon(RadixIcons.bell), findsNothing);
    expect(find.byIcon(RadixIcons.trash), findsNothing);
    expect(find.byKey(const ValueKey('orb-control-voice-blob')), findsNothing);
    expect(
      find.byKey(const ValueKey('orb-control-offer-button')),
      findsOneWidget,
    );
    // No legacy clutter copy
    expect(find.text('CEO command center'), findsNothing);

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

    // Workspace now defaults to the top agent detail.
    expect(find.text('Executive'), findsWidgets);
    expect(find.text('Start the conversation.'), findsNothing);
    expect(find.byIcon(LucideIcons.audioLines), findsOneWidget);
    expect(find.byIcon(RadixIcons.bell), findsNothing);
    expect(find.byIcon(RadixIcons.trash), findsNothing);
    expect(find.text('Activity'), findsOneWidget);
    expect(find.text('Artifacts'), findsOneWidget);
    expect(find.text('Approvals'), findsNothing);
    await tester.tap(find.text('Work'));
    await _settle(tester);
    expect(find.text('Current focus'), findsOneWidget);
  });

  testWidgets('navigates the sidebar to Kanban, Browser, and UI Kit', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_bootApp());
    await _settle(tester);

    // Sidebar order: Agents(0), Kanban(1), Inbox(2), Browser(3), UI Kit(4).
    final navItems = find.byType(NavigationItem);
    expect(navItems, findsNWidgets(5));

    await tester.tap(navItems.at(1));
    await _settle(tester);
    expect(find.text('TODO'), findsOneWidget);
    expect(find.text('IN PROGRESS'), findsOneWidget);
    expect(find.text('REVIEW'), findsOneWidget);
    expect(find.text('DONE'), findsOneWidget);

    await tester.tap(navItems.at(3));
    await _settle(tester);
    expect(find.text('Embedded browser'), findsNothing);
    expect(find.text('WebView ready'), findsNothing);
    expect(find.text('Load'), findsNothing);
    expect(find.byIcon(RadixIcons.arrowRight), findsOneWidget);

    await tester.tap(navItems.at(4));
    await _settle(tester);
    expect(find.text('UI testing suite'), findsOneWidget);
  });

  testWidgets('mobile bottom nav exposes Work, Chat, and Agents only', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_bootApp());
    await _settle(tester);

    expect(find.text('Actions'), findsNothing);
    expect(find.text('Work'), findsOneWidget);
    expect(find.text('Chat'), findsOneWidget);
    expect(find.text('Agents'), findsOneWidget);
    expect(find.text('Browser'), findsNothing);

    await tester.tap(find.text('Chat'));
    await _settle(tester);
    expect(find.byIcon(RadixIcons.chatBubble), findsWidgets);

    await tester.tap(find.text('Work'));
    await _settle(tester);
    expect(find.text('TODO'), findsOneWidget);
    expect(find.text('IN PROGRESS'), findsOneWidget);

    await tester.tap(find.text('Agents'));
    await _settle(tester);
    expect(find.text('Executive'), findsOneWidget);
    expect(find.text('Builder'), findsOneWidget);
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

  testWidgets(
    'assistant control stays top-bar first and shows orb only in voice mode',
    (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1440, 920);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_bootApp());
      await _settle(tester);

      expect(
        find.byKey(const ValueKey('orb-control-voice-blob')),
        findsNothing,
      );
      await tester.tap(find.byKey(const ValueKey('orb-control-offer-button')));
      await _settle(tester);
      expect(
        find.byKey(const ValueKey('orb-control-topbar-message')),
        findsOneWidget,
      );
      expect(find.textContaining('I can show you'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('orb-control-run-mock')));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.textContaining('Thinking through where'), findsOneWidget);
      expect(find.text('Executive'), findsWidgets);

      await tester.pump(const Duration(milliseconds: 650));
      expect(find.textContaining('Taking you to Kanban'), findsOneWidget);

      await tester.pump(const Duration(milliseconds: 650));
      expect(
        find.textContaining('Opening the preview surface'),
        findsOneWidget,
      );

      await tester.pump(const Duration(milliseconds: 650));
      expect(find.textContaining('Now I need your approval'), findsOneWidget);
      expect(find.textContaining('Publish launch-demo'), findsOneWidget);

      await tester.tap(find.text('Voice'));
      await _settle(tester);
      expect(
        find.byKey(const ValueKey('orb-control-voice-blob')),
        findsOneWidget,
      );
      expect(find.textContaining('Voice walkthrough active'), findsWidgets);

      await tester.tap(find.text('Text'));
      await _settle(tester);
      expect(
        find.byKey(const ValueKey('orb-control-voice-blob')),
        findsNothing,
      );
      expect(find.textContaining('Voice paused'), findsOneWidget);
    },
  );

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
    expect(find.text('Continue to your workspace'), findsOneWidget);
  });
}
