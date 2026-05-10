import 'dart:math' as math;

import 'package:shadcn_flutter/shadcn_flutter.dart';

import 'tokens.dart';

/// High-level visual state of the agent during a call.
///
/// Mirrors the public phone-app contract from
/// `docs/remote-runner-product-pivot.md` so the orb stays the single source
/// of truth for what the customer perceives, regardless of internal
/// WebRTC/ICE detail.
enum AgentOrbState { connecting, idle, listening, thinking, speaking, error }

extension AgentOrbStateLabel on AgentOrbState {
  String get label => switch (this) {
    AgentOrbState.connecting => 'Connecting',
    AgentOrbState.idle => 'Ready',
    AgentOrbState.listening => 'Listening',
    AgentOrbState.thinking => 'Thinking',
    AgentOrbState.speaking => 'Speaking',
    AgentOrbState.error => 'Needs attention',
  };
}

/// Animated app-logo agent presence indicator.
///
/// The floating voice-mode mark borrows the product SVG: a broken circular
/// ring, a solid inner node, and a small search/guide handle. Animation is
/// kept subtle so it reads like the app's own assistant, not a generic orb.
class AgentOrb extends StatefulWidget {
  const AgentOrb({super.key, required this.state, this.size = 168});

  final AgentOrbState state;
  final double size;

  @override
  State<AgentOrb> createState() => _AgentOrbState();
}

class _AgentOrbState extends State<AgentOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return CustomPaint(
            painter: _OrbPainter(
              progress: _controller.value,
              state: widget.state,
            ),
          );
        },
      ),
    );
  }
}

class _OrbPainter extends CustomPainter {
  _OrbPainter({required this.progress, required this.state});

  final double progress;
  final AgentOrbState state;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.shortestSide * 0.40;

    _drawHaloRings(canvas, center, size.shortestSide / 2);
    _drawLogoRing(canvas, center, radius);
    _drawLogoNode(canvas, center, radius);
    _drawAccent(canvas, center, radius);
  }

  void _drawLogoRing(Canvas canvas, Offset center, double radius) {
    final pulse = switch (state) {
      AgentOrbState.listening => math.sin(progress * math.pi * 6) * 0.04,
      AgentOrbState.thinking => math.sin(progress * math.pi * 4) * 0.03,
      AgentOrbState.speaking => math.sin(progress * math.pi * 8) * 0.05,
      _ => math.sin(progress * math.pi * 2) * 0.015,
    };
    final r = radius * (1 + pulse);
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = math.max(2.2, radius * 0.16)
      ..color = Palette.text.withValues(alpha: 0.95);
    final rect = Rect.fromCircle(center: center, radius: r);
    canvas.drawArc(rect, -math.pi * 0.58, math.pi * 1.86, false, stroke);

    final shadow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = math.max(2.0, radius * 0.15)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5)
      ..color = Palette.text.withValues(alpha: 0.10);
    canvas.drawArc(
      rect.shift(const Offset(0, 2)),
      -math.pi * 0.58,
      math.pi * 1.86,
      false,
      shadow,
    );
  }

  void _drawLogoNode(Canvas canvas, Offset center, double radius) {
    final nodeCenter = center.translate(-radius * 0.18, radius * 0.16);
    final nodeRadius = radius * 0.25;
    final node = Paint()..color = Palette.text.withValues(alpha: 0.98);
    canvas.drawCircle(nodeCenter, nodeRadius, node);

    final handle = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = math.max(2.2, radius * 0.14)
      ..color = Palette.text.withValues(alpha: 0.98);
    canvas.drawLine(
      center.translate(radius * 0.28, radius * 0.24),
      center.translate(radius * 0.72, radius * 0.55),
      handle,
    );
  }

  void _drawHaloRings(Canvas canvas, Offset center, double maxRadius) {
    final ringCount = switch (state) {
      AgentOrbState.listening => 3,
      AgentOrbState.speaking => 2,
      AgentOrbState.thinking => 2,
      _ => 1,
    };

    for (var i = 0; i < ringCount; i++) {
      final phase = (progress + (i / ringCount)) % 1.0;
      final radius = lerpDouble(maxRadius * 0.45, maxRadius, phase)!;
      final opacity = (1 - phase) * _haloIntensity();
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Palette.text.withValues(alpha: opacity);
      canvas.drawCircle(center, radius, paint);
    }
  }

  double _haloIntensity() => switch (state) {
    AgentOrbState.listening => 0.18,
    AgentOrbState.speaking => 0.16,
    AgentOrbState.thinking => 0.12,
    AgentOrbState.idle => 0.04,
    AgentOrbState.connecting => 0.10,
    AgentOrbState.error => 0.06,
  };

  void _drawAccent(Canvas canvas, Offset center, double radius) {
    if (state == AgentOrbState.speaking) {
      _drawWaveform(canvas, center, radius);
    } else if (state == AgentOrbState.thinking) {
      _drawSpinner(canvas, center, radius);
    } else if (state == AgentOrbState.listening) {
      _drawListenDot(canvas, center, radius);
    }
  }

  void _drawWaveform(Canvas canvas, Offset center, double radius) {
    final paint = Paint()
      ..color = Palette.background
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    const bars = 5;
    for (var i = 0; i < bars; i++) {
      final t = (progress * 6 + i * 0.4) % 1.0;
      final h = (math.sin(t * math.pi) * 0.6 + 0.3) * radius * 0.6;
      final x = center.dx + (i - (bars - 1) / 2) * 9;
      canvas.drawLine(
        Offset(x, center.dy - h / 2),
        Offset(x, center.dy + h / 2),
        paint,
      );
    }
  }

  void _drawSpinner(Canvas canvas, Offset center, double radius) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..color = Palette.background.withValues(alpha: 0.85);
    final rect = Rect.fromCircle(center: center, radius: radius * 0.55);
    canvas.drawArc(rect, progress * math.pi * 2, math.pi * 0.9, false, paint);
  }

  void _drawListenDot(Canvas canvas, Offset center, double radius) {
    final paint = Paint()..color = Palette.background.withValues(alpha: 0.95);
    canvas.drawCircle(center, radius * 0.18, paint);
  }

  @override
  bool shouldRepaint(_OrbPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.state != state;
}

double? lerpDouble(num a, num b, double t) => a + (b - a) * t;
