// ============================================================
// src/modules/waiter-call/waiter-call.types.ts
// TypeScript interfaces matching the DB schema for waiter calls.
// ============================================================

export type WaiterCallType = 'service' | 'bill' | 'other';
export type WaiterCallStatus = 'pending' | 'acknowledged' | 'resolved';

export interface WaiterCall {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  session_id: string | null;
  type: WaiterCallType;
  notes: string | null;
  status: WaiterCallStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  version_num: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
