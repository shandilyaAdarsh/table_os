// lib/core/utils/responsive.dart
import 'package:flutter/material.dart';
import 'dart:math' as math;

/// Responsive utility class for adaptive UI across different screen sizes
class Responsive {
  final BuildContext context;
  
  Responsive(this.context);

  /// Get screen width
  double get width => MediaQuery.of(context).size.width;
  
  /// Get screen height
  double get height => MediaQuery.of(context).size.height;
  
  /// Get screen diagonal
  double get diagonal {
    final size = MediaQuery.of(context).size;
    return math.sqrt(math.pow(size.width, 2) + math.pow(size.height, 2));
  }
  
  /// Check if device is in portrait mode
  bool get isPortrait => MediaQuery.of(context).orientation == Orientation.portrait;
  
  /// Check if device is in landscape mode
  bool get isLandscape => MediaQuery.of(context).orientation == Orientation.landscape;
  
  /// Device type detection
  bool get isMobile => width < 600;
  bool get isTablet => width >= 600 && width < 900;
  bool get isDesktop => width >= 900;
  
  /// Responsive width based on percentage
  double wp(double percentage) => width * percentage / 100;
  
  /// Responsive height based on percentage
  double hp(double percentage) => height * percentage / 100;
  
  /// Responsive font size based on screen width
  double sp(double size) {
    // Base width for design (iPhone 12 Pro)
    const baseWidth = 390.0;
    final scaleFactor = width / baseWidth;
    return size * scaleFactor;
  }
  
  /// Responsive spacing
  double spacing(double size) {
    const baseWidth = 390.0;
    final scaleFactor = width / baseWidth;
    return size * scaleFactor;
  }
  
  /// Get safe area padding
  EdgeInsets get safeAreaPadding => MediaQuery.of(context).padding;
  
  /// Get bottom safe area (for notched devices)
  double get bottomSafeArea => MediaQuery.of(context).padding.bottom;
  
  /// Get top safe area (for notched devices)
  double get topSafeArea => MediaQuery.of(context).padding.top;
}

/// Extension on BuildContext for easy access to Responsive utilities
extension ResponsiveExtension on BuildContext {
  Responsive get responsive => Responsive(this);
  
  /// Quick access to screen width
  double get screenWidth => MediaQuery.of(this).size.width;
  
  /// Quick access to screen height
  double get screenHeight => MediaQuery.of(this).size.height;
  
  /// Quick access to device pixel ratio
  double get pixelRatio => MediaQuery.of(this).devicePixelRatio;
  
  /// Check if keyboard is visible
  bool get isKeyboardVisible => MediaQuery.of(this).viewInsets.bottom > 0;
  
  /// Responsive width percentage
  double widthPercent(double percentage) => screenWidth * percentage / 100;
  
  /// Responsive height percentage
  double heightPercent(double percentage) => screenHeight * percentage / 100;
}

/// Extension on num for responsive sizing
/// Note: These extensions require a BuildContext to work properly
/// Use them within widget build methods where context is available
extension ResponsiveSizing on num {
  // These are helper methods that should be used with context
  // Example: 16.toResponsiveWidth(context)
  double toResponsiveWidth(BuildContext context) => Responsive(context).wp(toDouble());
  double toResponsiveHeight(BuildContext context) => Responsive(context).hp(toDouble());
  double toResponsiveFontSize(BuildContext context) => Responsive(context).sp(toDouble());
  double toResponsiveSpacing(BuildContext context) => Responsive(context).spacing(toDouble());
}
