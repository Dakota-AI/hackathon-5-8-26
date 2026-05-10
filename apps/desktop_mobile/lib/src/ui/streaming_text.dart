import 'package:flutter/scheduler.dart' show Ticker;
import 'package:shadcn_flutter/shadcn_flutter.dart';

/// Reveals `text` one character at a time so a fully-buffered response feels
/// like a stream. When `text` changes mid-animation we keep whatever was
/// already revealed and only animate the suffix — that way real streaming
/// chunks (later) drop in without re-animating from zero.
class StreamingText extends StatefulWidget {
  const StreamingText({
    super.key,
    required this.text,
    this.style,
    this.charactersPerSecond = 90,
    this.showCursor = true,
    this.cursorColor,
  });

  final String text;
  final TextStyle? style;
  final double charactersPerSecond;
  final bool showCursor;
  final Color? cursorColor;

  @override
  State<StreamingText> createState() => _StreamingTextState();
}

class _StreamingTextState extends State<StreamingText>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  Duration? _lastTick;
  double _revealed = 0;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick)..start();
    _revealed = widget.text.length.toDouble();
  }

  @override
  void didUpdateWidget(covariant StreamingText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.text == oldWidget.text) return;
    final newText = widget.text;
    final oldText = oldWidget.text;
    if (newText.startsWith(oldText)) {
      _revealed = _revealed.clamp(0, newText.length.toDouble());
    } else {
      _revealed = 0;
    }
  }

  void _onTick(Duration elapsed) {
    final delta = _lastTick == null
        ? Duration.zero
        : elapsed - _lastTick!;
    _lastTick = elapsed;
    if (_revealed >= widget.text.length) return;
    final advance =
        delta.inMicroseconds / Duration.microsecondsPerSecond *
        widget.charactersPerSecond;
    setState(() {
      _revealed = (_revealed + advance).clamp(0, widget.text.length.toDouble());
    });
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visibleCount = _revealed.floor();
    final visible = widget.text.substring(0, visibleCount);
    final isStreaming = visibleCount < widget.text.length;

    return RichText(
      text: TextSpan(
        style: widget.style,
        children: [
          TextSpan(text: visible),
          if (widget.showCursor && isStreaming)
            WidgetSpan(
              alignment: PlaceholderAlignment.middle,
              child: _Cursor(color: widget.cursorColor ?? widget.style?.color),
            ),
        ],
      ),
    );
  }
}

class _Cursor extends StatefulWidget {
  const _Cursor({this.color});

  final Color? color;

  @override
  State<_Cursor> createState() => _CursorState();
}

class _CursorState extends State<_Cursor>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 850),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _ctrl,
      child: Container(
        width: 7,
        height: 14,
        margin: const EdgeInsets.only(left: 2),
        color: widget.color ?? const Color(0xFFF5F5F5),
      ),
    );
  }
}
