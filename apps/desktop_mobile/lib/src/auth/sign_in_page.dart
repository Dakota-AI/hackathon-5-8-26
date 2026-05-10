import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

import 'package:desktop_mobile/src/auth/auth_controller.dart';
import 'package:desktop_mobile/src/widgets/squares_loader.dart';

/// When set to true, the app skips the sign-in gate and uses local
/// fixture data instead of a real backend session.
final authBypassProvider = StateProvider<bool>((ref) => false);

class _Palette {
  static const background = Color(0xFF050505);
  static const card = Color(0xFF0D0D0D);
  static const border = Color(0xFF262626);
  static const text = Color(0xFFF5F5F5);
  static const muted = Color(0xFFA3A3A3);
  static const danger = Color(0xFFEF4444);
}

class SignInPage extends ConsumerStatefulWidget {
  const SignInPage({super.key});

  @override
  ConsumerState<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends ConsumerState<SignInPage> {
  int _tab = 0; // 0 = sign in, 1 = sign up, 2 = confirm

  final _signInEmail = TextEditingController();
  final _signInPassword = TextEditingController();

  final _signUpEmail = TextEditingController();
  final _signUpPassword = TextEditingController();

  final _confirmEmail = TextEditingController();
  final _confirmCode = TextEditingController();

  @override
  void dispose() {
    _signInEmail.dispose();
    _signInPassword.dispose();
    _signUpEmail.dispose();
    _signUpPassword.dispose();
    _confirmEmail.dispose();
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
    final state = ref.read(authControllerProvider);
    if (!mounted) return;
    if (state.errorMessage == null) {
      setState(() {
        _tab = 2;
        if (_confirmEmail.text.isEmpty) _confirmEmail.text = email;
      });
    }
  }

  Future<void> _onConfirm() async {
    await ref
        .read(authControllerProvider.notifier)
        .confirmSignUp(_confirmEmail.text.trim(), _confirmCode.text.trim());
    final state = ref.read(authControllerProvider);
    if (!mounted) return;
    if (state.errorMessage == null) {
      setState(() {
        _tab = 0;
        if (_signInEmail.text.isEmpty) _signInEmail.text = _confirmEmail.text;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final busy = auth.status == AuthStatus.signingIn;

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
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
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
                            child: const Icon(
                              RadixIcons.cube,
                              size: 18,
                              color: _Palette.text,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        const Text(
                          'Agents Cloud',
                          style: TextStyle(
                            color: _Palette.text,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Sign in to continue',
                          style: TextStyle(color: _Palette.muted, fontSize: 13),
                        ),
                        const SizedBox(height: 18),
                        Tabs(
                          index: _tab,
                          onChanged: busy
                              ? (_) {}
                              : (i) => setState(() => _tab = i),
                          children: const [
                            TabItem(child: Text('Sign in')),
                            TabItem(child: Text('Sign up')),
                            TabItem(child: Text('Confirm')),
                          ],
                        ),
                        const SizedBox(height: 16),
                        _buildTabBody(busy),
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
                    ),
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

  Widget _buildTabBody(bool busy) {
    switch (_tab) {
      case 1:
        return _buildSignUp(busy);
      case 2:
        return _buildConfirm(busy);
      case 0:
      default:
        return _buildSignIn(busy);
    }
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
          placeholder: const Text('Password'),
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

  Widget _buildConfirm(bool busy) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _confirmEmail,
          enabled: !busy,
          placeholder: const Text('Email'),
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _confirmCode,
          enabled: !busy,
          placeholder: const Text('Confirmation code'),
          onSubmitted: (_) => busy ? null : _onConfirm(),
        ),
        const SizedBox(height: 14),
        _buildPrimaryRow(busy: busy, label: 'Confirm', onPressed: _onConfirm),
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
