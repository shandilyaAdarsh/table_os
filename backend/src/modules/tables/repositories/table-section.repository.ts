// ============================================================
// src/modules/tables/repositories/table-section.repository.ts
// DB access for table sections. Uses supabaseAdmin (service_role).
// If the table is missing in the schema, a descriptive error is thrown.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { TableSection } from '../tables.types';
import type { CreateSectionInput, UpdateSectionInput } from '../tables.validators';

export async function listSections(tenantId: string, branchId?: string): Promise<TableSection[]> {
  let q = supabaseAdmin
    .from('table_sections')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (branchId) q = q.eq('branch_id', branchId);

  const { data, error } = await q;
  if (error) {
    logger.error({ err: error, tenantId, branchId }, 'listSections failed');
    throw new Error(`[SectionRepo] listSections: ${error.message}`);
  }
  return data ?? [];
}

export async function findSectionById(tenantId: string, sectionId: string): Promise<TableSection | null> {
  const { data, error } = await supabaseAdmin
    .from('table_sections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', sectionId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`[SectionRepo] findSectionById: ${error.message}`);
  }
  return data;
}

export async function createSection(
  tenantId: string,
  dto: CreateSectionInput,
  _actorId: string,
): Promise<TableSection> {
  const { data, error } = await supabaseAdmin
    .from('table_sections')
    .insert({
      tenant_id:  tenantId,
      branch_id:  dto.branch_id,
      name:       dto.name,
      sort_order: dto.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error, tenantId, dto }, 'createSection failed');
    throw new Error(`[SectionRepo] createSection: ${error.message}`);
  }
  return data;
}

export async function updateSection(
  tenantId: string,
  sectionId: string,
  dto: UpdateSectionInput,
  _actorId: string,
): Promise<TableSection | null> {
  const { version_num, ...updateFields } = dto;
  const { data, error } = await supabaseAdmin
    .from('table_sections')
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', sectionId)
    .eq('version_num', version_num)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`[SectionRepo] updateSection: ${error.message}`);
  }
  return data;
}

export async function softDeleteSection(tenantId: string, sectionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('table_sections')
    .update({ deleted_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', sectionId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`[SectionRepo] softDeleteSection: ${error.message}`);
  }
}
