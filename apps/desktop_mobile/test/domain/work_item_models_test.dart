import 'package:desktop_mobile/src/domain/work_item_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WorkItem model labels and aggregation', () {
    test('normalizes product status labels for shadcn client surfaces', () {
      expect(WorkItemStatus.intake.label, 'Intake');
      expect(WorkItemStatus.planning.label, 'Planning');
      expect(WorkItemStatus.running.label, 'In progress');
      expect(WorkItemStatus.needsReview.label, 'Needs review');
      expect(WorkItemStatus.blocked.label, 'Blocked');
      expect(WorkItemStatus.done.label, 'Done');
    });

    test('summarizes runs, artifacts, approvals, and validated surfaces', () {
      final item = WorkItem.fixturePricingTracker();
      final summary = item.summary;

      expect(summary.title, 'Track competitor pricing');
      expect(summary.statusLabel, 'Needs review');
      expect(summary.activeRunCount, 1);
      expect(summary.totalRunCount, 3);
      expect(summary.artifactCount, 4);
      expect(summary.pendingApprovalCount, 1);
      expect(summary.validatedSurfaceCount, 2);
      expect(summary.runSummary, '1 active / 3 total');
      expect(summary.surfaceSummary, '2 generated surfaces');
    });

    test('fails closed for unvalidated generated surfaces', () {
      final item = WorkItem.fixturePricingTracker().copyWith(
        surfaces: [
          const WorkItemSurfaceSummary(
            id: 'surface_safe',
            title: 'Safe dashboard',
            kind: WorkItemSurfaceKind.dashboard,
            validation: WorkItemSurfaceValidation.serverValidated,
            componentCount: 4,
            dataSources: ['artifact-ref'],
            updatedAtLabel: 'now',
          ),
          const WorkItemSurfaceSummary(
            id: 'surface_raw',
            title: 'Raw HTML payload',
            kind: WorkItemSurfaceKind.dashboard,
            validation: WorkItemSurfaceValidation.unvalidated,
            componentCount: 1,
            dataSources: ['raw-html'],
            updatedAtLabel: 'now',
          ),
        ],
      );

      expect(item.validatedSurfaces.map((surface) => surface.id), [
        'surface_safe',
      ]);
      expect(item.summary.validatedSurfaceCount, 1);
    });
  });

  group('WorkItems view states', () {
    test(
      'uses honest loading, empty, denied, offline, stale, and ready labels',
      () {
        expect(const WorkItemsViewState.loading().label, 'Loading work items…');
        expect(
          const WorkItemsViewState.empty().label,
          'No delegated work yet.',
        );
        expect(
          const WorkItemsViewState.denied('No workspace access').label,
          'No workspace access',
        );
        expect(
          const WorkItemsViewState.offline().label,
          'Backend unavailable; showing local fixtures only.',
        );
        expect(
          const WorkItemsViewState.stale(lastUpdatedLabel: '7 min ago').label,
          'Last saved update was 7 min ago',
        );
        expect(const WorkItemsViewState.ready().label, 'Work ledger ready');
      },
    );
  });
}
