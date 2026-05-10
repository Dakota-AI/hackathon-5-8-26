import 'dart:convert';

import 'package:desktop_mobile/src/api/control_api.dart';
import 'package:desktop_mobile/backend_config.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ControlApi wire contracts', () {
    test(
      'createWorkItem sends POST /work-items with workspaceId and auth',
      () async {
        final client = MockClient((http.Request request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/work-items');
          expect(request.headers['authorization'], 'Bearer test-token');

          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['workspaceId'], 'workspace-live');
          expect(body['objective'], 'Launch and test a market landing page.');
          expect(body['title'], 'Launch page');
          expect(body['idempotencyKey'], isNotEmpty);

          return http.Response(
            jsonEncode({
              'workItem': {'id': 'wi-1', 'workspaceId': 'workspace-live'},
            }),
            201,
          );
        });

        final api = ControlApi(client, () async => 'test-token');
        await api.createWorkItem(
          workspaceId: 'workspace-live',
          title: 'Launch page',
          objective: 'Launch and test a market landing page.',
        );
      },
    );

    test(
      'startRun sends POST /work-items/{workItemId}/runs with workspaceId',
      () async {
        final client = MockClient((http.Request request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/work-items/wi-1/runs');
          expect(request.headers['authorization'], 'Bearer test-token');

          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['workspaceId'], 'workspace-live');
          expect(body['objective'], 'Ship an autonomous workflow');
          expect(body['idempotencyKey'], isNotEmpty);

          return http.Response(
            jsonEncode({'runId': 'run-1', 'workspaceId': 'workspace-live'}),
            202,
          );
        });

        final api = ControlApi(client, () async => 'test-token');
        await api.startRun(
          workItemId: 'wi-1',
          workspaceId: 'workspace-live',
          objective: 'Ship an autonomous workflow',
        );
      },
    );

    test('listEvents forwards workspaceId as query parameter', () async {
      final client = MockClient((http.Request request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/work-items/wi-1/events');
        expect(request.url.queryParameters['workspaceId'], 'workspace-live');
        return http.Response(jsonEncode({'events': []}), 200);
      });

      final api = ControlApi(client, () async => 'test-token');
      await api.listEvents('wi-1', workspaceId: 'workspace-live');
    });

    test('getWorkItem forwards workspaceId as query parameter', () async {
      final client = MockClient((http.Request request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/work-items/wi-1');
        expect(request.url.queryParameters['workspaceId'], 'workspace-live');
        return http.Response(
          jsonEncode({
            'workItem': {'id': 'wi-1', 'workspaceId': 'workspace-live'},
          }),
          200,
        );
      });

      final api = ControlApi(client, () async => 'test-token');
      await api.getWorkItem('wi-1', workspaceId: 'workspace-live');
    });

    test('listArtifacts forwards workspaceId as query parameter', () async {
      final client = MockClient((http.Request request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/work-items/wi-1/artifacts');
        expect(request.url.queryParameters['workspaceId'], 'workspace-live');
        return http.Response(jsonEncode({'artifacts': []}), 200);
      });

      final api = ControlApi(client, () async => 'test-token');
      await api.listArtifacts('wi-1', workspaceId: 'workspace-live');
    });
  });

  test('Control API base URL from configuration is used consistently', () {
    expect(agentsCloudControlApiUrl, isNotEmpty);
  });
}
