import 'apple_tts.dart';
import 'elevenlabs_tts.dart';
import 'openai_tts.dart';
import 'tts_client.dart';

const _provider = String.fromEnvironment(
  'TTS_PROVIDER',
  defaultValue: 'apple',
);

const _voiceToolsOpenAiKey = String.fromEnvironment('VOICE_TOOLS_OPENAI_KEY');
const _openAiKey = String.fromEnvironment('OPENAI_API_KEY');
const _openAiBase = String.fromEnvironment(
  'OPENAI_BASE_URL',
  defaultValue: 'https://api.openai.com',
);
const _openAiTtsBase = String.fromEnvironment(
  'OPENAI_TTS_BASE_URL',
  defaultValue: _openAiBase,
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
const _elevenLabsKey = String.fromEnvironment('ELEVENLABS_API_KEY');
const _elevenLabsAltKey = String.fromEnvironment('ELEVEN_LABS_API_KEY');
const _xiApiKey = String.fromEnvironment('XI_API_KEY');
const _elevenLabsBase = String.fromEnvironment(
  'ELEVENLABS_BASE_URL',
  defaultValue: 'https://api.elevenlabs.io',
);
const _elevenLabsVoiceId = String.fromEnvironment(
  'ELEVENLABS_VOICE_ID',
  defaultValue: 'JBFqnCBsd6RMkjVDRZzb',
);
const _elevenLabsModel = String.fromEnvironment(
  'ELEVENLABS_MODEL',
  defaultValue: 'eleven_flash_v2_5',
);
const _elevenLabsOutputFormat = String.fromEnvironment(
  'ELEVENLABS_OUTPUT_FORMAT',
  defaultValue: 'mp3_44100_128',
);

/// Picks a [TtsClient] from --dart-define flags. Defaults to on-device
/// Apple TTS so the app works without any extra config.
TtsClient resolveTtsClient() {
  switch (_provider) {
    case 'openai':
      final key = _voiceToolsOpenAiKey.isNotEmpty
          ? _voiceToolsOpenAiKey
          : _openAiKey;
      if (key.isEmpty) {
        // Fall back to Apple — never block voice mode on missing TTS config.
        return AppleTtsClient(language: _ttsLanguage);
      }
      return OpenAiTtsClient(
        apiKey: key,
        baseUrl: _openAiTtsBase,
        model: _openAiTtsModel,
        voice: _openAiTtsVoice,
      );
    case 'elevenlabs':
    case 'eleven_labs':
    case '11labs':
      final key = _elevenLabsKey.isNotEmpty
          ? _elevenLabsKey
          : _elevenLabsAltKey.isNotEmpty
              ? _elevenLabsAltKey
              : _xiApiKey;
      if (key.isEmpty) {
        return AppleTtsClient(language: _ttsLanguage);
      }
      return ElevenLabsTtsClient(
        apiKey: key,
        baseUrl: _elevenLabsBase,
        voiceId: _elevenLabsVoiceId,
        model: _elevenLabsModel,
        outputFormat: _elevenLabsOutputFormat,
      );
    case 'apple':
    default:
      return AppleTtsClient(language: _ttsLanguage);
  }
}

String get ttsProviderName => _provider;
