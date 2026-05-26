// lib/features/orders/data/repositories/orders_repository_impl.dart
import 'dart:async';
import '../../domain/entities/order.dart';
import '../../domain/repositories/orders_repository.dart';
import '../datasources/local/orders_local_datasource.dart';
import '../mappers/order_mapper.dart';

class OrdersRepositoryImpl implements OrdersRepository {
  final OrdersLocalDatasource local;

  OrdersRepositoryImpl({required this.local});

  @override
  Future<Order?> getOrderById(String orderId) async {
    final dto = await local.getCachedOrderById(orderId);
    return dto?.toDomain();
  }

  @override
  Future<Order?> getActiveOrderForTable(String tableId) async {
    final dto = await local.getActiveOrderForTable(tableId);
    return dto?.toDomain();
  }

  @override
  Future<Order> saveOrder(Order order) async {
    final dto = order.toDto();
    await local.cacheOrder(dto);
    return order;
  }

  @override
  Future<void> applyRemoteOrderUpdate(Order order) async {
    await local.cacheOrder(order.toDto());
  }

  @override
  Future<void> applyRemoteOrderDelete(String orderId) async {
    final current = await local.getCachedOrders();
    final filtered = current.where((dto) => dto.id != orderId).toList();
    await local.cacheOrders(filtered);
  }

  @override
  Stream<List<Order>> watchActiveOrders() {
    return local.watchCachedOrders().map((list) {
      return list
          .map((dto) => dto.toDomain())
          .where((o) => o.status != OrderStatus.completed && o.status != OrderStatus.cancelled)
          .toList();
    });
  }

  @override
  Stream<Order?> watchOrderById(String orderId) {
    return local.watchCachedOrders().map((list) {
      final index = list.indexWhere((dto) => dto.id == orderId);
      return index != -1 ? list[index].toDomain() : null;
    });
  }

  @override
  Future<void> syncOrders(List<Order> orders) async {
    final dtos = orders.map((o) => o.toDto()).toList();
    await local.cacheOrders(dtos);
  }

  @override
  Future<List<Order>> fetchActiveOrders() async {
    // In a real implementation this would fetch from a remote API.
    // For this simulation, we'll just return what's in the local cache.
    final cached = await local.getCachedOrders();
    return cached
        .map((dto) => dto.toDomain())
        .where((o) => o.status != OrderStatus.completed && o.status != OrderStatus.cancelled)
        .toList();
  }
}
