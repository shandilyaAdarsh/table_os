// lib/features/reservations/data/repositories/reservations_repository_impl.dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../domain/entities/reservation.dart';
import '../../domain/repositories/reservations_repository.dart';

class ReservationsRepositoryImpl implements ReservationsRepository {
  final List<Reservation> _reservations = [];
  final List<WaitlistEntry> _waitlist = [];

  // Stream controllers for reactive updates
  final _reservationsController = StreamController<List<Reservation>>.broadcast();
  final _waitlistController = StreamController<List<WaitlistEntry>>.broadcast();

  ReservationsRepositoryImpl() {
    _initMockData();
  }

  void dispose() {
    _reservationsController.close();
    _waitlistController.close();
  }

  void _initMockData() {
    final now = DateTime.now();
    _reservations.addAll([
      Reservation(
        id: 'res-1',
        guestName: 'Alex Mercer',
        guestPhone: '+1 555-0192',
        guestCount: 4,
        reservationTime: now.add(const Duration(minutes: 10)),
        status: ReservationStatus.booked,
      ),
      Reservation(
        id: 'res-2',
        guestName: 'Beatrix Kiddo',
        guestPhone: '+1 555-0283',
        guestCount: 2,
        reservationTime: now.add(const Duration(minutes: 45)),
        status: ReservationStatus.booked,
      ),
      Reservation(
        id: 'res-3',
        guestName: 'Charles Xavier',
        guestPhone: '+1 555-0374',
        guestCount: 6,
        reservationTime: now.subtract(const Duration(minutes: 8)),
        status: ReservationStatus.checkedIn,
        checkedInTime: now.subtract(const Duration(minutes: 8)),
      ),
      Reservation(
        id: 'res-4',
        guestName: 'Diana Prince',
        guestPhone: '+1 555-0465',
        guestCount: 3,
        reservationTime: now.subtract(const Duration(minutes: 20)),
        status: ReservationStatus.booked, // No-show soon if grace period triggers
      ),
    ]);

    _waitlist.addAll([
      WaitlistEntry(
        id: 'wait-1',
        guestName: 'Bruce Wayne',
        guestPhone: '+1 555-0099',
        guestCount: 2,
        addedTime: now.subtract(const Duration(minutes: 12)),
        isVip: true,
      ),
      WaitlistEntry(
        id: 'wait-2',
        guestName: 'Clark Kent',
        guestPhone: '+1 555-0088',
        guestCount: 4,
        addedTime: now.subtract(const Duration(minutes: 20)),
        isVip: false,
      ),
      WaitlistEntry(
        id: 'wait-3',
        guestName: 'Peter Parker',
        guestPhone: '+1 555-0077',
        guestCount: 1,
        addedTime: now.subtract(const Duration(minutes: 5)),
        isVip: false,
      ),
    ]);
  }

  @override
  Future<List<Reservation>> getReservations() async {
    await Future.delayed(const Duration(milliseconds: 100));
    return List.from(_reservations);
  }

  @override
  Future<List<WaitlistEntry>> getWaitlist() async {
    await Future.delayed(const Duration(milliseconds: 100));
    return List.from(_waitlist);
  }

  @override
  Future<void> addReservation(Reservation reservation) async {
    await Future.delayed(const Duration(milliseconds: 100));
    _reservations.add(reservation);
    _notifyReservationsChanged();
  }

  @override
  Future<void> addWaitlistEntry(WaitlistEntry entry) async {
    await Future.delayed(const Duration(milliseconds: 100));
    _waitlist.add(entry);
    _notifyWaitlistChanged();
  }

  @override
  Future<void> updateReservationStatus(String id, ReservationStatus status, {String? tableId}) async {
    await Future.delayed(const Duration(milliseconds: 100));
    final index = _reservations.indexWhere((r) => r.id == id);
    if (index != -1) {
      final old = _reservations[index];
      _reservations[index] = old.copyWith(
        status: status,
        assignedTableId: tableId ?? old.assignedTableId,
        checkedInTime: status == ReservationStatus.checkedIn ? DateTime.now() : old.checkedInTime,
      );
      _notifyReservationsChanged();
    }
  }

  @override
  Future<void> removeFromWaitlist(String id) async {
    await Future.delayed(const Duration(milliseconds: 100));
    _waitlist.removeWhere((w) => w.id == id);
    _notifyWaitlistChanged();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ RUNTIME INTEGRATION ━━━━━━━━━━━━━━━━━━━━━━

  @override
  Stream<List<Reservation>> watchReservations() {
    return _reservationsController.stream;
  }

  @override
  Stream<List<WaitlistEntry>> watchWaitlist() {
    return _waitlistController.stream;
  }

  @override
  Future<void> applyRemoteReservationUpdate(Map<String, dynamic> payload) async {
    debugPrint('[ReservationsRepository] Applying remote reservation update: $payload');
    
    try {
      final reservation = Reservation.fromJson(payload);
      final index = _reservations.indexWhere((r) => r.id == reservation.id);
      
      if (index != -1) {
        _reservations[index] = reservation;
      } else {
        _reservations.add(reservation);
      }
      
      _notifyReservationsChanged();
      debugPrint('[ReservationsRepository] Applied reservation update: ${reservation.id}');
    } catch (e) {
      debugPrint('[ReservationsRepository] ERROR applying reservation update: $e');
    }
  }

  @override
  Future<void> applyRemoteReservationDelete(String reservationId) async {
    debugPrint('[ReservationsRepository] Applying remote reservation delete: $reservationId');
    
    final initialLength = _reservations.length;
    _reservations.removeWhere((r) => r.id == reservationId);
    
    if (_reservations.length < initialLength) {
      _notifyReservationsChanged();
      debugPrint('[ReservationsRepository] Deleted reservation: $reservationId');
    }
  }

  @override
  Future<void> applyRemoteWaitlistUpdate(Map<String, dynamic> payload) async {
    debugPrint('[ReservationsRepository] Applying remote waitlist update: $payload');
    
    try {
      final entry = WaitlistEntry.fromJson(payload);
      final index = _waitlist.indexWhere((w) => w.id == entry.id);
      
      if (index != -1) {
        _waitlist[index] = entry;
      } else {
        _waitlist.add(entry);
      }
      
      _notifyWaitlistChanged();
      debugPrint('[ReservationsRepository] Applied waitlist update: ${entry.id}');
    } catch (e) {
      debugPrint('[ReservationsRepository] ERROR applying waitlist update: $e');
    }
  }

  @override
  Future<void> applyRemoteWaitlistDelete(String waitlistId) async {
    debugPrint('[ReservationsRepository] Applying remote waitlist delete: $waitlistId');
    
    final initialLength = _waitlist.length;
    _waitlist.removeWhere((w) => w.id == waitlistId);
    
    if (_waitlist.length < initialLength) {
      _notifyWaitlistChanged();
      debugPrint('[ReservationsRepository] Deleted waitlist entry: $waitlistId');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ INTERNAL HELPERS ━━━━━━━━━━━━━━━━━━━━━━

  void _notifyReservationsChanged() {
    _reservationsController.add(List.from(_reservations));
  }

  void _notifyWaitlistChanged() {
    _waitlistController.add(List.from(_waitlist));
  }
}
