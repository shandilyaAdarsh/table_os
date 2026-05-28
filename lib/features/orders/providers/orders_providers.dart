// lib/features/orders/providers/orders_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../bootstrap/bootstrap.dart';
import '../data/datasources/local/orders_local_datasource.dart';
import '../data/repositories/orders_repository_impl.dart';
import '../domain/entities/menu_product.dart';
import '../domain/repositories/orders_repository.dart';

import '../../menu/presentation/state/menu_providers.dart';

import '../../../../core/network/dio_client.dart';
import '../../../../core/network/network_providers.dart';
import '../data/datasources/remote/orders_remote_datasource.dart';

final ordersLocalDatasourceProvider = Provider<OrdersLocalDatasource>((ref) {
  final prefs = ref.watch(sharedPreferencesProvider);
  return OrdersLocalDatasourceImpl(prefs);
});

final ordersRemoteDatasourceProvider = Provider<OrdersRemoteDatasource>((ref) {
  final dio = ref.watch(dioClientProvider);
  return OrdersRemoteDatasourceImpl(dio);
});

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  final local = ref.watch(ordersLocalDatasourceProvider);
  final remote = ref.watch(ordersRemoteDatasourceProvider);
  final offlineQueue = ref.watch(offlineQueueManagerProvider);
  return OrdersRepositoryImpl(
    local: local,
    remote: remote,
    offlineQueue: offlineQueue,
    ref: ref,
  );
});

final menuProductsProvider = Provider<List<MenuProduct>>((ref) {
  return ref.watch(publicMenuProductsProvider);
});

