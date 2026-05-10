import 'package:amplify_auth_cognito/amplify_auth_cognito.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AuthStatus { unknown, signedOut, signedIn, signingIn, error }

class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.email,
    this.idToken,
    this.errorMessage,
  });

  final AuthStatus status;
  final String? email;
  final String? idToken;
  final String? errorMessage;

  AuthState copyWith({
    AuthStatus? status,
    String? email,
    String? idToken,
    String? errorMessage,
    bool clearError = false,
    bool clearEmail = false,
    bool clearIdToken = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      email: clearEmail ? null : (email ?? this.email),
      idToken: clearIdToken ? null : (idToken ?? this.idToken),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState();

  Future<void> bootstrap() async {
    if (!Amplify.isConfigured) {
      state = const AuthState(status: AuthStatus.signedOut);
      return;
    }
    try {
      final session = await Amplify.Auth.fetchAuthSession();
      if (!session.isSignedIn) {
        state = const AuthState(status: AuthStatus.signedOut);
        return;
      }
      final cognito = session as CognitoAuthSession;
      final tokens = cognito.userPoolTokensResult.value;
      String? email;
      try {
        final attrs = await Amplify.Auth.fetchUserAttributes();
        for (final a in attrs) {
          if (a.userAttributeKey.key == 'email') {
            email = a.value;
            break;
          }
        }
      } catch (_) {
        email = null;
      }
      state = AuthState(
        status: AuthStatus.signedIn,
        email: email,
        idToken: tokens.idToken.raw,
      );
    } catch (error) {
      state = AuthState(
        status: AuthStatus.signedOut,
        errorMessage: error.toString(),
      );
    }
  }

  Future<void> signIn(String email, String password) async {
    state = state.copyWith(status: AuthStatus.signingIn, clearError: true);
    try {
      await Amplify.Auth.signIn(username: email, password: password);
      await bootstrap();
    } on Exception catch (error) {
      state = AuthState(
        status: AuthStatus.error,
        errorMessage: error.toString(),
      );
    }
  }

  Future<void> signUp(String email, String password) async {
    state = state.copyWith(clearError: true);
    try {
      await Amplify.Auth.signUp(
        username: email,
        password: password,
        options: SignUpOptions(
          userAttributes: {CognitoUserAttributeKey.email: email},
        ),
      );
    } on Exception catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: error.toString(),
      );
    }
  }

  Future<void> confirmSignUp(String email, String code) async {
    state = state.copyWith(clearError: true);
    try {
      await Amplify.Auth.confirmSignUp(username: email, confirmationCode: code);
    } on Exception catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: error.toString(),
      );
    }
  }

  Future<void> signOut() async {
    try {
      await Amplify.Auth.signOut();
    } on Exception {
      // ignore
    }
    state = const AuthState(status: AuthStatus.signedOut);
  }

  Future<String?> idToken() async {
    try {
      final session = await Amplify.Auth.fetchAuthSession();
      if (!session.isSignedIn) return null;
      final cognito = session as CognitoAuthSession;
      final tokens = cognito.userPoolTokensResult.value;
      return tokens.idToken.raw;
    } on Exception {
      return null;
    }
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
