// lib/features/waiter_calls/data/datasources/remote/waiter_calls_remote_datasource.dart
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../../../../../core/network/dio_client.dart';
import '../../../../../../core/network/secure_storage.dart';

abstract class WaiterCallsRemoteDatasource {
  Future<List<Map<String, dynamic>>> fetchActiveCalls(String branchId);
  Future<Map<String, dynamic>> transitionStatus(String callId, Map<String, dynamic> body);
}

class WaiterCallsRemoteDatasourceImpl implements WaiterCallsRemoteDatasource {
  final DioClient _dioClient;

  WaiterCallsRemoteDatasourceImpl(this._dioClient);

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
  Future<List<Map<String, dynamic>>> fetchActiveCalls(String branchId) async {
    try {
      final options = await _getAuthOptions();
      final response = await _dioClient.get(
        '/api/v1/admin/waiter-calls',
        queryParameters: {
          'branch_id': branchId,
        },
        options: options,
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        final list = response.data['data'] as List;
        return list.map((json) => json as Map<String, dynamic>).toList();
      }
    } catch (e) {
      debugPrint('[WaiterCallsRemoteDatasource] Failed to fetch active calls: $e');
      rethrow;
    }
    throw Exception('Failed to fetch active waiter calls');
  }

  @override
  Future<Map<String, dynamic>> transitionStatus(String callId, Map<String, dynamic> body) async {
    try {
      final options = await _getAuthOptions();
      final response = await _dioClient.patch(
        '/api/v1/admin/waiter-calls/$callId/status',
        data: body,
        options: options,
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        return response.data['data'] as Map<String, dynamic>;
      }
    } catch (e) {
      debugPrint('[WaiterCallsRemoteDatasource] Failed to transition call status: $e');
      rethrow;
    }
    throw Exception('Failed to transition waiter call status');
  }
}
