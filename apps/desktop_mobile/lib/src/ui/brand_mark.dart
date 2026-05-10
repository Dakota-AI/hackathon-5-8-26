import 'package:flutter/widgets.dart';

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 18, this.semanticLabel});

  static const assetName = 'assets/brand/logo-mark-white.png';

  final double size;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      assetName,
      width: size,
      height: size,
      fit: BoxFit.contain,
    );

    if (semanticLabel == null) {
      return ExcludeSemantics(child: image);
    }

    return Semantics(image: true, label: semanticLabel, child: image);
  }
}
