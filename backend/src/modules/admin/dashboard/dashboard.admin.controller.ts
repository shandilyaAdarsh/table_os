// ============================================================
// src/modules/admin/dashboard/dashboard.admin.controller.ts
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../../config/supabase';
import { AdminDashboardService } from './dashboard.admin.service';

const dashboardService = new AdminDashboardService();

export class AdminDashboardController {
  public dismissQrBanner = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const tenantId = req.context?.tenantId;
      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Missing tenant_id context' });
        return;
      }

      await dashboardService.dismissQrBanner(supabaseAdmin, tenantId);

      res.status(200).json({
        success: true,
        message: 'QR banner dismissed',
      });
    } catch (error) {
      next(error);
    }
  };
}
