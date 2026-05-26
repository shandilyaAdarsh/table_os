// lib/features/auth/presentation/screens/staff_login_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../state/auth_notifier.dart';

class StaffLoginScreen extends ConsumerStatefulWidget {
  const StaffLoginScreen({super.key});

  @override
  ConsumerState<StaffLoginScreen> createState() => _StaffLoginScreenState();
}

class _StaffLoginScreenState extends ConsumerState<StaffLoginScreen> {
  String _pinCode = '';

  void _onKeyPress(String val) {
    if (_pinCode.length >= 4) return;
    setState(() {
      _pinCode += val;
    });

    if (_pinCode.length == 4) {
      _triggerLogin();
    }
  }

  void _onDelete() {
    if (_pinCode.isEmpty) return;
    setState(() {
      _pinCode = _pinCode.substring(0, _pinCode.length - 1);
    });
  }

  Future<void> _triggerLogin() async {
    final success = await ref.read(authNotifierProvider.notifier).loginWithPIN(_pinCode);
    if (success && mounted) {
      context.go('/shift-start');
    } else if (mounted) {
      setState(() {
        _pinCode = '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff Authentication'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go('/branch-select'),
        ),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.lock_person_rounded,
                  size: 64,
                  color: AppColors.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'Enter Employee PIN',
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  'Enter your 4-digit operational shift passcode.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                  ),
                ),
                const SizedBox(height: 32),
                
                // Pin Indicators row
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(4, (index) {
                    final isActive = index < _pinCode.length;
                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 12),
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isActive ? AppColors.primary : Colors.transparent,
                        border: Border.all(
                          color: isDark ? Colors.white30 : Colors.black26,
                          width: 2,
                        ),
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 16),
                
                // Error Alert Box
                if (authState.errorMessage != null)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      authState.errorMessage!,
                      style: const TextStyle(
                        color: AppColors.error,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                
                const SizedBox(height: 32),
                
                // Numeric Keypad Grid
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 3,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  childAspectRatio: 1.3,
                  children: [
                    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) {
                      return OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        onPressed: () => _onKeyPress(digit),
                        child: Text(
                          digit,
                          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                        ),
                      );
                    }),
                    IconButton(
                      icon: const Icon(Icons.fingerprint_rounded, size: 28, color: AppColors.primary),
                      onPressed: () async {
                        // Mock biometric bypass for testing convenience
                        await ref.read(authNotifierProvider.notifier).loginWithPIN('1234');
                        if (mounted) context.go('/shift-start');
                      },
                    ),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      onPressed: () => _onKeyPress('0'),
                      child: Text(
                        '0',
                        style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.backspace_outlined, size: 24),
                      onPressed: _onDelete,
                    ),
                  ],
                ),
                
                const SizedBox(height: 32),
                const Divider(),
                const SizedBox(height: 16),
                
                // Help Box displaying credentials
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurface : Colors.grey[200],
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '💡 Staff Simulator Logs:',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                      ),
                      const SizedBox(height: 6),
                      Text('• John Doe (Waiter) — PIN: 1234', style: theme.textTheme.bodySmall),
                      Text('• Sarah Jenkins (KDS) — PIN: 5678', style: theme.textTheme.bodySmall),
                      Text('• Bob Smith (Manager) — PIN: 0000', style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
