import 'package:shadcn_flutter/shadcn_flutter.dart';

/// Strict monochrome palette mirroring agents-cloud/desktop_mobile.
///
/// Status colors are intentionally greyscale — state is communicated by
/// icon + label, not by hue. The one exception is the destructive accent
/// applied to hang-up controls only.
abstract final class Palette {
  static const background = Color(0xFF050505);
  static const sidebar = Color(0xFF070707);
  static const panel = Color(0xFF0D0D0D);
  static const input = Color(0xFF111111);
  static const inputElevated = Color(0xFF161616);
  static const border = Color(0xFF262626);
  static const borderStrong = Color(0xFF333333);
  static const text = Color(0xFFF5F5F5);
  static const muted = Color(0xFFA3A3A3);
  static const subtle = Color(0xFF6F6F6F);
  static const accent = Color(0xFFFFFFFF);

  static const success = Color(0xFFD4D4D4);
  static const warning = Color(0xFFBDBDBD);
  static const info = Color(0xFFE5E5E5);

  static const danger = Color(0xFFB94444);
}
