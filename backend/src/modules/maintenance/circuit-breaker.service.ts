// ============================================================
// src/modules/maintenance/circuit-breaker.service.ts
// Reusable, lightweight Circuit Breaker managing transition states,
// failure ratios, and backoff cooldowns.
// ============================================================

import { circuitLogger } from './observability.logger';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Max consecutive failures before opening
  cooldownPeriodMs: number; // Time in OPEN state before testing HALF_OPEN
  name: string;
}

export class CircuitBreaker {
  private name: string;
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private nextAttemptTimestamp = 0;

  constructor(config: CircuitBreakerConfig) {
    this.name = config.name;
    this.config = config;
  }

  getState(): CircuitState {
    // If state is OPEN but cooldown has passed, transition to HALF_OPEN
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTimestamp) {
      this.transitionTo('HALF_OPEN');
    }
    return this.state;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    circuitLogger.warn(`Circuit breaker state transition`, {
      breakerName: this.name,
      oldState,
      newState,
      consecutiveFailures: this.consecutiveFailures
    });
  }

  /**
   * Executes a protected call through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      circuitLogger.error(`Request rejected: Circuit breaker is OPEN`, undefined, {
        breakerName: this.name,
        cooldownRemainingMs: this.nextAttemptTimestamp - Date.now()
      });
      throw new Error(`Circuit breaker '${this.name}' is OPEN. Request blocked.`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err: any) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state === 'HALF_OPEN' || this.state === 'OPEN') {
      this.transitionTo('CLOSED');
    }
  }

  private onFailure(error: Error): void {
    this.consecutiveFailures++;
    circuitLogger.warn(`Operation failed under circuit protection`, {
      breakerName: this.name,
      consecutiveFailures: this.consecutiveFailures,
      errorMsg: error.message
    });

    if (this.state === 'CLOSED' && this.consecutiveFailures >= this.config.failureThreshold) {
      this.nextAttemptTimestamp = Date.now() + this.config.cooldownPeriodMs;
      this.transitionTo('OPEN');
    } else if (this.state === 'HALF_OPEN') {
      this.nextAttemptTimestamp = Date.now() + this.config.cooldownPeriodMs;
      this.transitionTo('OPEN');
    }
  }

  reset(): void {
    this.consecutiveFailures = 0;
    this.nextAttemptTimestamp = 0;
    this.transitionTo('CLOSED');
  }
}

// Map of named circuit breakers
const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker({
      name,
      failureThreshold: config?.failureThreshold ?? 3,
      cooldownPeriodMs: config?.cooldownPeriodMs ?? 30000 // default 30s
    }));
  }
  return breakers.get(name)!;
}
