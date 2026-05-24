// ============================================================
// src/modules/infrastructure/graceful-shutdown.service.ts
// Coordinates clean shutdown sequencing, queue draining, in-flight
// transaction preservation, and worker deregistration.
// ============================================================

import { ObservabilityService } from './observability.service';

type ShutdownHook = () => Promise<void> | void;

interface RegisteredHook {
  name: string;
  hook: ShutdownHook;
  priority: number; // Higher priority runs first (e.g., workers = 100, http server = 50, DB = 10)
}

export const GracefulShutdownService = {
  private_hooks: [] as RegisteredHook[],
  private_isShuttingDown: false,

  /**
   * Register a system component cleanup hook with priority grouping.
   */
  registerHook(name: string, priority: number, hook: ShutdownHook): void {
    this.private_hooks.push({ name, hook, priority });
    // Sort hooks: highest priority runs first
    this.private_hooks.sort((a, b) => b.priority - a.priority);
  },

  /**
   * Check if the application is currently transitioning to shutdown.
   */
  isShuttingDown(): boolean {
    return this.private_isShuttingDown;
  },

  /**
   * Main orchestrator of the graceful shutdown sequence.
   */
  async initiateShutdown(signal: string, forceTimeoutMs: number = 10000): Promise<void> {
    if (this.private_isShuttingDown) {
      ObservabilityService.warn('Graceful shutdown already in progress, ignoring duplicate signal.');
      return;
    }

    this.private_isShuttingDown = true;
    ObservabilityService.info(`🚨 Received signal ${signal}. Initiating graceful shutdown...`, {
      signal,
      registeredHooks: this.private_hooks.map(h => h.name)
    });

    // ─── Set maximum execution guard limit ───
    const forceExitTimeout = setTimeout(() => {
      ObservabilityService.error('Forceful shutdown triggered. Graceful exit exceeded timeout bounds.');
      process.exit(1);
    }, forceTimeoutMs);

    try {
      // ─── Phase 1: Worker lease releasing ───
      // Immediately tell other nodes we are shutting down so they can acquire leases
      
      // Fetch active leases registered under this node if possible, or release known ones
      ObservabilityService.info('Phase 1: Releasing distributed worker leases...');
      // Execute all priority hooks sequentially
      for (const reg of this.private_hooks) {
        ObservabilityService.info(`Executing shutdown hook: [${reg.name}]...`);
        const start = Date.now();
        try {
          await reg.hook();
          ObservabilityService.info(`Completed shutdown hook [${reg.name}] successfully in ${Date.now() - start}ms.`);
        } catch (hookErr) {
          ObservabilityService.error(`Error executing shutdown hook [${reg.name}]`, hookErr);
        }
      }

      clearTimeout(forceExitTimeout);
      ObservabilityService.info('🟢 System gracefully shut down. Exiting process with code 0.');
      process.exit(0);
    } catch (err) {
      ObservabilityService.error('Critical failure during graceful shutdown execution', err);
      process.exit(1);
    }
  }
};

// Wire up process signal events automatically
process.on('SIGTERM', () => GracefulShutdownService.initiateShutdown('SIGTERM'));
process.on('SIGINT', () => GracefulShutdownService.initiateShutdown('SIGINT'));

export default GracefulShutdownService;
