// ============================================================
// src/modules/kitchen/kitchen-sla.service.ts
// Kitchen SLA Service tracking ticket thresholds and escalations.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';

export interface SLAEvaluationResult {
  ticketId: string;
  orderNumber: string;
  elapsedSeconds: number;
  thresholdSeconds: number;
  slaStatus: 'NORMAL' | 'WARNING' | 'BREACHED';
  priorityEscalated: boolean;
}

export class KitchenSLAService {
  /**
   * Scans all active kitchen tickets in a branch, evaluates their SLA status,
   * fires real-time warning/breach events, and escalates priority for stuck tickets.
   */
  public static async evaluateActiveQueueSLA(
    tenantId: string,
    branchId: string
  ): Promise<SLAEvaluationResult[]> {
    const results: SLAEvaluationResult[] = [];
    const now = new Date().getTime();

    try {
      // 1. Fetch active kitchen orders
      const { data: tickets, error: ticketError } = await supabaseAdmin
        .from('kitchen_orders')
        .select(`
          id,
          priority,
          estimated_prep_seconds,
          created_at,
          status,
          orders (
            order_number
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .in('status', ['pending', 'accepted', 'preparing']);

      if (ticketError) throw ticketError;

      for (const ticket of tickets) {
        const createdAtTime = new Date(ticket.created_at).getTime();
        const elapsedSeconds = Math.floor((now - createdAtTime) / 1000);
        const thresholdSeconds = ticket.estimated_prep_seconds || 600; // default 10 minutes (600s)

        let slaStatus: 'NORMAL' | 'WARNING' | 'BREACHED' = 'NORMAL';
        let priorityEscalated = false;

        const warningThreshold = Math.floor(thresholdSeconds * 0.75); // 75% limit

        if (elapsedSeconds >= thresholdSeconds) {
          slaStatus = 'BREACHED';
        } else if (elapsedSeconds >= warningThreshold) {
          slaStatus = 'WARNING';
        }

        // 2. SLA Escalation Engine: Auto-escalate priority of breached/stuck tickets
        // If ticket is breached and priority is still at standard default (>= 10),
        // atomically lower priority value (which bubbles it to the top of aged sorted queues).
        if (slaStatus === 'BREACHED' && ticket.priority >= 10) {
          const escalatedPriority = 5; // Escalated high priority tier
          
          const { error: updateErr } = await supabaseAdmin
            .from('kitchen_orders')
            .update({ priority: escalatedPriority, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('id', ticket.id);

          if (updateErr) {
            logger.error({ updateErr, ticketId: ticket.id }, '[KitchenSLA] Failed to escalate priority.');
          } else {
            priorityEscalated = true;
            logger.warn(
              { ticketId: ticket.id, orderNumber: (ticket.orders as any)?.order_number, oldPriority: ticket.priority },
              '[KitchenSLA] Ticket priority automatically escalated due to SLA breach.'
            );

            // Log escalation operational event in sequence
            const { data: sequenceNum, error: rpcError } = await supabaseAdmin.rpc('log_branch_operational_event', {
              p_tenant_id: tenantId,
              p_branch_id: branchId,
              p_event_type: 'KDS_ORDER_PRIORITY_ESCALATED',
              p_aggregate_id: ticket.id,
              p_aggregate_type: 'KitchenOrder',
              p_payload: {
                kitchenOrderId: ticket.id,
                oldPriority: ticket.priority,
                newPriority: escalatedPriority,
                reason: 'SLA preparation limit exceeded.',
              },
            });

            if (rpcError) {
              logger.error({ rpcError }, '[KitchenSLA] Error registering priority escalation sequence.');
            }

            // Publish escalation to real-time broadcast channel
            try {
              const topic = RealtimePublisherService.getBranchTopic(tenantId, branchId);
              const broadcastChannel = supabaseAdmin.channel(topic);
              await broadcastChannel.send({
                type: 'broadcast',
                event: 'KDS_TICKET_ESCALATED',
                payload: {
                  sequenceNumber: Number(sequenceNum || 0),
                  branchId,
                  eventType: 'KDS_TICKET_ESCALATED',
                  timestamp: new Date().toISOString(),
                  payload: {
                    kitchenOrderId: ticket.id,
                    priority: escalatedPriority,
                  },
                },
              });
              await supabaseAdmin.removeChannel(broadcastChannel);
            } catch (realtimeErr: any) {
              logger.error({ realtimeErr: realtimeErr.message }, '[KitchenSLA] Broadcast escalation error.');
            }
          }
        }

        results.push({
          ticketId: ticket.id,
          orderNumber: (ticket.orders as any)?.order_number || 'UNKNOWN',
          elapsedSeconds,
          thresholdSeconds,
          slaStatus,
          priorityEscalated,
        });
      }
    } catch (err: any) {
      logger.error({ err: err.message, branchId }, '[KitchenSLA] Error evaluating active KDS SLA timers.');
    }

    return results;
  }
}
