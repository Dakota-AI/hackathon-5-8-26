import 'dart:async';

import 'package:fl_chart/fl_chart.dart' as fl;
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:genui/genui.dart' as genui;
import 'package:markdown_widget/markdown_widget.dart' as md;
import 'package:shadcn_flutter/shadcn_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'backend_config.dart';
import 'src/api/control_api.dart';
import 'src/assistant_control/orb_control_controller.dart';
import 'src/assistant_control/orb_control_layer.dart';
import 'src/auth/auth_controller.dart';
import 'src/auth/sign_in_page.dart';
import 'src/browser/agent_browser_control.dart';
import 'src/browser/agent_browser_protocol.dart';
import 'src/browser/agent_browser_websocket_bridge.dart';
import 'src/data/fixture_work_repository.dart';
import 'src/data/http_work_repository.dart';
import 'src/domain/work_item_models.dart';
import 'src/realtime/realtime_client.dart';
import 'src/screens/chat_screen.dart';
import 'src/screens/voice_mode_screen.dart' show VoiceModeScreen;
import 'src/ui/brand_mark.dart';
import 'src/conversation/agent_inbox.dart';
import 'src/conversation/conversation_store.dart';
import 'src/conversation/store_persistence.dart';
import 'src/notifications/notification_service.dart';
import 'src/widgets/kanban_board.dart';
import 'src/widgets/squares_loader.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await AgentsCloudBackend.configureAmplify();
  } catch (e, st) {
    // Bad Amplify config must NOT prevent the UI from loading; the app
    // can still render in fixture/bypass mode and surface the error.
    debugPrint('Amplify configuration failed: $e\n$st');
  }
  try {
    // Notification permissions + iOS UN category for inline reply.
    // Wrapped: notification plugin failures (missing platform settings,
    // sandbox issues) must never black-screen the app at startup.
    await NotificationService.instance.init();
  } catch (e, st) {
    debugPrint('NotificationService init failed: $e\n$st');
  }
  runApp(const AgentsCloudConsoleApp());
}

enum ConsolePage {
  chat,
  work,
  kanban,
  genuiLab,
  browser,
  uiKit,
  agents,
  approvals,
  runs,
  artifacts,
  miro,
}

const _agentBrowserBridgeAutoOpen = bool.fromEnvironment(
  'AGENTS_CLOUD_BROWSER_BRIDGE_AUTO_OPEN_BROWSER',
);

final selectedPageProvider = StateProvider<ConsolePage>(
  (ref) => _agentBrowserBridgeAutoOpen ? ConsolePage.browser : ConsolePage.work,
);

final selectedAgentIdProvider = StateProvider<String?>((ref) => null);

final sidebarCollapsedProvider = StateProvider<bool>((ref) => true);

class AgentsCloudConsoleApp extends StatelessWidget {
  const AgentsCloudConsoleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      child: ShadcnApp(
        title: '',
        debugShowCheckedModeBanner: false,
        themeMode: ThemeMode.dark,
        theme: const ThemeData.dark(
          colorScheme: ColorSchemes.darkNeutral,
          radius: 0.45,
        ),
        home: const _AuthGate(),
      ),
    );
  }
}

class _AuthGate extends ConsumerStatefulWidget {
  const _AuthGate();

  @override
  ConsumerState<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends ConsumerState<_AuthGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authControllerProvider.notifier).bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final bypass = ref.watch(authBypassProvider);
    if (bypass || auth.status == AuthStatus.signedIn) {
      return const ConsoleShell();
    }
    if (auth.status == AuthStatus.unknown) {
      return const ColoredBox(
        color: _Palette.background,
        child: Center(child: SquaresLoader(size: 48)),
      );
    }
    return const SignInPage();
  }
}

class ConsoleShell extends ConsumerWidget {
  const ConsoleShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<OrbControlState>(orbControlControllerProvider, (previous, next) {
      if (previous?.targetRevision == next.targetRevision ||
          next.targetSurface == null) {
        return;
      }
      final page = switch (next.targetSurface!) {
        OrbControlSurface.agents => ConsolePage.work,
        OrbControlSurface.kanban => ConsolePage.kanban,
        OrbControlSurface.browser => ConsolePage.browser,
        OrbControlSurface.approvals => ConsolePage.approvals,
      };
      ref.read(selectedPageProvider.notifier).state = page;
      if (next.targetAgentId != null) {
        ref.read(selectedAgentIdProvider.notifier).state = next.targetAgentId;
      }
    });

    final controlState = ref.watch(orbControlControllerProvider);
    final selectedPage = controlState.targetSurface == null
        ? ref.watch(selectedPageProvider)
        : switch (controlState.targetSurface!) {
            OrbControlSurface.agents => ConsolePage.work,
            OrbControlSurface.kanban => ConsolePage.kanban,
            OrbControlSurface.browser => ConsolePage.browser,
            OrbControlSurface.approvals => ConsolePage.approvals,
          };
    final isCompact = MediaQuery.sizeOf(context).width < 760;

    final body = isCompact
        ? Column(
            children: [
              Expanded(child: _PageBody(page: selectedPage)),
              const Divider(height: 1, color: _Palette.border),
              _MobileNavBar(selectedPage: selectedPage),
            ],
          )
        : Row(
            children: [
              _Sidebar(selectedPage: selectedPage),
              const SizedBox(
                width: 1,
                child: ColoredBox(color: _Palette.border),
              ),
              Expanded(
                child: Column(
                  children: [
                    const _TopBar(),
                    const Divider(height: 1, color: _Palette.border),
                    Expanded(child: _PageBody(page: selectedPage)),
                  ],
                ),
              ),
            ],
          );

    return Scaffold(
      backgroundColor: _Palette.background,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(child: body),
            const OrbControlLayer(),
          ],
        ),
      ),
    );
  }
}

class _Sidebar extends ConsumerWidget {
  const _Sidebar({required this.selectedPage});

  final ConsolePage selectedPage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final collapsed = ref.watch(sidebarCollapsedProvider);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      width: collapsed ? 64 : 220,
      color: _Palette.sidebar,
      // Top padding clears macOS traffic-light overlay (transparent titlebar).
      padding: EdgeInsets.fromLTRB(
        collapsed ? 8 : 10,
        34,
        collapsed ? 8 : 10,
        10,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SidebarCollapseButton(collapsed: collapsed),
          const SizedBox(height: 12),
          _NavButton(
            label: 'Agents',
            icon: RadixIcons.group,
            page: ConsolePage.work,
            selected: selectedPage == ConsolePage.work,
            collapsed: collapsed,
          ),
          _NavButton(
            label: 'Kanban',
            icon: RadixIcons.layout,
            page: ConsolePage.kanban,
            selected: selectedPage == ConsolePage.kanban,
            collapsed: collapsed,
          ),
          _NavButton(
            label: 'Inbox',
            icon: RadixIcons.envelopeClosed,
            page: ConsolePage.approvals,
            selected: selectedPage == ConsolePage.approvals,
            collapsed: collapsed,
          ),
          _NavButton(
            label: 'Browser',
            icon: RadixIcons.globe,
            page: ConsolePage.browser,
            selected: selectedPage == ConsolePage.browser,
            collapsed: collapsed,
          ),
          _NavButton(
            label: 'UI Kit',
            icon: RadixIcons.tokens,
            page: ConsolePage.uiKit,
            selected: selectedPage == ConsolePage.uiKit,
            collapsed: collapsed,
          ),
          const Spacer(),
          if (!collapsed)
            Text(
              'v0.1 · local',
              style: TextStyle(
                color: _Palette.muted.withValues(alpha: 0.6),
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
        ],
      ),
    );
  }
}

class _SidebarCollapseButton extends StatelessWidget {
  const _SidebarCollapseButton({required this.collapsed});

  final bool collapsed;

  @override
  Widget build(BuildContext context) {
    final button = Container(
      key: const ValueKey('sidebar-collapse-button'),
      height: 38,
      width: collapsed ? 44 : double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: _Palette.input,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _Palette.border),
      ),
      child: Row(
        mainAxisAlignment: collapsed
            ? MainAxisAlignment.center
            : MainAxisAlignment.spaceBetween,
        children: [
          const BrandMark(size: 17),
          if (!collapsed) ...[
            const Spacer(),
            const Icon(
              RadixIcons.doubleArrowLeft,
              size: 14,
              color: _Palette.muted,
            ),
          ],
        ],
      ),
    );
    return _NavTooltip(
      label: 'Navigation locked',
      enabled: collapsed,
      child: button,
    );
  }
}

class _NavButton extends ConsumerWidget {
  const _NavButton({
    required this.label,
    required this.icon,
    required this.page,
    required this.selected,
    required this.collapsed,
  });

  final String label;
  final IconData icon;
  final ConsolePage page;
  final bool selected;
  final bool collapsed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nav = Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: NavigationItem(
        selected: selected,
        onChanged: (value) {
          if (!value || selected) return;
          HapticFeedback.selectionClick();
          ref.read(selectedPageProvider.notifier).state = page;
        },
        label: collapsed ? null : Text(label, overflow: TextOverflow.ellipsis),
        child: Icon(icon, size: 17),
      ),
    );
    return _NavTooltip(label: label, enabled: true, child: nav);
  }
}

class _NavTooltip extends StatelessWidget {
  const _NavTooltip({
    required this.label,
    required this.enabled,
    required this.child,
  });

