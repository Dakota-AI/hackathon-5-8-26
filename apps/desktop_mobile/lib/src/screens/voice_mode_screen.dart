import 'dart:async';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:shadcn_flutter/shadcn_flutter.dart';
import 'package:speech_to_text/speech_recognition_result.dart'
    show SpeechRecognitionResult;
import 'package:speech_to_text/speech_to_text.dart' as speech;

import '../conversation/agent_inbox.dart';
import '../conversation/conversation_store.dart';
import '../notifications/notification_service.dart';
import '../tts/tts_orchestrator.dart';
import '../tts/tts_provider.dart';
import '../ui/genui_block.dart';
import '../ui/level_visualizer.dart';
import '../ui/sphere.dart';
import '../ui/streaming_text.dart';
import '../ui/tokens.dart';

/// Voice-first surface — no text composer.
///
/// Conversation loop:
///
///   1. Mic on (speech_to_text VAD with pauseFor=1.5s).
///   2. STT partial results show live in a soft "you're saying…" bubble.
///   3. STT final → store.sendUser(speech, voiceMode: true) starts streaming.
///   4. As LLM deltas arrive, [TtsOrchestrator] splits on sentence
///      boundaries, queues each sentence to TTS, plays sequentially —
///      audio starts within a few hundred ms of the first sentence rather
///      than waiting for the full reply.
///   5. When TTS queue drains and stream is done, mic re-arms.
///
/// Barge-in: if the user starts speaking while TTS is playing, the
/// orchestrator stops playback and the queue clears.
class VoiceModeScreen extends StatefulWidget {
  const VoiceModeScreen({
    super.key,
    required this.store,
    required this.inbox,
  });

  final ConversationStore store;
  final AgentInbox inbox;

  @override
  State<VoiceModeScreen> createState() => _VoiceModeScreenState();
}

class _VoiceModeScreenState extends State<VoiceModeScreen> {
  final _speech = speech.SpeechToText();
  final _scroll = ScrollController();

  late final TtsOrchestrator _tts;

  bool _muted = false;
  bool _speakerOn = true;
  bool _speechReady = false;
  bool _listening = false;
  bool _closing = false;
  bool _speechRequested = false;
  String? _partialTranscript;
  String? _hint;
  double _soundLevel = 0;
  Timer? _rearmTimer;

  // Client-side turn-taking. iOS's SFSpeechRecognizer hands back
  // `finalResult: true` on every short pause (sometimes after a single
  // word), so we can't just dispatch on `finalResult` — we'd cut the user
  // off. Instead we buffer all finals + partials and only flush after
  // [_dispatchSilence] of no further updates.
  Timer? _dispatchTimer;
  final _utteranceBuffer = StringBuffer();
  String _currentSegment = '';
  static const _dispatchSilence = Duration(milliseconds: 2400);

  @override
  void initState() {
    super.initState();
    _tts = TtsOrchestrator(client: resolveTtsClient());
    _tts.addListener(_handleTtsChange);
    widget.store.addListener(_handleStoreChange);
    // Proactive turns that arrive while voice mode is open get spoken.
    widget.inbox.voiceOrchestrator = _tts;
    NotificationService.instance.setVoiceVisible(true);
    unawaited(_armMic());
  }

  @override
  void dispose() {
    NotificationService.instance.setVoiceVisible(false);
    widget.inbox.voiceOrchestrator = null;
    widget.store.removeListener(_handleStoreChange);
    _tts.removeListener(_handleTtsChange);
    _tts.dispose();
    _rearmTimer?.cancel();
    _dispatchTimer?.cancel();
    unawaited(_speech.stop());
    _scroll.dispose();
    super.dispose();
  }

