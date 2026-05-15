// ============================================================
// src/modules/menu/services/availability.service.ts
// Item availability schedule and temporary disablement logic.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type {
  ItemAvailabilitySchedule,
  ItemTemporaryDisablement,
  AvailabilityDay,
  ServiceType,
} from '../menu.types';
import type {
  CreateAvailabilityScheduleDto,
  CreateTemporaryDisablementDto,
} from '../menu.dtos';

// ─── Availability Schedules ───────────────────────────────────

export async function getSchedulesForItem(
  tenantId: string,
  itemId: string
): Promise<ItemAvailabilitySchedule[]> {
  const { data, error } = await supabaseAdmin
    .from('item_availability_schedules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('item_id', itemId)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  if (error) throw new Error(`[AvailabilityService] getSchedulesForItem: ${error.message}`);
  return data ?? [];
}

export async function createAvailabilitySchedule(
  tenantId: string,
  itemId: string,
  dto: CreateAvailabilityScheduleDto
): Promise<ItemAvailabilitySchedule> {
  const { data, error } = await supabaseAdmin
    .from('item_availability_schedules')
    .insert({
      tenant_id:     tenantId,
      item_id:       itemId,
      branch_id:     dto.branch_id ?? null,
      day_of_week:   dto.day_of_week,
      start_time:    dto.start_time,
      end_time:      dto.end_time,
      service_types: dto.service_types ?? ['dine_in', 'takeaway', 'delivery'],
    })
    .select()
    .single();

  if (error) throw new Error(`[AvailabilityService] createAvailabilitySchedule: ${error.message}`);
  return data;
}

export async function deleteAvailabilitySchedule(
  tenantId: string,
  scheduleId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('item_availability_schedules')
    .update({ is_active: false })
    .eq('tenant_id', tenantId)
    .eq('id', scheduleId);

  if (error) throw new Error(`[AvailabilityService] deleteAvailabilitySchedule: ${error.message}`);
}

/**
 * Checks if a menu item is scheduled to be available at the current time
 * for a given branch and service type.
 *
 * Returns true if:
 * - No schedules exist (open availability)
 * - At least one schedule matches the current day, time, and service type
 */
export async function isItemScheduledAvailable(
  tenantId: string,
  itemId: string,
  branchId: string,
  serviceType: ServiceType
): Promise<boolean> {
  const now      = new Date();
  const dayNames: AvailabilityDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today    = dayNames[now.getDay()];
  const timeNow  = now.toTimeString().slice(0, 5); // "HH:MM"

  // Fetch schedules applicable to this item/branch (or tenant-wide null branch)
  const { data, error } = await supabaseAdmin
    .from('item_availability_schedules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('item_id', itemId)
    .eq('is_active', true)
    .or(`branch_id.eq.${branchId},branch_id.is.null`);

  if (error) throw new Error(`[AvailabilityService] isItemScheduledAvailable: ${error.message}`);

  const schedules = data ?? [];

  // No schedules = unrestricted → available
  if (schedules.length === 0) return true;

  return schedules.some((s) => {
    const matchesDay         = s.day_of_week === today;
    const matchesTime        = s.start_time <= timeNow && timeNow < s.end_time;
    const matchesServiceType = (s.service_types as ServiceType[]).includes(serviceType);
    return matchesDay && matchesTime && matchesServiceType;
  });
}

// ─── Temporary Disablements ───────────────────────────────────

export async function getActiveDisablementsForBranch(
  tenantId: string,
  branchId: string
): Promise<ItemTemporaryDisablement[]> {
  const { data, error } = await supabaseAdmin
    .from('item_temporary_disablements')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .is('re_enabled_at', null)
    .or(`disable_until.is.null,disable_until.gt.${new Date().toISOString()}`);

  if (error) throw new Error(`[AvailabilityService] getActiveDisablementsForBranch: ${error.message}`);
  return data ?? [];
}

/** 86 an item — disable it at a branch, optionally until a future time. */
export async function temporarilyDisableItem(
  tenantId: string,
  itemId: string,
  dto: CreateTemporaryDisablementDto,
  disabledBy: string
): Promise<ItemTemporaryDisablement> {
  const { data, error } = await supabaseAdmin
    .from('item_temporary_disablements')
    .insert({
      tenant_id:     tenantId,
      item_id:       itemId,
      branch_id:     dto.branch_id,
      disabled_by:   disabledBy,
      reason:        dto.reason ?? null,
      disable_until: dto.disable_until ?? null,
      is_active:     true,
    })
    .select()
    .single();

  if (error) throw new Error(`[AvailabilityService] temporarilyDisableItem: ${error.message}`);

  logger.info({ tenantId, itemId, branchId: dto.branch_id, disabledBy }, 'Item temporarily disabled (86\'d)');
  return data;
}

/** Re-enable a previously disabled item. */
export async function reEnableItem(
  tenantId: string,
  itemId: string,
  branchId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('item_temporary_disablements')
    .update({
      is_active:     false,
      re_enabled_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('item_id', itemId)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .is('re_enabled_at', null);

  if (error) throw new Error(`[AvailabilityService] reEnableItem: ${error.message}`);

  logger.info({ tenantId, itemId, branchId }, 'Item re-enabled');
}

/**
 * Cleans up expired temporary disablements.
 * Designed to be called by a scheduled job (cron).
 */
export async function cleanupExpiredDisablements(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('item_temporary_disablements')
    .update({
      is_active:     false,
      re_enabled_at: new Date().toISOString(),
    })
    .eq('is_active', true)
    .is('re_enabled_at', null)
    .lt('disable_until', new Date().toISOString())
    .select('id');

  if (error) {
    logger.error({ err: error }, 'cleanupExpiredDisablements failed');
    return 0;
  }

  const count = data?.length ?? 0;
  if (count > 0) logger.info({ count }, 'Expired disablements cleaned up');
  return count;
}
