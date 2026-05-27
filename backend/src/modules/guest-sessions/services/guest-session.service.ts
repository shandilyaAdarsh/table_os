import { GuestSessionRepository } from '../repositories/guest-session.repository';
import type { GuestSession } from '../guest-sessions.types';
import type { CreateGuestSessionDto } from '../guest-sessions.dtos';
import { logger } from '../../../shared/utils/logger';

export class GuestSessionService {
  /**
   * Resolves, rehydrates, or creates a guest session safely.
   */
  static async resolveOrCreateSession(dto: CreateGuestSessionDto): Promise<GuestSession> {
    // 1. Check if there is an active session on the table
    const activeSession = await GuestSessionRepository.findActiveSessionByTable(
      dto.tenant_id,
      dto.table_id
    );

    if (activeSession) {
      // 2. Reconnect/continuity check: does the fingerprint match?
      const isRecognizedDevice = activeSession.device_fingerprints.includes(dto.device_fingerprint);

      if (isRecognizedDevice) {
        logger.info(
          { sessionId: activeSession.id, tableId: dto.table_id },
          'Reconnecting recognized device to active guest session'
        );
        return activeSession;
      }

      // If a different device attempts to connect, we link it as a multi-device session (device continuity support)
      logger.info(
        { sessionId: activeSession.id, tableId: dto.table_id },
        'Linking new device fingerprint to active guest session'
      );
      return GuestSessionRepository.addFingerprintToSession(
        dto.tenant_id,
        activeSession.id,
        dto.device_fingerprint,
        activeSession.device_fingerprints
      );
    }

    // 3. No active session. Construct new session with deterministic expiration (e.g. 4 hours from now)
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    logger.info({ tableId: dto.table_id }, 'Creating new table-bound guest session');
    
    return GuestSessionRepository.createSession({
      ...dto,
      expires_at: expiresAt,
    });
  }

  static async validateSession(tenantId: string, sessionId: string, fingerprint: string): Promise<boolean> {
    const session = await GuestSessionRepository.findSessionById(tenantId, sessionId);
    if (!session) return false;
    
    const isExpired = new Date(session.expires_at).getTime() < Date.now();
    if (isExpired || session.status !== 'ACTIVE') {
      return false;
    }

    // Ensure fingerprint is registered on this session
    return session.device_fingerprints.includes(fingerprint);
  }

  static async completeSession(tenantId: string, sessionId: string): Promise<GuestSession> {
    return GuestSessionRepository.updateSessionStatus(tenantId, sessionId, 'COMPLETED');
  }

  static async triggerCleanup(): Promise<number> {
    return GuestSessionRepository.cleanupAbandonedSessions();
  }
}
