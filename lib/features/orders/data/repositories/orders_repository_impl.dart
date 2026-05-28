// lib/features/orders/data/repositories/orders_repository_impl.dart
import 'dart:async';
import '../../domain/entities/order.dart';
import '../../domain/repositories/orders_repository.dart';
import '../datasources/local/orders_local_datasource.dart';
import '../mappers/order_mapper.dart';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../core/network/offline_queue.dart';
import '../../../../core/runtime/runtime.dart';
import '../../../auth/presentation/state/auth_notifier.dart';
import '../datasources/remote/orders_remote_datasource.dart';
import '../dtos/order_dto.dart';

class OrdersRepositoryImpl implements OrdersRepository {
  final OrdersLocalDatasource local;
  final OrdersRemoteDatasource remote;
  final OfflineQueueManager offlineQueue;
  final ProviderRef ref;

  OrdersRepositoryImpl({
    required this.local,
    required this.remote,
    required this.offlineQueue,
    required this.ref,
  }) {
    // Register the offline write handlers
    offlineQueue.registerHandler('orders_checkout', (payload) async {
      await remote.checkoutCart(payload);
    });

    offlineQueue.registerHandler('orders_status_change', (payload) async {
      final orderId = payload['orderId'] as String;
      final envelope = Map<String, dynamic>.from(payload['envelope']);
      await remote.transitionStatus(orderId, envelope);
    });
  }

  Future<Map<String, String>> _resolveModifierGroup(String optionId) async {
    try {
      final response = await Supabase.instance.client
          .from('modifier_options')
          .select('modifier_group_id, modifier_groups(name)')
          .eq('id', optionId)
          .maybeSingle();
      if (response != null) {
        final groupId = response['modifier_group_id'] as String;
        final groupData = response['modifier_groups'] as Map<String, dynamic>?;
        final groupName = groupData?['name'] as String? ?? 'Modifiers';
        return {'groupId': groupId, 'groupName': groupName};
      }
    } catch (e) {
      debugPrint('[OrdersRepositoryImpl] Resolve modifier group failed: $e');
    }
    return {'groupId': '00000000-0000-0000-0000-000000000000', 'groupName': 'Modifiers'};
  }

  Future<Map<String, dynamic>> _buildMutationEnvelope(
    Map<String, dynamic> payload, {
    String? expectedCartRevision,
  }) async {
    final authState = ref.read(authNotifierProvider);
    final branchId = authState.selectedBranch?.id ?? '00000000-0000-0000-0000-000000000000';
    final tenantId = authState.selectedOrg?.id ?? '00000000-0000-0000-0000-000000000000';
    
    final orchestrator = ref.read(runtimeOrchestratorProvider);
    final expectedSeq = orchestrator.sequenceValidator.expectedSequenceFor(branchId);
    
    final mutationId = const Uuid().v4();
    final idempotencyKey = const Uuid().v4();
    
    return {
      'mutation_id': mutationId,
      'mutation_sequence': expectedSeq,
      'runtime_version': 1,
      'tenant_id': tenantId,
      'branch_id': branchId,
      'client_timestamp': DateTime.now().toUtc().toIso8601String(),
      'idempotency_key': idempotencyKey,
      if (expectedCartRevision != null)
        'expected_cart_revision': int.tryParse(expectedCartRevision) ?? 0,
      'payload': payload,
    };
  }

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
    final currentCached = await local.getCachedOrderById(order.id);
    final dto = order.toDto();
    await local.cacheOrder(dto);
    
    final authState = ref.read(authNotifierProvider);
    final branchId = authState.selectedBranch?.id;
    final tenantId = authState.selectedOrg?.id;
    final networkInfo = ref.read(networkInfoProvider);
    final isConnected = await networkInfo.isConnected;

