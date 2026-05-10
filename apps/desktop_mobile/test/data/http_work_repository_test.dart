import 'package:desktop_mobile/src/api/control_api.dart';
import 'package:desktop_mobile/src/data/fixture_work_repository.dart';
import 'package:desktop_mobile/src/data/http_work_repository.dart';
import 'package:desktop_mobile/src/domain/work_item_models.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeControlApi implements ControlApi {
  _FakeControlApi({
    this.workItems = const [],
    this.detail = const {},
    this.runs = const [],
    this.events = const [],
    this.artifacts = const [],
    this.downloadResponse,
    this.listWorkItemsThrows,
    this.getWorkItemThrows,
    this.runsThrows,
  });

  final List<Map<String, dynamic>> workItems;
  final Map<String, dynamic> detail;
  final List<Map<String, dynamic>> runs;
  final List<Map<String, dynamic>> events;
  final List<Map<String, dynamic>> artifacts;
  final Map<String, dynamic>? downloadResponse;
  final Object? listWorkItemsThrows;
  final Object? getWorkItemThrows;
  final Object? runsThrows;

  @override
  Future<List<Map<String, dynamic>>> listWorkItems({String? workspaceId}) async {
    if (listWorkItemsThrows != null) throw listWorkItemsThrows!;
    return workItems;
  }

  @override
  Future<Map<String, dynamic>> getWorkItem(String id) async {
    if (getWorkItemThrows != null) throw getWorkItemThrows!;
    return detail;
  }

  @override
  Future<List<Map<String, dynamic>>> listRuns(String workItemId) async {
    if (runsThrows != null) throw runsThrows!;
    return runs;
  }

  @override
  Future<List<Map<String, dynamic>>> listEvents(String workItemId) async => events;

  @override
  Future<List<Map<String, dynamic>>> listArtifacts(String workItemId) async => artifacts;

  @override
  Future<Map<String, dynamic>> getArtifactDownload({
    required String runId,
    required String artifactId,
  }) async => downloadResponse ?? const {};

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
  group('HttpWorkRepository decoding', () {
    test('decodes API JSON into domain models with runId on artifacts', () async {
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
      );
      final items = await HttpWorkRepository(api: api).listWorkItems();
      expect(items, hasLength(1));
      final item = items.first;
      expect(item.id, 'wi_1');
      expect(item.status, WorkItemStatus.needsReview);
      expect(item.priority, WorkItemPriority.urgent);
      expect(item.runs.first.status, WorkItemRunStatus.running);
      expect(item.artifacts.first.runId, 'run_1');
    });

    test('getWorkItem merges runs/events/artifacts side endpoints', () async {
      final api = _FakeControlApi(
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
          {'id': 'run_a', 'title': 'Build', 'status': 'succeeded', 'owner': 'Builder', 'updatedAtLabel': '1m'},
        ],
        events: [
          {'id': 'evt_a', 'label': 'Started', 'detail': 'Build started', 'atLabel': '1m', 'tone': 'active'},
        ],
        artifacts: [
          {'id': 'art_a', 'name': 'Preview', 'kind': 'preview', 'state': 'draft', 'updatedAtLabel': '1m', 'runId': 'run_a'},
        ],
      );
      final item = await HttpWorkRepository(api: api).getWorkItem('wi_2');
      expect(item, isNotNull);
      expect(item!.runs.single.status, WorkItemRunStatus.succeeded);
      expect(item.events.single.tone, WorkItemEventTone.active);
      expect(item.artifacts.single.kind, WorkItemArtifactKind.preview);
    });

    test('side-endpoint failure inside getWorkItem yields empty list (not crash)', () async {
      final api = _FakeControlApi(
        detail: {'id': 'wi_3', 'title': 'X', 'status': 'open', 'priority': 'normal'},
        runsThrows: Exception('runs 500'),
      );
      final item = await HttpWorkRepository(api: api).getWorkItem('wi_3');
      expect(item, isNotNull);
      expect(item!.runs, isEmpty);
    });

    test('returns null (not fixture leak) when getWorkItem returns empty body', () async {
      final api = _FakeControlApi(detail: const {});
      final item = await HttpWorkRepository(api: api).getWorkItem('does-not-exist');
      expect(item, isNull, reason: 'Empty API body must NOT silently fall back to fixture data.');
    });

    test('unknown surface validation defaults to UNVALIDATED, not validated', () async {
      // Documents the safe default for the trust enum: any value we do not
      // explicitly recognize as server-validated must be treated as
      // unvalidated. Decoded via the public listWorkItems path so the test
      // exercises the real decoder.
      final api = _FakeControlApi(
        workItems: [
          {
            'id': 'wi_v',
            'title': 'Surface trust',
            'status': 'open',
            'priority': 'normal',
            'surfaces': [
              {
                'id': 'sur_unknown',
                'title': 'Unknown trust',
                'kind': 'dashboard',
                'componentCount': 1,
                'updatedAtLabel': 'now',
                // Deliberately missing or unknown:
                'validation': 'totally-unknown-token',
              },
            ],
          },
        ],
      );
      final items = await HttpWorkRepository(api: api).listWorkItems();
      final surfaces = items.single.surfaces;
      expect(surfaces.single.validation, WorkItemSurfaceValidation.unvalidated);
    });
  });

  group('HttpWorkRepository failure policy', () {
    test('falls back to fixtures on StateError (unauthenticated)', () async {
      final api = _FakeControlApi(
        listWorkItemsThrows: StateError('Cognito ID token unavailable.'),
      );
      final fallback = FixtureWorkRepository();
      final repo = HttpWorkRepository(api: api, fallback: fallback);
      final items = await repo.listWorkItems();
      final fixture = await fallback.listWorkItems();
      expect(items.length, fixture.length, reason: 'Returns the fixture set verbatim, not just any non-empty list.');
    });

    test('does NOT fall back to fixtures on real API/network errors', () async {
      // Critical: a network/5xx must surface as a real error, not pretend
      // the user has demo work items "Track competitor pricing" etc.
      final api = _FakeControlApi(
        listWorkItemsThrows: Exception('500 Internal Server Error'),
      );
      final repo = HttpWorkRepository(api: api);
      await expectLater(repo.listWorkItems(), throwsA(isA<Exception>()));
    });
  });
}
