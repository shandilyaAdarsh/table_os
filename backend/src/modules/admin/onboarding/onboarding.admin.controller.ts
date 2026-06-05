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

      const body = req.body as {
        display_name?: string;
        city?: string;
        state?: string;
        full_address?: string;
        timezone?: string;
      };

      if (
        !body.display_name?.trim() ||
        !body.city?.trim() ||
        !body.state?.trim() ||
        !body.full_address?.trim() ||
        !body.timezone?.trim()
      ) {
        res.status(400).json({ success: false, error: 'All restaurant info fields are required' });
        return;
      }

      await onboardingService.updateRestaurantInfo(supabaseAdmin, tenantId, {
        display_name: body.display_name.trim(),
        city: body.city.trim(),
        state: body.state.trim(),
        full_address: body.full_address.trim(),
        timezone: body.timezone.trim(),
      });

      res.status(200).json({
        success: true,
        message: 'Restaurant info saved',
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

      const body = req.body as {
        currency_code?: string;
        business_type?: string;
        tax_registration_number?: string;
      };

      if (!body.currency_code?.trim()) {
        res.status(400).json({ success: false, error: 'currency_code is required' });
        return;
      }

      await onboardingService.updateBusinessConfig(supabaseAdmin, tenantId, {
        currency_code: body.currency_code.trim(),
        business_type: body.business_type?.trim(),
        tax_registration_number: body.tax_registration_number?.trim(),
      });

      res.status(200).json({
        success: true,
        message: 'Business config saved',
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
      const actorId = req.context?.userId;
      if (!tenantId || !actorId) {
        res.status(400).json({ success: false, error: 'Missing auth context' });
        return;
      }

      const body = req.body as {
        gstin?: string;
        fssai_license_number?: string;
        gst_type?: string;
        default_tax_rate?: number;
        cgst_rate?: number;
        sgst_rate?: number;
        igst_rate?: number;
      };

      if (!body.fssai_license_number?.trim() || !body.gst_type?.trim()) {
        res.status(400).json({
          success: false,
          error: 'fssai_license_number and gst_type are required',
        });
        return;
      }

      const defaultTaxRate = Number(body.default_tax_rate ?? 0);
      if (Number.isNaN(defaultTaxRate) || defaultTaxRate < 0) {
        res.status(400).json({ success: false, error: 'default_tax_rate is invalid' });
        return;
      }

      await onboardingService.updateGstLegalConfig(
        supabaseAdmin,
        tenantId,
        {
          gstin: body.gstin?.trim(),
          fssai_license_number: body.fssai_license_number.trim(),
          gst_type: body.gst_type.trim(),
          default_tax_rate: defaultTaxRate,
          cgst_rate: Number(body.cgst_rate ?? 0),
          sgst_rate: Number(body.sgst_rate ?? 0),
          igst_rate: Number(body.igst_rate ?? 0),
        },
        actorId
      );

      res.status(200).json({
        success: true,
        message: 'GST & legal config saved',
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
      const actorId = req.context?.userId;
      if (!tenantId || !actorId) {
        res.status(400).json({ success: false, error: 'Missing auth context' });
        return;
      }

      const body = req.body as {
        number_of_tables?: number;
        table_prefix?: string;
        opening_time?: string;
        closing_time?: string;
      };

      const numberOfTables = Number(body.number_of_tables);
      if (!Number.isInteger(numberOfTables) || numberOfTables < 1) {
        res.status(400).json({ success: false, error: 'number_of_tables must be at least 1' });
        return;
      }

      if (!body.table_prefix?.trim() || !body.opening_time?.trim() || !body.closing_time?.trim()) {
        res.status(400).json({
          success: false,
          error: 'table_prefix, opening_time, and closing_time are required',
        });
        return;
      }

      await onboardingService.updateTablesAndHours(
        supabaseAdmin,
        tenantId,
        {
          number_of_tables: numberOfTables,
          table_prefix: body.table_prefix.trim(),
          opening_time: body.opening_time.trim(),
          closing_time: body.closing_time.trim(),
        },
        actorId
      );

      res.status(200).json({
        success: true,
        message: 'Tables and hours saved',
      });
    } catch (error) {
      next(error);
    }
  };
}