  void _handleStoreChange() {
    if (!mounted) return;
    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _handleTtsChange() {
    if (!mounted) return;
    setState(() {});
    // Mic stays armed throughout — no need to re-trigger arming here.
  }

  Future<bool> _ensureSpeechReady() async {
    if (_speechReady) return true;
    safePrint('[stt] initializing');
    setState(() => _hint = 'Requesting mic access…');
    try {
      final ok = await _speech.initialize(
        onStatus: (status) {
          safePrint('[stt] status=$status');
          if (!mounted) return;
          if (status == 'listening') {
            setState(() {
              _listening = true;
              _hint = null;
            });
          } else if (status == 'done' || status == 'notListening') {
            setState(() => _listening = false);
            // Always re-arm; mic stays open during TTS for barge-in.
            if (!_speechRequested) _scheduleArm();
          }
        },
        onError: (error) {
          safePrint('[stt] error code=${error.errorMsg} permanent=${error.permanent}');
          if (!mounted) return;
          setState(() {
            _listening = false;
            _hint = error.errorMsg;
          });
        },
      );
      safePrint('[stt] initialize ok=$ok');
      if (!mounted) return ok;
      setState(() {
        _speechReady = ok;
        _hint = ok ? null : 'Speech recognition unavailable on this device.';
      });
      return ok;
    } catch (e) {
      if (!mounted) return false;
      setState(() {
        _listening = false;
        _hint = '$e';
      });
      return false;
    }
  }

  void _scheduleArm({Duration delay = const Duration(milliseconds: 350)}) {
    _rearmTimer?.cancel();
    if (!mounted || _closing || _muted || _listening) return;
    _rearmTimer = Timer(delay, () {
      if (!mounted || _closing || _muted || _listening) return;
      unawaited(_armMic());
    });
  }

  Future<void> _armMic() async {
    // Note: we intentionally arm the mic during TTS playback so barge-in
    // can fire from the sound-level callback. We rely on iOS AEC (the
    // playAndRecord + voiceChat audio category) to suppress most echo.
    if (_muted || _closing) return;
    final ok = await _ensureSpeechReady();
    if (!ok || !mounted) return;
    if (_listening) return;

    setState(() {
      _speechRequested = true;
      _partialTranscript = null;
    });

    try {
      _utteranceBuffer.clear();
      _currentSegment = '';
      await _speech.listen(
        listenOptions: speech.SpeechListenOptions(
          listenMode: speech.ListenMode.dictation,
          partialResults: true,
          cancelOnError: true,
          autoPunctuation: true,
        ),
        // Long pauseFor + listenFor — we don't trust SFSpeechRecognizer's
        // built-in endpointing for end-of-turn (it fires after one word).
        // Our own _dispatchTimer handles end-of-turn.
        pauseFor: const Duration(seconds: 8),
        listenFor: const Duration(seconds: 60),
        onSoundLevelChange: _handleSoundLevel,
        onResult: _handleStt,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _hint = '$e';
        _listening = false;
        _speechRequested = false;
      });
    }
  }

  void _handleSoundLevel(double level) {
    if (!mounted) return;
    final normalized = (level / 10).clamp(0.0, 1.0);
    setState(() => _soundLevel = normalized);

    // Barge-in: if the user starts talking while the agent is speaking,
    // hush TTS and let the listen loop take over.
    if (_tts.isSpeaking && normalized > 0.32) {
      safePrint('[voice] barge-in detected (level=$normalized) → cancelling TTS');
      unawaited(_tts.cancel());
    }
  }

  void _handleStt(SpeechRecognitionResult result) {
    final text = result.recognizedWords.trim();
    safePrint(
      '[stt] result final=${result.finalResult} text="${text.length > 60 ? '${text.substring(0, 60)}…' : text}"',
    );
    if (!mounted) return;
    _currentSegment = text;
    setState(() => _partialTranscript = _composedTranscript());
    if (result.finalResult) {
      // iOS finalises on every short pause. Snapshot the segment into the
      // utterance buffer and start a fresh segment — but DON'T dispatch.
      // The dispatch timer below decides when the user is actually done.
      if (_currentSegment.isNotEmpty) {
        if (_utteranceBuffer.isNotEmpty) _utteranceBuffer.write(' ');
        _utteranceBuffer.write(_currentSegment);
        _currentSegment = '';
      }
    }
    _resetDispatchTimer();
  }

