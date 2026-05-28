// lib/features/auth/domain/repositories/auth_repository.dart
import 'package:supabase_flutter/supabase_flutter.dart';
import '../entities/organization.dart';
import '../entities/branch.dart';
import '../entities/staff_member.dart';

class AuthRepository {
  final SupabaseClient _supabase;

  AuthRepository(this._supabase);

  Future<List<Organization>> getOrganizations() async {
    try {
      final response = await _supabase.from('tenants').select('id, name');
      return (response as List).map((json) {
        return Organization(
          id: json['id'] as String,
          name: json['name'] as String,
        );
      }).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<Branch>> getBranchesForOrganization(String orgId) async {
    try {
      final response = await _supabase
          .from('branches')
          .select()
          .eq('tenant_id', orgId);
      return (response as List).map((json) {
        return Branch(
          id: json['id'] as String,
          name: json['name'] as String,
          status: json['status'] == 'active' ? BranchStatus.open : BranchStatus.busy,
          syncPercentage: '100%',
          activeStaff: 0,
        );
      }).toList();
    } catch (e) {
      return [];
    }
  }

  Future<StaffMember?> loginWithPIN(String pin, {String? branchId}) async {
    try {
      var query = _supabase.from('staff').select();
      if (branchId != null) {
        query = query.eq('branch_id', branchId);
      }
      final response = await query.eq('pin', pin);
      if (response == null || response.isEmpty) return null;

      final row = response.first;
      return StaffMember(
        id: row['id'] as String,
        name: row['name'] as String,
        pin: row['pin'] as String? ?? '',
        role: _mapRole(row['role'] as String?),
        section: row['section'] as String?,
      );
    } catch (e) {
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
