// lib/features/billing/presentation/screens/payment_pending_feed_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../orders/domain/entities/order.dart';
import '../../../orders/providers/orders_providers.dart';

class PaymentPendingFeedScreen extends ConsumerStatefulWidget {
  const PaymentPendingFeedScreen({super.key});

  @override
  ConsumerState<PaymentPendingFeedScreen> createState() => _PaymentPendingFeedScreenState();
}

class _PaymentPendingFeedScreenState extends ConsumerState<PaymentPendingFeedScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 5), (timer) {
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
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ordersRepository = ref.watch(ordersRepositoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pending Settlements', style: TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: StreamBuilder<List<Order>>(
        stream: ordersRepository.watchActiveOrders(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: AppColors.primary));
          }

          final orders = snapshot.data ?? [];
          // Awaiting settlement: completed or ready orders that aren't closed/archived
          final pendingSettlements = orders.where((o) => 
            o.status == OrderStatus.completed || o.status == OrderStatus.ready
          ).toList();

          if (pendingSettlements.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.account_balance_wallet_outlined,
                    size: 80,
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No pending settlements.',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                    ),
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: pendingSettlements.length,
            itemBuilder: (context, index) {
              final order = pendingSettlements[index];
              final elapsedMinutes = DateTime.now().difference(order.updatedAt).inMinutes;

              return Card(
                color: isDark ? AppColors.darkSurface : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                ),
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Table ${order.tableId}',
                            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'Printed ${elapsedMinutes}m ago',
                              style: const TextStyle(
                                color: AppColors.primary,
                                fontWeight: FontWeight.bold,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Assigned Waiter: ${order.waiterName}',
                            style: theme.textTheme.bodyMedium,
                          ),
                          Text(
                            order.totalPrice.formatted,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 20),
                      Row(
                        children: [
                          const Icon(Icons.info_outline_rounded, color: AppColors.success, size: 16),
                          const SizedBox(width: 6),
                          Text(
                            'POS Settlement Status: Awaiting Card/Cash confirm',
                            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.success),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              ),
                              onPressed: () {
                                HapticFeedback.lightImpact();
                                context.push('/tables/${order.tableId}/pay');
                              },
                              child: const Text('Settlement Options'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              ),
                              onPressed: () {
                                HapticFeedback.lightImpact();
                                context.push('/tables/${order.tableId}/receipt-preview');
                              },
                              child: const Text('Preview Receipt'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
