/// Provider-agnostic LLM contract.
///
/// Adapters implement [LlmClient]. The chat surface and voice surface only
/// know about this interface — mobile chat is wired to Hermes and will fail
/// fast if Hermes is not correctly configured.
library;

enum LlmRole { system, user, agent }

class LlmMessage {
  const LlmMessage({required this.role, required this.text});
  final LlmRole role;
  final String text;
}

/// Streamed delta from the model. Implementations emit text as soon as it
/// arrives; [done] becomes true on the final delta.
class LlmDelta {
  const LlmDelta({required this.text, this.done = false});
  final String text;
  final bool done;
}

abstract class LlmClient {
  /// Non-streaming label so the UI can show which provider+model is wired.
  String get label;

  /// Stream a chat completion. Implementations should yield text deltas as
  /// they arrive over the wire. The [history] is the canonical conversation
  /// — newest message last. The system prompt is implementation-defined.
  Stream<LlmDelta> chat(List<LlmMessage> history);
}

/// Sentinel client that surfaces a clear "configure me" message in the UI
/// when no provider is wired. Never throws — the UI explains how to fix it.
class UnconfiguredLlmClient implements LlmClient {
  const UnconfiguredLlmClient(this.reason);
  final String reason;

  @override
  String get label => 'Not configured';

  @override
  Stream<LlmDelta> chat(List<LlmMessage> history) async* {
    yield LlmDelta(text: reason, done: true);
  }
}
