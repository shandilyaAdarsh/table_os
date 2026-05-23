// ============================================================
// src/modules/kitchen/order-item-workflow.service.ts
// Order Item Workflow Service managing individual item lifecycle.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { logger } from '../../shared/utils/logger';
import { KDSEventOrchestrator } from './kds-event-orchestrator';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';

const VALID_ITEM_TRANSITIONS: Record<string, string[]> = {
  pending: ['preparing', 'completed', 'cancelled'],
  preparing: ['completed', 'cancelled'],
  completed: ['preparing', 'cancelled'],
  cancelled: [],
};

export class OrderItemWorkflowService {
  /**
   * Transitions the preparation status or quantity of a specific kitchen item.
   * Leverages OCC version matching to prevent concurrent write overrides.
   */
  public static async transitionItemStatus(params: {
    tenantId: string;
    branchId: string;
    preparationId: string;
    targetStatus: 'pending' | 'preparing' | 'completed' | 'cancelled';
    completedQuantity?: number;
    versionNum: number;
    userId: string;
  }): Promise<any> {
    const { tenantId, branchId, preparationId, targetStatus, completedQuantity, versionNum, userId } = params;

    // 1. Fetch current item prep record
    const { data: prep, error: fetchError } = await supabaseAdmin
      .from('kitchen_item_preparations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', preparationId)
      .maybeSingle();

    if (fetchError || !prep) {
      throw new AppError('Kitchen preparation item not found.', 404, ErrorCode.NOT_FOUND);
    }

    // 2. Validate state transition rules
    const allowedTransitions = VALID_ITEM_TRANSITIONS[prep.status] || [];
    const isChangingStatus = prep.status !== targetStatus;
    
    if (isChangingStatus && !allowedTransitions.includes(targetStatus)) {
      throw new AppError(
        `Invalid item status transition from '${prep.status}' to '${targetStatus}'.`,
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    // 3. Setup quantity updates (supports partial completion)
    let finalCompletedQuantity = completedQuantity !== undefined ? completedQuantity : prep.completed_quantity;
    
    if (targetStatus === 'completed') {
      finalCompletedQuantity = prep.quantity; // Auto-complete quantity
    } else if (targetStatus === 'cancelled') {
      finalCompletedQuantity = 0;
    }

    if (finalCompletedQuantity > prep.quantity || finalCompletedQuantity < 0) {
      throw new AppError(
        `Completed quantity (${finalCompletedQuantity}) cannot exceed total quantity (${prep.quantity}) or be negative.`,
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    // Adjust status dynamically based on partial quantities
    let finalStatus = targetStatus;
    if (finalCompletedQuantity === prep.quantity && prep.quantity > 0 && isChangingStatus) {
      finalStatus = 'completed';
    } else if (finalCompletedQuantity > 0 && finalCompletedQuantity < prep.quantity && finalStatus === 'pending') {
      finalStatus = 'preparing';
    }

    // 4. Update preparation item atomically using compare-and-swap
    const updates: any = {
      status: finalStatus,
      completed_quantity: finalCompletedQuantity,
      updated_at: new Date().toISOString(),
    };

    if (finalStatus === 'preparing' && !prep.prepared_at) {
      updates.prepared_at = new Date().toISOString();
    }
    if (finalStatus === 'completed' && !prep.completed_at) {
      updates.completed_at = new Date().toISOString();
    }

    const { data: updatedPrep, error: updateError } = await supabaseAdmin
      .from('kitchen_item_preparations')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('id', preparationId)
      .eq('version_num', versionNum)
      .select()
      .maybeSingle();

    if (updateError) {
      throw new AppError(`Database update failed: ${updateError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    if (!updatedPrep) {
      throw new AppError(
        'Concurrent modification detected. Preparation item version mismatch.',
        409,
        ErrorCode.CONFLICT
      );
    }

    logger.info(
      { preparationId, status: finalStatus, completedQuantity: finalCompletedQuantity },
      '[OrderItemWorkflow] Successfully transitioned preparation item state.'
    );

    // 5. Query Sequence ID for real-time publishing
    // Invoke RPC function in PostgreSQL to log and get sequence ID
    const { data: sequenceNum, error: rpcError } = await supabaseAdmin.rpc('log_branch_operational_event', {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_event_type: 'KDS_ITEM_TRANSITIONED',
      p_aggregate_id: preparationId,
      p_aggregate_type: 'KitchenItemPreparation',
      p_payload: {
        preparationId,
        kitchenOrderId: updatedPrep.kitchen_order_id,
        status: finalStatus,
        completedQuantity: finalCompletedQuantity,
        versionNum: updatedPrep.version_num,
        actorId: userId,
      },
    });

    if (rpcError) {
      logger.error({ rpcError }, '[OrderItemWorkflow] Error registering operational event sequence.');
    }

    // Publish KDS state update via RealtimePublisherService
    try {
      const topic = RealtimePublisherService.getBranchTopic(tenantId, branchId);
      const broadcastChannel = supabaseAdmin.channel(topic);
      await broadcastChannel.send({
        type: 'broadcast',
        event: 'KDS_ITEM_UPDATED',
        payload: {
          sequenceNumber: Number(sequenceNum || 0),
          branchId,
          eventType: 'KDS_ITEM_UPDATED',
          timestamp: new Date().toISOString(),
          payload: {
            preparationId,
            kitchenOrderId: updatedPrep.kitchen_order_id,
            status: finalStatus,
            completedQuantity: finalCompletedQuantity,
            versionNum: updatedPrep.version_num,
          },
        },
      });
      await supabaseAdmin.removeChannel(broadcastChannel);
    } catch (realtimeErr: any) {
      logger.error({ realtimeErr: realtimeErr.message }, '[OrderItemWorkflow] Realtime broadcast error.');
    }

    // 6. Recalculate and reconcile aggregate order readiness rollup
    await this.recalculateOrderReadiness(tenantId, branchId, updatedPrep.kitchen_order_id, userId);

    return updatedPrep;
  }

  /**
   * Evaluates completion progress for all items in a ticket.
   * If all required items are in completed or cancelled states, the parent ticket transitions to 'ready'.
   */
  private static async recalculateOrderReadiness(
    tenantId: string,
    branchId: string,
    kitchenOrderId: string,
    userId: string
  ): Promise<void> {
    try {
      // Fetch parent kitchen ticket
      const { data: ticket, error: ticketErr } = await supabaseAdmin
        .from('kitchen_orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', kitchenOrderId)
        .single();

      if (ticketErr || !ticket) {
        logger.error({ ticketErr, kitchenOrderId }, '[OrderItemWorkflow] Failed to resolve parent ticket for rollup.');
        return;
      }

      // If the parent ticket is already in a terminal state (ready/delivered), skip
      if (ticket.status === 'ready' || ticket.status === 'delivered') {
        return;
      }

      // Fetch all preparations for this kitchen order
      const { data: preps, error: prepsErr } = await supabaseAdmin
        .from('kitchen_item_preparations')
        .select('status')
        .eq('tenant_id', tenantId)
        .eq('kitchen_order_id', kitchenOrderId);

      if (prepsErr || !preps) {
        logger.error({ prepsErr, kitchenOrderId }, '[OrderItemWorkflow] Failed to fetch item preps.');
        return;
      }

      const totalItems = preps.length;
      const terminalItems = preps.filter(
        (p) => p.status === 'completed' || p.status === 'cancelled'
      ).length;

      // Rule: Aggregate readiness rolls up when all items are terminal
      if (totalItems > 0 && totalItems === terminalItems) {
        logger.info(
          { kitchenOrderId, terminalItems, totalItems },
          '[OrderItemWorkflow] All items terminal. Automatically rolling parent ticket to READY.'
        );

        await KDSEventOrchestrator.transitionKitchenTicket({
          tenantId,
          ticketId: kitchenOrderId,
          targetStatus: 'ready',
          versionNum: ticket.version_num,
          userId,
        });

        // Log KDS order status rollup event in monotonic sequence
        const { data: sequenceNum, error: rpcError } = await supabaseAdmin.rpc('log_branch_operational_event', {
          p_tenant_id: tenantId,
          p_branch_id: branchId,
          p_event_type: 'KDS_ORDER_ROLLED_UP',
          p_aggregate_id: kitchenOrderId,
          p_aggregate_type: 'KitchenOrder',
          p_payload: {
            kitchenOrderId,
            status: 'ready',
            actorId: userId,
          },
        });

        if (rpcError) {
          logger.error({ rpcError }, '[OrderItemWorkflow] Error registering rollup operational event sequence.');
        }

        // Broadcast order ready update
        try {
          const topic = RealtimePublisherService.getBranchTopic(tenantId, branchId);
          const broadcastChannel = supabaseAdmin.channel(topic);
          await broadcastChannel.send({
            type: 'broadcast',
            event: 'KDS_TICKET_READY',
            payload: {
              sequenceNumber: Number(sequenceNum || 0),
              branchId,
              eventType: 'KDS_TICKET_READY',
              timestamp: new Date().toISOString(),
              payload: {
                kitchenOrderId,
                status: 'ready',
              },
            },
          });
          await supabaseAdmin.removeChannel(broadcastChannel);
        } catch (realtimeErr: any) {
          logger.error({ realtimeErr: realtimeErr.message }, '[OrderItemWorkflow] Rollup realtime broadcast error.');
        }
      } else if (ticket.status === 'pending' && preps.some((p) => p.status === 'preparing')) {
        // If at least one item has started preparing, move ticket status to 'preparing'
        logger.info(
          { kitchenOrderId },
          '[OrderItemWorkflow] Item in preparation started. Transitioning parent ticket to PREPARING.'
        );

        await KDSEventOrchestrator.transitionKitchenTicket({
          tenantId,
          ticketId: kitchenOrderId,
          targetStatus: 'preparing',
          versionNum: ticket.version_num,
          userId,
        });
      }
    } catch (err: any) {
      logger.error({ err: err.message, kitchenOrderId }, '[OrderItemWorkflow] Unexpected error during readiness recalculation.');
    }
  }
}
