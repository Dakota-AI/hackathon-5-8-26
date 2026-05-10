import 'apple_tts.dart';
import 'openai_tts.dart';
import 'tts_client.dart';

const _provider = String.fromEnvironment(
  'TTS_PROVIDER',
  defaultValue: 'apple',
);

const _openAiKey = String.fromEnvironment('OPENAI_API_KEY');
const _openAiBase = String.fromEnvironment(
  'OPENAI_BASE_URL',
  defaultValue: 'https://api.openai.com',
);
const _openAiTtsModel = String.fromEnvironment(
  'OPENAI_TTS_MODEL',
  defaultValue: 'gpt-4o-mini-tts',
);
const _openAiTtsVoice = String.fromEnvironment(
  'OPENAI_TTS_VOICE',
  defaultValue: 'alloy',
);

const _ttsLanguage = String.fromEnvironment(
  'TTS_LANGUAGE',
  defaultValue: 'en-US',
);

/// Picks a [TtsClient] from --dart-define flags. Defaults to on-device
/// Apple TTS so the app works without any extra config.
TtsClient resolveTtsClient() {
  switch (_provider) {
    case 'openai':
      if (_openAiKey.isEmpty) {
        // Fall back to Apple — never block voice mode on missing TTS config.
        return AppleTtsClient(language: _ttsLanguage);
      }
      return OpenAiTtsClient(
        apiKey: _openAiKey,
        baseUrl: _openAiBase,
        model: _openAiTtsModel,
        voice: _openAiTtsVoice,
      );
    case 'apple':
    default:
      return AppleTtsClient(language: _ttsLanguage);
  }
}

String get ttsProviderName => _provider;
