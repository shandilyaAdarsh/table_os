// lib/features/reservations/domain/entities/reservation.dart
import 'package:equatable/equatable.dart';

enum ReservationStatus {
  booked,
  checkedIn,
  seated,
  noShow,
  cancelled,
}

class Reservation extends Equatable {
  final String id;
  final String guestName;
  final String guestPhone;
  final int guestCount;
  final DateTime reservationTime;
  final ReservationStatus status;
  final String? assignedTableId;
  final DateTime? checkedInTime;

  const Reservation({
    required this.id,
    required this.guestName,
    required this.guestPhone,
    required this.guestCount,
    required this.reservationTime,
    required this.status,
    this.assignedTableId,
    this.checkedInTime,
  });

  // SLA violation calculation:
  // Green: > 15 mins before arrival.
  // Yellow: <= 15 mins before arrival (Table assignment required).
  // Red: Guest checked in but unseated for > 5 mins.
  String get slaStatus {
    if (status == ReservationStatus.checkedIn) {
      if (checkedInTime != null) {
        final elapsed = DateTime.now().difference(checkedInTime!).inMinutes;
        if (elapsed > 5) return 'critical'; // Red
      }
      return 'warning'; // Yellow
    }
    
    if (status == ReservationStatus.booked) {
      final timeDiff = reservationTime.difference(DateTime.now()).inMinutes;
      if (timeDiff <= 15) return 'warning'; // Yellow
      return 'safe'; // Green
    }

    return 'completed';
  }

  Reservation copyWith({
    String? id,
    String? guestName,
    String? guestPhone,
    int? guestCount,
    DateTime? reservationTime,
    ReservationStatus? status,
    String? assignedTableId,
    DateTime? checkedInTime,
  }) {
    return Reservation(
      id: id ?? this.id,
      guestName: guestName ?? this.guestName,
      guestPhone: guestPhone ?? this.guestPhone,
      guestCount: guestCount ?? this.guestCount,
      reservationTime: reservationTime ?? this.reservationTime,
      status: status ?? this.status,
      assignedTableId: assignedTableId ?? this.assignedTableId,
      checkedInTime: checkedInTime ?? this.checkedInTime,
    );
  }

  factory Reservation.fromJson(Map<String, dynamic> json) {
    return Reservation(
      id: json['id'] as String,
      guestName: json['guestName'] as String,
      guestPhone: json['guestPhone'] as String,
      guestCount: json['guestCount'] as int,
      reservationTime: DateTime.parse(json['reservationTime'] as String),
      status: ReservationStatus.values.firstWhere(
        (e) => e.name == json['status'],
        orElse: () => ReservationStatus.booked,
      ),
      assignedTableId: json['assignedTableId'] as String?,
      checkedInTime: json['checkedInTime'] != null
          ? DateTime.parse(json['checkedInTime'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'guestName': guestName,
      'guestPhone': guestPhone,
      'guestCount': guestCount,
      'reservationTime': reservationTime.toIso8601String(),
      'status': status.name,
      'assignedTableId': assignedTableId,
      'checkedInTime': checkedInTime?.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [
        id,
        guestName,
        guestPhone,
        guestCount,
        reservationTime,
        status,
        assignedTableId,
        checkedInTime,
      ];
}

class WaitlistEntry extends Equatable {
  final String id;
  final String guestName;
  final String guestPhone;
  final int guestCount;
  final DateTime addedTime;
  final bool isVip;

  const WaitlistEntry({
    required this.id,
    required this.guestName,
    required this.guestPhone,
    required this.guestCount,
    required this.addedTime,
    required this.isVip,
  });

  int get waitDurationMinutes {
    return DateTime.now().difference(addedTime).inMinutes;
  }

  // Priority Score = (Wait Duration in Mins * 1.5) + (Guest Count * 0.5) + (isVip ? 15.0 : 0)
  double get priorityScore {
    return (waitDurationMinutes * 1.5) + (guestCount * 0.5) + (isVip ? 15.0 : 0.0);
  }

  factory WaitlistEntry.fromJson(Map<String, dynamic> json) {
    return WaitlistEntry(
      id: json['id'] as String,
      guestName: json['guestName'] as String,
      guestPhone: json['guestPhone'] as String,
      guestCount: json['guestCount'] as int,
      addedTime: DateTime.parse(json['addedTime'] as String),
      isVip: json['isVip'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'guestName': guestName,
      'guestPhone': guestPhone,
      'guestCount': guestCount,
      'addedTime': addedTime.toIso8601String(),
      'isVip': isVip,
    };
  }

  @override
  List<Object?> get props => [id, guestName, guestPhone, guestCount, addedTime, isVip];
}
