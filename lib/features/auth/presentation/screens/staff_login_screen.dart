import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:dio/dio.dart';
import '../../../../core/theme/app_colors.dart';
import '../state/auth_notifier.dart';
import '../state/auth_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../../../../core/network/network_providers.dart';

class StaffLoginScreen extends ConsumerStatefulWidget {
  const StaffLoginScreen({super.key});

  @override
  ConsumerState<StaffLoginScreen> createState() => _StaffLoginScreenState();
}

class _StaffLoginScreenState extends ConsumerState<StaffLoginScreen> {
  bool _isEnteringPin = false;
  dynamic _matchedStaff;
  bool _isLoading = false;
  String? _localError;
  
  @override
  void initState() {
    super.initState();
  }

  Future<List<dynamic>> _fetchStaff(String orgId, String branchId) async {
    try {
      final dio = ref.read(dioClientProvider);
      final response = await dio.get(
        '/api/v1/public/organizations/$orgId/branches/$branchId/staff',
        options: Options(extra: {'skip_cache': true}),
      );
      if (response.data != null && response.data['data'] != null) {
        return response.data['data'] as List<dynamic>;
      }
      return [];
    } catch (e) {
      throw Exception('Failed to fetch staff from API');
    }
  }

  final TextEditingController _pinController = TextEditingController();
  final FocusNode _pinFocus = FocusNode();
  final TextEditingController _employeeIdController = TextEditingController();
  final FocusNode _employeeIdFocus = FocusNode();

  @override
  void dispose() {
    _pinController.dispose();
    _pinFocus.dispose();
    _employeeIdController.dispose();
    _employeeIdFocus.dispose();
    super.dispose();
  }

