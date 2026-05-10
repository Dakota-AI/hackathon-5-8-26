import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'tokens.dart';

/// Level-driven bar visualizer modelled on tts_llm's FFT visualizer.
///
/// Real FFT would need raw PCM samples — `speech_to_text` only exposes a
/// single 0-1 ambient level, and OpenAI TTS audio is buried inside
/// `audioplayers`. So this paints a fake spectrum: each bar has its own
/// idle sine wave, modulated by [level] (when active) or by a slower
/// idle pattern (when not). Visually close, near-zero CPU.
class LevelVisualizer extends StatefulWidget {
  const LevelVisualizer({
    super.key,
    required this.level,
    required this.active,
    this.numBars = 26,
    this.barWidth = 2.0,
    this.barSpacing = 3.0,
    this.maxBarLength = 38.0,
    this.color = Palette.accent,
  });

  /// Current sound level — 0 silent, 1 loud.
  final double level;

  /// True when the channel this visualizer represents is active
  /// (mic listening or TTS playing). When false, only the idle wave shows.
  final bool active;

  final int numBars;
  final double barWidth;
  final double barSpacing;
  final double maxBarLength;
  final Color color;

  @override
  State<LevelVisualizer> createState() => _LevelVisualizerState();
}

class _LevelVisualizerState extends State<LevelVisualizer>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  double _t = 0;
  late final List<double> _gains = List<double>.filled(widget.numBars, 0);

  // Per-bar phase offsets so the wave doesn't move uniformly.
  late final List<double> _phase = List.generate(
    widget.numBars,
    (i) => (i * 0.41) % (2 * math.pi),
  );

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick)..start();
  }

  void _onTick(Duration elapsed) {
    final t = elapsed.inMicroseconds / Duration.microsecondsPerSecond;
    final dt = t - _t;
    _t = t;
    final target = _computeTargets(t);
    // Asymmetric smoothing — fast attack, slow release (like the original).
    setState(() {
      for (var i = 0; i < _gains.length; i++) {
        final factor = target[i] > _gains[i] ? 0.45 : 0.18;
        _gains[i] = _gains[i] + (target[i] - _gains[i]) * factor * (dt * 60);
      }
    });
  }

  List<double> _computeTargets(double t) {
    final out = List<double>.filled(widget.numBars, 0);
    for (var i = 0; i < widget.numBars; i++) {
      final wave = math.sin(t * 4 + _phase[i]) * 0.5 + 0.5;
      final secondary = math.sin(t * 6.2 + i * 0.21) * 0.5 + 0.5;
      // Center-loaded: bars in the middle should jump more (mimics FFT
      // weighting toward speech frequencies).
      final centerBias =
          1.0 - ((i - (widget.numBars - 1) / 2).abs() / (widget.numBars / 2));
      if (widget.active) {
        out[i] =
            (0.18 + wave * 0.18 + secondary * 0.10 + widget.level * 0.85).clamp(
              0.0,
              1.0,
            ) *
            (0.55 + centerBias * 0.45);
      } else {
        // Idle: gentle wave, never zero so we always feel "alive".
        out[i] =
            (0.10 + wave * 0.12 + secondary * 0.08) * (0.6 + centerBias * 0.4);
      }
    }
    return out;
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width:
          widget.numBars * widget.barWidth +
          (widget.numBars - 1) * widget.barSpacing,
      height: widget.maxBarLength,
      child: CustomPaint(
        painter: _BarPainter(
          gains: _gains,
          color: widget.color,
          maxLength: widget.maxBarLength,
          barWidth: widget.barWidth,
          spacing: widget.barSpacing,
        ),
      ),
    );
  }
}

class _BarPainter extends CustomPainter {
  _BarPainter({
    required this.gains,
    required this.color,
    required this.maxLength,
    required this.barWidth,
    required this.spacing,
  });

  final List<double> gains;
  final Color color;
  final double maxLength;
  final double barWidth;
  final double spacing;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final centerY = size.height / 2;
    for (var i = 0; i < gains.length; i++) {
      final x = i * (barWidth + spacing);
      final length = (gains[i] * maxLength).clamp(2.0, maxLength);
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, centerY - length / 2, barWidth, length),
        const Radius.circular(1),
      );
      canvas.drawRRect(rect, paint);
    }
  }

  @override
  bool shouldRepaint(_BarPainter old) => true;
}
