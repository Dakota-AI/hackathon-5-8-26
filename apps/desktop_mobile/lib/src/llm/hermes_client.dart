import 'dart:async';
import 'dart:convert';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:http/http.dart' as http;

import 'llm_client.dart';

/// Text adapter for the Hermes OpenAI-compatible gateway.
///
/// The mobile client should not carry model-provider keys. It sends text to
/// the runner/control plane, and the runner owns actual model selection.
class HermesLlmClient implements LlmClient {
  HermesLlmClient({
    required this.baseUrl,
    this.authToken = '',
    this.callId = 'mobile-chat',
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  final String baseUrl;
  final String authToken;
  final String callId;
  final http.Client _http;

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
    final headers = <String, String>{
      'content-type': 'application/json',
      if (authToken.isNotEmpty) 'authorization': 'Bearer $authToken',
    };

    late final http.Response response;
    try {
      safePrint('[llm] POST $uri backend=hermes');
      response = await _http
          .post(
            uri,
            headers: headers,
            body: jsonEncode({
              'model': 'hermes-agent',
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
              'stream': false,
            }),
          )
          .timeout(const Duration(seconds: 30));
    } on TimeoutException {
      yield const LlmDelta(
        text: 'Hermes runner timed out after 30 seconds.',
        done: true,
      );
      return;
    } catch (e) {
      yield LlmDelta(text: 'Hermes runner request failed: $e', done: true);
      return;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      yield LlmDelta(
        text: 'Hermes runner error ${response.statusCode}: ${response.body}',
        done: true,
      );
      return;
    }

    try {
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final choices = decoded['choices'];
      final first = choices is List && choices.isNotEmpty ? choices.first : null;
      final message = first is Map<String, dynamic> ? first['message'] : null;
      final content = message is Map<String, dynamic>
          ? message['content'] as String?
          : null;
      yield LlmDelta(text: (content ?? '').trim(), done: true);
    } catch (e) {
      yield LlmDelta(text: 'Hermes runner returned invalid JSON: $e', done: true);
    }
  }
}

String _lastUserText(List<LlmMessage> history) {
  for (final message in history.reversed) {
    if (message.role == LlmRole.user && message.text.trim().isNotEmpty) {
      return message.text.trim();
    }
  }
  return '';
}
