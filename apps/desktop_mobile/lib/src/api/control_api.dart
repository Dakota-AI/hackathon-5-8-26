import 'dart:convert';

import 'package:desktop_mobile/backend_config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../auth/auth_controller.dart';

class ControlApi {
  ControlApi(this._http, this._idToken);

  final http.Client _http;
  final Future<String?> Function() _idToken;

  Future<Map<String, String>> _headers() async {
    final token = await _idToken();
    if (token == null) {
      throw StateError('Not signed in.');
    }
    return {
      'authorization': 'Bearer $token',
      'content-type': 'application/json',
    };
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = Uri.parse('$agentsCloudControlApiUrl$path');
    if (query == null || query.isEmpty) return base;
    return base.replace(queryParameters: {...base.queryParameters, ...query});
  }

  dynamic _decode(http.Response response) {
    final body = response.body.isEmpty ? '{}' : response.body;
    final decoded = jsonDecode(body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      String? message;
      if (decoded is Map<String, dynamic>) {
        message = decoded['message'] as String? ?? decoded['error'] as String?;
      }
      throw StateError(
        message ?? 'Control API request failed (${response.statusCode}).',
      );
    }
    return decoded;
  }

  List<Map<String, dynamic>> _asList(
    dynamic decoded, {
    List<String> keys = const ['items'],
  }) {
    if (decoded is List) {
      return decoded.whereType<Map<String, dynamic>>().toList();
    }
    if (decoded is Map<String, dynamic>) {
      for (final k in keys) {
        final v = decoded[k];
        if (v is List) {
          return v.whereType<Map<String, dynamic>>().toList();
        }
      }
    }
    return const <Map<String, dynamic>>[];
  }

  Future<List<Map<String, dynamic>>> listWorkItems({
    String? workspaceId,
  }) async {
    final query = <String, String>{};
    if (workspaceId != null) query['workspaceId'] = workspaceId;
    final response = await _http.get(
      _uri('/work-items', query),
      headers: await _headers(),
    );
    return _asList(_decode(response), keys: const ['items', 'workItems']);
  }

  Future<Map<String, dynamic>> getWorkItem(
    String id, {
    String? workspaceId,
  }) async {
    final query = <String, String>{};
    if (workspaceId != null && workspaceId.trim().isNotEmpty) {
      query['workspaceId'] = workspaceId.trim();
    }
    final response = await _http.get(
      _uri('/work-items/$id', query),
      headers: await _headers(),
    );
    final decoded = _decode(response);
    if (decoded is Map<String, dynamic>) {
      final workItem = decoded['workItem'];
      if (workItem is Map<String, dynamic>) return workItem;
      return decoded;
    }
    return <String, dynamic>{};
  }

  Future<Map<String, dynamic>> createWorkItem({
    String? workspaceId,
    required String title,
    String? objective,
  }) async {
    final body = <String, dynamic>{
      'title': title,
      'objective': objective,
      'idempotencyKey': 'desktop-${DateTime.now().millisecondsSinceEpoch}',
    };
    if (workspaceId != null && workspaceId.trim().isNotEmpty) {
      body['workspaceId'] = workspaceId.trim();
    }
    final response = await _http.post(
      _uri('/work-items'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    final decoded = _decode(response);
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> updateWorkItemStatus(
    String id,
    String status,
  ) async {
    final response = await _http.post(
      _uri('/work-items/$id/status'),
      headers: await _headers(),
      body: jsonEncode({'status': status}),
    );
    final decoded = _decode(response);
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> startRun({
    required String workItemId,
    String? workspaceId,
    required String objective,
  }) async {
    final body = <String, dynamic>{
      'objective': objective,
      'idempotencyKey': 'desktop-${DateTime.now().millisecondsSinceEpoch}',
    };
    if (workspaceId != null && workspaceId.trim().isNotEmpty) {
      body['workspaceId'] = workspaceId.trim();
    }
    final response = await _http.post(
      _uri('/work-items/$workItemId/runs'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    final decoded = _decode(response);
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> startRunner({
    required String workspaceId,
    required String objective,
    String? idempotencyKey,
  }) async {
    final body = <String, dynamic>{
      'workspaceId': workspaceId,
      'objective': objective,
      'idempotencyKey':
          idempotencyKey ??
          'desktop-run-${DateTime.now().millisecondsSinceEpoch}',
    };

    final response = await _http.post(
      _uri('/runs'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    final decoded = _decode(response);
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }

  Future<List<Map<String, dynamic>>> listUserRunners({
    String? workspaceId,
    int? limit,
  }) async {
    final query = <String, String>{};
    if (workspaceId != null) query['workspaceId'] = workspaceId;
    if (limit != null) query['limit'] = limit.toString();
    final response = await _http.get(
      _uri('/user-runners', query),
      headers: await _headers(),
    );
    return _asList(
      _decode(response),
      keys: const ['items', 'runs', 'userRunners'],
    );
  }

  Future<List<Map<String, dynamic>>> listRuns(
    String workItemId, {
    String? workspaceId,
  }) async {
    final query = <String, String>{};
    if (workspaceId != null && workspaceId.trim().isNotEmpty) {
      query['workspaceId'] = workspaceId.trim();
    }
    final response = await _http.get(
      _uri('/work-items/$workItemId/runs', query),
      headers: await _headers(),
    );
    return _asList(_decode(response), keys: const ['items', 'runs']);
  }

  Future<List<Map<String, dynamic>>> listEvents(
    String workItemId, {
    String? workspaceId,
  }) async {
    final query = <String, String>{};
    if (workspaceId != null && workspaceId.trim().isNotEmpty) {
      query['workspaceId'] = workspaceId.trim();
    }
    final response = await _http.get(
      _uri('/work-items/$workItemId/events', query),
      headers: await _headers(),
    );
    return _asList(_decode(response), keys: const ['items', 'events']);
  }

  Future<List<Map<String, dynamic>>> listArtifacts(
    String workItemId, {
    String? workspaceId,
  }) async {
    final query = <String, String>{};
    if (workspaceId != null && workspaceId.trim().isNotEmpty) {
      query['workspaceId'] = workspaceId.trim();
    }
    final response = await _http.get(
      _uri('/work-items/$workItemId/artifacts', query),
      headers: await _headers(),
    );
    return _asList(_decode(response), keys: const ['items', 'artifacts']);
  }

  /// Resolves a presigned download URL for the given artifact.
  /// GET /runs/{runId}/artifacts/{artifactId}/download
  /// Returns the decoded body: {url, expiresAt, expiresInSeconds, artifact:{...}}.
  Future<Map<String, dynamic>> getArtifactDownload({
    required String runId,
    required String artifactId,
  }) async {
    final response = await _http.get(
      _uri('/runs/$runId/artifacts/$artifactId/download'),
      headers: await _headers(),
    );
    final decoded = _decode(response);
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }
}

final controlApiProvider = Provider<ControlApi>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  final auth = ref.watch(authControllerProvider.notifier);
  return ControlApi(client, auth.idToken);
});
