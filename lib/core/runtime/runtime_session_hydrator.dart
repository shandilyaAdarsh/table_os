// lib/core/runtime/runtime_session_hydrator.dart
//
// RuntimeSessionHydrator — restores runtime state from authoritative backend.
// Handles session restoration, replay recovery, and deterministic state reconstruction.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../network/dio_client.dart';
import '../network/secure_storage.dart';
import '../network/network_providers.dart';
import 'domain/runtime_epoch.dart';
import 'domain/runtime_event.dart';

/// Represents a hydrated runtime session.
class HydratedSession {
  final RuntimeEpoch epoch;
  final Map<String, dynamic> authContext;
  final Map<String, dynamic> rbacContext;
  final Map<String, dynamic> branchContext;
  final List<RuntimeEvent> replayEvents;
  final DateTime hydratedAt;

  const HydratedSession({
    required this.epoch,
    required this.authContext,
    required this.rbacContext,
    required this.branchContext,
    required this.replayEvents,
    required this.hydratedAt,
  });
}

/// Result of a hydration operation.
class HydrationResult {
  final bool success;
  final HydratedSession? session;
  final String? errorMessage;

  const HydrationResult({
    required this.success,
    this.session,
    this.errorMessage,
  });

  factory HydrationResult.success(HydratedSession session) {
    return HydrationResult(
      success: true,
      session: session,
    );
  }

  factory HydrationResult.failure(String error) {
    return HydrationResult(
      success: false,
      errorMessage: error,
    );
  }
}

class RuntimeSessionHydrator {
  final DioClient _dioClient;

  RuntimeSessionHydrator(this._dioClient);

  /// Hydrate a runtime session from backend state.
  /// This is called on app start, session restoration, or after reconnection.
  Future<HydrationResult> hydrateSession({
    required String branchId,
    required String staffId,
    String? lastKnownEpochId,
    int? lastKnownSequence,
  }) async {
    debugPrint('[RuntimeSessionHydrator] Starting session hydration...');
    debugPrint('[RuntimeSessionHydrator] Branch: $branchId, Staff: $staffId');

    try {
      // Step 1: Exchange platform session for a short-lived runtime token
      final exchangeSuccess = await _exchangeRuntimeToken(branchId);
      if (!exchangeSuccess) {
        return HydrationResult.failure('Failed to exchange platform token for runtime session');
      }

      // Step 2: Fetch authoritative auth context
      final authContext = await _fetchAuthContext(staffId);
      if (authContext == null) {
        return HydrationResult.failure('Failed to fetch auth context');
      }

      // Step 3: Fetch RBAC context
      final rbacContext = await _fetchRBACContext(staffId, branchId, authContext);
      if (rbacContext == null) {
        return HydrationResult.failure('Failed to fetch RBAC context');
      }

      // Step 4: Fetch branch context
      final tenantId = authContext['user']?['tenantId'] as String? ?? '11111111-1111-1111-1111-111111111111';
      final branchContext = await _fetchBranchContext(tenantId, branchId);
      if (branchContext == null) {
        return HydrationResult.failure('Failed to fetch branch context');
      }

      // Step 5: Fetch replay events (if recovering from disconnection)
      final replayEvents = await _fetchReplayEvents(
        branchId: branchId,
        lastKnownEpochId: lastKnownEpochId,
        lastKnownSequence: lastKnownSequence,
      );

      // Step 6: Create new epoch
      final epoch = RuntimeEpoch(
        epochId: _generateEpochId(),
        branchId: branchId,
        staffId: staffId,
        issuedAt: DateTime.now(),
        isValid: true,
      );

      final session = HydratedSession(
        epoch: epoch,
        authContext: authContext,
        rbacContext: rbacContext,
        branchContext: branchContext,
        replayEvents: replayEvents,
        hydratedAt: DateTime.now(),
      );

      debugPrint('[RuntimeSessionHydrator] Session hydrated successfully');
      debugPrint('[RuntimeSessionHydrator] Epoch: ${epoch.epochId}');
      debugPrint('[RuntimeSessionHydrator] Replay events: ${replayEvents.length}');

      return HydrationResult.success(session);
    } catch (e, stackTrace) {
      debugPrint('[RuntimeSessionHydrator] Hydration failed: $e');
      debugPrint('Stack trace: $stackTrace');
      return HydrationResult.failure('Hydration error: $e');
    }
  }

