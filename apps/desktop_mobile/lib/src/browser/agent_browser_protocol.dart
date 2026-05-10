import 'dart:convert';

enum AgentBrowserLogLevel { debug, info, warning, error }

typedef AgentBrowserLogSink = void Function(AgentBrowserLogEntry entry);

typedef AgentBrowserCommandHandler =
    Future<Object?> Function(AgentBrowserCommandRequest request);

class AgentBrowserLogEntry {
  AgentBrowserLogEntry({
    required this.level,
    required this.event,
    required this.message,
    DateTime? timestamp,
    this.commandId,
    this.command,
    this.durationMs,
    Map<String, Object?> fields = const <String, Object?>{},
  }) : timestamp = timestamp ?? DateTime.now().toUtc(),
       fields = _jsonMap(fields);

  final AgentBrowserLogLevel level;
  final String event;
  final String message;
  final DateTime timestamp;
  final String? commandId;
  final String? command;
  final int? durationMs;
  final Map<String, Object?> fields;

  Map<String, Object?> toJson() => {
    'ts': timestamp.toIso8601String(),
    'level': level.name,
    'event': event,
    'message': message,
    if (commandId != null) 'commandId': commandId,
    if (command != null) 'command': command,
    if (durationMs != null) 'durationMs': durationMs,
    if (fields.isNotEmpty) 'fields': fields,
  };

  String toLine() {
    final prefix = [
      timestamp.toIso8601String(),
      level.name.toUpperCase(),
      event,
      if (commandId != null) 'id=$commandId',
      if (command != null) 'cmd=$command',
      if (durationMs != null) '${durationMs}ms',
    ].join(' ');
    return fields.isEmpty
        ? '$prefix $message'
        : '$prefix $message ${jsonEncode(fields)}';
  }
}

class AgentBrowserCommandRequest {
  AgentBrowserCommandRequest({
    required this.id,
    required this.command,
    Map<String, Object?> args = const <String, Object?>{},
  }) : args = _jsonMap(args);

  factory AgentBrowserCommandRequest.fromJson(Object? raw) {
    if (raw is! Map) {
      throw const FormatException('Browser command request must be an object');
    }
    final json = raw.cast<String, Object?>();
    final command = _string(json['command'] ?? json['method']);
    if (command.isEmpty) {
      throw const FormatException('Browser command request is missing command');
    }
    return AgentBrowserCommandRequest(
      id: _string(
        json['id'],
        fallback: DateTime.now().microsecondsSinceEpoch.toString(),
      ),
      command: command,
      args: _map(json['args']),
    );
  }

  final String id;
  final String command;
  final Map<String, Object?> args;

  Map<String, Object?> toJson() => {
    'id': id,
    'command': command,
    if (args.isNotEmpty) 'args': args,
  };
}

class AgentBrowserCommandResponse {
  const AgentBrowserCommandResponse({
    required this.id,
    required this.command,
    required this.ok,
    this.result,
    this.error,
    this.durationMs,
  });

  final String id;
  final String command;
  final bool ok;
  final Object? result;
  final String? error;
  final int? durationMs;

  Map<String, Object?> toJson() => {
    'id': id,
    'command': command,
    'ok': ok,
    if (result != null) 'result': _jsonValue(result),
    if (error != null) 'error': error,
    if (durationMs != null) 'durationMs': durationMs,
  };
}

class AgentBrowserCommandDispatcher {
  AgentBrowserCommandDispatcher({
    required Map<String, AgentBrowserCommandHandler> handlers,
    AgentBrowserLogSink? logSink,
  }) : _handlers = Map.unmodifiable(handlers),
       _logSink = logSink;

  final Map<String, AgentBrowserCommandHandler> _handlers;
  final AgentBrowserLogSink? _logSink;

  Set<String> get commands => _handlers.keys.toSet();

  Future<AgentBrowserCommandResponse> dispatch(
    AgentBrowserCommandRequest request,
  ) async {
    final timer = Stopwatch()..start();
    _log(
      AgentBrowserLogLevel.info,
      'command.start',
      'Received browser command',
      request,
      fields: {'args': _redactedArgs(request.args)},
    );
    final handler = _handlers[request.command];
    if (handler == null) {
      timer.stop();
      _log(
        AgentBrowserLogLevel.warning,
        'command.unknown',
        'Rejected unknown browser command',
        request,
        durationMs: timer.elapsedMilliseconds,
      );
      return AgentBrowserCommandResponse(
        id: request.id,
        command: request.command,
        ok: false,
        error: 'Unknown browser command: ${request.command}',
        durationMs: timer.elapsedMilliseconds,
      );
    }

    try {
      final result = await handler(request);
      timer.stop();
      _log(
        AgentBrowserLogLevel.info,
        'command.done',
        'Completed browser command',
        request,
        durationMs: timer.elapsedMilliseconds,
      );
      return AgentBrowserCommandResponse(
        id: request.id,
        command: request.command,
        ok: true,
        result: result,
        durationMs: timer.elapsedMilliseconds,
      );
    } catch (error) {
      timer.stop();
      _log(
        AgentBrowserLogLevel.error,
        'command.error',
        'Browser command failed',
        request,
        durationMs: timer.elapsedMilliseconds,
        fields: {'error': error.toString()},
      );
      return AgentBrowserCommandResponse(
        id: request.id,
        command: request.command,
        ok: false,
        error: error.toString(),
        durationMs: timer.elapsedMilliseconds,
      );
    }
  }

  void _log(
    AgentBrowserLogLevel level,
    String event,
    String message,
    AgentBrowserCommandRequest request, {
    int? durationMs,
    Map<String, Object?> fields = const <String, Object?>{},
  }) {
    _logSink?.call(
      AgentBrowserLogEntry(
        level: level,
        event: event,
        message: message,
        commandId: request.id,
        command: request.command,
        durationMs: durationMs,
        fields: fields,
      ),
    );
  }
}

Object? _jsonValue(Object? value) {
  if (value == null || value is String || value is num || value is bool) {
    return value;
  }
  if (value is Map) {
    return _jsonMap(value.cast<String, Object?>());
  }
  if (value is Iterable) {
    return value.map(_jsonValue).toList(growable: false);
  }
  return value.toString();
}

Map<String, Object?> _jsonMap(Map<String, Object?> value) {
  return value.map((key, value) => MapEntry(key, _jsonValue(value)));
}

Map<String, Object?> _map(Object? value) {
  if (value is Map) return _jsonMap(value.cast<String, Object?>());
  return const <String, Object?>{};
}

String _string(Object? value, {String fallback = ''}) {
  if (value == null) return fallback;
  final string = value.toString();
  return string.isEmpty ? fallback : string;
}

Map<String, Object?> _redactedArgs(Map<String, Object?> args) {
  final redacted = <String, Object?>{};
  for (final entry in args.entries) {
    final key = entry.key.toLowerCase();
    final value = entry.value;
    if (key.contains('value') ||
        key.contains('password') ||
        key.contains('token') ||
        key.contains('secret')) {
      redacted[entry.key] = '<redacted>';
    } else if (value is Map) {
      redacted[entry.key] = _redactedArgs(value.cast<String, Object?>());
    } else {
      redacted[entry.key] = value;
    }
  }
  return redacted;
}
