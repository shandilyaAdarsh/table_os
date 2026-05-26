// lib/features/reservations/domain/repositories/reservations_repository.dart
import '../entities/reservation.dart';

abstract class ReservationsRepository {
  Future<List<Reservation>> getReservations();
  Future<List<WaitlistEntry>> getWaitlist();
  Future<void> addReservation(Reservation reservation);
  Future<void> addWaitlistEntry(WaitlistEntry entry);
  Future<void> updateReservationStatus(String id, ReservationStatus status, {String? tableId});
  Future<void> removeFromWaitlist(String id);

  // ━━━━━━━━━━━━━━━━━━━━━━ RUNTIME INTEGRATION ━━━━━━━━━━━━━━━━━━━━━━
  
  /// Stream of reservations for reactive UI updates.
  Stream<List<Reservation>> watchReservations();

  /// Stream of waitlist entries for reactive UI updates.
  Stream<List<WaitlistEntry>> watchWaitlist();

  /// Apply remote reservation update from backend (called by runtime bridge).
  /// NEVER call this directly from UI code.
  Future<void> applyRemoteReservationUpdate(Map<String, dynamic> payload);

  /// Apply remote reservation deletion from backend (called by runtime bridge).
  /// NEVER call this directly from UI code.
  Future<void> applyRemoteReservationDelete(String reservationId);

  /// Apply remote waitlist update from backend (called by runtime bridge).
  /// NEVER call this directly from UI code.
  Future<void> applyRemoteWaitlistUpdate(Map<String, dynamic> payload);

  /// Apply remote waitlist deletion from backend (called by runtime bridge).
  /// NEVER call this directly from UI code.
  Future<void> applyRemoteWaitlistDelete(String waitlistId);
}
