// lib/features/orders/presentation/screens/item_level_kitchen_status_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/order.dart';
import '../../domain/entities/order_item.dart';
import '../../providers/orders_providers.dart';

class KitchenStationInfo {
  final String name;
  final IconData icon;
  final Color themeColor;
  final String currentDelay;

  const KitchenStationInfo({
    required this.name,
    required this.icon,
    required this.themeColor,
    required this.currentDelay,
  });
}

class ItemLevelKitchenStatusScreen extends ConsumerStatefulWidget {
  const ItemLevelKitchenStatusScreen({super.key});

  @override
  ConsumerState<ItemLevelKitchenStatusScreen> createState() => _ItemLevelKitchenStatusScreenState();
}

class _ItemLevelKitchenStatusScreenState extends ConsumerState<ItemLevelKitchenStatusScreen> {
  final List<KitchenStationInfo> _stations = const [
    KitchenStationInfo(name: 'Grill', icon: Icons.local_fire_department_rounded, themeColor: Colors.orange, currentDelay: '8m delay'),
    KitchenStationInfo(name: 'Fryer', icon: Icons.cookie_rounded, themeColor: Colors.amber, currentDelay: '3m delay'),
    KitchenStationInfo(name: 'Salad', icon: Icons.spa_rounded, themeColor: Colors.green, currentDelay: 'No delay'),
    KitchenStationInfo(name: 'Bar', icon: Icons.local_bar_rounded, themeColor: Colors.blue, currentDelay: 'No delay'),
  ];

  String _getStationForCategory(String category) {
    if (category == 'Mains') return 'Grill';
    if (category == 'Sides') return 'Fryer';
    if (category == 'Greens') return 'Salad';
    if (category == 'Drinks') return 'Bar';
    return 'Grill'; // Catch-all
  }

  @override
  Widget build(BuildContext context) {
    final repository = ref.watch(ordersRepositoryProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Item-Level Kitchen Stations'),
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

          final orders = snapshot.data ?? [];
          
          // Flatten items and attach their order contexts
          final List<Map<String, dynamic>> allItems = [];
          for (final order in orders) {
            for (final item in order.items) {
              if (item.status != OrderItemStatus.cancelled && item.status != OrderItemStatus.served) {
                allItems.add({
                  'order': order,
                  'item': item,
                  'station': _getStationForCategory(item.product.category),
                });
              }
            }
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: _stations.map((station) {
                final stationItems = allItems.where((i) => i['station'] == station.name).toList();

                return Container(
                  margin: const EdgeInsets.only(bottom: 24),
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
                  child: ExpansionTile(
                    initiallyExpanded: true,
                    leading: Icon(station.icon, color: station.themeColor, size: 28),
                    title: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '${station.name} Station',
                          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 18),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: station.currentDelay.contains('delay')
                                ? AppColors.error.withValues(alpha: 0.15)
                                : AppColors.success.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            station.currentDelay,
                            style: TextStyle(
                              color: station.currentDelay.contains('delay') ? AppColors.error : AppColors.success,
                              fontWeight: FontWeight.bold,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      ],
                    ),
                    subtitle: Text(
                      '${stationItems.length} active prep tasks',
                      style: theme.textTheme.bodySmall,
                    ),
                    children: [
                      const Divider(height: 1),
                      if (stationItems.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24.0),
                          child: Center(
                            child: Text('No active prep items in this station.'),
                          ),
                        )
                      else
                        ListView.separated(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: stationItems.length,
                          separatorBuilder: (context, index) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final task = stationItems[index];
                            final Order order = task['order'];
                            final OrderItem item = task['item'];

                            // Check dependencies
                            // For Mains, if they have sides in the same order, list them as dependencies
                            final List<String> dependencies = [];
                            if (station.name == 'Grill') {
                              final sideItems = order.items.where((o) => _getStationForCategory(o.product.category) == 'Fryer');
                              for (final side in sideItems) {
                                dependencies.add('Fryer Station (${side.product.name})');
                              }
                            }

                            return Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            '${item.quantity}x ${item.product.name}',
                                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 16),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            'Table ${order.tableId} • Seat ${item.seatNumber}',
                                            style: theme.textTheme.bodySmall,
                                          ),
                                        ],
                                      ),
                                      _buildStatusBadge(item.status),
                                    ],
                                  ),
                                  if (item.selectedModifiers.isNotEmpty) ...[
                                    const SizedBox(height: 6),
                                    Text(
                                      'Modifiers: ${item.selectedModifiers.map((m) => m.name).join(", ")}',
                                      style: theme.textTheme.bodySmall?.copyWith(color: AppColors.primary),
                                    ),
                                  ],
                                  if (dependencies.isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        const Icon(Icons.link_rounded, size: 14, color: AppColors.info),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            'Dependencies: ${dependencies.join(", ")}',
                                            style: theme.textTheme.bodySmall?.copyWith(
                                              color: AppColors.info,
                                              fontStyle: FontStyle.italic,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                  const SizedBox(height: 12),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      if (item.status == OrderItemStatus.queued)
                                        ElevatedButton(
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: Colors.orange,
                                            foregroundColor: Colors.white,
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                          ),
                                          onPressed: () => _updateItemStatus(order, item.id, OrderItemStatus.preparing),
                                          child: const Text('Start Preparing'),
                                        ),
                                      if (item.status == OrderItemStatus.preparing)
                                        ElevatedButton(
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: Colors.green,
                                            foregroundColor: Colors.white,
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                          ),
                                          onPressed: () => _updateItemStatus(order, item.id, OrderItemStatus.ready),
                                          child: const Text('Mark Ready'),
                                        ),
                                      if (item.status == OrderItemStatus.ready)
                                        ElevatedButton(
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: AppColors.primary,
                                            foregroundColor: Colors.white,
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                          ),
                                          onPressed: () => _updateItemStatus(order, item.id, OrderItemStatus.served),
                                          child: const Text('Mark Served'),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                    ],
                  ),
                );
              }).toList(),
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatusBadge(OrderItemStatus status) {
    Color color = Colors.grey;
    if (status == OrderItemStatus.preparing) color = Colors.orange;
    if (status == OrderItemStatus.ready) color = Colors.green;
    if (status == OrderItemStatus.served) color = AppColors.primary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        status.name.toUpperCase(),
        style: GoogleFonts.plusJakartaSans(color: color, fontWeight: FontWeight.w800, fontSize: 10, letterSpacing: 0.5),
      ),
    );
  }

  Future<void> _updateItemStatus(Order order, String itemId, OrderItemStatus status) async {
    final repository = ref.read(ordersRepositoryProvider);
    final items = List<OrderItem>.from(order.items);
    final idx = items.indexWhere((i) => i.id == itemId);
    if (idx != -1) {
      items[idx] = items[idx].copyWith(status: status);

      // Check if all items in order are served, update overall status
      var orderStatus = order.status;
      if (items.every((i) => i.status == OrderItemStatus.served || i.status == OrderItemStatus.cancelled)) {
        orderStatus = OrderStatus.completed;
      } else if (items.any((i) => i.status == OrderItemStatus.preparing)) {
        orderStatus = OrderStatus.preparing;
      } else if (items.any((i) => i.status == OrderItemStatus.ready)) {
        orderStatus = OrderStatus.ready;
      }

      final updatedOrder = order.copyWith(
        items: items,
        status: orderStatus,
        updatedAt: DateTime.now(),
      );

      await repository.saveOrder(updatedOrder);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Item marked as ${status.name}'),
          duration: const Duration(seconds: 1),
        ),
      );
    }
  }
}
