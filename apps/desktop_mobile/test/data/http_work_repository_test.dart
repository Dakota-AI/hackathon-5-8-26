import 'package:desktop_mobile/src/api/control_api.dart';
import 'package:desktop_mobile/src/data/http_work_repository.dart';
import 'package:desktop_mobile/src/domain/work_item_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

class _FakeControlApi implements ControlApi {
  _FakeControlApi({
    required this.workItems,
    required this.detail,
    this.runs = const [],
    this.events = const [],
    this.artifacts = const [],
    this.downloadResponse,
  });

  final List<Map<String, dynamic>> workItems;
  final Map<String, dynamic> detail;
  final List<Map<String, dynamic>> runs;
  final List<Map<String, dynamic>> events;
  final List<Map<String, dynamic>> artifacts;
  final Map<String, dynamic>? downloadResponse;

  @override
  Future<List<Map<String, dynamic>>> listWorkItems({String? workspaceId}) async =>
      workItems;

  @override
  Future<Map<String, dynamic>> getWorkItem(String id) async => detail;

  @override
  Future<List<Map<String, dynamic>>> listRuns(String workItemId) async => runs;

  @override
  Future<List<Map<String, dynamic>>> listEvents(String workItemId) async =>
      events;

  @override
  Future<List<Map<String, dynamic>>> listArtifacts(String workItemId) async =>
      artifacts;

  @override
  Future<Map<String, dynamic>> getArtifactDownload({
    required String runId,
    required String artifactId,
  }) async => downloadResponse ?? const {};

  // Unused in these tests.
  @override
  Future<Map<String, dynamic>> createWorkItem({
    required String workspaceId,
    required String title,
    String? objective,
  }) => throw UnimplementedError();

  @override
  Future<Map<String, dynamic>> updateWorkItemStatus(String id, String status) =>
      throw UnimplementedError();

  @override
  Future<Map<String, dynamic>> startRun({
    required String workItemId,
    required String workspaceId,
    required String objective,
  }) => throw UnimplementedError();

  @override
  noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('HttpWorkRepository', () {
    test('listWorkItems decodes API JSON into domain models', () async {
      final api = _FakeControlApi(
        workItems: [
          {
            'id': 'wi_1',
            'title': 'Track competitor pricing',
            'objective': 'Monitor three competitors weekly.',
            'status': 'needs_review',
            'priority': 'urgent',
            'owner': 'Executive agent',
            'updatedAtLabel': '4 min ago',
            'nextAction': 'Review dashboard',
            'runs': [
              {
                'id': 'run_1',
                'title': 'Run 1',
                'status': 'running',
                'owner': 'Research',
                'updatedAtLabel': '4 min ago',
              },
            ],
            'artifacts': [
              {
                'id': 'art_1',
                'name': 'Pricing report',
                'kind': 'report',
                'state': 'ready',
                'updatedAtLabel': '4 min ago',
                'runId': 'run_1',
              },
            ],
            'approvals': [],
            'events': [],
            'surfaces': [],
          },
        ],
        detail: const {},
      );
      final repo = HttpWorkRepository(api: api);
      final items = await repo.listWorkItems();

      expect(items, hasLength(1));
      final item = items.first;
      expect(item.id, 'wi_1');
      expect(item.title, 'Track competitor pricing');
      expect(item.status, WorkItemStatus.needsReview);
      expect(item.priority, WorkItemPriority.urgent);
      expect(item.runs, hasLength(1));
      expect(item.runs.first.status, WorkItemRunStatus.running);
      expect(item.artifacts, hasLength(1));
      expect(item.artifacts.first.kind, WorkItemArtifactKind.report);
      expect(item.artifacts.first.state, WorkItemArtifactState.ready);
      expect(item.artifacts.first.runId, 'run_1');
    });

    test('getWorkItem merges runs/events/artifacts side endpoints', () async {
      final api = _FakeControlApi(
        workItems: const [],
        detail: {
          'id': 'wi_2',
          'title': 'Build preview',
          'objective': 'Stakeholder preview',
          'status': 'running',
          'priority': 'high',
          'owner': 'Builder',
          'updatedAtLabel': '12 min ago',
          'nextAction': 'Wait for build',
        },
        runs: [
          {
            'id': 'run_a',
            'title': 'Build',
            'status': 'succeeded',
            'owner': 'Builder',
            'updatedAtLabel': '1m',
          },
        ],
        events: [
          {
            'id': 'evt_a',
            'label': 'Started',
            'detail': 'Build started',
            'atLabel': '1m',
            'tone': 'active',
          },
        ],
        artifacts: [
          {
            'id': 'art_a',
            'name': 'Preview',
            'kind': 'preview',
            'state': 'draft',
            'updatedAtLabel': '1m',
            'runId': 'run_a',
          },
        ],
      );
      final repo = HttpWorkRepository(api: api);
      final item = await repo.getWorkItem('wi_2');

      expect(item, isNotNull);
      expect(item!.id, 'wi_2');
      expect(item.status, WorkItemStatus.running);
      expect(item.runs.single.status, WorkItemRunStatus.succeeded);
      expect(item.events.single.tone, WorkItemEventTone.active);
      expect(item.artifacts.single.kind, WorkItemArtifactKind.preview);
      expect(item.artifacts.single.state, WorkItemArtifactState.draft);
    });

    test('falls back to fixture repository on API failure', () async {
      // Real ControlApi will fail because no idToken/network in test env.
      final api = ControlApi(http.Client(), () async => null);
      final repo = HttpWorkRepository(api: api);
      final items = await repo.listWorkItems();
      expect(items, isNotEmpty, reason: 'Should fall back to fixture data.');
    });
  });
}
