/**
 * Centralized application constants.
 */
export const Constants = {
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },
  
  AUTH: {
    TOKEN_EXPIRY: '24h',
    SALT_ROUNDS: 10,
    FAILED_LOGIN_LIMIT: 5,
    LOCK_TIME_MINUTES: 15,
  },
  
  TABLES: {
    TENANTS: 'tenants',
    BRANCHES: 'branches',
    PLATFORM_USERS: 'platform_users',
    ADMIN_PROFILES: 'admin_profiles',
    TENANT_USERS: 'tenant_users',
    STAFF: 'staff',
    DEVICES: 'devices',
    QR_SESSIONS: 'qr_sessions',
    DOMAIN_EVENTS: 'domain_events',
  },
  
  STATUS: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    DELETED: 'deleted',
  },
};