  final String label;
  final bool enabled;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;
    return Tooltip(
      waitDuration: const Duration(milliseconds: 450),
      anchorAlignment: Alignment.centerRight,
      alignment: Alignment.centerLeft,
      tooltip: (context) => TooltipContainer(child: Text(label)),
      child: child,
    );
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final email = auth.email;
    return Container(
      height: 42,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Row(
        children: [
          const Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: OrbTopBarStatus(),
            ),
          ),
          if (email != null) ...[
            Text(
              email,
              style: const TextStyle(color: _Palette.muted, fontSize: 12),
            ),
            const SizedBox(width: 10),
            GestureDetector(
              onTap: () {
                ref.read(authControllerProvider.notifier).signOut();
                ref.read(authBypassProvider.notifier).state = false;
              },
              child: const Text(
                'Sign out',
                style: TextStyle(
                  color: _Palette.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MobileNavBar extends ConsumerWidget {
  const _MobileNavBar({required this.selectedPage});

  final ConsolePage selectedPage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      height: 58,
      color: _Palette.sidebar,
      padding: const EdgeInsets.fromLTRB(6, 5, 6, 6),
      child: Row(
        children: [
          _MobileNavItem(
            label: 'Work',
            icon: RadixIcons.layout,
            selected: selectedPage == ConsolePage.kanban,
            onTap: () => _selectMobilePage(ref, ConsolePage.kanban),
          ),
          _MobileNavItem(
            label: 'Chat',
            icon: RadixIcons.chatBubble,
            selected: selectedPage == ConsolePage.chat,
            emphasized: true,
            onTap: () => _selectMobilePage(ref, ConsolePage.chat),
          ),
          _MobileNavItem(
            label: 'Agents',
            icon: RadixIcons.group,
            selected: selectedPage == ConsolePage.work,
            onTap: () => _selectMobilePage(ref, ConsolePage.work),
          ),
        ],
      ),
    );
  }

  void _selectMobilePage(WidgetRef ref, ConsolePage page) {
    if (selectedPage == page) return;
    HapticFeedback.selectionClick();
    if (page != ConsolePage.work) {
      ref.read(selectedAgentIdProvider.notifier).state = null;
    }
    ref.read(selectedPageProvider.notifier).state = page;
  }
}

class _MobileNavItem extends StatelessWidget {
  const _MobileNavItem({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.emphasized = false,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.symmetric(vertical: 5),
          decoration: BoxDecoration(
            color: selected
                ? _Palette.input
                : (emphasized
                      ? _Palette.input.withValues(alpha: 0.45)
                      : Colors.transparent),
            borderRadius: BorderRadius.circular(emphasized ? 12 : 10),
            border: Border.all(
              color: selected || emphasized
                  ? _Palette.border
                  : Colors.transparent,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 16,
                color: selected ? _Palette.text : _Palette.muted,
              ),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: selected ? _Palette.text : _Palette.muted,
                  fontSize: 10,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PageBody extends StatelessWidget {
  const _PageBody({required this.page});

  final ConsolePage page;

  @override
  Widget build(BuildContext context) {
    return switch (page) {
      ConsolePage.chat => const AgentChatSurface(),
      ConsolePage.work => const _AgentsWorkspacePage(),
      ConsolePage.kanban => const _KanbanPage(),
      ConsolePage.genuiLab => const _GenUiLabPage(),
      ConsolePage.browser => const _BrowserPage(),
      ConsolePage.uiKit => const _UiKitPage(),
      ConsolePage.agents => const _AgentsPage(),
      ConsolePage.approvals => const _ApprovalsPage(),
      ConsolePage.runs => const _RunsPage(),
      ConsolePage.artifacts => const _ArtifactsPage(),
      ConsolePage.miro => const _MiroPage(),
    };
  }
}

class _AgentDescriptor {
  const _AgentDescriptor({
    required this.id,
    required this.name,
    required this.role,
    required this.status,
    required this.unread,
    required this.workItemId,
  });
  final String id;
  final String name;
  final String role;
  final String status; // running | idle | waiting | offline
  final int unread;
  final String workItemId;
}

const List<_AgentDescriptor> _fixtureAgents = [
  _AgentDescriptor(
    id: 'agent-exec',
    name: 'Executive',
    role: 'Plans and delegates',
    status: 'running',
    unread: 2,
    workItemId: 'work-track-pricing',
  ),
  _AgentDescriptor(
    id: 'agent-research',
    name: 'Research',
    role: 'Gathers signal',
    status: 'waiting',
    unread: 1,
    workItemId: 'work-track-pricing',
  ),
  _AgentDescriptor(
    id: 'agent-builder',
    name: 'Builder',
    role: 'Ships code & sites',
    status: 'running',
    unread: 0,
    workItemId: 'work-launch-preview',
  ),
  _AgentDescriptor(
    id: 'agent-reviewer',
    name: 'Reviewer',
    role: 'Inbox & QA',
    status: 'idle',
    unread: 3,
    workItemId: 'work-launch-preview',
  ),
  _AgentDescriptor(
    id: 'agent-comms',
    name: 'Comms',
    role: 'Reports & briefs',
    status: 'idle',
    unread: 0,
    workItemId: 'work-miro',
  ),
  _AgentDescriptor(
    id: 'agent-ops',
    name: 'Ops',
    role: 'Infra & secrets',
    status: 'offline',
    unread: 0,
    workItemId: 'work-miro',
  ),
];

Color _statusColor(String status) {
  switch (status) {
    case 'running':
      return const Color(0xFF22C55E);
    case 'waiting':
      return const Color(0xFFEAB308);
    case 'idle':
      return _Palette.muted;
    default:
      return const Color(0xFF52525B);
  }
}

String _statusLabel(String status) {
  switch (status) {
    case 'running':
      return 'Running';
    case 'waiting':
      return 'Awaiting input';
    case 'idle':
      return 'Idle';
    default:
      return 'Offline';
  }
}

class _AgentsWorkspacePage extends ConsumerWidget {
  const _AgentsWorkspacePage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedId = ref.watch(selectedAgentIdProvider);
    final compact = MediaQuery.sizeOf(context).width < 980;
    if (compact && selectedId == null) return const _AgentListPage();

    final selected = _fixtureAgents.firstWhere(
      (agent) => agent.id == (selectedId ?? _fixtureAgents.first.id),
      orElse: () => _fixtureAgents.first,
    );
    if (compact) {
      return _AgentDetailPage(agent: selected, compact: true);
    }
    return Row(
      children: [
        SizedBox(width: 310, child: _AgentRail(selectedId: selected.id)),
        const VerticalDivider(width: 1, color: _Palette.border),
        Expanded(child: _AgentDetailPage(agent: selected)),
      ],
    );
  }
}

class _AgentListPage extends ConsumerWidget {
  const _AgentListPage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView.separated(
      padding: const EdgeInsets.all(10),
      itemBuilder: (context, index) =>
          _AgentListItem(agent: _fixtureAgents[index], selected: false),
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemCount: _fixtureAgents.length,
    );
  }
}

class _AgentRail extends ConsumerWidget {
  const _AgentRail({required this.selectedId});

  final String selectedId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final content = [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        child: Row(
          children: [
            const Expanded(
              child: Text(
                'Agents',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
              ),
            ),
            _MiniIconButton(icon: RadixIcons.plus, label: 'New agent'),
          ],
        ),
      ),
      const Divider(height: 1, color: _Palette.border),
      Expanded(
        child: ListView.separated(
          padding: const EdgeInsets.all(8),
          itemBuilder: (context, index) => _AgentListItem(
            agent: _fixtureAgents[index],
            selected: _fixtureAgents[index].id == selectedId,
          ),
          separatorBuilder: (_, _) => const SizedBox(height: 6),
          itemCount: _fixtureAgents.length,
        ),
      ),
    ];

    return ColoredBox(
      color: _Palette.sidebar,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: content,
      ),
    );
  }
}

class _MiniIconButton extends StatelessWidget {
  const _MiniIconButton({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      tooltip: (context) => TooltipContainer(child: Text(label)),
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: _Palette.input,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: _Palette.border),
        ),
        child: Icon(icon, size: 14, color: _Palette.muted),
      ),
    );
  }
}

class _AgentListItem extends ConsumerStatefulWidget {
  const _AgentListItem({required this.agent, required this.selected});
  final _AgentDescriptor agent;
  final bool selected;

  @override
  ConsumerState<_AgentListItem> createState() => _AgentListItemState();
}

class _AgentListItemState extends ConsumerState<_AgentListItem> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final agent = widget.agent;
    final selected = widget.selected;
    final borderColor = selected
        ? _Palette.text.withValues(alpha: 0.65)
        : _hovered
        ? _Palette.muted.withValues(alpha: 0.6)
        : _Palette.border;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          if (!selected) HapticFeedback.selectionClick();
          ref.read(selectedAgentIdProvider.notifier).state = agent.id;
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          transform: Matrix4.translationValues(0, _hovered ? -1 : 0, 0),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: selected
                ? _Palette.input
                : (_hovered
                      ? _Palette.input.withValues(alpha: 0.72)
                      : _Palette.panel),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: borderColor, width: selected ? 1.3 : 1),
            boxShadow: _hovered
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.22),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : const [],
          ),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _Palette.background,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: borderColor),
                ),
                child: Text(
                  agent.name.substring(0, 1),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            agent.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                            color: _statusColor(agent.status),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            agent.role,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: _Palette.muted,
                              fontSize: 10.5,
                            ),
                          ),
                        ),
                        if (agent.unread > 0)
                          Container(
                            margin: const EdgeInsets.only(left: 6),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 1.5,
                            ),
                            decoration: BoxDecoration(
                              color: _Palette.text,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '${agent.unread}',
                              style: const TextStyle(
                                color: _Palette.background,
                                fontSize: 9.5,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              AnimatedOpacity(
                opacity: _hovered || selected ? 1 : 0,
                duration: const Duration(milliseconds: 120),
                child: const Padding(
                  padding: EdgeInsets.only(left: 8),
                  child: Icon(
                    RadixIcons.chatBubble,
                    size: 14,
                    color: _Palette.muted,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AgentDetailPage extends ConsumerStatefulWidget {
  const _AgentDetailPage({required this.agent, this.compact = false});
  final _AgentDescriptor agent;
  final bool compact;

  @override
  ConsumerState<_AgentDetailPage> createState() => _AgentDetailPageState();
}

class _AgentDetailPageState extends ConsumerState<_AgentDetailPage> {
  int _tabIndex = 0;
  late WorkRepository _repo;
  late Future<WorkItem?> _detailFuture;

  @override
  void initState() {
    super.initState();
    _repo = ref.read(workRepositoryProvider);
    _detailFuture = _repo.getWorkItem(widget.agent.workItemId);
  }

  @override
  void didUpdateWidget(covariant _AgentDetailPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.agent.workItemId != widget.agent.workItemId) {
      _repo = ref.read(workRepositoryProvider);
      _detailFuture = _repo.getWorkItem(widget.agent.workItemId);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<WorkItem?>(
      future: _detailFuture,
      builder: (context, snapshot) {
        return _buildContent(snapshot.data);
      },
    );
  }

  Widget _buildContent(WorkItem? detail) {
    final agent = widget.agent;
    final compact = widget.compact;
    return Column(
      children: [
        Container(
          padding: EdgeInsets.fromLTRB(compact ? 10 : 16, 12, 12, 10),
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: _Palette.border, width: 1),
            ),
          ),
          child: Row(
            children: [
              if (compact) ...[
                IconButton.ghost(
                  icon: const Icon(RadixIcons.arrowLeft, size: 15),
                  onPressed: () {
                    HapticFeedback.selectionClick();
                    ref.read(selectedAgentIdProvider.notifier).state = null;
                  },
                ),
                const SizedBox(width: 4),
              ],
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: _statusColor(agent.status),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      agent.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: compact ? 16 : 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      agent.role,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: _Palette.muted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _statusLabel(agent.status),
                style: const TextStyle(color: _Palette.muted, fontSize: 12),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          alignment: Alignment.centerLeft,
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: _Palette.border, width: 1),
            ),
          ),
          child: Row(
            children: [
              for (final entry in const [
                (0, '', RadixIcons.chatBubble),
                (1, 'Work', null),
                (2, 'Activity', null),
                (3, 'Artifacts', null),
              ])
                Padding(
                  padding: const EdgeInsets.only(right: 18),
                  child: GestureDetector(
                    onTap: () {
                      if (_tabIndex == entry.$1) return;
                      HapticFeedback.selectionClick();
                      setState(() => _tabIndex = entry.$1);
                    },
                    child: Column(
                      children: [
                        if (entry.$3 != null)
                          Icon(
                            entry.$3,
                            size: 15,
                            color: _tabIndex == entry.$1
                                ? _Palette.text
                                : _Palette.muted,
                          )
                        else
                          Text(
                            entry.$2,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w800,
                              color: _tabIndex == entry.$1
                                  ? _Palette.text
                                  : _Palette.muted,
                            ),
                          ),
                        const SizedBox(height: 6),
                        Container(
                          height: 2,
                          width: 22,
                          color: _tabIndex == entry.$1
                              ? _Palette.text
                              : Colors.transparent,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: switch (_tabIndex) {
            1 => _OverviewTab(agent: agent, detail: detail),
            2 => _ActivityTab(detail: detail),
            3 => _ArtifactsTab(detail: detail),
            _ => AgentChatSurface(
              key: ValueKey('agent-chat-${agent.id}'),
              showVoiceAction: true,
              compact: true,
            ),
          },
        ),
      ],
    );
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({required this.agent, required this.detail});
  final _AgentDescriptor agent;
  final WorkItem? detail;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _Palette.panel,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: _Palette.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Current focus',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 0.5,
                  color: _Palette.muted,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                detail?.title ?? 'No assigned work',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                detail?.objective ?? '',
                style: const TextStyle(color: _Palette.muted, fontSize: 12.5),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ActivityTab extends StatelessWidget {
  const _ActivityTab({required this.detail});
  final WorkItem? detail;

  @override
  Widget build(BuildContext context) {
    final events = detail?.events ?? const [];
    if (events.isEmpty) {
      return const Center(
        child: Text(
          'No recent activity.',
          style: TextStyle(color: _Palette.muted),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemBuilder: (context, i) {
        final e = events[i];
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _Palette.panel,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: _Palette.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                e.label,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 3),
              Text(
                '${e.atLabel} · ${e.detail}',
                style: const TextStyle(color: _Palette.muted, fontSize: 11.5),
              ),
            ],
          ),
        );
      },
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemCount: events.length,
    );
  }
}

class _ArtifactsTab extends ConsumerWidget {
  const _ArtifactsTab({required this.detail});
  final WorkItem? detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final artifacts = detail?.artifacts ?? const [];
    if (artifacts.isEmpty) {
      return const Center(
        child: Text(
          'No artifacts yet.',
          style: TextStyle(color: _Palette.muted),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemBuilder: (context, i) {
        final a = artifacts[i];
        final isWeb =
            a.kind.label.toLowerCase().contains('web') ||
            a.kind.label.toLowerCase().contains('site') ||
            a.kind.label.toLowerCase().contains('preview');
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _Palette.panel,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: _Palette.border),
          ),
          child: Row(
            children: [
              Icon(
                isWeb ? RadixIcons.globe : RadixIcons.archive,
                size: 16,
                color: _Palette.muted,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      a.name,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${a.kind.label} · ${a.state.label} · ${a.updatedAtLabel}',
                      style: const TextStyle(
                        color: _Palette.muted,
                        fontSize: 11.5,
                      ),
                    ),
                  ],
                ),
              ),
              if (isWeb)
                GestureDetector(
                  onTap: () {
                    ref.read(selectedPageProvider.notifier).state =
                        ConsolePage.browser;
                  },
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    child: Text(
                      'Open',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: _Palette.text,
                      ),
                    ),
                  ),
                ),
              _ArtifactDownloadAction(workItemId: detail?.id, artifact: a),
            ],
          ),
        );
      },
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemCount: artifacts.length,
    );
  }
}

