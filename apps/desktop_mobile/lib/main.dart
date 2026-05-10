import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:genui/genui.dart' as genui;
import 'package:shadcn_flutter/shadcn_flutter.dart';

import 'backend_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AgentsCloudBackend.configureAmplify();
  runApp(const AgentsCloudConsoleApp());
}

enum ConsolePage { commandCenter, runs, agents, artifacts, miro, approvals }

final selectedPageProvider = StateProvider<ConsolePage>(
  (ref) => ConsolePage.commandCenter,
);

class AgentsCloudConsoleApp extends StatelessWidget {
  const AgentsCloudConsoleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      child: ShadcnApp(
        title: 'Agents Cloud',
        debugShowCheckedModeBanner: false,
        themeMode: ThemeMode.dark,
        theme: const ThemeData.dark(
          colorScheme: ColorSchemes.darkNeutral,
          radius: 0.45,
        ),
        home: const ConsoleShell(),
      ),
    );
  }
}

class ConsoleShell extends ConsumerWidget {
  const ConsoleShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedPage = ref.watch(selectedPageProvider);

    return Scaffold(
      backgroundColor: _Palette.background,
      child: SafeArea(
        child: Row(
          children: [
            _Sidebar(selectedPage: selectedPage),
            const SizedBox(width: 1, child: ColoredBox(color: _Palette.border)),
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
    return Container(
      width: 236,
      color: _Palette.sidebar,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _BrandHeader(),
          const SizedBox(height: 16),
          _NavButton(
            label: 'Command Center',
            icon: RadixIcons.dashboard,
            page: ConsolePage.commandCenter,
            selected: selectedPage == ConsolePage.commandCenter,
          ),
          _NavButton(
            label: 'Runs',
            icon: RadixIcons.activityLog,
            page: ConsolePage.runs,
            selected: selectedPage == ConsolePage.runs,
          ),
          _NavButton(
            label: 'Agents & Teams',
            icon: RadixIcons.group,
            page: ConsolePage.agents,
            selected: selectedPage == ConsolePage.agents,
          ),
          _NavButton(
            label: 'Artifacts',
            icon: RadixIcons.archive,
            page: ConsolePage.artifacts,
            selected: selectedPage == ConsolePage.artifacts,
          ),
          _NavButton(
            label: 'Miro Boards',
            icon: RadixIcons.component1,
            page: ConsolePage.miro,
            selected: selectedPage == ConsolePage.miro,
          ),
          _NavButton(
            label: 'Approvals',
            icon: RadixIcons.checkCircled,
            page: ConsolePage.approvals,
            selected: selectedPage == ConsolePage.approvals,
          ),
          const Spacer(),
          const _ConnectionCard(),
        ],
      ),
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    return const Row(
      children: [
        _LogoMark(),
        SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Agents Cloud',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
              SizedBox(height: 2),
              Text(
                'Autonomous company console',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: _Palette.muted, fontSize: 11),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LogoMark extends StatelessWidget {
  const _LogoMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        color: _Palette.accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _Palette.accent.withValues(alpha: 0.35)),
      ),
      child: const Icon(RadixIcons.cube, color: _Palette.accent, size: 19),
    );
  }
}

class _NavButton extends ConsumerWidget {
  const _NavButton({
    required this.label,
    required this.icon,
    required this.page,
    required this.selected,
  });

  final String label;
  final IconData icon;
  final ConsolePage page;
  final bool selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: NavigationItem(
        selected: selected,
        onChanged: (value) {
          if (value) ref.read(selectedPageProvider.notifier).state = page;
        },
        label: Text(label, overflow: TextOverflow.ellipsis),
        child: Icon(icon, size: 17),
      ),
    );
  }
}

class _ConnectionCard extends StatelessWidget {
  const _ConnectionCard();

