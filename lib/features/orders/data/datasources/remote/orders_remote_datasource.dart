// lib/features/orders/data/datasources/remote/orders_remote_datasource.dart
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../../../../../core/network/dio_client.dart';
import '../../../../../../core/network/secure_storage.dart';
import '../../dtos/order_dto.dart';

abstract class OrdersRemoteDatasource {
  Future<List<OrderDto>> fetchActiveOrders(String branchId);
  Future<OrderDto?> getOrderById(String orderId);
  Future<OrderDto> checkoutCart(Map<String, dynamic> envelope);
  Future<OrderDto> transitionStatus(String orderId, Map<String, dynamic> envelope);
}

class OrdersRemoteDatasourceImpl implements OrdersRemoteDatasource {
  final DioClient _dioClient;

  OrdersRemoteDatasourceImpl(this._dioClient);

  Future<Options> _getAuthOptions() async {
    const secureStorage = SecureLocalStorage();
    final token = await secureStorage.read('runtime_token');
    return Options(
      headers: {
        'Authorization': 'Bearer $token',
      },
    );
  }

  @override
  Future<List<OrderDto>> fetchActiveOrders(String branchId) async {
    try {
      final options = await _getAuthOptions();
      final response = await _dioClient.get(
        '/api/v1/orders',
        queryParameters: {
          'branchId': branchId,
        },
        options: options,
      );

      if (response.statusCode == 200) {
        final list = response.data['data']['orders'] as List;
        return list.map((json) => OrderDto.fromJson(json as Map<String, dynamic>)).toList();
      }
    } catch (e) {
      debugPrint('[OrdersRemoteDatasource] Failed to fetch active orders: $e');
      rethrow;
    }
    throw Exception('Failed to fetch active orders');
  }

  @override
  Future<OrderDto?> getOrderById(String orderId) async {
    try {
      final options = await _getAuthOptions();
      final response = await _dioClient.get(
        '/api/v1/orders/$orderId',
        options: options,
      );

      if (response.statusCode == 200) {
        final data = response.data['data']['order'];
        if (data != null) {
          return OrderDto.fromJson(data as Map<String, dynamic>);
        }
      }
    } catch (e) {
      debugPrint('[OrdersRemoteDatasource] Failed to get order by ID: $e');
      rethrow;
    }
    return null;
  }

  @override
  Future<OrderDto> checkoutCart(Map<String, dynamic> envelope) async {
    try {
      final options = await _getAuthOptions();
      final response = await _dioClient.post(
        '/api/v1/orders/checkout',
        data: envelope,
        options: options,
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final data = response.data['data']['order'];
        return OrderDto.fromJson(data as Map<String, dynamic>);
      }
    } catch (e) {
      debugPrint('[OrdersRemoteDatasource] Failed to checkout cart: $e');
      rethrow;
    }
    throw Exception('Failed to checkout cart');
  }

  @override
  Future<OrderDto> transitionStatus(String orderId, Map<String, dynamic> envelope) async {
    try {
      final options = await _getAuthOptions();
      final response = await _dioClient.patch(
        '/api/v1/orders/$orderId/status',
        data: envelope,
        options: options,
      );

      if (response.statusCode == 200) {
        final data = response.data['data']['order'];
        return OrderDto.fromJson(data as Map<String, dynamic>);
      }
    } catch (e) {
      debugPrint('[OrdersRemoteDatasource] Failed to transition order status: $e');
      rethrow;
    }
    throw Exception('Failed to transition order status');
  }
}
