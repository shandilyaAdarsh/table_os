// lib/features/tables/data/repositories/tables_repository_impl.dart
import 'dart:async';
import '../../../../core/network/network_info.dart';
import '../../../../core/network/offline_queue.dart';
import '../../domain/entities/restaurant_table.dart';
import '../../domain/repositories/tables_repository.dart';
import '../datasources/local/tables_local_datasource.dart';
import '../datasources/remote/tables_remote_datasource.dart';
import '../mappers/table_mapper.dart';
import '../dtos/table_dto.dart';

class TablesRepositoryImpl implements TablesRepository {
  final TablesRemoteDatasource remote;
  final TablesLocalDatasource local;
  final NetworkInfo networkInfo;
  final OfflineQueueManager offlineQueue;

  TablesRepositoryImpl({
    required this.remote,
    required this.local,
    required this.networkInfo,
    required this.offlineQueue,
  }) {
    // Register the offline write handler for updating table status
    offlineQueue.registerHandler('updateTableStatus', (payload) async {
      final id = payload['id'] as String;
      final statusName = payload['status'] as String;
      final orderId = payload['orderId'] as String?;
      
      final result = await remote.updateTableStatus(id, statusName, orderId: orderId);
      await local.cacheTable(result);
    });

    offlineQueue.registerHandler('mergeTables', (payload) async {
      final sourceTableIds = List<String>.from(payload['sourceTableIds'] as List);
      final targetTableId = payload['targetTableId'] as String;
      await remote.mergeTables(sourceTableIds, targetTableId);
    });

    offlineQueue.registerHandler('splitTable', (payload) async {
      final tableId = payload['tableId'] as String;
      final splitPartitions = List<Map<String, dynamic>>.from(payload['splitPartitions'] as List);
      await remote.splitTable(tableId, splitPartitions);
    });
  }

  @override
  Future<List<RestaurantTable>> getTables() async {
    if (await networkInfo.isConnected) {
      try {
        final remoteItems = await remote.getTables();
        await local.cacheTables(remoteItems);
        return remoteItems.map((e) => e.toDomain()).toList();
      } catch (_) {
        // Fallback to local cache on request error
        final localItems = await local.getCachedTables();
        return localItems.map((e) => e.toDomain()).toList();
      }
    } else {
      // Offline fallback
      final localItems = await local.getCachedTables();
      return localItems.map((e) => e.toDomain()).toList();
    }
  }

  @override
  Future<RestaurantTable> updateTableStatus(String id, TableStatus status, {String? orderId}) async {
    // 1. Optimistic local update
    final localItems = await local.getCachedTables();
    final index = localItems.indexWhere((t) => t.id == id);
    if (index != -1) {
      final updated = localItems[index].copyWith(
        status: status.name,
        activeOrderId: orderId,
      );
      await local.cacheTable(updated);
    }

    final payload = {
      'id': id,
      'status': status.name,
      'orderId': orderId,
    };

    if (await networkInfo.isConnected) {
      try {
        final result = await remote.updateTableStatus(id, status.name, orderId: orderId);
        await local.cacheTable(result);
        return result.toDomain();
      } catch (e) {
        // Queue the write on remote request failure and return optimistic local entity
        await offlineQueue.queueWrite(action: 'updateTableStatus', payload: payload);
        final localTable = (await local.getCachedTables()).firstWhere((t) => t.id == id);
        return localTable.toDomain();
      }
    } else {
      // Queue the write immediately and return optimistic local entity
      await offlineQueue.queueWrite(action: 'updateTableStatus', payload: payload);
      final localTable = (await local.getCachedTables()).firstWhere((t) => t.id == id);
      return localTable.toDomain();
    }
  }

  @override
  Stream<List<RestaurantTable>> watchTables() async* {
    StreamSubscription? remoteSub;
    StreamSubscription? connSub;

    void startRemoteWatch() {
      remoteSub?.cancel();
      remoteSub = remote.watchTables().listen((remoteDtos) async {
        await local.cacheTables(remoteDtos);
      }, onError: (_) {});
    }

    final initialOnline = await networkInfo.isConnected;
    if (initialOnline) {
      startRemoteWatch();
    }

    connSub = networkInfo.onConnectionChanged.listen((online) {
      if (online) {
        startRemoteWatch();
      } else {
        remoteSub?.cancel();
        remoteSub = null;
      }
    });

    try {
      yield* local.watchCachedTables().map((dtos) {
        return dtos.map((d) => d.toDomain()).toList();
      });
    } finally {
      await remoteSub?.cancel();
      await connSub.cancel();
    }
  }

  @override
  Future<void> mergeTables(List<String> sourceTableIds, String targetTableId) async {
    final localItems = await local.getCachedTables();
    final targetIndex = localItems.indexWhere((t) => t.id == targetTableId);
    if (targetIndex != -1) {
      final updatedTarget = localItems[targetIndex].copyWith(
        status: TableStatus.occupied.name,
        mergedTableIds: [...localItems[targetIndex].mergedTableIds, ...sourceTableIds],
      );
      await local.cacheTable(updatedTarget);
    }

    for (final srcId in sourceTableIds) {
      final srcIndex = localItems.indexWhere((t) => t.id == srcId);
      if (srcIndex != -1) {
        final updatedSrc = localItems[srcIndex].copyWith(
          status: TableStatus.occupied.name,
          activeOrderId: null,
        );
        await local.cacheTable(updatedSrc);
      }
    }

    final payload = {
      'sourceTableIds': sourceTableIds,
      'targetTableId': targetTableId,
    };

    if (await networkInfo.isConnected) {
      try {
        await remote.mergeTables(sourceTableIds, targetTableId);
      } catch (e) {
        await offlineQueue.queueWrite(action: 'mergeTables', payload: payload);
      }
    } else {
      await offlineQueue.queueWrite(action: 'mergeTables', payload: payload);
    }
  }

  @override
  Future<void> splitTable(String tableId, List<Map<String, dynamic>> splitPartitions) async {
    final localItems = await local.getCachedTables();
    final index = localItems.indexWhere((t) => t.id == tableId);
    if (index != -1) {
      final seatDtos = splitPartitions.map<GuestSeatDto>((p) => GuestSeatDto.fromJson(p)).toList();
      final updated = localItems[index].copyWith(
        occupiedSeats: seatDtos,
        mergedTableIds: [],
      );
      await local.cacheTable(updated);
    }

    final payload = {
      'tableId': tableId,
      'splitPartitions': splitPartitions,
    };

    if (await networkInfo.isConnected) {
      try {
        await remote.splitTable(tableId, splitPartitions);
      } catch (e) {
        await offlineQueue.queueWrite(action: 'splitTable', payload: payload);
      }
    } else {
      await offlineQueue.queueWrite(action: 'splitTable', payload: payload);
    }
  }

  @override
  Future<void> applyRemoteTableUpdate(RestaurantTable table) async {
    await local.cacheTable(table.toDto());
  }

  @override
  Future<void> applyRemoteTableDelete(String tableId) async {
    final current = await local.getCachedTables();
    final filtered = current.where((dto) => dto.id != tableId).toList();
    await local.cacheTables(filtered);
  }

  @override
  Future<void> syncTables(List<RestaurantTable> tables) async {
    final dtos = tables.map((t) => t.toDto()).toList();
    await local.cacheTables(dtos);
  }

  @override
  Future<List<RestaurantTable>> fetchTables() async {
    return getTables();
  }
}
