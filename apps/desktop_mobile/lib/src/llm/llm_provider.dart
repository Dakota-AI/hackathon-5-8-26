import 'dart:async';

import 'hermes_client.dart';
import 'llm_client.dart';
import '../api/control_api.dart';

const _provider = String.fromEnvironment(
  'LLM_PROVIDER',
  defaultValue: 'hermes',
);

// The mobile chat surface talks to the Hermes OpenAI-compatible gateway,
// not the Agents Cloud Control API.
//
// Hermes endpoint is required at build/runtime via HERMES_BASE_URL.
const _hermesBase = String.fromEnvironment('HERMES_BASE_URL', defaultValue: '');
const _hermesToken = String.fromEnvironment('HERMES_AUTH_TOKEN');
const _hermesCallId = String.fromEnvironment(
  'HERMES_TEXT_CALL_ID',
  defaultValue: 'mobile-chat',
);
const _runnerWaitMs = int.fromEnvironment(
  'MOBILE_RUNNER_WAIT_MS',
  defaultValue: 180000,
);
const _runnerPollMs = int.fromEnvironment(
  'MOBILE_RUNNER_POLL_MS',
  defaultValue: 1500,
);

const _runnerHealthyStatuses = <String>{"online", "running", "ready"};

/// System prompt for the *text* surface — markdown OK, GenUI blocks OK.
const _textSystemPrompt = '''
You are an on-call AI agent inside a chat client. Be terse, direct, and
conversational. Do not narrate your reasoning.

When the user asks for something that benefits from a structured artefact
(a small UI, a card, a checklist, a chart), you MAY embed a fenced code
block tagged `genui`. The body must be JSON of the form:

```genui
{
  "components": [
    {"id": "root", "type": "Column", "properties": {"justify": "start", "children": ["title", "body"]}},
    {"id": "title", "type": "Text", "properties": {"text": "Today's plan", "variant": "h4"}},
    {"id": "body", "type": "Text", "properties": {"text": "...", "variant": "body"}}
  ]
}
```

The `root` component is the entry point. Available types:
Text (variant: h1..h6, body, caption), Column (children: List<String>),
Row (children: List<String>), Image (src), Button (label, action).

If a previous turn already rendered a genui surface and the user wants to
edit it, emit a fresh genui block with the full updated component list —
the surface re-renders in place.
''';

/// System prompt for the *voice* surface — no markdown, no code blocks,
/// terse. The user is hearing this read aloud, so any markdown adornment
/// gets read as syllables. Keep replies short — TTS latency compounds.
const _voiceSystemPrompt = '''
You are an on-call AI agent on a live voice call. Speak naturally as if
on the phone. Keep every reply under three sentences unless the user
explicitly asks for more detail. Absolutely no markdown, no code blocks,
no bullet lists, no asterisks for emphasis — TTS will read them as
gibberish. If the user wants a structured artefact, ask them to switch
to text mode first.
''';

String systemPromptForMode({required bool voiceMode}) =>
    voiceMode ? _voiceSystemPrompt : _textSystemPrompt;

/// System prompt used when the agent reaches out unprompted (Discord-DM
/// style). The agent has no immediate user message to react to — it has
/// to set the tone itself. Keep it short, concrete, conversational.
const proactiveSystemPrompt = '''
You are an on-call AI agent reaching out to the user FIRST, like a friend
sending a quick text. They didn't message you — you decided to ping.

Rules:
- ONE message, MAX two short sentences.
- Conversational, not formal. No "Hi there" / "I hope this finds you well".
- No markdown, no code blocks, no GenUI surfaces — this is plain text only.
- If you have nothing concrete to say, ask a small, low-stakes question
  ("how's the day going?", "anything I can help with right now?").
- Never narrate that you're an AI or that this is a proactive ping.
''';

/// Picks an [LlmClient] from --dart-define flags. Returns an
/// [UnconfiguredLlmClient] with a friendly message when the selected
/// provider is missing required config.
LlmClient resolveLlmClient() {
  if (_provider != 'hermes') {
    return const UnconfiguredLlmClient(
      'Mobile chat is locked to Hermes. Set --dart-define=LLM_PROVIDER=hermes '
      'and pass HERMES_BASE_URL.',
    );
  }
  if (_hermesBase.isEmpty) {
    return const UnconfiguredLlmClient(
      'Hermes provider selected but HERMES_BASE_URL is empty. '
      'Pass --dart-define=HERMES_BASE_URL=http://... at run time.',
    );
  }
  return HermesLlmClient(
    baseUrl: _hermesBase,
    authToken: _hermesToken,
    callId: _hermesCallId,
  );
}

