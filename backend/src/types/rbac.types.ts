// ============================================================
// src/types/rbac.types.ts
// Single source of truth for all role and permission constants.
// ============================================================

// ─── Roles ──────────────────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN:      'SUPER_ADMIN',
  RESTAURANT_ADMIN: 'RESTAURANT_ADMIN',
  MANAGER:          'MANAGER',
  CASHIER:          'CASHIER',
  SERVER:           'SERVER',
  KITCHEN:          'KITCHEN',
  CUSTOMER_SUPPORT: 'CUSTOMER_SUPPORT',
  // Legacy — maps to SERVER/CASHIER depending on context
  STAFF:            'STAFF',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Numeric hierarchy for minimum-role guards.
 * Higher number = more privilege. SUPER_ADMIN always wins.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN:      100,
  RESTAURANT_ADMIN:  50,
  MANAGER:           40,
  CUSTOMER_SUPPORT:  25,
  CASHIER:           20,
  SERVER:            15,
  KITCHEN:           10,
  STAFF:             10,
};

// ─── Permissions ────────────────────────────────────────────
export const PERMISSIONS = {
  // Menu
  MANAGE_MENU:         'MANAGE_MENU',
  VIEW_MENU:           'VIEW_MENU',
  MANAGE_VARIANTS:     'MANAGE_VARIANTS',

  // Orders
  VIEW_ORDERS:         'VIEW_ORDERS',
  CREATE_ORDER:        'CREATE_ORDER',
  CANCEL_ORDER:        'CANCEL_ORDER',
  ADVANCE_ORDER:       'ADVANCE_ORDER',
  VOID_ORDER_ITEM:     'VOID_ORDER_ITEM',

  // Tables
  MANAGE_TABLES:       'MANAGE_TABLES',
  VIEW_TABLES:         'VIEW_TABLES',
  OPEN_TABLE:          'OPEN_TABLE',
  CLOSE_TABLE:         'CLOSE_TABLE',
  MERGE_TABLES:        'MERGE_TABLES',

  // Billing
  HANDLE_BILLING:      'HANDLE_BILLING',
  APPLY_DISCOUNT:      'APPLY_DISCOUNT',
  PROCESS_PAYMENT:     'PROCESS_PAYMENT',
  VOID_BILL:           'VOID_BILL',
  VIEW_PAYMENTS:       'VIEW_PAYMENTS',

  // Staff
  MANAGE_STAFF:        'MANAGE_STAFF',
  VIEW_STAFF:          'VIEW_STAFF',
  MANAGE_ROLES:        'MANAGE_ROLES',

  // Analytics
  VIEW_ANALYTICS:      'VIEW_ANALYTICS',
  EXPORT_REPORTS:      'EXPORT_REPORTS',
  VIEW_ITEM_METRICS:   'VIEW_ITEM_METRICS',

  // System
  MANAGE_SETTINGS:     'MANAGE_SETTINGS',
  MANAGE_DEVICES:      'MANAGE_DEVICES',
  VIEW_AUDIT_LOG:      'VIEW_AUDIT_LOG',
  MANAGE_INTEGRATIONS: 'MANAGE_INTEGRATIONS',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ─── Auth Context (attached to every validated request) ──────
export interface AuthContext {
  id:               string;
  userId:           string;          // alias for id
  tenantId:         string | null;   // null for SUPER_ADMIN
  role:             Role;
  email:            string;
  permissions:      Set<Permission>;
  branchIds:        string[];        // authorized branch IDs
  device_session_id?: string;
  tenant_id?:       string | null;   // alias for backward compatibility
}

// ─── JWT Custom Claims (injected by Supabase Auth Hook) ──────
export interface OrderlliJwtClaims {
  sub:        string;        // auth.users.id
  email:      string;
  tenant_id:  string | null;
  rbac_role:  Role;
  branch_ids: string[];
  iat:        number;
  exp:        number;
}

// ─── DB row types ────────────────────────────────────────────
export interface RolePermissionRow {
  role:       Role;
  permission: Permission;
}
