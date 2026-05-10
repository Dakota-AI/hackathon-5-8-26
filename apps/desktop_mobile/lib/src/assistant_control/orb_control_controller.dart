import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../ui/agent_orb.dart';

enum OrbControlMode {
  idle,
  listening,
  thinking,
  controlling,
  speaking,
  awaitingApproval,
  paused,
  error,
}

enum OrbControlPanelState { minimized, expanded }

enum OrbControlPresence { hidden, topBar, voice }

enum OrbControlSurface { agents, kanban, browser, approvals }

enum OrbControlEventKind {
  message,
  delegation,
  artifact,
  webpage,
  approval,
  feedback,
  control,
  error,
}

class OrbControlEvent {
  const OrbControlEvent({
    required this.id,
    required this.kind,
    required this.title,
    required this.detail,
    required this.createdAt,
  });

  final String id;
  final OrbControlEventKind kind;
  final String title;
  final String detail;
  final DateTime createdAt;
}

class OrbControlArtifact {
  const OrbControlArtifact({
    required this.id,
    required this.name,
    required this.kind,
    required this.uri,
  });

  final String id;
  final String name;
  final String kind;
  final String uri;
}

class OrbControlState {
  const OrbControlState({
    this.presence = OrbControlPresence.hidden,
    this.mode = OrbControlMode.idle,
    this.panelState = OrbControlPanelState.minimized,
    this.statusLine = 'Ask the main agent when you want a guided walkthrough.',
    this.mockRunning = false,
    this.controlPaused = false,
    this.events = const [],
    this.artifacts = const [],
    this.pendingApproval,
    this.position,
    this.targetSurface,
    this.targetAgentId,
    this.targetRevision = 0,
  });

  final OrbControlPresence presence;
  final OrbControlMode mode;
  final OrbControlPanelState panelState;
  final String statusLine;
  final bool mockRunning;
  final bool controlPaused;
  final List<OrbControlEvent> events;
  final List<OrbControlArtifact> artifacts;
  final String? pendingApproval;
  final Offset? position;
  final OrbControlSurface? targetSurface;
  final String? targetAgentId;
  final int targetRevision;

  OrbControlState copyWith({
    OrbControlPresence? presence,
    OrbControlMode? mode,
    OrbControlPanelState? panelState,
    String? statusLine,
    bool? mockRunning,
    bool? controlPaused,
    List<OrbControlEvent>? events,
    List<OrbControlArtifact>? artifacts,
    String? pendingApproval,
    bool clearPendingApproval = false,
    Offset? position,
    OrbControlSurface? targetSurface,
    String? targetAgentId,
    bool clearTarget = false,
    int? targetRevision,
  }) {
    return OrbControlState(
      presence: presence ?? this.presence,
      mode: mode ?? this.mode,
      panelState: panelState ?? this.panelState,
      statusLine: statusLine ?? this.statusLine,
      mockRunning: mockRunning ?? this.mockRunning,
      controlPaused: controlPaused ?? this.controlPaused,
      events: events ?? this.events,
      artifacts: artifacts ?? this.artifacts,
      pendingApproval: clearPendingApproval
          ? null
          : (pendingApproval ?? this.pendingApproval),
      position: position ?? this.position,
      targetSurface: clearTarget ? null : (targetSurface ?? this.targetSurface),
      targetAgentId: clearTarget ? null : (targetAgentId ?? this.targetAgentId),
      targetRevision: targetRevision ?? this.targetRevision,
    );
  }
}

final orbControlControllerProvider =
    NotifierProvider<OrbControlController, OrbControlState>(
      OrbControlController.new,
    );

class OrbControlController extends Notifier<OrbControlState> {
  Timer? _mockTimer;
  int _mockStep = 0;

  @override
  OrbControlState build() {
    ref.onDispose(_cancelMockTimer);
    return const OrbControlState();
  }

  void showTopBarPrompt() {
    _appendEvent(
      kind: OrbControlEventKind.message,
      title: 'Walkthrough offered',
      detail: 'The main agent asked to guide a short local rehearsal.',
    );
    state = state.copyWith(
      presence: OrbControlPresence.topBar,
      mode: OrbControlMode.idle,
      panelState: OrbControlPanelState.minimized,
      statusLine:
          'I can show you the next workflow locally — no backend needed.',
      clearPendingApproval: true,
      clearTarget: true,
    );
  }

