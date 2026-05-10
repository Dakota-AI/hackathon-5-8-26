import 'dart:convert';

import 'package:amplify_auth_cognito/amplify_auth_cognito.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

const agentsCloudRegion = 'us-east-1';
const agentsCloudUserPoolId = 'us-east-1_1UeU1hTME';
const agentsCloudUserPoolClientId = '3kq79rodc3ofjkulh0b31sfpos';
const agentsCloudIdentityPoolId =
    'us-east-1:5562c7da-9181-4b1e-9a5c-5d93a00bb442';
const agentsCloudControlApiUrl =
    'https://ajmonuqk61.execute-api.us-east-1.amazonaws.com';

const agentsCloudAmplifyConfig =
    '''{
  "UserAgent": "aws-amplify-cli/2.0",
  "Version": "1.0",
  "auth": {
    "plugins": {
      "awsCognitoAuthPlugin": {
        "UserAgent": "aws-amplify-cli/0.1.0",
        "Version": "0.1.0",
        "IdentityManager": { "Default": {} },
        "CredentialsProvider": {
          "CognitoIdentity": {
            "Default": {
              "PoolId": "$agentsCloudIdentityPoolId",
              "Region": "$agentsCloudRegion"
            }
          }
        },
        "CognitoUserPool": {
          "Default": {
            "PoolId": "$agentsCloudUserPoolId",
            "AppClientId": "$agentsCloudUserPoolClientId",
            "Region": "$agentsCloudRegion"
          }
        },
        "Auth": {
          "Default": {
            "authenticationFlowType": "USER_SRP_AUTH",
            "socialProviders": [],
            "usernameAttributes": ["email"],
            "signupAttributes": ["email"],
            "passwordProtectionSettings": {
              "passwordPolicyMinLength": 8,
              "passwordPolicyCharacters": [
                "REQUIRES_LOWERCASE",
                "REQUIRES_UPPERCASE",
                "REQUIRES_NUMBERS",
                "REQUIRES_SYMBOLS"
              ]
            },
            "mfaConfiguration": "OFF",
            "mfaTypes": [],
            "verificationMechanisms": ["email"]
          }
        }
      }
    }
  }
}''';

class AgentsCloudBackendStatus {
  const AgentsCloudBackendStatus({
    required this.amplifyConfigured,
    required this.controlApiConfigured,
    this.message,
  });

  final bool amplifyConfigured;
  final bool controlApiConfigured;
  final String? message;
}

class AgentsCloudBackend {
  static Future<AgentsCloudBackendStatus> configureAmplify() async {
    try {
      if (!Amplify.isConfigured) {
        await Amplify.addPlugin(_authPluginForPlatform());
        await Amplify.configure(agentsCloudAmplifyConfig);
      }
      return const AgentsCloudBackendStatus(
        amplifyConfigured: true,
        controlApiConfigured: true,
      );
    } on Exception catch (error) {
      return AgentsCloudBackendStatus(
        amplifyConfigured: Amplify.isConfigured,
        controlApiConfigured: true,
        message: error.toString(),
      );
    }
  }
}

AmplifyAuthCognito _authPluginForPlatform() {
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.macOS) {
    // macOS debug builds in this repo are intentionally unsigned/ad-hoc so
    // they can be launched locally without an Apple provisioning profile.
    // Cognito's default secure storage requires Keychain Sharing, which fails
    // in that unsigned shape and leaves sign-in stuck loading. Keep that
    // workaround scoped to macOS only; iOS should use the normal keychain path.
    return AmplifyAuthCognito(
      secureStorageFactory: (scope) => _InMemorySecureStorage(scope.name),
    );
  }
  return AmplifyAuthCognito();
}

class _InMemorySecureStorage extends SecureStorageInterface {
  _InMemorySecureStorage(this.scope);

  static final Map<String, Map<String, String>> _stores = {};

  final String scope;

  Map<String, String> get _store => _stores.putIfAbsent(scope, () => {});

  @override
  Future<void> write({required String key, required String value}) async {
    _store[key] = value;
  }

  @override
  Future<String?> read({required String key}) async => _store[key];

  @override
  Future<void> delete({required String key}) async {
    _store.remove(key);
  }
}

class ControlApiClient {
  ControlApiClient({http.Client? httpClient})
    : _httpClient = httpClient ?? http.Client();

  final http.Client _httpClient;

  Future<Map<String, dynamic>> createRun({
    required String idToken,
    required String workspaceId,
    required String objective,
  }) async {
    final response = await _httpClient.post(
      Uri.parse('$agentsCloudControlApiUrl/runs'),
      headers: {
        'authorization': 'Bearer $idToken',
        'content-type': 'application/json',
      },
      body: jsonEncode({
        'workspaceId': workspaceId,
        'objective': objective,
        'idempotencyKey': 'desktop-${DateTime.now().millisecondsSinceEpoch}',
      }),
    );

    final body =
        jsonDecode(response.body.isEmpty ? '{}' : response.body)
            as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
        body['message'] as String? ??
            body['error'] as String? ??
            'Control API request failed.',
      );
    }
    return body;
  }
}
