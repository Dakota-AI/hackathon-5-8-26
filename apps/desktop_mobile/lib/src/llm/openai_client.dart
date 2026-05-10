import 'dart:async';
import 'dart:convert';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:http/http.dart' as http;

import 'llm_client.dart';

/// OpenAI-compatible streaming chat client.
///
/// Works against:
/// - OpenAI itself (`https://api.openai.com`)
/// - Ollama in OpenAI-compat mode (`http://<mac-ip>:11434/v1`)
/// - llama.cpp server, vLLM, LM Studio, etc.
///
/// The API key is provided at construction; never read from disk and never
/// logged. Pass via `--dart-define=OPENAI_API_KEY=...` at run time.
class OpenAiCompatibleClient implements LlmClient {
  OpenAiCompatibleClient({
    required this.baseUrl,
    required this.apiKey,
    required this.model,
    this.systemPrompt,
    this.maxTokens = 1024,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  final String baseUrl;
  final String apiKey;
  final String model;
  final String? systemPrompt;

  /// Required by some OpenAI-compatible providers (Featherless, etc.) —
  /// without it they default to the model's full output window and
  /// reject the request when input+output exceeds context.
  final int maxTokens;

  final http.Client _http;

  @override
  String get label {
    final host = Uri.tryParse(baseUrl)?.host ?? 'remote';
    return '$model · $host';
  }

  @override
  Stream<LlmDelta> chat(List<LlmMessage> history) async* {
    final base = baseUrl.replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.parse('$base/v1/chat/completions');

    // Skip the constructor-level systemPrompt if the caller already
    // supplied one at the head of history (the store overrides per mode).
    final hasInlineSystem =
        history.isNotEmpty && history.first.role == LlmRole.system;

    final messages = <Map<String, String>>[
      if (!hasInlineSystem &&
          systemPrompt != null &&
          systemPrompt!.isNotEmpty)
        {'role': 'system', 'content': systemPrompt!},
      for (final m in history)
        {
          'role': switch (m.role) {
            LlmRole.system => 'system',
            LlmRole.user => 'user',
            LlmRole.agent => 'assistant',
          },
          'content': m.text,
        },
    ];

    final request = http.Request('POST', uri)
      ..headers.addAll({
        'authorization': 'Bearer $apiKey',
        'content-type': 'application/json',
        'accept': 'text/event-stream',
      })
      ..body = jsonEncode({
        'model': model,
        'messages': messages,
        'stream': true,
        'max_tokens': maxTokens,
      });

    safePrint(
      '[llm] POST $uri model=$model historyLen=${history.length}',
    );
    // Hard timeout on the connect+headers phase so a stalled provider
    // doesn't lock the UI in "Generating…" forever. Once the stream is
    // open, individual chunk reads have their own iOS-level timeouts.
    final response = await _http
        .send(request)
        .timeout(
          const Duration(seconds: 25),
          onTimeout: () {
            safePrint('[llm] timed out after 25s');
            throw TimeoutException('LLM request timed out after 25s');
          },
        );
    safePrint('[llm] response status=${response.statusCode}');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final body = await response.stream.bytesToString();
      safePrint('[llm] error body=$body');
      yield LlmDelta(
        text: 'LLM error ${response.statusCode}: $body',
        done: true,
      );
      return;
    }

    final lines = response.stream
        .transform(utf8.decoder)
        .transform(const LineSplitter());

    var deltas = 0;
    await for (final line in lines) {
      if (!line.startsWith('data:')) continue;
      final payload = line.substring(5).trim();
      if (payload.isEmpty) continue;
      if (payload == '[DONE]') {
        safePrint('[llm] stream done deltas=$deltas');
        yield const LlmDelta(text: '', done: true);
        return;
      }

      try {
        final decoded = jsonDecode(payload) as Map<String, dynamic>;
        // Some OpenAI-compatible providers (Featherless, etc.) emit
        // errors as in-stream `data:` chunks with object="error".
        // Surface them instead of silently skipping.
        if (decoded['object'] == 'error' || decoded['error'] != null) {
          final err = decoded['error'];
          final msg = err is Map
              ? (err['message'] as String? ?? err.toString())
              : err?.toString() ?? 'unknown error';
          safePrint('[llm] stream error: $msg');
          yield LlmDelta(text: 'LLM error: $msg', done: true);
          return;
        }
        final choices = decoded['choices'] as List?;
        if (choices == null || choices.isEmpty) continue;
        final delta = (choices.first as Map)['delta'] as Map?;
        final content = delta?['content'] as String?;
        if (content == null || content.isEmpty) continue;
        deltas += 1;
        yield LlmDelta(text: content);
      } catch (_) {
        // Skip malformed chunks rather than tear the stream down.
      }
    }

    safePrint('[llm] stream closed deltas=$deltas');
    yield const LlmDelta(text: '', done: true);
  }
}
