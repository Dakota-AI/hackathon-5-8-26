import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/control_api.dart';
import '../auth/auth_controller.dart';
import '../domain/work_item_models.dart';
import 'fixture_work_repository.dart';

/// Real HTTP-backed [WorkRepository] that delegates to [ControlApi].
///
/// On any failure (unauthenticated, network, parse), it falls back to
/// [FixtureWorkRepository] so the UI still renders something useful.
class HttpWorkRepository implements WorkRepository {
  HttpWorkRepository({required ControlApi api, WorkRepository? fallback})
    : _api = api,
      _fallback = fallback ?? FixtureWorkRepository();

  final ControlApi _api;
  final WorkRepository _fallback;

  @override
  Future<List<WorkItem>> listWorkItems() async {
    try {
      final raw = await _api.listWorkItems();
      final items = <WorkItem>[];
      for (final json in raw) {
        items.add(_decodeWorkItem(json));
      }
      return List.unmodifiable(items);
    } catch (_) {
      return _fallback.listWorkItems();
    }
  }

  @override
  Future<WorkItem?> getWorkItem(String id) async {
    try {
      final json = await _api.getWorkItem(id);
      if (json.isEmpty) return _fallback.getWorkItem(id);

      List<Map<String, dynamic>> runs = const [];
      List<Map<String, dynamic>> events = const [];
      List<Map<String, dynamic>> artifacts = const [];
      try {
        runs = await _api.listRuns(id);
      } catch (_) {}
      try {
        events = await _api.listEvents(id);
      } catch (_) {}
      try {
        artifacts = await _api.listArtifacts(id);
      } catch (_) {}

      return _decodeWorkItem(
        json,
        runsOverride: runs,
        eventsOverride: events,
        artifactsOverride: artifacts,
      );
    } catch (_) {
      return _fallback.getWorkItem(id);
    }
  }

  // ---- Decoding helpers (visible for testing) -------------------------------

  static WorkItem decodeWorkItem(Map<String, dynamic> json) =>
      _decodeWorkItem(json);

  static WorkItem _decodeWorkItem(
    Map<String, dynamic> json, {
    List<Map<String, dynamic>>? runsOverride,
    List<Map<String, dynamic>>? eventsOverride,
    List<Map<String, dynamic>>? artifactsOverride,
  }) {
    final runs = runsOverride ?? _asListOf(json, 'runs');
    final events = eventsOverride ?? _asListOf(json, 'events');
    final artifacts = artifactsOverride ?? _asListOf(json, 'artifacts');
    final approvals = _asListOf(json, 'approvals');
    final surfaces = _asListOf(json, 'surfaces');

    return WorkItem(
      id: _str(json['id'] ?? json['workItemId']) ?? 'unknown',
      title: _str(json['title']) ?? 'Untitled work item',
      objective: _str(json['objective']) ?? '',
      status: _decodeStatus(_str(json['status'])),
      priority: _decodePriority(_str(json['priority'])),
      owner: _str(json['owner']) ?? _str(json['assignee']) ?? 'Unassigned',
      updatedAtLabel:
          _str(json['updatedAtLabel']) ?? _str(json['updatedAt']) ?? '',
      nextAction: _str(json['nextAction']) ?? '',
      runs: runs.map(_decodeRun).toList(growable: false),
      events: events.map(_decodeEvent).toList(growable: false),
      artifacts: artifacts.map(_decodeArtifact).toList(growable: false),
      approvals: approvals.map(_decodeApproval).toList(growable: false),
      surfaces: surfaces.map(_decodeSurface).toList(growable: false),
    );
  }

  static List<Map<String, dynamic>> _asListOf(
    Map<String, dynamic> json,
    String key,
  ) {
    final v = json[key];
    if (v is List) {
      return v.whereType<Map<String, dynamic>>().toList();
    }
    return const <Map<String, dynamic>>[];
  }

  static String? _str(Object? v) {
    if (v == null) return null;
    if (v is String) return v;
    return v.toString();
  }

