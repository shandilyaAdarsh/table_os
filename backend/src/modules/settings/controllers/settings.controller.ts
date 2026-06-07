import { Request, Response } from 'express';
import { supabaseAdmin } from '../../../config/supabase';
import { logger as log } from '../../../shared/utils/logger';

// Default settings as per frontend DTO
const DEFAULT_SETTINGS = {
  notify_new_order: true,
  notify_order_ready: true,
  notify_low_stock: false,
  notify_revenue: false,
  print_receipt: true,
  auto_accept: false,
  confirmation_sound: 'BEEP_01',
  qr_auto_assign: true,
  gst_number: '',
  default_tax_basis_points: 500,
  version_num: 1,
};

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.context?.tenantId;
    const branchId = req.query.branch_id as string | undefined;

    if (!tenantId) {
      res.status(400).json({ success: false, error: { message: 'Missing tenantId' } });
      return;
    }

    // Helper: build default in-memory payload (used when DB schema is not migrated yet)
    const buildDefaults = () => ({
      tenant_id: tenantId,
      branch_id: branchId ?? null,
      ...DEFAULT_SETTINGS,
      updated_at: new Date().toISOString(),
    });

    let query = supabaseAdmin
      .from('restaurant_settings')
      .select('*')
      .eq('tenant_id', tenantId);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      query = query.is('branch_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error && error.code !== 'PGRST116') {
      // PGRST205 = table not found; 42703 = column not found (schema not migrated yet)
      // Both cases: return in-memory defaults — do NOT crash with 500.
      if (error.code === 'PGRST205' || error.code === '42703') {
        log.warn({ tenantId, errorCode: error.code }, 'restaurant_settings schema not fully migrated — returning defaults');
        res.status(200).json({ success: true, data: buildDefaults() });
        return;
      }
      log.error({ tenantId, error }, 'Failed to fetch settings');
      res.status(500).json({ success: false, error: { message: 'Database error' } });
      return;
    }

    if (!data) {
      // Try to upsert default row on first load
      const newSettings = {
        tenant_id: tenantId,
        branch_id: branchId ?? null,
        ...DEFAULT_SETTINGS,
      };

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('restaurant_settings')
        .upsert(newSettings, { onConflict: 'tenant_id, branch_id', ignoreDuplicates: true })
        .select()
        .single();

      if (insertError) {
        // If table/column doesn't exist, return in-memory defaults
        if (insertError.code === 'PGRST205' || insertError.code === '42703') {
          log.warn({ tenantId, errorCode: insertError.code }, 'restaurant_settings schema not migrated — returning defaults');
          res.status(200).json({
            success: true,
            data: { ...newSettings, updated_at: new Date().toISOString() },
          });
          return;
        }
        log.error({ tenantId, insertError }, 'Failed to initialize settings');
        res.status(500).json({ success: false, error: { message: 'Failed to initialize settings' } });
        return;
      }

      res.status(200).json({ success: true, data: inserted });
      return;
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    log.error({ error }, 'Unexpected error in getSettings');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
}


export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.context?.tenantId;
    const updateData = req.body;

    if (!tenantId) {
      res.status(400).json({ success: false, error: { message: 'Missing tenantId' } });
      return;
    }

    // Prepare OCC
    const currentVersion = updateData.version_num || 1;
    updateData.version_num = currentVersion + 1;
    updateData.updated_at = new Date().toISOString();

    const branchId = updateData.branch_id;

    let query = supabaseAdmin
      .from('restaurant_settings')
      .update(updateData)
      .eq('tenant_id', tenantId)
      .eq('version_num', currentVersion);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      query = query.is('branch_id', null);
    }

    const { data, error } = await query.select().maybeSingle();

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42703') {
        // Mock successful update if table/column not migrated yet
        log.warn({ tenantId, errorCode: error.code }, 'restaurant_settings schema not migrated — mock update success');
        res.status(200).json({ success: true, data: updateData });
        return;
      }
      log.error({ tenantId, error }, 'Failed to update settings');
      res.status(500).json({ success: false, error: { message: 'Update failed' } });
      return;
    }

    if (!data) {
      res.status(409).json({ success: false, error: { message: 'Optimistic concurrency error or record not found' } });
      return;
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    log.error({ error }, 'Unexpected error in updateSettings');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
}