/// Compact action that resolves a presigned download URL via the Control API
/// and opens it in the system browser via url_launcher.
class _ArtifactDownloadAction extends ConsumerStatefulWidget {
  const _ArtifactDownloadAction({
    required this.workItemId,
    required this.artifact,
  });

  final String? workItemId;
  final WorkItemArtifactSummary artifact;

  @override
  ConsumerState<_ArtifactDownloadAction> createState() =>
      _ArtifactDownloadActionState();
}

class _ArtifactDownloadActionState
    extends ConsumerState<_ArtifactDownloadAction> {
  bool _busy = false;
  String? _error;

  Future<void> _openDownload() async {
    final runId = widget.artifact.runId ?? widget.workItemId;
    if (runId == null) {
      setState(() => _error = 'Missing run');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(controlApiProvider);
      final body = await api.getArtifactDownload(
        runId: runId,
        artifactId: widget.artifact.id,
      );
      final url = body['url'];
      if (url is! String || url.isEmpty) {
        throw StateError('No download URL.');
      }
      final uri = Uri.parse(url);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) {
        throw StateError('Could not open URL.');
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = _busy ? 'Opening…' : (_error == null ? 'Download' : 'Retry');
    return GestureDetector(
      onTap: _busy ? null : _openDownload,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: _error == null ? _Palette.text : _Palette.muted,
          ),
        ),
      ),
    );
  }
}

class _KanbanPage extends StatelessWidget {
  const _KanbanPage();

  @override
  Widget build(BuildContext context) {
    return const Padding(padding: EdgeInsets.all(14), child: KanbanBoard());
  }
}

// ignore: unused_element
class _CommandCenterPage extends StatelessWidget {
  const _CommandCenterPage();

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 760;
    return ListView(
      padding: EdgeInsets.all(isCompact ? 8 : 14),
      children: [
        const _WorkDashboard(),
        SizedBox(height: isCompact ? 8 : 12),
        const _HeroCommandPanel(),
        SizedBox(height: isCompact ? 8 : 12),
        const _MetricsStrip(),
        SizedBox(height: isCompact ? 8 : 12),
        if (isCompact)
          const Column(
            children: [
              _LiveRunTimeline(),
              SizedBox(height: 8),
              _GenUiPreviewPanel(),
            ],
          )
        else
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 7, child: _LiveRunTimeline()),
              SizedBox(width: 12),
              Expanded(flex: 5, child: _GenUiPreviewPanel()),
            ],
          ),
      ],
    );
  }
}

class _WorkDashboard extends ConsumerWidget {
  const _WorkDashboard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repository = ref.watch(workRepositoryProvider);
    return FutureBuilder<List<WorkItem>>(
      future: repository.listWorkItems(),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _Panel(
            child: Text(
              'Loading work items…',
              style: TextStyle(color: _Palette.muted),
            ),
          );
        }
        if (snapshot.hasError) {
          return const _Panel(
            child: Text(
              'Work board unavailable; fixture fallback failed.',
              style: TextStyle(color: _Palette.muted),
            ),
          );
        }

        final items = snapshot.data ?? const <WorkItem>[];
        if (items.isEmpty) {
          return const _Panel(
            child: Text(
              'No delegated work yet.',
              style: TextStyle(color: _Palette.muted),
            ),
          );
        }

        final primary = items.first;
        final isCompact = MediaQuery.sizeOf(context).width < 900;
        final queue = _WorkQueue(items: items, selectedItemId: primary.id);
        final detail = _WorkDetail(item: primary);

        return _Panel(
          padding: EdgeInsets.all(isCompact ? 10 : 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SectionHeader(
                title: 'Work',
                subtitle:
                    'Delegated objectives. Each item rolls up runs, events, artifacts, and inbox items.',
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _StatusPill(
                    label:
                        '${items.length} active ${items.length == 1 ? 'item' : 'items'}',
                    color: _Palette.muted,
                  ),
                ],
              ),
              SizedBox(height: isCompact ? 10 : 12),
              if (isCompact)
                Column(children: [queue, const SizedBox(height: 10), detail])
              else
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 4, child: queue),
                    const SizedBox(width: 12),
                    Expanded(flex: 7, child: detail),
                  ],
                ),
            ],
          ),
        );
      },
    );
  }
}

String _pluralize(int count, String singular, [String? plural]) {
  if (count == 1) return '1 $singular';
  return '$count ${plural ?? '${singular}s'}';
}

String _statRowLabel(WorkItemSummary summary) {
  return '${summary.runSummary} · ${_pluralize(summary.artifactCount, 'artifact')} · ${_pluralize(summary.pendingApprovalCount, 'inbox item')}';
}

class _WorkQueue extends StatelessWidget {
  const _WorkQueue({required this.items, required this.selectedItemId});