    // Determine if this is a checkout flow (transitioning from local-only draft status to sent/pending status)
    if (currentCached == null || currentCached.status == 'draft') {
      if (order.status == OrderStatus.sent) {
        final cartId = const Uuid().v4();
        final sessionId = const Uuid().v4();
        
        if (isConnected && branchId != null && tenantId != null) {
          try {
            await Supabase.instance.client.from('carts').insert({
              'id': cartId,
              'tenant_id': tenantId,
              'branch_id': branchId,
              'table_id': order.tableId,
              'session_id': sessionId,
              'status': 'open',
            });
            
            for (int i = 0; i < order.items.length; i++) {
              final item = order.items[i];
              await Supabase.instance.client.from('cart_items').insert({
                'id': item.id,
                'tenant_id': tenantId,
                'cart_id': cartId,
                'menu_item_id': item.product.id,
                'item_name_snapshot': item.product.name,
                'item_sku_snapshot': null,
                'unit_price_minor_snapshot': item.product.price.amountInCents,
                'quantity': item.quantity,
                'item_notes': null,
                'display_order': i,
              });
              
              if (item.selectedModifiers.isNotEmpty) {
                final modifiersPayload = <Map<String, dynamic>>[];
                for (final opt in item.selectedModifiers) {
                  final groupInfo = await _resolveModifierGroup(opt.id);
                  modifiersPayload.add({
                    'tenant_id': tenantId,
                    'cart_item_id': item.id,
                    'modifier_group_id': groupInfo['groupId'],
                    'modifier_option_id': opt.id,
                    'modifier_group_name_snapshot': groupInfo['groupName'],
                    'modifier_option_name_snapshot': opt.name,
                    'price_delta_minor_snapshot': opt.price.amountInCents,
                  });
                }
                await Supabase.instance.client.from('cart_item_modifiers').insert(modifiersPayload);
              }
            }
            
            final envelope = await _buildMutationEnvelope({
              'cartId': cartId,
              'tableId': order.tableId,
              'orderNotes': '',
            });
            
            final responseDto = await remote.checkoutCart(envelope);
            await local.cacheOrder(responseDto);
            return responseDto.toDomain();
          } catch (e) {
            debugPrint('[OrdersRepositoryImpl] Checkout Cart failed online, queueing offline: $e');
            final envelope = await _buildMutationEnvelope({
              'cartId': cartId,
              'tableId': order.tableId,
              'orderNotes': '',
            });
            await offlineQueue.queueWrite(action: 'orders_checkout', payload: envelope);
          }
        } else {
          final envelope = await _buildMutationEnvelope({
            'cartId': cartId,
            'tableId': order.tableId,
            'orderNotes': '',
          });
          await offlineQueue.queueWrite(action: 'orders_checkout', payload: envelope);
        }
      }
    } else {
      if (currentCached.status != order.status.name) {
        String targetStatus = 'pending';
        if (order.status == OrderStatus.preparing) targetStatus = 'preparing';
        else if (order.status == OrderStatus.ready) targetStatus = 'ready';
        else if (order.status == OrderStatus.completed) targetStatus = 'completed';
        else if (order.status == OrderStatus.cancelled) targetStatus = 'cancelled';
        
        if (isConnected) {
          try {
            final response = await Supabase.instance.client
                .from('orders')
                .select('version_num')
                .eq('id', order.id)
                .maybeSingle();
            final versionNum = response?['version_num'] as int? ?? 1;
            
            final envelope = await _buildMutationEnvelope({
              'targetStatus': targetStatus,
              'versionNum': versionNum,
              'reason': 'Status transition from Staff App',
            });
            
            final responseDto = await remote.transitionStatus(order.id, envelope);
            await local.cacheOrder(responseDto);
            return responseDto.toDomain();
          } catch (e) {
            debugPrint('[OrdersRepositoryImpl] Status transition failed online, queueing offline: $e');
            final envelope = await _buildMutationEnvelope({
              'targetStatus': targetStatus,
              'versionNum': 1,
              'reason': 'Status transition from Staff App',
            });
            await offlineQueue.queueWrite(action: 'orders_status_change', payload: {
              'orderId': order.id,
              'envelope': envelope,
            });
          }
        } else {
          final envelope = await _buildMutationEnvelope({
            'targetStatus': targetStatus,
            'versionNum': 1,
            'reason': 'Status transition from Staff App',
          });
          await offlineQueue.queueWrite(action: 'orders_status_change', payload: {
            'orderId': order.id,
            'envelope': envelope,
          });
        }
      }
    }
    
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
    final authState = ref.read(authNotifierProvider);
    final branchId = authState.selectedBranch?.id;
    if (branchId == null) return [];
    
    final networkInfo = ref.read(networkInfoProvider);
    if (await networkInfo.isConnected) {
      try {
        final remoteItems = await remote.fetchActiveOrders(branchId);
        await local.cacheOrders(remoteItems);
        return remoteItems.map((e) => e.toDomain()).toList();
      } catch (_) {
        // Fallback to cache on error
      }
    }
    final cached = await local.getCachedOrders();
    return cached
        .map((dto) => dto.toDomain())
        .where((o) => o.status != OrderStatus.completed && o.status != OrderStatus.cancelled)
        .toList();
  }
}
