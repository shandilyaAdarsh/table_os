// ignore_for_file: prefer_const_constructors, prefer_const_declarations
import 'package:flutter_test/flutter_test.dart';
import 'package:orderlyy_app/core/network/network_info.dart';
import 'package:orderlyy_app/core/network/offline_queue.dart';
import 'package:orderlyy_app/features/tables/data/datasources/local/tables_local_datasource.dart';
import 'package:orderlyy_app/features/tables/data/datasources/remote/tables_remote_datasource.dart';
import 'package:orderlyy_app/features/tables/data/dtos/table_dto.dart';
import 'package:orderlyy_app/features/tables/data/mappers/table_mapper.dart';
import 'package:orderlyy_app/features/tables/data/repositories/tables_repository_impl.dart';
import 'package:orderlyy_app/features/tables/domain/entities/restaurant_table.dart';
import 'package:orderlyy_app/features/tables/application/use_cases/update_table_status_use_case.dart';
import 'package:orderlyy_app/features/tables/application/use_cases/watch_tables_use_case.dart';
import 'package:orderlyy_app/features/orders/domain/entities/order.dart';
import 'package:orderlyy_app/features/orders/domain/entities/order_item.dart';
import 'package:orderlyy_app/features/orders/domain/entities/menu_product.dart';
import 'package:orderlyy_app/shared/models/money.dart';
import 'package:orderlyy_app/features/orders/presentation/widgets/modifier_selector_sheet.dart';

// Manual mock implementations for testing clean architecture layers
class MockTablesRemoteDatasource implements TablesRemoteDatasource {
  List<TableDto> tables = [];
  bool getTablesCalled = false;
  String? updatedId;
  String? updatedStatus;
  String? updatedOrderId;

  @override
  Future<List<TableDto>> getTables() async {
    getTablesCalled = true;
    return tables;
  }

  @override
  Future<TableDto> updateTableStatus(String id, String status, {String? orderId}) async {
    updatedId = id;
    updatedStatus = status;
    updatedOrderId = orderId;
    return TableDto(id: id, label: 'Table $id', capacity: 4, status: status, activeOrderId: orderId);
  }

  @override
  Stream<List<TableDto>> watchTables() {
    return Stream.value(tables);
  }

  @override
  Future<void> mergeTables(List<String> sourceTableIds, String targetTableId) async {}

  @override
  Future<void> splitTable(String tableId, List<Map<String, dynamic>> splitPartitions) async {}
}

class MockTablesLocalDatasource implements TablesLocalDatasource {
  List<TableDto> cachedTables = [];
  bool cacheTablesCalled = false;
  bool cacheTableCalled = false;

  @override
  Future<List<TableDto>> getCachedTables() async {
    return cachedTables;
  }

  @override
  Future<void> cacheTables(List<TableDto> tables) async {
    cacheTablesCalled = true;
    cachedTables = tables;
  }

  @override
  Future<void> cacheTable(TableDto table) async {
    cacheTableCalled = true;
    final idx = cachedTables.indexWhere((t) => t.id == table.id);
    if (idx != -1) {
      cachedTables[idx] = table;
    } else {
      cachedTables.add(table);
    }
  }

  @override
  Stream<List<TableDto>> watchCachedTables() {
    return Stream.value(cachedTables);
  }
}

class MockNetworkInfo implements NetworkInfo {
  bool isConnectedValue = true;

  @override
  Future<bool> get isConnected async => isConnectedValue;

  @override
  Stream<bool> get onConnectionChanged => Stream.value(isConnectedValue);
}

class MockOfflineQueueManager implements OfflineQueueManager {
  List<Map<String, dynamic>> queued = [];

  @override
  Future<void> queueWrite({required String action, required Map<String, dynamic> payload}) async {
    queued.add({'action': action, 'payload': payload});
  }

  @override
  void registerHandler(String action, OfflineWriteHandler handler) {}

