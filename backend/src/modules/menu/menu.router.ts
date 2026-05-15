// ============================================================
// src/modules/menu/menu.router.ts
// Route definitions for the entire menu foundation module.
// All routes are tenant-scoped. Branch-scoped routes explicitly
// require branch params that are validated against the user's context.
// ============================================================

import { Router, type Request } from 'express';
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

const router: Router = Router({ mergeParams: true });

// Routes are mounted at /api/tenants/:tenantId/menu

// ─── Auth applied to all routes ───────────────────────────────
router.use(authenticate);
router.use(requireTenantAccess('tenantId'));

// ─── Category Routes ──────────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/categories - tree of all categories */
router.get('/categories', async (req: Request<{ tenantId: string }>, res, next) => {
  try {
    const tenantId = String(req.params.tenantId);
    const tree = await getCategoryTree(tenantId);
    res.json(formatSuccess(tree));
  } catch (err) { next(err); }
});

/** GET /api/tenants/:tenantId/menu/categories/branch/:branchId */
router.get('/categories/branch/:branchId',
  requireBranchAccess('branchId'),
  async (req: Request<{ tenantId: string; branchId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const branchId = String(req.params.branchId);
      const categories = await getVisibleCategoriesForBranch(tenantId, branchId);
      res.json(formatSuccess(categories));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/categories */
router.post('/categories',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const dto      = validate(CreateMenuCategorySchema, req.body);
      const category = await createMenuCategory(tenantId, dto, req.context.userId);
      res.status(201).json(formatSuccess(category));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/categories/:categoryId */
router.patch('/categories/:categoryId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; categoryId: string }>, res, next) => {
    try {
      const tenantId   = String(req.params.tenantId);
      const categoryId = String(req.params.categoryId);
      const dto        = validate(UpdateMenuCategorySchema, req.body);
      const category   = await updateMenuCategory(tenantId, categoryId, dto);
      res.json(formatSuccess(category));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/categories/:categoryId */
router.delete('/categories/:categoryId',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; categoryId: string }>, res, next) => {
    try {
      const tenantId   = String(req.params.tenantId);
      const categoryId = String(req.params.categoryId);
      await deleteMenuCategory(tenantId, categoryId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/categories/:categoryId/visibility */
router.put('/categories/:categoryId/visibility',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; categoryId: string }>, res, next) => {
    try {
      const tenantId   = String(req.params.tenantId);
      const categoryId = String(req.params.categoryId);
      const dto        = validate(SetCategoryBranchVisibilitySchema, req.body);
      await setCategoryVisibilityForBranch(tenantId, categoryId, dto);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ─── Menu Item Routes ─────────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/items */
router.get('/items', async (req: Request<{ tenantId: string }>, res, next) => {
  try {
    const tenantId = String(req.params.tenantId);
    const query    = validate(MenuItemListQuerySchema, req.query);
    const result   = await listMenuItems(tenantId, query);
    res.json(formatSuccess(result));
  } catch (err) { next(err); }
});

/** GET /api/tenants/:tenantId/menu/items/:itemId */
router.get('/items/:itemId', async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
  try {
    const tenantId = String(req.params.tenantId);
    const itemId   = String(req.params.itemId);
    const item     = await getMenuItemById(tenantId, itemId);
    res.json(formatSuccess(item));
  } catch (err) { next(err); }
});

/** POST /api/tenants/:tenantId/menu/items */
router.post('/items',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const dto      = validate(CreateMenuItemSchema, req.body);
      const item     = await createNewMenuItem(tenantId, dto, req.context.userId);
      res.status(201).json(formatSuccess(item));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/items/:itemId */
router.patch('/items/:itemId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const itemId   = String(req.params.itemId);
      const dto      = validate(UpdateMenuItemSchema, req.body);
      const item     = await updateExistingMenuItem(tenantId, itemId, dto);
      res.json(formatSuccess(item));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/items/:itemId */
router.delete('/items/:itemId',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const itemId   = String(req.params.itemId);
      await deleteMenuItem(tenantId, itemId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/items/:itemId/modifiers */
router.put('/items/:itemId/modifiers',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const itemId   = String(req.params.itemId);
      const dto      = validate(LinkModifierGroupsSchema, req.body);
      await linkModifierGroupsToItem(tenantId, itemId, dto.modifier_group_ids);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ─── Branch-specific effective menu ──────────────────────────

/** GET /api/tenants/:tenantId/menu/branch/:branchId */
router.get('/branch/:branchId',
  requireBranchAccess('branchId'),
  async (req: Request<{ tenantId: string; branchId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const branchId = String(req.params.branchId);
      const query    = validate(BranchMenuQuerySchema, { ...req.query, branch_id: branchId });
      const result   = await getEffectiveMenuForBranch(tenantId, query);
      res.json(formatSuccess(result));
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/branch/:branchId/items/:itemId/override */
router.put('/branch/:branchId/items/:itemId/override',
  requireBranchAccess('branchId'),
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; branchId: string; itemId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const branchId = String(req.params.branchId);
      const itemId   = String(req.params.itemId);
      const dto      = validate(SetBranchItemOverrideSchema, req.body);
      await setBranchItemOverride(tenantId, branchId, itemId, dto);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/branch/:branchId/modifier-options/:optionId/override */
router.put('/branch/:branchId/modifier-options/:optionId/override',
  requireBranchAccess('branchId'),
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; branchId: string; optionId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const branchId = String(req.params.branchId);
      const optionId = String(req.params.optionId);
      const dto      = validate(SetBranchModifierOptionOverrideSchema, req.body);
      await setBranchModifierOptionOverride(tenantId, branchId, optionId, dto);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** PUT /api/tenants/:tenantId/menu/branch/:branchId/modifier-groups/:groupId/override */
router.put('/branch/:branchId/modifier-groups/:groupId/override',
  requireBranchAccess('branchId'),
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; branchId: string; groupId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const branchId = String(req.params.branchId);
      const groupId  = String(req.params.groupId);
      const dto      = validate(SetBranchModifierGroupOverrideSchema, req.body);
      await setBranchModifierGroupOverride(tenantId, branchId, groupId, dto);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ─── Modifier Group Routes ────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/modifier-groups */
router.get('/modifier-groups',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const { findModifierGroupsByTenant } = await import('./repositories/modifier.repository');
      const groups = await findModifierGroupsByTenant(tenantId);
      res.json(formatSuccess(groups));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/modifier-groups */
router.post('/modifier-groups',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const dto      = validate(CreateModifierGroupSchema, req.body);
      const group    = await createNewModifierGroup(tenantId, dto);
      res.status(201).json(formatSuccess(group));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/modifier-groups/:groupId */
router.patch('/modifier-groups/:groupId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; groupId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const groupId  = String(req.params.groupId);
      const dto      = validate(UpdateModifierGroupSchema, req.body);
      const group    = await updateExistingModifierGroup(tenantId, groupId, dto);
      res.json(formatSuccess(group));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/modifier-groups/:groupId/options */
router.post('/modifier-groups/:groupId/options',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; groupId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const groupId  = String(req.params.groupId);
      const dto      = validate(CreateModifierOptionSchema, { ...req.body, modifier_group_id: groupId });
      const option   = await addOptionToGroup(tenantId, dto);
      res.status(201).json(formatSuccess(option));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/modifier-options/:optionId */
router.patch('/modifier-options/:optionId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; optionId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const optionId = String(req.params.optionId);
      const dto      = validate(UpdateModifierOptionSchema, req.body);
      const option   = await updateModifierOptionData(tenantId, optionId, dto);
      res.json(formatSuccess(option));
    } catch (err) { next(err); }
  }
);

// ─── Availability Routes ──────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/items/:itemId/schedules */
router.get('/items/:itemId/schedules', async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
  try {
    const tenantId = String(req.params.tenantId);
    const itemId   = String(req.params.itemId);
    const schedules = await getSchedulesForItem(tenantId, itemId);
    res.json(formatSuccess(schedules));
  } catch (err) { next(err); }
});

/** POST /api/tenants/:tenantId/menu/items/:itemId/schedules */
router.post('/items/:itemId/schedules',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const itemId   = String(req.params.itemId);
      const dto      = validate(CreateAvailabilityScheduleSchema, req.body);
      const schedule = await createAvailabilitySchedule(tenantId, itemId, dto);
      res.status(201).json(formatSuccess(schedule));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/schedules/:scheduleId */
router.delete('/schedules/:scheduleId',
  requireMinRole(ROLES.MANAGER),
  async (req: Request<{ tenantId: string; scheduleId: string }>, res, next) => {
    try {
      const tenantId   = String(req.params.tenantId);
      const scheduleId = String(req.params.scheduleId);
      await deleteAvailabilitySchedule(tenantId, scheduleId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/items/:itemId/disable  — "86 this item" */
router.post('/items/:itemId/disable',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
    try {
      const tenantId    = String(req.params.tenantId);
      const itemId      = String(req.params.itemId);
      const dto         = validate(CreateTemporaryDisablementSchema, req.body);
      const disablement = await temporarilyDisableItem(
        tenantId, itemId, dto, req.context.userId
      );
      res.status(201).json(formatSuccess(disablement));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/items/:itemId/disable/:branchId — re-enable */
router.delete('/items/:itemId/disable/:branchId',
  requireBranchAccess('branchId'),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; itemId: string; branchId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const itemId   = String(req.params.itemId);
      const branchId = String(req.params.branchId);
      await reEnableItem(tenantId, itemId, branchId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/branch/:branchId/disablements */
router.get('/branch/:branchId/disablements',
  requireBranchAccess('branchId'),
  async (req: Request<{ tenantId: string; branchId: string }>, res, next) => {
    try {
      const tenantId     = String(req.params.tenantId);
      const branchId     = String(req.params.branchId);
      const disablements = await getActiveDisablementsForBranch(tenantId, branchId);
      res.json(formatSuccess(disablements));
    } catch (err) { next(err); }
  }
);

export { router as menuRouter };
