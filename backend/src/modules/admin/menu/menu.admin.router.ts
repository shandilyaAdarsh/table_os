// ============================================================
// src/modules/admin/menu/menu.admin.router.ts
// Admin API Router for Menu management.
// Mounted under /api/v1/admin/menu
// ============================================================

import { Router } from 'express';
import { requireMinRole } from '../../../middleware/auth.middleware';
import { requirePermissions } from '../../../middleware/rbac.middleware';
import { ROLES, PERMISSIONS } from '../../../types/rbac.types';
import * as categoryController from './menu-category.admin.controller';
import * as itemController from './menu-item.admin.controller';
import * as modifierController from './menu-modifier.admin.controller';

const router: Router = Router({ mergeParams: true });

// ─── Menu Categories ──────────────────────────────────────────

/** GET /api/v1/admin/menu/categories/tree */
router.get('/categories/tree',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  categoryController.getTree
);

/** GET /api/v1/admin/menu/categories */
router.get('/categories',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  categoryController.getList
);

/** GET /api/v1/admin/menu/categories/:id */
router.get('/categories/:id',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  categoryController.getById
);

/** POST /api/v1/admin/menu/categories */
router.post('/categories',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  categoryController.createCategory
);

/** PUT /api/v1/admin/menu/categories/:id */
router.put('/categories/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  categoryController.updateCategory
);

/** DELETE /api/v1/admin/menu/categories/:id */
router.delete('/categories/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  categoryController.removeCategory
);

/** POST /api/v1/admin/menu/categories/:id/restore */
router.post('/categories/:id/restore',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  categoryController.restoreCategory
);

// ─── Menu Items ───────────────────────────────────────────────

/** GET /api/v1/admin/menu/items */
router.get('/items',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  itemController.getList
);

/** GET /api/v1/admin/menu/items/:id */
router.get('/items/:id',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  itemController.getById
);

/** POST /api/v1/admin/menu/items */
router.post('/items',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  itemController.createItem
);

/** PUT /api/v1/admin/menu/items/:id */
router.put('/items/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  itemController.updateItem
);

/** DELETE /api/v1/admin/menu/items/:id */
router.delete('/items/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  itemController.removeItem
);

/** POST /api/v1/admin/menu/items/:id/restore */
router.post('/items/:id/restore',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  itemController.restoreItem
);

/** PUT /api/v1/admin/menu/items/:id/modifiers */
router.put('/items/:id/modifiers',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  itemController.linkModifiers
);

// ─── Modifiers ────────────────────────────────────────────────

/** GET /api/v1/admin/menu/modifier-groups */
router.get('/modifier-groups',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  modifierController.getGroups
);

/** POST /api/v1/admin/menu/modifier-groups */
router.post('/modifier-groups',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.createGroup
);

/** PUT /api/v1/admin/menu/modifier-groups/:id */
router.put('/modifier-groups/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.updateGroup
);

/** DELETE /api/v1/admin/menu/modifier-groups/:id */
router.delete('/modifier-groups/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.removeGroup
);

/** POST /api/v1/admin/menu/modifier-groups/:id/restore */
router.post('/modifier-groups/:id/restore',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.restoreGroup
);

/** POST /api/v1/admin/menu/modifier-groups/:id/options */
router.post('/modifier-groups/:id/options',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.createOption
);

/** PUT /api/v1/admin/menu/modifier-options/:id */
router.put('/modifier-options/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.updateOption
);

/** DELETE /api/v1/admin/menu/modifier-options/:id */
router.delete('/modifier-options/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.removeOption
);

/** POST /api/v1/admin/menu/modifier-options/:id/restore */
router.post('/modifier-options/:id/restore',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.restoreOption
);

export { router as adminMenuRouter };
