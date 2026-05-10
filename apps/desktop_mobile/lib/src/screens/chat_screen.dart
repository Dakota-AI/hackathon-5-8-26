import 'dart:async';

import 'package:flutter/services.dart' show HapticFeedback, TextInputAction;
import 'package:markdown_widget/markdown_widget.dart' as md;
import 'package:shadcn_flutter/shadcn_flutter.dart';

import '../conversation/agent_inbox.dart';
import '../conversation/conversation_store.dart';
import '../conversation/store_persistence.dart';
import '../notifications/notification_service.dart';
import '../ui/genui_block.dart';
import '../ui/streaming_text.dart';
import '../ui/tokens.dart';
import 'voice_mode_screen.dart';

/// Text chat surface — message list + composer + voice escalation.
///
/// Sign-out and other global actions live in the outer agents-cloud
/// shell `_TopBar`, not here.
class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context) => const AgentChatSurface();
}

class AgentChatSurface extends StatefulWidget {
  const AgentChatSurface({
    super.key,
    this.showVoiceAction = true,
    this.compact = false,
  });

  final bool showVoiceAction;
  final bool compact;

  @override
  State<AgentChatSurface> createState() => _AgentChatSurfaceState();
}

class _AgentChatSurfaceState extends State<AgentChatSurface>
    with WidgetsBindingObserver {
  final _store = ConversationStore();
  late final AgentInbox _inbox;
  final _composer = TextEditingController();
  final _scroll = ScrollController();
  final _focus = FocusNode();
  StreamSubscription<Turn>? _newTurnSub;
  StreamSubscription<String?>? _notifTapSub;
  StreamSubscription<String>? _notifReplySub;
  Timer? _diskPoll;
  DateTime? _lastDiskMtime;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _inbox = AgentInbox(
      store: _store,
      notifications: NotificationService.instance,
    );
    _store.addListener(_handleStoreChange);
    _newTurnSub = _store.onNewAgentTurn.listen(_handleNewAgentTurn);
    _notifTapSub = NotificationService.instance.onTapped.listen((_) {
      // Tapping a banner means user is interacting — pull the latest disk
      // state in case the background isolate just appended turns.
      unawaited(_store.reload());
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.jumpTo(_scroll.position.maxScrollExtent);
        }
      });
    });
    _notifReplySub = NotificationService.instance.onReply.listen((reply) {
      // User replied inline from the banner — route through the same path
      // as if they'd typed it in the composer.
      unawaited(_store.sendUser(text: reply));
    });
    NotificationService.instance.setChatVisible(true);
    unawaited(_attachPersistence());
  }

  Future<void> _attachPersistence() async {
    final persistence = await StorePersistence.open();
    await _store.attachPersistence(persistence);
    _lastDiskMtime = await _store.persistedAt();
    // Poll the persistence file every 2s while the chat is foregrounded.
    // If the background reply isolate writes mid-foreground (rare but
    // possible), reload to pick up the change.
    _diskPoll = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (!mounted) return;
      final now = await _store.persistedAt();
      if (now == null) return;
      if (_lastDiskMtime != null && now.isAfter(_lastDiskMtime!)) {
        // Don't reload while we ourselves are streaming a reply — that's
        // our own writes.
        if (_store.isResponding) {
          _lastDiskMtime = now;
          return;
        }
        _lastDiskMtime = now;
        await _store.reload();
      } else {
        _lastDiskMtime = now;
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    NotificationService.instance.setChatVisible(false);
    _store.removeListener(_handleStoreChange);
    _newTurnSub?.cancel();
    _notifTapSub?.cancel();
    _notifReplySub?.cancel();
    _diskPoll?.cancel();
    _inbox.dispose();
    _store.dispose();
    _composer.dispose();
    _scroll.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    NotificationService.instance.setChatVisible(
      state == AppLifecycleState.resumed,
    );
    if (state == AppLifecycleState.resumed) {
      // The background reply isolate may have appended turns to disk
      // while we were suspended. Pull the canonical state back in.
      unawaited(_store.reload());
    }
  }

  void _handleStoreChange() {
    if (!mounted) return;
    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _handleNewAgentTurn(Turn turn) {
    if (turn.origin == TurnOrigin.proactive) {
      HapticFeedback.mediumImpact();
    }
  }

  Future<void> _send() async {
    final text = _composer.text.trim();
    if (text.isEmpty || _store.isResponding) return;
    _composer.clear();
    _focus.requestFocus();
    await _store.sendUser(text: text);
  }

  Future<void> _startConversation() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VoiceModeScreen(store: _store, inbox: _inbox),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Palette.background,
      child: SafeArea(
        bottom:
            false, // Composer handles its own bottom inset via SafeArea below.
        child: Column(
          children: [
            Expanded(
              child: _store.turns.isEmpty
                  ? const _EmptyState()
                  : ListView.builder(
                      controller: _scroll,
                      padding: EdgeInsets.fromLTRB(
                        widget.compact ? 10 : 16,
                        widget.compact ? 10 : 16,
                        widget.compact ? 10 : 16,
                        8,
                      ),
                      itemCount: _store.turns.length,
                      itemBuilder: (context, index) {
                        final turn = _store.turns[index];
                        return _TurnView(key: ValueKey(turn.id), turn: turn);
                      },
                    ),
            ),
            _Composer(
              controller: _composer,
              focusNode: _focus,
              busy: _store.isResponding,
              onSubmit: _send,
              onConversation: widget.showVoiceAction
                  ? _startConversation
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Icon(
        RadixIcons.chatBubble,
        size: 24,
        color: Palette.muted.withValues(alpha: 0.42),
      ),
    );
  }
}

class _TurnView extends StatefulWidget {
  const _TurnView({super.key, required this.turn});

  final Turn turn;

  @override
  State<_TurnView> createState() => _TurnViewState();
}

class _TurnViewState extends State<_TurnView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _entry;

  @override
  void initState() {
    super.initState();
    _entry = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
    )..forward();
  }

  @override
  void dispose() {
    _entry.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final turn = widget.turn;
    final isUser = turn.role == TurnRole.user;
    final alignment = isUser ? Alignment.centerRight : Alignment.centerLeft;
    final bg = isUser ? Palette.input : Palette.panel;
    final border = isUser ? Palette.borderStrong : Palette.border;
    final segments = isUser
        ? const <AgentSegment>[]
        : parseAgentText(turn.text);
    final hasGenui = segments.any((s) => s is GenUiSegment);
    final isProactive = turn.origin == TurnOrigin.proactive;

    return FadeTransition(
      opacity: _entry,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.12),
          end: Offset.zero,
        ).animate(CurvedAnimation(parent: _entry, curve: Curves.easeOutCubic)),
        child: Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Align(
            alignment: alignment,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: hasGenui ? double.infinity : 520,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (isProactive)
                    Padding(
                      padding: const EdgeInsets.only(left: 4, bottom: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: const [
                          Icon(RadixIcons.bell, size: 10, color: Palette.muted),
                          Gap(4),
                          Text(
                            'Agent reached out',
                            style: TextStyle(
                              color: Palette.muted,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                  Container(
                    width: hasGenui ? double.infinity : null,
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                    decoration: BoxDecoration(
                      color: bg,
                      border: Border.all(color: border),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: isUser
                        ? Text(
                            turn.text,
                            style: const TextStyle(
                              color: Palette.text,
                              fontSize: 14,
                              height: 1.45,
                            ),
                          )
                        : _AgentBody(turn: turn, segments: segments),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AgentBody extends StatelessWidget {
  const _AgentBody({required this.turn, required this.segments});

  final Turn turn;
  final List<AgentSegment> segments;

  @override
  Widget build(BuildContext context) {
    if (turn.error) {
      return Text(
        turn.text,
        style: const TextStyle(
          color: Palette.danger,
          fontSize: 13,
          height: 1.45,
        ),
      );
    }

    if (turn.streaming && segments.isEmpty && turn.text.isEmpty) {
      return const _StreamingDots();
    }

    if (segments.isEmpty) {
      // Stream the raw text while it's still flowing.
      return turn.streaming
          ? StreamingText(
              text: turn.text,
              charactersPerSecond: 240,
              style: const TextStyle(
                color: Palette.text,
                fontSize: 14,
                height: 1.45,
              ),
            )
          : _PlainOrMarkdown(text: turn.text);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < segments.length; i++)
          _segmentWidget(segments[i], turn, i),
      ],
    );
  }

  Widget _segmentWidget(AgentSegment segment, Turn turn, int index) {
    return switch (segment) {
      TextSegment(:final text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: _PlainOrMarkdown(text: text),
      ),
      GenUiSegment(:final json) => GenUiBlock(
        surfaceId: '${turn.id}-genui-$index',
        payload: json,
      ),
    };
  }
}

class _PlainOrMarkdown extends StatelessWidget {
  const _PlainOrMarkdown({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final hasMarkdown = _looksLikeMarkdown(text);
    if (!hasMarkdown) {
      return Text(
        text,
        style: const TextStyle(color: Palette.text, fontSize: 14, height: 1.45),
      );
    }
    return md.MarkdownBlock(
      data: text,
      selectable: true,
      config: md.MarkdownConfig.darkConfig.copy(
        configs: [
          const md.PConfig(
            textStyle: TextStyle(
              color: Palette.text,
              fontSize: 14,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }

  bool _looksLikeMarkdown(String text) {
    return text.contains('\n# ') ||
        text.contains('\n## ') ||
        text.startsWith('# ') ||
        text.startsWith('## ') ||
        text.contains('```') ||
        text.contains('\n- ') ||
        text.contains('\n* ') ||
        text.contains('|---');
  }
}

class _StreamingDots extends StatefulWidget {
  const _StreamingDots();

  @override
  State<_StreamingDots> createState() => _StreamingDotsState();
}

class _StreamingDotsState extends State<_StreamingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (i) {
        return AnimatedBuilder(
          animation: _ctrl,
          builder: (context, _) {
            final phase = ((_ctrl.value * 3) - i).clamp(0.0, 1.0);
            final opacity = 0.25 + (phase * 0.55);
            return Container(
              width: 6,
              height: 6,
              margin: EdgeInsets.only(right: i == 2 ? 0 : 4),
              decoration: BoxDecoration(
                color: Palette.text.withValues(alpha: opacity),
                shape: BoxShape.circle,
              ),
            );
          },
        );
      }),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.busy,
    required this.onSubmit,
    required this.onConversation,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool busy;
  final VoidCallback onSubmit;
  final VoidCallback? onConversation;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Palette.border)),
        color: Palette.background,
      ),
      // SafeArea here so the home-indicator gets its 34px when the
      // keyboard is closed, but ignored when the keyboard is up
      // (Scaffold resize handles that automatically).
      child: SafeArea(
        top: false,
        left: false,
        right: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (onConversation != null) ...[
                SizedBox(
                  width: 44,
                  height: 44,
                  child: GhostButton(
                    density: ButtonDensity.icon,
                    onPressed: onConversation,
                    child: const Icon(LucideIcons.audioLines, size: 16),
                  ),
                ),
                const Gap(8),
              ],
              Expanded(
                child: TextArea(
                  controller: controller,
                  focusNode: focusNode,
                  initialHeight: 44,
                  minHeight: 44,
                  maxHeight: 140,
                  placeholder: const Text('Message…'),
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => onSubmit(),
                ),
              ),
              const Gap(8),
              SizedBox(
                width: 48,
                height: 44,
                child: PrimaryButton(
                  density: ButtonDensity.icon,
                  onPressed: busy ? null : onSubmit,
                  child: busy
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(),
                        )
                      : const Icon(RadixIcons.arrowUp, size: 16),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
