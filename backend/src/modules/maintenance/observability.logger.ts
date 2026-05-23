// ============================================================
// src/modules/maintenance/observability.logger.ts
// Structured JSON logger offering event correlation, tracing,
// and lifecycle auditing.
// ============================================================

export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  branchId?: string;
  partitionKey?: string;
  eventId?: string;
  eventType?: string;
  workerName?: string;
  retryCount?: number;
  [key: string]: any;
}

export class StructuredLogger {
  private category: string;

  constructor(category: string) {
    this.category = category;
  }

  private formatMessage(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: LogContext): string {
    const logPayload = {
      timestamp: new Date().toISOString(),
      level,
      category: this.category,
      message,
      context: {
        correlationId: context?.correlationId ?? crypto.randomUUID(),
        ...context
      }
    };
    return JSON.stringify(logPayload);
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage('INFO', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('WARN', message, context));
  }

  error(message: string, error?: any, context?: LogContext): void {
    const errorDetails = error instanceof Error 
      ? { name: error.name, message: error.message, stack: error.stack }
      : { raw: error };

    const payload = this.formatMessage('ERROR', message, {
      ...context,
      error: errorDetails
    });
    console.error(payload);
  }
}

export const workerLogger = new StructuredLogger('QueueWorker');
export const reconcileLogger = new StructuredLogger('Reconciliation');
export const replayLogger = new StructuredLogger('ReplayEngine');
export const circuitLogger = new StructuredLogger('CircuitBreaker');
