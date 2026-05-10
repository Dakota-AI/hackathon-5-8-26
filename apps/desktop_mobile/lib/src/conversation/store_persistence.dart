import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:amplify_flutter/amplify_flutter.dart' show safePrint;
import 'package:path_provider/path_provider.dart';

import 'conversation_store.dart';

/// JSON-file persistence for [ConversationStore].
///
/// History is small (text only, no media) so a single versioned JSON file
/// in the documents directory is plenty. Writes are debounced 250ms to
/// avoid hammering disk while a stream is in flight.
class StorePersistence {
  StorePersistence._(this._file);

  static const _schemaVersion = 1;
  static const _filename = 'aicaller_conversation_v$_schemaVersion.json';
  static const _debounce = Duration(milliseconds: 250);

  final File _file;
  Timer? _saveTimer;
  bool _disposed = false;

  static Future<StorePersistence> open() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/$_filename');
    return StorePersistence._(file);
  }

  /// Last modified timestamp of the persisted file. Used by the
  /// foreground to detect background-isolate writes (so it can reload).
  /// Returns null if the file doesn't exist yet.
  Future<DateTime?> mtime() async {
    if (!await _file.exists()) return null;
    try {
      final stat = await _file.stat();
      return stat.modified;
    } catch (_) {
      return null;
    }
  }

  Future<List<Turn>> load() async {
    if (!await _file.exists()) {
      safePrint('[persist] no prior conversation file, starting fresh');
      return const [];
    }
    try {
      final raw = await _file.readAsString();
      if (raw.trim().isEmpty) return const [];
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final version = decoded['version'] as int?;
      if (version != _schemaVersion) {
        safePrint(
          '[persist] schema mismatch (file=$version expected=$_schemaVersion), discarding',
        );
        return const [];
      }
      final turnsJson = decoded['turns'] as List? ?? const [];
      final turns = <Turn>[];
      for (final entry in turnsJson) {
        if (entry is! Map) continue;
        final turn = _decodeTurn(entry.cast<String, dynamic>());
        if (turn != null) turns.add(turn);
      }
      safePrint('[persist] loaded ${turns.length} turns');
      return turns;
    } catch (e) {
      safePrint('[persist] load failed: $e');
      return const [];
    }
  }

  void scheduleSave(List<Turn> turns) {
    if (_disposed) return;
    _saveTimer?.cancel();
    _saveTimer = Timer(_debounce, () => _flush(turns));
  }

  Future<void> _flush(List<Turn> turns) async {
    if (_disposed) return;
    try {
      final payload = jsonEncode({
        'version': _schemaVersion,
        'turns': [for (final t in turns) _encodeTurn(t)],
      });
      await _file.writeAsString(payload);
    } catch (e) {
      safePrint('[persist] save failed: $e');
    }
  }

  Future<void> flushNow(List<Turn> turns) async {
    _saveTimer?.cancel();
    await _flush(turns);
  }

  void dispose() {
    _disposed = true;
    _saveTimer?.cancel();
  }

  Map<String, dynamic> _encodeTurn(Turn t) => {
    'id': t.id,
    'role': t.role.name,
    'text': t.text,
    'createdAt': t.createdAt.toIso8601String(),
    'modality': t.modality.name,
    'origin': t.origin.name,
    if (t.error) 'error': true,
  };

  Turn? _decodeTurn(Map<String, dynamic> json) {
    try {
      final id = json['id'] as String?;
      final roleName = json['role'] as String?;
      final text = json['text'] as String?;
      final createdAtRaw = json['createdAt'] as String?;
      if (id == null || roleName == null || text == null) return null;
      final role = TurnRole.values.firstWhere(
        (r) => r.name == roleName,
        orElse: () => TurnRole.user,
      );
      final modality = TurnModality.values.firstWhere(
        (m) => m.name == (json['modality'] as String? ?? 'text'),
        orElse: () => TurnModality.text,
      );
      final origin = TurnOrigin.values.firstWhere(
        (o) => o.name == (json['origin'] as String? ?? 'reactive'),
        orElse: () => TurnOrigin.reactive,
      );
      final createdAt = createdAtRaw == null
          ? DateTime.now()
          : DateTime.tryParse(createdAtRaw) ?? DateTime.now();
      return Turn(
        id: id,
        role: role,
        text: text,
        createdAt: createdAt,
        modality: modality,
        origin: origin,
        streaming: false,
        error: json['error'] == true,
      );
    } catch (_) {
      return null;
    }
  }
}
