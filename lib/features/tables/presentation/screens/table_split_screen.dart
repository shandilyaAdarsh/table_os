import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../shared/models/money.dart';
import '../../../orders/presentation/state/active_order_notifier.dart';
import '../../../orders/domain/entities/order_item.dart';
import '../../providers/tables_providers.dart';

class TableSplitScreen extends ConsumerStatefulWidget {
  final String tableId;

  const TableSplitScreen({
    super.key,
    required this.tableId,
  });

  @override
  ConsumerState<TableSplitScreen> createState() => _TableSplitScreenState();
}

class _TableSplitScreenState extends ConsumerState<TableSplitScreen> {
  final Map<String, int> _itemSeatAssignments = {};
  int _activeSubBill = 1;
  int _subBillCount = 2; // Default to 2 sub-bills

  @override
  Widget build(BuildContext context) {
    final activeOrderAsync = ref.watch(activeOrderNotifierProvider(widget.tableId));
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8F9FA),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.close_rounded, color: isDark ? Colors.white54 : const Color(0xFF5D3F3C)),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Split Bill - Table ${widget.tableId}',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: Icon(Icons.help_outline_rounded, color: isDark ? Colors.white54 : const Color(0xFF5D3F3C)),
            onPressed: () {},
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: activeOrderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFE31E24))),
        error: (err, stack) => Center(child: Text('Error loading session: $err')),
        data: (order) {
          if (order == null || order.items.isEmpty) {
            return const Center(child: Text('No active items to split.'));
          }

          // Initialize unassigned
          for (final item in order.items) {
            _itemSeatAssignments.putIfAbsent(item.id, () => 0); // 0 = unassigned
          }

          var unassignedTotal = 0;
          for (final item in order.items) {
            if (_itemSeatAssignments[item.id] == 0) {
              unassignedTotal += item.totalPrice.amountInCents;
            }
          }

          final screenWidth = MediaQuery.of(context).size.width;
          final isDesktop = screenWidth >= 1024;

          return Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24.0),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 1200),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Summary Strip
                          Container(
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF1E293B) : Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: isDark ? Colors.white10 : const Color(0xFFE1E3E4)),
                              boxShadow: [
                                BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 12, offset: const Offset(0, 4)),
                              ],
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('TOTAL BILL', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: isDark ? Colors.white54 : const Color(0xFF64748B), letterSpacing: 1)),
                                    Text(order.totalPrice.formatted, style: GoogleFonts.plusJakartaSans(fontSize: 24, fontWeight: FontWeight.w700, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                                  ],
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('UNASSIGNED', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: const Color(0xFFE31E24), letterSpacing: 1)),
                                    Text(Money(amountInCents: unassignedTotal, currency: 'USD').formatted, style: GoogleFonts.plusJakartaSans(fontSize: 24, fontWeight: FontWeight.w700, color: const Color(0xFFE31E24))),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),

                          // Split Modes (Visual Only)
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF0F172A) : const Color(0xFFEDEEEF),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 10),
                                    decoration: BoxDecoration(color: isDark ? const Color(0xFF1E293B) : Colors.white, borderRadius: BorderRadius.circular(8), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 4, offset: const Offset(0, 2))]),
                                    alignment: Alignment.center,
                                    child: Text('Split by Item', style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w600, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                                  ),
                                ),
                                Expanded(
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 10),
                                    alignment: Alignment.center,
                                    child: Text('Equal Split', style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w600, color: isDark ? Colors.white54 : const Color(0xFF64748B))),
                                  ),
                                ),
                                Expanded(
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 10),
                                    alignment: Alignment.center,
                                    child: Text('Split by Seat', style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w600, color: isDark ? Colors.white54 : const Color(0xFF64748B))),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 32),

                          // Workspace
                          if (isDesktop)
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(flex: 5, child: _buildUnassignedList(order.items, isDark)),
                                const SizedBox(width: 32),
                                Expanded(flex: 6, child: _buildTargetBuckets(order.items, isDark)),
                              ],
                            )
                          else
                            Column(
                              children: [
                                _buildTargetBuckets(order.items, isDark),
                                const SizedBox(height: 32),
                                _buildUnassignedList(order.items, isDark),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              _buildBottomActionBar(order.items, unassignedTotal, isDark),
            ],
          );
        },
      ),
    );
  }

  Widget _buildUnassignedList(List<OrderItem> items, bool isDark) {
    final unassignedItems = items.where((i) => _itemSeatAssignments[i.id] == 0).toList();

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white10 : const Color(0xFFE1E3E4)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8F9FA),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              border: Border(bottom: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE1E3E4))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Unassigned Items', style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                Text('${unassignedItems.length} Items', style: GoogleFonts.plusJakartaSans(fontSize: 14, color: isDark ? Colors.white54 : const Color(0xFF64748B))),
              ],
            ),
          ),
          if (unassignedItems.isEmpty)
            Padding(
              padding: const EdgeInsets.all(40),
              child: Text('All items assigned!', style: GoogleFonts.plusJakartaSans(fontSize: 16, color: isDark ? Colors.white54 : const Color(0xFF64748B))),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: unassignedItems.length,
              separatorBuilder: (context, index) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = unassignedItems[index];
                return InkWell(
                  onTap: () {
                    setState(() {
                      _itemSeatAssignments[item.id] = _activeSubBill;
                    });
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      border: Border.all(color: isDark ? Colors.white10 : const Color(0xFFE1E3E4)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 24,
                          height: 24,
                          decoration: BoxDecoration(
                            border: Border.all(color: isDark ? Colors.white30 : const Color(0xFFBFC8D0)),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Icon(Icons.add_rounded, size: 16, color: Colors.transparent), // Transparent just for layout
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.product.name, style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w600, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                              if (item.selectedModifiers.isNotEmpty)
                                Text('w/ modifiers', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: isDark ? Colors.white54 : const Color(0xFF64748B))),
                            ],
                          ),
                        ),
                        Text(item.totalPrice.formatted, style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w700, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                      ],
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _buildTargetBuckets(List<OrderItem> items, bool isDark) {
    return Column(
      children: [
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: _subBillCount,
          separatorBuilder: (context, index) => const SizedBox(height: 24),
          itemBuilder: (context, index) {
            final billNum = index + 1;
            final billItems = items.where((i) => _itemSeatAssignments[i.id] == billNum).toList();
            final isActive = _activeSubBill == billNum;
            
            var totalCents = 0;
            for (var item in billItems) {
              totalCents += item.totalPrice.amountInCents;
            }

            return GestureDetector(
              onTap: () => setState(() => _activeSubBill = billNum),
              child: Container(
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isActive ? const Color(0xFFE31E24) : (isDark ? Colors.white10 : const Color(0xFFE1E3E4)),
                    width: isActive ? 2 : 1,
                  ),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 12, offset: const Offset(0, 4))],
                ),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: isActive 
                            ? const Color(0xFFFFDAD6) 
                            : (isDark ? const Color(0xFF0F172A) : const Color(0xFFF8F9FA)),
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
                        border: Border(bottom: BorderSide(color: isActive ? const Color(0xFFE7BDB8) : (isDark ? Colors.white10 : const Color(0xFFE1E3E4)))),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.person_rounded, color: isActive ? const Color(0xFF93000A) : (isDark ? Colors.white54 : const Color(0xFF5D3F3C))),
                              const SizedBox(width: 8),
                              Text('Guest $billNum', style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700, color: isActive ? const Color(0xFF93000A) : (isDark ? Colors.white : const Color(0xFF0F172A)))),
                            ],
                          ),
                          Text(Money(amountInCents: totalCents, currency: 'USD').formatted, style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700, color: isActive ? const Color(0xFF93000A) : (isDark ? Colors.white : const Color(0xFF0F172A)))),
                        ],
                      ),
                    ),
                    if (billItems.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 40),
                        child: Text(
                          isActive ? 'Tap unassigned items to add here' : 'Select this bill to add items',
                          style: GoogleFonts.plusJakartaSans(fontSize: 14, color: isDark ? Colors.white54 : const Color(0xFF64748B)),
                        ),
                      )
                    else
                      ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(16),
                        itemCount: billItems.length,
                        separatorBuilder: (context, index) => Divider(height: 16, color: isDark ? Colors.white10 : const Color(0xFFE1E3E4)),
                        itemBuilder: (context, idx) {
                          final item = billItems[idx];
                          return Row(
                            children: [
                              IconButton(
                                icon: const Icon(Icons.remove_circle_outline_rounded, color: Color(0xFFBA1A1A)),
                                onPressed: () => setState(() => _itemSeatAssignments[item.id] = 0),
                              ),
                              Expanded(
                                child: Text(item.product.name, style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w600, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                              ),
                              Text(item.totalPrice.formatted, style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                            ],
                          );
                        },
                      ),
                  ],
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 24),
        InkWell(
          onTap: () => setState(() => _subBillCount++),
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF0F172A) : const Color(0xFFEDEEEF),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: isDark ? Colors.white24 : const Color(0xFFBFC8D0), style: BorderStyle.solid), // mock dashed
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.add_rounded, color: isDark ? Colors.white54 : const Color(0xFF5D3F3C)),
                const SizedBox(width: 8),
                Text('Add Sub-bill', style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w600, color: isDark ? Colors.white54 : const Color(0xFF5D3F3C))),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBottomActionBar(List<OrderItem> items, int unassignedTotal, bool isDark) {
    final isValid = unassignedTotal == 0;
    
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 24, offset: const Offset(0, -8))],
        border: Border(top: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE1E3E4))),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32), // pb for safe area
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              ElevatedButton.icon(
                icon: const Icon(Icons.receipt_long_rounded),
                label: Text('Generate Invoices', style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: isValid ? const Color(0xFFE31E24) : (isDark ? const Color(0xFF334155) : const Color(0xFFE2E2E5)),
                  foregroundColor: isValid ? Colors.white : (isDark ? Colors.white54 : const Color(0xFF64748B)),
                  padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                onPressed: !isValid ? null : () async {
                  final partitions = <Map<String, dynamic>>[];
                  for (int seatNum = 1; seatNum <= _subBillCount; seatNum++) {
                    final seatItemIds = items.where((item) => (_itemSeatAssignments[item.id] ?? 0) == seatNum).map((item) => item.id).toList();
                    if (seatItemIds.isNotEmpty) {
                      partitions.add({
                        'seat_number': seatNum,
                        'guest_name': 'Guest $seatNum',
                        'ordered_item_ids': seatItemIds,
                      });
                    }
                  }

                  await ref.read(tablesRepositoryProvider).splitTable(widget.tableId, partitions);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Table split successfully.')));
                    context.pop();
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
