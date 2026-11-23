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
  BranchMenuQuerySchema,
} from './menu.validators';
import {
  linkModifierGroupsToItem,
  setBranchItemOverride,
  getBranchItemOverrides,
  setBranchModifierOptionOverride,
  setBranchModifierGroupOverride,
  getEffectiveMenuForBranch,
  createNewModifierGroup,
  updateExistingModifierGroup,
  addOptionToGroup,
  updateModifierOptionData,
} from './services/menu.service';

import * as categoryController from './controllers/menu-category.controller';
import * as itemController from './controllers/menu-item.controller';
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

/** GET /api/tenants/:tenantId/menu/categories/tree - tree of all categories */
router.get('/categories/tree', categoryController.getTree);

/** GET /api/tenants/:tenantId/menu/categories - list categories with pagination/search */
router.get('/categories', categoryController.getList);

/** GET /api/tenants/:tenantId/menu/categories/branch/:branchId */
router.get('/categories/branch/:branchId',
  requireBranchAccess('branchId'),
  categoryController.getBranchCategories
);

/** POST /api/tenants/:tenantId/menu/categories */
router.post('/categories',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  categoryController.createCategory
);

/** PATCH /api/tenants/:tenantId/menu/categories/:categoryId */
router.patch('/categories/:categoryId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  categoryController.updateCategory
);

/** DELETE /api/tenants/:tenantId/menu/categories/:categoryId */
router.delete('/categories/:categoryId',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  categoryController.removeCategory
);

/** PUT /api/tenants/:tenantId/menu/categories/:categoryId/visibility */
router.put('/categories/:categoryId/visibility',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  categoryController.setBranchVisibility
);

// ─── Menu Item Routes ─────────────────────────────────────────

/** GET /api/tenants/:tenantId/menu/items - List/Search items */
router.get('/items', itemController.getList);

/** GET /api/tenants/:tenantId/menu/items/:itemId */
router.get('/items/:itemId', itemController.getById);

/** POST /api/tenants/:tenantId/menu/items */
router.post('/items',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  itemController.createItem
);

/** PATCH /api/tenants/:tenantId/menu/items/:itemId */
router.patch('/items/:itemId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  itemController.updateItem
);

