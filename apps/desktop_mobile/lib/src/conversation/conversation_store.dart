import 'dart:async';

import 'package:flutter/foundation.dart';

import '../llm/llm_client.dart';
import '../llm/llm_provider.dart';
import 'store_persistence.dart';

enum TurnRole { user, agent, system }

/// Modality of the *user* turn that produced this exchange. Lets the UI
/// render a small "voice" hint on bubbles that came from the mic, even
/// after the conversation has switched back to text mode.
enum TurnModality { text, speech }

/// Why this turn exists. Reactive = response to a user message. Proactive
/// = the agent reached out unprompted (manual ping or future server push).
/// Used by the chat surface for entry animation + unread badging.
enum TurnOrigin { reactive, proactive }

@immutable
class Turn {
  const Turn({
    required this.id,
    required this.role,
    required this.text,
    required this.createdAt,
    this.modality = TurnModality.text,
    this.origin = TurnOrigin.reactive,
    this.streaming = false,
    this.error = false,
  });

  final String id;
  final TurnRole role;
  final String text;
  final DateTime createdAt;
  final TurnModality modality;
  final TurnOrigin origin;
  final bool streaming;
  final bool error;

  Turn copyWith({String? text, bool? streaming, bool? error}) => Turn(
    id: id,
    role: role,
    text: text ?? this.text,
    createdAt: createdAt,
    modality: modality,
    origin: origin,
    streaming: streaming ?? this.streaming,
    error: error ?? this.error,
  );
}

/// One live conversation. Shared between the chat surface and the voice
/// surface so switching modes keeps context. Persists to disk so cold
/// starts don't lose history.
class ConversationStore extends ChangeNotifier {
  ConversationStore({
    LlmClient? client,
    StorePersistence? persistence,
  })  : _client = client ?? resolveLlmClient(),
        _persistence = persistence;

  LlmClient _client;
  StorePersistence? _persistence;
  final List<Turn> _turns = [];
  int _seq = 0;
  StreamSubscription<LlmDelta>? _activeStream;
  String? _activeAgentTurnId;

  /// Fires every time a *new* agent turn (reactive or proactive) is
  /// appended. Listeners (e.g. the AgentInbox / notification service)
  /// use this to decide whether to fire a banner or a haptic.
  final _newAgentTurns = StreamController<Turn>.broadcast();
  Stream<Turn> get onNewAgentTurn => _newAgentTurns.stream;

  List<Turn> get turns => List.unmodifiable(_turns);
  bool get isResponding => _activeStream != null;
  String get providerLabel => _client.label;
  String get providerName => llmProviderName;

  /// Last write time of the persisted file. The chat surface polls this
  /// to detect background-isolate writes. Null if never persisted.
  Future<DateTime?> persistedAt() => _persistence?.mtime() ?? Future.value(null);

  Future<void> attachPersistence(StorePersistence persistence) async {
    _persistence = persistence;
    final loaded = await persistence.load();
    if (loaded.isNotEmpty) {
      _turns
        ..clear()
        ..addAll(loaded);
      _seq = _maxSeqIn(loaded);
      notifyListeners();
    }
  }

  /// Re-read the persisted history from disk and replace in-memory state.
  ///
  /// The background reply isolate (see [backgroundReplyHandler]) writes
  /// directly to the conversation file while the app is suspended. When
  /// the app resumes, the in-memory store has stale data — calling this
  /// brings it back in sync. Cancels any in-flight stream first.
  Future<void> reload() async {
    if (_persistence == null) return;
    _activeStream?.cancel();
    _activeStream = null;
    _activeAgentTurnId = null;
    final loaded = await _persistence!.load();
    _turns
      ..clear()
      ..addAll(loaded);
    _seq = _maxSeqIn(loaded);
    notifyListeners();
  }

