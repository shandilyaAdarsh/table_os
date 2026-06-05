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
  CreateFloorSchema,
  UpdateFloorSchema,
  CreateSectionSchema,
  UpdateSectionSchema,
  CreateTableSchema,
  UpdateTableSchema,
  CreateReservationSchema,
  UpdateReservationSchema,
  TableListQuerySchema,
} from './tables.validators';

const router: Router = Router({ mergeParams: true });

// ─── Floors ───────────────────────────────────────────────────

router.get('/floors', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string | undefined;
    const data = await tableService.listFloors(tenantId, branchId);
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/floors', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = CreateFloorSchema.parse(req.body);
    const floor = await tableService.createFloor(req.context.tenantId!, dto, req.context.userId);
    res.status(201).json({ success: true, data: floor });
  } catch (err) { next(err); }
});

router.patch('/floors/:floorId', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = UpdateFloorSchema.parse(req.body);
    const floor = await tableService.updateFloor(req.context.tenantId!, req.params.floorId as string, dto, req.context.userId);
    res.status(200).json({ success: true, data: floor });
  } catch (err) { next(err); }
});

router.delete('/floors/:floorId', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tableService.deleteFloor(req.context.tenantId!, req.params.floorId as string, req.context.userId);
    res.status(200).json({ success: true, message: 'Floor deleted.' });
  } catch (err) { next(err); }
});

// ─── Sections ─────────────────────────────────────────────────

router.get('/sections', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const data = await tableService.listSections(tenantId);
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/sections', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = CreateSectionSchema.parse(req.body);
    const section = await tableService.createSection(req.context.tenantId!, dto, req.context.userId);
    res.status(201).json({ success: true, data: section });
  } catch (err) { next(err); }
});

router.patch('/sections/:sectionId', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = UpdateSectionSchema.parse(req.body);
    const section = await tableService.updateSection(req.context.tenantId!, req.params.sectionId as string, dto, req.context.userId);
    res.status(200).json({ success: true, data: section });
  } catch (err) { next(err); }
});

router.delete('/sections/:sectionId', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tableService.deleteSection(req.context.tenantId!, req.params.sectionId as string, req.context.userId);
    res.status(200).json({ success: true, message: 'Section deleted.' });
  } catch (err) { next(err); }
});

// ─── Tables ───────────────────────────────────────────────────

// GET /api/v1/admin/tables?branch_id=&page=&limit=
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

// DELETE /api/v1/admin/tables/:tableId
router.delete('/:tableId', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tableService.deleteTable(req.context.tenantId!, req.params.tableId as string, req.context.userId);
    res.status(200).json({ success: true, message: 'Table soft deleted.' });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/tables/:tableId/history
router.get('/:tableId/history', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await tableService.getTableHistory(req.context.tenantId!, req.params.tableId as string);
    res.status(200).json({ success: true, data: history });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/tables/:tableId/qr
router.get('/:tableId/qr', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = await tableService.getQrToken(req.context.tenantId!, req.params.tableId as string);
    res.status(200).json({ success: true, token });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/tables/:tableId/qr/rotate
router.post('/:tableId/qr/rotate', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = await tableService.rotateQrToken(req.context.tenantId!, req.params.tableId as string, req.context.userId);
    res.status(200).json({ success: true, token });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/tables/:tableId/generate-qr
router.post('/:tableId/generate-qr', requireMinRole(ROLES.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const tableId = req.params.tableId as string;
    const token = await tableService.rotateQrToken(tenantId, tableId, req.context.userId);
    const table = await tableService.getTableById(tenantId, tableId);
    
    const baseUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5173';
    const qr_url = `${baseUrl}?t=${token}`;
    
    res.status(200).json({ 
      success: true, 
      data: {
        ...table,
        qr_token: token,
        qr_url: qr_url
      }
    });
  } catch (err) { next(err); }
});

// ─── Reservations ─────────────────────────────────────────────

router.get('/:tableId/reservations', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tableService.getReservationsForTable(req.context.tenantId!, req.params.tableId as string);
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/reservations', requireMinRole(ROLES.STAFF), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = CreateReservationSchema.parse(req.body);
    const reservation = await tableService.createReservation(req.context.tenantId!, dto, req.context.userId);
    res.status(201).json({ success: true, data: reservation });
  } catch (err) { next(err); }
});

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
