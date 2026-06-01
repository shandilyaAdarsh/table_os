import { Request, Response } from 'express';
import { AppError } from '../../../shared/errors/AppError';
import { supabaseAdmin } from '../../../config/supabase';
import { AdminDashboardService } from './dashboard.admin.service';

export class AdminDashboardController {
  static async dismissQrBanner(req: Request, res: Response) {
    try {
      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        throw new AppError('Unauthorized: Missing tenant context', 401, 'UNAUTHORIZED');
      }

      const dashboardService = new AdminDashboardService(supabaseAdmin);

      await dashboardService.dismissQrBanner(tenantId);

      return res.status(200).json({
        success: true,
        message: 'Banner dismissed successfully',
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}