  final List<WorkItem> items;
  final String selectedItemId;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Queue',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: _Palette.muted,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 8),
        for (final item in items) ...[
          _WorkItemCard(item: item, selected: item.id == selectedItemId),
          if (item != items.last) const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _WorkItemCard extends StatelessWidget {
  const _WorkItemCard({required this.item, required this.selected});

  final WorkItem item;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final summary = item.summary;
    return Card(
      filled: true,
      fillColor: selected ? _Palette.input : _Palette.panel,
      borderColor: selected ? _Palette.muted : _Palette.border,
      borderRadius: BorderRadius.circular(10),
      padding: const EdgeInsets.all(10),
      boxShadow: const [],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              _StatusPill(label: summary.statusLabel, color: _Palette.muted),
              _StatusPill(label: summary.priorityLabel, color: _Palette.muted),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            item.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(
            item.nextAction,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: _Palette.muted,
              fontSize: 12,
              height: 1.25,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _statRowLabel(summary),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: _Palette.muted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _WorkDetail extends StatelessWidget {
  const _WorkDetail({required this.item});

  final WorkItem item;

  @override
  Widget build(BuildContext context) {
    final summary = item.summary;
    final trustedSurfaces = item.validatedSurfaces;
    return Card(
      filled: true,
      fillColor: _Palette.input,
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(10),
      padding: const EdgeInsets.all(12),
      boxShadow: const [],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _StatusPill(label: summary.statusLabel, color: _Palette.muted),
              _StatusPill(label: 'Owner: ${item.owner}', color: _Palette.muted),
              _StatusPill(
                label: 'Updated ${item.updatedAtLabel}',
                color: _Palette.muted,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            item.title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 5),
          Text(
            item.objective,
            style: const TextStyle(
              color: _Palette.muted,
              fontSize: 12,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 10),
          _DetailStatRow(summary: summary),
          const SizedBox(height: 12),
          _WorkMiniSection(
            title: 'Next decision',
            children: [
              _SmallSurfaceLine(
                title: item.nextAction,
                subtitle: 'Awaiting inbox decision.',
                leading: RadixIcons.checkCircled,
              ),
              const SizedBox(height: 8),
              const Button.primary(
                enabled: false,
                child: Text('Approve weekly monitor'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _WorkMiniSection(
            title: 'Event timeline',
            children: [
              for (final event in item.events.take(3))
                _SmallSurfaceLine(
                  title: event.label,
                  subtitle: '${event.atLabel} · ${event.detail}',
                  leading: RadixIcons.activityLog,
                ),
            ],
          ),
          const SizedBox(height: 12),
          _WorkMiniSection(
            title: 'Artifacts',
            children: [
              for (final artifact in item.artifacts.take(3))
                _SmallSurfaceLine(
                  title: artifact.name,
                  subtitle:
                      '${artifact.kind.label} · ${artifact.state.label} · ${artifact.updatedAtLabel}',
                  leading: RadixIcons.archive,
                ),
            ],
          ),
          const SizedBox(height: 12),
          _WorkMiniSection(
            title: 'Generated surfaces',
            children: trustedSurfaces.isEmpty
                ? const [
                    _SmallSurfaceLine(
                      title: 'No validated surfaces yet',
                      subtitle:
                          'Generated UI remains hidden until server validation passes.',
                      leading: RadixIcons.component1,
                    ),
                  ]
                : [
                    for (final surface in trustedSurfaces)
                      _SmallSurfaceLine(
                        title: surface.title,
                        subtitle:
                            '${surface.componentCount} components · ${surface.kind.label} · validated surface',
                        leading: RadixIcons.component1,
                      ),
                  ],
          ),
        ],
      ),
    );
  }
}

class _DetailStatRow extends StatelessWidget {
  const _DetailStatRow({required this.summary});

  final WorkItemSummary summary;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _TinyStat(
            label: 'Runs',
            value: summary.totalRunCount.toString(),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _TinyStat(
            label: 'Artifacts',
            value: summary.artifactCount.toString(),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _TinyStat(
            label: 'Inbox',
            value: summary.pendingApprovalCount.toString(),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _TinyStat(
            label: 'Surfaces',
            value: summary.validatedSurfaceCount.toString(),
          ),
        ),
      ],
    );
  }
}

class _TinyStat extends StatelessWidget {
  const _TinyStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
      decoration: BoxDecoration(
        color: _Palette.panel,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: _Palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: _Palette.muted, fontSize: 10),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

class _WorkMiniSection extends StatelessWidget {
  const _WorkMiniSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 7),
        ...children,
      ],
    );
  }
}

class _SmallSurfaceLine extends StatelessWidget {
  const _SmallSurfaceLine({
    required this.title,
    required this.subtitle,
    required this.leading,
  });

  final String title;
  final String subtitle;
  final IconData leading;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(leading, size: 14, color: _Palette.text),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _Palette.muted,
                    fontSize: 11,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

extension on WorkItemArtifactKind {
  String get label => switch (this) {
    WorkItemArtifactKind.report => 'Report',
    WorkItemArtifactKind.dashboard => 'Dashboard',
    WorkItemArtifactKind.preview => 'Preview',
    WorkItemArtifactKind.dataset => 'Dataset',
    WorkItemArtifactKind.document => 'Document',
  };
}

extension on WorkItemArtifactState {
  String get label => switch (this) {
    WorkItemArtifactState.ready => 'Ready',
    WorkItemArtifactState.draft => 'Draft',
    WorkItemArtifactState.blocked => 'Blocked',
  };
}

extension on WorkItemSurfaceKind {
  String get label => switch (this) {
    WorkItemSurfaceKind.dashboard => 'Dashboard',
    WorkItemSurfaceKind.report => 'Report',
    WorkItemSurfaceKind.tracker => 'Tracker',
    WorkItemSurfaceKind.table => 'Table',
  };
}

class _HeroCommandPanel extends StatelessWidget {
  const _HeroCommandPanel();

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 760;
    return _Panel(
      padding: EdgeInsets.all(isCompact ? 11 : 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: const [
              _StatusPill(
                label: 'Autonomous control plane',
                color: _Palette.accent,
              ),
              _StatusPill(label: 'CEO workflow', color: _Palette.success),
              _StatusPill(label: 'Markdown + GenUI', color: _Palette.info),
            ],
          ),
          SizedBox(height: isCompact ? 10 : 14),
          Text(
            'Delegate work. Review outputs.',
            style: TextStyle(
              fontSize: isCompact ? 22 : 24,
              fontWeight: FontWeight.w900,
              height: 1.04,
              letterSpacing: -0.5,
            ),
          ),
          SizedBox(height: isCompact ? 8 : 10),
          const Text(
            'A workflow-first command surface for objectives, streamed reasoning, approvals, generated UI, and durable artifacts.',
            style: TextStyle(color: _Palette.muted, fontSize: 13, height: 1.35),
          ),
          SizedBox(height: isCompact ? 10 : 12),
          const _CommandComposerMock(),
        ],
      ),
    );
  }
}

class _CommandComposerMock extends StatelessWidget {
  const _CommandComposerMock();

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 760;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextArea(
          initialValue:
              'Build a launch page, research competitors, test it, publish a preview, and prepare a CEO report.',
          minLines: isCompact ? 3 : 2,
          maxLines: 5,
          readOnly: true,
          filled: true,
          placeholder: const Text('Describe the strategic objective...'),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: const [
            Button.primary(
              enabled: false,
              leading: Icon(RadixIcons.play, size: 14),
              child: Text('Create WorkItem'),
            ),
            Button.outline(
              enabled: false,
              leading: Icon(RadixIcons.reader, size: 14),
              child: Text('Draft report'),
            ),
            Button.outline(
              enabled: false,
              leading: Icon(RadixIcons.globe, size: 14),
              child: Text('Preview site'),
            ),
            _StatusPill(label: 'fixture UI only', color: _Palette.warning),
          ],
        ),
      ],
    );
  }
}

class _MetricsStrip extends StatelessWidget {
  const _MetricsStrip();

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 760;
    final cards = const [
      _MetricCard(label: 'Runs', value: '0', hint: 'API live'),
      _MetricCard(label: 'Teams', value: '3', hint: 'Exec/build/research'),
      _MetricCard(label: 'Artifacts', value: '0', hint: 'S3 planned'),
      _MetricCard(label: 'Previews', value: '0', hint: '*.preview'),
    ];

    if (isCompact) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var index = 0; index < cards.length; index++) ...[
            cards[index],
            if (index != cards.length - 1) const SizedBox(height: 8),
          ],
        ],
      );
    }

    return Row(
      children: [
        for (var index = 0; index < cards.length; index++) ...[
          Expanded(child: cards[index]),
          if (index != cards.length - 1) const SizedBox(width: 10),
        ],
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.hint,
  });

  final String label;
  final String value;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 760;
    return _Panel(
      padding: EdgeInsets.all(isCompact ? 9 : 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: _Palette.muted, fontSize: 11),
          ),
          SizedBox(height: isCompact ? 4 : 6),
          Text(
            value,
            style: TextStyle(
              fontSize: isCompact ? 22 : 24,
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
          SizedBox(height: isCompact ? 3 : 4),
          Text(
            hint,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: _Palette.muted, fontSize: 10),
          ),
        ],
      ),
    );
  }
}

class _LiveRunTimeline extends StatelessWidget {
  const _LiveRunTimeline();

  @override
  Widget build(BuildContext context) {
    return const _Panel(
      padding: EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeader(
            title: 'Autonomous run timeline',
            subtitle:
                'This binds next to Control API events, then Cloudflare Durable Object realtime.',
          ),
          SizedBox(height: 14),
          _TimelineItem(
            status: 'Planned',
            title: 'Control API creates durable run records',
            body:
                'POST /runs creates DynamoDB state and starts Step Functions.',
          ),
          _TimelineItem(
            status: 'Planned',
            title: 'ECS agent containers execute isolated tasks',
            body:
                'Hermes/Codex workers run in dedicated Fargate tasks with scoped credentials.',
          ),
          _TimelineItem(
            status: 'Planned',
            title: 'Quality gate reviews artifacts before publishing',
            body:
                'Evaluator agents run tests, lint, research checks, and human approvals.',
          ),
          _TimelineItem(
            status: 'Planned',
            title: 'Websites publish to wildcard preview domains',
            body:
                'Preview router maps hostnames to S3/static or dynamic ECS deployments.',
            isLast: true,
          ),
        ],
      ),
    );
  }
}

class _GenUiPreviewPanel extends StatefulWidget {
  const _GenUiPreviewPanel();

  @override
  State<_GenUiPreviewPanel> createState() => _GenUiPreviewPanelState();
}

class _GenUiPreviewPanelState extends State<_GenUiPreviewPanel> {
  static const _surfaceId = 'agents-cloud-command-center';
  late final genui.SurfaceController _controller;

  @override
  void initState() {
    super.initState();
    _controller = genui.SurfaceController(
      catalogs: [genui.BasicCatalogItems.asCatalog()],
    );
    _seedSurface();
  }

  void _seedSurface() {
    _controller.handleMessage(
      const genui.CreateSurface(
        surfaceId: _surfaceId,
        catalogId: genui.basicCatalogId,
      ),
    );
    _controller.handleMessage(
      const genui.UpdateComponents(
        surfaceId: _surfaceId,
        components: [
          genui.Component(
            id: 'root',
            type: 'Column',
            properties: {
              'justify': 'start',
              'children': ['title', 'body', 'status'],
            },
          ),
          genui.Component(
            id: 'title',
            type: 'Text',
            properties: {
              'text': 'Live GenUI command dashboard',
              'variant': 'h4',
            },
          ),
          genui.Component(
            id: 'body',
            type: 'Text',
            properties: {
              'text':
                  'Agents will stream validated A2UI patches here so desktop, mobile, and web clients can render the same live workspace.',
              'variant': 'body',
            },
          ),
          genui.Component(
            id: 'status',
            type: 'Text',
            properties: {
              'text':
                  'Current scaffold: local SurfaceController + BasicCatalog. Next: Control API event schema and Cloudflare websocket transport.',
              'variant': 'caption',
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return _Panel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Live GenUI surface',
            subtitle:
                'Safe A2UI rendering scaffold for agent-created dashboards.',
          ),
          const SizedBox(height: 10),
          const Row(
            children: [
              _StatusPill(
                label: 'Google GenUI bridge',
                color: _Palette.success,
              ),
              SizedBox(width: 8),
              _StatusPill(label: 'A2UI v0.9', color: _Palette.info),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0x33000000),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _Palette.border),
            ),
            child: genui.Surface(
              surfaceContext: _controller.contextFor(_surfaceId),
              defaultBuilder: (_) => const Text('Waiting for GenUI surface...'),
            ),
          ),
        ],
      ),
    );
  }
}

class _GenUiLabPage extends StatelessWidget {
  const _GenUiLabPage();

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 760;
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        const _SectionHeader(
          title: 'GenUI component lab',
          subtitle:
              'Safe generated UI preview surface for testing cards, tables, timelines, approvals, loading states, and agent chat output before backend wiring.',
        ),
        const SizedBox(height: 12),
        if (compact) ...[
          const _GeneratedSurfacePreview(),
          const SizedBox(height: 12),
          const _AgentChatStatePanel(),
        ] else
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _GeneratedSurfacePreview()),
              SizedBox(width: 12),
              Expanded(child: _AgentChatStatePanel()),
            ],
          ),
        const SizedBox(height: 12),
        const _GenUiChartGallery(),
        const SizedBox(height: 12),
        const _LiveGenUiSurfaceCard(),
        const SizedBox(height: 12),
        const _LoadingStatesPanel(),
      ],
    );
  }
}