  int _maxSeqIn(List<Turn> turns) {
    var max = 0;
    for (final t in turns) {
      final dash = t.id.lastIndexOf('-');
      if (dash < 0) continue;
      final n = int.tryParse(t.id.substring(dash + 1));
      if (n != null && n > max) max = n;
    }
    return max;
  }

  void replaceClient(LlmClient client) {
    _client = client;
    notifyListeners();
  }

  void clear() {
    _activeStream?.cancel();
    _activeStream = null;
    _activeAgentTurnId = null;
    _turns.clear();
    _persist();
    notifyListeners();
  }

  /// Append a user turn, then start streaming the agent reply. The reply
  /// is appended as a separate turn that mutates in place as deltas arrive.
  ///
  /// [voiceMode] flips the system prompt to the terse, no-markdown version
  /// so TTS doesn't read asterisks or code fences aloud.
  /// [onDelta] receives every text delta as it arrives — used by the voice
  /// surface to feed the [TtsOrchestrator] for sentence-streamed playback.
  /// [onComplete] fires once when the stream ends cleanly (no error).
  Future<void> sendUser({
    required String text,
    TurnModality modality = TurnModality.text,
    bool voiceMode = false,
    void Function(String delta)? onDelta,
    VoidCallback? onComplete,
  }) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || _activeStream != null) return;

    final userTurn = Turn(
      id: _nextId('user'),
      role: TurnRole.user,
      text: trimmed,
      createdAt: DateTime.now(),
      modality: modality,
    );
    final agentTurn = _newAgentTurn(streaming: true);

    _turns
      ..add(userTurn)
      ..add(agentTurn);
    _activeAgentTurnId = agentTurn.id;
    notifyListeners();
    _persist();

    await _streamAgentReply(
      agentTurnId: agentTurn.id,
      systemPrompt: systemPromptForMode(voiceMode: voiceMode),
      onDelta: onDelta,
      onComplete: onComplete,
    );
  }

  /// Have the agent reach out unprompted. The result is an agent turn
  /// with [TurnOrigin.proactive] and no preceding user turn — Discord-DM
  /// style.
  ///
  /// [hint] gives the model a nudge ("status update", "follow up on the
  /// dinner plan", etc.). Optional — the proactive system prompt has
  /// enough self-direction to ping cold.
  Future<Turn> agentInitiate({
    String? hint,
    bool voiceMode = false,
    void Function(String delta)? onDelta,
    VoidCallback? onComplete,
  }) async {
    if (_activeStream != null) {
      // Don't stack proactive on top of an in-flight reply.
      return _turns.last;
    }

    final agentTurn = _newAgentTurn(
      streaming: true,
      origin: TurnOrigin.proactive,
    );
    _turns.add(agentTurn);
    _activeAgentTurnId = agentTurn.id;
    notifyListeners();
    _persist();

    final hintText = hint == null || hint.isEmpty
        ? 'Send a brief proactive message now. No preamble — just say it.'
        : 'Send a brief proactive message now: $hint';

    await _streamAgentReply(
      agentTurnId: agentTurn.id,
      systemPrompt: proactiveSystemPrompt,
      extraUserHint: hintText,
      onDelta: onDelta,
      onComplete: onComplete,
    );
    return _turns.firstWhere((t) => t.id == agentTurn.id, orElse: () => agentTurn);
  }

  /// Drop a fully-formed proactive agent turn into the conversation —
  /// used by the (eventual) Hermes server push path. No LLM call here;
  /// the runtime upstream already produced the text.
  Turn appendAgentTurnFromServer({required String text}) {
    final turn = Turn(
      id: _nextId('agent'),
      role: TurnRole.agent,
      text: text,
      createdAt: DateTime.now(),
      origin: TurnOrigin.proactive,
    );
    _turns.add(turn);
    _newAgentTurns.add(turn);
    notifyListeners();
    _persist();
    return turn;
  }

  Future<void> _streamAgentReply({
    required String agentTurnId,
    required String systemPrompt,
    String? extraUserHint,
    void Function(String delta)? onDelta,
    VoidCallback? onComplete,
  }) async {
    final history = <LlmMessage>[
      LlmMessage(role: LlmRole.system, text: systemPrompt),
      for (final t in _turns)
        if (t.id != agentTurnId && !t.error)
          LlmMessage(
            role: switch (t.role) {
              TurnRole.user => LlmRole.user,
              TurnRole.agent => LlmRole.agent,
              TurnRole.system => LlmRole.system,
            },
            text: t.text,
          ),
      if (extraUserHint != null)
        LlmMessage(role: LlmRole.system, text: extraUserHint),
    ];

    final completer = Completer<void>();
    final buffer = StringBuffer();
    var errored = false;

    _activeStream = _client.chat(history).listen(
      (delta) {
        if (delta.text.isNotEmpty) {
          buffer.write(delta.text);
          _patchAgent(agentTurnId, buffer.toString(), streaming: !delta.done);
          onDelta?.call(delta.text);
        }
        if (delta.done) {
          _patchAgent(agentTurnId, buffer.toString(), streaming: false);
        }
      },
      onError: (Object e) {
        errored = true;
        _patchAgent(
          agentTurnId,
          'LLM stream failed: $e',
          streaming: false,
          error: true,
        );
        if (!completer.isCompleted) completer.complete();
      },
      onDone: () {
        if (!completer.isCompleted) completer.complete();
      },
      cancelOnError: true,
    );

    await completer.future;
    _activeStream = null;
    _activeAgentTurnId = null;
    notifyListeners();
    _persist();

    if (!errored) {
      // Emit on the broadcast stream after the turn is settled so listeners
      // see the final text, not a streaming stub.
      final settled = _turns.firstWhere(
        (t) => t.id == agentTurnId,
        orElse: () => _newAgentTurn(),
      );
      if (settled.text.trim().isNotEmpty) _newAgentTurns.add(settled);
      onComplete?.call();
    }
  }

  /// Cancel the in-flight reply (user said "wait, ignore that" or hung up).
  void cancelInflight() {
    final id = _activeAgentTurnId;
    _activeStream?.cancel();
    _activeStream = null;
    if (id != null) {
      _patchAgent(id, _turnText(id), streaming: false);
    }
    _activeAgentTurnId = null;
    notifyListeners();
    _persist();
  }

  /// Most recent fully-streamed agent text, used by the voice surface to
  /// hand the response off to TTS once the stream completes.
  String? lastCompletedAgentText() {
    for (final turn in _turns.reversed) {
      if (turn.role == TurnRole.agent &&
          !turn.streaming &&
          !turn.error &&
          turn.text.trim().isNotEmpty) {
        return turn.text;
      }
    }
    return null;
  }

  Turn _newAgentTurn({
    bool streaming = false,
    TurnOrigin origin = TurnOrigin.reactive,
  }) {
    return Turn(
      id: _nextId('agent'),
      role: TurnRole.agent,
      text: '',
      createdAt: DateTime.now(),
      origin: origin,
      streaming: streaming,
    );
  }

  void _patchAgent(
    String id,
    String text, {
    required bool streaming,
    bool error = false,
  }) {
    final index = _turns.indexWhere((t) => t.id == id);
    if (index == -1) return;
    _turns[index] =
        _turns[index].copyWith(text: text, streaming: streaming, error: error);
    notifyListeners();
    _persist();
  }

  String _turnText(String id) {
    final i = _turns.indexWhere((t) => t.id == id);
    return i == -1 ? '' : _turns[i].text;
  }

  String _nextId(String prefix) {
    _seq += 1;
    return '$prefix-$_seq';
  }

  void _persist() {
    _persistence?.scheduleSave(_turns);
  }

  @override
  void dispose() {
    _newAgentTurns.close();
    _persistence?.dispose();
    super.dispose();
  }
}
