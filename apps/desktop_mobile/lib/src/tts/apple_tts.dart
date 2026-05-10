import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

import 'tts_client.dart';

/// Wraps Apple's `AVSpeechSynthesizer` (iOS) / Android TTS via `flutter_tts`.
/// Runs entirely on-device, no network.
class AppleTtsClient implements TtsClient {
  AppleTtsClient({
    this.language = 'en-US',
    this.rate = 0.5,
    this.pitch = 1.0,
  }) {
    _configure();
  }

  final String language;
  final double rate;
  final double pitch;

  final _tts = FlutterTts();
  Completer<void>? _activeUtterance;
  bool _disposed = false;

  bool get _isIOS => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  Future<void> _configure() async {
    await _tts.awaitSpeakCompletion(true);
    await _tts.setLanguage(language);
    await _tts.setSpeechRate(rate);
    await _tts.setPitch(pitch);
    await _tts.setVolume(1.0);

    if (_isIOS) {
      await _tts.setSharedInstance(true);
      await _tts.autoStopSharedSession(false);
      await _tts.setIosAudioCategory(
        IosTextToSpeechAudioCategory.playAndRecord,
        [
          IosTextToSpeechAudioCategoryOptions.defaultToSpeaker,
          IosTextToSpeechAudioCategoryOptions.allowBluetooth,
          IosTextToSpeechAudioCategoryOptions.allowBluetoothA2DP,
          IosTextToSpeechAudioCategoryOptions.mixWithOthers,
        ],
        IosTextToSpeechAudioMode.voiceChat,
      );
    }

    _tts.setCompletionHandler(() => _completeUtterance());
    _tts.setCancelHandler(() => _completeUtterance());
    _tts.setErrorHandler((message) => _completeUtterance(error: message));
  }

  void _completeUtterance({Object? error}) {
    final c = _activeUtterance;
    _activeUtterance = null;
    if (c == null || c.isCompleted) return;
    if (error != null) {
      c.completeError(error);
    } else {
      c.complete();
    }
  }

  @override
  String get label => 'Apple · $language';

  @override
  Future<void> speak(String text) async {
    if (_disposed) return;
    final utterance = text.trim();
    if (utterance.isEmpty) return;
    final completer = Completer<void>();
    _activeUtterance = completer;
    try {
      await _tts.speak(utterance);
    } catch (e) {
      _completeUtterance(error: e);
    }
    return completer.future;
  }

  @override
  Future<void> stop() async {
    await _tts.stop();
    _completeUtterance();
  }

  @override
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await _tts.stop();
    _completeUtterance();
  }
}