String get llmProviderName => _provider;

/// Picks a Hermes client from a ready user runner record in Control API.
/// This is the mobile-first path so chat can stay coupled to the user's
/// current ECS runner instead of a static demo endpoint.
Future<LlmClient> resolveRunnerLlmClient({
  required ControlApi controlApi,
  bool allowConfiguredFallback = false,
}) async {
  final deadline = DateTime.now().add(Duration(milliseconds: _runnerWaitMs));
  String? lastMessage;
  while (DateTime.now().isBefore(deadline)) {
    final runners = await controlApi.listUserRunners();
    final runner = _pickReadyRunner(runners);
    if (runner != null) {
      return _buildHermesClientFromRunner(runner);
    }
    lastMessage = _runnerNotReadyMessage(runners);
    await Future.delayed(Duration(milliseconds: _runnerPollMs));
  }
  if (!allowConfiguredFallback) {
    return UnconfiguredLlmClient(
      lastMessage ??
          'Hermes runner is still provisioning. Start or wake your ECS runner and retry.',
    );
  }
  final fallback = resolveLlmClient();
  if (fallback is UnconfiguredLlmClient) {
    return UnconfiguredLlmClient(
      lastMessage ??
          'Hermes runner was not ready, and no configured fallback endpoint is available.',
    );
  }
  return fallback;
}

LlmClient _buildHermesClientFromRunner(Map<String, dynamic> runner) {
  final base = _runnerEndpoint(runner);
  if (base == null || base.isEmpty) {
    throw StateError("Runner record does not include a reachable endpoint.");
  }
  return HermesLlmClient(
    baseUrl: base,
    authToken: _hermesToken,
    callId: _hermesCallId,
  );
}

Map<String, dynamic>? _pickReadyRunner(List<Map<String, dynamic>> runners) {
  final candidates = runners
      .where(_isReachable)
      .where((runner) => _isHealthyStatus(_status(runner)))
      .toList();
  if (candidates.isNotEmpty) {
    candidates.sort(_compareUpdatedAt);
    return candidates.first;
  }
  return null;
}

bool _isReachable(Map<String, dynamic> runner) {
  final endpoint = _runnerEndpoint(runner);
  if (endpoint != null && endpoint.isNotEmpty) return true;
  return _runnerEndpointFromIp(_stringValueOrNull(runner["privateIp"])) != null;
}

bool _isHealthyStatus(String status) {
  return _runnerHealthyStatuses.contains(status);
}

String _status(Map<String, dynamic> runner) {
  return _stringValue(runner['status']).toLowerCase();
}

String _runnerNotReadyMessage(List<Map<String, dynamic>> runners) {
  final hasRunner = runners.isNotEmpty;
  if (!hasRunner) {
    return "No UserRunner rows were found yet for this user; start an ECS run to provision one.";
  }
  final hasEndpoint = runners.any((runner) => _runnerEndpoint(runner) != null);
  if (!hasEndpoint) {
    return "Runner rows are present, but no usable runner endpoint exists yet. Waiting for private IP/endpoint registration.";
  }
  final hasHealthy = runners.any((runner) => _isHealthyStatus(_status(runner)));
  if (!hasHealthy) {
    return "User runner is still starting. Waiting for an online/running/ready status.";
  }
  return "No runner endpoint is ready yet.";
}

String? _runnerEndpoint(Map<String, dynamic> runner) {
  final endpoint = _stringValueOrNull(runner["runnerEndpoint"]);
  if (endpoint != null && endpoint.isNotEmpty) {
    return endpoint.replaceAll(RegExp(r"/+$"), "");
  }
  return _runnerEndpointFromIp(_stringValueOrNull(runner["privateIp"]));
}

String? _runnerEndpointFromIp(String? privateIp) {
  final trimmed = _stringValue(privateIp);
  if (trimmed.isEmpty) return null;
  return "http://$trimmed:8787";
}

String _stringValue(Object? value) {
  return value is String ? value.trim() : "";
}

String? _stringValueOrNull(Object? value) {
  final trimmed = _stringValue(value);
  return trimmed.isEmpty ? null : trimmed;
}

int _compareUpdatedAt(Map<String, dynamic> left, Map<String, dynamic> right) {
  return _stringValue(
    right["updatedAt"],
  ).compareTo(_stringValue(left["updatedAt"]));
}