class _GeneratedSurfacePreview extends StatelessWidget {
  const _GeneratedSurfacePreview();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Generated surface preview',
            subtitle:
                'Validated catalog-only components; no arbitrary Flutter code.',
          ),
          const SizedBox(height: 12),
          Row(
            children: const [
              Expanded(
                child: _TinyStat(label: 'Components', value: '8'),
              ),
              SizedBox(width: 8),
              Expanded(
                child: _TinyStat(label: 'Data refs', value: '2'),
              ),
              SizedBox(width: 8),
              Expanded(
                child: _TinyStat(label: 'Actions', value: '0'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const _SmallSurfaceLine(
            title: 'Metric card: active work',
            subtitle:
                'work_board_summary component bound to server-approved data refs.',
            leading: RadixIcons.dashboard,
          ),
          const _SmallSurfaceLine(
            title: 'Table: competitor prices',
            subtitle:
                'data_table component with safe pagination and column allowlist.',
            leading: RadixIcons.table,
          ),
          const _SmallSurfaceLine(
            title: 'Timeline: run events',
            subtitle: 'run_timeline component renders canonical events only.',
            leading: RadixIcons.activityLog,
          ),
        ],
      ),
    );
  }
}

class _GenUiChartGallery extends StatelessWidget {
  const _GenUiChartGallery();

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 760;
    final charts = const [
      _GeneratedLineChartCard(),
      _GeneratedBarChartCard(),
      _GeneratedPieChartCard(),
    ];
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'FL Chart generated analytics',
            subtitle:
                'Real fl_chart widgets used for GenUI analytics previews: trend, workload bars, and approval mix.',
          ),
          const SizedBox(height: 12),
          if (compact)
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var index = 0; index < charts.length; index++) ...[
                  charts[index],
                  if (index != charts.length - 1) const SizedBox(height: 10),
                ],
              ],
            )
          else
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var index = 0; index < charts.length; index++) ...[
                  Expanded(child: charts[index]),
                  if (index != charts.length - 1) const SizedBox(width: 10),
                ],
              ],
            ),
        ],
      ),
    );
  }
}

class _GeneratedLineChartCard extends StatelessWidget {
  const _GeneratedLineChartCard();

  @override
  Widget build(BuildContext context) {
    return _ChartCard(
      title: 'Run throughput',
      child: fl.LineChart(
        fl.LineChartData(
          minX: 0,
          maxX: 5,
          minY: 0,
          maxY: 8,
          gridData: fl.FlGridData(
            show: true,
            drawVerticalLine: false,
            horizontalInterval: 2,
            getDrawingHorizontalLine: (_) =>
                fl.FlLine(color: _Palette.border, strokeWidth: 1),
          ),
          borderData: fl.FlBorderData(show: false),
          titlesData: _chartTitles(
            bottomLabels: const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
          ),
          lineTouchData: const fl.LineTouchData(enabled: true),
          lineBarsData: [
            fl.LineChartBarData(
              spots: const [
                fl.FlSpot(0, 1.5),
                fl.FlSpot(1, 2.8),
                fl.FlSpot(2, 2.2),
                fl.FlSpot(3, 5.1),
                fl.FlSpot(4, 4.7),
                fl.FlSpot(5, 6.4),
              ],
              isCurved: true,
              color: _Palette.text,
              barWidth: 2.4,
              dotData: const fl.FlDotData(show: true),
              belowBarData: fl.BarAreaData(
                show: true,
                color: _Palette.text.withValues(alpha: 0.08),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GeneratedBarChartCard extends StatelessWidget {
  const _GeneratedBarChartCard();

  @override
  Widget build(BuildContext context) {
    return _ChartCard(
      title: 'Work by lane',
      child: fl.BarChart(
        fl.BarChartData(
          alignment: fl.BarChartAlignment.spaceAround,
          maxY: 8,
          barTouchData: const fl.BarTouchData(enabled: true),
          titlesData: _chartTitles(
            bottomLabels: const ['Todo', 'Run', 'Review', 'Done'],
          ),
          borderData: fl.FlBorderData(show: false),
          gridData: fl.FlGridData(
            show: true,
            drawVerticalLine: false,
            horizontalInterval: 2,
            getDrawingHorizontalLine: (_) =>
                fl.FlLine(color: _Palette.border, strokeWidth: 1),
          ),
          barGroups: [
            _barGroup(0, 3),
            _barGroup(1, 7),
            _barGroup(2, 5),
            _barGroup(3, 2),
          ],
        ),
      ),
    );
  }

  static fl.BarChartGroupData _barGroup(int x, double y) =>
      fl.BarChartGroupData(
        x: x,
        barRods: [
          fl.BarChartRodData(
            toY: y,
            width: 14,
            borderRadius: BorderRadius.circular(4),
            color: _Palette.text,
            backDrawRodData: fl.BackgroundBarChartRodData(
              show: true,
              toY: 8,
              color: _Palette.border.withValues(alpha: 0.32),
            ),
          ),
        ],
      );
}

class _GeneratedPieChartCard extends StatelessWidget {
  const _GeneratedPieChartCard();

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 520;
    final legend = const Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _LegendDot(label: 'Ready', value: '45%', color: _Palette.text),
        SizedBox(height: 8),
        _LegendDot(label: 'Waiting', value: '35%', color: _Palette.muted),
        SizedBox(height: 8),
        _LegendDot(label: 'Blocked', value: '20%', color: Color(0xFF525252)),
      ],
    );
    return _ChartCard(
      title: 'Approval mix',
      child: compact
          ? Column(
              children: [
                Expanded(child: _PieChart()),
                const SizedBox(height: 10),
                legend,
              ],
            )
          : Row(
              children: [
                const Expanded(child: _PieChart()),
                const SizedBox(width: 10),
                SizedBox(width: 96, child: legend),
              ],
            ),
    );
  }

  static fl.PieChartSectionData _pieSection(double value, Color color) {
    return fl.PieChartSectionData(
      title: '',
      value: value,
      color: color,
      radius: 42,
      titleStyle: const TextStyle(fontSize: 0),
    );
  }
}

class _PieChart extends StatelessWidget {
  const _PieChart();

  @override
  Widget build(BuildContext context) {
    return fl.PieChart(
      fl.PieChartData(
        centerSpaceRadius: 34,
        sectionsSpace: 2,
        pieTouchData: fl.PieTouchData(enabled: true),
        sections: [
          _GeneratedPieChartCard._pieSection(45, _Palette.text),
          _GeneratedPieChartCard._pieSection(35, _Palette.muted),
          _GeneratedPieChartCard._pieSection(20, const Color(0xFF525252)),
        ],
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({
    required this.label,
    required this.value,
    required this.color,
  });
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10.5, color: _Palette.muted),
          ),
        ),
        Text(
          value,
          style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 760;
    return Card(
      filled: true,
      fillColor: _Palette.input,
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(10),
      padding: const EdgeInsets.all(10),
      boxShadow: const [],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: compact ? 190 : 154,
            child: child,
          ),
        ],
      ),
    );
  }
}

fl.FlTitlesData _chartTitles({List<String>? bottomLabels}) {
  return fl.FlTitlesData(
    leftTitles: fl.AxisTitles(
      sideTitles: fl.SideTitles(
        showTitles: true,
        reservedSize: 28,
        interval: 2,
        getTitlesWidget: (value, meta) => fl.SideTitleWidget(
          meta: meta,
          child: Text(
            value.toInt().toString(),
            style: const TextStyle(color: _Palette.muted, fontSize: 10),
          ),
        ),
      ),
    ),
    rightTitles: const fl.AxisTitles(
      sideTitles: fl.SideTitles(showTitles: false),
    ),
    topTitles: const fl.AxisTitles(
      sideTitles: fl.SideTitles(showTitles: false),
    ),
    bottomTitles: fl.AxisTitles(
      sideTitles: fl.SideTitles(
        showTitles: bottomLabels != null,
        reservedSize: bottomLabels == null ? 0 : 24,
        getTitlesWidget: (value, meta) {
          final index = value.toInt();
          final label =
              bottomLabels != null && index >= 0 && index < bottomLabels.length
              ? bottomLabels[index]
              : '';
          return fl.SideTitleWidget(
            meta: meta,
            child: Text(
              label,
              style: const TextStyle(color: _Palette.muted, fontSize: 10),
            ),
          );
        },
      ),
    ),
  );
}

class _LiveGenUiSurfaceCard extends ConsumerStatefulWidget {
  const _LiveGenUiSurfaceCard();

  @override
  ConsumerState<_LiveGenUiSurfaceCard> createState() =>
      _LiveGenUiSurfaceCardState();
}

class _LiveGenUiSurfaceCardState extends ConsumerState<_LiveGenUiSurfaceCard> {
  static const _surfaceId = 'genui-lab-live-surface';
  late final genui.SurfaceController _controller;
  StreamSubscription<Map<String, dynamic>>? _eventsSub;
  final List<String> _eventLog = <String>[];
  String _wsStatus = 'Disconnected';

  @override
  void initState() {
    super.initState();
    _controller = genui.SurfaceController(
      catalogs: [genui.BasicCatalogItems.asCatalog()],
    );
    _seedSurface();
    WidgetsBinding.instance.addPostFrameCallback((_) => _connectRealtime());
  }

  Future<void> _connectRealtime() async {
    final auth = ref.read(authControllerProvider);
    final bypass = ref.read(authBypassProvider);
    if (bypass || auth.status != AuthStatus.signedIn) {
      setState(() => _wsStatus = 'Local · sign in for live events');
      return;
    }
    try {
      final realtime = ref.read(realtimeClientProvider);
      await realtime.connect();
      setState(() => _wsStatus = 'Connected');
      _eventsSub = realtime.events.listen(_onRealtimeEvent);
    } catch (e) {
      setState(() => _wsStatus = 'Realtime error: $e');
    }
  }

  void _onRealtimeEvent(Map<String, dynamic> event) {
    final type = event['type']?.toString() ?? 'event';
    final status = event['payload'] is Map
        ? (event['payload']['status']?.toString() ?? '')
        : '';
    final label = status.isEmpty ? type : '$type · $status';
    setState(() {
      _eventLog.insert(0, label);
      if (_eventLog.length > 6) _eventLog.removeLast();
    });
  }

  @override
  void dispose() {
    _eventsSub?.cancel();
    super.dispose();
  }

  void _seedSurface() {
    _controller.handleMessage(
      const genui.CreateSurface(
        surfaceId: _surfaceId,
        catalogId: genui.basicCatalogId,
      ),
    );
    _controller.handleMessage(
      const genui.UpdateComponents(
        surfaceId: _surfaceId,
        components: [
          genui.Component(
            id: 'root',
            type: 'Column',
            properties: {
              'children': ['title', 'summary', 'next'],
            },
          ),
          genui.Component(
            id: 'title',
            type: 'Text',
            properties: {'text': 'Live GenUI Surface', 'variant': 'h4'},
          ),
          genui.Component(
            id: 'summary',
            type: 'Text',
            properties: {
              'text':
                  'Subscribes to wss realtime events when signed in. Click an agent to start a run and watch events stream in.',
            },
          ),
          genui.Component(
            id: 'next',
            type: 'Text',
            properties: {
              'text':
                  'Next: render server-validated GenUI surfaces from event payloads.',
              'variant': 'caption',
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: _SectionHeader(
                  title: 'Live GenUI Surface',
                  subtitle:
                      'genui.Surface seeded by A2UI; realtime event tail under it.',
                ),
              ),
              _StatusPill(
                label: _wsStatus,
                color: _wsStatus == 'Connected'
                    ? const Color(0xFF22C55E)
                    : _Palette.muted,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Card(
            filled: true,
            fillColor: _Palette.input,
            borderColor: _Palette.border,
            borderRadius: BorderRadius.circular(10),
            padding: const EdgeInsets.all(12),
            boxShadow: const [],
            child: SizedBox(
              height: 210,
              child: genui.Surface(
                surfaceContext: _controller.contextFor(_surfaceId),
                defaultBuilder: (_) =>
                    const Center(child: Text('Waiting for generated surface…')),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: _Palette.panel,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _Palette.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'REALTIME EVENT TAIL',
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 0.6,
                    color: _Palette.muted,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                if (_eventLog.isEmpty)
                  const Text(
                    'No events yet.',
                    style: TextStyle(color: _Palette.muted, fontSize: 12),
                  )
                else
                  for (final line in _eventLog)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(
                        '· $line',
                        style: const TextStyle(
                          fontSize: 12,
                          color: _Palette.text,
                        ),
                      ),
                    ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AgentChatStatePanel extends StatelessWidget {
  const _AgentChatStatePanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Agent chat states',
            subtitle:
                'Message, tool, approval, and report states for future agent conversations.',
          ),
          SizedBox(height: 12),
          _ChatBubble(
            role: 'You',
            body: 'Create a launch preview and show me the checklist.',
          ),
          SizedBox(height: 8),
          _ChatBubble(
            role: 'Agent',
            body:
                'I am building the preview, validating artifacts, and preparing a generated checklist surface.',
          ),
          SizedBox(height: 8),
          _SmallSurfaceLine(
            title: 'Tool running: preview.deploy',
            subtitle: 'Streaming progress indicator + audit trail placeholder.',
            leading: RadixIcons.gear,
          ),
        ],
      ),
    );
  }
}

class _LoadingStatesPanel extends StatelessWidget {
  const _LoadingStatesPanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Loading states',
            subtitle:
                'Reusable loading, stale, empty, denied, and reconnecting states for generated surfaces.',
          ),
          SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StateChip(label: 'Loading work…'),
              _StateChip(label: 'Reconnecting'),
              _StateChip(label: 'Stale data'),
              _StateChip(label: 'Approval required'),
              _StateChip(label: 'Empty surface'),
            ],
          ),
        ],
      ),
    );
  }
}

