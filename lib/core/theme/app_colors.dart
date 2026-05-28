// lib/core/theme/app_colors.dart
import 'package:flutter/material.dart';

class AppColors {
  // Brand Colors
  static const Color primary = Color(0xFFE31E24); // Primary Red
  static const Color secondary = Color(0xFF1A1C1E); // Secondary Dark Slate

  // Dark Mode Palette
  static const Color darkBackground = Color(0xFF121214);
  static const Color darkSurface = Color(0xFF1E1E22);
  static const Color darkSurfaceCard = Color(0xFF26262B);
  static const Color darkTextPrimary = Color(0xFFF1F1F5);
  static const Color darkTextSecondary = Color(0xFFA5A5B1);

  // Light Mode Palette
  static const Color lightBackground = Color(0xFFF8F9FA);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceCard = Color(0xFFF1F3F5);
  static const Color lightTextPrimary = Color(0xFF212529);
  static const Color lightTextSecondary = Color(0xFF6C757D);

  // Semantic Colors
  static const Color success = Color(0xFF2EC4B6); // Clean teal
  static const Color error = Color(0xFFE71D36); // Crimson red
  static const Color warning = Color(0xFFFF9F1C); // Amber warning
  static const Color info = Color(0xFF011627); // Dark navy

  // Neutral borders
  static const Color darkBorder = Color(0xFF2C2C35);
  static const Color lightBorder = Color(0xFFE9ECEF);
}
