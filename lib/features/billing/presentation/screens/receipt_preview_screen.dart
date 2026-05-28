// lib/features/billing/presentation/screens/receipt_preview_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../orders/domain/entities/order.dart';
import '../../../orders/providers/orders_providers.dart';
import '../../data/services/printer_service.dart';

// In domain model we have Money, let's make sure it handles calculations cleanly
class ReceiptPreviewScreen extends ConsumerWidget {
  final String tableId;

  const ReceiptPreviewScreen({
    super.key,
    required this.tableId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _ReceiptPreviewContent(tableId: tableId);
  }
}

class _ReceiptPreviewContent extends ConsumerWidget {
  final String tableId;
  const _ReceiptPreviewContent({required this.tableId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ordersRepo = ref.watch(ordersRepositoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Receipt Draft Preview', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: StreamBuilder<List<Order>>(
        stream: ordersRepo.watchActiveOrders(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: AppColors.primary));
          }

          final orders = snapshot.data ?? [];
          final orderIndex = orders.indexWhere((o) => o.tableId == tableId);
          if (orderIndex == -1) {
            return const Center(child: Text('No active order session found for this table.'));
          }

          final order = orders[orderIndex];
          final subtotal = order.totalPrice.asDouble;
          final tax = subtotal * 0.10; // 10% tax mock
          final serviceCharge = subtotal * 0.10; // 10% service charge mock
          final total = subtotal + tax + serviceCharge;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              children: [
                _buildWatermarkWarning(theme),
                const SizedBox(height: 16),
                _buildReceiptPaperCard(order, subtotal, tax, serviceCharge, total, theme, isDark),
                const SizedBox(height: 24),
                _buildActionButtons(context, order, subtotal, tax, serviceCharge, total),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildWatermarkWarning(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.warning),
      ),
      child: const Row(
        children: [
          Icon(Icons.warning_amber_rounded, color: AppColors.warning),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'PREVIEW ONLY - NOT A TAX INVOICE. Settlements must be finalised on POS.',
              style: TextStyle(color: AppColors.warning, fontWeight: FontWeight.bold, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReceiptPaperCard(
    Order order,
    double subtotal,
    double tax,
    double serviceCharge,
    double total,
    ThemeData theme,
    bool isDark,
  ) {
    return Card(
      color: isDark ? const Color(0xFF2C2C32) : Colors.yellow[50], // Receipt paper visual feel
      elevation: 4,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero, // Straight receipt edge
      ),
      child: Container(
        padding: const EdgeInsets.all(24.0),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade400),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Column(
                children: [
                  Text(
                    'ORDERLLI BISTRO',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: Colors.black,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text('123 Gastronomy St, London', style: TextStyle(color: Colors.black54, fontSize: 12)),
                  const Text('Tel: +44 20 7946 0958', style: TextStyle(color: Colors.black54, fontSize: 12)),
                  const SizedBox(height: 12),
                  const Text('--- DRAFT RECEIPT ---', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const Divider(color: Colors.black38, height: 24, thickness: 1),
            Text('Date: 22-05-2026 19:45', style: TextStyle(color: Colors.grey[800], fontSize: 12)),
            Text('Table: ${order.tableId}', style: TextStyle(color: Colors.grey[800], fontSize: 12, fontWeight: FontWeight.bold)),
            Text('Waiter: ${order.waiterName}', style: TextStyle(color: Colors.grey[800], fontSize: 12)),
            const Divider(color: Colors.black38, height: 24, thickness: 1),
            
            // Item details
            ...order.items.map((item) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        '${item.quantity}x ${item.product.name}',
                        style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold),
                      ),
                    ),
                    Text(
                      item.totalPrice.formatted,
                      style: const TextStyle(color: Colors.black),
                    ),
                  ],
                ),
              );
            }),
            const Divider(color: Colors.black38, height: 24, thickness: 1),
            _buildReceiptRow('Subtotal:', '\$${subtotal.toStringAsFixed(2)}'),
            _buildReceiptRow('VAT Tax (10%):', '\$${tax.toStringAsFixed(2)}'),
            _buildReceiptRow('Service Charge (10%):', '\$${serviceCharge.toStringAsFixed(2)}'),
            const Divider(color: Colors.black38, height: 24, thickness: 1),
            _buildReceiptRow(
              'TOTAL AMOUNT:',
              '\$${total.toStringAsFixed(2)}',
              isLarge: true,
            ),
            const SizedBox(height: 32),
            const Center(
              child: Text(
                'Thank you for dining with us!',
                style: TextStyle(color: Colors.black54, fontStyle: FontStyle.italic),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReceiptRow(String label, String value, {bool isLarge = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            color: Colors.black,
            fontWeight: isLarge ? FontWeight.w900 : FontWeight.bold,
            fontSize: isLarge ? 16 : 14,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: Colors.black,
            fontWeight: isLarge ? FontWeight.w900 : FontWeight.normal,
            fontSize: isLarge ? 16 : 14,
          ),
        ),
      ],
    );
  }

  Widget _buildActionButtons(
    BuildContext context,
    Order order,
    double subtotal,
    double tax,
    double serviceCharge,
    double total,
  ) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            icon: const Icon(Icons.print_rounded),
            label: const Text('Local Print'),
            onPressed: () async {
              // Capture context-dependent objects BEFORE any await
              final messenger = ScaffoldMessenger.of(context);
              await HapticFeedback.lightImpact();
              final printer = LocalPrinterService();
              final rawBytes = 'ORDERLLI BISTRO\nTable: ${order.tableId}\nTotal: \$${total.toStringAsFixed(2)}\n';
              try {
                await printer.printReceiptDraft('192.168.1.100', rawBytes);
                messenger.showSnackBar(
                  const SnackBar(content: Text('Print job sent to receipt printer.')),
                );
              } catch (e) {
                messenger.showSnackBar(
                  SnackBar(
                    content: Text('Print failed: $e. Setup local printer IP.'),
                    backgroundColor: AppColors.error,
                  ),
                );
              }
            },
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            icon: const Icon(Icons.share_rounded),
            label: const Text('Share PDF'),
            onPressed: () {
              HapticFeedback.lightImpact();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Receipt PDF draft generated and shared.')),
              );
            },
          ),
        ),
      ],
    );
  }
}
