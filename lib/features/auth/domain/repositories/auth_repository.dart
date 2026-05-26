// lib/features/auth/domain/repositories/auth_repository.dart
import '../entities/organization.dart';
import '../entities/branch.dart';
import '../entities/staff_member.dart';

class AuthRepository {
  // Simulated backend database
  static const List<Organization> _dbOrganizations = [
    Organization(id: 'org-1', name: "McDonald's Central Region"),
    Organization(id: 'org-2', name: "McDonald's APMEA Region"),
    Organization(id: 'org-3', name: 'McCafe Sandbox'),
  ];

  static const Map<String, List<Branch>> _dbBranches = {
    'org-1': [
      Branch(id: 'br-1', name: 'Central Terminal Branch', status: BranchStatus.open, syncPercentage: '100%', activeStaff: 24),
      Branch(id: 'br-2', name: 'Westside Mall Express', status: BranchStatus.busy, syncPercentage: '96%', activeStaff: 12),
      Branch(id: 'br-3', name: 'Downtown Bistro', status: BranchStatus.outage, syncPercentage: '0%', activeStaff: 0),
    ],
    'org-2': [
      Branch(id: 'br-4', name: 'Singapore Changi Terminal 3', status: BranchStatus.open, syncPercentage: '100%', activeStaff: 32),
      Branch(id: 'br-5', name: 'Tokyo Shibuya Crossing', status: BranchStatus.busy, syncPercentage: '92%', activeStaff: 18),
    ],
    'org-3': [
      Branch(id: 'br-6', name: 'Sandbox Local Node', status: BranchStatus.open, syncPercentage: '100%', activeStaff: 2),
    ],
  };

  static const List<StaffMember> _dbStaff = [
    StaffMember(id: 'st-1', name: 'John Doe', pin: '1234', role: StaffRole.waiter),
    StaffMember(id: 'st-2', name: 'Sarah Jenkins', pin: '5678', role: StaffRole.kdsOperator),
    StaffMember(id: 'st-3', name: 'Bob Smith', pin: '0000', role: StaffRole.manager),
  ];

  Future<List<Organization>> getOrganizations() async {
    await Future.delayed(const Duration(milliseconds: 300));
    return _dbOrganizations;
  }

  Future<List<Branch>> getBranchesForOrganization(String orgId) async {
    await Future.delayed(const Duration(milliseconds: 300));
    return _dbBranches[orgId] ?? [];
  }

  Future<StaffMember?> loginWithPIN(String pin) async {
    await Future.delayed(const Duration(milliseconds: 400));
    final index = _dbStaff.indexWhere((s) => s.pin == pin);
    if (index != -1) {
      return _dbStaff[index];
    }
    return null;
  }
}
