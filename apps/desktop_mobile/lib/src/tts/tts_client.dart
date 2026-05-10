/// Provider-agnostic TTS contract.
///
/// Adapters implement [TtsClient]. The voice surface and the orchestrator
/// only know about this interface — swapping Apple AVSpeechSynthesizer for
/// OpenAI `tts-1` / ElevenLabs / a local Kokoro server is a config change.
library;

import 'dart:async';

abstract class TtsClient {
  /// Short label for the UI (e.g. "OpenAI · alloy", "Apple · en-US").
  String get label;

  /// Speak [text]. Future completes when playback ends. Throws if the
  /// underlying engine fails to start. Cancelling via [stop] resolves the
  /// outstanding future.
  Future<void> speak(String text);

  /// Stop any in-flight playback immediately. Safe to call when idle.
  Future<void> stop();

  /// Free underlying resources. Idempotent.
  Future<void> dispose();
}