  @override
  Widget build(BuildContext context) {
    return const _Panel(
      padding: EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StatusPill(
            label: 'Amplify Auth configured',
            color: _Palette.success,
          ),
          SizedBox(height: 8),
          _StatusPill(label: 'Control API configured', color: _Palette.success),
          SizedBox(height: 8),
          Text(
            'Cognito Auth and the deployed Control API endpoint are available for native client wiring.',
            style: TextStyle(color: _Palette.muted, fontSize: 11, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 54,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: const Row(
        children: [
          Expanded(
            child: Text(
              'CEO command center',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
          ),
          _StatusPill(
            label: 'Amplify Auth configured',
            color: _Palette.success,
          ),
          SizedBox(width: 8),
          _StatusPill(label: 'Control API live', color: _Palette.success),
          SizedBox(width: 8),
          _StatusPill(label: 'GenUI ready', color: _Palette.success),
        ],
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
      ConsolePage.commandCenter => const _CommandCenterPage(),
      ConsolePage.runs => const _RunsPage(),
      ConsolePage.agents => const _AgentsPage(),
      ConsolePage.artifacts => const _ArtifactsPage(),
      ConsolePage.miro => const _MiroPage(),
      ConsolePage.approvals => const _ApprovalsPage(),
    };
  }
}

class _CommandCenterPage extends StatelessWidget {
  const _CommandCenterPage();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: const [
        _HeroCommandPanel(),
        SizedBox(height: 12),
        _MetricsStrip(),
        SizedBox(height: 12),
        Row(
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

class _HeroCommandPanel extends StatelessWidget {
  const _HeroCommandPanel();

  @override
  Widget build(BuildContext context) {
    return _Panel(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              _StatusPill(
                label: 'Autonomous control plane',
                color: _Palette.accent,
              ),
              SizedBox(width: 8),
              _StatusPill(
                label: 'CEO command workflow',
                color: _Palette.success,
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Issue one strategic command. Agents Cloud plans, staffs, delegates, builds, tests, publishes, and reports back.',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              height: 1.12,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _Palette.input,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _Palette.border),
            ),
            child: const Row(
              children: [
                Icon(RadixIcons.magicWand, color: _Palette.accent, size: 18),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Create a new product for AI-powered market research, staff the agent team, build the first landing page, test it, and prepare a CEO report.',
                    style: TextStyle(color: _Palette.text, height: 1.4),
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

class _MetricsStrip extends StatelessWidget {
  const _MetricsStrip();

  @override
  Widget build(BuildContext context) {
    return const Row(
      children: [
        Expanded(
          child: _MetricCard(
            label: 'Active runs',
            value: '0',
            hint: 'Control API live',
          ),
        ),
        SizedBox(width: 10),
        Expanded(
          child: _MetricCard(
            label: 'Agent teams',
            value: '3',
            hint: 'Exec, build, research',
          ),
        ),
        SizedBox(width: 10),
        Expanded(
          child: _MetricCard(
            label: 'Artifacts',
            value: '0',
            hint: 'S3 wiring planned',
          ),
        ),
        SizedBox(width: 10),
        Expanded(
          child: _MetricCard(
            label: 'Preview hosts',
            value: '0',
            hint: '*.preview domain',
          ),
        ),
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
    return _Panel(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: _Palette.muted, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            hint,
            style: const TextStyle(color: _Palette.muted, fontSize: 11),
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

class _RunsPage extends StatelessWidget {
  const _RunsPage();

  @override
  Widget build(BuildContext context) {
    return const _PlaceholderPage(
      title: 'Runs',
      subtitle:
          'Durable run ledger for CEO commands, team delegation, events, artifacts, and status.',
      bullets: [
        'POST /runs',
        'GET /runs/{runId}',
        'Live event stream',
        'Run cancellation',
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
    return const _PlaceholderPage(
      title: 'Artifacts',
      subtitle:
          'Reports, websites, documents, code diffs, test outputs, screenshots, and preview deployments.',
      bullets: [
        'S3 artifact browser',
        'Signed URLs',
        'Website preview tiles',
        'Document viewer',
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
    return const _PlaceholderPage(
      title: 'Approvals',
      subtitle:
          'Human-in-the-loop control for publishing, spending, tool creation, credential use, and GitHub writes.',
      bullets: [
        'Approve deployment',
        'Reject risky action',
        'Request revision',
        'Audit every decision',
      ],
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
