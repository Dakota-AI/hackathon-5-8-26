import 'package:desktop_mobile/src/llm/llm_client.dart';
import 'package:desktop_mobile/src/llm/llm_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('llm provider guardrails', () {
    test(
      'defaults to Hermes-only and surfaces missing config as unconfigured client',
      () {
        final client = resolveLlmClient();
        expect(llmProviderName, 'hermes');
        expect(client, isA<UnconfiguredLlmClient>());
        expect(
          (client as UnconfiguredLlmClient).reason,
          contains('Hermes provider selected but HERMES_BASE_URL is empty'),
        );
      },
    );
  });
}
