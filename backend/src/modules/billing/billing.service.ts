// ============================================================
// src/modules/billing/billing.service.ts
// Service Facade aggregating and exposing all specialized
// billing, payment, split, and reconciliation sub-services.
// ============================================================

export * from './bill-aggregation.service';
export * from './payment-intent.service';
export * from './settlement-lifecycle.service';
export * from './split-bill.service';
export * from './refund.service';
export * from './financial-projection.service';
export * from './receipt-snapshot.service';
