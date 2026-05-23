// ============================================================
// src/modules/tables/tables.router.ts
// Admin API routes for table management.
// All routes require authentication + tenant context (via admin.router.ts).
// ============================================================

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireMinRole } from '../../middleware/auth.middleware';
import { ROLES } from '../../types/rbac.types';
import * as tableService from './services/table.service';
import {
  CreateTableSchema,
  UpdateTableSchema,
  TransitionTableStatusSchema,
  CreateReservationSchema,
  UpdateReservationSchema,
  TableListQuerySchema,
} from './tables.validators';

const router: Router = Router({ mergeParams: true });

// ─── Tables ───────────────────────────────────────────────────

// GET /api/v1/admin/tables?branch_id=&status=&page=&limit=
router.get('/', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = TableListQuerySchema.parse(req.query);
    const tenantId = req.context.tenantId!;
    const result = await tableService.listTables(tenantId, query);
    res.status(200).json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/tables/:tableId
router.get('/:tableId', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = await tableService.getTableById(req.context.tenantId!, req.params.tableId as string);
    res.status(200).json({ success: true, data: table });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/tables
router.post('/', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = CreateTableSchema.parse(req.body);
    const table = await tableService.createTable(req.context.tenantId!, dto, req.context.userId);
    res.status(201).json({ success: true, data: table });
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/tables/:tableId
router.patch('/:tableId', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = UpdateTableSchema.parse(req.body);
    const table = await tableService.updateTable(req.context.tenantId!, req.params.tableId as string, dto, req.context.userId);
    res.status(200).json({ success: true, data: table });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/tables/:tableId/status
router.post('/:tableId/status', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = TransitionTableStatusSchema.parse(req.body);
    const table = await tableService.transitionTableStatus(
      req.context.tenantId!, req.params.tableId as string, dto, req.context.userId,
    );
    res.status(200).json({ success: true, data: table });
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/tables/:tableId
router.delete('/:tableId', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tableService.deleteTable(req.context.tenantId!, req.params.tableId as string, req.context.userId);
    res.status(200).json({ success: true, message: 'Table deleted.' });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/tables/:tableId/history
router.get('/:tableId/history', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await tableService.getTableHistory(req.context.tenantId!, req.params.tableId as string);
    res.status(200).json({ success: true, data: history });
  } catch (err) { next(err); }
});

// ─── Reservations ─────────────────────────────────────────────

// GET /api/v1/admin/tables/:tableId/reservations
router.get('/:tableId/reservations', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tableService.getReservationsForTable(req.context.tenantId!, req.params.tableId as string);
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/tables/reservations
router.post('/reservations', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = CreateReservationSchema.parse(req.body);
    const reservation = await tableService.createReservation(req.context.tenantId!, dto, req.context.userId);
    res.status(201).json({ success: true, data: reservation });
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/tables/reservations/:reservationId
router.patch('/reservations/:reservationId', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = UpdateReservationSchema.parse(req.body);
    const reservation = await tableService.updateReservation(
      req.context.tenantId!, req.params.reservationId as string, dto, req.context.userId,
    );
    res.status(200).json({ success: true, data: reservation });
  } catch (err) { next(err); }
});

export { router as tablesRouter };
