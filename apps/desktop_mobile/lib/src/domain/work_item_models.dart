enum WorkItemStatus { intake, planning, running, needsReview, blocked, done }

enum WorkItemPriority { urgent, high, normal, low }

enum WorkItemRunStatus { queued, running, succeeded, failed, cancelled }

enum WorkItemEventTone { neutral, active, success, warning, danger }

enum WorkItemArtifactKind { report, dashboard, preview, dataset, document }

enum WorkItemArtifactState { ready, draft, blocked }

enum WorkItemApprovalDecision { pending, approved, rejected }

enum WorkItemSurfaceKind { dashboard, report, tracker, table }

enum WorkItemSurfaceValidation { serverValidated, unvalidated }

extension WorkItemStatusLabel on WorkItemStatus {
  String get label => switch (this) {
    WorkItemStatus.intake => 'Intake',
    WorkItemStatus.planning => 'Planning',
    WorkItemStatus.running => 'In progress',
    WorkItemStatus.needsReview => 'Needs review',
    WorkItemStatus.blocked => 'Blocked',
    WorkItemStatus.done => 'Done',
  };
}

extension WorkItemPriorityLabel on WorkItemPriority {
  String get label => switch (this) {
    WorkItemPriority.urgent => 'Urgent',
    WorkItemPriority.high => 'High',
    WorkItemPriority.normal => 'Normal',
    WorkItemPriority.low => 'Low',
  };

  int get rank => switch (this) {
    WorkItemPriority.urgent => 0,
    WorkItemPriority.high => 1,
    WorkItemPriority.normal => 2,
    WorkItemPriority.low => 3,
  };
}

extension WorkItemStatusRank on WorkItemStatus {
  int get rank => switch (this) {
    WorkItemStatus.needsReview => 0,
    WorkItemStatus.blocked => 1,
    WorkItemStatus.running => 2,
    WorkItemStatus.planning => 3,
    WorkItemStatus.intake => 4,
    WorkItemStatus.done => 5,
  };
}

class WorkItemRunSummary {
  const WorkItemRunSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.owner,
    required this.updatedAtLabel,
  });

  final String id;
  final String title;
  final WorkItemRunStatus status;
  final String owner;
  final String updatedAtLabel;

  bool get isActive => switch (status) {
    WorkItemRunStatus.queued || WorkItemRunStatus.running => true,
    _ => false,
  };
}

class WorkItemEventSummary {
  const WorkItemEventSummary({
    required this.id,
    required this.label,
    required this.detail,
    required this.atLabel,
    required this.tone,
  });

  final String id;
  final String label;
  final String detail;
  final String atLabel;
  final WorkItemEventTone tone;
}

class WorkItemArtifactSummary {
  const WorkItemArtifactSummary({
    required this.id,
    required this.name,
    required this.kind,
    required this.state,
    required this.updatedAtLabel,
  });

  final String id;
  final String name;
  final WorkItemArtifactKind kind;
  final WorkItemArtifactState state;
  final String updatedAtLabel;
}

class WorkItemApprovalSummary {
  const WorkItemApprovalSummary({
    required this.id,
    required this.title,
    required this.decision,
    required this.owner,
    required this.dueLabel,
  });

  final String id;
  final String title;
  final WorkItemApprovalDecision decision;
  final String owner;
  final String dueLabel;

  bool get isPending => decision == WorkItemApprovalDecision.pending;
}

class WorkItemSurfaceSummary {
  const WorkItemSurfaceSummary({
    required this.id,
    required this.title,
    required this.kind,
    required this.validation,
    required this.componentCount,
    required this.dataSources,
    required this.updatedAtLabel,
  });

  final String id;
  final String title;
  final WorkItemSurfaceKind kind;
  final WorkItemSurfaceValidation validation;
  final int componentCount;
  final List<String> dataSources;
  final String updatedAtLabel;

  bool get isTrustedForPreview =>
      validation == WorkItemSurfaceValidation.serverValidated;
}

class WorkItem {
  const WorkItem({
    required this.id,
    required this.title,
    required this.objective,
    required this.status,
    required this.priority,
    required this.owner,
    required this.updatedAtLabel,
    required this.nextAction,
    required this.runs,
    required this.events,
    required this.artifacts,
    required this.approvals,
    required this.surfaces,
  });

