import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'agent_browser_protocol.dart';

class AgentBrowserWebSocketBridge {
  AgentBrowserWebSocketBridge({
    required AgentBrowserCommandDispatcher dispatcher,
    AgentBrowserLogSink? logSink,
    String? token,
  }) : _dispatcher = dispatcher,
       _logSink = logSink,
       _token = token;

  final AgentBrowserCommandDispatcher _dispatcher;
  final AgentBrowserLogSink? _logSink;
  final String? _token;
  HttpServer? _server;
  StreamSubscription<HttpRequest>? _subscription;

  bool get running => _server != null;

  Future<int> start({required int port}) async {
    if (_server != null) return _server!.port;
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
    _server = server;
    _subscription = server.listen(_handleRequest);
    _log(
      AgentBrowserLogLevel.info,
      'ws.start',
      'Agent browser WebSocket bridge listening',
      fields: {
        'host': server.address.address,
        'port': server.port,
        'path': '/browser',
        'commands': _dispatcher.commands.toList()..sort(),
      },
    );
    return server.port;
  }

  Future<void> close() async {
    await _subscription?.cancel();
    _subscription = null;
    final server = _server;
    _server = null;
    await server?.close(force: true);
    _log(
      AgentBrowserLogLevel.info,
      'ws.stop',
      'Agent browser WebSocket bridge stopped',
    );
  }

  Future<void> _handleRequest(HttpRequest request) async {
    if (request.uri.path != '/browser' ||
        !WebSocketTransformer.isUpgradeRequest(request)) {
      request.response.statusCode = HttpStatus.notFound;
      await request.response.close();
      return;
    }
    if (_token != null && request.uri.queryParameters['token'] != _token) {
      request.response.statusCode = HttpStatus.unauthorized;
      await request.response.close();
      _log(
        AgentBrowserLogLevel.warning,
        'ws.reject',
        'Rejected browser bridge connection with invalid token',
      );
      return;
    }

    final socket = await WebSocketTransformer.upgrade(request);
    _log(
      AgentBrowserLogLevel.info,
      'ws.connect',
      'Agent browser CLI connected',
      fields: {'remote': request.connectionInfo?.remoteAddress.address},
    );
    socket.listen(
      (message) => unawaited(_handleMessage(socket, message)),
      onDone: () => _log(
        AgentBrowserLogLevel.info,
        'ws.disconnect',
        'Agent browser CLI disconnected',
      ),
      onError: (Object error) => _log(
        AgentBrowserLogLevel.error,
        'ws.error',
        'Agent browser WebSocket stream failed',
        fields: {'error': error.toString()},
      ),
    );
  }

  Future<void> _handleMessage(WebSocket socket, Object? message) async {
    if (message is! String) {
      socket.add(
        jsonEncode(
          const AgentBrowserCommandResponse(
            id: 'unknown',
            command: 'unknown',
            ok: false,
            error: 'Browser bridge accepts JSON text messages only',
          ).toJson(),
        ),
      );
      return;
    }
    try {
      final request = AgentBrowserCommandRequest.fromJson(jsonDecode(message));
      final response = await _dispatcher.dispatch(request);
      socket.add(jsonEncode(response.toJson()));
    } catch (error) {
      _log(
        AgentBrowserLogLevel.error,
        'ws.message.error',
        'Failed to process browser bridge message',
        fields: {'error': error.toString(), 'message': message},
      );
      socket.add(
        jsonEncode(
          AgentBrowserCommandResponse(
            id: 'unknown',
            command: 'unknown',
            ok: false,
            error: error.toString(),
          ).toJson(),
        ),
      );
    }
  }

  void _log(
    AgentBrowserLogLevel level,
    String event,
    String message, {
    Map<String, Object?> fields = const <String, Object?>{},
  }) {
    _logSink?.call(
      AgentBrowserLogEntry(
        level: level,
        event: event,
        message: message,
        fields: fields,
      ),
    );
  }
}
