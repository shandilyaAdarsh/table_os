// lib/features/waiter_calls/presentation/screens/waiter_call_feed_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/waiter_call.dart';
import '../state/waiter_calls_providers.dart';

class WaiterCallFeedScreen extends ConsumerStatefulWidget {
  const WaiterCallFeedScreen({super.key});

  @override
  ConsumerState<WaiterCallFeedScreen> createState() => _WaiterCallFeedScreenState();
}

class _WaiterCallFeedScreenState extends ConsumerState<WaiterCallFeedScreen> {
  Timer? _timer;
  CallType? _selectedTypeFilter;

  @override
  void initState() {
    super.initState();
    // Refresh the screen every second to recalculate priority scores and elapsed times
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final calls = ref.watch(activeWaiterCallsProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final filteredCalls = _selectedTypeFilter == null
        ? calls
        : calls.where((c) => c.type == _selectedTypeFilter).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Waiter Call Feed', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_alert_rounded, color: AppColors.primary),
            onPressed: () => _showAddMockCallDialog(context),
            tooltip: 'Simulate Guest Call',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          _buildFilterChips(isDark),
          Expanded(
            child: filteredCalls.isEmpty
                ? _buildEmptyState(theme, isDark)
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: filteredCalls.length,
                    itemBuilder: (context, index) {
                      final call = filteredCalls[index];
                      return _buildCallCard(context, call, theme, isDark);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips(bool isDark) {
    return Container(
      height: 48,
      margin: const EdgeInsets.only(top: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          FilterChip(
            label: const Text('All Calls'),
            selected: _selectedTypeFilter == null,
            onSelected: (_) {
              HapticFeedback.selectionClick();
              setState(() => _selectedTypeFilter = null);
            },
            selectedColor: AppColors.primary.withValues(alpha: 0.15),
            checkmarkColor: AppColors.primary,
          ),
          const SizedBox(width: 8),
          ...CallType.values.map((type) {
            final label = _getCallTypeLabel(type);
            return Padding(
              padding: const EdgeInsets.only(right: 8.0),
              child: FilterChip(
                label: Text(label),
                selected: _selectedTypeFilter == type,
                onSelected: (selected) {
                  HapticFeedback.selectionClick();
                  setState(() {
                    _selectedTypeFilter = selected ? type : null;
                  });
                },
                selectedColor: AppColors.primary.withValues(alpha: 0.15),
                checkmarkColor: AppColors.primary,
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildCallCard(BuildContext context, WaiterCall call, ThemeData theme, bool isDark) {
    final elapsed = DateTime.now().difference(call.timestamp);
    final elapsedStr = _formatDuration(elapsed);
    final isUrgent = call.isUrgent;

    // SLA Color coding
    final Color indicatorColor;
    if (call.status == CallStatus.escalated || elapsed.inSeconds > 180) {
      indicatorColor = AppColors.error; // Critical Red
    } else if (isUrgent || elapsed.inSeconds > 120) {
      indicatorColor = AppColors.warning; // Alert Amber
    } else {
      indicatorColor = AppColors.success; // Safe Teal
    }

    return Card(
      key: ValueKey(call.id),
      color: isDark ? AppColors.darkSurface : Colors.white,
      elevation: isUrgent ? 4 : 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isUrgent ? indicatorColor : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
          width: isUrgent ? 2 : 1,
        ),
      ),
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          HapticFeedback.lightImpact();
          context.push('/waiter-calls/${call.id}');
        },
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 24,
                        decoration: BoxDecoration(
                          color: indicatorColor,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        call.tableLabel,
                        style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      if (call.isVip) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.secondary.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'VIP',
                            style: TextStyle(
                              color: AppColors.secondary,
                              fontWeight: FontWeight.bold,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  Text(
                    elapsedStr,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: isUrgent ? indicatorColor : theme.textTheme.bodySmall?.color,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _getCallTypeLabel(call.type).toUpperCase(),
                        style: TextStyle(
                          color: indicatorColor,
                          fontWeight: FontWeight.bold,
                          fontSize: 11,
                          letterSpacing: 1.1,
                        ),
                      ),
                      if (call.customerNote != null && call.customerNote!.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          call.customerNote!,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                            fontStyle: FontStyle.italic,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                  _buildActionButton(call),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionButton(WaiterCall call) {
    if (call.status == CallStatus.pending || call.status == CallStatus.escalated) {
      return ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        ),
        onPressed: () {
          // Play Order Fired Haptic (Double vibration)
          HapticFeedback.mediumImpact();
          ref.read(waiterCallsListProvider.notifier).acknowledgeCall(call.id, 'waiter_001', 'John Doe');
        },
        child: const Text('Acknowledge'),
      );
    } else if (call.status == CallStatus.acknowledged) {
      return OutlinedButton(
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: AppColors.success),
          foregroundColor: AppColors.success,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        ),
        onPressed: () {
          // Success Haptic
          HapticFeedback.lightImpact();
          ref.read(waiterCallsListProvider.notifier).resolveCall(call.id);
        },
        child: const Text('Resolve'),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _buildEmptyState(ThemeData theme, bool isDark) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.notifications_none_rounded,
            size: 80,
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          ),
          const SizedBox(height: 16),
          Text(
            'All Quiet on the Floor',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            'Active table calls will appear in this feed.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
            ),
          ),
        ],
      ),
    );
  }

  String _getCallTypeLabel(CallType type) {
    switch (type) {
      case CallType.service:
        return 'Service Request';
      case CallType.billRequest:
        return 'Bill Request';
      case CallType.assistance:
        return 'Assistance';
      case CallType.issueReport:
        return 'Issue Report';
    }
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes;
    final seconds = d.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  void _showAddMockCallDialog(BuildContext context) {
    final noteController = TextEditingController();
    CallType selectedType = CallType.service;
    bool isVip = false;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Simulate Guest Call'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<CallType>(
                    initialValue: selectedType,
                    decoration: const InputDecoration(labelText: 'Call Type'),
                    items: CallType.values.map((t) {
                      return DropdownMenuItem(value: t, child: Text(_getCallTypeLabel(t)));
                    }).toList(),
                    onChanged: (val) {
                      if (val != null) setDialogState(() => selectedType = val);
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: noteController,
                    decoration: const InputDecoration(
                      labelText: 'Customer Note (Optional)',
                      hintText: 'e.g. Needs water, bill splitting',
                    ),
                  ),
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    title: const Text('Mark as VIP Guest'),
                    value: isVip,
                    onChanged: (val) {
                      if (val != null) setDialogState(() => isVip = val);
                    },
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: Colors.white),
                  onPressed: () {
                    ref.read(waiterCallsListProvider.notifier).createCall(
                          '5',
                          'Table 5',
                          selectedType,
                          note: noteController.text.trim(),
                          isVip: isVip,
                        );
                    Navigator.pop(context);
                  },
                  child: const Text('Send Call'),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
