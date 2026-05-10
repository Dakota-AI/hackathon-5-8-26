import 'dart:convert';

import 'package:genui/genui.dart' as genui;
import 'package:shadcn_flutter/shadcn_flutter.dart';

import 'tokens.dart';

/// Splits agent text into a sequence of segments — plain text and inline
/// `genui` code blocks — so the chat surface can render markdown for prose
/// and a live `genui.Surface` for each block.
sealed class AgentSegment {
  const AgentSegment();
}

final class TextSegment extends AgentSegment {
  const TextSegment(this.text);
  final String text;
}

final class GenUiSegment extends AgentSegment {
  const GenUiSegment({required this.json, required this.raw});
  final Map<String, dynamic> json;
  final String raw;
}

final _genuiFence = RegExp(
  r'```genui\s*\n([\s\S]*?)\n?```',
  multiLine: true,
);

List<AgentSegment> parseAgentText(String text) {
  final out = <AgentSegment>[];
  var cursor = 0;
  for (final match in _genuiFence.allMatches(text)) {
    if (match.start > cursor) {
      final pre = text.substring(cursor, match.start).trim();
      if (pre.isNotEmpty) out.add(TextSegment(pre));
    }
    final body = match.group(1) ?? '';
    Map<String, dynamic>? parsed;
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) parsed = decoded;
    } catch (_) {
      parsed = null;
    }
    if (parsed != null) {
      out.add(GenUiSegment(json: parsed, raw: body));
    } else {
      // Couldn't parse — show as code so the user can see what the agent meant.
      out.add(TextSegment('```\n$body\n```'));
    }
    cursor = match.end;
  }
  if (cursor < text.length) {
    final tail = text.substring(cursor).trim();
    if (tail.isNotEmpty) out.add(TextSegment(tail));
  }
  return out;
}

/// Mounts a single GenUI surface from a JSON payload that the LLM emitted.
/// The surface is keyed by [surfaceId] so re-emissions for the same turn
/// patch the existing surface in place.
class GenUiBlock extends StatefulWidget {
  const GenUiBlock({
    super.key,
    required this.surfaceId,
    required this.payload,
  });

  final String surfaceId;
  final Map<String, dynamic> payload;

  @override
  State<GenUiBlock> createState() => _GenUiBlockState();
}

class _GenUiBlockState extends State<GenUiBlock> {
  late final genui.SurfaceController _controller;
  bool _surfaceCreated = false;

  @override
  void initState() {
    super.initState();
    _controller = genui.SurfaceController(
      catalogs: [genui.BasicCatalogItems.asCatalog()],
    );
    _apply(widget.payload);
  }

  @override
  void didUpdateWidget(covariant GenUiBlock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.payload != widget.payload) _apply(widget.payload);
  }

  void _apply(Map<String, dynamic> payload) {
    if (!_surfaceCreated) {
      _controller.handleMessage(
        genui.CreateSurface(
          surfaceId: widget.surfaceId,
          catalogId: genui.basicCatalogId,
        ),
      );
      _surfaceCreated = true;
    }
    final raw = payload['components'];
    if (raw is! List) return;
    final components = <genui.Component>[];
    for (final c in raw) {
      if (c is! Map) continue;
      final id = c['id'] as String?;
      final type = c['type'] as String?;
      if (id == null || type == null) continue;
      final props = c['properties'];
      components.add(
        genui.Component(
          id: id,
          type: type,
          properties: props is Map<String, dynamic>
              ? props
              : (props is Map ? props.cast<String, dynamic>() : const {}),
        ),
      );
    }
    if (components.isEmpty) return;
    _controller.handleMessage(
      genui.UpdateComponents(
        surfaceId: widget.surfaceId,
        components: components,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Palette.background,
        border: Border.all(color: Palette.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: genui.Surface(
        surfaceContext: _controller.contextFor(widget.surfaceId),
        defaultBuilder: (_) => const Text(
          'Live UI surface — agent did not render anything yet.',
          style: TextStyle(color: Palette.muted, fontSize: 12),
        ),
      ),
    );
  }
}
