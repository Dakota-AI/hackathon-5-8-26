import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

import '../ui/agent_orb.dart';
import '../ui/brand_mark.dart';
import '../ui/tokens.dart';
import 'orb_control_controller.dart';

/// Global assistant-control presence.
///
/// This layer is intentionally quiet by default. The main agent can surface a
/// top-bar text prompt for normal guided work, and the draggable blob/orb only
/// appears during voice mode. It does not own navigation or block the app.
class OrbControlLayer extends ConsumerWidget {
  const OrbControlLayer({super.key});

  static const _orbWidth = 172.0;
  static const _orbHeight = 96.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(orbControlControllerProvider);
    if (state.presence != OrbControlPresence.voice) {
      return const SizedBox.shrink();
    }

    final controller = ref.read(orbControlControllerProvider.notifier);
    final media = MediaQuery.sizeOf(context);
    final isCompact = media.width < 760;
    final defaultPosition = Offset(
      media.width - _orbWidth - 18,
      media.height - _orbHeight - (isCompact ? 78 : 22),
    );
    final position = _clampPosition(
      state.position ?? defaultPosition,
      media,
      isCompact,
    );

    return Positioned.fill(
      child: IgnorePointer(
        ignoring: false,
        child: Stack(
          children: [
            Positioned(
              left: position.dx,
              top: position.dy,
              child: _VoiceOrbHandle(
                status: state.statusLine,
                orbState: state.mode.orbState,
                onTap: controller.returnToTextMode,
                onPanUpdate: (delta) => controller.updatePosition(
                  _clampPosition(position + delta, media, isCompact),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Offset _clampPosition(Offset input, Size size, bool isCompact) {
    final bottomReserve = isCompact ? 84.0 : 18.0;
    final maxX = (size.width - _orbWidth - 8).clamp(8.0, size.width);
    final maxY = (size.height - _orbHeight - bottomReserve).clamp(
      8.0,
      size.height,
    );
    return Offset(input.dx.clamp(8.0, maxX), input.dy.clamp(8.0, maxY));
  }
}

class OrbTopBarStatus extends ConsumerWidget {
  const OrbTopBarStatus({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(orbControlControllerProvider);
    final controller = ref.read(orbControlControllerProvider.notifier);

    if (state.presence == OrbControlPresence.hidden) {
      return const SizedBox.shrink();
    }

    if (state.presence == OrbControlPresence.voice) {
      return _TopBarMessage(
        leading: 'Voice',
        message: state.statusLine,
        actions: [
          _TopBarControlButton(
            label: 'Text',
            onTap: controller.returnToTextMode,
            muted: true,
          ),
          _TopBarControlButton(
            label: 'Close',
            onTap: controller.dismiss,
            muted: true,
          ),
        ],
      );
    }

    return _TopBarMessage(
      leading: state.mode.label,
      message: state.statusLine,
      actions: [
        _TopBarControlButton(
          label: 'Voice',
          onTap: controller.enterVoiceMode,
          muted: true,
        ),
        if (state.pendingApproval != null) ...[
          _TopBarControlButton(
            label: 'Approve',
            onTap: controller.approvePending,
          ),
          _TopBarControlButton(
            label: 'Reject',
            onTap: controller.rejectPending,
            muted: true,
          ),
        ] else
          _TopBarControlButton(
            label: state.controlPaused ? 'Resume' : 'Pause',
            onTap: state.controlPaused
                ? controller.resumeControl
                : controller.pauseControl,
            muted: true,
          ),
        _TopBarControlButton(
          label: 'Close',
          onTap: controller.dismiss,
          muted: true,
        ),
      ],
      trailer: state.artifacts.isEmpty
          ? null
          : '${state.artifacts.first.name} · ${state.artifacts.first.kind}',
    );
  }
}

class _TopBarMessage extends StatelessWidget {
  const _TopBarMessage({
    required this.leading,
    required this.message,
    required this.actions,
    this.trailer,
  });

  final String leading;
  final String message;
  final List<Widget> actions;
  final String? trailer;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('orb-control-topbar-message'),
      height: 30,
      constraints: const BoxConstraints(maxWidth: 920),
      padding: const EdgeInsets.only(left: 9, right: 5),
      decoration: BoxDecoration(
        color: Palette.input.withValues(alpha: 0.82),
        border: Border.all(color: Palette.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _TinyBlob(label: leading),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              trailer == null ? message : '$message  •  $trailer',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                color: Palette.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 8),
          ...actions.map(
            (action) =>
                Padding(padding: const EdgeInsets.only(left: 4), child: action),
          ),
        ],
      ),
    );
  }
}

class _TopBarControlButton extends StatelessWidget {
  const _TopBarControlButton({
    super.key,
    required this.label,
    required this.onTap,
    this.muted = false,
  });

  final String label;
  final VoidCallback? onTap;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return MouseRegion(
      cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 120),
          opacity: enabled ? 1 : 0.55,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            decoration: BoxDecoration(
              color: muted ? Colors.transparent : Palette.text,
              border: Border.all(
                color: muted ? Palette.borderStrong : Palette.text,
              ),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: muted ? Palette.muted : Palette.background,
                fontSize: 10,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _VoiceOrbHandle extends StatelessWidget {
  const _VoiceOrbHandle({
    required this.status,
    required this.orbState,
    required this.onTap,
    required this.onPanUpdate,
  });

  final String status;
  final AgentOrbState orbState;
  final VoidCallback onTap;
  final ValueChanged<Offset> onPanUpdate;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.grab,
      child: GestureDetector(
        key: const ValueKey('orb-control-voice-blob'),
        behavior: HitTestBehavior.translucent,
        onTap: onTap,
        onPanUpdate: (details) => onPanUpdate(details.delta),
        child: SizedBox(
          width: 172,
          height: 96,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.bottomCenter,
            children: [
              Positioned(
                top: 0,
                child: _ThinkingBubble(
                  text: status,
                  emphasized:
                      orbState == AgentOrbState.thinking ||
                      orbState == AgentOrbState.speaking,
                ),
              ),
              Positioned(bottom: 0, child: AgentOrb(state: orbState, size: 58)),
            ],
          ),
        ),
      ),
    );
  }
}

class _TinyBlob extends StatelessWidget {
  const _TinyBlob({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      tooltip: (context) => TooltipContainer(child: Text(label)),
      child: Container(
        width: 19,
        height: 19,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: Palette.text.withValues(alpha: 0.08),
          border: Border.all(color: Palette.borderStrong),
          borderRadius: BorderRadius.circular(999),
        ),
        child: const BrandMark(size: 13),
      ),
    );
  }
}

class _ThinkingBubble extends StatelessWidget {
  const _ThinkingBubble({required this.text, required this.emphasized});

  final String text;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      width: 168,
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(
        color: Palette.background.withValues(alpha: 0.94),
        border: Border.all(
          color: emphasized ? Palette.text : Palette.borderStrong,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Palette.background.withValues(alpha: 0.55),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            text,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Palette.text,
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 5),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ThinkingDot(active: emphasized, delay: 0),
              const SizedBox(width: 3),
              _ThinkingDot(active: emphasized, delay: 1),
              const SizedBox(width: 3),
              _ThinkingDot(active: emphasized, delay: 2),
            ],
          ),
        ],
      ),
    );
  }
}

class _ThinkingDot extends StatelessWidget {
  const _ThinkingDot({required this.active, required this.delay});

  final bool active;
  final int delay;

  @override
  Widget build(BuildContext context) {
    final opacity = active ? (0.35 + delay * 0.22).clamp(0.0, 1.0) : 0.25;
    return Container(
      width: 4,
      height: 4,
      decoration: BoxDecoration(
        color: Palette.text.withValues(alpha: opacity),
        borderRadius: BorderRadius.circular(999),
      ),
    );
  }
}