  Future<void> _triggerLogin() async {
    final employeeId = _employeeIdController.text.trim();
    
    if (!_isEnteringPin) {
      if (employeeId.isEmpty) {
        _employeeIdFocus.requestFocus();
        return;
      }
      setState(() {
        _isLoading = true;
        _localError = null;
      });
      try {
        final authState = ref.read(authNotifierProvider);
        final staffList = await _fetchStaff(authState.selectedOrg!.id, authState.selectedBranch!.id);
        final staff = staffList.firstWhere(
          (s) => s['employee_id'] == employeeId,
          orElse: () => null,
        );
        if (staff != null) {
          setState(() {
            _isEnteringPin = true;
            _matchedStaff = staff;
            _isLoading = false;
          });
          Future.microtask(() => _pinFocus.requestFocus());
        } else {
          setState(() {
            _isLoading = false;
            _localError = 'Employee ID not found for this branch.';
          });
        }
      } catch (e) {
        setState(() {
          _isLoading = false;
          _localError = 'Failed to verify Employee ID. Please try again.';
        });
      }
    } else {
      final pin = _pinController.text.trim();
      if (pin.length < 4) {
        _pinFocus.requestFocus();
        return;
      }
      setState(() {
        _isLoading = true;
        _localError = null;
      });
      final success = await ref.read(authNotifierProvider.notifier).login(employeeId, pin);
      setState(() {
        _isLoading = false;
      });
      if (success && mounted) {
        context.go('/shift-start');
      } else if (mounted) {
        _pinController.clear();
        _pinFocus.requestFocus();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    
    final screenWidth = MediaQuery.of(context).size.width;
    final isDesktop = screenWidth >= 768;

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF8F9FA),
      appBar: isDesktop ? null : AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded, color: isDark ? Colors.white : const Color(0xFF0F172A)),
          onPressed: () => context.go('/branch-select'),
        ),
      ),
      extendBodyBehindAppBar: true,
      body: isDesktop ? Center(
        child: SingleChildScrollView(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1000),
            child: Padding(
              padding: const EdgeInsets.all(40.0),
              child: Container(
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.05),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: _buildLeftSection(isDark)),
                      Expanded(child: _buildRightSection(isDark, authState)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ) : Stack(
        children: [
          Positioned.fill(
            child: Container(color: isDark ? const Color(0xFF1E293B) : Colors.white),
          ),
          _buildMobileBackground(),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                child: _buildRightSection(isDark, authState),
              ),
            ),
          ),
        ],
      ).animate().fadeIn(duration: 400.ms),
    );
  }

  Widget _buildLeftSection(bool isDark) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.network(
          'https://lh3.googleusercontent.com/aida-public/AB6AXuBq-2BYWUiyRfwz5zWnvrKnshoLMnuxzhxC-txG08J8KulBeZkyqqrz0zy3AWnwo8FhfgP2ONrJ4EUSE0mL5Cs5AzIDM6uQWFWALKABDy9nYPHvYOlfkuluHBQ7fh7ej0JN5zd5my88DUh2Ogqux43zz5tSLIWTKuwtjB19P1ioiekP91xYvrITQxciFrYmBEBbos6bDhOPh8EQ88kQHdmMOUr02mhpci_Etu9l3TF2s4WJtg64hq8HE_UALFN0cTUF5a7z_O9au-OY',
          fit: BoxFit.cover,
        ),
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.bottomCenter,
              end: Alignment.topCenter,
              colors: [
                const Color(0xFF2E3132).withValues(alpha: 0.8),
                Colors.transparent,
              ],
            ),
          ),
        ),
        if (MediaQuery.of(context).size.width >= 768)
          Positioned(
            top: 24,
            left: 24,
            child: IconButton(
              icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
              onPressed: () => context.go('/branch-select'),
              tooltip: 'Go Back',
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.restaurant_rounded, size: 40, color: Colors.white),
              const SizedBox(height: 12),
              Text(
                'Precision in Every Service.',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 32,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Orderlyy Staff Edition empowers your team with real-time tools for seamless operations.',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildMobileBackground() {
    return Positioned.fill(
      child: Opacity(
        opacity: 0.1,
        child: Image.network(
          'https://lh3.googleusercontent.com/aida-public/AB6AXu-bLjK6ykW7QmqK4EmDRtZ4i6wVdPBFjhn79QSaYXDE43Lt-Z3YQUjJ5ZeIzOtxVJlIO6gyo_2RasqwbMfEfAoUCjwVLRanEPl1hygqATwYnGQ8Xcvfbnt4M5Ryq8dS1640ASFelRgJjw01C4rrke-Q5nh8_rf8ZX5jwDLKHrr1i2ncj8-2-v74nUlppmmDw0Uq4QwwIOIABaitSKc1DFMmyCs2nzZM4KuzXr_Hc-8LYyDsRH78LfmGklwIVdVA0hauiP4pMRDzNwr',
          fit: BoxFit.cover,
        ),
      ),
    );
  }

  Widget _buildRightSection(bool isDark, AuthState authState) {
    final theme = Theme.of(context);
    final displayedError = _localError ?? authState.errorMessage;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 48.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Branding
          Column(
            crossAxisAlignment: MediaQuery.of(context).size.width >= 768 ? CrossAxisAlignment.start : CrossAxisAlignment.center,
            children: [
              Text(
                'Orderlyy',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 40,
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFFE31E24),
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(100),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.badge_rounded, size: 16, color: Color(0xFFE31E24)),
                    const SizedBox(width: 6),
                    Text(
                      'STAFF EDITION',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1,
                        color: isDark ? Colors.white70 : const Color(0xFF475569),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 48),

          // Form Wizard - Step 1: Employee ID
          if (!_isEnteringPin) ...[
            Text(
              'Employee ID',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _employeeIdController,
              focusNode: _employeeIdFocus,
              keyboardType: TextInputType.text,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
              decoration: InputDecoration(
                hintText: 'Enter Employee ID',
                hintStyle: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  color: isDark ? Colors.white54 : const Color(0xFF94A3B8),
                ),
                prefixIcon: Icon(Icons.person_rounded, color: isDark ? Colors.white54 : const Color(0xFF64748B)),
                filled: true,
                fillColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8F9FA),
                contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFFE31E24)),
                ),
              ),
              onSubmitted: (_) => _triggerLogin(),
            ),
          ],

          // Form Wizard - Step 2: PIN
          if (_isEnteringPin) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFE31E24).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE31E24).withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.account_circle, color: Color(0xFFE31E24)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _matchedStaff?['name'] ?? 'Staff Member',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: isDark ? Colors.white : const Color(0xFF0F172A),
                          ),
                        ),
                        Text(
                          'Role: ${(_matchedStaff?['role'] as String? ?? 'waiter').toUpperCase()}',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: isDark ? Colors.white54 : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Secure PIN',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _pinController,
              focusNode: _pinFocus,
              keyboardType: TextInputType.number,
              obscureText: true,
              maxLength: 4,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
              decoration: InputDecoration(
                counterText: '',
                hintText: '••••',
                hintStyle: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  color: isDark ? Colors.white54 : const Color(0xFF94A3B8),
                ),
                prefixIcon: Icon(Icons.lock_rounded, color: isDark ? Colors.white54 : const Color(0xFF64748B)),
                filled: true,
                fillColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8F9FA),
                contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFFE31E24)),
                ),
              ),
              onSubmitted: (_) => _triggerLogin(),
            ),
          ],

          if (displayedError != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                displayedError,
                style: const TextStyle(
                  color: AppColors.error,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ),
          ],

          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _isLoading ? null : _triggerLogin,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFE31E24),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              elevation: 0,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_isLoading)
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                  )
                else ...[
                  Text(
                    _isEnteringPin ? 'Access Terminal' : 'Continue',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.arrow_forward_rounded, size: 20),
                ]
              ],
            ),
          ),

          if (_isEnteringPin) ...[
            const SizedBox(height: 16),
            Center(
              child: TextButton(
                onPressed: () {
                  setState(() {
                    _isEnteringPin = false;
                    _pinController.clear();
                    _localError = null;
                  });
                  Future.microtask(() => _employeeIdFocus.requestFocus());
                },
                child: Text(
                  'Change Employee ID',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF64748B),
                  ),
                ),
              ),
            ),
          ],

          const SizedBox(height: 32),
          // Links
          Center(
            child: TextButton(
              onPressed: () {},
              child: Text(
                'Forgot PIN? Contact Manager',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFFE31E24),
                ),
              ),
            ),
          ),
          
          const SizedBox(height: 16),
          Center(
            child: Text(
              'Secure Staff Portal v2.4',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                color: isDark ? Colors.white54 : const Color(0xFF64748B),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
