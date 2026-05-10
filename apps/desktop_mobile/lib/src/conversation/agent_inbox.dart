import 'dart:async';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:flutter/foundation.dart';

import '../notifications/notification_service.dart';
import '../tts/tts_orchestrator.dart';
import 'conversation_store.dart';

/// Owns the *policy* of proactive agent messages.
///
/// Each trigger (manual ping, future server push, eventual scheduler)
/// flows through here. The inbox decides cooldown, sequences the LLM
/// generation, and chooses between an immediate banner vs an OS-scheduled
/// banner so delayed pings survive iOS app suspension.
class AgentInbox extends ChangeNotifier {
  AgentInbox({
    required this.store,
    required this.notifications,
    this.cooldown = const Duration(seconds: 20),
  });

  final ConversationStore store;
  final NotificationService notifications;
  final Duration cooldown;

  /// Optional: when the user is in voice mode, the screen sets this so
  /// proactive turns get spoken through the orchestrator. When null,
  /// proactive turns just appear in the transcript silently.
  TtsOrchestrator? voiceOrchestrator;

  DateTime _lastProactiveAt = DateTime.fromMillisecondsSinceEpoch(0);
  bool _firing = false;

  /// User-initiated "have the agent ping me" — bypasses cooldown.
  ///
  /// If [delay] is zero, fires the banner immediately. Otherwise:
  ///   1. Generates the proactive turn now (LLM round-trip, in foreground).
  ///   2. Schedules an OS-level notification for now+delay so it fires
  ///      reliably even if the user backgrounds or kills the app.
  ///
  /// The text is finalised before scheduling so the banner shows the
  /// real agent message, not a placeholder.
  Future<void> manualPing({String? hint, Duration? delay}) async {
    safePrint(
      '[inbox] manual ping requested hint=$hint delay=${delay?.inSeconds ?? 0}s',
    );
    final turn = await _initiate(hint: hint);
    if (turn == null) return;
    final body = turn.text.trim();
    if (body.isEmpty) return;
    if (delay != null && delay > Duration.zero) {
      await notifications.scheduleProactive(body: body, after: delay);
    } else {
      await notifications.showProactive(body: body);
    }
  }

  /// Programmatic trigger respecting cooldown — for the future scheduler.
  Future<void> autoPing({String? hint}) async {
    final since = DateTime.now().difference(_lastProactiveAt);
    if (since < cooldown) {
      safePrint('[inbox] autoPing suppressed (cooldown ${cooldown - since})');
      return;
    }
    final turn = await _initiate(hint: hint);
    if (turn == null) return;
    final body = turn.text.trim();
    if (body.isNotEmpty) {
      await notifications.showProactive(body: body);
    }
  }

  /// Server-push entry point. The Hermes harness emits the message
  /// upstream; this just drops the produced text into the store and
  /// fires the banner. Cooldown is ignored — the runtime upstream is the
  /// source of truth.
  Future<void> serverPush({required String text}) async {
    safePrint('[inbox] server push (${text.length} chars)');
    final turn = store.appendAgentTurnFromServer(text: text);
    await notifications.showProactive(body: turn.text);
  }

  /// Generate a proactive agent turn via the LLM. Returns the settled
  /// turn (final text) or null if something went wrong / already firing.
  Future<Turn?> _initiate({required String? hint}) async {
    if (_firing) {
      safePrint('[inbox] already firing — drop');
      return null;
    }
    if (store.isResponding) {
      safePrint('[inbox] in-flight reactive reply — drop');
      return null;
    }
    _firing = true;
    final tts = voiceOrchestrator;
    try {
      final turn = await store.agentInitiate(
        hint: hint,
        voiceMode: tts != null,
        onDelta: tts?.addDelta,
        onComplete: tts?.completeStream,
      );
      _lastProactiveAt = DateTime.now();
      return turn;
    } catch (e) {
      safePrint('[inbox] agentInitiate failed: $e');
      return null;
    } finally {
      _firing = false;
    }
  }
}
