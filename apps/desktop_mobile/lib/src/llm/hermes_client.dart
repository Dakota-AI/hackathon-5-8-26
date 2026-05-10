import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:http/http.dart' as http;

import 'llm_client.dart';

const _hermesDefaultModel = String.fromEnvironment(
  'HERMES_MODEL',
  defaultValue: 'hermes-agent',
);
const _hermesDefaultTextMaxTokens = int.fromEnvironment(
  'HERMES_TEXT_MAX_TOKENS',
  defaultValue: 896,
);
const _hermesDefaultVoiceMaxTokens = int.fromEnvironment(
  'HERMES_VOICE_MAX_TOKENS',
  defaultValue: 220,
);

/// Text adapter for the Hermes OpenAI-compatible gateway.
///
/// The mobile client should not carry model-provider keys. It sends text to
/// the runner/control plane, and the runner owns actual model selection.
class HermesLlmClient implements LlmClient {
  HermesLlmClient({
    required this.baseUrl,
    this.authToken = '',
    this.model = _hermesDefaultModel,
    this.textMaxTokens = _hermesDefaultTextMaxTokens,
    this.voiceMaxTokens = _hermesDefaultVoiceMaxTokens,
    this.callId = 'mobile-chat',
    String? sessionId,
    http.Client? httpClient,
  }) : _sessionId = sessionId ?? _randomSessionId(),
       _http = httpClient ?? http.Client();

  final String baseUrl;
  final String authToken;
  final String model;
  final int textMaxTokens;
  final int voiceMaxTokens;
  final String callId;
  String _sessionId;
  final http.Client _http;

  @override
  void clearSession() {
    _sessionId = _randomSessionId();
  }

  @override
  String get label {
    final host = Uri.tryParse(baseUrl)?.host ?? 'runner';
    return 'Hermes · $host';
  }

  @override
  Stream<LlmDelta> chat(List<LlmMessage> history) async* {
    final prompt = _lastUserText(history);
    if (prompt.isEmpty) {
      yield const LlmDelta(text: '', done: true);
      return;
    }

    final base = baseUrl.replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.parse('$base/v1/chat/completions');
    final isVoiceMode = _isVoicePrompt(history);
    final headers = <String, String>{
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      if (authToken.isNotEmpty) 'authorization': 'Bearer $authToken',
    };
    final request = http.Request('POST', uri)
      ..headers.addAll(headers)
      ..body = jsonEncode({
        'model': model,
        'session_id': _sessionId,
        'messages': [
          for (final message in history)
            {
              'role': switch (message.role) {
                LlmRole.system => 'system',
                LlmRole.user => 'user',
                LlmRole.agent => 'assistant',
              },
              'content': message.text,
            },
        ],
        'stream': true,
        'max_tokens': isVoiceMode
            ? (voiceMaxTokens <= 0 ? 220 : voiceMaxTokens)
            : (textMaxTokens <= 0 ? 896 : textMaxTokens),
        'temperature': 0.3,
      });

    late final http.StreamedResponse response;
    try {
      safePrint(
        '[llm] POST $uri model=$model callId=$callId stream=$isVoiceMode',
      );
      response = await _http
          .send(request)
          .timeout(
            const Duration(seconds: 20),
            onTimeout: () {
              safePrint('[llm] timed out after 20s');
              throw TimeoutException(
                'Hermes runner request timed out after 20 seconds',
              );
            },
          );
    } on TimeoutException {
      yield const LlmDelta(
        text: 'Hermes runner timed out after 20 seconds.',
        done: true,
      );
      return;
    } catch (e) {
      yield LlmDelta(text: 'Hermes runner request failed: $e', done: true);
      return;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final body = await response.stream.bytesToString();
      yield LlmDelta(
        text: 'Hermes runner error ${response.statusCode}: $body',
        done: true,
      );
      return;
    }

    try {
      final lines = response.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter());
      var deltas = 0;
      await for (final line in lines) {
        if (!line.startsWith('data:')) {
          continue;
        }
        final payload = line.substring(5).trim();
        if (payload.isEmpty) {
          continue;
        }
        if (payload == '[DONE]') {
          safePrint('[llm] stream done deltas=$deltas');
          yield const LlmDelta(text: '', done: true);
          return;
        }
        try {
          final decoded = jsonDecode(payload) as Map<String, dynamic>;
          if (decoded['object'] == 'error' || decoded['error'] != null) {
            final err = decoded['error'];
            final msg = err is Map
                ? (err['message'] as String? ?? err.toString())
                : err?.toString() ?? 'unknown error';
            safePrint('[llm] stream error: $msg');
            yield LlmDelta(text: 'Hermes runner error: $msg', done: true);
            return;
          }
          final choices = decoded['choices'] as List?;
          if (choices == null || choices.isEmpty) {
            continue;
          }
          final first = choices.first;
          if (first is! Map<String, dynamic>) {
            continue;
          }
          final delta = first['delta'];
          final content = delta is Map<String, dynamic>
              ? delta['content']
              : null;
          if (content is String && content.isNotEmpty) {
            deltas += 1;
            yield LlmDelta(text: content);
          }
        } catch (_) {
          // Keep the stream resilient for non-standard providers.
          try {
            final decoded = jsonDecode(payload) as Map<String, dynamic>;
            final choices = decoded['choices'];
            final first = choices is List && choices.isNotEmpty
                ? choices.first
                : null;
            final message = first is Map<String, dynamic>
                ? first['message']
                : null;
            final content = message is Map<String, dynamic>
                ? message['content']
                : null;
            if (content is String && content.trim().isNotEmpty) {
              deltas += 1;
              yield LlmDelta(text: content.trim());
              continue;
            }
          } catch (_) {
            // Skip malformed chunks rather than tear the stream down.
          }
        }
      }
      safePrint('[llm] stream closed deltas=$deltas');
      yield const LlmDelta(text: '', done: true);
    } catch (e) {
      yield LlmDelta(
        text: 'Hermes runner returned invalid JSON: $e',
        done: true,
      );
    }
  }
}

String _randomSessionId() {
  final random = Random.secure();
  return '${DateTime.now().millisecondsSinceEpoch}-${random.nextInt(1 << 31)}';
}

bool _isVoicePrompt(List<LlmMessage> history) {
  if (history.isEmpty) return false;
  for (final message in history) {
    if (message.role != LlmRole.system) {
      continue;
    }
    final prompt = message.text.toLowerCase();
    return prompt.contains('live voice') ||
        prompt.contains('keep every reply under three sentences') ||
        prompt.contains('tts');
  }
  return false;
}

String _lastUserText(List<LlmMessage> history) {
  for (final message in history.reversed) {
    if (message.role == LlmRole.user && message.text.trim().isNotEmpty) {
      return message.text.trim();
    }
  }
  return '';
}
