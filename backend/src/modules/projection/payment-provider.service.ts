import crypto from 'crypto';
import { logger } from '../../shared/utils/logger';
import { PaymentReconciliationService } from './payment-reconciliation.service';

export class PaymentProviderService {
  /**
   * Cryptographically validates Stripe/Razorpay signature payload to block webhook replay attacks.
   */
  static verifyWebhookSignature(params: {
    rawBody: string;
    signatureHeader: string;
    signingSecret: string;
    provider: 'STRIPE' | 'RAZORPAY';
  }): boolean {
    try {
      if (params.provider === 'STRIPE') {
        // Stripe Signature format: t=timestamp,v1=signature
        const parts = params.signatureHeader.split(',');
        const timestampPart = parts.find(p => p.startsWith('t='));
        const signaturePart = parts.find(p => p.startsWith('v1='));

        if (!timestampPart || !signaturePart) return false;

        const timestamp = timestampPart.split('=')[1];
        const signature = signaturePart.split('=')[1];

        // Webhook replay check: reject payloads older than 5 minutes
        const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
        if (ageSeconds > 300) {
          logger.warn({ ageSeconds }, '[PaymentProvider] Webhook signature older than 5 minutes, rejected');
          return false;
        }

        const signedPayload = `${timestamp}.${params.rawBody}`;
        const expectedSignature = crypto
          .createHmac('sha256', params.signingSecret)
          .update(signedPayload)
          .digest('hex');

        return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
      } else {
        // Razorpay Signature
        const expectedSignature = crypto
          .createHmac('sha256', params.signingSecret)
          .update(params.rawBody)
          .digest('hex');

        return crypto.timingSafeEqual(Buffer.from(params.signatureHeader, 'hex'), Buffer.from(expectedSignature, 'hex'));
      }
    } catch (err: any) {
      logger.error({ err }, 'Webhook signature verification failed');
      return false;
    }
  }

  /**
   * Processes a verified provider callback securely in a replay-safe manner.
   */
  static async processProviderCallback(params: {
    tenantId: string;
    branchId: string;
    orderId: string;
    provider: 'STRIPE' | 'RAZORPAY';
    reference: string;
    amountMinor: number;
    currencyCode: string;
    idempotencyKey: string;
  }): Promise<any> {
    // Generate an absolute SHA-256 hash of the idempotencyKey to prevent webhook replay attacks
    const webhookUniqueKey = crypto.createHash('sha256').update(params.idempotencyKey).digest('hex');

    return PaymentReconciliationService.executeIdempotent(webhookUniqueKey, params.tenantId, async () => {
      logger.info({ reference: params.reference }, '[PaymentProvider] Committing verified webhook payment callback');
      
      const record = await PaymentReconciliationService.recordPayment({
        tenant_id: params.tenantId,
        branch_id: params.branchId,
        order_id: params.orderId,
        payment_provider: params.provider,
        payment_reference: params.reference,
        payment_amount_minor: params.amountMinor,
        currency_code: params.currencyCode,
        idempotency_key: params.idempotencyKey,
        replay_generation: Date.now(),
      });

      return {
        status: 'SUCCESS',
        payment: record,
      };
    });
  }
}
