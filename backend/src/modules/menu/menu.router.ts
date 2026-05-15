// ============================================================
// src/modules/menu/menu.router.ts
// Route definitions for the entire menu foundation module.
// All routes are tenant-scoped. Branch-scoped routes explicitly
// require branch params that are validated against the user's context.
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireTenantAccess,
  requireMinRole,
  requireBranchAccess,
} from '../../middleware/auth.middleware';
import { requirePermissions } from '../../middleware/rbac.middleware';
import { ROLES } from '../../types/rbac.types';
import { PERMISSIONS } from '../../types/rbac.types';
import { validate } from '../../shared/utils/validation.utils';
import { formatSuccess } from '../../shared/utils/response-formatter';
import {
  CreateMenuCategorySchema,
  UpdateMenuCategorySchema,
  SetCategoryBranchVisibilitySchema,
  CreateMenuItemSchema,
  UpdateMenuItemSchema,
  LinkModifierGroupsSchema,
  CreateModifierGroupSchema,
  UpdateModifierGroupSchema,
  CreateModifierOptionSchema,
  UpdateModifierOptionSchema,
  SetBranchItemOverrideSchema,
  SetBranchModifierOptionOverrideSchema,
  SetBranchModifierGroupOverrideSchema,
  CreateAvailabilityScheduleSchema,
  CreateTemporaryDisablementSchema,
  MenuItemListQuerySchema,
  BranchMenuQuerySchema,
} from './menu.validators';
import {
  getCategoryTree,
  getVisibleCategoriesForBranch,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
  setCategoryVisibilityForBranch,
  listMenuItems,
  getMenuItemById,
  createNewMenuItem,
  updateExistingMenuItem,
  deleteMenuItem,
  linkModifierGroupsToItem,
  setBranchItemOverride,
  setBranchModifierOptionOverride,
  setBranchModifierGroupOverride,
  getEffectiveMenuForBranch,
  createNewModifierGroup,
  updateExistingModifierGroup,
  addOptionToGroup,
  updateModifierOptionData,
} from './services/menu.service';
import {
  getSchedulesForItem,
  createAvailabilitySchedule,
  deleteAvailabilitySchedule,
  temporarilyDisableItem,
  reEnableItem,
  getActiveDisablementsForBranch,
} from './services/availability.service';

const router = Router({ mergeParams: true });
// Routes are mounted at /api/tenants/:tenantId/menu

// ─── Auth applied to all routes ───────────────────────────────
router.use(authenticate);
router.use(requireTenantAccess('tenantId'));

// ─── Category Routes ──────────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/categories - tree of all categories */
router.get('/categories', async (req, res, next) => {
  try {
    const tree = await getCategoryTree(req.params.tenantId);
    res.json(formatSuccess(tree));
  } catch (err) { next(err); }
});

