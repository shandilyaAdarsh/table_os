import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../entities/organization.dart';
import '../entities/branch.dart';
import '../entities/staff_member.dart';
import '../../../../core/network/dio_client.dart';

class AuthRepository {
  final SupabaseClient _supabase;
  final DioClient _dio;

  AuthRepository(this._supabase, this._dio);

  Future<List<Organization>> getOrganizations() async {
    try {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final response = await _dio.get(
        '/api/v1/public/organizations?t=$timestamp',
        options: Options(extra: {'skip_cache': true}),
      );
      final data = response.data['data'] as List;
      
      return data.map((json) {
        return Organization(
          id: json['id'] as String,
          name: json['name'] as String,
        );
      }).toList();
    } catch (e, stack) {
      debugPrint('[AuthRepository] getOrganizations Error: $e');
      debugPrint('[AuthRepository] Stack: $stack');
      return [];
    }
  }

  Future<List<Branch>> getBranchesForOrganization(String orgId) async {
    try {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final response = await _dio.get(
        '/api/v1/public/organizations/$orgId/branches?t=$timestamp',
        options: Options(extra: {'skip_cache': true}),
      );
      final data = response.data['data'] as List;

      return data.map((json) {
        return Branch(
          id: json['id'] as String,
          name: json['name'] as String,
          status: json['status'] == 'active' ? BranchStatus.open : BranchStatus.busy,
          syncPercentage: '100%',
          activeStaff: 0,
        );
      }).toList();
    } catch (e, stack) {
      debugPrint('[AuthRepository] getBranches Error: $e');
      debugPrint('[AuthRepository] Stack: $stack');
      return [];
    }
  }

  Future<StaffMember?> login(String employeeId, String pin, {String? branchId, String? orgId}) async {
    try {
      if (branchId == null || orgId == null) {
        // Fallback for safety, though we shouldn't hit this in typical flow
        debugPrint('[AuthRepository] branchId and orgId are required for PIN login');
        return null;
      }
      
      final response = await _dio.get(
        '/api/v1/public/organizations/$orgId/branches/$branchId/staff',
        options: Options(extra: {'skip_cache': true}),
      );
      final staffList = response.data['data'] as List<dynamic>;
      
      final row = staffList.firstWhere(
        (staff) => staff['pin'] == pin && staff['employee_id'] == employeeId,
        orElse: () => null,
      );

      if (row == null) return null;

      return StaffMember(
        id: row['id'] as String,
        name: row['name'] as String,
        pin: row['pin'] as String? ?? '',
        role: _mapRole(row['role'] as String?),
        section: row['section'] as String?,
      );
    } catch (e) {
      debugPrint('[AuthRepository] loginWithPIN error: $e');
      return null;
    }
  }

  StaffRole _mapRole(String? role) {
    if (role == null) return StaffRole.waiter;
    switch (role.toLowerCase()) {
      case 'owner':
      case 'manager':
        return StaffRole.manager;
      case 'kitchen':
      case 'kds':
      case 'kdsoperator':
        return StaffRole.kdsOperator;
      case 'runner':
        return StaffRole.runner;
      case 'host':
        return StaffRole.host;
      case 'waiter':
      case 'server':
      default:
        return StaffRole.waiter;
    }
  }
}
