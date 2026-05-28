import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../../core/theme/app_colors.dart';

class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    const brandRed = Color(0xFFE31E24);

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFFFFFFF),
      body: Stack(
        children: [
          // Ambient Glow Background
          Positioned(
            top: -100,
            left: -100,
            child: Container(
              width: 384,
              height: 384,
              decoration: BoxDecoration(
                color: brandRed.withValues(alpha: 0.05),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: brandRed.withValues(alpha: 0.05),
                    blurRadius: 100,
                  ),
                ],
              ),
            ).animate(onPlay: (controller) => controller.repeat(reverse: true))
             .scale(begin: const Offset(1, 1), end: const Offset(1.1, 1.1), duration: 4.seconds),
          ),
          Positioned(
            bottom: -100,
            right: -100,
            child: Container(
              width: 384,
              height: 384,
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.05),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.blue.withValues(alpha: 0.05),
                    blurRadius: 100,
                  ),
                ],
              ),
            ).animate(onPlay: (controller) => controller.repeat(reverse: true))
             .scale(begin: const Offset(1, 1), end: const Offset(1.1, 1.1), duration: 5.seconds),
          ),
          
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 24.0),
                  child: Column(
                    children: [
                      // Header Section
                      Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.badge_rounded, color: brandRed, size: 36),
                              const SizedBox(width: 12),
                              Text(
                                'Orderlyy ',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5,
                                  color: isDark ? Colors.white : const Color(0xFF1E293B),
                                ),
                              ),
                              Text(
                                'Staff',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5,
                                  color: brandRed,
                                ),
                              ),
                            ],
                          ).animate().fadeIn(duration: 600.ms).slideY(begin: -0.2),
                          const SizedBox(height: 24),
                          Text(
                            'Welcome to Orderlyy Staff',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: isDark ? Colors.white : const Color(0xFF1E293B),
                              height: 1.2,
                            ),
                            textAlign: TextAlign.center,
                          ).animate().fadeIn(delay: 200.ms, duration: 600.ms).slideY(begin: 0.1),
                          const SizedBox(height: 8),
                          Text(
                            'Your Restaurant Companion',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: brandRed,
                              height: 1.2,
                            ),
                            textAlign: TextAlign.center,
                          ).animate().fadeIn(delay: 400.ms, duration: 600.ms).slideY(begin: 0.1),
                        ],
                      ),
                      
                      const Spacer(),
                      
                      // Hero Mockup Section
                      Expanded(
                        flex: 3,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8.0),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Transform.scale(
                                scale: 1.6,
                                child: Image.network(
                                  'https://lh3.googleusercontent.com/aida-public/AB6AXuAzzu5bs1lezhbIUhhSUw7gKmLLEVKpop_nLhoT_e34h8tSkpnhn7gzISlJfQyLD990KD_F-iwZ1vhqGQDzzN3htFmaA5vNomkPwmNzLXSRAbIbJxnLJD-WKYdr3y6BmTYt9ZHRRZ686IB2kgGgtDTzIo0TJdnjKGucLwpSs_ZpkZNTp_JMkGSqZychK4H9kptaJG-4irVhG2Tfu6H4i1oWfShCk9emLJVfe2uMhK852fh4EiDFbewcSbkya8MXd6BiiY1xOiCra7EevyM',
                                  fit: BoxFit.contain,
                                ),
                              ),
                            ],
                          ),
                        ).animate().fadeIn(delay: 600.ms, duration: 800.ms).scale(begin: const Offset(0.9, 0.9)),
                      ),

                      const Spacer(),

                      // Features Grid
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _buildFeatureCard(Icons.receipt_long_rounded, 'View\nOrders', isDark, 800),
                          _buildFeatureCard(Icons.table_restaurant_rounded, 'Manage\nTables', isDark, 900),
                          _buildFeatureCard(Icons.notifications_active_rounded, 'Respond\nto Calls', isDark, 1000),
                          _buildFeatureCard(Icons.restaurant_rounded, 'Track Order\nStatus', isDark, 1100),
                          _buildFeatureCard(Icons.sync_rounded, 'Stay in Sync\nReal-time', isDark, 1200),
                        ],
                      ),
                      
                      const SizedBox(height: 32),
                      
                      // Footer Action Section
                      Column(
                        children: [
                          Text(
                            'Stay connected, serve faster, and deliver exceptional experiences.',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: isDark ? Colors.white70 : const Color(0xFF64748B),
                            ),
                            textAlign: TextAlign.center,
                          ).animate().fadeIn(delay: 1300.ms, duration: 600.ms),
                          const SizedBox(height: 24),
                          SizedBox(
                            width: double.infinity,
                            height: 60,
                            child: FilledButton(
                              onPressed: () {
                                context.push('/org-select');
                              },
                              style: FilledButton.styleFrom(
                                backgroundColor: brandRed,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                elevation: 8,
                                shadowColor: brandRed.withValues(alpha: 0.4),
                              ),
                              child: Text(
                                'Login / Sign Up',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ).animate().fadeIn(delay: 1400.ms, duration: 600.ms).slideY(begin: 0.2),
                          const SizedBox(height: 12),
                          Text(
                            'One app for all your restaurant needs.',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: isDark ? Colors.white54 : const Color(0xFF94A3B8),
                            ),
                          ).animate().fadeIn(delay: 1500.ms, duration: 600.ms),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFeatureCard(IconData icon, String label, bool isDark, int delayMs) {
    return Container(
      width: 75,
      height: 75,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isDark ? Colors.white10 : const Color(0xFFF1F5F9)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.05),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: const Color(0xFFE31E24), size: 24),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              height: 1.1,
              color: isDark ? Colors.white : const Color(0xFF1E293B),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(delay: delayMs.ms, duration: 400.ms).scale(begin: const Offset(0.8, 0.8));
  }
}