/** GET /api/tenants/:tenantId/menu/categories/branch/:branchId */
router.get('/categories/branch/:branchId',
  requireBranchAccess('branchId'),
  async (req, res, next) => {
    try {
      const categories = await getVisibleCategoriesForBranch(
        req.params.tenantId,
        req.params.branchId
      );
      res.json(formatSuccess(categories));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/categories */
router.post('/categories',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto      = validate(CreateMenuCategorySchema, req.body);
      const category = await createMenuCategory(req.params.tenantId, dto, req.context.userId);
      res.status(201).json(formatSuccess(category));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/categories/:categoryId */
router.patch('/categories/:categoryId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto      = validate(UpdateMenuCategorySchema, req.body);
      const category = await updateMenuCategory(req.params.tenantId, req.params.categoryId, dto);
      res.json(formatSuccess(category));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/categories/:categoryId */
router.delete('/categories/:categoryId',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      await deleteMenuCategory(req.params.tenantId, req.params.categoryId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/categories/:categoryId/visibility */
router.put('/categories/:categoryId/visibility',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto = validate(SetCategoryBranchVisibilitySchema, req.body);
      await setCategoryVisibilityForBranch(req.params.tenantId, req.params.categoryId, dto);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ─── Menu Item Routes ─────────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/items */
router.get('/items', async (req, res, next) => {
  try {
    const query  = validate(MenuItemListQuerySchema, req.query);
    const result = await listMenuItems(req.params.tenantId, query);
    res.json(formatSuccess(result));
  } catch (err) { next(err); }
});

/** GET /api/tenants/:tenantId/menu/items/:itemId */
router.get('/items/:itemId', async (req, res, next) => {
  try {
    const item = await getMenuItemById(req.params.tenantId, req.params.itemId);
    res.json(formatSuccess(item));
  } catch (err) { next(err); }
});

/** POST /api/tenants/:tenantId/menu/items */
router.post('/items',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto  = validate(CreateMenuItemSchema, req.body);
      const item = await createNewMenuItem(req.params.tenantId, dto, req.context.userId);
      res.status(201).json(formatSuccess(item));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/items/:itemId */
router.patch('/items/:itemId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto  = validate(UpdateMenuItemSchema, req.body);
      const item = await updateExistingMenuItem(req.params.tenantId, req.params.itemId, dto);
      res.json(formatSuccess(item));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/items/:itemId */
router.delete('/items/:itemId',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      await deleteMenuItem(req.params.tenantId, req.params.itemId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/items/:itemId/modifiers */
router.put('/items/:itemId/modifiers',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto = validate(LinkModifierGroupsSchema, req.body);
      await linkModifierGroupsToItem(req.params.tenantId, req.params.itemId, dto.modifier_group_ids);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ─── Branch-specific effective menu ──────────────────────────

/** GET /api/tenants/:tenantId/menu/branch/:branchId */
router.get('/branch/:branchId',
  requireBranchAccess('branchId'),
  async (req, res, next) => {
    try {
      const query  = validate(BranchMenuQuerySchema, { ...req.query, branch_id: req.params.branchId });
      const result = await getEffectiveMenuForBranch(req.params.tenantId, query);
      res.json(formatSuccess(result));
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/branch/:branchId/items/:itemId/override */
router.put('/branch/:branchId/items/:itemId/override',
  requireBranchAccess('branchId'),
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto = validate(SetBranchItemOverrideSchema, req.body);
      await setBranchItemOverride(req.params.tenantId, req.params.branchId, req.params.itemId, dto);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/branch/:branchId/modifier-options/:optionId/override */
router.put('/branch/:branchId/modifier-options/:optionId/override',
  requireBranchAccess('branchId'),
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto = validate(SetBranchModifierOptionOverrideSchema, req.body);
      await setBranchModifierOptionOverride(req.params.tenantId, req.params.branchId, req.params.optionId, dto);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/branch/:branchId/modifier-groups/:groupId/override */
router.put('/branch/:branchId/modifier-groups/:groupId/override',
  requireBranchAccess('branchId'),
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto = validate(SetBranchModifierGroupOverrideSchema, req.body);
      await setBranchModifierGroupOverride(req.params.tenantId, req.params.branchId, req.params.groupId, dto);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ─── Modifier Group Routes ────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/modifier-groups */
router.get('/modifier-groups',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  async (req, res, next) => {
    try {
      const { findModifierGroupsByTenant } = await import('./repositories/modifier.repository');
      const groups = await findModifierGroupsByTenant(req.params.tenantId);
      res.json(formatSuccess(groups));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/modifier-groups */
router.post('/modifier-groups',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto   = validate(CreateModifierGroupSchema, req.body);
      const group = await createNewModifierGroup(req.params.tenantId, dto);
      res.status(201).json(formatSuccess(group));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/modifier-groups/:groupId */
router.patch('/modifier-groups/:groupId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto   = validate(UpdateModifierGroupSchema, req.body);
      const group = await updateExistingModifierGroup(req.params.tenantId, req.params.groupId, dto);
      res.json(formatSuccess(group));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/modifier-groups/:groupId/options */
router.post('/modifier-groups/:groupId/options',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto    = validate(CreateModifierOptionSchema, { ...req.body, modifier_group_id: req.params.groupId });
      const option = await addOptionToGroup(req.params.tenantId, dto);
      res.status(201).json(formatSuccess(option));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/modifier-options/:optionId */
router.patch('/modifier-options/:optionId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto    = validate(UpdateModifierOptionSchema, req.body);
      const option = await updateModifierOptionData(req.params.tenantId, req.params.optionId, dto);
      res.json(formatSuccess(option));
    } catch (err) { next(err); }
  }
);

// ─── Availability Routes ──────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/items/:itemId/schedules */
router.get('/items/:itemId/schedules', async (req, res, next) => {
  try {
    const schedules = await getSchedulesForItem(req.params.tenantId, req.params.itemId);
    res.json(formatSuccess(schedules));
  } catch (err) { next(err); }
});

/** POST /api/tenants/:tenantId/menu/items/:itemId/schedules */
router.post('/items/:itemId/schedules',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto      = validate(CreateAvailabilityScheduleSchema, req.body);
      const schedule = await createAvailabilitySchedule(req.params.tenantId, req.params.itemId, dto);
      res.status(201).json(formatSuccess(schedule));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/schedules/:scheduleId */
router.delete('/schedules/:scheduleId',
  requireMinRole(ROLES.MANAGER),
  async (req, res, next) => {
    try {
      await deleteAvailabilitySchedule(req.params.tenantId, req.params.scheduleId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/items/:itemId/disable  — "86 this item" */
router.post('/items/:itemId/disable',
  requireBranchAccess('branchId'), // branch_id comes from body (validated in dto)
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      const dto         = validate(CreateTemporaryDisablementSchema, req.body);
      const disablement = await temporarilyDisableItem(
        req.params.tenantId, req.params.itemId, dto, req.context.userId
      );
      res.status(201).json(formatSuccess(disablement));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/items/:itemId/disable/:branchId — re-enable */
router.delete('/items/:itemId/disable/:branchId',
  requireBranchAccess('branchId'),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req, res, next) => {
    try {
      await reEnableItem(req.params.tenantId, req.params.itemId, req.params.branchId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/branch/:branchId/disablements */
router.get('/branch/:branchId/disablements',
  requireBranchAccess('branchId'),
  async (req, res, next) => {
    try {
      const disablements = await getActiveDisablementsForBranch(
        req.params.tenantId, req.params.branchId
      );
      res.json(formatSuccess(disablements));
    } catch (err) { next(err); }
  }
);

export { router as menuRouter };
