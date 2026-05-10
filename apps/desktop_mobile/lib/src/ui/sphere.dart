import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'tokens.dart';

/// 3D rotating Fibonacci-distributed sphere of "0" / "1" characters,
/// ported from `tts_llm`. Front and back hemispheres render as separate
/// layers so [child] can sit between them.
class LiveSphere extends StatefulWidget {
  const LiveSphere({
    super.key,
    this.size = 320,
    this.cycleDuration = 45,
    this.numPoints = 200,
    this.child,
  });

  final double size;
  final double cycleDuration;
  final int numPoints;
  final Widget? child;

  @override
  State<LiveSphere> createState() => _LiveSphereState();
}

class _LiveSphereState extends State<LiveSphere>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  final ValueNotifier<double> _time = ValueNotifier<double>(0);

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick)..start();
  }

  void _onTick(Duration elapsed) {
    _time.value = elapsed.inMicroseconds / Duration.microsecondsPerSecond;
  }

  @override
  void dispose() {
    _ticker.dispose();
    _time.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size(widget.size, widget.size),
            painter: _SpherePainter(
              time: _time,
              cycleDuration: widget.cycleDuration,
              numPoints: widget.numPoints,
              renderMode: _SphereLayer.back,
            ),
          ),
          if (widget.child != null) widget.child!,
          CustomPaint(
            size: Size(widget.size, widget.size),
            painter: _SpherePainter(
              time: _time,
              cycleDuration: widget.cycleDuration,
              numPoints: widget.numPoints,
              renderMode: _SphereLayer.front,
            ),
          ),
        ],
      ),
    );
  }
}

class _Vec3 {
  const _Vec3(this.x, this.y, this.z);
  final double x;
  final double y;
  final double z;
}

enum _SphereLayer { front, back }

class _SpherePainter extends CustomPainter {
  _SpherePainter({
    required this.time,
    required this.cycleDuration,
    required this.numPoints,
    required this.renderMode,
  }) : super(repaint: time);

  final ValueNotifier<double> time;
  final double cycleDuration;
  final int numPoints;
  final _SphereLayer renderMode;

  static final Map<int, List<_Vec3>> _cache = {};

  static List<_Vec3> _pointsFor(int n) {
    return _cache.putIfAbsent(n, () => _generate(n));
  }

  static List<_Vec3> _generate(int n) {
    final pts = <_Vec3>[];
    final goldenAngle = math.pi * (3 - math.sqrt(5));
    for (var i = 0; i < n; i++) {
      final y = 1 - (2.0 * i) / (n - 1);
      final r = math.sqrt(1 - y * y);
      final theta = goldenAngle * i;
      pts.add(_Vec3(math.cos(theta) * r, y, math.sin(theta) * r));
    }
    return pts;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final t = time.value;
    final base = t * 2 * math.pi / cycleDuration;
    final ax = base;
    final ay = base * 0.7;
    final az = base * 1.3;
    final cx = math.cos(ax), sx = math.sin(ax);
    final cy = math.cos(ay), sy = math.sin(ay);
    final cz = math.cos(az), sz = math.sin(az);

    final renderRadius = size.shortestSide * 0.31;
    const perspective = 2.0;
    const minScale = 2.0 / 3.0;
    const maxScale = 2.0;

    const minFontSize = 7.5;
    const maxFontSize = 14.0;

    final pts = _pointsFor(numPoints);

    for (var i = 0; i < pts.length; i++) {
      final p = pts[i];
      final y1 = p.y * cx - p.z * sx;
      final z1 = p.y * sx + p.z * cx;
      final x2 = p.x * cy + z1 * sy;
      final z2 = -p.x * sy + z1 * cy;
      final x3 = x2 * cz - y1 * sz;
      final y3 = x2 * sz + y1 * cz;

      if ((renderMode == _SphereLayer.front && z2 < 0) ||
          (renderMode == _SphereLayer.back && z2 >= 0)) {
        continue;
      }

      final scale = perspective / (perspective - z2);
      final screenX = center.dx + x3 * scale * renderRadius;
      final screenY = center.dy + y3 * scale * renderRadius;

      final norm =
          ((scale - minScale) / (maxScale - minScale)).clamp(0.0, 1.0);
      final factor = math.pow(norm, 2).toDouble();
      final fontSize = lerpDouble(minFontSize, maxFontSize, factor)!;
      final intensity = (lerpDouble(70.0, 230.0, factor)!).round();

      final color = Color.fromARGB(255, intensity, intensity, intensity);
      final char = (i % 2 == 0) ? '0' : '1';
      final tp = TextPainter(
        text: TextSpan(
          text: char,
          style: TextStyle(
            fontSize: fontSize,
            color: color,
            fontFamily: 'monospace',
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();

      final textAngle = math.atan2(y3, x3);
      canvas.save();
      canvas.translate(screenX, screenY);
      canvas.rotate(textAngle);
      tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
      canvas.restore();
    }

    // Subtle outer glow, monochrome.
    final glow = Paint()
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 30)
      ..color = Palette.accent.withValues(alpha: 0.04);
    canvas.drawCircle(center, renderRadius * 1.0, glow);
  }

  @override
  bool shouldRepaint(_SpherePainter old) =>
      old.time.value != time.value ||
      old.renderMode != renderMode ||
      old.numPoints != numPoints;
}