  final String id;
  final String title;
  final String objective;
  final WorkItemStatus status;
  final WorkItemPriority priority;
  final String owner;
  final String updatedAtLabel;
  final String nextAction;
  final List<WorkItemRunSummary> runs;
  final List<WorkItemEventSummary> events;
  final List<WorkItemArtifactSummary> artifacts;
  final List<WorkItemApprovalSummary> approvals;
  final List<WorkItemSurfaceSummary> surfaces;

  WorkItemSummary get summary => WorkItemSummary.fromWorkItem(this);

  List<WorkItemSurfaceSummary> get validatedSurfaces => surfaces
      .where((surface) => surface.isTrustedForPreview)
      .toList(growable: false);

  WorkItem copyWith({
    String? id,
    String? title,
    String? objective,
    WorkItemStatus? status,
    WorkItemPriority? priority,
    String? owner,
    String? updatedAtLabel,
    String? nextAction,
    List<WorkItemRunSummary>? runs,
    List<WorkItemEventSummary>? events,
    List<WorkItemArtifactSummary>? artifacts,
    List<WorkItemApprovalSummary>? approvals,
    List<WorkItemSurfaceSummary>? surfaces,
  }) {
    return WorkItem(
      id: id ?? this.id,
      title: title ?? this.title,
      objective: objective ?? this.objective,
      status: status ?? this.status,
      priority: priority ?? this.priority,
      owner: owner ?? this.owner,
      updatedAtLabel: updatedAtLabel ?? this.updatedAtLabel,
      nextAction: nextAction ?? this.nextAction,
      runs: runs ?? this.runs,
      events: events ?? this.events,
      artifacts: artifacts ?? this.artifacts,
      approvals: approvals ?? this.approvals,
      surfaces: surfaces ?? this.surfaces,
    );
  }

  factory WorkItem.fixturePricingTracker() {
    return const WorkItem(
      id: 'work_competitor_pricing',
      title: 'Track competitor pricing',
      objective:
          'Monitor three competitors weekly, summarize pricing changes, and generate a review-ready dashboard.',
      status: WorkItemStatus.needsReview,
      priority: WorkItemPriority.urgent,
      owner: 'Executive agent',
      updatedAtLabel: '4 min ago',
      nextAction: 'Review dashboard and approve weekly monitoring',
      runs: [
        WorkItemRunSummary(
          id: 'run_pricing_003',
          title: 'Generate latest pricing dashboard',
          status: WorkItemRunStatus.running,
          owner: 'Research + Builder',
          updatedAtLabel: '4 min ago',
        ),
        WorkItemRunSummary(
          id: 'run_pricing_002',
          title: 'Normalize competitor price table',
          status: WorkItemRunStatus.succeeded,
          owner: 'Research',
          updatedAtLabel: '22 min ago',
        ),
        WorkItemRunSummary(
          id: 'run_pricing_001',
          title: 'Collect competitor pages',
          status: WorkItemRunStatus.succeeded,
          owner: 'Research',
          updatedAtLabel: '41 min ago',
        ),
      ],
      events: [
        WorkItemEventSummary(
          id: 'evt_dashboard',
          label: 'Dashboard generated',
          detail:
              'The tracker surface has cards for price deltas, source links, and anomalies.',
          atLabel: '4 min ago',
          tone: WorkItemEventTone.success,
        ),
        WorkItemEventSummary(
          id: 'evt_approval',
          label: 'Approval requested',
          detail:
              'Weekly monitoring needs confirmation before recurring checks are enabled.',
          atLabel: '5 min ago',
          tone: WorkItemEventTone.warning,
        ),
        WorkItemEventSummary(
          id: 'evt_dataset',
          label: 'Data normalized',
          detail:
              '24 price points mapped across plan, SKU, market, and source URL.',
          atLabel: '22 min ago',
          tone: WorkItemEventTone.active,
        ),
      ],
      artifacts: [
        WorkItemArtifactSummary(
          id: 'artifact_pricing_report',
          name: 'Competitor pricing report',
          kind: WorkItemArtifactKind.report,
          state: WorkItemArtifactState.ready,
          updatedAtLabel: '4 min ago',
        ),
        WorkItemArtifactSummary(
          id: 'artifact_pricing_dashboard',
          name: 'Pricing monitor dashboard',
          kind: WorkItemArtifactKind.dashboard,
          state: WorkItemArtifactState.ready,
          updatedAtLabel: '4 min ago',
        ),
        WorkItemArtifactSummary(
          id: 'artifact_pricing_dataset',
          name: 'Normalized price table',
          kind: WorkItemArtifactKind.dataset,
          state: WorkItemArtifactState.ready,
          updatedAtLabel: '22 min ago',
        ),
        WorkItemArtifactSummary(
          id: 'artifact_pricing_sources',
          name: 'Source capture bundle',
          kind: WorkItemArtifactKind.document,
          state: WorkItemArtifactState.ready,
          updatedAtLabel: '41 min ago',
        ),
      ],
      approvals: [
        WorkItemApprovalSummary(
          id: 'approval_monitoring',
          title: 'Enable weekly monitoring',
          decision: WorkItemApprovalDecision.pending,
          owner: 'CEO',
          dueLabel: 'Today',
        ),
      ],
      surfaces: [
        WorkItemSurfaceSummary(
          id: 'surface_pricing_dashboard',
          title: 'Pricing monitor',
          kind: WorkItemSurfaceKind.dashboard,
          validation: WorkItemSurfaceValidation.serverValidated,
          componentCount: 8,
          dataSources: ['artifact-ref', 'inline-data'],
          updatedAtLabel: '4 min ago',
        ),
        WorkItemSurfaceSummary(
          id: 'surface_pricing_table',
          title: 'Competitor table',
          kind: WorkItemSurfaceKind.table,
          validation: WorkItemSurfaceValidation.serverValidated,
          componentCount: 3,
          dataSources: ['artifact-ref'],
          updatedAtLabel: '22 min ago',
        ),
      ],
    );
  }
}

