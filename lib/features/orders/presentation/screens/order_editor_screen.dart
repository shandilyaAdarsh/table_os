// lib/features/orders/presentation/screens/order_editor_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/sync_state_chip.dart';
import '../../../menu/presentation/state/menu_providers.dart';
import '../../../menu/presentation/widgets/menu_error_state.dart';
import '../../../menu/presentation/widgets/menu_skeleton_loader.dart';
import '../../domain/entities/menu_product.dart';
import '../../domain/entities/order.dart';
import '../../domain/entities/order_item.dart';
import '../state/active_order_notifier.dart';
import '../widgets/modifier_selector_sheet.dart';
import '../../providers/orders_providers.dart';

class OrderEditorScreen extends ConsumerStatefulWidget {
  final String tableId;

  const OrderEditorScreen({
    super.key,
    required this.tableId,
  });

  @override
  ConsumerState<OrderEditorScreen> createState() => _OrderEditorScreenState();
}

class _OrderEditorScreenState extends ConsumerState<OrderEditorScreen> {
  int _selectedSeat = 1;
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    // Start background availability overlay polling when active
    ref.watch(menuAvailabilityPollingProvider);

    final activeOrderAsync = ref.watch(activeOrderNotifierProvider(widget.tableId));
    final menuSnapshotAsync = ref.watch(menuSnapshotNotifierProvider);
    final menuProducts = ref.watch(menuProductsProvider);
    final menuSyncState = ref.watch(menuStalenessProvider);
    
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    
    // Check screen width for tablet responsive layouts
    final screenWidth = MediaQuery.of(context).size.width;
    final isTablet = screenWidth > 800;

    // Build availability map from snapshot data
    final availabilityMap = menuSnapshotAsync.maybeWhen(
      data: (snapshot) => {for (final item in snapshot.items) item.id: item.isAvailable},
      orElse: () => <String, bool>{},
    );

