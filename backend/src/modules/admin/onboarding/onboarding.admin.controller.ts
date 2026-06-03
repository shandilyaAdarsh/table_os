// ============================================================
// src/modules/admin/onboarding/onboarding.admin.controller.ts
// Controller for Admin Onboarding API.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../../config/supabase';
import { AdminOnboardingService } from './onboarding.admin.service';

const onboardingService = new AdminOnboardingService();

export class AdminOnboardingController {
  public getOnboardingStatus = async (
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

      // We use supabaseAdmin here because this is backend admin route and bypasses RLS for system metrics
      // Or we can use req.supabase if available for authenticated tenant requests.
      const status = await onboardingService.getOnboardingStatus(supabaseAdmin, tenantId);

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  };

  public skipOnboarding = async (
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

      await onboardingService.skipOnboarding(supabaseAdmin, tenantId);

      res.status(200).json({
        success: true,
        message: 'Onboarding marked as skipped'
      });
    } catch (error) {
      next(error);
    }
  };
  public updateRestaurantInfo = async (
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

      await onboardingService.updateRestaurantInfo(supabaseAdmin, tenantId, req.body);

      res.status(200).json({
        success: true,
        message: 'Restaurant info updated successfully'
      });
    } catch (error) {
      next(error);
    }
  };
  public updateBusinessConfig = async (
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

      await onboardingService.updateBusinessConfig(supabaseAdmin, tenantId, req.body);

      res.status(200).json({
        success: true,
        message: 'Business config updated successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  public updateGstLegal = async (
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

      await onboardingService.updateGstLegal(supabaseAdmin, tenantId, req.body);

      res.status(200).json({
        success: true,
        message: 'GST config updated successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  public updateTablesHours = async (
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

      await onboardingService.updateTablesHours(supabaseAdmin, tenantId, req.body);

      res.status(200).json({
        success: true,
        message: 'Tables and hours updated successfully'
      });
    } catch (error) {
      next(error);
    }
  };
}