  /// Exchange valid Supabase token for short-lived Runtime JWT.
  Future<bool> _exchangeRuntimeToken(String branchId) async {
    final supabaseToken = Supabase.instance.client.auth.currentSession?.accessToken;
    if (supabaseToken == null) {
      debugPrint('[RuntimeSessionHydrator] No active Supabase platform token available for exchange.');
      return false;
    }

    const secureStorage = SecureLocalStorage();
    var deviceSessionId = await secureStorage.read('device_session_id');
    if (deviceSessionId == null) {
      deviceSessionId = const Uuid().v4();
      await secureStorage.write('device_session_id', deviceSessionId);
    }

    try {
      final response = await _dioClient.post(
        '/api/v1/auth/runtime/exchange',
        data: {
          'branch_id': branchId,
        },
        options: Options(
          headers: {
            'Authorization': 'Bearer $supabaseToken',
            'x-device-session-id': deviceSessionId,
          },
        ),
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        final data = response.data['data'];
        final runtimeToken = data['runtime_token'] as String;
        await secureStorage.write('runtime_token', runtimeToken);
        debugPrint('[RuntimeSessionHydrator] Runtime token exchanged successfully');
        return true;
      }
    } catch (e) {
      debugPrint('[RuntimeSessionHydrator] Failed to exchange runtime token: $e');
    }
    return false;
  }

  /// Fetch authoritative authentication context from backend.
  Future<Map<String, dynamic>?> _fetchAuthContext(String staffId) async {
    debugPrint('[RuntimeSessionHydrator] Fetching auth context for staff: $staffId');

    const secureStorage = SecureLocalStorage();
    final token = await secureStorage.read('runtime_token');
    final deviceSessionId = await secureStorage.read('device_session_id');

    try {
      final response = await _dioClient.get(
        '/api/v1/auth/session',
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            if (deviceSessionId != null) 'x-device-session-id': deviceSessionId,
          },
        ),
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        return response.data['data'] as Map<String, dynamic>;
      }
    } catch (e) {
      debugPrint('[RuntimeSessionHydrator] Fetching auth context failed: $e');
    }
    return null;
  }

  /// Fetch RBAC context from backend.
  Future<Map<String, dynamic>?> _fetchRBACContext(
    String staffId,
    String branchId,
    Map<String, dynamic> authContext,
  ) async {
    debugPrint('[RuntimeSessionHydrator] Resolving RBAC context for staff: $staffId, branch: $branchId');

    final user = authContext['user'];
    if (user == null) return null;

    return {
      'staffId': staffId,
      'branchId': branchId,
      'roles': [user['role'] ?? 'SERVER'],
      'permissions': List<String>.from(user['permissions'] ?? []),
    };
  }

  /// Fetch branch context from backend.
  Future<Map<String, dynamic>?> _fetchBranchContext(String tenantId, String branchId) async {
    debugPrint('[RuntimeSessionHydrator] Fetching branch context for: $branchId under tenant: $tenantId');

    const secureStorage = SecureLocalStorage();
    final token = await secureStorage.read('runtime_token');

    try {
      final response = await _dioClient.get(
        '/api/v1/tenants/$tenantId/branches',
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
          },
        ),
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        final list = response.data['data'] as List;
        final branch = list.firstWhere(
          (b) => b['id'] == branchId,
          orElse: () => null,
        );

        if (branch != null) {
          return {
            'branchId': branch['id'],
            'branchName': branch['name'],
            'organizationId': tenantId,
            'timezone': branch['timezone'] ?? 'UTC',
            'currency': 'USD',
          };
        }
      }
    } catch (e) {
      debugPrint('[RuntimeSessionHydrator] Fetching branch context failed: $e');
    }
    return null;
  }

  /// Fetch replay events for session recovery.
  Future<List<RuntimeEvent>> _fetchReplayEvents({
    required String branchId,
    String? lastKnownEpochId,
    int? lastKnownSequence,
  }) async {
    if (lastKnownEpochId == null || lastKnownSequence == null) {
      debugPrint('[RuntimeSessionHydrator] No replay needed (fresh session)');
      return [];
    }

    debugPrint('[RuntimeSessionHydrator] Fetching replay events from sequence: $lastKnownSequence');

    const secureStorage = SecureLocalStorage();
    final token = await secureStorage.read('runtime_token');

    try {
      final response = await _dioClient.get(
        '/api/v1/runtime/events/replay',
        queryParameters: {
          'branch_id': branchId,
          'from_seq': lastKnownSequence,
        },
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
          },
        ),
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        final list = response.data['data'] as List;
        return list
            .map((json) => RuntimeEvent.tryParse(json as Map<String, dynamic>))
            .whereType<RuntimeEvent>()
            .toList();
      }
    } catch (e) {
      debugPrint('[RuntimeSessionHydrator] Fetching replay events failed: $e');
    }

    return [];
  }

  /// Generate a new epoch ID.
  String _generateEpochId() {
    return 'epoch_${DateTime.now().millisecondsSinceEpoch}';
  }
}

final runtimeSessionHydratorProvider = Provider<RuntimeSessionHydrator>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return RuntimeSessionHydrator(dioClient);
});
