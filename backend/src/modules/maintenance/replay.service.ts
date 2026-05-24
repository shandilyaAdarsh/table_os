// ============================================================
// src/modules/maintenance/replay.service.ts
// Secure Replay & Simulation Engine supporting dry-runs, payload validation,
// and state difference tracking.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { logReplayEvent } from './metrics.repository';
import { replayLogger } from './observability.logger';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

export interface ReplayDiffReport {
  eventId: string;
  isDryRun: boolean;
  isValid: boolean;
  validationErrors: string[];
  diffs: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

/**
 * Validates the event structure and payload schema.
 */
export function validateEventPayload(event: any): string[] {
  const errors: string[] = [];
  if (!event.id) errors.push('Missing unique event ID');
  if (!event.tenant_id) errors.push('Missing tenant_id reference');
  if (!event.event_type) errors.push('Missing event_type definition');
  if (!event.payload || typeof event.payload !== 'object') errors.push('Invalid or empty payload object');
  return errors;
}

/**
 * Computes deep difference between two payloads.
 */
export function computePayloadDiff(oldPayload: any, newPayload: any): ReplayDiffReport['diffs'] {
  const diffs: ReplayDiffReport['diffs'] = [];
  const allKeys = new Set([...Object.keys(oldPayload ?? {}), ...Object.keys(newPayload ?? {})]);

  for (const key of allKeys) {
    const oldVal = oldPayload?.[key];
    const newVal = newPayload?.[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({
        field: key,
        oldValue: oldVal,
        newValue: newVal
      });
    }
  }

  return diffs;
}

/**
 * Simulates event delivery without side-effects (Dry-Run Mode).
 */
export async function simulateEventReplay(params: {
  eventId: string;
  triggeredBy: string;
  replayReason: string;
}): Promise<ReplayDiffReport> {
  const { eventId, triggeredBy, replayReason } = params;

  // 1. Fetch event from database
  const { data: event, error } = await supabaseAdmin
    .from('domain_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (error || !event) {
    throw new AppError(`Event not found for replay: ${eventId}`, 404, ErrorCode.NOT_FOUND);
  }

  // 2. Validate structural integrity
  const validationErrors = validateEventPayload(event);
  const isValid = validationErrors.length === 0;

  // 3. Dry-run simulation (construct virtual mock response)
  const simulatedPayload = {
    ...event.payload,
    __simulated_replay: true,
    __simulated_at: new Date().toISOString()
  };

  const diffs = computePayloadDiff(event.payload, simulatedPayload);

  // 4. Log simulation event in persistent metrics store
  await logReplayEvent({
    eventId,
    replayReason,
    triggeredBy,
    isDryRun: true,
    diffPayload: diffs
  });

  replayLogger.info(`Completed event dry-run simulation`, {
    eventId,
    triggeredBy,
    isValid,
    diffCount: diffs.length
  });

  return {
    eventId,
    isDryRun: true,
    isValid,
    validationErrors,
    diffs
  };
}

/**
 * Executes a real event replay, re-dispatching down the delivery pipeline.
 */
export async function executeLiveEventReplay(params: {
  eventId: string;
  triggeredBy: string;
  replayReason: string;
}): Promise<ReplayDiffReport> {
  const { eventId, triggeredBy, replayReason } = params;

  // 1. Fetch event from DB
  const { data: event, error } = await supabaseAdmin
    .from('domain_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (error || !event) {
    throw new AppError(`Event not found for live replay: ${eventId}`, 404, ErrorCode.NOT_FOUND);
  }

  // 2. Validate structure
  const validationErrors = validateEventPayload(event);
  if (validationErrors.length > 0) {
    throw new AppError(`Invalid event structure: ${validationErrors.join(', ')}`, 400, ErrorCode.VALIDATION_ERROR);
  }

  // 3. Mark the event as 'pending' with 0 retries to trigger delivery pipeline again safely
  const { error: resetError } = await supabaseAdmin
    .from('domain_events')
    .update({
      delivery_status: 'pending',
      retry_count: 0,
      locked_by: null,
      locked_until: null,
      error_reason: null
    })
    .eq('id', eventId);

  if (resetError) {
    throw new AppError(`Failed to update event state for live replay: ${resetError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  // 4. Write replay audit metric
  await logReplayEvent({
    eventId,
    replayReason,
    triggeredBy,
    isDryRun: false
  });

  replayLogger.info(`Live event replay triggered successfully`, {
    eventId,
    triggeredBy,
    replayReason
  });

  return {
    eventId,
    isDryRun: false,
    isValid: true,
    validationErrors: [],
    diffs: []
  };
}
