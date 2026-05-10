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

  Future<Map<String, dynamic>> getWorkItem(String id) async {
    final response = await _http.get(
      _uri('/work-items/$id'),
      headers: await _headers(),
    );
    final decoded = _decode(response);
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> createWorkItem({
    required String workspaceId,
    required String title,
    String? objective,
  }) async {
    final response = await _http.post(
      _uri('/work-items'),
      headers: await _headers(),
      body: jsonEncode({
        'workspaceId': workspaceId,
        'title': title,
        'objective': ?objective,
        'idempotencyKey': 'desktop-${DateTime.now().millisecondsSinceEpoch}',
      }),
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
    required String workspaceId,
    required String objective,
  }) async {
    final response = await _http.post(
      _uri('/work-items/$workItemId/runs'),
      headers: await _headers(),
      body: jsonEncode({
        'workspaceId': workspaceId,
        'objective': objective,
        'idempotencyKey': 'desktop-${DateTime.now().millisecondsSinceEpoch}',
      }),
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
    return _asList(_decode(response), keys: const ['items', 'runs', 'userRunners']);
  }

  Future<List<Map<String, dynamic>>> listRuns(String workItemId) async {
    final response = await _http.get(
      _uri('/work-items/$workItemId/runs'),
      headers: await _headers(),
    );
    return _asList(_decode(response), keys: const ['items', 'runs']);
  }

  Future<List<Map<String, dynamic>>> listEvents(String workItemId) async {
    final response = await _http.get(
      _uri('/work-items/$workItemId/events'),
      headers: await _headers(),
    );
    return _asList(_decode(response), keys: const ['items', 'events']);
  }

  Future<List<Map<String, dynamic>>> listArtifacts(String workItemId) async {
    final response = await _http.get(
      _uri('/work-items/$workItemId/artifacts'),
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