class _StateChip extends StatelessWidget {
  const _StateChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Card(
      filled: true,
      fillColor: _Palette.input,
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(999),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      boxShadow: const [],
      child: Text(
        label,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _BrowserPage extends StatefulWidget {
  const _BrowserPage();

  @override
  State<_BrowserPage> createState() => _BrowserPageState();
}

class _BrowserPageState extends State<_BrowserPage> {
  static const _previewUrl = 'https://example.com';
  static const _agentSmokeUrl = 'https://agents-cloud.local/browser-smoke';
  static const _agentBridgeEnabled = bool.fromEnvironment(
    'AGENTS_CLOUD_BROWSER_BRIDGE',
  );
  static const _agentBridgePort = int.fromEnvironment(
    'AGENTS_CLOUD_BROWSER_BRIDGE_PORT',
    defaultValue: 48765,
  );
  static const _agentBridgeToken = String.fromEnvironment(
    'AGENTS_CLOUD_BROWSER_BRIDGE_TOKEN',
  );

  late final TextEditingController _urlController;
  WebViewController? _controller;
  AgentBrowserControl? _agentControl;
  AgentBrowserWebSocketBridge? _agentBridge;
  String _status = '';

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(text: _previewUrl);
    if (!_runningInWidgetTest) {
      final params = WebViewPlatform.instance is WebKitWebViewPlatform
          ? WebKitWebViewControllerCreationParams(
              allowsInlineMediaPlayback: true,
              mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
            )
          : const PlatformWebViewControllerCreationParams();
      _controller = WebViewController.fromPlatformCreationParams(params)
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageStarted: (url) => setState(() => _status = 'Loading $url'),
            onPageFinished: (url) {
              setState(() {
                _status = '';
                _urlController.text = url;
              });
              unawaited(_installAgentBridge());
            },
            onWebResourceError: (error) =>
                setState(() => _status = 'WebView error: ${error.description}'),
          ),
        )
        ..loadRequest(Uri.parse(_previewUrl));
      _agentControl = AgentBrowserControl(
        _controller!,
        logSink: _logAgentBrowser,
      );
      unawaited(_installAgentBridge());
      unawaited(_startAgentBridgeIfEnabled());
    }
  }

  @override
  void dispose() {
    final bridge = _agentBridge;
    _agentBridge = null;
    if (bridge != null) unawaited(bridge.close());
    _urlController.dispose();
    super.dispose();
  }

  bool get _runningInWidgetTest =>
      WidgetsBinding.instance.runtimeType.toString().contains('Test');

  Uri? _safeHttpsUri(String raw) {
    final trimmed = raw.trim();
    final uri = Uri.tryParse(
      trimmed.contains('://') ? trimmed : 'https://$trimmed',
    );
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
    return uri;
  }

  void _loadTypedUrl() {
    final uri = _safeHttpsUri(_urlController.text);
    if (uri == null) {
      setState(() => _status = 'Only https URLs are allowed');
      return;
    }
    _urlController.text = uri.toString();
    _controller?.loadRequest(uri);
    setState(() => _status = 'Loading ${uri.host}');
  }

  void _reload() {
    _controller?.reload();
    setState(() => _status = 'Reloading');
  }

  Future<void> _loadAgentSmokePage() async {
    final controller = _controller;
    if (controller == null) return;
    _logAgentBrowser(
      AgentBrowserLogEntry(
        level: AgentBrowserLogLevel.info,
        event: 'smoke-page.load',
        message: 'Loading local browser smoke page',
        fields: {'url': _agentSmokeUrl},
      ),
    );
    await controller.loadHtmlString(
      agentBrowserSmokePageHtml,
      baseUrl: _agentSmokeUrl,
    );
    if (!mounted) return;
    setState(() {
      _urlController.text = _agentSmokeUrl;
      _status = '';
    });
    await _installAgentBridge();
  }

  Future<AgentBrowserResult> _waitForAgentBrowserPage(
    String expectedTitle,
  ) async {
    final control = _agentControl;
    if (control == null) throw StateError('Browser control is not ready');
    final deadline = DateTime.now().add(const Duration(seconds: 4));
    AgentBrowserResult? lastResult;
    while (DateTime.now().isBefore(deadline)) {
      await Future<void>.delayed(const Duration(milliseconds: 75));
      lastResult = await control.snapshot(maxElements: 40, maxTextChars: 4000);
      if (lastResult.title == expectedTitle ||
          lastResult.url == _agentSmokeUrl) {
        return lastResult;
      }
    }
    throw StateError(
      'Timed out waiting for $expectedTitle; last page was '
      '${lastResult?.title ?? 'unknown'} at ${lastResult?.url ?? 'unknown'}',
    );
  }

  Future<void> _goBack() async {
    final controller = _controller;
    if (controller == null) return;
    if (await controller.canGoBack()) {
      await controller.goBack();
    }
  }

  Future<void> _installAgentBridge() async {
    final control = _agentControl;
    if (control == null) return;
    try {
      await control.install();
    } catch (error) {
      _logAgentBrowser(
        AgentBrowserLogEntry(
          level: AgentBrowserLogLevel.error,
          event: 'install.error',
          message: 'Bridge injection failed',
          fields: {'error': error.toString()},
        ),
      );
    }
  }

  Future<void> _startAgentBridgeIfEnabled() async {
    if (!_agentBridgeEnabled || _runningInWidgetTest || _agentBridge != null) {
      return;
    }
    try {
      final bridge = AgentBrowserWebSocketBridge(
        dispatcher: _createAgentCommandDispatcher(),
        logSink: _logAgentBrowser,
        token: _agentBridgeToken.isEmpty ? null : _agentBridgeToken,
      );
      _agentBridge = bridge;
      await bridge.start(port: _agentBridgePort);
    } catch (error) {
      _logAgentBrowser(
        AgentBrowserLogEntry(
          level: AgentBrowserLogLevel.error,
          event: 'ws.start.error',
          message: 'Failed to start browser bridge WebSocket server',
          fields: {'error': error.toString(), 'port': _agentBridgePort},
        ),
      );
    }
  }

  AgentBrowserCommandDispatcher _createAgentCommandDispatcher() {
    final controller = _controller;
    final control = _agentControl;
    if (controller == null || control == null) {
      throw StateError('Browser controller is not ready');
    }
    return AgentBrowserCommandDispatcher(
      logSink: _logAgentBrowser,
      handlers: {
        'load_smoke_page': (_) async {
          await _loadAgentSmokePage();
          final result = await _waitForAgentBrowserPage('Agent Browser Smoke');
          return {
            'url': result.url,
            'title': result.title,
            'message': 'Loaded local browser smoke page',
          };
        },
        'run_smoke': (request) async {
          await _installAgentBridge();
          return (await control.runSmokeWorkflow(
            fillValue: _argString(
              request.args,
              'fillValue',
              fallback: 'agent smoke passed',
            ),
          )).toJson();
        },
        'snapshot': (request) async {
          await _installAgentBridge();
          return (await control.snapshot(
            maxElements: _argInt(request.args, 'maxElements', fallback: 80),
            maxTextChars: _argInt(request.args, 'maxTextChars', fallback: 8000),
          )).toJson();
        },
        'find': (request) async {
          await _installAgentBridge();
          return (await control.find(
            _argString(
              request.args,
              'query',
              fallback: _argString(request.args, 'text'),
            ),
            maxElements: _argInt(request.args, 'maxElements', fallback: 20),
          )).toJson();
        },
        'scroll_by': (request) async {
          await _installAgentBridge();
          return (await control.scrollBy(
            x: _argInt(request.args, 'x'),
            y: _argInt(request.args, 'y', fallback: 640),
          )).toJson();
        },
        'scrollBy': (request) async {
          await _installAgentBridge();
          return (await control.scrollBy(
            x: _argInt(request.args, 'x'),
            y: _argInt(request.args, 'y', fallback: 640),
          )).toJson();
        },
        'click': (request) async {
          await _installAgentBridge();
          return (await control.click(_targetFromArgs(request.args))).toJson();
        },
        'fill': (request) async {
          await _installAgentBridge();
          return (await control.fill(
            _targetFromArgs(request.args),
            _argString(request.args, 'value'),
          )).toJson();
        },
        'navigate': (request) async {
          final uri = _safeHttpsUri(_argString(request.args, 'url'));
          if (uri == null) throw StateError('Only https URLs are allowed');
          await controller.loadRequest(uri);
          if (mounted) setState(() => _urlController.text = uri.toString());
          return {'url': uri.toString()};
        },
        'reload': (_) async {
          await controller.reload();
          return {'reloaded': true};
        },
        'back': (_) async {
          final canGoBack = await controller.canGoBack();
          if (canGoBack) await controller.goBack();
          return {'navigated': canGoBack};
        },
        'forward': (_) async {
          final canGoForward = await controller.canGoForward();
          if (canGoForward) await controller.goForward();
          return {'navigated': canGoForward};
        },
      },
    );
  }

