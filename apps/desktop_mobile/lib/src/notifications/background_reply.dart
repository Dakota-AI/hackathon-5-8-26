import 'dart:convert';
import 'dart:io';
import 'dart:ui' show DartPluginRegistrant;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

const _systemPrompt = '''
You are an on-call AI agent inside a chat. The user just replied to one
of your proactive messages from the lock screen. Reply briefly — under
two short sentences — like a Discord DM. No markdown, no asterisks, no
code blocks. Conversational, direct.
''';

const _openAiBase = String.fromEnvironment(
  'OPENAI_BASE_URL',
  defaultValue: 'https://api.openai.com',
);
const _openAiKey = String.fromEnvironment('OPENAI_API_KEY');
const _openAiModel = String.fromEnvironment(
  'OPENAI_MODEL',
  defaultValue: 'gpt-4o-mini',
);

const _replyActionId = 'reply_inline';
const _agentCategory = 'agent_reply';

/// Background isolate entry point for inline notification replies.
///
/// iOS calls this when the user submits the inline-reply action and the
/// app is suspended/killed. We run in a fresh Dart isolate with no
/// in-memory state — everything goes through the persisted JSON file
/// and a direct HTTP call.
///
/// Apple gives ~30s of background execution for this kind of response,
/// so we use non-streaming completion and skip TTS.
@pragma('vm:entry-point')
Future<void> backgroundReplyHandler(NotificationResponse response) async {
  // The background isolate has no auto-registered plugins. Without this
  // call, path_provider and flutter_local_notifications platform channels
  // throw on first use.
  DartPluginRegistrant.ensureInitialized();

  _log(
    'handler invoked type=${response.notificationResponseType} '
    'action=${response.actionId} inputLen=${response.input?.length ?? 0}',
  );

  if (response.notificationResponseType !=
      NotificationResponseType.selectedNotificationAction) {
    return;
  }
  if (response.actionId != _replyActionId) return;

  final reply = response.input?.trim() ?? '';
  if (reply.isEmpty) return;
  if (_openAiKey.isEmpty) {
    _log('background reply: OPENAI_API_KEY missing — abort');
    return;
  }

  _log('background reply received (${reply.length} chars)');

  try {
    final history = await _loadHistory();
    final userTurn = _Turn.user(reply, _maxId(history) + 1);
    history.add(userTurn);
    await _saveHistory(history);

    final agentText = await _openAiCompletion(history);
    if (agentText.trim().isEmpty) {
      _log('background reply: empty completion');
      return;
    }

    final agentTurn = _Turn.agent(agentText, _maxId(history) + 1);
    history.add(agentTurn);
    await _saveHistory(history);

    await _showFollowupBanner(agentText);
    _log('background reply: cycle complete');
  } catch (e, st) {
    _log('background reply failed: $e\n$st');
  }
}

// ----- minimal copies of persistence + Turn so this file is isolate-safe.

class _Turn {
  _Turn({
    required this.id,
    required this.role,
    required this.text,
    required this.origin,
  }) : createdAt = DateTime.now();

  factory _Turn.user(String text, int seq) =>
      _Turn(id: 'user-$seq', role: 'user', text: text, origin: 'reactive');

  factory _Turn.agent(String text, int seq) =>
      _Turn(id: 'agent-$seq', role: 'agent', text: text, origin: 'proactive');

  final String id;
  final String role;
  final String text;
  final String origin;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'role': role,
    'text': text,
    'createdAt': createdAt.toIso8601String(),
    'modality': 'text',
    'origin': origin,
  };
}

Future<File> _historyFile() async {
  final dir = await getApplicationDocumentsDirectory();
  return File('${dir.path}/aicaller_conversation_v1.json');
}

Future<List<_Turn>> _loadHistory() async {
  final file = await _historyFile();
  if (!await file.exists()) return [];
  try {
    final raw = await file.readAsString();
    if (raw.trim().isEmpty) return [];
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    final turnsJson = decoded['turns'] as List? ?? const [];
    return [
      for (final entry in turnsJson)
        if (entry is Map)
          _Turn(
            id: entry['id'] as String? ?? 'unknown',
            role: entry['role'] as String? ?? 'user',
            text: entry['text'] as String? ?? '',
            origin: entry['origin'] as String? ?? 'reactive',
          ),
    ];
  } catch (e) {
    _log('background reply: load failed $e');
    return [];
  }
}

Future<void> _saveHistory(List<_Turn> history) async {
  final file = await _historyFile();
  final payload = jsonEncode({
    'version': 1,
    'turns': history.map((t) => t.toJson()).toList(),
  });
  await file.writeAsString(payload);
}

int _maxId(List<_Turn> history) {
  var maxN = 0;
  for (final t in history) {
    final dash = t.id.lastIndexOf('-');
    if (dash < 0) continue;
    final n = int.tryParse(t.id.substring(dash + 1));
    if (n != null && n > maxN) maxN = n;
  }
  return maxN;
}

Future<String> _openAiCompletion(List<_Turn> history) async {
  final base = _openAiBase.replaceFirst(RegExp(r'/+$'), '');
  final uri = Uri.parse('$base/v1/chat/completions');
  final messages = <Map<String, String>>[
    {'role': 'system', 'content': _systemPrompt},
    for (final t in history)
      {'role': t.role == 'agent' ? 'assistant' : 'user', 'content': t.text},
  ];

  // iOS gives ~30s of background execution for notification responses.
  // Cap the HTTP call well below that so the rest of the bookkeeping
  // (disk write + followup banner) still has room to complete.
  final response = await http
      .post(
        uri,
        headers: {
          'authorization': 'Bearer $_openAiKey',
          'content-type': 'application/json',
        },
        body: jsonEncode({
          'model': _openAiModel,
          'messages': messages,
          'stream': false,
          // Featherless and other OpenAI-compatible providers reject
          // requests without an explicit cap (they default to model max).
          'max_tokens': 512,
        }),
      )
      .timeout(const Duration(seconds: 20));

  if (response.statusCode < 200 || response.statusCode >= 300) {
    _log('openai bg ${response.statusCode}: ${response.body}');
    return '';
  }
  final decoded = jsonDecode(response.body) as Map<String, dynamic>;
  final choices = decoded['choices'] as List?;
  if (choices == null || choices.isEmpty) return '';
  final content =
      ((choices.first as Map)['message'] as Map?)?['content'] as String?;
  return content?.trim() ?? '';
}

Future<void> _showFollowupBanner(String body) async {
  final plugin = FlutterLocalNotificationsPlugin();
  // Re-register the category so the followup banner has the same reply
  // action — keeps the lock-screen reply loop going. DarwinNotificationAction.text
  // is a non-const factory, so the InitializationSettings tree can't be const.
  final init = InitializationSettings(
    iOS: DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
      notificationCategories: [
        DarwinNotificationCategory(
          _agentCategory,
          actions: [
            DarwinNotificationAction.text(
              _replyActionId,
              'Reply',
              buttonTitle: 'Send',
              placeholder: 'Reply to the agent…',
            ),
          ],
        ),
      ],
    ),
  );
  await plugin.initialize(init);
  final id = DateTime.now().millisecondsSinceEpoch.remainder(1 << 31);
  await plugin.show(
    id,
    'Agent',
    body,
    const NotificationDetails(
      iOS: DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        interruptionLevel: InterruptionLevel.timeSensitive,
        categoryIdentifier: _agentCategory,
      ),
    ),
    payload: 'open-chat',
  );
}

void _log(String msg) {
  // Background isolate has no Amplify safePrint; stdio works fine.
  // ignore: avoid_print
  print('[bg-reply] $msg');
}
