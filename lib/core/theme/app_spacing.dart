// lib/core/theme/app_spacing.dart
import 'package:flutter/material.dart';

/// Responsive spacing constants that adapt to screen size
class AppSpacing {
  /// Extra small spacing (4dp base)
  static double xs(BuildContext context) => _scale(context, 4);
  
  /// Small spacing (8dp base)
  static double sm(BuildContext context) => _scale(context, 8);
  
  /// Medium spacing (16dp base)
  static double md(BuildContext context) => _scale(context, 16);
  
  /// Large spacing (24dp base)
  static double lg(BuildContext context) => _scale(context, 24);
  
  /// Extra large spacing (32dp base)
  static double xl(BuildContext context) => _scale(context, 32);
  
  /// Extra extra large spacing (48dp base)
  static double xxl(BuildContext context) => _scale(context, 48);
  
  /// Custom spacing with responsive scaling
  static double custom(BuildContext context, double size) => _scale(context, size);
  
  /// Scale factor based on screen width
  static double _scale(BuildContext context, double size) {
    final width = MediaQuery.of(context).size.width;
    // Base width for design (iPhone 12 Pro)
    const baseWidth = 390.0;
    
    // Calculate scale factor with min/max constraints
    final scaleFactor = (width / baseWidth).clamp(0.8, 1.5);
    
    return size * scaleFactor;
  }
  
  /// Horizontal padding based on screen width
  static EdgeInsets horizontalPadding(BuildContext context) {
    return EdgeInsets.symmetric(horizontal: md(context));
  }
  
  /// Vertical padding based on screen height
  static EdgeInsets verticalPadding(BuildContext context) {
    return EdgeInsets.symmetric(vertical: md(context));
  }
  
  /// All-around padding
  static EdgeInsets allPadding(BuildContext context) {
    return EdgeInsets.all(md(context));
  }
  
  /// Page padding (standard padding for screens)
  static EdgeInsets pagePadding(BuildContext context) {
    return EdgeInsets.symmetric(
      horizontal: md(context),
      vertical: lg(context),
    );
  }
  
  /// Card padding
  static EdgeInsets cardPadding(BuildContext context) {
    return EdgeInsets.all(md(context));
  }
  
  /// Section spacing (vertical gap between sections)
  static SizedBox sectionSpacing(BuildContext context) {
    return SizedBox(height: lg(context));
  }
  
  /// Item spacing (vertical gap between items)
  static SizedBox itemSpacing(BuildContext context) {
    return SizedBox(height: md(context));
  }
  
  /// Small item spacing
  static SizedBox smallItemSpacing(BuildContext context) {
    return SizedBox(height: sm(context));
  }
}

/// Extension on BuildContext for easy spacing access
extension SpacingExtension on BuildContext {
  /// Get responsive spacing
  double spacing(double size) => AppSpacing.custom(this, size);
  
  /// Quick access to common spacings
  double get spacingXs => AppSpacing.xs(this);
  double get spacingSm => AppSpacing.sm(this);
  double get spacingMd => AppSpacing.md(this);
  double get spacingLg => AppSpacing.lg(this);
  double get spacingXl => AppSpacing.xl(this);
  double get spacingXxl => AppSpacing.xxl(this);
}
