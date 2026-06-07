import type { Request, Response, NextFunction } from 'express';
import type { StaffService } from './staff.service';
import { CreateStaffSchema, UpdateStaffSchema } from './staff.dtos';
import { formatSuccess } from '../../shared/utils/response-formatter';
import { NotFoundError } from '../../shared/errors/AppError';

export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  list = async (req: Request<{ tenantId: string }>, res: Response, next: NextFunction) => {
    try {
      const staff = await this.staffService.list(req.params.tenantId);
      res.status(200).json(formatSuccess(staff));
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request<{ tenantId: string; id: string }>, res: Response, next: NextFunction) => {
    try {
      const staff = await this.staffService.getById(req.params.tenantId, req.params.id);
      if (!staff) throw new NotFoundError('Staff');
      res.status(200).json(formatSuccess(staff));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request<{ tenantId: string }>, res: Response, next: NextFunction) => {
    try {
      const payload = CreateStaffSchema.parse(req.body);
      const staff = await this.staffService.create(req.params.tenantId, payload);
      res.status(201).json(formatSuccess(staff));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request<{ tenantId: string; id: string }>, res: Response, next: NextFunction) => {
    try {
      const payload = UpdateStaffSchema.parse(req.body);
      const staff = await this.staffService.update(req.params.tenantId, req.params.id, payload);
      res.status(200).json(formatSuccess(staff));
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request<{ tenantId: string; id: string }>, res: Response, next: NextFunction) => {
    try {
      await this.staffService.delete(req.params.tenantId, req.params.id);
      res.status(200).json(formatSuccess({ id: req.params.id }));
    } catch (error) {
      next(error);
    }
  };
}
