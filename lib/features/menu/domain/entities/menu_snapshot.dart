// lib/features/menu/domain/entities/menu_snapshot.dart
import 'package:equatable/equatable.dart';
import '../../../../shared/models/money.dart';
import '../../../orders/domain/entities/menu_product.dart' as orders_entities;

class MenuCategory extends Equatable {
  final String id;
  final String name;
  final int sortOrder;

  const MenuCategory({
    required this.id,
    required this.name,
    required this.sortOrder,
  });

  @override
  List<Object?> get props => [id, name, sortOrder];
}

class MenuItem extends Equatable {
  final String id;
  final String categoryId;
  final String name;
  final String description;
  final Money price;
  final bool isAvailable;
  final List<String> modifierGroupIds;

  const MenuItem({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.description,
    required this.price,
    required this.isAvailable,
    required this.modifierGroupIds,
  });

  MenuItem copyWith({
    String? id,
    String? categoryId,
    String? name,
    String? description,
    Money? price,
    bool? isAvailable,
    List<String>? modifierGroupIds,
  }) {
    return MenuItem(
      id: id ?? this.id,
      categoryId: categoryId ?? this.categoryId,
      name: name ?? this.name,
      description: description ?? this.description,
      price: price ?? this.price,
      isAvailable: isAvailable ?? this.isAvailable,
      modifierGroupIds: modifierGroupIds ?? this.modifierGroupIds,
    );
  }

  @override
  List<Object?> get props => [id, categoryId, name, description, price, isAvailable, modifierGroupIds];
}

class ModifierGroup extends Equatable {
  final String id;
  final String name;
  final List<ModifierOption> options;

  const ModifierGroup({
    required this.id,
    required this.name,
    required this.options,
  });

  @override
  List<Object?> get props => [id, name, options];
}

class ModifierOption extends Equatable {
  final String id;
  final String name;
  final Money price;

  const ModifierOption({
    required this.id,
    required this.name,
    required this.price,
  });

  @override
  List<Object?> get props => [id, name, price];
}

class TaxConfig extends Equatable {
  final double vatRate;
  final double serviceChargeRate;

  const TaxConfig({
    required this.vatRate,
    required this.serviceChargeRate,
  });

  @override
  List<Object?> get props => [vatRate, serviceChargeRate];
}

class MenuSnapshot extends Equatable {
  final List<MenuCategory> categories;
  final List<MenuItem> items;
  final List<ModifierGroup> modifierGroups;
  final TaxConfig taxConfig;

  const MenuSnapshot({
    required this.categories,
    required this.items,
    required this.modifierGroups,
    required this.taxConfig,
  });

  @override
  List<Object?> get props => [categories, items, modifierGroups, taxConfig];

  /// Helper to convert snapshot items to legacy domain models for UI compatibility
  List<orders_entities.MenuProduct> toMenuProducts() {
    final products = <orders_entities.MenuProduct>[];

    final categoryMap = {for (final cat in categories) cat.id: cat.name};
    final groupMap = {for (final group in modifierGroups) group.id: group};

    for (final item in items) {
      final categoryName = categoryMap[item.categoryId] ?? 'All';

      // Gather modifier options from groups assigned to this item
      final availableModifiers = <orders_entities.ModifierOption>[];
      for (final groupId in item.modifierGroupIds) {
        final group = groupMap[groupId];
        if (group != null) {
          for (final opt in group.options) {
            availableModifiers.add(
              orders_entities.ModifierOption(
                id: opt.id,
                name: opt.name,
                price: opt.price,
              ),
            );
          }
        }
      }

      // We only append if item is available or we let UI disable unavailable items
      // (OrderEditorScreen filters or styles unavailable items based on isAvailable)
      // Since availability overlay will dynamically toggle isAvailable, we keep all products but carry availability status
      // We will handle availability overlays in state management.
      products.add(
        orders_entities.MenuProduct(
          id: item.id,
          name: item.name,
          price: item.price,
          category: categoryName,
          availableModifiers: availableModifiers,
        ),
      );
    }

    return products;
  }
}
