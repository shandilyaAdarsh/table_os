// ============================================================
// src/modules/tables/repositories/table-floor.repository.ts
// DB access for table floors. No business logic.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { TableFloor } from '../tables.types';
import type { CreateFloorInput, UpdateFloorInput } from '../tables.validators';

export async function listFloors(tenantId: string, branchId?: string): Promise<TableFloor[]> {
  let q = supabaseAdmin
    .from('table_floors')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (branchId) q = q.eq('branch_id', branchId);

  const { data, error } = await q;
  if (error) {
    logger.error({ err: error, tenantId }, 'listFloors failed');
    throw new Error(`[FloorRepo] listFloors: ${error.message}`);
  }
  return data ?? [];
}

export async function findFloorById(tenantId: string, floorId: string): Promise<TableFloor | null> {
  const { data, error } = await supabaseAdmin
    .from('table_floors')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', floorId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[FloorRepo] findFloorById: ${error.message}`);
  return data;
}

export async function createFloor(
  tenantId: string,
  dto: CreateFloorInput,
  _createdBy: string,
): Promise<TableFloor> {
  const { data, error } = await supabaseAdmin
    .from('table_floors')
    .insert({
      tenant_id:  tenantId,
      branch_id:  dto.branch_id,
      name:       dto.name,
      sort_order: dto.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error, tenantId, dto }, 'createFloor failed');
    throw new Error(`[FloorRepo] createFloor: ${error.message}`);
  }
  return data;
}

export async function updateFloor(
  tenantId: string,
  floorId: string,
  dto: UpdateFloorInput,
  _updatedBy: string,
): Promise<TableFloor | null> {
  const { version_num, ...updateFields } = dto;
  const { data, error } = await supabaseAdmin
    .from('table_floors')
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', floorId)
    .eq('version_num', version_num)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) throw new Error(`[FloorRepo] updateFloor: ${error.message}`);
  return data;
}

export async function softDeleteFloor(tenantId: string, floorId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('table_floors')
    .update({ deleted_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', floorId)
    .is('deleted_at', null);

  if (error) throw new Error(`[FloorRepo] softDeleteFloor: ${error.message}`);
}
