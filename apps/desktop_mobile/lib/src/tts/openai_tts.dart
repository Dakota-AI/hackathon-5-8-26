import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:audioplayers/audioplayers.dart';
import 'package:http/http.dart' as http;

import 'tts_client.dart';

/// OpenAI TTS via `POST /v1/audio/speech`.
///
/// One sentence per call, MP3 response, played through `audioplayers`. The
/// upstream sentence-streaming orchestrator queues these calls so audio
/// starts playing as soon as the first sentence comes back, while the LLM
/// is still finishing the rest.
class OpenAiTtsClient implements TtsClient {
  OpenAiTtsClient({
    required this.apiKey,
    this.baseUrl = 'https://api.openai.com',
    this.model = 'gpt-4o-mini-tts',
    this.voice = 'alloy',
    this.format = 'mp3',
    http.Client? httpClient,
    AudioPlayer? player,
  }) : _http = httpClient ?? http.Client(),
       _player = player ?? AudioPlayer() {
    _player.onPlayerComplete.listen((_) => _completeUtterance());
    _player.onLog.listen((m) => safePrint('[tts] player log: $m'));
    _player.eventStream.listen(
      (_) {},
      onError: (Object err) {
        safePrint('[tts] player stream error: $err');
        _completeUtterance(error: err);
      },
    );
    unawaited(_configurePlayer());
  }

  int _utteranceSeq = 0;

  final String apiKey;
  final String baseUrl;
  final String model;
  final String voice;
  final String format;

  final http.Client _http;
  final AudioPlayer _player;

  Completer<void>? _activeUtterance;
  bool _disposed = false;
  bool _cancelRequested = false;

  Future<void> _configurePlayer() async {
    await _player.setReleaseMode(ReleaseMode.release);
    await _player.setAudioContext(
      AudioContext(
        iOS: AudioContextIOS(
          category: AVAudioSessionCategory.playAndRecord,
          options: const {
            AVAudioSessionOptions.defaultToSpeaker,
            AVAudioSessionOptions.allowBluetooth,
            AVAudioSessionOptions.allowBluetoothA2DP,
            AVAudioSessionOptions.mixWithOthers,
          },
        ),
        android: AudioContextAndroid(
          isSpeakerphoneOn: true,
          stayAwake: false,
          contentType: AndroidContentType.speech,
          usageType: AndroidUsageType.voiceCommunication,
          audioFocus: AndroidAudioFocus.gain,
        ),
      ),
    );
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
  String get label {
    final host = Uri.tryParse(baseUrl)?.host ?? 'remote';
    return 'OpenAI · $voice · $host';
  }

  @override
  Future<void> speak(String text) async {
    if (_disposed) return;
    final utterance = text.trim();
    if (utterance.isEmpty) return;

    _cancelRequested = false;
    final base = baseUrl.replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.parse('$base/v1/audio/speech');

    final response = await _http.post(
      uri,
      headers: {
        'authorization': 'Bearer $apiKey',
        'content-type': 'application/json',
      },
      body: jsonEncode({
        'model': model,
        'voice': voice,
        'input': utterance,
        'format': format,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
        'OpenAI TTS ${response.statusCode}: ${response.body}',
      );
    }
    if (_cancelRequested || _disposed) return;

    // iOS AVPlayer fails to autodetect MIME from raw memory in many
    // cases — write the MP3 to a temp .mp3 file and play that instead.
    _utteranceSeq += 1;
    final ext = format == 'wav' ? 'wav' : 'mp3';
    final tmpFile = File(
      '${Directory.systemTemp.path}/openai-tts-$_utteranceSeq.$ext',
    );
    await tmpFile.writeAsBytes(response.bodyBytes, flush: true);
    safePrint(
      '[tts] wrote ${response.bodyBytes.length} bytes to ${tmpFile.path}',
    );

    final completer = Completer<void>();
    _activeUtterance = completer;
    try {
      await _player.play(DeviceFileSource(tmpFile.path));
    } catch (e) {
      _completeUtterance(error: e);
    }
    return completer.future;
  }

  @override
  Future<void> stop() async {
    _cancelRequested = true;
    await _player.stop();
    _completeUtterance();
  }

  @override
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _cancelRequested = true;
    await _player.stop();
    await _player.dispose();
    _completeUtterance();
    _http.close();
  }
}
