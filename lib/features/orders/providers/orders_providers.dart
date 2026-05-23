// lib/features/orders/providers/orders_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../bootstrap/bootstrap.dart';
import '../data/datasources/local/orders_local_datasource.dart';
import '../data/repositories/orders_repository_impl.dart';
import '../domain/entities/menu_product.dart';
import '../domain/repositories/orders_repository.dart';

import '../../menu/presentation/state/menu_providers.dart';

final ordersLocalDatasourceProvider = Provider<OrdersLocalDatasource>((ref) {
  final prefs = ref.watch(sharedPreferencesProvider);
  return OrdersLocalDatasourceImpl(prefs);
});

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  final local = ref.watch(ordersLocalDatasourceProvider);
  return OrdersRepositoryImpl(local: local);
});

final menuProductsProvider = Provider<List<MenuProduct>>((ref) {
  return ref.watch(publicMenuProductsProvider);
});

