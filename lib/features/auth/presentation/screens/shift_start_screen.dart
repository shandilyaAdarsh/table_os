// lib/features/auth/presentation/screens/shift_start_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/staff_member.dart';
import '../state/auth_notifier.dart';

class ShiftStartScreen extends ConsumerStatefulWidget {
  const ShiftStartScreen({super.key});

  @override
  ConsumerState<ShiftStartScreen> createState() => _ShiftStartScreenState();
}

class _ShiftStartScreenState extends ConsumerState<ShiftStartScreen> {
  StaffRole _selectedRole = StaffRole.waiter;
  String _selectedSection = 'Section A - Terrace Deck';
  final List<String> _sections = [
    'Section A - Terrace Deck',
    'Section B - Main Dining Room',
    'Section C - Bar & Lounge',
    'Section D - Garden Patio',
  ];

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final staff = authState.loggedInStaff;
    if (staff == null) {
      // Safeguard redirect via GoRouter
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.go('/login');
      });
      return const SizedBox.shrink();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shift Preflight Setup'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go('/login'),
        ),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Welcome user banner card
                Card(
                  color: isDark ? AppColors.darkSurface : Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                          radius: 28,
                          child: const Icon(Icons.person_rounded, color: AppColors.primary, size: 28),
                        ),
                        const SizedBox(width: 16),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              staff.name,
                              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Branch: ${authState.selectedBranch?.name}',
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                
                Text(
                  'Configure Operational Shift',
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  'Specify your role assignment and physical table sections for active service updates.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                  ),
                ),
                const SizedBox(height: 24),
                
                // Assigned Role dropdown field
                DropdownButtonFormField<StaffRole>(
                  initialValue: _selectedRole,
                  decoration: InputDecoration(
                    labelText: 'Operational Role',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  items: StaffRole.values.map((role) {
                    final label = role.name[0].toUpperCase() + role.name.substring(1);
                    return DropdownMenuItem<StaffRole>(
                      value: role,
                      child: Text(label),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        _selectedRole = val;
                      });
                    }
                  },
                ),
                const SizedBox(height: 20),
                
                // Section selector dropdown field
                DropdownButtonFormField<String>(
                  initialValue: _selectedSection,
                  decoration: InputDecoration(
                    labelText: 'Floor Assignment Section',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  items: _sections.map((sec) {
                    return DropdownMenuItem<String>(
                      value: sec,
                      child: Text(sec),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        _selectedSection = val;
                      });
                    }
                  },
                ),
                const SizedBox(height: 32),
                
                // Preflight checks list (cosmetic simulation checklist)
                Text(
                  'Preflight Checklist',
                  style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold, letterSpacing: 1),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 18),
                    const SizedBox(width: 8),
                    Text('Handheld terminal calibrated', style: theme.textTheme.bodyMedium),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 18),
                    const SizedBox(width: 8),
                    Text('Local offline databases fully synced', style: theme.textTheme.bodyMedium),
                  ],
                ),
                const SizedBox(height: 32),
                
                // Start Shift Button
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    onPressed: () async {
                      await ref.read(authNotifierProvider.notifier).startShift(_selectedRole, _selectedSection);
                      if (mounted) context.go('/tables');
                    },
                    child: const Text(
                      'START ACTIVE SHIFT',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
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
