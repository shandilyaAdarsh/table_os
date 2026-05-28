// test/menu_snapshot_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';
import 'package:dio/dio.dart';
import 'package:talker_flutter/talker_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:orderlyy_app/core/network/dio_client.dart';
import 'package:orderlyy_app/core/network/network_info.dart';
import 'package:orderlyy_app/core/network/network_providers.dart';
import 'package:orderlyy_app/core/network/sync_state.dart';
import 'package:orderlyy_app/bootstrap/bootstrap.dart';

import 'package:orderlyy_app/features/menu/data/repositories/menu_repository_impl.dart';
import 'package:orderlyy_app/features/menu/presentation/state/menu_providers.dart';
import 'package:orderlyy_app/features/orders/providers/orders_providers.dart';

// Mocks for testing snapshot integration
class MockDioClient implements DioClient {
  int getCallCount = 0;
  String? lastPath;
  Map<String, dynamic>? lastQueryParams;
  Options? lastOptions;
  
  Response? mockResponse;
  Object? mockError;

  @override
  Dio get dio => throw UnimplementedError();

  @override
  Future<Response> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    getCallCount++;
    lastPath = path;
    lastQueryParams = queryParameters;
    lastOptions = options;
    
    if (mockError != null) {
      throw mockError!;
    }
    return mockResponse!;
  }

  @override
  Future<Response> post(String path, {data, Map<String, dynamic>? queryParameters, Options? options, CancelToken? cancelToken}) {
    throw UnimplementedError();
  }

  @override
  Future<Response> put(String path, {data, Map<String, dynamic>? queryParameters, Options? options, CancelToken? cancelToken}) {
    throw UnimplementedError();
  }

  @override
  Future<Response> patch(String path, {data, Map<String, dynamic>? queryParameters, Options? options, CancelToken? cancelToken}) {
    throw UnimplementedError();
  }

  @override
  Future<Response> delete(String path, {data, Map<String, dynamic>? queryParameters, Options? options, CancelToken? cancelToken}) {
    throw UnimplementedError();
  }
}

class MockHiveBox implements Box<String> {
  final Map<String, String> _storage = {};

  @override
  String? get(key, {String? defaultValue}) => _storage[key.toString()] ?? defaultValue;

  @override
  Future<void> put(key, String value) async {
    _storage[key.toString()] = value;
  }

  @override
  Future<void> delete(key) async {
    _storage.remove(key.toString());
  }

  @override
  bool containsKey(key) => _storage.containsKey(key.toString());

  @override
  Iterable<String> get keys => _storage.keys;

  @override
  Iterable<String> get values => _storage.values;

  @override
  int get length => _storage.length;

  @override
  bool get isEmpty => _storage.isEmpty;

  @override
  bool get isNotEmpty => _storage.isNotEmpty;

  @override
  Future<int> add(String value) => throw UnimplementedError();

  @override
  Future<Iterable<int>> addAll(Iterable<String> values) => throw UnimplementedError();

  @override
  Future<int> clear() async {
    final count = _storage.length;
    _storage.clear();
    return count;
  }

  @override
  Future<void> close() async {}

  @override
  Future<void> compact() async {}

  @override
  Future<void> deleteAll(Iterable keys) async {
    for (final key in keys) {
      _storage.remove(key.toString());
    }
  }

  @override
  Future<void> deleteAt(int index) => throw UnimplementedError();

  @override
  Future<void> flush() async {}

  @override
  String? getAt(int index) => throw UnimplementedError();

  @override
  bool get isOpen => true;

  @override
  String? get path => null;

  @override
  Future<void> putAll(Map<dynamic, String> entries) async {
    entries.forEach((key, value) {
      _storage[key.toString()] = value;
    });
  }

  @override
  Future<void> putAt(int index, String value) => throw UnimplementedError();