class WorkItemSummary {
  const WorkItemSummary({
    required this.id,
    required this.title,
    required this.statusLabel,
    required this.priorityLabel,
    required this.activeRunCount,
    required this.totalRunCount,
    required this.artifactCount,
    required this.pendingApprovalCount,
    required this.validatedSurfaceCount,
    required this.runSummary,
    required this.surfaceSummary,
  });

  final String id;
  final String title;
  final String statusLabel;
  final String priorityLabel;
  final int activeRunCount;
  final int totalRunCount;
  final int artifactCount;
  final int pendingApprovalCount;
  final int validatedSurfaceCount;
  final String runSummary;
  final String surfaceSummary;

  factory WorkItemSummary.fromWorkItem(WorkItem item) {
    final activeRunCount = item.runs.where((run) => run.isActive).length;
    final pendingApprovalCount = item.approvals
        .where((approval) => approval.isPending)
        .length;
    final validatedSurfaceCount = item.validatedSurfaces.length;

    return WorkItemSummary(
      id: item.id,
      title: item.title,
      statusLabel: item.status.label,
      priorityLabel: item.priority.label,
      activeRunCount: activeRunCount,
      totalRunCount: item.runs.length,
      artifactCount: item.artifacts.length,
      pendingApprovalCount: pendingApprovalCount,
      validatedSurfaceCount: validatedSurfaceCount,
      runSummary: '$activeRunCount active / ${item.runs.length} total',
      surfaceSummary:
          '$validatedSurfaceCount generated ${validatedSurfaceCount == 1 ? 'surface' : 'surfaces'}',
    );
  }
}

class WorkItemsViewState {
  const WorkItemsViewState._(this.kind, {this.message, this.lastUpdatedLabel});

  const WorkItemsViewState.loading() : this._(WorkItemsViewStateKind.loading);
  const WorkItemsViewState.empty() : this._(WorkItemsViewStateKind.empty);
  const WorkItemsViewState.denied(String message)
    : this._(WorkItemsViewStateKind.denied, message: message);
  const WorkItemsViewState.offline() : this._(WorkItemsViewStateKind.offline);
  const WorkItemsViewState.stale({required String lastUpdatedLabel})
    : this._(WorkItemsViewStateKind.stale, lastUpdatedLabel: lastUpdatedLabel);
  const WorkItemsViewState.ready() : this._(WorkItemsViewStateKind.ready);

  final WorkItemsViewStateKind kind;
  final String? message;
  final String? lastUpdatedLabel;

  String get label => switch (kind) {
    WorkItemsViewStateKind.loading => 'Loading work items…',
    WorkItemsViewStateKind.empty => 'No delegated work yet.',
    WorkItemsViewStateKind.denied => message ?? 'Workspace access required.',
    WorkItemsViewStateKind.offline =>
      'Backend unavailable; showing local fixtures only.',
    WorkItemsViewStateKind.stale =>
      'Last saved update was ${lastUpdatedLabel ?? 'unknown'}',
    WorkItemsViewStateKind.ready => 'Work ledger ready',
  };
}

enum WorkItemsViewStateKind { loading, empty, denied, offline, stale, ready }