  void _logAgentBrowser(AgentBrowserLogEntry entry) {
    debugPrint('[agent-browser] ${entry.toLine()}');
  }

  @override
  Widget build(BuildContext context) {
    final browserFrame = Card(
      filled: true,
      fillColor: const Color(0xFF080808),
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(10),
      padding: EdgeInsets.zero,
      boxShadow: const [],
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: _runningInWidgetTest
            ? const Center(child: Text('Preview opened inside the app'))
            : WebViewWidget(controller: _controller!),
      ),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
      child: Column(
        children: [
          Card(
            filled: true,
            fillColor: _Palette.input,
            borderColor: _Palette.border,
            borderRadius: BorderRadius.circular(10),
            padding: const EdgeInsets.all(6),
            boxShadow: const [],
            child: Row(
              children: [
                IconButton.outline(
                  onPressed: _goBack,
                  icon: const Icon(RadixIcons.arrowLeft, size: 14),
                ),
                const SizedBox(width: 6),
                IconButton.outline(
                  onPressed: _reload,
                  icon: const Icon(RadixIcons.reload, size: 14),
                ),
                const SizedBox(width: 8),
                const Icon(
                  RadixIcons.lockClosed,
                  size: 14,
                  color: _Palette.muted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _urlController,
                    placeholder: const Text('https://example.com'),
                    onSubmitted: (_) => _loadTypedUrl(),
                  ),
                ),
                if (_status.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 180),
                    child: Text(
                      _status,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: _Palette.muted,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
                const SizedBox(width: 8),
                IconButton.primary(
                  onPressed: _loadTypedUrl,
                  icon: const Icon(RadixIcons.arrowRight, size: 14),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(child: browserFrame),
        ],
      ),
    );
  }
}

int _argInt(Map<String, Object?> args, String key, {int fallback = 0}) {
  final value = args[key];
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

String _argString(
  Map<String, Object?> args,
  String key, {
  String fallback = '',
}) {
  final value = args[key];
  if (value == null) return fallback;
  final string = value.toString();
  return string.isEmpty ? fallback : string;
}

AgentBrowserTarget _targetFromArgs(Map<String, Object?> args) {
  final target = args['target'];
  if (target is Map) {
    return AgentBrowserTarget.fromJson(target.cast<String, Object?>());
  }
  return AgentBrowserTarget.fromJson(args);
}

class _UiKitPage extends StatelessWidget {
  const _UiKitPage();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: const [
        _SectionHeader(
          title: 'UI testing suite',
          subtitle:
              'End-to-end visual inventory for the UI patterns agents will use: navigation, indicators, chats, generated surfaces, approvals, and browser previews.',
        ),
        SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _ButtonsPanel()),
            SizedBox(width: 12),
            Expanded(child: _IndicatorsPanel()),
            SizedBox(width: 12),
            Expanded(child: _ApprovalExamplePanel()),
          ],
        ),
        SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _AgentRowSpecPanel()),
            SizedBox(width: 12),
            Expanded(child: _ChatSpecPanel()),
            SizedBox(width: 12),
            Expanded(child: _BrowserSpecPanel()),
          ],
        ),
      ],
    );
  }
}

class _AgentRowSpecPanel extends StatelessWidget {
  const _AgentRowSpecPanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Agent sidebar rows',
            subtitle:
                'Compact default selection, hover lift, unread count, and chat affordance.',
          ),
          SizedBox(height: 12),
          _AgentListItem(
            agent: _AgentDescriptor(
              id: 'sample',
              name: 'Executive',
              role: 'Plans and delegates',
              status: 'running',
              unread: 2,
              workItemId: 'work-track-pricing',
            ),
            selected: true,
          ),
          SizedBox(height: 6),
          _AgentListItem(
            agent: _AgentDescriptor(
              id: 'sample2',
              name: 'Builder',
              role: 'Ships code & previews',
              status: 'idle',
              unread: 0,
              workItemId: 'work-launch-preview',
            ),
            selected: false,
          ),
        ],
      ),
    );
  }
}

class _ChatSpecPanel extends StatelessWidget {
  const _ChatSpecPanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Agent chat states',
            subtitle:
                'Every selected agent owns a transcript and composer in the workspace.',
          ),
          SizedBox(height: 12),
          _ChatBubble(
            role: 'You',
            body: 'Prioritize the launch preview and show blockers.',
          ),
          SizedBox(height: 8),
          _ChatBubble(
            role: 'Executive',
            body:
                'I am routing Builder to preview work and Reviewer to approvals.',
          ),
        ],
      ),
    );
  }
}

class _BrowserSpecPanel extends StatelessWidget {
  const _BrowserSpecPanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Browser chrome',
            subtitle:
                'Full-height preview shell: URL bar, back/reload, status, and large content canvas.',
          ),
          SizedBox(height: 12),
          _SmallSurfaceLine(
            title: 'HTTPS preview canvas',
            subtitle:
                'Generated sites and artifact links open in the main browser page, not a cramped card.',
            leading: RadixIcons.globe,
          ),
        ],
      ),
    );
  }
}

class _ButtonsPanel extends StatelessWidget {
  const _ButtonsPanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Buttons',
            subtitle:
                'Primary, secondary, destructive, and disabled command affordances.',
          ),
          SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Button.primary(child: Text('Run')),
              Button.outline(child: Text('Review')),
              Button.destructive(child: Text('Stop')),
              Button.outline(enabled: false, child: Text('Disabled')),
            ],
          ),
        ],
      ),
    );
  }
}

class _IndicatorsPanel extends StatelessWidget {
  const _IndicatorsPanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Indicators',
            subtitle:
                'Status chips and loading labels used across WorkItems and generated surfaces.',
          ),
          SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatusPill(label: 'Running', color: _Palette.success),
              _StatusPill(label: 'Needs review', color: _Palette.warning),
              _StatusPill(label: 'Blocked', color: _Palette.info),
              _StateChip(label: 'Streaming…'),
            ],
          ),
        ],
      ),
    );
  }
}

class _ApprovalExamplePanel extends StatelessWidget {
  const _ApprovalExamplePanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Approval card',
            subtitle:
                'Human gate for publishing, tool use, spend, and repository writes.',
          ),
          SizedBox(height: 12),
          _SmallSurfaceLine(
            title: 'Publish preview domain',
            subtitle: 'Requires human approval before external visibility.',
            leading: RadixIcons.checkCircled,
          ),
          SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Button.primary(enabled: false, child: Text('Approve')),
              Button.outline(enabled: false, child: Text('Request changes')),
            ],
          ),
        ],
      ),
    );
  }
}

class _RunsPage extends StatelessWidget {
  const _RunsPage();

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 860;
    return ListView(
      padding: EdgeInsets.all(isCompact ? 8 : 14),
      children: [
        const _SectionHeader(
          title: 'Runs',
          subtitle:
              'Durable run ledger projection: status, events, approvals, generated UI, and artifacts in one replayable surface.',
        ),
        const SizedBox(height: 12),
        if (isCompact)
          const Column(
            children: [
              _RunLedgerCard(),
              SizedBox(height: 10),
              _ChatSurfacePanel(),
            ],
          )
        else
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 5, child: _RunLedgerCard()),
              SizedBox(width: 12),
              Expanded(flex: 7, child: _ChatSurfacePanel()),
            ],
          ),
      ],
    );
  }
}

class _AgentsPage extends StatelessWidget {
  const _AgentsPage();

  @override
  Widget build(BuildContext context) {
    return const _PlaceholderPage(
      title: 'Agents & Teams',
      subtitle:
          'Agent-team org chart, specialist profiles, team staffing, budgets, and heartbeats.',
      bullets: [
        'Executive agent',
        'Research team',
        'Build team',
        'Evaluator agents',
      ],
    );
  }
}

class _ArtifactsPage extends StatelessWidget {
  const _ArtifactsPage();

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 900;
    return ListView(
      padding: EdgeInsets.all(isCompact ? 8 : 14),
      children: [
        const _SectionHeader(
          title: 'Artifacts',
          subtitle:
              'Reports, websites, documents, code diffs, logs, screenshots, and preview deployments rendered as typed cards.',
        ),
        const SizedBox(height: 12),
        if (isCompact)
          const Column(
            children: [
              _ArtifactGalleryPanel(),
              SizedBox(height: 10),
              _MarkdownReportPanel(),
              SizedBox(height: 10),
              _BrowserPreviewPanel(),
            ],
          )
        else
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 6, child: _ArtifactGalleryPanel()),
              SizedBox(width: 12),
              Expanded(
                flex: 6,
                child: Column(
                  children: [
                    _MarkdownReportPanel(),
                    SizedBox(height: 12),
                    _BrowserPreviewPanel(),
                  ],
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _MiroPage extends StatelessWidget {
  const _MiroPage();

  @override
  Widget build(BuildContext context) {
    return const _PlaceholderPage(
      title: 'Miro Boards',
      subtitle:
          'Miro OAuth + MCP broker for board context, diagrams, docs, tables, prototypes, and Sidekick-like collaboration.',
      bullets: [
        'Connect Miro workspace',
        'Read board context',
        'Create diagrams',
        'Sync research tables',
      ],
    );
  }
}

class _ApprovalsPage extends StatelessWidget {
  const _ApprovalsPage();

  @override
  Widget build(BuildContext context) {
    return const _ApprovalQueuePanel();
  }
}

class _ChatSurfacePanel extends StatelessWidget {
  const _ChatSurfacePanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _SectionHeader(
            title: 'Agent conversation surface',
            subtitle:
                'A shadcn-native chat/timeline hybrid for commands, streamed Markdown, tools, approvals, and final reports.',
          ),
          SizedBox(height: 12),
          _ChatBubble(
            role: 'You',
            body:
                'Create a launch site, validate the market, run quality checks, publish a preview, and write the executive memo.',
            alignRight: true,
          ),
          SizedBox(height: 8),
          _ChatBubble(
            role: 'Executive agent',
            body:
                'I will split this into research, build, QA, preview publishing, and CEO-report workstreams. Approval is required before external publish.',
          ),
          SizedBox(height: 8),
          _ToolCallCard(),
          SizedBox(height: 12),
          TextArea(
            readOnly: true,
            minLines: 2,
            maxLines: 4,
            filled: true,
            initialValue:
                'Ask for a status update, request a report, or tell the team to revise the artifact...',
          ),
        ],
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  const _ChatBubble({
    required this.role,
    required this.body,
    this.alignRight = false,
  });

  final String role;
  final String body;
  final bool alignRight;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignRight ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Card(
          filled: true,
          fillColor: alignRight ? _Palette.input : const Color(0xFF101010),
          borderColor: _Palette.border,
          borderRadius: BorderRadius.circular(12),
          padding: const EdgeInsets.all(12),
          boxShadow: const [],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _StatusPill(label: role, color: _Palette.info),
              const SizedBox(height: 8),
              Text(body, style: const TextStyle(height: 1.35, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ToolCallCard extends StatelessWidget {
  const _ToolCallCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      filled: true,
      fillColor: _Palette.input,
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(12),
      padding: const EdgeInsets.all(12),
      boxShadow: const [],
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(RadixIcons.gear, size: 16, color: _Palette.text),
          SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Tool call: preview.publish',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                SizedBox(height: 4),
                Text(
                  'Blocked until human approval. Future events map to approval.requested and artifact.created.',
                  style: TextStyle(
                    color: _Palette.muted,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          _StatusPill(label: 'approval', color: _Palette.warning),
        ],
      ),
    );
  }
}

class _RunLedgerCard extends StatelessWidget {
  const _RunLedgerCard();

  @override
  Widget build(BuildContext context) {
    return const _Panel(
      padding: EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeader(
            title: 'Run ledger',
            subtitle:
                'Fixture projection of Control API -> DynamoDB -> ECS -> artifacts; ready for event reducer wiring.',
          ),
          SizedBox(height: 14),
          _TimelineItem(
            status: 'queued',
            title: 'Objective accepted by Control API',
            body:
                'Idempotent POST /runs creates durable run and first status event.',
          ),
          _TimelineItem(
            status: 'running',
            title: 'Worker emits canonical progress',
            body:
                'Runtime writes run.status and artifact.created events in order.',
          ),
          _TimelineItem(
            status: 'approval',
            title: 'Publish gate requires review',
            body:
                'Preview domains, GitHub writes, spend, and credentials pause for approval.',
            isLast: true,
          ),
        ],
      ),
    );
  }
}

class _ArtifactGalleryPanel extends StatelessWidget {
  const _ArtifactGalleryPanel();

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 760;
    final cards = const [
      _ArtifactTile(
        kind: 'report',
        title: 'CEO launch memo.md',
        body:
            'Markdown report with assumptions, market risks, and recommended next moves.',
        action: 'Open document',
      ),
      _ArtifactTile(
        kind: 'website',
        title: 'preview.solo-ceo.ai',
        body:
            'Generated launch site preview. Opens in the embedded browser shell.',
        action: 'Preview site',
      ),
      _ArtifactTile(
        kind: 'diff',
        title: 'product-site.patch',
        body:
            'Code changes stay as reviewable artifacts before any GitHub write.',
        action: 'Review diff',
      ),
      _ArtifactTile(
        kind: 'log',
        title: 'quality-gate.log',
        body:
            'Test, lint, deploy, and evaluator output is captured as an audit artifact.',
        action: 'Open log',
      ),
    ];

    return _Panel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Artifact workspace',
            subtitle:
                'Typed cards first; signed URLs, downloads, previews, and share actions wire in behind Control API.',
          ),
          const SizedBox(height: 12),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: isCompact ? 1 : 2,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: isCompact ? 2.5 : 1.55,
            children: cards,
          ),
        ],
      ),
    );
  }
}