  static WorkItemStatus _decodeStatus(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'planning':
        return WorkItemStatus.planning;
      case 'running':
      case 'in_progress':
      case 'in-progress':
        return WorkItemStatus.running;
      case 'needs_review':
      case 'needsreview':
      case 'needs-review':
      case 'review':
        return WorkItemStatus.needsReview;
      case 'blocked':
        return WorkItemStatus.blocked;
      case 'done':
      case 'completed':
      case 'succeeded':
        return WorkItemStatus.done;
      case 'intake':
      default:
        return WorkItemStatus.intake;
    }
  }

  static WorkItemPriority _decodePriority(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'urgent':
      case 'p0':
        return WorkItemPriority.urgent;
      case 'high':
      case 'p1':
        return WorkItemPriority.high;
      case 'low':
      case 'p3':
        return WorkItemPriority.low;
      case 'normal':
      case 'medium':
      case 'p2':
      default:
        return WorkItemPriority.normal;
    }
  }

  static WorkItemRunStatus _decodeRunStatus(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'queued':
      case 'pending':
        return WorkItemRunStatus.queued;
      case 'running':
      case 'in_progress':
        return WorkItemRunStatus.running;
      case 'succeeded':
      case 'success':
      case 'completed':
        return WorkItemRunStatus.succeeded;
      case 'failed':
      case 'error':
        return WorkItemRunStatus.failed;
      case 'cancelled':
      case 'canceled':
        return WorkItemRunStatus.cancelled;
      default:
        return WorkItemRunStatus.queued;
    }
  }

  static WorkItemEventTone _decodeEventTone(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'success':
        return WorkItemEventTone.success;
      case 'warning':
      case 'warn':
        return WorkItemEventTone.warning;
      case 'danger':
      case 'error':
        return WorkItemEventTone.danger;
      case 'active':
      case 'in_progress':
        return WorkItemEventTone.active;
      default:
        return WorkItemEventTone.neutral;
    }
  }

  static WorkItemArtifactKind _decodeArtifactKind(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'dashboard':
        return WorkItemArtifactKind.dashboard;
      case 'preview':
      case 'site':
      case 'web':
        return WorkItemArtifactKind.preview;
      case 'dataset':
      case 'data':
        return WorkItemArtifactKind.dataset;
      case 'document':
      case 'doc':
        return WorkItemArtifactKind.document;
      case 'report':
      default:
        return WorkItemArtifactKind.report;
    }
  }

  static WorkItemArtifactState _decodeArtifactState(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'draft':
        return WorkItemArtifactState.draft;
      case 'blocked':
        return WorkItemArtifactState.blocked;
      case 'ready':
      default:
        return WorkItemArtifactState.ready;
    }
  }

  static WorkItemApprovalDecision _decodeDecision(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'approved':
        return WorkItemApprovalDecision.approved;
      case 'rejected':
      case 'denied':
        return WorkItemApprovalDecision.rejected;
      default:
        return WorkItemApprovalDecision.pending;
    }
  }

  static WorkItemSurfaceKind _decodeSurfaceKind(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'report':
        return WorkItemSurfaceKind.report;
      case 'tracker':
        return WorkItemSurfaceKind.tracker;
      case 'table':
        return WorkItemSurfaceKind.table;
      case 'dashboard':
      default:
        return WorkItemSurfaceKind.dashboard;
    }
  }

  static WorkItemSurfaceValidation _decodeValidation(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'unvalidated':
      case 'untrusted':
        return WorkItemSurfaceValidation.unvalidated;
      case 'server_validated':
      case 'server-validated':
      case 'validated':
      default:
        return WorkItemSurfaceValidation.serverValidated;
    }
  }

  static WorkItemRunSummary _decodeRun(Map<String, dynamic> json) {
    return WorkItemRunSummary(
      id: _str(json['id'] ?? json['runId']) ?? 'run',
      title: _str(json['title']) ?? _str(json['objective']) ?? 'Run',
      status: _decodeRunStatus(_str(json['status'])),
      owner: _str(json['owner']) ?? _str(json['agent']) ?? '',
      updatedAtLabel:
          _str(json['updatedAtLabel']) ?? _str(json['updatedAt']) ?? '',
    );
  }

  static WorkItemEventSummary _decodeEvent(Map<String, dynamic> json) {
    return WorkItemEventSummary(
      id: _str(json['id'] ?? json['eventId']) ?? 'evt',
      label: _str(json['label']) ?? _str(json['type']) ?? 'Event',
      detail: _str(json['detail']) ?? _str(json['message']) ?? '',
      atLabel: _str(json['atLabel']) ?? _str(json['at']) ?? '',
      tone: _decodeEventTone(_str(json['tone'])),
    );
  }

  static WorkItemArtifactSummary _decodeArtifact(Map<String, dynamic> json) {
    return WorkItemArtifactSummary(
      id: _str(json['id'] ?? json['artifactId']) ?? 'artifact',
      name: _str(json['name']) ?? _str(json['title']) ?? 'Artifact',
      kind: _decodeArtifactKind(_str(json['kind'] ?? json['type'])),
      state: _decodeArtifactState(_str(json['state'] ?? json['status'])),
      updatedAtLabel:
          _str(json['updatedAtLabel']) ?? _str(json['updatedAt']) ?? '',
      runId: _str(json['runId']),
    );
  }

  static WorkItemApprovalSummary _decodeApproval(Map<String, dynamic> json) {
    return WorkItemApprovalSummary(
      id: _str(json['id'] ?? json['approvalId']) ?? 'approval',
      title: _str(json['title']) ?? 'Approval',
      decision: _decodeDecision(_str(json['decision'] ?? json['status'])),
      owner: _str(json['owner']) ?? '',
      dueLabel: _str(json['dueLabel']) ?? _str(json['due']) ?? '',
    );
  }

  static WorkItemSurfaceSummary _decodeSurface(Map<String, dynamic> json) {
    final sources = json['dataSources'];
    final sourceList = sources is List
        ? sources.map((e) => e.toString()).toList(growable: false)
        : const <String>[];
    return WorkItemSurfaceSummary(
      id: _str(json['id'] ?? json['surfaceId']) ?? 'surface',
      title: _str(json['title']) ?? 'Surface',
      kind: _decodeSurfaceKind(_str(json['kind'])),
      validation: _decodeValidation(_str(json['validation'])),
      componentCount: (json['componentCount'] is num)
          ? (json['componentCount'] as num).toInt()
          : 0,
      dataSources: sourceList,
      updatedAtLabel:
          _str(json['updatedAtLabel']) ?? _str(json['updatedAt']) ?? '',
    );
  }
}

/// Provider that returns an [HttpWorkRepository] when the user is signed in,
/// or a [FixtureWorkRepository] fallback otherwise. The repository itself
/// also internally falls back to fixtures on per-call failures.
final workRepositoryProvider = Provider<WorkRepository>((ref) {
  final auth = ref.watch(authControllerProvider);
  if (auth.status == AuthStatus.signedIn) {
    final api = ref.watch(controlApiProvider);
    return HttpWorkRepository(api: api);
  }
  return FixtureWorkRepository();
});
