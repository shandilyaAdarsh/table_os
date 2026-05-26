import { z } from 'zod';

// ============================================================
// Event Envelope Governance
// ============================================================

export const EventEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  event_sequence: z.number().int().nonnegative(),
  server_epoch: z.number().int().nonnegative(),
  event_source: z.enum(['SYSTEM', 'ORDERING', 'KDS', 'ADMIN', 'SYNC_ENGINE']),
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  stream_type: z.string(),
  event_type: z.string(),
  occurred_at: z.string().datetime(),
  payload: z.any(),
  replay_cursor: z.string(), // Usually the stringified event_sequence, for agnostic cursor parsing later
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

// ============================================================
// Client Frame Governance
// ============================================================

// Sent by client immediately upon connection to negotiate replay
export const SyncFrameSchema = z.object({
  type: z.literal('SYNC'),
  last_sequence: z.number().int().nonnegative().optional(),
});

// Sent periodically by client to ACK delivery
export const AckFrameSchema = z.object({
  type: z.literal('ACK'),
  last_received_sequence: z.number().int().nonnegative(),
});

export type SyncFrame = z.infer<typeof SyncFrameSchema>;
export type AckFrame = z.infer<typeof AckFrameSchema>;

// ============================================================
// Internal Connection Identity
// ============================================================

export interface ConnectionIdentity {
  connection_id: string;
  stream_instance_id: string;
  tenant_id: string;
  branch_id: string;
  session_id?: string;
  user_id?: string;
  connected_at: string;
}
