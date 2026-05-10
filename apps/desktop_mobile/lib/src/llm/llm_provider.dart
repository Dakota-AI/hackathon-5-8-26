import 'hermes_client.dart';
import 'llm_client.dart';
import 'openai_client.dart';

const _provider = String.fromEnvironment(
  'LLM_PROVIDER',
  defaultValue: 'openai',
);

const _openAiBase = String.fromEnvironment(
  'OPENAI_BASE_URL',
  defaultValue: 'https://api.openai.com',
);
const _openAiKey = String.fromEnvironment('OPENAI_API_KEY');
const _openAiModel = String.fromEnvironment(
  'OPENAI_MODEL',
  defaultValue: 'gpt-4o-mini',
);

const _ollamaBase = String.fromEnvironment(
  'OLLAMA_BASE_URL',
  defaultValue: '',
);
const _ollamaModel = String.fromEnvironment(
  'OLLAMA_MODEL',
  defaultValue: 'llama3.2',
);

const _hermesBase = String.fromEnvironment(
  'HERMES_BASE_URL',
  defaultValue: '',
);

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
  switch (_provider) {
    case 'openai':
      if (_openAiKey.isEmpty) {
        return const UnconfiguredLlmClient(
          'OpenAI provider selected but OPENAI_API_KEY is empty. '
          'Pass --dart-define=OPENAI_API_KEY=sk-... at run time.',
        );
      }
      return OpenAiCompatibleClient(
        baseUrl: _openAiBase,
        apiKey: _openAiKey,
        model: _openAiModel,
        systemPrompt: _textSystemPrompt,
      );

    case 'ollama':
      if (_ollamaBase.isEmpty) {
        return const UnconfiguredLlmClient(
          'Ollama provider selected but OLLAMA_BASE_URL is empty. '
          'Pass --dart-define=OLLAMA_BASE_URL=http://<mac-ip>:11434 '
          'and run `ollama serve && ollama pull $_ollamaModel` on the Mac.',
        );
      }
      // Ollama serves /v1/chat/completions in OpenAI-compat mode.
      return OpenAiCompatibleClient(
        baseUrl: _ollamaBase,
        apiKey: 'ollama',
        model: _ollamaModel,
        systemPrompt: _textSystemPrompt,
      );

    case 'hermes':
      return HermesLlmClient(baseUrl: _hermesBase);

    default:
      return UnconfiguredLlmClient(
        'Unknown LLM_PROVIDER "$_provider". Use openai, ollama, or hermes.',
      );
  }
}

String get llmProviderName => _provider;
