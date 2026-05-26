// lib/features/tables/domain/repositories/tables_repository.dart
import '../entities/restaurant_table.dart';

abstract class TablesRepository {
  Future<List<RestaurantTable>> getTables();
  Future<RestaurantTable> updateTableStatus(String id, TableStatus status, {String? orderId});
  Stream<List<RestaurantTable>> watchTables();
  Future<void> mergeTables(List<String> sourceTableIds, String targetTableId);
  Future<void> splitTable(String tableId, List<Map<String, dynamic>> splitPartitions);

  Future<void> applyRemoteTableUpdate(RestaurantTable table);
  Future<void> applyRemoteTableDelete(String tableId);

  // New sync methods for deterministic projection
  Future<void> syncTables(List<RestaurantTable> tables);
  Future<List<RestaurantTable>> fetchTables();
}
