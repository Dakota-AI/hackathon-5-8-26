import 'dart:async';
import 'dart:convert';
import 'dart:io';

Future<void> main(List<String> args) async {
  final options = _Options.parse(args);
  if (options.help) {
    _printHelp();
    return;
  }

  final commands = _smokeCommands(options.fillValue);
  if (options.dryRun) {
    stdout.writeln('[agent-browser-cli] dry run command plan');
    for (final command in commands) {
      stdout.writeln(jsonEncode(command));
    }
    return;
  }

  final uri = options.uri;
  stdout.writeln('[agent-browser-cli] connecting $uri');
  late final WebSocket socket;
  try {
    socket = await WebSocket.connect(uri.toString());
  } catch (error) {
    stderr.writeln('[agent-browser-cli] failed to connect: $error');
    stderr.writeln(
      '[agent-browser-cli] start the app with: '
      'flutter run -d macos '
      '--dart-define=AGENTS_CLOUD_AUTH_BYPASS=true '
      '--dart-define=AGENTS_CLOUD_BROWSER_BRIDGE=true '
      '--dart-define=AGENTS_CLOUD_BROWSER_BRIDGE_AUTO_OPEN_BROWSER=true',
    );
    exitCode = 2;
    return;
  }

  final pending = <String, Completer<Map<String, Object?>>>{};
  final subscription = socket.listen(
    (message) {
      if (message is! String) return;
      final decoded = jsonDecode(message);
      if (decoded is! Map) return;
      final json = decoded.cast<String, Object?>();
      final id = json['id']?.toString();
      if (id == null) return;
      pending.remove(id)?.complete(json);
    },
    onError: (Object error) {
      for (final completer in pending.values) {
        if (!completer.isCompleted) completer.completeError(error);
      }
      pending.clear();
    },
    onDone: () {
      for (final completer in pending.values) {
        if (!completer.isCompleted) {
          completer.completeError(StateError('WebSocket closed'));
        }
      }
      pending.clear();
    },
  );

  var failed = false;
  try {
    for (final command in commands) {
      stdout.writeln(
        '[agent-browser-cli] -> ${command['id']} ${command['command']}',
      );
      final response = await _send(socket, pending, command);
      final result = response['result'];
      final resultOk = result is Map && result.containsKey('ok')
          ? result['ok'] == true
          : true;
      final ok = response['ok'] == true && resultOk;
      failed = failed || !ok;
      final duration = response['durationMs'];
      final message = result is Map
          ? result['message'] ?? response['error'] ?? ''
          : response['error'] ?? '';
      stdout.writeln(
        '[agent-browser-cli] <- ${response['id']} '
        '${ok ? 'ok' : 'fail'} ${duration ?? '-'}ms $message',
      );
      if (options.verbose) {
        stdout.writeln(const JsonEncoder.withIndent('  ').convert(response));
      }
      if (!ok) break;
    }
  } finally {
    await subscription.cancel();
    await socket.close();
  }

  if (failed) {
    stderr.writeln('[agent-browser-cli] smoke workflow failed');
    exitCode = 1;
  } else {
    stdout.writeln('[agent-browser-cli] smoke workflow passed');
  }
}

Future<Map<String, Object?>> _send(
  WebSocket socket,
  Map<String, Completer<Map<String, Object?>>> pending,
  Map<String, Object?> command,
) async {
  final id = command['id']!.toString();
  final completer = Completer<Map<String, Object?>>();
  pending[id] = completer;
  socket.add(jsonEncode(command));
  return completer.future.timeout(
    const Duration(seconds: 12),
    onTimeout: () {
      pending.remove(id);
      throw TimeoutException('Timed out waiting for $id');
    },
  );
}

List<Map<String, Object?>> _smokeCommands(String fillValue) {
  var next = 0;
  Map<String, Object?> command(
    String name, [
    Map<String, Object?> args = const <String, Object?>{},
  ]) {
    next += 1;
    return {
      'id': 'probe-$next',
      'command': name,
      if (args.isNotEmpty) 'args': args,
    };
  }

  return [
    command('load_smoke_page'),
    command('snapshot', {'maxElements': 40, 'maxTextChars': 4000}),
    command('find', {'query': 'Agent probe name'}),
    command('fill', {
      'target': {'selector': '#agent-probe-input'},
      'value': fillValue,
    }),
    command('click', {
      'target': {'selector': '#agent-probe-button'},
    }),
    command('find', {'query': 'Probe confirmed'}),
    command('scroll_by', {'y': 520}),
    command('run_smoke', {'fillValue': fillValue}),
  ];
}

class _Options {
  const _Options({
    required this.host,
    required this.port,
    required this.token,
    required this.fillValue,
    required this.dryRun,
    required this.verbose,
    required this.help,
  });

  factory _Options.parse(List<String> args) {
    var host = '127.0.0.1';
    var port = 48765;
    var token = '';
    var fillValue = 'cli bridge probe';
    var dryRun = false;
    var verbose = false;
    var help = false;

    for (var index = 0; index < args.length; index += 1) {
      final arg = args[index];
      String readValue() {
        if (index + 1 >= args.length) {
          throw FormatException('Missing value for $arg');
        }
        index += 1;
        return args[index];
      }

      switch (arg) {
        case '--host':
          host = readValue();
          break;
        case '--port':
          port = int.parse(readValue());
          break;
        case '--token':
          token = readValue();
          break;
        case '--fill-value':
          fillValue = readValue();
          break;
        case '--dry-run':
          dryRun = true;
          break;
        case '--verbose':
          verbose = true;
          break;
        case '--help':
        case '-h':
          help = true;
          break;
        default:
          throw FormatException('Unknown option $arg');
      }
    }

    return _Options(
      host: host,
      port: port,
      token: token,
      fillValue: fillValue,
      dryRun: dryRun,
      verbose: verbose,
      help: help,
    );
  }

  final String host;
  final int port;
  final String token;
  final String fillValue;
  final bool dryRun;
  final bool verbose;
  final bool help;

  Uri get uri => Uri(
    scheme: 'ws',
    host: host,
    port: port,
    path: '/browser',
    queryParameters: token.isEmpty ? null : {'token': token},
  );
}

void _printHelp() {
  stdout.writeln('Agent browser bridge probe');
  stdout.writeln('');
  stdout.writeln('Run the app first:');
  stdout.writeln(
    '  flutter run -d macos --dart-define=AGENTS_CLOUD_AUTH_BYPASS=true --dart-define=AGENTS_CLOUD_BROWSER_BRIDGE=true --dart-define=AGENTS_CLOUD_BROWSER_BRIDGE_AUTO_OPEN_BROWSER=true',
  );
  stdout.writeln('');
  stdout.writeln('Then open the Browser page and run:');
  stdout.writeln('  dart run tool/agent_browser_bridge_probe.dart --verbose');
  stdout.writeln('');
  stdout.writeln('Options:');
  stdout.writeln('  --host <host>          default 127.0.0.1');
  stdout.writeln('  --port <port>          default 48765');
  stdout.writeln(
    '  --token <token>        matches AGENTS_CLOUD_BROWSER_BRIDGE_TOKEN',
  );
  stdout.writeln('  --fill-value <value>   default "cli bridge probe"');
  stdout.writeln(
    '  --dry-run              print command JSON without connecting',
  );
  stdout.writeln('  --verbose              print full JSON responses');
}
