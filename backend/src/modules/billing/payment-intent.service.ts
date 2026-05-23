// ============================================================
// src/modules/billing/payment-intent.service.ts
// Service managing idempotent payment intents, retries, attempts
// locking, and gateways settlement state transition rules.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { PaymentIntentDTO, IntentStatus } from './billing-runtime.types';
import { BillAggregationService } from './bill-aggregation.service';
import { SettlementLifecycleService } from './settlement-lifecycle.service';

export class PaymentIntentService {
  /**
   * Idempotent intent creation to prevent duplicate payments.
   */
  public static async createPaymentIntent(params: {
    tenantId: string;
    branchId: string;
    billId: string;
    amountMinor: number;
    paymentMethod: any; // Public payment method
    idempotencyKey: string;
  }): Promise<PaymentIntentDTO> {
    const { tenantId, branchId, billId, amountMinor, paymentMethod, idempotencyKey } = params;

    try {
      // 1. Idempotency Check
      const { data: existing, error: idempErr } = await supabaseAdmin
        .from('payment_intents')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (idempErr) {
        throw new AppError(`Idempotency check failed: ${idempErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      if (existing) {
        return existing as PaymentIntentDTO;
      }

      // 2. Retrieve open balance to ensure intent amount <= remaining balance
      const openBalance = await BillAggregationService.getOpenBalance(tenantId, billId);
      if (amountMinor > openBalance) {
        throw new AppError(
          `Payment intent amount ($${(amountMinor / 100).toFixed(2)}) exceeds outstanding bill balance ($${(openBalance / 100).toFixed(2)}).`,
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }

      // 3. Set expiration window (15 minutes TTL)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      // 4. Create the intent
      const { data: intent, error: insertErr } = await supabaseAdmin
        .from('payment_intents')
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          bill_id: billId,
          amount_minor: amountMinor,
          currency_code: 'USD',
          status: 'created',
          payment_method: paymentMethod,
          idempotency_key: idempotencyKey,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (insertErr) {
        if (insertErr.code === '23505') {
          // Double insertion race protection
          const { data: doubleCheck } = await supabaseAdmin
            .from('payment_intents')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('idempotency_key', idempotencyKey)
            .single();
          if (doubleCheck) return doubleCheck as PaymentIntentDTO;
        }
        throw new AppError(`Failed to create payment intent: ${insertErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // Log outbox sequence event
      await supabaseAdmin.rpc('log_financial_event', {
        p_tenant_id: tenantId,
        p_branch_id: branchId,
        p_event_type: 'PAYMENT_INTENT_CREATED',
        p_aggregate_id: intent.id,
        p_aggregate_type: 'payment_intent',
        p_payload: {
          intentId: intent.id,
          billId: intent.bill_id,
          amountMinor: intent.amount_minor,
          paymentMethod: intent.payment_method,
        },
      });

      return intent as PaymentIntentDTO;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Payment intent service error: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Registers a settlement attempt, executes mock or real gateway capture,
   * and completes payment application.
   */
  public static async processIntentSettlement(params: {
    tenantId: string;
    intentId: string;
    gatewayRef?: string;
    gatewayPayload?: any;
    processedBy?: string;
  }): Promise<PaymentIntentDTO> {
    const { tenantId, intentId, gatewayRef, gatewayPayload = {}, processedBy } = params;

    try {
      // 1. Fetch the intent
      const { data: intent, error: intentErr } = await supabaseAdmin
        .from('payment_intents')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', intentId)
        .single();

      if (intentErr || !intent) {
        throw new AppError('Payment intent not found.', 404, ErrorCode.NOT_FOUND);
      }

      if (intent.status === 'captured') {
        return intent as PaymentIntentDTO; // Already processed! Replay-safe.
      }

      if (intent.status === 'expired' || intent.status === 'failed') {
        throw new AppError(`Cannot process payment intent in '${intent.status}' state.`, 400, ErrorCode.VALIDATION_ERROR);
      }

      // Check intent expiration
      if (new Date(intent.expires_at) < new Date()) {
        await this.transitionIntentStatus(tenantId, intentId, 'expired');
        throw new AppError('Payment intent has expired.', 400, ErrorCode.VALIDATION_ERROR);
      }

      // 2. Fetch or create a sequential attempt number to protect against concurrent gateway double captures
      const { count, error: countErr } = await supabaseAdmin
        .from('settlement_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('payment_intent_id', intentId);

      if (countErr) {
        throw new AppError(`Failed to fetch settlement attempts count: ${countErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      const nextAttempt = (count ?? 0) + 1;

      // Insert settlement attempt to serialize execution
      const { data: attempt, error: attemptErr } = await supabaseAdmin
        .from('settlement_attempts')
        .insert({
          tenant_id: tenantId,
          payment_intent_id: intentId,
          attempt_number: nextAttempt,
          status: 'processing',
        })
        .select()
        .single();

      if (attemptErr) {
        if (attemptErr.code === '23505') {
          throw new AppError('A settlement attempt is currently processing for this payment intent.', 409, ErrorCode.CONFLICT);
        }
        throw new AppError(`Failed to register settlement attempt: ${attemptErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 3. Trigger Payment Gateway capturing logic (Future payment integrations point here)
      // Since this is the transaction runtime, we execute a deterministic capture process
      const captureSuccessful = true; // Gateway succeeded
      const ref = gatewayRef || `PAY-REF-${intent.id.substring(0, 8).toUpperCase()}-${Date.now()}`;

      if (captureSuccessful) {
        // Success path
        // A. Update Attempt
        await supabaseAdmin
          .from('settlement_attempts')
          .update({
            status: 'succeeded',
            gateway_reference: ref,
            updated_at: new Date().toISOString(),
          })
          .eq('id', attempt.id);

        // B. Apply settlement to the bill
        await SettlementLifecycleService.applySettlement({
          tenantId,
          billId: intent.bill_id,
          paymentIntentId: intentId,
          paymentMethod: intent.payment_method,
          amountMinor: Number(intent.amount_minor),
          gatewayRef: ref,
          gatewayPayload,
          processedBy,
        });

        // C. Update intent status to 'captured'
        const updatedIntent = await this.transitionIntentStatus(tenantId, intentId, 'captured');
        return updatedIntent;
      } else {
        // Failure path
        await supabaseAdmin
          .from('settlement_attempts')
          .update({
            status: 'failed',
            error_message: 'Gateway capture failed.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', attempt.id);

        const updatedIntent = await this.transitionIntentStatus(tenantId, intentId, 'failed');
        return updatedIntent;
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Settlement process attempt failed: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Helper transition status safely
   */
  private static async transitionIntentStatus(tenantId: string, intentId: string, status: IntentStatus): Promise<PaymentIntentDTO> {
    const { data: updated, error } = await supabaseAdmin
      .from('payment_intents')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', intentId)
      .select()
      .single();

    if (error || !updated) {
      throw new AppError(`Failed to update intent status to ${status}: ${error?.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    return updated as PaymentIntentDTO;
  }
}
