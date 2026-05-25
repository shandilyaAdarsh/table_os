// lib/core/widgets/responsive_builder.dart
import 'package:flutter/material.dart';

/// A widget that rebuilds when screen size changes
/// Useful for creating responsive layouts
class ResponsiveBuilder extends StatelessWidget {
  final Widget Function(BuildContext context, BoxConstraints constraints) builder;

  const ResponsiveBuilder({
    super.key,
    required this.builder,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return builder(context, constraints);
      },
    );
  }
}

/// A widget that provides different layouts based on screen size
class ResponsiveLayout extends StatelessWidget {
  final Widget mobile;
  final Widget? tablet;
  final Widget? desktop;
  final double mobileBreakpoint;
  final double tabletBreakpoint;

  const ResponsiveLayout({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
    this.mobileBreakpoint = 600,
    this.tabletBreakpoint = 900,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;

        if (width >= tabletBreakpoint && desktop != null) {
          return desktop!;
        } else if (width >= mobileBreakpoint && tablet != null) {
          return tablet!;
        } else {
          return mobile;
        }
      },
    );
  }
}

/// Extension to get responsive values based on screen size
extension ResponsiveValue on BuildContext {
  T responsive<T>({
    required T mobile,
    T? tablet,
    T? desktop,
    double mobileBreakpoint = 600,
    double tabletBreakpoint = 900,
  }) {
    final width = MediaQuery.of(this).size.width;

    if (width >= tabletBreakpoint && desktop != null) {
      return desktop;
    } else if (width >= mobileBreakpoint && tablet != null) {
      return tablet;
    } else {
      return mobile;
    }
  }
}

/// Responsive padding helper
class ResponsivePadding extends StatelessWidget {
  final Widget child;
  final double mobile;
  final double? tablet;
  final double? desktop;

  const ResponsivePadding({
    super.key,
    required this.child,
    required this.mobile,
    this.tablet,
    this.desktop,
  });

  @override
  Widget build(BuildContext context) {
    final padding = context.responsive<double>(
      mobile: mobile,
      tablet: tablet,
      desktop: desktop,
    );

    return Padding(
      padding: EdgeInsets.all(padding),
      child: child,
    );
  }
}

/// Responsive SizedBox helper
class ResponsiveGap extends StatelessWidget {
  final double mobile;
  final double? tablet;
  final double? desktop;
  final bool isHorizontal;

  const ResponsiveGap({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
    this.isHorizontal = false,
  });

  const ResponsiveGap.vertical({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
  }) : isHorizontal = false;

  const ResponsiveGap.horizontal({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
  }) : isHorizontal = true;

  @override
  Widget build(BuildContext context) {
    final size = context.responsive<double>(
      mobile: mobile,
      tablet: tablet,
      desktop: desktop,
    );

    return SizedBox(
      width: isHorizontal ? size : null,
      height: !isHorizontal ? size : null,
    );
  }
}
