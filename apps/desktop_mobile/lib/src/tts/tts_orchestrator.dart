import 'dart:async';
import 'dart:collection';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:flutter/foundation.dart';

import 'tts_client.dart';

/// Stitches LLM streaming deltas into TTS playback in (roughly) real time.
///
/// Pattern (cribbed from production voice agents like tts_llm and OpenAI's
/// Realtime guide):
///
///   addDelta(chunk) → buffer text → split on sentence boundaries →
///   queue each complete sentence to the TTS client → play sequentially.
///   completeStream() flushes whatever's left.
///
/// Time-to-first-audio = (LLM time-to-first-sentence) + (TTS round trip),
/// not (full LLM response) + (full TTS response). A few hundred ms vs.
/// several seconds.
class TtsOrchestrator extends ChangeNotifier {
  TtsOrchestrator({required this.client});

  final TtsClient client;

  final _queue = Queue<String>();
  final _buffer = StringBuffer();
  bool _active = false;
  Future<void>? _playing;
  bool _disposed = false;

  /// True while a sentence is being spoken or queued for playback.
  bool get isSpeaking => _active;

  /// Push the next delta from the LLM stream. May queue zero, one, or more
  /// sentences depending on whether the buffer crosses a boundary.
  void addDelta(String chunk) {
    if (_disposed) return;
    if (chunk.isEmpty) return;
    _buffer.write(chunk);
    _drainSentences();
  }

  /// Called when the LLM stream finishes — flushes any trailing buffer
  /// (e.g. a closing sentence with no terminal punctuation) to TTS.
  void completeStream() {
    if (_disposed) return;
    final tail = _stripForTts(_buffer.toString()).trim();
    _buffer.clear();
    if (tail.isNotEmpty) {
      _queue.add(tail);
      _kick();
    }
  }

  /// Stop everything immediately — playing audio, queued sentences,
  /// and the unflushed buffer. Call on barge-in, hangup, or cancel.
  Future<void> cancel() async {
    _queue.clear();
    _buffer.clear();
    await client.stop();
    _active = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _queue.clear();
    _buffer.clear();
    unawaited(client.dispose());
    super.dispose();
  }

  // --- internals ------------------------------------------------------

  void _drainSentences() {
    final raw = _buffer.toString();
    final boundary = _lastSentenceEnd(raw);
    if (boundary <= 0) return;
    final sentence = _stripForTts(raw.substring(0, boundary)).trim();
    final remainder = raw.substring(boundary);
    _buffer
      ..clear()
      ..write(remainder);
    if (sentence.isEmpty) return;
    safePrint('[tts] queue sentence (${sentence.length} chars)');
    _queue.add(sentence);
    _kick();
  }

  /// Returns the index *just past* the last sentence-ending punctuation.
  /// Skips boundaries inside fenced code blocks (we don't want TTS to read
  /// genui JSON aloud — they get stripped before queueing anyway).
  int _lastSentenceEnd(String text) {
    final pattern = RegExp(r'[.!?](\s|$)');
    final matches = pattern.allMatches(text).toList();
    if (matches.isEmpty) return -1;
    return matches.last.end;
  }

  /// Removes markdown adornments and ```genui blocks so the TTS engine
  /// doesn't read "asterisk asterisk bold asterisk" or JSON aloud.
  String _stripForTts(String text) {
    var out = text;
    // Remove fenced code blocks (genui or any other) entirely.
    out = out.replaceAll(
      RegExp(r'```[\s\S]*?```', multiLine: true),
      '',
    );
    // Inline code → plain.
    out = out.replaceAll(RegExp(r'`([^`]+)`'), r'$1');
    // Bold/italic markers.
    out = out.replaceAll(RegExp(r'\*\*([^*]+)\*\*'), r'$1');
    out = out.replaceAll(RegExp(r'\*([^*]+)\*'), r'$1');
    out = out.replaceAll(RegExp(r'__([^_]+)__'), r'$1');
    out = out.replaceAll(RegExp(r'_([^_]+)_'), r'$1');
    // Markdown links → keep text only.
    out = out.replaceAllMapped(
      RegExp(r'\[([^\]]+)\]\([^)]+\)'),
      (m) => m.group(1) ?? '',
    );
    // Headings → strip leading hashes.
    out = out.replaceAll(RegExp(r'^#+\s*', multiLine: true), '');
    // Bullet markers at line starts.
    out = out.replaceAll(RegExp(r'^[\-\*]\s+', multiLine: true), '');
    return out;
  }

  void _kick() {
    if (_playing != null) return;
    _playing = _runQueue();
  }

  Future<void> _runQueue() async {
    while (_queue.isNotEmpty && !_disposed) {
      final next = _queue.removeFirst();
      _active = true;
      notifyListeners();
      safePrint('[tts] speak start (${next.length} chars)');
      try {
        await client.speak(next);
        safePrint('[tts] speak end ok');
      } catch (e) {
        safePrint('[tts] speak failed: $e');
      }
    }
    _active = false;
    _playing = null;
    notifyListeners();
  }
}
