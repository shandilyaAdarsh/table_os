// lib/features/orders/presentation/screens/order_details_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/order.dart';
import '../../domain/entities/order_item.dart';
import '../../providers/orders_providers.dart';
import '../state/active_order_notifier.dart';

class OrderDetailsScreen extends ConsumerWidget {
  final String orderId;

  const OrderDetailsScreen({
    super.key,
    required this.orderId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repository = ref.watch(ordersRepositoryProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return StreamBuilder<Order?>(
      stream: repository.watchOrderById(orderId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
          );
        }

        final order = snapshot.data;
        if (order == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Order Details')),
            body: const Center(
              child: Text('Order not found or has been completed.'),
            ),
          );
        }

        return Scaffold(
          appBar: AppBar(
            title: Text('Table ${order.tableId} Details'),
            actions: [
              Container(
                margin: const EdgeInsets.only(right: 16),
                child: Row(
                  children: [
                    const Icon(Icons.circle, color: AppColors.success, size: 10),
                    const SizedBox(width: 6),
                    Text(
                      'KDS Synced',
                      style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            ],
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildProgressTimeline(order, theme, isDark),
                const SizedBox(height: 16),
                _buildWaiterOwnershipCard(context, ref, order, theme, isDark),
                const SizedBox(height: 16),
                _buildItemsList(context, ref, order, theme, isDark),
                const SizedBox(height: 16),
                _buildCancelLogsCard(order, theme, isDark),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildProgressTimeline(Order order, ThemeData theme, bool isDark) {
    final stages = [
      OrderStatus.draft,
      OrderStatus.sent,
      OrderStatus.preparing,
      OrderStatus.ready,
      OrderStatus.completed,
    ];

    final currentStageIndex = stages.indexOf(order.status);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              offset: const Offset(0, 4),
              blurRadius: 12,
            ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Order Flow Stage',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(stages.length, (index) {
                final stage = stages[index];
                final isCompleted = index <= currentStageIndex;
                final isActive = index == currentStageIndex;
                final label = stage.name.toUpperCase();

                Color circleColor = Colors.grey[300]!;
                Color labelColor = Colors.grey[600]!;
                if (isCompleted) {
                  circleColor = AppColors.primary;
                  labelColor = AppColors.primary;
                }
                if (isActive) {
                  circleColor = AppColors.secondary;
                  labelColor = AppColors.secondary;
                }

                return Expanded(
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Container(
                              height: 2,
                              color: index == 0
                                  ? Colors.transparent
                                  : (index <= currentStageIndex ? AppColors.primary : Colors.grey[300]),
                            ),
                          ),
                          Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              color: circleColor,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: isActive ? AppColors.primary : Colors.transparent,
                                width: 2,
                              ),
                            ),
                            child: Center(
                              child: isCompleted && !isActive
                                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                                  : Text(
                                      '${index + 1}',
                                      style: TextStyle(
                                        color: isCompleted ? Colors.white : Colors.grey[600],
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                            ),
                          ),
                          Expanded(
                            child: Container(
                              height: 2,
                              color: index == stages.length - 1
                                  ? Colors.transparent
                                  : (index < currentStageIndex ? AppColors.primary : Colors.grey[300]),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        label,
                        style: TextStyle(
                          color: labelColor,
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                );
              }),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWaiterOwnershipCard(
    BuildContext context,
    WidgetRef ref,
    Order order,
    ThemeData theme,
    bool isDark,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              offset: const Offset(0, 4),
              blurRadius: 12,
            ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                  child: const Icon(Icons.person_rounded, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Waiter Ownership',
                      style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      order.waiterName,
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ],
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.swap_horiz_rounded, size: 18),
              label: const Text('Transfer Waiter'),
              onPressed: () => _showTransferWaiterDialog(context, ref, order),
            ),
          ],
        ),
      ),
    );
  }

  void _showTransferWaiterDialog(BuildContext context, WidgetRef ref, Order order) {
    final waiters = ['John Doe', 'Sarah Miller', 'Alex Wong', 'Elena Rostova', 'Michael Chang'];
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Transfer Waiter Ownership'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: waiters.map((name) {
              return ListTile(
                title: Text(name),
                leading: const Icon(Icons.person_rounded),
                trailing: order.waiterName == name ? const Icon(Icons.check_rounded, color: AppColors.primary) : null,
                onTap: () {
                  ref.read(activeOrderNotifierProvider(order.tableId).notifier).assignWaiter(name);
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Order ownership transferred to $name'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                },
              );
            }).toList(),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
          ],
        );
      },
    );
  }

  Widget _buildItemsList(
    BuildContext context,
    WidgetRef ref,
    Order order,
    ThemeData theme,
    bool isDark,
  ) {
    final groupedItems = <int, List<OrderItem>>{};
    for (final item in order.items) {
      groupedItems.putIfAbsent(item.seatNumber, () => []).add(item);
    }

    final sortedSeats = groupedItems.keys.toList()..sort();

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              offset: const Offset(0, 4),
              blurRadius: 12,
            ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Order Items',
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 18),
                ),
                Text(
                  order.totalPrice.formatted,
                  style: GoogleFonts.plusJakartaSans(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 18),
                ),
              ],
            ),
            const Divider(height: 24),
            if (order.items.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16.0),
                child: Center(child: Text('No items in this order.')),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: sortedSeats.length,
                itemBuilder: (context, sIndex) {
                  final seat = sortedSeats[sIndex];
                  final seatItems = groupedItems[seat]!;

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkBorder : Colors.grey[200],
                          borderRadius: BorderRadius.circular(6),
                        ),
                        width: double.infinity,
                        child: Text(
                          'Seat $seat',
                          style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
                        ),
                      ),
                      ...seatItems.map((item) {
                        final isCancelled = item.status == OrderItemStatus.cancelled;
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            item.product.name,
                            style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.bold,
                              decoration: isCancelled ? TextDecoration.lineThrough : null,
                              color: isCancelled ? Colors.grey : null,
                            ),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (item.selectedModifiers.isNotEmpty)
                                Text(
                                  item.selectedModifiers.map((m) => m.name).join(', '),
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    decoration: isCancelled ? TextDecoration.lineThrough : null,
                                  ),
                                ),
                              const SizedBox(height: 2),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: (isCancelled ? Colors.grey : AppColors.primary).withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  item.status.name.toUpperCase(),
                                  style: TextStyle(
                                    color: isCancelled ? Colors.grey : AppColors.primary,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 9,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '${item.quantity}x ${item.totalPrice.formatted}',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  decoration: isCancelled ? TextDecoration.lineThrough : null,
                                  color: isCancelled ? Colors.grey : null,
                                ),
                              ),
                              if (!isCancelled) ...[
                                const SizedBox(width: 8),
                                IconButton(
                                  icon: const Icon(Icons.cancel_outlined, color: AppColors.error, size: 20),
                                  onPressed: () => _showCancelItemDialog(context, ref, order, item),
                                  tooltip: 'Cancel Item',
                                ),
                              ],
                            ],
                          ),
                        );
                      }),
                      const SizedBox(height: 12),
                    ],
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  void _showCancelItemDialog(BuildContext context, WidgetRef ref, Order order, OrderItem item) {
    final textController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text('Cancel ${item.product.name}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Please enter the reason for cancelling this item:'),
              const SizedBox(height: 12),
              TextField(
                controller: textController,
                decoration: const InputDecoration(
                  hintText: 'e.g. Guest changed mind, Out of stock',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Back'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
              onPressed: () {
                final reason = textController.text.trim();
                if (reason.isNotEmpty) {
                  ref.read(activeOrderNotifierProvider(order.tableId).notifier).cancelItem(item.id, reason);
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Cancelled ${item.product.name} successfully.'),
                      backgroundColor: AppColors.error,
                    ),
                  );
                }
              },
              child: const Text('Confirm Cancel'),
            ),
          ],
        );
      },
    );
  }

  Widget _buildCancelLogsCard(Order order, ThemeData theme, bool isDark) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              offset: const Offset(0, 4),
              blurRadius: 12,
            ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Cancellation Audit Logs',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            const Divider(height: 24),
            if (order.cancelLogs.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8.0),
                child: Text('No item cancellations logged for this session.'),
              )
            else
              ...order.cancelLogs.map((log) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8.0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.assignment_late_outlined, color: AppColors.error, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          log,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: Colors.red[800],
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
