import '../domain/work_item_models.dart';

abstract class WorkRepository {
  Future<List<WorkItem>> listWorkItems();
  Future<WorkItem?> getWorkItem(String id);
}

class FixtureWorkRepository implements WorkRepository {
  FixtureWorkRepository({List<WorkItem>? seedItems})
    : _items = List.unmodifiable(seedItems ?? _defaultItems);

  final List<WorkItem> _items;

  @override
  Future<List<WorkItem>> listWorkItems() async {
    final sorted = [..._items]
      ..sort((left, right) {
        final priorityDelta = left.priority.rank - right.priority.rank;
        if (priorityDelta != 0) return priorityDelta;
        final statusDelta = left.status.rank - right.status.rank;
        if (statusDelta != 0) return statusDelta;
        return left.title.compareTo(right.title);
      });
    return List.unmodifiable(sorted);
  }

  @override
  Future<WorkItem?> getWorkItem(String id) async {
    for (final item in _items) {
      if (item.id == id) return item;
    }
    return null;
  }
}

final List<WorkItem> _defaultItems = [
  WorkItem.fixturePricingTracker(),
  const WorkItem(
    id: 'work_launch_preview',
    title: 'Prepare launch preview site',
    objective:
        'Create a stakeholder-ready launch preview with product narrative, screenshots, and a review checklist.',
    status: WorkItemStatus.running,
    priority: WorkItemPriority.high,
    owner: 'Builder agent',
    updatedAtLabel: '12 min ago',
    nextAction: 'Wait for preview artifact and copy review',
    runs: [
      WorkItemRunSummary(
        id: 'run_preview_002',
        title: 'Build static preview',
        status: WorkItemRunStatus.running,
        owner: 'Builder',
        updatedAtLabel: '12 min ago',
      ),
      WorkItemRunSummary(
        id: 'run_preview_001',
        title: 'Draft launch narrative',
        status: WorkItemRunStatus.succeeded,
        owner: 'Writer',
        updatedAtLabel: '35 min ago',
      ),
    ],
    events: [
      WorkItemEventSummary(
        id: 'evt_preview_build',
        label: 'Preview build started',
        detail: 'Builder is assembling static pages and artifact metadata.',
        atLabel: '12 min ago',
        tone: WorkItemEventTone.active,
      ),
      WorkItemEventSummary(
        id: 'evt_copy_ready',
        label: 'Narrative draft ready',
        detail: 'Messaging has first-pass positioning and user outcomes.',
        atLabel: '35 min ago',
        tone: WorkItemEventTone.success,
      ),
    ],
    artifacts: [
      WorkItemArtifactSummary(
        id: 'artifact_launch_copy',
        name: 'Launch narrative',
        kind: WorkItemArtifactKind.document,
        state: WorkItemArtifactState.ready,
        updatedAtLabel: '35 min ago',
      ),
      WorkItemArtifactSummary(
        id: 'artifact_preview_site',
        name: 'Preview website',
        kind: WorkItemArtifactKind.preview,
        state: WorkItemArtifactState.draft,
        updatedAtLabel: '12 min ago',
      ),
    ],
    approvals: [],
    surfaces: [
      WorkItemSurfaceSummary(
        id: 'surface_launch_review',
        title: 'Launch review checklist',
        kind: WorkItemSurfaceKind.report,
        validation: WorkItemSurfaceValidation.serverValidated,
        componentCount: 4,
        dataSources: ['inline-data'],
        updatedAtLabel: '35 min ago',
      ),
    ],
  ),
  const WorkItem(
    id: 'work_miro_research',
    title: 'Research Miro collaboration surface',
    objective:
        'Assess collaboration options and recommend safe integration boundaries for external board workflows.',
    status: WorkItemStatus.blocked,
    priority: WorkItemPriority.normal,
    owner: 'Product agent',
    updatedAtLabel: '28 min ago',
    nextAction: 'Confirm credential policy before OAuth/MCP integration',
    runs: [
      WorkItemRunSummary(
        id: 'run_miro_001',
        title: 'Audit Miro integration paths',
        status: WorkItemRunStatus.succeeded,
        owner: 'Research',
        updatedAtLabel: '28 min ago',
      ),
    ],
    events: [
      WorkItemEventSummary(
        id: 'evt_miro_policy',
        label: 'Credential decision needed',
        detail:
            'Research recommends brokered scoped auth before any live integration.',
        atLabel: '28 min ago',
        tone: WorkItemEventTone.warning,
      ),
    ],
    artifacts: [
      WorkItemArtifactSummary(
        id: 'artifact_miro_audit',
        name: 'Miro integration audit',
        kind: WorkItemArtifactKind.report,
        state: WorkItemArtifactState.ready,
        updatedAtLabel: '28 min ago',
      ),
    ],
    approvals: [
      WorkItemApprovalSummary(
        id: 'approval_miro_scope',
        title: 'Approve Miro auth policy',
        decision: WorkItemApprovalDecision.pending,
        owner: 'Platform owner',
        dueLabel: 'Before integration',
      ),
    ],
    surfaces: [],
  ),
];