  void enterVoiceMode() {
    state = state.copyWith(
      presence: OrbControlPresence.voice,
      mode: OrbControlMode.listening,
      panelState: OrbControlPanelState.minimized,
      statusLine: 'Voice walkthrough active. Drag me if I block the page.',
    );
  }

  void returnToTextMode() {
    state = state.copyWith(
      presence: OrbControlPresence.topBar,
      mode: OrbControlMode.idle,
      panelState: OrbControlPanelState.minimized,
      statusLine: 'Voice paused. I’ll keep guidance in the top bar.',
    );
  }

  void dismiss() {
    _cancelMockTimer();
    state = state.copyWith(
      presence: OrbControlPresence.hidden,
      mode: OrbControlMode.idle,
      panelState: OrbControlPanelState.minimized,
      statusLine: 'Ask the main agent when you want a guided walkthrough.',
      mockRunning: false,
      controlPaused: false,
      clearPendingApproval: true,
      clearTarget: true,
    );
  }

  void togglePanel() {
    state = state.copyWith(
      panelState: state.panelState == OrbControlPanelState.expanded
          ? OrbControlPanelState.minimized
          : OrbControlPanelState.expanded,
    );
  }

  void expandPanel() {
    state = state.copyWith(panelState: OrbControlPanelState.expanded);
  }

  void minimizePanel() {
    state = state.copyWith(panelState: OrbControlPanelState.minimized);
  }

  void updatePosition(Offset position) {
    state = state.copyWith(position: position);
  }

  void startMockSequence() {
    _cancelMockTimer();
    _mockStep = 0;
    state = const OrbControlState(
      presence: OrbControlPresence.topBar,
      mode: OrbControlMode.thinking,
      panelState: OrbControlPanelState.minimized,
      statusLine: 'Planning local control sequence',
      mockRunning: true,
    );
    _advanceMockSequence();
    _mockTimer = Timer.periodic(const Duration(milliseconds: 650), (_) {
      _advanceMockSequence();
    });
  }

  void pauseControl() {
    _cancelMockTimer();
    _appendEvent(
      kind: OrbControlEventKind.control,
      title: 'Control paused',
      detail: 'The user took over. Agent commands will wait.',
    );
    state = state.copyWith(
      mode: OrbControlMode.paused,
      statusLine: 'Paused by user',
      mockRunning: false,
      controlPaused: true,
      clearPendingApproval: true,
      clearTarget: true,
    );
  }

  void resumeControl() {
    _appendEvent(
      kind: OrbControlEventKind.control,
      title: 'Control resumed',
      detail: 'The local harness can continue driving the UI.',
    );
    state = state.copyWith(
      mode: OrbControlMode.idle,
      statusLine: 'Ready to continue',
      controlPaused: false,
    );
  }

  void approvePending() {
    _appendEvent(
      kind: OrbControlEventKind.approval,
      title: 'Approval granted',
      detail: 'The staged webpage publish can proceed.',
    );
    state = state.copyWith(
      mode: OrbControlMode.speaking,
      statusLine: 'Approval captured locally',
      clearPendingApproval: true,
      clearTarget: true,
    );
  }

  void rejectPending() {
    _appendEvent(
      kind: OrbControlEventKind.approval,
      title: 'Approval rejected',
      detail: 'The staged publish was stopped by the user.',
    );
    state = state.copyWith(
      mode: OrbControlMode.paused,
      statusLine: 'Publish stopped',
      clearPendingApproval: true,
      mockRunning: false,
    );
  }

