// lib/core/runtime/sequence_validator.dart
//
// SequenceValidator — enforces monotonic sequence ordering per branch channel.
// Detects gaps (missed events) and rejects out-of-order duplicates.
// This is the FIRST gate every RuntimeEvent passes through.

import 'package:flutter/foundation.dart';
import 'domain/runtime_event.dart';

enum SequenceValidationResult {
  accept,       // Event is in order — process normally
  gap,          // Gap detected — delta recovery required before processing
  duplicate,    // Already processed — discard silently
  outOfOrder,   // Sequence is behind expected — discard
}

class SequenceGap {
  final int expectedFrom;
  final int expectedTo;
  final String branchId;

  const SequenceGap({
    required this.expectedFrom,
    required this.expectedTo,
    required this.branchId,
  });

  int get size => expectedTo - expectedFrom + 1;

  @override
  String toString() =>
      'SequenceGap(branch: $branchId, range: [$expectedFrom..$expectedTo], size: $size)';
}

class SequenceValidationOutcome {
  final SequenceValidationResult result;
  final SequenceGap? gap; // Non-null only when result == gap

  const SequenceValidationOutcome.accept()
      : result = SequenceValidationResult.accept,
        gap = null;

  const SequenceValidationOutcome.gap(this.gap)
      : result = SequenceValidationResult.gap;

  const SequenceValidationOutcome.duplicate()
      : result = SequenceValidationResult.duplicate,
        gap = null;

  const SequenceValidationOutcome.outOfOrder()
      : result = SequenceValidationResult.outOfOrder,
        gap = null;

  bool get isAccepted => result == SequenceValidationResult.accept;
  bool get hasGap => result == SequenceValidationResult.gap;
}

class SequenceValidator {
  // Per-branch expected sequence numbers
  final Map<String, int> _expectedSequences = {};

  // Per-branch processed idempotency keys stored as ordered list for deterministic eviction
  final Map<String, List<String>> _processedKeysList = {};
  final Map<String, Set<String>> _processedKeysSet = {};
  static const int _maxKeyHistory = 500;

  /// Validate an incoming event and advance the sequence counter if accepted.
  SequenceValidationOutcome validate(RuntimeEvent event) {
    final branchId = event.branchId;
    final seq = event.sequenceNumber;
    final key = event.idempotencyKey;

    // 1. Idempotency check — reject duplicates regardless of sequence
    final keySet = _processedKeysSet.putIfAbsent(branchId, () => {});
    if (keySet.contains(key)) {
      debugPrint('[SequenceValidator] Duplicate event rejected: key=$key seq=$seq branch=$branchId');
      return const SequenceValidationOutcome.duplicate();
    }

    final expected = _expectedSequences[branchId] ?? 1;

    // 2. Gap detection
    if (seq > expected) {
      debugPrint('[SequenceValidator] GAP detected on branch $branchId: expected=$expected got=$seq');
      return SequenceValidationOutcome.gap(
        SequenceGap(
          expectedFrom: expected,
          expectedTo: seq - 1,
          branchId: branchId,
        ),
      );
    }

    // 3. Out-of-order / stale
    if (seq < expected) {
      debugPrint('[SequenceValidator] Out-of-order event discarded: expected=$expected got=$seq branch=$branchId');
      return const SequenceValidationOutcome.outOfOrder();
    }

    // 4. Accept — advance sequence and record key
    _expectedSequences[branchId] = seq + 1;
    _recordKey(branchId, key, keySet);

    debugPrint('[SequenceValidator] Accepted seq=$seq branch=$branchId');
    return const SequenceValidationOutcome.accept();
  }

  /// Called after gap recovery to advance the sequence past the recovered range.
  void advanceAfterRecovery(String branchId, int recoveredUpToSequence) {
    _expectedSequences[branchId] = recoveredUpToSequence + 1;
    debugPrint('[SequenceValidator] Advanced branch $branchId sequence to ${recoveredUpToSequence + 1} after recovery');
  }

  /// Reset a branch's sequence (e.g. after epoch change or full resync).
  void resetBranch(String branchId, {int startFrom = 1}) {
    _expectedSequences[branchId] = startFrom;
    _processedKeysSet.remove(branchId);
    _processedKeysList.remove(branchId);
    debugPrint('[SequenceValidator] Reset branch $branchId sequence to $startFrom');
  }

  int expectedSequenceFor(String branchId) => _expectedSequences[branchId] ?? 1;

  void _recordKey(String branchId, String key, Set<String> keySet) {
    final keyList = _processedKeysList.putIfAbsent(branchId, () => []);
    keySet.add(key);
    keyList.add(key);
    // Evict oldest key (FIFO) when over limit — deterministic insertion-order eviction
    if (keyList.length > _maxKeyHistory) {
      final oldest = keyList.removeAt(0);
      keySet.remove(oldest);
    }
  }
}