/** DELETE /api/tenants/:tenantId/menu/items/:itemId */
router.delete('/items/:itemId',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  itemController.removeItem
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

/** GET /api/tenants/:tenantId/menu/branch/:branchId/overrides */
router.get('/branch/:branchId/overrides',
  requireBranchAccess('branchId'),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  async (req: Request<{ tenantId: string; branchId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const branchId = String(req.params.branchId);
      const overrides = await getBranchItemOverrides(tenantId, branchId);
      res.json(formatSuccess(overrides));
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

/** DELETE /api/tenants/:tenantId/menu/branch/:branchId/items/:itemId/override */
router.delete('/branch/:branchId/items/:itemId/override',
  requireBranchAccess('branchId'),
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; branchId: string; itemId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const branchId = String(req.params.branchId);
      const itemId   = String(req.params.itemId);
      await setBranchItemOverride(tenantId, branchId, itemId, {});
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

// ─── Recommendations Routes (Admin) ──────────────────────────────

import {
  findAdminRecommendationsForItem,
  createOrReactivateRecommendation,
  updateRecommendation,
  deactivateRecommendation,
  reactivateRecommendation,
  softDeleteRecommendation,
} from './repositories/menu-recommendation.repository';
import {
  CreateRecommendationSchema,
  UpdateRecommendationSchema,
  RecommendationAnalyticsQuerySchema,
  RecommendationOptimizationQuerySchema,
  RecommendationEvaluationQuerySchema,
  RecommendationReplayBodySchema,
  RecommendationQualityQuerySchema,
  RecommendationPromotionReviewBodySchema,
  RecommendationQualityEvaluateBodySchema,
} from './menu.validators';
import { RecommendationTelemetryService } from './observability/recommendation-telemetry.service';
import { RecommendationAnalyticsService } from './analytics/recommendation-analytics.service';
import { RecommendationOptimizationService } from './optimization/recommendation-optimization.service';
import {
  RecommendationEvaluationService,
  RecommendationReplayService,
} from './evaluation';
import {
  RecommendationQualityService,
  RecommendationPromotionService,
} from './quality';
import type { OptimizationInsightType } from './optimization/recommendation-optimization.types';
import { ForbiddenError } from '../../shared/errors/AppError';
import {
  ExperimentService,
  ExperimentAnalyticsService,
  CreateExperimentSchema,
  UpdateExperimentSchema,
  ExperimentQuerySchema,
  ExperimentAnalyticsQuerySchema,
  type CreateExperimentDto,
  type UpdateExperimentDto,
} from './experiments';
import {
  RecommendationStrategyService,
  CreateStrategySchema,
  UpdateStrategySchema,
  StrategyQuerySchema,
  StrategyApprovalSchema,
  StrategyRollbackSchema,
  type RecommendationStrategySurface,
} from './strategies';

/** GET /api/tenants/:tenantId/menu/recommendations/metrics - Diagnostic operational summary */
router.get('/recommendations/metrics',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const metrics = RecommendationTelemetryService.getTenantMetrics(tenantId);
      res.json(formatSuccess(metrics));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/analytics - Deep feedback & funnel analytics */
router.get('/recommendations/analytics',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const parsed = validate(RecommendationAnalyticsQuerySchema, req.query);
      const branchId = parsed.branchId || parsed.branch_id;
      const sourceItemId = parsed.sourceItemId || parsed.source_item_id;
      const recommendedItemId = parsed.recommendedItemId || parsed.recommended_item_id;
      const reasonCode = parsed.reasonCode || parsed.reason_code;

      const analytics = await RecommendationAnalyticsService.getRecommendationAnalytics(tenantId, {
        tenantId,
        branchId,
        sourceItemId,
        recommendedItemId,
        reasonCode,
        surface: parsed.surface,
        range: parsed.range,
        from: parsed.from,
        to: parsed.to,
        limit: parsed.limit,
      });

      res.json(formatSuccess(analytics));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/optimization - Controlled recommendation optimization insights */
router.get('/recommendations/optimization',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const parsed = validate(RecommendationOptimizationQuerySchema, req.query);
      const branchId = parsed.branchId || parsed.branch_id;
      const sourceItemId = parsed.sourceItemId || parsed.source_item_id;
      const recommendedItemId = parsed.recommendedItemId || parsed.recommended_item_id;
      const reasonCode = parsed.reasonCode || parsed.reason_code;
      const insightType = (parsed.insightType || parsed.insight_type) as OptimizationInsightType | undefined;
      const includeInsufficientData = parsed.includeInsufficientData || parsed.include_insufficient_data;

      // Enforce branch isolation if branchId is specified
      if (branchId && req.context?.role !== ROLES.SUPER_ADMIN && req.context?.branchIds && req.context.branchIds.length > 0) {
        if (!req.context.branchIds.includes(branchId)) {
          throw new ForbiddenError('Caller does not have access to this branch');
        }
      }

      const result = await RecommendationOptimizationService.getOptimizationInsights(tenantId, {
        tenantId,
        branchId,
        sourceItemId,
        recommendedItemId,
        reasonCode,
        insightType,
        severity: parsed.severity,
        range: parsed.range,
        from: parsed.from,
        to: parsed.to,
        limit: parsed.limit,
        includeInsufficientData,
      });

      res.json(formatSuccess(result));
    } catch (err) { next(err); }
  }
);

// ─── Recommendation Evaluation & Offline Replay (Checkpoint 13) ───

/** GET /api/tenants/:tenantId/menu/recommendations/evaluation - Offline evaluation and quality summary */
router.get('/recommendations/evaluation',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const parsed = validate(RecommendationEvaluationQuerySchema, req.query);
      const branchId = parsed.branchId || parsed.branch_id;

      // Enforce branch isolation if branchId is specified
      if (branchId && req.context?.role !== ROLES.SUPER_ADMIN && req.context?.branchIds && req.context.branchIds.length > 0) {
        if (!req.context.branchIds.includes(branchId)) {
          throw new ForbiddenError('Caller does not have access to this branch');
        }
      }

      const summary = await RecommendationEvaluationService.getTenantEvaluationSummary(tenantId, {
        branchId,
        range: parsed.range,
      });

      res.json(formatSuccess(summary));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/evaluation/replay - Deterministic recommendation replay */
router.post('/recommendations/evaluation/replay',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const body = validate(RecommendationReplayBodySchema, req.body);
      const branchId = body.branchId || body.branch_id || 'default-branch';

      // Enforce branch isolation if branchId is specified
      if (branchId && req.context?.role !== ROLES.SUPER_ADMIN && req.context?.branchIds && req.context.branchIds.length > 0) {
        if (!req.context.branchIds.includes(branchId)) {
          throw new ForbiddenError('Caller does not have access to this branch');
        }
      }

      const replayResult = await RecommendationReplayService.replayContext({
        tenantId,
        branchId,
        sourceItemIds: body.sourceItemIds,
        cartItemIds: body.cartItemIds,
        surface: body.surface,
        limit: body.limit,
        experimentVariantKey: body.experimentVariantKey,
        skipTelemetry: true,
      });

      res.json(formatSuccess(replayResult));
    } catch (err) { next(err); }
  }
);

// ─── Recommendation Quality Gates & Controlled Promotion (Checkpoint 14) ───

/** GET /api/tenants/:tenantId/menu/recommendations/quality - List promotion candidates or evaluate experiment quality */
router.get('/recommendations/quality',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const query = validate(RecommendationQualityQuerySchema, req.query);
      const branchId = query.branchId || query.branch_id;
      const experimentId = query.experimentId || query.experiment_id;

      // Enforce branch isolation if branchId is specified
      if (branchId && req.context?.role !== ROLES.SUPER_ADMIN && req.context?.branchIds && req.context.branchIds.length > 0) {
        if (!req.context.branchIds.includes(branchId)) {
          throw new ForbiddenError('Caller does not have access to this branch');
        }
      }

      if (experimentId) {
        const result = await RecommendationQualityService.evaluateExperimentQuality(tenantId, experimentId, {
          branchId,
        });
        res.json(formatSuccess(result));
        return;
      }

      const candidates = RecommendationPromotionService.listCandidates(tenantId, {
        branchId,
        surface: query.surface,
        status: query.status,
      });

      res.json(formatSuccess(candidates));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/quality/evaluate - Deterministic quality gate evaluation */
router.post('/recommendations/quality/evaluate',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const body = validate(RecommendationQualityEvaluateBodySchema, req.body);

      const baselineInput = {
        tenantId,
        ...body.baseline,
      };
      const candidateInput = {
        tenantId,
        ...body.candidate,
      };

      const result = RecommendationQualityService.evaluateMetrics(
        baselineInput,
        candidateInput,
        body.config
      );

      res.json(formatSuccess(result));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/quality/review - Human promotion review action (Approve or Reject) */
router.post('/recommendations/quality/review',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const body = validate(RecommendationPromotionReviewBodySchema, req.body);
      const branchId = body.branchId || body.branch_id;
      const reviewerId = req.context?.userId || 'anonymous-reviewer';
      const reviewerRole = req.context?.role || ROLES.MANAGER;

      // Enforce branch isolation if branchId is specified
      if (branchId && req.context?.role !== ROLES.SUPER_ADMIN && req.context?.branchIds && req.context.branchIds.length > 0) {
        if (!req.context.branchIds.includes(branchId)) {
          throw new ForbiddenError('Caller does not have access to this branch');
        }
      }

      const result = await RecommendationPromotionService.reviewCandidate({
        candidateId: body.candidateId,
        tenantId,
        branchId,
        action: body.action,
        reviewerId,
        reviewerRole,
        reason: body.reason,
      });

      res.json(formatSuccess(result));
    } catch (err) { next(err); }
  }
);

// ─── Recommendation Experiments (Checkpoint 11) ─────────────

/** POST /api/tenants/:tenantId/menu/recommendations/experiments - Create a new draft experiment */
router.post('/recommendations/experiments',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const dto = validate(CreateExperimentSchema, req.body) as CreateExperimentDto;
      const actorId = req.context?.userId;
      const experiment = await ExperimentService.createExperiment(tenantId, dto, actorId);
      res.status(201).json(formatSuccess(experiment));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/experiments - List experiments for tenant */
router.get('/recommendations/experiments',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const query = validate(ExperimentQuerySchema, req.query);
      const experiments = await ExperimentService.listExperiments(tenantId, query);
      res.json(formatSuccess(experiments));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/experiments/:id - Get experiment details */
router.get('/recommendations/experiments/:id',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const experiment = await ExperimentService.getExperiment(tenantId, id);
      res.json(formatSuccess(experiment));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/recommendations/experiments/:id - Update draft experiment */
router.patch('/recommendations/experiments/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const dto = validate(UpdateExperimentSchema, req.body) as UpdateExperimentDto;
      const actorId = req.context?.userId;
      const experiment = await ExperimentService.updateExperiment(tenantId, id, dto, actorId);
      res.json(formatSuccess(experiment));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/experiments/:id/start - Start draft/paused experiment */
router.post('/recommendations/experiments/:id/start',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const actorId = req.context?.userId;
      const experiment = await ExperimentService.startExperiment(tenantId, id, actorId);
      res.json(formatSuccess(experiment));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/experiments/:id/pause - Pause running experiment */
router.post('/recommendations/experiments/:id/pause',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const actorId = req.context?.userId;
      const experiment = await ExperimentService.pauseExperiment(tenantId, id, actorId);
      res.json(formatSuccess(experiment));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/experiments/:id/complete - Complete running experiment */
router.post('/recommendations/experiments/:id/complete',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const actorId = req.context?.userId;
      const experiment = await ExperimentService.completeExperiment(tenantId, id, actorId);
      res.json(formatSuccess(experiment));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/experiments/:id/archive - Archive completed/paused experiment */
router.post('/recommendations/experiments/:id/archive',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const actorId = req.context?.userId;
      const experiment = await ExperimentService.archiveExperiment(tenantId, id, actorId);
      res.json(formatSuccess(experiment));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/experiments/:id/results - Get experiment performance results */
router.get('/recommendations/experiments/:id/results',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const query = validate(ExperimentAnalyticsQuerySchema, req.query);
      const results = await ExperimentAnalyticsService.getExperimentResults(tenantId, id, query);
      res.json(formatSuccess(results));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/items/:itemId/recommendations */
router.get('/items/:itemId/recommendations',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const itemId   = String(req.params.itemId);
      const includeInactive = req.query.include_inactive !== 'false'; // default true for admin UI
      const recs = await findAdminRecommendationsForItem(tenantId, itemId, includeInactive);
      res.json(formatSuccess(recs));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/items/:itemId/recommendations */
router.post('/items/:itemId/recommendations',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; itemId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const itemId   = String(req.params.itemId);
      const dto      = validate(CreateRecommendationSchema, req.body);
      const isSuperAdmin = req.context?.role === ROLES.SUPER_ADMIN;
      const rec = await createOrReactivateRecommendation(tenantId, itemId, dto, {
        actorBranchIds: req.context?.branchIds,
        isSuperAdmin,
      });
      res.status(201).json(formatSuccess(rec));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/recommendations/:recId */
router.patch('/recommendations/:recId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; recId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const recId    = String(req.params.recId);
      const dto      = validate(UpdateRecommendationSchema, req.body);
      const rec = await updateRecommendation(tenantId, recId, dto);
      res.json(formatSuccess(rec));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/:recId/deactivate */
router.post('/recommendations/:recId/deactivate',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; recId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const recId    = String(req.params.recId);
      const rec = await deactivateRecommendation(tenantId, recId);
      res.json(formatSuccess(rec));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/:recId/reactivate */
router.post('/recommendations/:recId/reactivate',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; recId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const recId    = String(req.params.recId);
      const rec = await reactivateRecommendation(tenantId, recId);
      res.json(formatSuccess(rec));
    } catch (err) { next(err); }
  }
);

/** DELETE /api/tenants/:tenantId/menu/recommendations/:recId */
router.delete('/recommendations/:recId',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; recId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const recId    = String(req.params.recId);
      await softDeleteRecommendation(tenantId, recId);
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ─── Recommendation Strategies (Checkpoint 15) ───────────────

/** POST /api/tenants/:tenantId/menu/recommendations/strategies - Create draft strategy */
router.post('/recommendations/strategies',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const parsed = validate(CreateStrategySchema, req.body);
      const dto = {
        name: parsed.name,
        description: parsed.description,
        branchId: parsed.branchId ?? parsed.branch_id ?? null,
        surface: parsed.surface,
        configuration: parsed.configuration,
        parentStrategyId: parsed.parentStrategyId ?? parsed.parent_strategy_id ?? null,
        isBaseline: parsed.isBaseline ?? parsed.is_baseline ?? false,
        qualityCandidateId: parsed.qualityCandidateId ?? parsed.quality_candidate_id ?? null,
      };
      const actorId = req.context?.userId;
      const strategy = await RecommendationStrategyService.createDraft(tenantId, dto, actorId);
      res.status(201).json(formatSuccess(strategy));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/strategies - List strategies */
router.get('/recommendations/strategies',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const parsed = validate(StrategyQuerySchema, req.query);
      const query = {
        status: parsed.status,
        branchId: parsed.branchId ?? parsed.branch_id,
        surface: parsed.surface,
        name: parsed.name,
      };
      const strategies = await RecommendationStrategyService.listStrategies(tenantId, query);
      res.json(formatSuccess(strategies));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/strategies/active - Get current active strategy for scope */
router.get('/recommendations/strategies/active',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  async (req: Request<{ tenantId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
      const surface = typeof req.query.surface === 'string' ? (req.query.surface as RecommendationStrategySurface) : 'all';
      const strategy = await RecommendationStrategyService.getActiveStrategyForServing(tenantId, branchId, surface);
      res.json(formatSuccess(strategy));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/strategies/:id - Get strategy details */
router.get('/recommendations/strategies/:id',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU, PERMISSIONS.VIEW_ANALYTICS),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const strategy = await RecommendationStrategyService.getStrategy(tenantId, id);
      res.json(formatSuccess(strategy));
    } catch (err) { next(err); }
  }
);

/** PATCH /api/tenants/:tenantId/menu/recommendations/strategies/:id - Update draft strategy */
router.patch('/recommendations/strategies/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const dto = validate(UpdateStrategySchema, req.body);
      const actorId = req.context?.userId;
      const strategy = await RecommendationStrategyService.updateDraft(tenantId, id, dto, actorId);
      res.json(formatSuccess(strategy));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/strategies/:id/submit-review - Submit draft for review */
router.post('/recommendations/strategies/:id/submit-review',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const actorId = req.context?.userId;
      const strategy = await RecommendationStrategyService.submitForReview(tenantId, id, actorId);
      res.json(formatSuccess(strategy));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/strategies/:id/reject-review - Reject review back to draft */
router.post('/recommendations/strategies/:id/reject-review',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      const actorId = req.context?.userId;
      const strategy = await RecommendationStrategyService.rejectReview(tenantId, id, reason, actorId);
      res.json(formatSuccess(strategy));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/strategies/:id/approve - Approve strategy (does NOT activate) */
router.post('/recommendations/strategies/:id/approve',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const parsed = req.body ? validate(StrategyApprovalSchema, req.body) : undefined;
      const dto = parsed
        ? {
            reason: parsed.reason,
            qualityCandidateId: parsed.qualityCandidateId ?? parsed.quality_candidate_id ?? null,
            overrideQualityGate: parsed.overrideQualityGate ?? parsed.override_quality_gate ?? false,
          }
        : undefined;
      const actorId = req.context?.userId;
      const strategy = await RecommendationStrategyService.approveStrategy(tenantId, id, dto, actorId);
      res.json(formatSuccess(strategy));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/strategies/:id/activate - Atomically activate approved strategy */
router.post('/recommendations/strategies/:id/activate',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const actorId = req.context?.userId;
      const result = await RecommendationStrategyService.activateStrategy(tenantId, id, actorId);
      res.json(formatSuccess(result));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/strategies/:id/rollback - Rollback to approved/retired strategy */
router.post('/recommendations/strategies/:id/rollback',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const parsed = validate(StrategyRollbackSchema, { targetStrategyId: id, ...req.body });
      const actorId = req.context?.userId;
      const result = await RecommendationStrategyService.rollbackStrategy(
        tenantId,
        parsed.targetStrategyId || id,
        parsed.reason,
        actorId
      );
      res.json(formatSuccess(result));
    } catch (err) { next(err); }
  }
);

/** POST /api/tenants/:tenantId/menu/recommendations/strategies/:id/retire - Retire active/approved strategy */
router.post('/recommendations/strategies/:id/retire',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  async (req: Request<{ tenantId: string; id: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const actorId = req.context?.userId;
      const strategy = await RecommendationStrategyService.retireStrategy(tenantId, id, actorId);
      res.json(formatSuccess(strategy));
    } catch (err) { next(err); }
  }
);

/** GET /api/tenants/:tenantId/menu/recommendations/strategies/:id/compare/:otherId - Compare two strategies */
router.get('/recommendations/strategies/:id/compare/:otherId',
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU, PERMISSIONS.VIEW_MENU),
  async (req: Request<{ tenantId: string; id: string; otherId: string }>, res, next) => {
    try {
      const tenantId = String(req.params.tenantId);
      const id = String(req.params.id);
      const otherId = String(req.params.otherId);
      const comparison = await RecommendationStrategyService.compareStrategies(tenantId, id, otherId);
      res.json(formatSuccess(comparison));
    } catch (err) { next(err); }
  }
);

export { router as menuRouter };