  void applyRealtimeEvent(Map<String, dynamic> event) {
    final type = event['type']?.toString() ?? '';
    final payload = event['payload'];
    final body = payload is Map
        ? Map<String, dynamic>.from(payload)
        : <String, dynamic>{};
    switch (type) {
      case 'client.control.requested':
        _applyClientControlRequested(body);
      case 'browser.control.requested':
        _applyBrowserControlRequested(body);
      case 'user.call.requested':
        final summary = _string(body['summary']) ?? _string(body['body']);
        _appendEvent(
          kind: OrbControlEventKind.message,
          title: _string(body['title']) ?? 'Agent wants to talk',
          detail: summary ?? 'The agent requested a voice conversation.',
        );
        state = state.copyWith(
          presence: OrbControlPresence.topBar,
          mode: OrbControlMode.awaitingApproval,
          panelState: OrbControlPanelState.minimized,
          statusLine: summary == null
              ? 'Agent requested a call'
              : 'Agent requested a call: $summary',
          pendingApproval: summary ?? 'Start voice mode with the agent?',
        );
      case 'user.notification.requested':
        final message = _string(body['body']) ?? _string(body['summary']);
        _appendEvent(
          kind: OrbControlEventKind.message,
          title: _string(body['title']) ?? 'Agent update',
          detail: message ?? 'The agent sent an update.',
        );
        state = state.copyWith(
          presence: OrbControlPresence.topBar,
          mode: OrbControlMode.speaking,
          panelState: OrbControlPanelState.minimized,
          statusLine: message ?? 'Agent sent an update',
        );
      case 'artifact.created':
        final artifact = OrbControlArtifact(
          id:
              _string(body['artifactId']) ??
              'artifact-${DateTime.now().microsecondsSinceEpoch}',
          name: _string(body['name']) ?? 'Generated artifact',
          kind: _string(body['kind']) ?? 'artifact',
          uri: _string(body['previewUrl']) ?? _string(body['uri']) ?? '',
        );
        _appendEvent(
          kind: OrbControlEventKind.artifact,
          title: 'Artifact ready',
          detail: artifact.name,
        );
        state = state.copyWith(
          presence: OrbControlPresence.topBar,
          mode: OrbControlMode.speaking,
          panelState: OrbControlPanelState.minimized,
          statusLine: 'Artifact ready: ${artifact.name}',
          artifacts: [artifact, ...state.artifacts].take(6).toList(),
        );
    }
  }

  void _applyClientControlRequested(Map<String, dynamic> payload) {
    final kind =
        _string(payload['kind']) ?? _string(payload['command']) ?? 'show_page';
    final message = _string(payload['message']) ?? _string(payload['reason']);
    final surface = _surfaceFromPayload(payload);
    final enterVoice = kind == 'enter_voice_mode';
    final exitVoice = kind == 'exit_voice_mode';

    _appendEvent(
      kind: OrbControlEventKind.control,
      title: 'Client control requested',
      detail:
          message ??
          'Requested $kind${surface == null ? '' : ' on ${surface.name}'}',
    );

    if (enterVoice) {
      enterVoiceMode();
      return;
    }
    if (exitVoice) {
      returnToTextMode();
      return;
    }

    state = state.copyWith(
      presence: OrbControlPresence.topBar,
      mode: OrbControlMode.controlling,
      panelState: OrbControlPanelState.minimized,
      statusLine: message ?? 'Agent is guiding the UI',
      targetSurface: surface,
      targetRevision: surface == null
          ? state.targetRevision
          : state.targetRevision + 1,
    );
  }

  void _applyBrowserControlRequested(Map<String, dynamic> payload) {
    final command =
        _string(payload['kind']) ??
        _string(payload['command']) ??
        'browser_action';
    final message = _string(payload['message']) ?? _string(payload['reason']);
    _appendEvent(
      kind: OrbControlEventKind.control,
      title: 'Browser control requested',
      detail: message ?? 'Requested $command in the embedded browser.',
    );
    state = state.copyWith(
      presence: OrbControlPresence.topBar,
      mode: OrbControlMode.controlling,
      panelState: OrbControlPanelState.minimized,
      statusLine: message ?? 'Agent is controlling the browser',
      targetSurface: OrbControlSurface.browser,
      targetRevision: state.targetRevision + 1,
    );
  }

  OrbControlSurface? _surfaceFromPayload(Map<String, dynamic> payload) {
    final raw =
        (_string(payload['surface']) ??
                _string(payload['page']) ??
                _string(payload['target']))
            ?.toLowerCase();
    return switch (raw) {
      'agents' || 'agent' || 'work' || 'workspace' => OrbControlSurface.agents,
      'kanban' || 'board' => OrbControlSurface.kanban,
      'browser' || 'preview' || 'web' => OrbControlSurface.browser,
      'approvals' || 'approval' || 'inbox' => OrbControlSurface.approvals,
      _ => null,
    };
  }

