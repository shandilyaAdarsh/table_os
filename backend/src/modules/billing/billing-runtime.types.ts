// ============================================================
// src/modules/billing/billing-runtime.types.ts
// TypeScript models and DTO contracts for the billing runtime.
// ============================================================

import { PaymentMethod, PaymentStatus } from './billing.repository';

export type BillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'FAILED' | 'VOIDED' | 'REFUNDED';
export type IntentStatus = 'created' | 'authorized' | 'captured' | 'failed' | 'expired';

export interface BillDTO {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string | null;
  session_id: string | null;
  parent_bill_id: string | null;
  bill_number: string;
  status: BillStatus;
  subtotal_minor: number;
  tax_total_minor: number;
  discount_total_minor: number;
  grand_total_minor: number;
  amount_paid_minor: number;
  amount_refunded_minor: number;
  currency_code: string;
  version_num: number;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillItemDTO {
  id: string;
  tenant_id: string;
  bill_id: string;
  order_item_snapshot_id: string;
  quantity: number;
  unit_price_minor: number;
  subtotal_minor: number;
  tax_total_minor: number;
  discount_total_minor: number;
  grand_total_minor: number;
  created_at: string;
}

export interface PaymentIntentDTO {
  id: string;
  tenant_id: string;
  branch_id: string;
  bill_id: string;
  amount_minor: number;
  currency_code: string;
  status: IntentStatus;
  payment_method: PaymentMethod;
  idempotency_key: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface SettlementAttemptDTO {
  id: string;
  tenant_id: string;
  payment_intent_id: string;
  attempt_number: number;
  status: 'processing' | 'succeeded' | 'failed';
  gateway_reference: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettlementDTO {
  id: string;
  tenant_id: string;
  branch_id: string;
  bill_id: string;
  payment_intent_id: string | null;
  amount_minor: number;
  currency_code: string;
  settled_at: string;
  processed_by: string | null;
  created_at: string;
}

export interface PaymentTransactionDTO {
  id: string;
  tenant_id: string;
  branch_id: string;
  settlement_id: string;
  payment_method: PaymentMethod;
  amount_minor: number;
  currency_code: string;
  gateway_ref: string | null;
  gateway_payload: any | null;
  status: PaymentStatus;
  created_at: string;
}

export interface RefundDTO {
  id: string;
  tenant_id: string;
  branch_id: string;
  bill_id: string;
  payment_transaction_id: string | null;
  refund_amount_minor: number;
  currency_code: string;
  reason: string;
  idempotency_key: string | null;
  gateway_ref: string | null;
  issued_by: string | null;
  created_at: string;
}

export interface SplitAllocationDTO {
  id: string;
  tenant_id: string;
  bill_id: string;
  split_bill_id: string;
  bill_item_id: string | null;
  allocated_quantity: number | null;
  allocated_percentage: number | null;
  amount_minor: number;
  created_at: string;
}

export interface ReceiptSnapshotDTO {
  id: string;
  tenant_id: string;
  branch_id: string;
  bill_id: string;
  receipt_number: string;
  frozen_payload: any;
  created_at: string;
}

export interface FinancialEventDTO {
  id: string;
  tenant_id: string;
  branch_id: string;
  sequence_number: number;
  event_type: string;
  aggregate_id: string;
  aggregate_type: string;
  payload: any;
  created_at: string;
}
