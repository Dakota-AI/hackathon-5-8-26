import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

import '../data/http_work_repository.dart';
import '../domain/work_item_models.dart';

/// Async list of [WorkItem]s used by the Kanban board. Uses the unified
/// [workRepositoryProvider] which is live (Control API) when signed in and
/// fixture-backed otherwise. Per-call failures inside HttpWorkRepository
/// also fall back to fixtures.
final kanbanWorkItemsProvider = FutureProvider<List<WorkItem>>((ref) async {
  final repo = ref.watch(workRepositoryProvider);
  return repo.listWorkItems();
});

class _KanbanPalette {
  static const background = Color(0xFF050505);
  static const card = Color(0xFF0D0D0D);
  static const border = Color(0xFF262626);
  static const text = Color(0xFFF5F5F5);
  static const muted = Color(0xFFA3A3A3);
}

enum _KanbanColumn { todo, inProgress, review, done }

extension on _KanbanColumn {
  String get title => switch (this) {
    _KanbanColumn.todo => 'Todo',
    _KanbanColumn.inProgress => 'In Progress',
    _KanbanColumn.review => 'Review',
    _KanbanColumn.done => 'Done',
  };
}

_KanbanColumn _columnFor(WorkItem item) {
  final label = item.summary.statusLabel.toLowerCase();
  if (label.contains('needs review') || label.contains('review')) {
    return _KanbanColumn.review;
  }
  if (label.contains('in progress') || label.contains('running')) {
    return _KanbanColumn.inProgress;
  }
  if (label.contains('blocked')) {
    return _KanbanColumn.todo;
  }
  if (label.contains('done') || label.contains('complete')) {
    return _KanbanColumn.done;
  }
  return _KanbanColumn.todo;
}

class KanbanBoard extends ConsumerWidget {
  const KanbanBoard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncItems = ref.watch(kanbanWorkItemsProvider);
    return Container(
      color: _KanbanPalette.background,
      padding: const EdgeInsets.all(12),
      child: asyncItems.when(
        loading: () => const Center(
          child: Text(
            'Loading…',
            style: TextStyle(color: _KanbanPalette.muted),
          ),
        ),
        error: (error, _) => Center(
          child: Text(
            'Failed to load work items: $error',
            style: const TextStyle(color: _KanbanPalette.muted),
          ),
        ),
        data: (items) => _KanbanBody(items: items),
      ),
    );
  }
}

class _KanbanBody extends StatelessWidget {
  const _KanbanBody({required this.items});

  final List<WorkItem> items;

  @override
  Widget build(BuildContext context) {
    final grouped = <_KanbanColumn, List<WorkItem>>{
      for (final col in _KanbanColumn.values) col: <WorkItem>[],
    };
    for (final item in items) {
      grouped[_columnFor(item)]!.add(item);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        const minColumnWidth = 220.0;
        const gap = 10.0;
        final columns = _KanbanColumn.values
            .map(
              (col) =>
                  _KanbanColumnView(title: col.title, items: grouped[col]!),
            )
            .toList();

        final totalMin =
            minColumnWidth * columns.length + gap * (columns.length - 1);
        if (constraints.maxWidth >= totalMin) {
          // Use flex layout to fill width.
          final children = <Widget>[];
          for (var i = 0; i < columns.length; i++) {
            children.add(Expanded(child: columns[i]));
            if (i != columns.length - 1) {
              children.add(const SizedBox(width: gap));
            }
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: children,
          );
        }

        // Narrow: horizontal scroll with min column widths.
        final children = <Widget>[];
        for (var i = 0; i < columns.length; i++) {
          children.add(SizedBox(width: minColumnWidth, child: columns[i]));
          if (i != columns.length - 1) {
            children.add(const SizedBox(width: gap));
          }
        }
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: children,
            ),
          ),
        );
      },
    );
  }
}

class _KanbanColumnView extends StatelessWidget {
  const _KanbanColumnView({required this.title, required this.items});

  final String title;
  final List<WorkItem> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _KanbanPalette.muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
              ),
              _CountBadge(count: items.length),
            ],
          ),
        ),
        for (final item in items) ...[
          _KanbanCard(item: item),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: _KanbanPalette.card,
        border: Border.all(color: _KanbanPalette.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$count',
        style: const TextStyle(
          color: _KanbanPalette.muted,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _KanbanCard extends StatelessWidget {
  const _KanbanCard({required this.item});

  final WorkItem item;

  @override
  Widget build(BuildContext context) {
    final summary = item.summary;
    final artifactCount = summary.artifactCount;
    final approvalCount = summary.pendingApprovalCount;
    return Card(
      filled: true,
      fillColor: _KanbanPalette.card,
      borderColor: _KanbanPalette.border,
      borderRadius: BorderRadius.circular(10),
      padding: const EdgeInsets.all(10),
      boxShadow: const [],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: _KanbanPalette.text,
              fontWeight: FontWeight.w800,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            item.nextAction,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: _KanbanPalette.muted,
              fontSize: 11,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _StatusPill(label: summary.statusLabel),
              _MutedMetaText(
                text:
                    '$artifactCount '
                    '${artifactCount == 1 ? 'artifact' : 'artifacts'}',
              ),
              _MutedMetaText(
                text:
                    '$approvalCount '
                    '${approvalCount == 1 ? 'approval' : 'approvals'}',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: _KanbanPalette.background,
        border: Border.all(color: _KanbanPalette.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: _KanbanPalette.muted,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _MutedMetaText extends StatelessWidget {
  const _MutedMetaText({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(color: _KanbanPalette.muted, fontSize: 11),
    );
  }
}
