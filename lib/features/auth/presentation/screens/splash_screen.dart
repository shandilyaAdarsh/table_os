// lib/features/auth/presentation/screens/splash_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../state/auth_notifier.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with SingleTickerProviderStateMixin {
  double _progress = 0.0;
  String _statusText = 'Initializing Runtime...';
  IconData _statusIcon = Icons.settings;
  bool _isSpinning = true;
  int _currentStepIndex = 0;

  final List<Map<String, dynamic>> _bootSteps = [
    {
      'text': 'Initializing Runtime...',
      'progress': 0.20,
      'icon': Icons.settings,
      'spin': true,
      'duration': 600,
    },
    {
      'text': 'Validating Device Identity...',
      'progress': 0.45,
      'icon': Icons.admin_panel_settings_rounded,
      'spin': false,
      'duration': 800,
    },
    {
      'text': 'Establishing Realtime Socket...',
      'progress': 0.75,
      'icon': Icons.router_rounded,
      'spin': true,
      'duration': 1200,
    },
    {
      'text': 'Syncing Menu Projections...',
      'progress': 0.95,
      'icon': Icons.sync_rounded,
      'spin': true,
      'duration': 1500,
    },
    {
      'text': 'Ready to Serve',
      'progress': 1.0,
      'icon': Icons.check_circle_rounded,
      'spin': false,
      'duration': 500,
    },
  ];

  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
    _runBootSequence();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _runBootSequence() async {
    await Future.delayed(500.ms);
    for (int i = 0; i < _bootSteps.length; i++) {
      if (!mounted) return;
      final step = _bootSteps[i];
      setState(() {
        _currentStepIndex = i;
        _statusText = step['text'] as String;
        _progress = step['progress'] as double;
        _statusIcon = step['icon'] as IconData;
        _isSpinning = step['spin'] as bool;
      });
      await Future.delayed((step['duration'] as int).ms);
    }

    if (!mounted) return;
    _navigateNext();
  }

  void _navigateNext() {
    final authState = ref.read(authNotifierProvider);
    if (authState.selectedOrg == null) {
      context.go('/welcome');
    } else if (authState.selectedBranch == null) {
      context.go('/branch-select');
    } else if (authState.loggedInStaff == null) {
      context.go('/login');
    } else if (!authState.isShiftStarted) {
      context.go('/shift-start');
    } else {
      context.go('/tables');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    const brandRed = Color(0xFFE31E24);

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF8F9FA),
      body: Stack(
        children: [
          // ── Background Culinary Watermark ─────────────────────────────────
          Positioned.fill(
            child: Opacity(
              opacity: isDark ? 0.015 : 0.03,
              child: Image.network(
                'https://lh3.googleusercontent.com/aida-public/AB6AXuAZpTruylWYjT5aYuPT27GXEMSnuQeu3GrM6NBNF3qeVWFkH7p7MU1b-GJn9InvNH10SLI2i7fMLXozXv2rQbFSrqqTJoTvXUE_WJu-6nJuUq8TQaifAkqVAlGB-dgd9MKb2LwGttykrJFdy6xvE3t_ZULSdPKUfoQkHeOe-RoABZa803vpyQbiMr-IGgw1jROmHZC2Lhx8-jXnj9unhrdWtgh7brnm-oL7N-ADg4lDRS2jlevVc3Qbuoh5TYsSwtvaqcx3b0KaSHE9',
                fit: BoxFit.cover,
              ),
            ),
          ),

          // ── Main Content Layout ──────────────────────────────────────────
          SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24.0),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const SizedBox(height: 40),
                            // ── Pulsing Hero Graphic ─────────────────────────
                            Stack(
                              alignment: Alignment.center,
                              children: [
                                // Glowing outer pulse ring
                                ScaleTransition(
                                  scale: Tween<double>(begin: 0.8, end: 1.5).animate(
                                    CurvedAnimation(
                                      parent: _pulseController,
                                      curve: Curves.easeOut,
                                    ),
                                  ),
                                  child: FadeTransition(
                                    opacity: Tween<double>(begin: 0.5, end: 0.0).animate(
                                      CurvedAnimation(
                                        parent: _pulseController,
                                        curve: Curves.easeOut,
                                      ),
                                    ),
                                    child: Container(
                                      width: 140,
                                      height: 140,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        border: Border.all(color: brandRed, width: 2),
                                      ),
                                    ),
                                  ),
                                ),

                                // Hero Icon Container
                                Container(
                                  width: 120,
                                  height: 120,
                                  decoration: BoxDecoration(
                                    color: isDark ? AppColors.darkSurface : Colors.white,
                                    shape: BoxShape.circle,
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.04),
                                        blurRadius: 12,
                                        offset: const Offset(0, 4),
                                      )
                                    ],
                                  ),
                                  child: Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      Positioned.fill(
                                        child: Opacity(
                                          opacity: 0.06,
                                          child: Container(
                                            decoration: const BoxDecoration(
                                              shape: BoxShape.circle,
                                              gradient: LinearGradient(
                                                begin: Alignment.topRight,
                                                end: Alignment.bottomLeft,
                                                colors: [brandRed, Colors.transparent],
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      const Icon(
                                        Icons.room_service_outlined,
                                        size: 58,
                                        color: brandRed,
                                      ).animate().scale(delay: 150.ms, duration: 400.ms, curve: Curves.easeOutBack),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 36),

                            // ── Headline & Subtitle ──────────────────────────
                            Text(
                              'Ready for Service?',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 34,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.8,
                                color: isDark ? Colors.white : AppColors.lightTextPrimary,
                              ),
                            ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.2, end: 0, curve: Curves.easeOutCubic),
                            const SizedBox(height: 8),
                            Text(
                              "Let's make today delicious.",
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 16,
                                fontWeight: FontWeight.w500,
                                color: isDark ? AppColors.darkTextSecondary : const Color(0xFF5D3F3C),
                              ),
                            ).animate().fadeIn(delay: 100.ms, duration: 400.ms),
                            const SizedBox(height: 48),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

                // ── Bottom Progress / Boot Sequence Panel ─────────────────────
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 24.0),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Boot Progress Box
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: isDark ? AppColors.darkSurfaceCard : Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: isDark ? AppColors.darkBorder : const Color(0xFFE7E8E9),
                              width: 1,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.03),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              )
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Row(
                                      children: [
                                        // Spin/Static Icon
                                        AnimatedRotation(
                                          turns: _isSpinning ? 1.0 : 0.0,
                                          duration: const Duration(seconds: 2),
                                          curve: Curves.linear,
                                          child: Icon(
                                            _statusIcon,
                                            size: 16,
                                            color: brandRed,
                                          ),
                                        ).animate(
                                          onPlay: (controller) {
                                            if (_isSpinning) {
                                              controller.repeat();
                                            }
                                          },
                                        ).rotate(
                                          duration: 1000.ms,
                                          begin: 0,
                                          end: 1,
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: AnimatedSwitcher(
                                            duration: 200.ms,
                                            child: Text(
                                              _statusText,
                                              key: ValueKey<String>(_statusText),
                                              style: GoogleFonts.plusJakartaSans(
                                                fontSize: 12,
                                                fontWeight: _currentStepIndex == _bootSteps.length - 1
                                                    ? FontWeight.bold
                                                    : FontWeight.w600,
                                                color: _currentStepIndex == _bootSteps.length - 1
                                                    ? brandRed
                                                    : (isDark ? AppColors.darkTextSecondary : const Color(0xFF5D3F3C)),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    '${(_progress * 100).toInt()}%',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                      color: brandRed,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              // ── Custom Linear Progress Bar ────────────────
                              ClipRRect(
                                borderRadius: BorderRadius.circular(99),
                                child: Container(
                                  height: 4,
                                  width: double.infinity,
                                  color: isDark ? Colors.grey[850] : const Color(0xFFE1E3E4),
                                  child: Align(
                                    alignment: Alignment.centerLeft,
                                    child: AnimatedContainer(
                                      duration: 300.ms,
                                      curve: Curves.easeOutCubic,
                                      height: double.infinity,
                                      width: MediaQuery.of(context).size.width * 0.9 * _progress,
                                      decoration: BoxDecoration(
                                        color: brandRed,
                                        borderRadius: BorderRadius.circular(99),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ).animate().fadeIn(delay: 200.ms, duration: 400.ms).slideY(begin: 0.1, end: 0),
                        const SizedBox(height: 24),

                        // ── Footer Branding ──────────────────────────────────
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: isDark ? AppColors.darkSurface : const Color(0xFFEDEEEF),
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(
                              color: isDark ? AppColors.darkBorder : const Color(0xFFE7E8E9),
                              width: 1,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.badge_outlined,
                                size: 12,
                                color: isDark ? AppColors.darkTextSecondary : const Color(0xFF5D5E61),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'STAFF EDITION',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.6,
                                  color: isDark ? AppColors.darkTextSecondary : const Color(0xFF5D5E61),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Orderlyy',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: isDark ? Colors.white30 : Colors.black12,
                            letterSpacing: -0.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

