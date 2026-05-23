// lib/features/menu/domain/repositories/menu_repository.dart
import '../entities/menu_snapshot.dart';

abstract class MenuRepository {
  /// Fetches the menu snapshot.
  /// If [forceRefresh] is true, ignores any ETag check and forces a full reload from the server.
  Future<MenuSnapshot> getMenuSnapshot({
    required String branchId,
    bool forceRefresh = false,
  });

  /// Fetches the lightweight item availability mapping from the server.
  Future<Map<String, bool>> getItemAvailability({
    required String branchId,
  });
}
