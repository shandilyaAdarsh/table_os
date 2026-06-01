// ============================================================
// src/modules/admin/onboarding/onboarding.admin.controller.ts
// Controller for Admin Onboarding API.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../../config/supabase';
import { AdminOnboardingService } from './onboarding.admin.service';
import { RestaurantInfoSchema, BusinessConfigSchema, GstLegalConfigSchema, TablesHoursConfigSchema } from './onboarding.validators';

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

      // Validate request body
      const validationResult = RestaurantInfoSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
        return;
      }

      const updatedTenant = await onboardingService.updateRestaurantInfo(
        supabaseAdmin,
        tenantId,
        validationResult.data
      );

      res.status(200).json({
        success: true,
        data: updatedTenant,
        message: 'Restaurant info updated successfully',
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

      // Validate request body
      const validationResult = BusinessConfigSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
        return;
      }

      const updatedTenant = await onboardingService.updateBusinessConfig(
        supabaseAdmin,
        tenantId,
        validationResult.data
      );

      res.status(200).json({
        success: true,
        data: updatedTenant,
        message: 'Business configuration updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };
  public updateGstLegalConfig = async (
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

      // Validate request body
      const validationResult = GstLegalConfigSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
        return;
      }

      const updatedTenant = await onboardingService.updateGstLegalConfig(
        supabaseAdmin,
        tenantId,
        validationResult.data
      );

      res.status(200).json({
        success: true,
        data: updatedTenant,
        message: 'GST & Legal configuration updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };
  public updateTablesAndHours = async (
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

      const validationResult = TablesHoursConfigSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
        return;
      }

      const updatedTenant = await onboardingService.updateTablesAndHours(
        supabaseAdmin,
        tenantId,
        validationResult.data
      );

      res.status(200).json({
        success: true,
        data: updatedTenant,
        message: 'Tables & Hours configuration updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };
}
