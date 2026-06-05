import { QrRepository } from '../repositories/QrRepository';
import { runtime } from '../../../runtime';

export class QrResolutionService {
  /**
   * Resolves a public QR token, translates errors to specific state codes,
   * normalizes the payload, and logs the telemetry.
   */
  static async resolveAndNormalizeToken(token) {
    const startTime = performance.now();
    
    try {
      const response = await QrRepository.resolvePublicToken(token);
      const latency = performance.now() - startTime;
      
      const body = await response.json();
      
      console.log('[QR]', 'response_payload', body);
      console.log('[QR]', 'tenant', body.data?.tenant);
      console.log('[QR]', 'branch', body.data?.branch);
      console.log('[QR]', 'table', body.data?.table);
      console.log('[QR]', 'guestSession', body.data?.guestSession);

      if (!response.ok || !body.success) {
        if (response.status === 404) {
          if (body.code === 'TABLE_NOT_FOUND') {
            this.logFailure(token, 'TABLE_NOT_FOUND', latency);
            throw new Error('TABLE_NOT_FOUND');
          } else if (body.code === 'BRANCH_NOT_FOUND') {
            this.logFailure(token, 'BRANCH_NOT_FOUND', latency);
            throw new Error('BRANCH_NOT_FOUND');
          } else {
            // Includes QR_NOT_FOUND or any other 404
            this.logFailure(token, 'QR_NOT_FOUND', latency);
            throw new Error('QR_NOT_FOUND');
          }
        }

        if (response.status === 429) {
          this.logFailure(token, 'RATE_LIMITED', latency);
          throw new Error('RATE_LIMITED');
        }

        this.logFailure(token, 'QR_RESOLUTION_FAILED', latency);
        throw new Error('QR_RESOLUTION_FAILED');
      }

      const data = body.data;
      if (!data?.tenant?.id || !data?.branch?.id || !data?.table?.id) {
        this.logFailure(token, 'INVALID_PAYLOAD_STRUCTURE', latency);
        throw new Error('QR_NOT_FOUND');
      }

      // Normalize backend structured payload to expected frontend session contract
      const normalizedSession = {
        tenant_id: data.tenant.id,
        branch_id: data.branch.id,
        table_id: data.table.id,
        table_name: data.table.display_name || data.table.table_number,
        restaurant_name: data.tenant.name,
      };

      // Record success telemetry
      console.info('[QR_TELEMETRY]', 'ROUTING_RESOLVED', {
        token,
        tenantId: normalizedSession.tenant_id,
        branchId: normalizedSession.branch_id,
        tableId: normalizedSession.table_id,
        latencyMs: Math.round(latency)
      });

      return normalizedSession;

    } catch (err) {
      // Re-throw standardized errors
      if (['TABLE_NOT_FOUND', 'BRANCH_NOT_FOUND', 'QR_NOT_FOUND', 'RATE_LIMITED', 'QR_RESOLUTION_FAILED'].includes(err.message)) {
        throw err;
      }
      
      // Handle network errors (including syntax errors from response.json if backend returns 404 HTML)
      const latency = performance.now() - startTime;
      this.logFailure(token, 'NETWORK_ERROR', latency);
      throw new Error('QR_RESOLUTION_FAILED');
    }
  }

  static logFailure(token, reason, latency) {
    console.warn('[QR_TELEMETRY]', 'STATE_TRANSITION_FAILED', {
      token,
      status: 'FAILED',
      reason,
      latencyMs: Math.round(latency)
    });
  }
}