  String? _string(Object? value) {
    if (value is! String) return null;
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  void _advanceMockSequence() {
    if (state.controlPaused) {
      _cancelMockTimer();
      return;
    }

    switch (_mockStep) {
      case 0:
        _appendEvent(
          kind: OrbControlEventKind.message,
          title: 'Main agent is planning',
          detail:
              'Preparing a local UI-control rehearsal without backend calls.',
        );
        state = state.copyWith(
          mode: OrbControlMode.thinking,
          statusLine: 'Thinking through where to take you first…',
          targetSurface: OrbControlSurface.agents,
          targetAgentId: 'agent-exec',
          targetRevision: state.targetRevision + 1,
        );
      case 1:
        _appendEvent(
          kind: OrbControlEventKind.delegation,
          title: 'Opened Kanban',
          detail: 'Moved the UI to the board where delegated WorkItems live.',
        );
        state = state.copyWith(
          mode: OrbControlMode.controlling,
          statusLine: 'Taking you to Kanban to show delegated work',
          targetSurface: OrbControlSurface.kanban,
          targetAgentId: 'agent-builder',
          targetRevision: state.targetRevision + 1,
        );
      case 2:
        final artifact = OrbControlArtifact(
          id: 'artifact-local-review-brief',
          name: 'Review walkthrough brief',
          kind: 'report',
          uri: 'local://artifacts/review-walkthrough-brief.md',
        );
        _appendEvent(
          kind: OrbControlEventKind.artifact,
          title: 'Opened Browser',
          detail:
              'Moved the UI to the preview surface for the staged artifact.',
        );
        state = state.copyWith(
          mode: OrbControlMode.speaking,
          statusLine: 'Opening the preview surface for the local artifact',
          artifacts: [artifact, ...state.artifacts].take(6).toList(),
          targetSurface: OrbControlSurface.browser,
          targetRevision: state.targetRevision + 1,
        );
      case 3:
        _appendEvent(
          kind: OrbControlEventKind.approval,
          title: 'Opened Inbox',
          detail: 'Moved the UI to approvals for the final publish decision.',
        );
        state = state.copyWith(
          mode: OrbControlMode.awaitingApproval,
          statusLine: 'Now I need your approval in the Inbox',
          pendingApproval: 'Publish the staged preview page?',
          targetSurface: OrbControlSurface.approvals,
          targetRevision: state.targetRevision + 1,
        );
      default:
        _cancelMockTimer();
        state = state.copyWith(mockRunning: false);
        return;
    }
    _mockStep += 1;
  }

  void _appendEvent({
    required OrbControlEventKind kind,
    required String title,
    required String detail,
  }) {
    final event = OrbControlEvent(
      id: 'orb-event-${DateTime.now().microsecondsSinceEpoch}',
      kind: kind,
      title: title,
      detail: detail,
      createdAt: DateTime.now(),
    );
    state = state.copyWith(events: [event, ...state.events].take(8).toList());
  }

  void _cancelMockTimer() {
    _mockTimer?.cancel();
    _mockTimer = null;
  }
}

extension OrbControlModeLabel on OrbControlMode {
  String get label => switch (this) {
    OrbControlMode.idle => 'Ready',
    OrbControlMode.listening => 'Listening',
    OrbControlMode.thinking => 'Thinking',
    OrbControlMode.controlling => 'Controlling',
    OrbControlMode.speaking => 'Speaking',
    OrbControlMode.awaitingApproval => 'Awaiting approval',
    OrbControlMode.paused => 'Paused',
    OrbControlMode.error => 'Needs attention',
  };

  AgentOrbState get orbState => switch (this) {
    OrbControlMode.idle => AgentOrbState.idle,
    OrbControlMode.listening => AgentOrbState.listening,
    OrbControlMode.thinking => AgentOrbState.thinking,
    OrbControlMode.controlling => AgentOrbState.thinking,
    OrbControlMode.speaking => AgentOrbState.speaking,
    OrbControlMode.awaitingApproval => AgentOrbState.idle,
    OrbControlMode.paused => AgentOrbState.idle,
    OrbControlMode.error => AgentOrbState.error,
  };
}
