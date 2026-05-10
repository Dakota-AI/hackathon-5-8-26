import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

import 'package:desktop_mobile/src/auth/auth_controller.dart';
import 'package:desktop_mobile/src/ui/brand_mark.dart';
import 'package:desktop_mobile/src/widgets/squares_loader.dart';

/// When set to true, the app skips the sign-in gate and uses local
/// fixture data instead of a real backend session.
const _authBypassDefault = bool.fromEnvironment('AGENTS_CLOUD_AUTH_BYPASS');

final authBypassProvider = StateProvider<bool>((ref) => _authBypassDefault);

class _Palette {
  static const background = Color(0xFF050505);
  static const card = Color(0xFF0D0D0D);
  static const border = Color(0xFF262626);
  static const text = Color(0xFFF5F5F5);
  static const muted = Color(0xFFA3A3A3);
  static const danger = Color(0xFFEF4444);
  static const info = Color(0xFFA3A3A3);
}

class SignInPage extends ConsumerStatefulWidget {
  const SignInPage({super.key});

  @override
  ConsumerState<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends ConsumerState<SignInPage> {
  int _tab = 0; // 0 = sign in, 1 = sign up

  final _signInEmail = TextEditingController();
  final _signInPassword = TextEditingController();

  final _signUpEmail = TextEditingController();
  final _signUpPassword = TextEditingController();

  final _confirmCode = TextEditingController();

  @override
  void dispose() {
    _signInEmail.dispose();
    _signInPassword.dispose();
    _signUpEmail.dispose();
    _signUpPassword.dispose();
    _confirmCode.dispose();
    super.dispose();
  }

  Future<void> _onSignIn() async {
    await ref
        .read(authControllerProvider.notifier)
        .signIn(_signInEmail.text.trim(), _signInPassword.text);
  }

  Future<void> _onSignUp() async {
    final email = _signUpEmail.text.trim();
    await ref
        .read(authControllerProvider.notifier)
        .signUp(email, _signUpPassword.text);
  }

  Future<void> _onConfirm(String email) async {
    await ref
        .read(authControllerProvider.notifier)
        .confirmSignUp(email, _confirmCode.text.trim());
    if (!mounted) return;
    final state = ref.read(authControllerProvider);
    if (state.errorMessage == null && !state.needsConfirmation) {
      _confirmCode.clear();
      // Pre-populate the sign-in form with the confirmed email.
      if (_signInEmail.text.isEmpty) _signInEmail.text = email;
      setState(() => _tab = 0);
    }
  }

  Future<void> _onResend(String email) async {
    await ref
        .read(authControllerProvider.notifier)
        .resendConfirmationCode(email);
  }

  void _cancelConfirm() {
    _confirmCode.clear();
    ref.read(authControllerProvider.notifier).cancelConfirmation();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final busy = auth.status == AuthStatus.signingIn;
    final inConfirmFlow =
        auth.needsConfirmation &&
        (auth.pendingConfirmEmail?.isNotEmpty ?? false);

    return Scaffold(
      backgroundColor: _Palette.background,
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    decoration: BoxDecoration(
                      color: _Palette.card,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: _Palette.border),
                    ),
                    padding: const EdgeInsets.all(22),
                    child: inConfirmFlow
                        ? _buildConfirmCard(auth, busy)
                        : _buildAuthCard(auth, busy),
                  ),
                  const SizedBox(height: 14),
                  Button.ghost(
                    onPressed: busy
                        ? null
                        : () => ref.read(authBypassProvider.notifier).state =
                              true,
                    child: const Text(
                      'Continue without sign-in (local fixtures)',
                      style: TextStyle(color: _Palette.muted, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ---- Sign in / Sign up card ----------------------------------------

  Widget _buildAuthCard(AuthState auth, bool busy) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(
          title: _tab == 0 ? 'Sign in' : 'Create account',
          subtitle: _tab == 0
              ? 'Continue to your workspace'
              : 'Set up access to your workspace',
        ),
        const SizedBox(height: 18),
        Tabs(
          index: _tab,
          onChanged: busy ? (_) {} : (i) => setState(() => _tab = i),
          children: const [
            TabItem(child: Text('Sign in')),
            TabItem(child: Text('Sign up')),
          ],
        ),
        const SizedBox(height: 16),
        _tab == 0 ? _buildSignIn(busy) : _buildSignUp(busy),
        if (auth.infoMessage != null) ...[
          const SizedBox(height: 12),
          Text(
            auth.infoMessage!,
            style: const TextStyle(
              color: _Palette.info,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        if (auth.errorMessage != null) ...[
          const SizedBox(height: 12),
          Text(
            auth.errorMessage!,
            style: const TextStyle(
              color: _Palette.danger,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }

  // ---- Confirm card (replaces the auth tabs entirely while needed) ----

  Widget _buildConfirmCard(AuthState auth, bool busy) {
    final email = auth.pendingConfirmEmail ?? '';
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(
          title: 'Verify your email',
          subtitle: 'Enter the 6-digit code sent to $email.',
        ),
        const SizedBox(height: 18),
        TextField(
          controller: _confirmCode,
          enabled: !busy,
          keyboardType: TextInputType.number,
          placeholder: const Text('Verification code'),
          onSubmitted: (_) => busy ? null : _onConfirm(email),
        ),
        const SizedBox(height: 14),
        _buildPrimaryRow(
          busy: busy,
          label: 'Verify and continue',
          onPressed: () => _onConfirm(email),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Button.ghost(
              enabled: !busy,
              onPressed: busy ? null : _cancelConfirm,
              child: const Text(
                'Back',
                style: TextStyle(color: _Palette.muted, fontSize: 12),
              ),
            ),
            Button.ghost(
              enabled: !busy,
              onPressed: busy ? null : () => _onResend(email),
              child: const Text(
                'Resend code',
                style: TextStyle(color: _Palette.muted, fontSize: 12),
              ),
            ),
          ],
        ),
        if (auth.infoMessage != null) ...[
          const SizedBox(height: 12),
          Text(
            auth.infoMessage!,
            style: const TextStyle(
              color: _Palette.info,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        if (auth.errorMessage != null) ...[
          const SizedBox(height: 12),
          Text(
            auth.errorMessage!,
            style: const TextStyle(
              color: _Palette.danger,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }

  // ---- Shared bits ----------------------------------------------------

  Widget _buildHeader({required String title, required String subtitle}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: _Palette.background,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: _Palette.border),
            ),
            child: const BrandMark(size: 20),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          title,
          style: const TextStyle(
            color: _Palette.text,
            fontSize: 22,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: const TextStyle(color: _Palette.muted, fontSize: 13),
        ),
      ],
    );
  }

  Widget _buildSignIn(bool busy) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _signInEmail,
          enabled: !busy,
          placeholder: const Text('Email'),
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _signInPassword,
          enabled: !busy,
          obscureText: true,
          placeholder: const Text('Password'),
          onSubmitted: (_) => busy ? null : _onSignIn(),
        ),
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerRight,
          child: Button.ghost(
            enabled: false,
            onPressed: () {},
            child: const Text(
              'Forgot password?',
              style: TextStyle(color: _Palette.muted, fontSize: 11),
            ),
          ),
        ),
        const SizedBox(height: 8),
        _buildPrimaryRow(busy: busy, label: 'Sign in', onPressed: _onSignIn),
      ],
    );
  }

  Widget _buildSignUp(bool busy) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _signUpEmail,
          enabled: !busy,
          placeholder: const Text('Email'),
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _signUpPassword,
          enabled: !busy,
          obscureText: true,
          placeholder: const Text('Password (8+ characters)'),
          onSubmitted: (_) => busy ? null : _onSignUp(),
        ),
        const SizedBox(height: 14),
        _buildPrimaryRow(
          busy: busy,
          label: 'Create account',
          onPressed: _onSignUp,
        ),
      ],
    );
  }

  Widget _buildPrimaryRow({
    required bool busy,
    required String label,
    required Future<void> Function() onPressed,
  }) {
    return Row(
      children: [
        Expanded(
          child: Button.primary(
            enabled: !busy,
            onPressed: busy ? null : () => onPressed(),
            child: Text(label),
          ),
        ),
        if (busy) ...[
          const SizedBox(width: 10),
          const SquaresLoader(size: 24, color: _Palette.text),
        ],
      ],
    );
  }
}
