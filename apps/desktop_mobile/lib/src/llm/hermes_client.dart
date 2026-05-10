import 'llm_client.dart';

/// Placeholder adapter for the Hermes harness
/// (https://github.com/nousresearch/hermes-agent).
///
/// The end-state is: phone speaks WebRTC to the Cloudflare relay, the
/// Hermes runner claims the call as `role=agent`, runs STT→LLM→TTS, and
/// pushes audio back. This adapter is reserved for the *non-realtime* text
/// path (when the phone wants to send a text query and get an answer
/// without opening the call). It will become functional once the Hermes
/// HTTP shim ships.
class HermesLlmClient implements LlmClient {
  const HermesLlmClient({required this.baseUrl});

  final String baseUrl;

  @override
  String get label => 'Hermes (not yet wired)';

  @override
  Stream<LlmDelta> chat(List<LlmMessage> history) async* {
    yield LlmDelta(
      text:
          'Hermes harness adapter is reserved for production. For now, '
          'switch to LLM_PROVIDER=openai or LLM_PROVIDER=ollama.\n\n'
          'Target endpoint: $baseUrl',
      done: true,
    );
  }
}