  String _composedTranscript() {
    if (_utteranceBuffer.isEmpty) return _currentSegment;
    if (_currentSegment.isEmpty) return _utteranceBuffer.toString();
    return '${_utteranceBuffer.toString()} $_currentSegment';
  }

  void _resetDispatchTimer() {
    _dispatchTimer?.cancel();
    _dispatchTimer = Timer(_dispatchSilence, _flushUtterance);
  }

  void _flushUtterance() {
    final composed = _composedTranscript().trim();
    if (composed.isEmpty) {
      _scheduleArm(delay: const Duration(milliseconds: 400));
      return;
    }
    _utteranceBuffer.clear();
    _currentSegment = '';
    _speechRequested = false;
    if (mounted) {
      setState(() {
        _listening = false;
        _partialTranscript = null;
        _soundLevel = 0;
      });
    }
    unawaited(_speech.stop());
    _dispatchUserTurn(composed);
  }

  void _dispatchUserTurn(String text) {
    safePrint('[voice] dispatch user turn (${text.length} chars)');
    unawaited(
      widget.store.sendUser(
        text: text,
        modality: TurnModality.speech,
        voiceMode: true,
        onDelta: _tts.addDelta,
        onComplete: () {
          safePrint('[voice] llm stream complete');
          _tts.completeStream();
        },
      ),
    );
  }

  void _toggleMute() {
    final next = !_muted;
    setState(() => _muted = next);
    if (next) {
      _rearmTimer?.cancel();
      _dispatchTimer?.cancel();
      _utteranceBuffer.clear();
      _currentSegment = '';
      unawaited(_speech.stop());
      setState(() {
        _listening = false;
        _partialTranscript = null;
        _hint = 'Mic muted';
      });
    } else {
      setState(() => _hint = null);
      _scheduleArm(delay: const Duration(milliseconds: 200));
    }
  }

  void _toggleSpeaker() {
    // The TTS adapter (Apple or OpenAI via audioplayers) is configured to
    // route through the speaker by default. Earpiece routing requires an
    // active WebRTC audio session (Helper.setSpeakerphoneOn) which is only
    // available on the agent-initiated CallKit path. Until that flow lands
    // here, this toggle reflects intent only.
    setState(() => _speakerOn = !_speakerOn);
  }

