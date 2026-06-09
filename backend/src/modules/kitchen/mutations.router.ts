import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMutationEnvelope } from '../../middleware/mutation.middleware';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as kitchenService from './kitchen.service';
import * as ordersService from '../orders/orders.service';
import { updateMutationAuditStatus } from '../idempotency/mutation-audit.repository';
import type { KitchenOrderStatus } from './kitchen.repository';

const router: Router = Router({ mergeParams: true });

function formatMutationResponse(res: Response, status: number, data: any, ctx: any) {
  res.status(status).json({
    success: true,
    data,
    mutation_ack: {
      mutation_id: ctx.mutation_id,
      acknowledged_at: new Date().toISOString(),
      server_cart_revision: ctx.expected_cart_revision,
    }
  });
}

router.post('/', authenticate, requireMutationEnvelope(), async (req: any, res: Response, next: any) => {
  const ctx = req.mutationContext!;
  try {
    // Debug logging
    console.log('[Kitchen Mutations] Received mutation:', {
      mutationId: ctx.mutation_id,
      body: req.body,
      headers: {
        tenantId: req.headers['x-tenant-id'],
        contextTenantId: req.context?.tenant_id
      }
    });

    const tenantId = req.headers['x-tenant-id'] as string || req.context?.tenant_id;
    if (!tenantId) {
      throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
    }

    const { type, orderId } = req.body;
    if (!orderId) {
      console.error('[Kitchen Mutations] Missing orderId in payload:', req.body);
      throw new AppError('orderId is required in mutation payload', 400, ErrorCode.VALIDATION_ERROR);
    }

    let ticket;
    let targetStatus: KitchenOrderStatus | null = null;

    if (type === 'KITCHEN_MARK_PREPARING') {
      targetStatus = 'preparing';
    } else if (type === 'KITCHEN_MARK_READY' || type === 'KITCHEN_BUMP_TICKET') {
      targetStatus = 'ready';
    } else if (type === 'KITCHEN_RECALL_TICKET') {
      targetStatus = 'preparing';
    } else if (type === 'KITCHEN_REJECT_ORDER') {
       const ticketDetails = await kitchenService.getKitchenOrderTicket(tenantId, orderId);
       if (!ticketDetails) throw new AppError('Ticket not found', 404, ErrorCode.NOT_FOUND);

       const parentOrder = await ordersService.transitionOrderStatus({
         tenantId,
         orderId: ticketDetails.order_id,
         targetStatus: 'cancelled',
         versionNum: 1, 
         userId: req.context?.id,
         reason: 'Rejected by Kitchen',
         additionalFields: { cancellation_reason: 'Rejected by Kitchen' }
       });
       void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
       return formatMutationResponse(res, 200, { order: parentOrder }, ctx);
    } else {
       throw new AppError(`Unknown mutation type: ${type}`, 400, ErrorCode.VALIDATION_ERROR);
    }

    if (targetStatus) {
       ticket = await kitchenService.transitionKitchenOrderStatus({
         tenantId,
         ticketId: orderId,
         targetStatus,
         versionNum: 1, 
         userId: req.context?.id,
       });
    }

    void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
    formatMutationResponse(res, 200, { ticket }, ctx);
  } catch (err: any) {
    void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_FATAL', err.message);
    next(err);
  }
});

export { router as mutationsRouter };
