import 'package:desktop_mobile/src/data/fixture_work_repository.dart';
import 'package:desktop_mobile/src/domain/work_item_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('FixtureWorkRepository', () {
    test(
      'returns deterministic WorkItems ordered by client priority',
      () async {
        final repository = FixtureWorkRepository();
        final items = await repository.listWorkItems();

        expect(items.map((item) => item.id).take(3), [
          'work_competitor_pricing',
          'work_launch_preview',
          'work_miro_research',
        ]);
        expect(items.first.priority, WorkItemPriority.urgent);
        expect(items.first.status, WorkItemStatus.needsReview);
      },
    );

    test(
      'loads a detail item with runs, events, artifacts, approvals, and surfaces',
      () async {
        final repository = FixtureWorkRepository();
        final item = await repository.getWorkItem('work_competitor_pricing');

        expect(item, isNotNull);
        expect(item!.runs, hasLength(3));
        expect(item.events.first.label, 'Dashboard generated');
        expect(
          item.artifacts.map((artifact) => artifact.kind),
          contains(WorkItemArtifactKind.report),
        );
        expect(
          item.approvals.single.decision,
          WorkItemApprovalDecision.pending,
        );
        expect(item.validatedSurfaces, hasLength(2));
      },
    );

    test(
      'returns null for missing WorkItems rather than fabricating data',
      () async {
        final repository = FixtureWorkRepository();

        expect(await repository.getWorkItem('missing'), isNull);
      },
    );

    test('can expose an empty repository state for client empty UI', () async {
      final repository = FixtureWorkRepository(seedItems: const []);

      expect(await repository.listWorkItems(), isEmpty);
    });
  });
}
