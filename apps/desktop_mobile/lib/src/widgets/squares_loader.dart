import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// A compact loading indicator: six small squares arranged in a circle
/// (60deg apart) with their opacity rippling in a wave so the brightest
/// square appears to rotate around the ring once every 1200ms.
///
/// Self-contained: depends only on flutter/widgets and uses a single
/// [AnimationController] disposed cleanly on widget removal.
class SquaresLoader extends StatefulWidget {
  const SquaresLoader({super.key, this.size = 40, this.color});

  final double size;
  final Color? color;

  @override
  State<SquaresLoader> createState() => _SquaresLoaderState();
}

class _SquaresLoaderState extends State<SquaresLoader>
    with TickerProviderStateMixin {
  static const int _squareCount = 6;
  static const double _radius = 14;
  static const double _squareSize = 8;
  static const double _minOpacity = 0.18;
  static const double _maxOpacity = 1.0;

  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final baseColor = widget.color ?? const Color(0xFFF5F5F5);
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final t = _controller.value;
          return Stack(
            alignment: Alignment.center,
            children: List<Widget>.generate(_squareCount, (i) {
              final angle = (i / _squareCount) * 2 * math.pi - math.pi / 2;
              final dx = math.cos(angle) * _radius;
              final dy = math.sin(angle) * _radius;
              // Phase offset of 1/6 per square; brightest square rotates.
              final phase = (t - i / _squareCount) % 1.0;
              // Triangle wave -> 1 at phase 0, 0 at phase 0.5.
              final wave = 1.0 - (phase * 2 - 1).abs();
              final opacity = _minOpacity + (_maxOpacity - _minOpacity) * wave;
              return Transform.translate(
                offset: Offset(dx, dy),
                child: Container(
                  width: _squareSize,
                  height: _squareSize,
                  decoration: BoxDecoration(
                    color: baseColor.withValues(alpha: opacity),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              );
            }),
          );
        },
      ),
    );
  }
}
