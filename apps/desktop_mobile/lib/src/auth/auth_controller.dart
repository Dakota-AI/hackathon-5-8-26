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
    this.needsConfirmation = false,
    this.pendingConfirmEmail,
    this.infoMessage,
  });

  final AuthStatus status;
  final String? email;
  final String? idToken;
  final String? errorMessage;
  final bool needsConfirmation;
  final String? pendingConfirmEmail;
  final String? infoMessage;

  AuthState copyWith({
    AuthStatus? status,
    String? email,
    String? idToken,
    String? errorMessage,
    bool? needsConfirmation,
    String? pendingConfirmEmail,
    String? infoMessage,
    bool clearError = false,
    bool clearEmail = false,
    bool clearIdToken = false,
    bool clearPendingConfirmEmail = false,
    bool clearInfoMessage = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      email: clearEmail ? null : (email ?? this.email),
      idToken: clearIdToken ? null : (idToken ?? this.idToken),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      needsConfirmation: needsConfirmation ?? this.needsConfirmation,
      pendingConfirmEmail: clearPendingConfirmEmail
          ? null
          : (pendingConfirmEmail ?? this.pendingConfirmEmail),
      infoMessage: clearInfoMessage ? null : (infoMessage ?? this.infoMessage),
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
        state = state.copyWith(
          status: AuthStatus.signedOut,
          clearError: true,
        );
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
        errorMessage: _friendlyError(error),
      );
    }
  }

  Future<void> signIn(String email, String password) async {
    state = state.copyWith(
      status: AuthStatus.signingIn,
      clearError: true,
      clearInfoMessage: true,
    );
    try {
      final result = await Amplify.Auth.signIn(
        username: email,
        password: password,
      );
      if (result.isSignedIn) {
        await bootstrap();
        return;
      }
      // Cognito requires an extra step (e.g. confirm sign up, MFA challenge).
      final next = result.nextStep.signInStep;
      if (next == AuthSignInStep.confirmSignUp) {
        state = state.copyWith(
          status: AuthStatus.signedOut,
          needsConfirmation: true,
          pendingConfirmEmail: email,
          infoMessage: 'Verify your email to finish signing in.',
          clearError: true,
        );
        return;
      }
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Additional sign-in step required: ${next.name}',
      );
    } on UserNotConfirmedException {
      state = state.copyWith(
        status: AuthStatus.signedOut,
        needsConfirmation: true,
        pendingConfirmEmail: email,
        infoMessage: 'Verify your email to finish signing in.',
        clearError: true,
      );
    } on AuthException catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _friendlyAuthError(error),
      );
    } on Exception catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _friendlyError(error),
      );
    }
  }

  Future<void> signUp(String email, String password) async {
    state = state.copyWith(
      status: AuthStatus.signingIn,
      clearError: true,
      clearInfoMessage: true,
    );
    try {
      final result = await Amplify.Auth.signUp(
        username: email,
        password: password,
        options: SignUpOptions(
          userAttributes: {CognitoUserAttributeKey.email: email},
        ),
      );
      final next = result.nextStep.signUpStep;
      if (next == AuthSignUpStep.confirmSignUp) {
        state = state.copyWith(
          status: AuthStatus.signedOut,
          needsConfirmation: true,
          pendingConfirmEmail: email,
          infoMessage: 'Check your email for a verification code.',
          clearError: true,
        );
        return;
      }
      // Already done (e.g. autoConfirm).
      state = state.copyWith(
        status: AuthStatus.signedOut,
        needsConfirmation: false,
        clearPendingConfirmEmail: true,
        infoMessage: 'Account created. Sign in below.',
        clearError: true,
      );
    } on UsernameExistsException {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage:
            'An account with this email already exists. Sign in instead.',
      );
    } on AuthException catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _friendlyAuthError(error),
      );
    } on Exception catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _friendlyError(error),
      );
    }
  }

  Future<void> confirmSignUp(String email, String code) async {
    state = state.copyWith(
      status: AuthStatus.signingIn,
      clearError: true,
      clearInfoMessage: true,
    );
    try {
      final result = await Amplify.Auth.confirmSignUp(
        username: email,
        confirmationCode: code,
      );
      if (result.isSignUpComplete) {
        state = state.copyWith(
          status: AuthStatus.signedOut,
          needsConfirmation: false,
          clearPendingConfirmEmail: true,
          infoMessage: 'Email verified. Sign in below.',
          clearError: true,
        );
      } else {
        state = state.copyWith(
          status: AuthStatus.signedOut,
          needsConfirmation: true,
        );
      }
    } on AuthException catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _friendlyAuthError(error),
      );
    } on Exception catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _friendlyError(error),
      );
    }
  }

  Future<void> resendConfirmationCode(String email) async {
    state = state.copyWith(clearError: true, clearInfoMessage: true);
    try {
      await Amplify.Auth.resendSignUpCode(username: email);
      state = state.copyWith(infoMessage: 'Verification code sent.');
    } on AuthException catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _friendlyAuthError(error),
      );
    } on Exception catch (error) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _friendlyError(error),
      );
    }
  }

  void cancelConfirmation() {
    state = state.copyWith(
      needsConfirmation: false,
      clearPendingConfirmEmail: true,
      clearError: true,
      clearInfoMessage: true,
    );
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

String _friendlyAuthError(AuthException error) {
  final message = error.message.trim();
  if (message.isEmpty) {
    return error.runtimeType.toString();
  }
  return message;
}

String _friendlyError(Object error) {
  final str = error.toString();
  // Strip leading "Exception: " noise that Dart adds.
  return str.replaceFirst(RegExp(r'^Exception:\s*'), '');
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
