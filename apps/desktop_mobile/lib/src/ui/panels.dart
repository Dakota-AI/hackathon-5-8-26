import 'package:shadcn_flutter/shadcn_flutter.dart';

import 'tokens.dart';

/// Filled card with the agents-cloud panel background, border, and radius.
class AppPanel extends StatelessWidget {
  const AppPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.fillColor,
    this.borderColor,
    this.borderRadius,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? fillColor;
  final Color? borderColor;
  final BorderRadiusGeometry? borderRadius;

  @override
  Widget build(BuildContext context) {
    return Card(
      filled: true,
      fillColor: fillColor ?? Palette.panel,
      borderColor: borderColor ?? Palette.border,
      borderRadius: borderRadius ?? BorderRadius.circular(10),
      boxShadow: const [],
      padding: padding,
      child: child,
    );
  }
}

/// Compact outline pill with a tiny bold label — the workhorse status badge
/// across agents-cloud. The `color` parameter is kept for API symmetry but,
/// per the strict monochrome palette, only the border emphasis varies.
class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.label,
    this.color = Palette.info,
    this.icon,
  });

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Palette.border),
        borderRadius: BorderRadius.circular(999),
        color: Palette.input,
      ),
      padding: EdgeInsets.symmetric(
        horizontal: icon == null ? 10 : 8,
        vertical: 5,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: color),
            const Gap(5),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
              height: 1,
            ),
          ),
        ],
      ),
    );
  }
}

/// Title + subtitle pair used at the top of every panel.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: Palette.text,
                  letterSpacing: -0.2,
                ),
              ),
              if (subtitle != null) ...[
                const Gap(4),
                Text(
                  subtitle!,
                  style: const TextStyle(
                    color: Palette.muted,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[const Gap(8), trailing!],
      ],
    );
  }
}

/// 34x34 brand mark — same shape and proportions as agents-cloud `_LogoMark`,
/// adjusted to call surface (mobile glyph instead of cube).
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 34});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Palette.accent.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(size * 0.3),
        border: Border.all(color: Palette.accent.withValues(alpha: 0.25)),
      ),
      child: Icon(
        RadixIcons.mobile,
        color: Palette.accent,
        size: size * 0.55,
      ),
    );
  }
}

/// Logo + product name + tagline. Drops in a Row.
class BrandHeader extends StatelessWidget {
  const BrandHeader({
    super.key,
    this.title = 'AI Caller',
    this.subtitle = 'Voice agent on call',
    this.trailing,
  });

  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const LogoMark(),
        const Gap(10),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: Palette.text,
                  letterSpacing: -0.2,
                ),
              ),
              const Gap(2),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Palette.muted,
                  fontSize: 11,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// One-line label/value row used in dense status panels.
class StatusRow extends StatelessWidget {
  const StatusRow({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label,
              style: const TextStyle(
                color: Palette.muted,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: Palette.text,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