    return Scaffold(
      appBar: AppBar(
        title: Text('Table ${widget.tableId} - Order Editor'),
        actions: [
          SyncStateChip(overrideState: menuSyncState),
          const SizedBox(width: 8),
          _buildSeatSelector(theme, isDark),
          const SizedBox(width: 8),
        ],
      ),
      body: activeOrderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (err, stack) => Center(child: Text('Error loading order: $err')),
        data: (order) {
          if (order == null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.shopping_cart_outlined, size: 64, color: AppColors.info),
                  const SizedBox(height: 16),
                  Text('No active session initialized', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => ref.read(activeOrderNotifierProvider(widget.tableId).notifier).createOrder(),
                    child: const Text('Start Seating Session'),
                  ),
                ],
              ),
            );
          }

          // Main Responsive Layout
          if (isTablet) {
            return Row(
              children: [
                // Left Menu Browser
                Expanded(
                  flex: 3,
                  child: _buildMenuBrowserSection(menuSnapshotAsync, menuProducts, availabilityMap, theme, isDark),
                ),
                const VerticalDivider(width: 1),
                // Right Checkout/Draft Sidebar
                Expanded(
                  flex: 2,
                  child: _buildDraftSidebar(order, theme, isDark),
                ),
              ],
            );
          } else {
            // Mobile Layout
            return Column(
              children: [
                Expanded(
                  flex: 3,
                  child: _buildMenuBrowserSection(menuSnapshotAsync, menuProducts, availabilityMap, theme, isDark),
                ),
                const Divider(height: 1),
                Expanded(
                  flex: 2,
                  child: _buildDraftSidebar(order, theme, isDark),
                ),
              ],
            );
          }
        },
      ),
    );
  }

  Widget _buildSeatSelector(ThemeData theme, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.grey[200],
        borderRadius: BorderRadius.circular(12),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<int>(
          value: _selectedSeat,
          dropdownColor: isDark ? AppColors.darkSurface : Colors.white,
          items: List.generate(6, (index) => index + 1).map((seat) {
            return DropdownMenuItem<int>(
              value: seat,
              child: Text('Seat $seat', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold)),
            );
          }).toList(),
          onChanged: (val) {
            if (val != null) {
              setState(() {
                _selectedSeat = val;
              });
            }
          },
        ),
      ),
    );
  }

  Widget _buildMenuBrowserSection(
    AsyncValue menuSnapshotAsync,
    List<MenuProduct> products,
    Map<String, bool> availabilityMap,
    ThemeData theme,
    bool isDark,
  ) {
    return menuSnapshotAsync.when(
      loading: () => const MenuSkeletonLoader(),
      error: (err, stack) => MenuErrorState(
        errorMessage: err.toString(),
        onRetry: () => ref.read(menuSnapshotNotifierProvider.notifier).refresh(),
      ),
      data: (snapshot) {
        final categories = ['All'] + snapshot.categories.map((c) => c.name).toList();

        return DefaultTabController(
          length: categories.length,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Search menu items...',
                    hintStyle: GoogleFonts.plusJakartaSans(color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                    prefixIcon: const Icon(Icons.search_rounded),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.primary, width: 2),
                    ),
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                  onChanged: (val) {
                    setState(() {
                      _searchQuery = val;
                    });
                  },
                ),
              ),
              TabBar(
                isScrollable: true,
                labelColor: AppColors.primary,
                unselectedLabelColor: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                indicatorColor: AppColors.primary,
                tabs: categories.map((cat) => Tab(text: cat)).toList(),
              ),
              Expanded(
                child: TabBarView(
                  children: categories.map((category) {
                    final searchFiltered = products.where((p) =>
                      p.name.toLowerCase().contains(_searchQuery.toLowerCase())
                    ).toList();

                    final filtered = category == 'All'
                        ? searchFiltered
                        : searchFiltered.where((p) => p.category == category).toList();

                    if (filtered.isEmpty) {
                      return Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.search_off_rounded, size: 48, color: isDark ? AppColors.darkBorder : Colors.grey[400]),
                            const SizedBox(height: 12),
                            Text(
                              'No menu items found',
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                              ),
                            ),
                          ],
                        ),
                      );
                    }

                    return GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 200,
                        mainAxisExtent: 140,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                      ),
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final product = filtered[index];
                        final isAvailable = availabilityMap[product.id] ?? true;

                        return GestureDetector(
                          onDoubleTap: isAvailable ? () => _showModifiersSheet(product) : null,
                          onHorizontalDragEnd: isAvailable
                              ? (details) {
                                  if (details.primaryVelocity != null && details.primaryVelocity! > 0) {
                                    ref
                                        .read(activeOrderNotifierProvider(widget.tableId).notifier)
                                        .addItem(product, _selectedSeat, const []);
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text('Added ${product.name} to Seat $_selectedSeat'),
                                        duration: const Duration(seconds: 1),
                                      ),
                                    );
                                  }
                                }
                              : null,
                          child: Stack(
                            children: [
                              Container(
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
                                child: Opacity(
                                  opacity: isAvailable ? 1.0 : 0.45,
                                  child: Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                          Text(
                                            product.name,
                                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 16),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        const Spacer(),
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                              Text(
                                                product.price.formatted,
                                                style: GoogleFonts.plusJakartaSans(
                                                  color: AppColors.primary,
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 14,
                                                ),
                                              ),
                                            IconButton.filled(
                                              style: IconButton.styleFrom(
                                                backgroundColor: AppColors.primary,
                                                foregroundColor: Colors.white,
                                              ),
                                              icon: const Icon(Icons.add_rounded, size: 20),
                                              onPressed: isAvailable ? () => _showModifiersSheet(product) : null,
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              if (!isAvailable)
                                Positioned.fill(
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: Colors.transparent,
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    child: Center(
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                        decoration: BoxDecoration(
                                          color: AppColors.error,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                          child: Text(
                                            'OUT OF STOCK',
                                            style: GoogleFonts.plusJakartaSans(
                                              color: Colors.white,
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800,
                                              letterSpacing: 0.5,
                                            ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        );
                      },
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showModifiersSheet(MenuProduct product) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => ModifierSelectorSheet(
        product: product,
        onConfirm: (selectedModifiers) {
          ref
              .read(activeOrderNotifierProvider(widget.tableId).notifier)
              .addItem(product, _selectedSeat, selectedModifiers);
        },
      ),
    );
  }

  Widget _buildDraftSidebar(Order order, ThemeData theme, bool isDark) {
    final groupedItems = <int, List<OrderItem>>{};
    for (final item in order.items) {
      groupedItems.putIfAbsent(item.seatNumber, () => []).add(item);
    }

    final sortedSeats = groupedItems.keys.toList()..sort();

    return Container(
      color: isDark ? AppColors.darkSurface : Colors.grey[50],
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Draft Order Items',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  order.status.name.toUpperCase(),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: order.items.isEmpty
                ? Center(
                    child: Text(
                      'No items added to draft yet.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                  )
                : ListView.builder(
                    itemCount: sortedSeats.length,
                    itemBuilder: (context, sIndex) {
                      final seat = sortedSeats[sIndex];
                      final seatItems = groupedItems[seat]!;

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                            color: isDark ? AppColors.darkBorder : Colors.grey[200],
                            width: double.infinity,
                            child: Text(
                              'Seat $seat',
                              style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
                            ),
                          ),
                          ...seatItems.map((item) {
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(item.product.name, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold)),
                              subtitle: item.selectedModifiers.isEmpty
                                  ? null
                                  : Text(
                                      item.selectedModifiers.map((m) => m.name).join(', '),
                                      style: theme.textTheme.bodySmall,
                                    ),
                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(item.totalPrice.formatted, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                                  const SizedBox(width: 8),
                                  Container(
                                    decoration: BoxDecoration(
                                      color: isDark ? AppColors.darkBorder : Colors.grey[200],
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        IconButton(
                                          icon: const Icon(Icons.remove_rounded, size: 16),
                                          constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                                          padding: EdgeInsets.zero,
                                          onPressed: () {
                                            ref
                                                .read(activeOrderNotifierProvider(widget.tableId).notifier)
                                                .updateItemQuantity(item.id, item.quantity - 1);
                                          },
                                        ),
                                        Text(item.quantity.toString(), style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600)),
                                        IconButton(
                                          icon: const Icon(Icons.add_rounded, size: 16),
                                          constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                                          padding: EdgeInsets.zero,
                                          onPressed: () {
                                            ref
                                                .read(activeOrderNotifierProvider(widget.tableId).notifier)
                                                .updateItemQuantity(item.id, item.quantity + 1);
                                          },
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }),
                        ],
                      );
                    },
                  ),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8.0),
            key: const ValueKey('total-cost-row'),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Est. Subtotal', style: TextStyle(fontWeight: FontWeight.bold)),
                Text(
                  order.totalPrice.formatted,
                  style: GoogleFonts.plusJakartaSans(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w800,
                    fontSize: 24,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  onPressed: () => context.pop(),
                  child: const Text('Back to Floor'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 0,
                  ),
                  onPressed: order.items.isEmpty
                      ? null
                      : () async {
                           await ref.read(activeOrderNotifierProvider(widget.tableId).notifier).sendToKitchen();
                           if (mounted) {
                             ScaffoldMessenger.of(context).showSnackBar(
                               const SnackBar(
                                 content: Text('Order sent to kitchen display queue successfully!'),
                                 backgroundColor: AppColors.success,
                               ),
                             );
                             context.pop();
                           }
                         },
                  child: Text(
                    'Send to Kitchen',
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
