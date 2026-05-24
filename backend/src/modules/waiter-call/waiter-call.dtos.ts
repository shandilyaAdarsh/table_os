// ============================================================
// src/modules/waiter-call/waiter-call.dtos.ts
// DTO definitions for waiter calls.
// ============================================================

import type { WaiterCallType } from './waiter-call.types';

export interface CreateWaiterCallDto {
  type: WaiterCallType;
  notes?: string;
}

export interface UpdateWaiterCallStatusDto {
  status: 'acknowledged' | 'resolved';
  version_num: number;
  reason?: string;
}
