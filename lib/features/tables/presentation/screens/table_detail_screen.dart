import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../orders/presentation/state/active_order_notifier.dart';
import '../../../orders/domain/entities/order.dart';
import '../../../orders/domain/entities/order_item.dart';
import '../../domain/entities/restaurant_table.dart';
import '../state/table_grid_notifier.dart';

class TableDetailScreen extends ConsumerWidget {
  final String tableId;

  const TableDetailScreen({
    super.key,
    required this.tableId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeOrderAsync = ref.watch(activeOrderNotifierProvider(tableId));
    final tableGridStateAsync = ref.watch(tableGridNotifierProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8F9FA),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded, color: isDark ? Colors.white54 : const Color(0xFF5D3F3C)),
          onPressed: () => context.pop(),
        ),
        title: tableGridStateAsync.when(
          data: (gridState) {
            final table = gridState.tables.firstWhere(
              (t) => t.id == tableId,
              orElse: () => RestaurantTable(id: tableId, label: tableId, capacity: 4, status: TableStatus.unknown),
            );
            return Text(
              'Table ${table.label}',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                color: const Color(0xFFE31E24),
              ),
            );
          },
          loading: () => const SizedBox(),
          error: (err, stack) => const SizedBox(),
        ),
        actions: const [
          SizedBox(width: 48), // Balancing trailing space
        ],
      ),
      body: tableGridStateAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFE31E24))),
        error: (err, stack) => Center(child: Text('Error loading layout: $err')),
        data: (gridState) {
          final tableIndex = gridState.tables.indexWhere((t) => t.id == tableId);
          if (tableIndex == -1) {
            return Center(child: Text('Table $tableId not found.'));
          }
          final table = gridState.tables[tableIndex];

          return activeOrderAsync.when(
            loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFE31E24))),
            error: (err, stack) => Center(child: Text('Error loading active session: $err')),
            data: (order) {
              if (order == null || table.status == TableStatus.available || table.status == TableStatus.cleaning) {
                return _buildEmptyState(context, ref, table, theme, isDark);
              }
              return _buildActiveSession(context, ref, table, order, isDark);
            },
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context, WidgetRef ref, RestaurantTable table, ThemeData theme, bool isDark) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            table.status == TableStatus.cleaning ? Icons.cleaning_services_rounded : Icons.table_restaurant_rounded,
            size: 72,
            color: isDark ? Colors.white24 : const Color(0xFFBFC8D0),
          ),
          const SizedBox(height: 16),
          Text(
            table.status == TableStatus.cleaning
                ? 'Table is currently being cleaned.'
                : 'Table is clean and available for seating.',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 16,
              color: isDark ? Colors.white70 : const Color(0xFF5D3F3C),
            ),
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            icon: const Icon(Icons.sensor_occupied_rounded),
            label: Text(
              'Seat Guests & Create Order',
              style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFE31E24),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            onPressed: () async {
              await ref.read(activeOrderNotifierProvider(tableId).notifier).createOrder();
              if (context.mounted) {
                await context.push('/tables/$tableId/edit');
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildActiveSession(BuildContext context, WidgetRef ref, RestaurantTable table, Order order, bool isDark) {
    // Group items by seat
    final Map<int, List<OrderItem>> groupedItems = {};
    for (final item in order.items) {
      if (!groupedItems.containsKey(item.seatNumber)) {
        groupedItems[item.seatNumber] = [];
      }
      groupedItems[item.seatNumber]!.add(item);
    }

    final seats = groupedItems.keys.toList()..sort();

    return Stack(
      children: [
        Positioned.fill(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 800),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Table Stats Row
                    _buildStatsRow(table, order, isDark),
                    const SizedBox(height: 32),
                    
                    // Active Order Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Active Order',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: isDark ? Colors.white : const Color(0xFF0F172A),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFDAD6),
                            borderRadius: BorderRadius.circular(100),
                          ),
                          child: Text(
                            'Pending Kitchen',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: const Color(0xFF93000A),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Seats
                    ...seats.map((seatNum) => _buildSeatGroup(seatNum, groupedItems[seatNum]!, isDark)),

                    const SizedBox(height: 120), // Padding for bottom actions
                  ],
                ),
              ),
            ),
          ),
        ),
        
        // Actions Footer
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: _buildActionsFooter(context, tableId, isDark),
        ),
      ],
    );
  }

  Widget _buildStatsRow(RestaurantTable table, Order order, bool isDark) {
    return Row(
      children: [
        Expanded(child: _buildStatCard(Icons.group_rounded, 'Guests', '${table.occupiedSeats.isNotEmpty ? table.occupiedSeats.length : 1}', isDark)),
        const SizedBox(width: 12),
        Expanded(child: _buildStatCard(Icons.timer_rounded, 'Time', '45m', isDark)),
        const SizedBox(width: 12),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFFFDAD6)),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 12, offset: const Offset(0, 4)),
              ],
            ),
            child: Column(
              children: [
                const Icon(Icons.payments_rounded, color: Color(0xFFBA0013), size: 24),
                const SizedBox(height: 4),
                Text(
                  'TOTAL',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFFBA0013),
                  ),
                ),
                Text(
                  order.totalPrice.formatted,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFFBA0013),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard(IconData icon, String label, String value, bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 12, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        children: [
          Icon(icon, color: isDark ? Colors.white54 : const Color(0xFF5D5E61), size: 24),
          const SizedBox(height: 4),
          Text(
            label.toUpperCase(),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.white54 : const Color(0xFF5D5E61),
            ),
          ),
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: isDark ? Colors.white : const Color(0xFF0F172A),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSeatGroup(int seatNum, List<OrderItem> items, bool isDark) {
    final isShared = seatNum == 0;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 12, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF3F4F5),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              border: Border(bottom: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE1E3E4))),
            ),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: isShared ? const Color(0xFF6C757D) : const Color(0xFFE2E2E5),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    isShared ? 'T' : 'S$seatNum',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isShared ? Colors.white : const Color(0xFF636467),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  isShared ? 'Shared for Table' : 'Seat $seatNum',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              children: items.map((item) {
                final isLast = items.last == item;
                return Column(
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF334155) : const Color(0xFFE1E3E4),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          alignment: Alignment.center,
                          child: Icon(Icons.restaurant_menu_rounded, color: isDark ? Colors.white24 : const Color(0xFF64748B)),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.product.name,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                                ),
                              ),
                              if (item.selectedModifiers.isNotEmpty)
                                ...item.selectedModifiers.map((m) => Text(
                                  '+ ${m.name}',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 14,
                                    color: isDark ? Colors.white54 : const Color(0xFF64748B),
                                  ),
                                )),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              item.totalPrice.formatted,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: isDark ? Colors.white : const Color(0xFF0F172A),
                              ),
                            ),
                            Text(
                              'Qty: ${item.quantity}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: isDark ? Colors.white54 : const Color(0xFF64748B),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    if (!isLast)
                      Divider(
                        height: 24,
                        color: isDark ? Colors.white10 : const Color(0xFFE1E3E4),
                      ),
                  ],
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionsFooter(BuildContext context, String tableId, bool isDark) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 24, offset: const Offset(0, -8)),
        ],
        border: Border(top: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE1E3E4))),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32), // pb for safe area
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 800),
          child: Row(
            children: [
              Expanded(
                flex: 1,
                child: InkWell(
                  onTap: () => context.push('/tables/$tableId/edit'),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    height: 56,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF334155) : const Color(0xFFEDEEEF),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.add_circle_outline_rounded, size: 20, color: isDark ? Colors.white : const Color(0xFF0F172A)),
                        const SizedBox(height: 2),
                        Text('Add Items', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 1,
                child: InkWell(
                  onTap: () => context.push('/tables/$tableId/split'),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    height: 56,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF334155) : const Color(0xFFEDEEEF),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.call_split_rounded, size: 20, color: isDark ? Colors.white : const Color(0xFF0F172A)),
                        const SizedBox(height: 2),
                        Text('Split Bill', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: () => context.push('/tables/$tableId/pay'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE31E24),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: EdgeInsets.zero,
                    elevation: 0,
                  ),
                  child: SizedBox(
                    height: 56,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('Checkout', style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 8),
                        const Icon(Icons.arrow_forward_rounded, size: 20),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