  @override
  Stream<BoxEvent> watch({key}) => throw UnimplementedError();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class MockNetworkInfo implements NetworkInfo {
  bool isConnectedValue = true;

  @override
  Future<bool> get isConnected async => isConnectedValue;

  @override
  Stream<bool> get onConnectionChanged => Stream.value(isConnectedValue);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final mockMenuPayload = {
    'categories': [
      {'id': 'cat_1', 'name': 'Burgers', 'sort_order': 1}
    ],
    'items': [
      {
        'id': 'prod_burger',
        'category_id': 'cat_1',
        'name': 'Classic Burger',
        'description': 'A delicious burger',
        'price_in_cents': 1000,
        'is_available': true,
        'modifier_group_ids': ['grp_1']
      }
    ],
    'modifier_groups': [
      {
        'id': 'grp_1',
        'name': 'Add-ons',
        'options': [
          {'id': 'opt_1', 'name': 'Cheese', 'price_in_cents': 100}
        ]
      }
    ],
    'tax_configs': {'vat_rate': 0.10, 'service_charge_rate': 0.05}
  };

  group('MenuRepositoryImpl Snapshot Integration Tests', () {
    late MockDioClient mockDio;
    late MockHiveBox mockBox;
    late MockNetworkInfo mockNetwork;
    late Talker talker;
    late MenuRepositoryImpl repository;

    setUp(() {
      mockDio = MockDioClient();
      mockBox = MockHiveBox();
      mockNetwork = MockNetworkInfo();
      talker = Talker();
      repository = MenuRepositoryImpl(
        dioClient: mockDio,
        apiCacheBox: mockBox,
        networkInfo: mockNetwork,
        talker: talker,
      );
    });

    test('getMenuSnapshot successful 200 OK saves to cache and reads ETag', () async {
      mockDio.mockResponse = Response(
        requestOptions: RequestOptions(path: '/snapshot/menu'),
        statusCode: 200,
        data: mockMenuPayload,
        headers: Headers.fromMap({'ETag': ['"etag123"']}),
      );

      final snapshot = await repository.getMenuSnapshot(branchId: 'br_1');

      expect(snapshot.categories.length, 1);
      expect(snapshot.categories[0].name, 'Burgers');
      expect(snapshot.items[0].name, 'Classic Burger');
      expect(snapshot.modifierGroups[0].options[0].name, 'Cheese');
      expect(snapshot.taxConfig.vatRate, 0.10);

      // Verify cached values
      expect(mockBox.get('menu_etag_br_1'), '"etag123"');
      expect(mockBox.get('menu_snapshot_br_1'), contains('Classic Burger'));
    });

    test('getMenuSnapshot sends If-None-Match header and handles 304 Not Modified', () async {
      // Pre-seed cache
      await mockBox.put('menu_etag_br_1', '"etag123"');
      await mockBox.put('menu_snapshot_br_1', '{"categories":[{"id":"cat_1","name":"Burgers"}],"items":[],"modifier_groups":[],"tax_configs":{"vat_rate":0.1}}');

      mockDio.mockResponse = Response(
        requestOptions: RequestOptions(path: '/snapshot/menu'),
        statusCode: 304,
      );

      final snapshot = await repository.getMenuSnapshot(branchId: 'br_1');

      expect(mockDio.lastOptions?.headers?['If-None-Match'], '"etag123"');
      expect(snapshot.categories[0].name, 'Burgers');
      expect(snapshot.items, isEmpty);
    });

    test('getMenuSnapshot falls back to local cache when offline', () async {
      mockNetwork.isConnectedValue = false;
      // Pre-seed cache
      await mockBox.put('menu_snapshot_br_1', '{"categories":[{"id":"cat_1","name":"CachedBurgers"}],"items":[],"modifier_groups":[],"tax_configs":{"vat_rate":0.1}}');

      final snapshot = await repository.getMenuSnapshot(branchId: 'br_1');

      expect(mockDio.getCallCount, 0); // No network calls made
      expect(snapshot.categories[0].name, 'CachedBurgers');
    });

    test('getItemAvailability calls GET availability and maps status correctly', () async {
      mockDio.mockResponse = Response(
        requestOptions: RequestOptions(path: '/availability'),
        statusCode: 200,
        data: {'prod_burger': false},
      );

      final availability = await repository.getItemAvailability(branchId: 'br_1');
      expect(availability['prod_burger'], isFalse);
    });
  });

  group('Menu Snapshot State Management & Riverpod Integration', () {
    late ProviderContainer container;
    late MockDioClient mockDio;
    late MockHiveBox mockBox;
    late MockNetworkInfo mockNetwork;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();

      mockDio = MockDioClient();
      mockBox = MockHiveBox();
      mockNetwork = MockNetworkInfo();

      container = ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          dioClientProvider.overrideWithValue(mockDio),
          apiCacheBoxProvider.overrideWithValue(mockBox),
          networkInfoProvider.overrideWithValue(mockNetwork),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('MenuSnapshotNotifier loads menu snapshot on startup and maps legacy MenuProducts', () async {
      mockDio.mockResponse = Response(
        requestOptions: RequestOptions(path: '/snapshot/menu'),
        statusCode: 200,
        data: mockMenuPayload,
      );

      // Trigger load
      final notifier = container.read(menuSnapshotNotifierProvider.notifier);
      await notifier.loadMenu();

      // Read current state
      final menuState = container.read(menuSnapshotNotifierProvider);
      expect(menuState.value, isNotNull);
      expect(menuState.value!.items[0].name, 'Classic Burger');

      // Check legacy products mapping
      final products = container.read(menuProductsProvider);
      expect(products.length, 1);
      expect(products[0].name, 'Classic Burger');
      expect(products[0].category, 'Burgers');
      expect(products[0].availableModifiers[0].name, 'Cheese');
    });

    test('MenuSnapshotNotifier updateAvailability modifies item availability in-memory', () async {
      mockDio.mockResponse = Response(
        requestOptions: RequestOptions(path: '/snapshot/menu'),
        statusCode: 200,
        data: mockMenuPayload,
      );

      final notifier = container.read(menuSnapshotNotifierProvider.notifier);
      await notifier.loadMenu();

      // Verify initially available
      var menuState = container.read(menuSnapshotNotifierProvider).value!;
      expect(menuState.items[0].isAvailable, isTrue);

      // Perform overlay update
      notifier.updateAvailability({'prod_burger': false});

      menuState = container.read(menuSnapshotNotifierProvider).value!;
      expect(menuState.items[0].isAvailable, isFalse);
    });

    test('menuStalenessProvider returns SyncState.degraded when loaded offline', () async {
      mockNetwork.isConnectedValue = false;
      await mockBox.put('menu_snapshot_mock_branch', '{"categories":[],"items":[],"modifier_groups":[],"tax_configs":{"vat_rate":0.1}}');

      final notifier = container.read(menuSnapshotNotifierProvider.notifier);
      await notifier.loadMenu();

      final syncState = container.read(menuStalenessProvider);
      expect(syncState, SyncState.degraded);
    });
  });
}