  Future<void> _hangup() async {
    _closing = true;
    _rearmTimer?.cancel();
    _dispatchTimer?.cancel();
    await _tts.cancel();
    widget.store.cancelInflight();
    await _speech.stop();
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  _VoiceState get _state {
    if (_tts.isSpeaking) return _VoiceState.speaking;
    if (widget.store.isResponding) return _VoiceState.thinking;
    if (_partialTranscript != null && _partialTranscript!.isNotEmpty) {
      return _VoiceState.captured;
    }
    if (_listening) return _VoiceState.listening;
    if (_muted) return _VoiceState.muted;
    return _VoiceState.idle;
  }

  @override
  Widget build(BuildContext context) {
    final isCompact = MediaQuery.sizeOf(context).width < 760;
    final state = _state;
    final sphereSize = isCompact ? 280.0 : 340.0;

    // For the inner-bar visualizer:
    //   - while TTS plays: synthesize a higher-amplitude wave
    //   - while listening: drive from mic sound level
    //   - else: idle
    final isMicChannel = state == _VoiceState.listening ||
        state == _VoiceState.captured;
    final visualizerActive = isMicChannel || state == _VoiceState.speaking;
    final visualizerLevel = state == _VoiceState.speaking
        ? 0.65
        : isMicChannel
            ? _soundLevel
            : 0.0;

    return Scaffold(
      backgroundColor: Palette.background,
      child: SafeArea(
        child: Column(
          children: [
            _VoiceTopBar(
              state: state,
              providerLabel:
                  '${widget.store.providerLabel} · ${_tts.client.label}',
              onClose: _hangup,
            ),
            Container(height: 1, color: Palette.border),
            Padding(
              padding: EdgeInsets.fromLTRB(0, isCompact ? 12 : 18, 0, 0),
              child: Center(
                child: LiveSphere(
                  size: sphereSize,
                  child: LevelVisualizer(
                    level: visualizerLevel,
                    active: visualizerActive,
                    numBars: 24,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: Center(
                child: Text(
                  _statusLine(),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Palette.muted,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              ),
            ),
            Expanded(
              child: _Transcript(
                store: widget.store,
                scroll: _scroll,
                partial: _partialTranscript,
              ),
            ),
            _VoiceControls(
              muted: _muted,
              speakerOn: _speakerOn,
              onToggleMute: _toggleMute,
              onToggleSpeaker: _toggleSpeaker,
              onHangup: _hangup,
              hint: _hint,
            ),
          ],
        ),
      ),
    );
  }

  String _statusLine() {
    if (_tts.isSpeaking) return 'Speaking';
    if (widget.store.isResponding) return 'Thinking';
    if (_partialTranscript != null && _partialTranscript!.isNotEmpty) {
      return _partialTranscript!;
    }
    if (_listening) return 'Listening';
    if (_muted) return 'Muted';
    return 'Tap mute to pause';
  }
}

enum _VoiceState { idle, listening, captured, thinking, speaking, muted }

extension _VoiceStateLabel on _VoiceState {
  String get label => switch (this) {
        _VoiceState.idle => 'Idle',
        _VoiceState.listening => 'Listening',
        _VoiceState.captured => 'Captured',
        _VoiceState.thinking => 'Thinking',
        _VoiceState.speaking => 'Speaking',
        _VoiceState.muted => 'Muted',
      };
}

class _VoiceTopBar extends StatelessWidget {
  const _VoiceTopBar({
    required this.state,
    required this.providerLabel,
    required this.onClose,
  });

  final _VoiceState state;
  final String providerLabel;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 50,
      color: Palette.background,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  state.label,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: Palette.text,
                    letterSpacing: -0.2,
                    height: 1.1,
                  ),
                ),
                Text(
                  providerLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Palette.muted,
                    fontSize: 11,
                    height: 1.2,
                  ),
                ),
              ],
            ),
          ),
          GhostButton(
            density: ButtonDensity.icon,
            onPressed: onClose,
            child: const Icon(RadixIcons.cross1, size: 14),
          ),
        ],
      ),
    );
  }
}

class _Transcript extends StatelessWidget {
  const _Transcript({
    required this.store,
    required this.scroll,
    required this.partial,
  });

  final ConversationStore store;
  final ScrollController scroll;
  final String? partial;

  @override
  Widget build(BuildContext context) {
    final turns = store.turns;
    return ListView(
      controller: scroll,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      children: [
        for (final turn in turns) _TranscriptTurn(turn: turn),
        if (partial != null && partial!.isNotEmpty)
          _PartialUserBubble(text: partial!),
      ],
    );
  }
}

class _TranscriptTurn extends StatelessWidget {
  const _TranscriptTurn({required this.turn});

  final Turn turn;

  @override
  Widget build(BuildContext context) {
    final isUser = turn.role == TurnRole.user;
    final segments =
        isUser ? const <AgentSegment>[] : parseAgentText(turn.text);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth:
                segments.any((s) => s is GenUiSegment) ? double.infinity : 520,
          ),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            decoration: BoxDecoration(
              color: isUser ? Palette.input : Palette.panel,
              border: Border.all(
                color: isUser ? Palette.borderStrong : Palette.border,
              ),
              borderRadius: BorderRadius.circular(10),
            ),
            child: isUser
                ? Text(
                    turn.text,
                    style: const TextStyle(
                      color: Palette.text,
                      fontSize: 14,
                      height: 1.45,
                    ),
                  )
                : _AgentSegments(turn: turn, segments: segments),
          ),
        ),
      ),
    );
  }
}

