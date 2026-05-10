# shadcn_flutter UI system for Agents Cloud

_Last updated: 2026-05-09_

## Summary

The Flutter desktop/mobile app should standardize on `shadcn_flutter` for reusable UI primitives and visual language.

Use the package through the declared Flutter dependency.

## Product direction

The Agents Cloud Flutter client should feel:

- minimal
- professional
- black/white first
- dense and workflow-oriented
- closer to a serious operating cockpit than a colorful toy dashboard

Default color policy:

- use black, white, and neutral grays as the core scheme
- avoid blue/green/yellow/cyan dashboard accents by default
- status chips should be neutral unless a later product requirement needs true semantic color
- preserve hierarchy through typography, spacing, borders, opacity, and density rather than color

## Package Usage Notes

`shadcn_flutter` provides a standalone Flutter UI ecosystem that can replace
Material/Cupertino UI for app surfaces while allowing incremental adoption.

Key exported entrypoint:

```dart
import 'package:shadcn_flutter/shadcn_flutter.dart';
```

The package exports:

- `ShadcnApp`
- `ThemeData`
- generated color schemes such as `ColorSchemes.darkNeutral`, `darkSlate`, `darkZinc`
- shadcn layout components such as `Scaffold`, `Card`, `SurfaceCard`, `Divider`, `Resizable`, `Timeline`, `Table`
- shadcn controls such as `Button`, `Toggle`, `Input`, `TextArea`, `Select`, `Checkbox`, `Switch`
- shadcn display/utilities such as `OutlineBadge`, `SecondaryBadge`, `Avatar`, `CodeSnippet`, `Tracker`
- navigation primitives such as `NavigationItem`, `NavigationSidebar`, `NavigationRail`, tabs, menus, pagination
- Radix/Lucide/Bootstrap icon sets
- patched Flutter layout primitives like `Row`, `Column`, `Expanded`, `Flexible`, etc.

## Theming pattern

Use `ShadcnApp` at the root:

```dart
ShadcnApp(
  title: 'Agents Cloud',
  themeMode: ThemeMode.dark,
  theme: const ThemeData.dark(
    colorScheme: ColorSchemes.darkNeutral,
    radius: 0.45,
  ),
  home: const ConsoleShell(),
)
```

Notes:

- `darkNeutral` is the best current fit for black/white minimal UI.
- `darkZinc` is another neutral option if the UI needs slightly cooler contrast.
- `darkSlate` is more blue-toned and should not be the default for Agents Cloud.
- Keep radius modest for a crisp professional interface.

## Current migration slice

The desktop/mobile app now:

- imports `shadcn_flutter` directly instead of importing `package:flutter/material.dart`
- uses `ShadcnApp`
- uses `ThemeData.dark` with `ColorSchemes.darkNeutral`
- uses shadcn `Scaffold`
- uses shadcn `NavigationItem` for sidebar navigation
- uses shadcn `Card` for reusable `_Panel` surfaces
- uses shadcn `OutlineBadge` for `_StatusPill`
- uses Radix icons instead of Material Icons for visible app navigation/icons
- uses a monochrome `_Palette` for remaining local layout composition

## Acceptable Flutter primitives

Raw Flutter primitives are still acceptable when they are just layout or painting glue:

- `Row`
- `Column`
- `Expanded`
- `SizedBox`
- `Padding`
- `Container`
- `ColoredBox`
- `SafeArea`
- `SingleChildScrollView`
- `TextStyle`, `Color`, `EdgeInsets`, `BorderRadius`

But product UI primitives should come from shadcn:

- app root: `ShadcnApp`
- screens: `Scaffold`
- panels: `Card` / `SurfaceCard`
- buttons: `Button`
- nav: `NavigationItem` / `NavigationSidebar`
- badges/status: `OutlineBadge` / `SecondaryBadge`
- forms: `Input`, `TextArea`, `Select`, `Checkbox`, `Switch`
- tables/lists/timeline: shadcn layout/data components where practical
- icons: `RadixIcons` or `LucideIcons`

## Important caveats

`genui` itself still renders some fallback/internal widgets that may use Material-style internals. That is inside the dependency. The Agents Cloud app shell should not add new Material UI dependencies around it.

Do not remove `genui`; it remains the planned A2UI/GenUI bridge.

Do not remove `uses-material-design` or `cupertino_icons` until a separate dependency audit confirms no generated/native/platform code needs them.

## Next migration steps

1. Replace the remaining custom command input container with shadcn `TextArea` or `Input` once we wire actual command entry.
2. Convert the sidebar wrapper from a custom `Container` into full `NavigationSidebar` once mobile/responsive behavior is designed.
3. Replace any remaining hand-styled status rows/timeline dots with shadcn timeline/table primitives.
4. Split `main.dart` into focused feature files after the visual migration is stable.
5. Add a small component catalog/demo page for Agents Cloud-specific shadcn usage.

## Verification commands

Run from:

```text
apps/desktop_mobile
```

Commands:

```bash
dart format lib test
flutter analyze
flutter test
flutter build ios --release --config-only --no-codesign
```