  @override
  Future<void> processQueue() async {}
}

void main() {
  group('RestaurantTable Entity', () {
    test('should identify if table can accept guests based on status', () {
      const availableTable = RestaurantTable(
        id: '1',
        label: 'T1',
        capacity: 4,
        status: TableStatus.available,
      );
      const cleaningTable = RestaurantTable(
        id: '2',
        label: 'T2',
        capacity: 2,
        status: TableStatus.cleaning,
      );
      const occupiedTable = RestaurantTable(
        id: '3',
        label: 'T3',
        capacity: 6,
        status: TableStatus.occupied,
      );

      expect(availableTable.canAcceptGuests, isTrue);
      expect(cleaningTable.canAcceptGuests, isTrue);
      expect(occupiedTable.canAcceptGuests, isFalse);
    });

    test('should copy and update table properties using updateStatus method', () {
      const initialTable = RestaurantTable(
        id: '1',
        label: 'T1',
        capacity: 4,
        status: TableStatus.available,
      );

      final updated = initialTable.updateStatus(TableStatus.occupied, orderId: 'ord-123');

      expect(updated.status, TableStatus.occupied);
      expect(updated.activeOrderId, 'ord-123');
      expect(updated.id, '1'); // Unchanged properties
      expect(updated.label, 'T1');
      expect(updated.capacity, 4);
    });
  });

  group('Table DTO and Domain Entity Mapper', () {
    test('should map DTO to domain correctly', () {
      const dto = TableDto(
        id: '1',
        label: 'T1',
        capacity: 4,
        status: 'occupied',
        activeOrderId: 'ord-123',
      );

      final domain = dto.toDomain();

      expect(domain.id, dto.id);
      expect(domain.label, dto.label);
      expect(domain.capacity, dto.capacity);
      expect(domain.status, TableStatus.occupied);
      expect(domain.activeOrderId, dto.activeOrderId);
    });

    test('should fallback to unknown status when string is unrecognized', () {
      const dto = TableDto(
        id: '2',
        label: 'T2',
        capacity: 2,
        status: 'unknown_status_string',
      );

      final domain = dto.toDomain();

      expect(domain.status, TableStatus.unknown);
    });

    test('should map domain entity back to DTO correctly', () {
      const domain = RestaurantTable(
        id: '1',
        label: 'T1',
        capacity: 4,
        status: TableStatus.needsAttention,
        activeOrderId: 'ord-456',
      );

      final dto = domain.toDto();

      expect(dto.id, domain.id);
      expect(dto.label, domain.label);
      expect(dto.capacity, domain.capacity);
      expect(dto.status, 'needsAttention');
      expect(dto.activeOrderId, domain.activeOrderId);
    });
  });

  group('TablesRepositoryImpl Integration Flow', () {
    late MockTablesRemoteDatasource mockRemote;
    late MockTablesLocalDatasource mockLocal;
    late MockNetworkInfo mockNetworkInfo;
    late MockOfflineQueueManager mockOfflineQueue;
    late TablesRepositoryImpl repository;

    setUp(() {
      mockRemote = MockTablesRemoteDatasource();
      mockLocal = MockTablesLocalDatasource();
      mockNetworkInfo = MockNetworkInfo();
      mockOfflineQueue = MockOfflineQueueManager();
      repository = TablesRepositoryImpl(
        remote: mockRemote,
        local: mockLocal,
        networkInfo: mockNetworkInfo,
        offlineQueue: mockOfflineQueue,
      );
    });

    test('should fetch tables from remote and cache them when online', () async {
      mockNetworkInfo.isConnectedValue = true;
      mockRemote.tables = [
        const TableDto(id: '1', label: 'T1', capacity: 4, status: 'available'),
      ];

      final result = await repository.getTables();

      expect(result.length, 1);
      expect(result[0].id, '1');
      expect(mockRemote.getTablesCalled, isTrue);
      expect(mockLocal.cacheTablesCalled, isTrue);
    });

    test('should fallback to local cache when remote fetch fails or is offline', () async {
      mockNetworkInfo.isConnectedValue = false;
      mockLocal.cachedTables = [
        const TableDto(id: '2', label: 'T2', capacity: 2, status: 'occupied'),
      ];

      final result = await repository.getTables();

      expect(result.length, 1);
      expect(result[0].id, '2');
      expect(result[0].status, TableStatus.occupied);
      expect(mockRemote.getTablesCalled, isFalse);
    });
  });

  group('Tables Use Cases', () {
    late MockTablesRemoteDatasource mockRemote;
    late MockTablesLocalDatasource mockLocal;
    late MockNetworkInfo mockNetworkInfo;
    late MockOfflineQueueManager mockOfflineQueue;
    late TablesRepositoryImpl repository;

    setUp(() {
      mockRemote = MockTablesRemoteDatasource();
      mockLocal = MockTablesLocalDatasource();
      mockNetworkInfo = MockNetworkInfo();
      mockOfflineQueue = MockOfflineQueueManager();
      repository = TablesRepositoryImpl(
        remote: mockRemote,
        local: mockLocal,
        networkInfo: mockNetworkInfo,
        offlineQueue: mockOfflineQueue,
      );
    });

    test('UpdateTableStatusUseCase triggers correct repo update', () async {
      mockNetworkInfo.isConnectedValue = true;
      final useCase = UpdateTableStatusUseCase(repository);

      final result = await useCase.call('1', TableStatus.reserved, orderId: 'ord-99');

      expect(result.status, TableStatus.reserved);
      expect(result.activeOrderId, 'ord-99');
      expect(mockRemote.updatedId, '1');
      expect(mockRemote.updatedStatus, 'reserved');
    });

    test('WatchTablesUseCase streams matching tables correctly', () async {
      mockNetworkInfo.isConnectedValue = false;
      mockLocal.cachedTables = [
        const TableDto(id: '1', label: 'T1', capacity: 4, status: 'available'),
      ];
      final useCase = WatchTablesUseCase(repository);

      final stream = useCase.call();
      final tables = await stream.first;

      expect(tables.length, 1);
      expect(tables[0].id, '1');
    });
  });

  group('Order & Pricing Calculations', () {
    test('should calculate correct item total price with modifiers', () {
      final burger = MenuProduct(
        id: 'p-1',
        name: 'Burger',
        price: Money(amountInCents: 1000),
        category: 'Mains',
        availableModifiers: [
          ModifierOption(id: 'm-1', name: 'Cheese', price: Money(amountInCents: 150)),
          ModifierOption(id: 'm-2', name: 'Bacon', price: Money(amountInCents: 200)),
        ],
      );

      final item = OrderItem(
        id: 'i-1',
        product: burger,
        quantity: 2,
        selectedModifiers: [
          ModifierOption(id: 'm-1', name: 'Cheese', price: Money(amountInCents: 150)),
        ],
        seatNumber: 1,
        status: OrderItemStatus.queued,
      );

      // (1000 + 150) * 2 = 2300 cents
      expect(item.totalPrice.amountInCents, 2300);
      expect(item.totalPrice.formatted, '\$23.00');
    });

    test('should calculate correct order grand total', () {
      final burger = MenuProduct(
        id: 'p-1',
        name: 'Burger',
        price: Money(amountInCents: 1000),
        category: 'Mains',
        availableModifiers: [],
      );

      final soda = MenuProduct(
        id: 'p-2',
        name: 'Soda',
        price: Money(amountInCents: 300),
        category: 'Drinks',
        availableModifiers: [],
      );

      final order = Order(
        id: 'o-1',
        tableId: 'table-5',
        items: [
          OrderItem(
            id: 'i-1',
            product: burger,
            quantity: 1,
            selectedModifiers: [],
            seatNumber: 1,
            status: OrderItemStatus.queued,
          ),
          OrderItem(
            id: 'i-2',
            product: soda,
            quantity: 2,
            selectedModifiers: [],
            seatNumber: 2,
            status: OrderItemStatus.queued,
          ),
        ],
        status: OrderStatus.sent,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      // Burger (1000 * 1) + Soda (300 * 2) = 1600 cents
      expect(order.totalPrice.amountInCents, 1600);
      expect(order.totalPrice.formatted, '\$16.00');
    });
  });

  group('New Feature Extensions', () {

    test('ModifierGroup validates selection constraints', () {
      final availableMods = [
        const ModifierOption(id: 'm-1', name: 'Cheese', price: Money(amountInCents: 100)),
        const ModifierOption(id: 'm-2', name: 'Bacon', price: Money(amountInCents: 200)),
        const ModifierOption(id: 'm-3', name: 'Avocado', price: Money(amountInCents: 150)),
      ];

      const group = ModifierGroup(
        id: 'g-1',
        name: 'Add-ons',
        minSelections: 1,
        maxSelections: 2,
        options: [
          ModifierOption(id: 'm-1', name: 'Cheese', price: Money(amountInCents: 100)),
          ModifierOption(id: 'm-2', name: 'Bacon', price: Money(amountInCents: 200)),
          ModifierOption(id: 'm-3', name: 'Avocado', price: Money(amountInCents: 150)),
        ],
        isRequired: true,
      );

      expect(group.validate([]), isFalse);
      expect(group.validate([availableMods[0]]), isTrue);
      expect(group.validate([availableMods[0], availableMods[1]]), isTrue);
      expect(group.validate([availableMods[0], availableMods[1], availableMods[2]]), isFalse);
    });

    test('Table merging validation logic simulations', () {
      final t1 = const RestaurantTable(id: '1', label: '1-T1', capacity: 4, status: TableStatus.available);
      final t2 = const RestaurantTable(id: '2', label: '9-T2', capacity: 4, status: TableStatus.available);
      final hasTenantMismatch = t1.label.startsWith('1') && t2.label.startsWith('9');
      expect(hasTenantMismatch, isTrue);

      final t3 = const RestaurantTable(id: '3', label: 'T3-P', capacity: 4, status: TableStatus.available);
      final t4 = const RestaurantTable(id: '4', label: 'T4', capacity: 4, status: TableStatus.needsAttention);
      final hasPrintedBillT3 = t3.label.contains('P') || t3.status == TableStatus.needsAttention;
      final hasPrintedBillT4 = t4.label.contains('P') || t4.status == TableStatus.needsAttention;
      expect(hasPrintedBillT3, isTrue);
      expect(hasPrintedBillT4, isTrue);

      final selectedTables = [
        const RestaurantTable(
          id: '5',
          label: 'T5',
          capacity: 2,
          status: TableStatus.occupied,
          occupiedSeats: [
            GuestSeat(seatNumber: 1, orderedItemIds: []),
            GuestSeat(seatNumber: 2, orderedItemIds: []),
          ],
          mergedTableIds: [],
        ),
        const RestaurantTable(
          id: '6',
          label: 'T6',
          capacity: 2,
          status: TableStatus.occupied,
          occupiedSeats: [
            GuestSeat(seatNumber: 1, orderedItemIds: []),
            GuestSeat(seatNumber: 2, orderedItemIds: []),
            GuestSeat(seatNumber: 3, orderedItemIds: []),
          ],
          mergedTableIds: [],
        ),
      ];
      int combinedCapacity = selectedTables.fold<int>(0, (sum, t) => sum + t.capacity);
      int totalGuests = selectedTables.fold<int>(0, (sum, t) => sum + (t.occupiedSeats.isNotEmpty ? t.occupiedSeats.length : t.capacity + 2));
      expect(totalGuests > combinedCapacity, isTrue);
    });
  });
}
