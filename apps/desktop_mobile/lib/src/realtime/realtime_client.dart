import 'dart:async';
import 'dart:convert';

import 'package:desktop_mobile/backend_config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../auth/auth_controller.dart';

class RealtimeClient {
  RealtimeClient(this._idTokenFn);

  final Future<String?> Function() _idTokenFn;
  WebSocketChannel? _channel;
  final StreamController<Map<String, dynamic>> _events =
      StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get events => _events.stream;

  bool get isConnected => _channel != null;

  Future<void> connect() async {
    if (_channel != null) return;
    final token = await _idTokenFn();
    if (token == null) {
      throw StateError('Not signed in.');
    }
    final encoded = Uri.encodeQueryComponent(token);
    final uri = Uri.parse('$agentsCloudRealtimeUrl?token=$encoded');
    final channel = WebSocketChannel.connect(uri);
    _channel = channel;
    channel.stream.listen(
      (data) {
        try {
          final text = data is String ? data : utf8.decode(data as List<int>);
          final decoded = jsonDecode(text);
          if (decoded is Map<String, dynamic>) {
            _events.add(decoded);
          } else {
            _events.add({'data': decoded});
          }
        } on Exception catch (error) {
          _events.add({'error': error.toString()});
        }
      },
      onError: (Object error) {
        _events.add({'error': error.toString()});
        _channel = null;
      },
      onDone: () {
        _channel = null;
      },
      cancelOnError: false,
    );
  }

  Future<void> subscribeRun({
    required String workspaceId,
    required String runId,
  }) async {
    final channel = _channel;
    if (channel == null) {
      throw StateError('Realtime client is not connected.');
    }
    channel.sink.add(
      jsonEncode({
        'action': 'subscribeRun',
        'workspaceId': workspaceId,
        'runId': runId,
      }),
    );
  }

  Future<void> close() async {
    final channel = _channel;
    _channel = null;
    if (channel != null) {
      await channel.sink.close();
    }
    if (!_events.isClosed) {
      await _events.close();
    }
  }
}

final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final auth = ref.watch(authControllerProvider.notifier);
  final client = RealtimeClient(auth.idToken);
  ref.onDispose(() {
    client.close();
  });
  return client;
});
