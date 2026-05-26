// lib/features/orders/domain/repositories/orders_repository.dart
import '../entities/order.dart';

abstract class OrdersRepository {
  Future<Order?> getOrderById(String orderId);
  Future<Order?> getActiveOrderForTable(String tableId);
  Future<Order> saveOrder(Order order);
  Stream<List<Order>> watchActiveOrders();
  Stream<Order?> watchOrderById(String orderId);

  Future<void> applyRemoteOrderUpdate(Order order);
  Future<void> applyRemoteOrderDelete(String orderId);

  // New sync methods for deterministic projection
  Future<void> syncOrders(List<Order> orders);
  Future<List<Order>> fetchActiveOrders();
}
