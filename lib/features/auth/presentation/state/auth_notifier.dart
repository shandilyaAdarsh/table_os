// lib/features/auth/presentation/state/auth_notifier.dart
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../domain/entities/organization.dart';
import '../../domain/entities/branch.dart';
import '../../domain/entities/staff_member.dart';
import 'auth_state.dart';

import '../../providers/auth_repository_provider.dart';
import '../../../../core/runtime/runtime.dart';
import '../../../onboarding/presentation/state/onboarding_notifier.dart';

part 'auth_notifier.g.dart';

@Riverpod(keepAlive: true)
class AuthNotifier extends _$AuthNotifier {
  @override
  AuthState build() {
    _loadInitialData();
    return const AuthState();
  }

  Future<void> _loadInitialData() async {
    final repo = ref.read(authRepositoryProvider);
    _organizations = await repo.getOrganizations();
    for (var org in _organizations) {
      _branches[org.id] = await repo.getBranchesForOrganization(org.id);
    }
  }

  List<Organization> get mockOrganizations => _organizations;
  Map<String, List<Branch>> get mockBranches => _branches;

  // Preloaded mock data for offline resiliency and simulation
  // Now loaded dynamically from AuthRepository
  List<Organization> _organizations = [];
  final Map<String, List<Branch>> _branches = {};

  void selectOrganization(Organization org) {
    state = state.copyWith(
      selectedOrg: org,
      selectedBranch: null,
      loggedInStaff: null,
      isShiftStarted: false,
      errorMessage: null,
    );
  }

  void selectBranch(Branch branch) {
    state = state.copyWith(
      selectedBranch: branch,
      loggedInStaff: null,
      isShiftStarted: false,
      errorMessage: null,
    );
  }

  Future<bool> loginWithPIN(String pin) async {
    state = state.copyWith(errorMessage: null);

    // Check pin credentials against authoritative repository
    final repo = ref.read(authRepositoryProvider);
    final staff = await repo.loginWithPIN(pin, branchId: state.selectedBranch?.id);

    if (staff != null) {
      state = state.copyWith(loggedInStaff: staff, isLocked: false);
      // Hydrate onboarding state for router to determine correct flow
      await ref.read(onboardingNotifierProvider.notifier).hydrate();
      return true;
    } else {
      state = state.copyWith(
        errorMessage: 'Invalid PIN code. Please try again.',
      );
      return false;
    }
  }

  Future<void> startShift(StaffRole role, String section) async {
    if (state.loggedInStaff == null || state.selectedBranch == null) return;

    final updatedStaff = state.loggedInStaff!.copyWith(
      role: role,
      section: section,
    );

    // Hydrate runtime session using backend-authoritative data
    final hydrator = ref.read(runtimeSessionHydratorProvider);
    final result = await hydrator.hydrateSession(
      branchId: state.selectedBranch!.id,
      staffId: updatedStaff.id,
    );

    if (result.success && result.session != null) {
      // Setup runtime epoch and notify orchestrator
      final orchestrator = ref.read(runtimeOrchestratorProvider);
      orchestrator.startSession(
        branchId: state.selectedBranch!.id,
        staffId: updatedStaff.id,
      );

      state = state.copyWith(
        loggedInStaff: updatedStaff,
        isShiftStarted: true,
        shiftStartTime: DateTime.now(),
        isLocked: false,
      );
    } else {
      state = state.copyWith(
        errorMessage: result.errorMessage ?? 'Failed to start shift',
      );
    }
  }

  void lockSession() {
    state = state.copyWith(isLocked: true);
  }

  bool unlockSession(String pin) {
    if (state.loggedInStaff?.pin == pin) {
      state = state.copyWith(isLocked: false);
      return true;
    }
    state = state.copyWith(errorMessage: 'Incorrect PIN code.');
    return false;
  }

  void endShift() {
    state = state.copyWith(
      isShiftStarted: false,
      shiftStartTime: null,
      loggedInStaff: null,
    );
  }

  void logout() {
    state = const AuthState();
    ref.read(onboardingNotifierProvider.notifier).reset();
  }
}