class _ArtifactTile extends StatelessWidget {
  const _ArtifactTile({
    required this.kind,
    required this.title,
    required this.body,
    required this.action,
  });

  final String kind;
  final String title;
  final String body;
  final String action;

  @override
  Widget build(BuildContext context) {
    return Card(
      filled: true,
      fillColor: _Palette.input,
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(12),
      padding: const EdgeInsets.all(12),
      boxShadow: const [],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _StatusPill(label: kind, color: _Palette.info),
              const _StatusPill(label: 'S3 pointer', color: _Palette.warning),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 5),
          Expanded(
            child: Text(
              body,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: _Palette.muted,
                fontSize: 12,
                height: 1.3,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Button.outline(enabled: false, child: Text(action)),
        ],
      ),
    );
  }
}

class _MarkdownReportPanel extends StatelessWidget {
  const _MarkdownReportPanel();

  static const _report = '''
# Executive report preview

The client should render final agent output as rich Markdown, not plain text.

| Artifact | Status | Owner |
| --- | --- | --- |
| Launch page | Drafted | Build agent |
| Competitor scan | Running | Research agent |
| CEO memo | Ready | Executive agent |

```text
quality gate -> tests -> preview -> approval -> publish
```
''';

  @override
  Widget build(BuildContext context) {
    return _Panel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Markdown document viewer',
            subtitle:
                'markdown_widget renders reports, tables, code blocks, and research artifacts inside shadcn cards.',
          ),
          const SizedBox(height: 12),
          Card(
            filled: true,
            fillColor: _Palette.input,
            borderColor: _Palette.border,
            borderRadius: BorderRadius.circular(12),
            padding: const EdgeInsets.all(12),
            boxShadow: const [],
            child: const md.MarkdownBlock(data: _report, selectable: true),
          ),
        ],
      ),
    );
  }
}

class _BrowserPreviewPanel extends StatelessWidget {
  const _BrowserPreviewPanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Browser',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          const _BrowserToolbar(),
          const SizedBox(height: 10),
          const _BrowserFramePlaceholder(),
        ],
      ),
    );
  }
}

class _BrowserToolbar extends StatelessWidget {
  const _BrowserToolbar();

  @override
  Widget build(BuildContext context) {
    return Card(
      filled: true,
      fillColor: _Palette.input,
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(12),
      padding: const EdgeInsets.all(8),
      boxShadow: const [],
      child: Row(
        children: const [
          Icon(RadixIcons.lockClosed, size: 14, color: _Palette.text),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'https://launch-demo.preview.solo-ceo.ai',
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: _Palette.text),
            ),
          ),
          SizedBox(width: 8),
          IconButton.outline(
            enabled: false,
            icon: Icon(RadixIcons.openInNewWindow, size: 14),
          ),
          SizedBox(width: 6),
          IconButton.outline(
            enabled: false,
            icon: Icon(RadixIcons.share1, size: 14),
          ),
        ],
      ),
    );
  }
}

class _BrowserFramePlaceholder extends StatelessWidget {
  const _BrowserFramePlaceholder();

  @override
  Widget build(BuildContext context) {
    return Card(
      filled: true,
      fillColor: const Color(0xFF0A0A0A),
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(12),
      padding: const EdgeInsets.all(16),
      boxShadow: const [],
      child: const SizedBox(
        height: 170,
        width: double.infinity,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(RadixIcons.globe, size: 28, color: _Palette.text),
            SizedBox(height: 10),
            Text('Preview', style: TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }
}

class _ApprovalQueuePanel extends StatelessWidget {
  const _ApprovalQueuePanel();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: const [
        _SectionHeader(
          title: 'Inbox',
          subtitle:
              'Decisions, approvals, publish gates, and agent requests that need attention.',
        ),
        SizedBox(height: 12),
        _ApprovalCard(
          risk: 'external publish',
          title: 'Publish launch-demo.preview.solo-ceo.ai',
          body:
              'The build agent finished a preview website. Publishing exposes generated content on a public preview domain.',
        ),
        SizedBox(height: 10),
        _ApprovalCard(
          risk: 'GitHub write',
          title: 'Create pull request with generated site changes',
          body:
              'Code writes remain blocked until policy, tests, and scoped GitHub credentials are approved.',
        ),
      ],
    );
  }
}

class _ApprovalCard extends StatelessWidget {
  const _ApprovalCard({
    required this.risk,
    required this.title,
    required this.body,
  });

  final String risk;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatusPill(label: risk, color: _Palette.warning),
              const _StatusPill(label: 'inbox.requested', color: _Palette.info),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            style: const TextStyle(color: _Palette.muted, height: 1.35),
          ),
          const SizedBox(height: 12),
          const Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Button.primary(enabled: false, child: Text('Approve')),
              Button.outline(enabled: false, child: Text('Request revision')),
              Button.destructive(enabled: false, child: Text('Deny')),
            ],
          ),
        ],
      ),
    );
  }
}

class _PlaceholderPage extends StatelessWidget {
  const _PlaceholderPage({
    required this.title,
    required this.subtitle,
    required this.bullets,
  });

  final String title;
  final String subtitle;
  final List<String> bullets;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: _Panel(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: const TextStyle(color: _Palette.muted, height: 1.45),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final bullet in bullets)
                    _StatusPill(label: bullet, color: _Palette.info),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimelineItem extends StatelessWidget {
  const _TimelineItem({
    required this.status,
    required this.title,
    required this.body,
    this.isLast = false,
  });

  final String status;
  final String title;
  final String body;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: const BoxDecoration(
                color: _Palette.accent,
                shape: BoxShape.circle,
              ),
            ),
            if (!isLast)
              Container(width: 1, height: 58, color: _Palette.border),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _StatusPill(label: status, color: _Palette.warning),
                const SizedBox(height: 6),
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 3),
                Text(
                  body,
                  style: const TextStyle(
                    color: _Palette.muted,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: const TextStyle(
            color: _Palette.muted,
            fontSize: 12,
            height: 1.35,
          ),
        ),
      ],
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child, this.padding = const EdgeInsets.all(12)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      padding: padding,
      filled: true,
      fillColor: _Palette.panel,
      borderColor: _Palette.border,
      borderRadius: BorderRadius.circular(10),
      boxShadow: const [],
      child: child,
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return OutlineBadge(
      child: Text(
        label,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

abstract final class _Palette {
  static const background = Color(0xFF050505);
  static const sidebar = Color(0xFF070707);
  static const panel = Color(0xFF0D0D0D);
  static const input = Color(0xFF111111);
  static const border = Color(0xFF262626);
  static const text = Color(0xFFF5F5F5);
  static const muted = Color(0xFFA3A3A3);
  static const accent = Color(0xFFFFFFFF);
  static const success = Color(0xFFD4D4D4);
  static const warning = Color(0xFFBDBDBD);
  static const info = Color(0xFFE5E5E5);
}

/// Landing tab for live voice calls. Hosts a fresh ConversationStore +
/// AgentInbox per visit and a CTA that pushes [VoiceModeScreen] as a
/// full-screen modal. The modal pops back here on hangup.
class _VoiceCallEntryPage extends StatefulWidget {
  const _VoiceCallEntryPage();

  @override
  State<_VoiceCallEntryPage> createState() => _VoiceCallEntryPageState();
}

class _VoiceCallEntryPageState extends State<_VoiceCallEntryPage> {
  final ConversationStore _store = ConversationStore();
  late final AgentInbox _inbox = AgentInbox(
    store: _store,
    notifications: NotificationService.instance,
  );

  @override
  void initState() {
    super.initState();
    unawaited(_attachPersistence());
  }

  Future<void> _attachPersistence() async {
    final persistence = await StorePersistence.open();
    await _store.attachPersistence(persistence);
  }

  @override
  void dispose() {
    _inbox.dispose();
    _store.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VoiceModeScreen(store: _store, inbox: _inbox),
      ),
    );
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Live conversation',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: _Palette.text,
                  letterSpacing: -0.5,
                ),
              ),
              const Gap(8),
              const Text(
                'Speak naturally. The agent listens, responds out loud, '
                'and you can interrupt at any time.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: _Palette.muted,
                  fontSize: 13,
                  height: 1.45,
                ),
              ),
              const Gap(20),
              PrimaryButton(
                onPressed: _open,
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(LucideIcons.audioLines, size: 16),
                    Gap(8),
                    Text('Start conversation'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