class _AgentSegments extends StatelessWidget {
  const _AgentSegments({required this.turn, required this.segments});

  final Turn turn;
  final List<AgentSegment> segments;

  @override
  Widget build(BuildContext context) {
    if (turn.error) {
      return Text(
        turn.text,
        style: const TextStyle(
          color: Palette.danger,
          fontSize: 13,
          height: 1.45,
        ),
      );
    }
    if (segments.isEmpty) {
      return turn.streaming
          ? StreamingText(
              text: turn.text,
              charactersPerSecond: 240,
              style: const TextStyle(
                color: Palette.text,
                fontSize: 14,
                height: 1.45,
              ),
            )
          : Text(
              turn.text,
              style: const TextStyle(
                color: Palette.text,
                fontSize: 14,
                height: 1.45,
              ),
            );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < segments.length; i++)
          _segmentWidget(segments[i], turn, i),
      ],
    );
  }

  Widget _segmentWidget(AgentSegment segment, Turn turn, int index) {
    return switch (segment) {
      TextSegment(:final text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text,
          style: const TextStyle(
            color: Palette.text,
            fontSize: 14,
            height: 1.45,
          ),
        ),
      ),
      GenUiSegment(:final json) => GenUiBlock(
        surfaceId: '${turn.id}-genui-$index',
        payload: json,
      ),
    };
  }
}

class _PartialUserBubble extends StatelessWidget {
  const _PartialUserBubble({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Align(
        alignment: Alignment.centerRight,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            decoration: BoxDecoration(
              color: Palette.input,
              border: Border.all(color: Palette.border),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              text,
              style: const TextStyle(
                color: Palette.muted,
                fontSize: 14,
                fontStyle: FontStyle.italic,
                height: 1.45,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _VoiceControls extends StatelessWidget {
  const _VoiceControls({
    required this.muted,
    required this.speakerOn,
    required this.onToggleMute,
    required this.onToggleSpeaker,
    required this.onHangup,
    required this.hint,
  });

  final bool muted;
  final bool speakerOn;
  final VoidCallback onToggleMute;
  final VoidCallback onToggleSpeaker;
  final VoidCallback onHangup;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        12 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Palette.border)),
        color: Palette.background,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _VoiceCircleButton(
                icon: muted ? LucideIcons.micOff : LucideIcons.mic,
                label: muted ? 'Unmute' : 'Mute',
                emphasized: muted,
                onPressed: onToggleMute,
              ),
              _VoiceCircleButton(
                icon: speakerOn ? LucideIcons.volume2 : RadixIcons.speakerOff,
                label: speakerOn ? 'Speaker' : 'Earpiece',
                emphasized: speakerOn,
                onPressed: onToggleSpeaker,
              ),
              _VoiceCircleButton(
                icon: LucideIcons.phoneOff,
                label: 'End',
                onPressed: onHangup,
                destructive: true,
              ),
            ],
          ),
          if (hint != null) ...[
            const Gap(8),
            Text(
              hint!,
              style: const TextStyle(
                color: Palette.muted,
                fontSize: 11,
                height: 1.3,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _VoiceCircleButton extends StatelessWidget {
  const _VoiceCircleButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.emphasized = false,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final bool emphasized;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final bg = destructive
        ? Palette.danger.withValues(alpha: 0.18)
        : emphasized
            ? Palette.inputElevated
            : Palette.input;
    final border = destructive
        ? Palette.danger.withValues(alpha: 0.5)
        : emphasized
            ? Palette.borderStrong
            : Palette.border;
    final fg = destructive ? Palette.danger : Palette.text;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onPressed,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: bg,
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(30),
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 22, color: fg),
          ),
          const Gap(6),
          Text(
            label,
            style: const TextStyle(
              color: Palette.muted,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
