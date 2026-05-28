// lib/features/orders/presentation/screens/active_orders_feed_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/order.dart';
import '../../providers/orders_providers.dart';

enum OrderSlaStatus { safe, stage1, stage2, stage3 }

enum ActiveOrderSort { elapsed, slaStatus }

class ActiveOrdersFeedScreen extends ConsumerStatefulWidget {
  const ActiveOrdersFeedScreen({super.key});

  @override
  ConsumerState<ActiveOrdersFeedScreen> createState() => _ActiveOrdersFeedScreenState();
}

class _ActiveOrdersFeedScreenState extends ConsumerState<ActiveOrdersFeedScreen> with SingleTickerProviderStateMixin {
  ActiveOrderSort _sortBy = ActiveOrderSort.elapsed;
  OrderStatus? _statusFilter;
  Timer? _slaTimer;
  late AnimationController _pulsingController;

  @override
  void initState() {
    super.initState();
    // Refresh SLA statuses every 10 seconds
    _slaTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      setState(() {});
    });

    _pulsingController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
      lowerBound: 0.6,
      upperBound: 1.0,
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _slaTimer?.cancel();
    _pulsingController.dispose();
    super.dispose();
  }

  int _getSlaLimit(Order order) {
    int slaLimit = 3;
    for (final item in order.items) {
      if (item.product.category == 'Mains') {
        return 15;
      } else if (item.product.category == 'Sides' || item.product.category == 'Greens') {
        slaLimit = 10;
      }
    }
    return slaLimit;
  }

  OrderSlaStatus _calculateSla(Order order) {
    final elapsedMins = DateTime.now().difference(order.createdAt).inMinutes;
    final limit = _getSlaLimit(order);

    if (elapsedMins >= limit + 5) {
      // Trigger haptic pulses asynchronously for Stage 3 SLA breaches
      HapticFeedback.vibrate();
      return OrderSlaStatus.stage3;
    } else if (elapsedMins >= limit + 1) {
      return OrderSlaStatus.stage2;
    } else if (elapsedMins >= limit * 0.8) {
      return OrderSlaStatus.stage1;
    }
    return OrderSlaStatus.safe;
  }

  Color _getSlaColor(OrderSlaStatus status) {
    switch (status) {
      case OrderSlaStatus.stage3:
      case OrderSlaStatus.stage2:
        return AppColors.error;
      case OrderSlaStatus.stage1:
        return AppColors.warning;
      case OrderSlaStatus.safe:
        return AppColors.success;
    }
  }

  @override
  Widget build(BuildContext context) {
    final repository = ref.watch(ordersRepositoryProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Active Orders Feed'),
        actions: [
          PopupMenuButton<ActiveOrderSort>(
            icon: const Icon(Icons.sort_rounded),
            tooltip: 'Sort Options',
            onSelected: (sort) {
              setState(() {
                _sortBy = sort;
              });
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: ActiveOrderSort.elapsed,
                child: Text('Sort by Elapsed Time'),
              ),
              const PopupMenuItem(
                value: ActiveOrderSort.slaStatus,
                child: Text('Sort by SLA Severity'),
              ),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: StreamBuilder<List<Order>>(
        stream: repository.watchActiveOrders(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: AppColors.primary));
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          var orders = snapshot.data ?? [];
          // Filter out completed and cancelled orders
          orders = orders.where((o) => o.status != OrderStatus.completed && o.status != OrderStatus.cancelled).toList();

          // Apply Category Filter Chips
          if (_statusFilter != null) {
            orders = orders.where((o) => o.status == _statusFilter).toList();
          }

          // Sort Orders
          if (_sortBy == ActiveOrderSort.elapsed) {
            orders.sort((a, b) => b.createdAt.compareTo(a.createdAt));
          } else {
            orders.sort((a, b) => _calculateSla(b).index.compareTo(_calculateSla(a).index));
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildFilterChips(theme, isDark),
              Expanded(
                child: orders.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.assignment_turned_in_rounded, size: 64, color: Colors.grey[400]),
                            const SizedBox(height: 16),
                            const Text('No active orders found.'),
                          ],
                        ),
                      )
                    : CustomScrollView(
                        slivers: [
                          SliverPadding(
                            padding: const EdgeInsets.all(16),
                            sliver: SliverList(
                              delegate: SliverChildBuilderDelegate(
                                (context, index) {
                                  final order = orders[index];
                                  return _buildOrderCard(order, theme, isDark);
                                },
                                childCount: orders.length,
                              ),
                            ),
                          ),
                        ],
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildFilterChips(ThemeData theme, bool isDark) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          FilterChip(
            selected: _statusFilter == null,
            label: Text('All Active', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
            selectedColor: AppColors.primary.withValues(alpha: 0.15),
            checkmarkColor: AppColors.primary,
            onSelected: (selected) {
              setState(() {
                _statusFilter = null;
              });
            },
          ),
          const SizedBox(width: 8),
          ...[OrderStatus.draft, OrderStatus.sent, OrderStatus.preparing, OrderStatus.ready].map((status) {
            final label = status.name[0].toUpperCase() + status.name.substring(1);
            return Padding(
              padding: const EdgeInsets.only(right: 8.0),
              child: FilterChip(
                selected: _statusFilter == status,
                label: Text(label, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
                selectedColor: AppColors.primary.withValues(alpha: 0.15),
                checkmarkColor: AppColors.primary,
                onSelected: (selected) {
                  setState(() {
                    _statusFilter = selected ? status : null;
                  });
                },
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildOrderCard(Order order, ThemeData theme, bool isDark) {
    final sla = _calculateSla(order);
    final slaColor = _getSlaColor(sla);
    final elapsedMinutes = DateTime.now().difference(order.createdAt).inMinutes;

    Widget card = Container(
      margin: const EdgeInsets.only(bottom: 16),
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
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () {
            context.push('/orders/${order.id}/details');
          },
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Table ${order.tableId}',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: isDark ? Colors.white : const Color(0xFF1A1C1E),
                      ),
                    ),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          order.status.name.toUpperCase(),
                          style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold, fontSize: 10),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: slaColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${elapsedMinutes}m elapsed',
                          style: TextStyle(color: slaColor, fontWeight: FontWeight.bold, fontSize: 10),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const Divider(height: 20),
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: order.items.length,
                itemBuilder: (context, index) {
                  final item = order.items[index];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6.0),
                    child: Row(
                      children: [
                        Text(
                          '${item.quantity}x ',
                          style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary),
                        ),
                        Expanded(
                          child: Text(
                            item.product.name,
                            style: const TextStyle(fontWeight: FontWeight.w500),
                          ),
                        ),
                        Text(
                          item.status.name.toUpperCase(),
                          style: theme.textTheme.bodySmall?.copyWith(fontSize: 10),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
      ),
    );

    // Apply Pulsing border for Stage 3 critical SLA breach
    if (sla == OrderSlaStatus.stage3) {
      return AnimatedBuilder(
        animation: _pulsingController,
        builder: (context, child) {
          return Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppColors.error.withValues(alpha: 0.4 * _pulsingController.value),
                  blurRadius: 12,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: card,
          );
        },
      );
    }

    return card;
  }
}
