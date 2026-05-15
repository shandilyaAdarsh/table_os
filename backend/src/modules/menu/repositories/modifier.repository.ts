// ============================================================
// src/modules/menu/repositories/modifier.repository.ts
// DB access for modifier groups and options.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type {
  ModifierGroup, ModifierOption,
  ModifierGroupWithOptions,
  BranchModifierOptionOverride,
  BranchModifierGroupOverride,
} from '../menu.types';
import type {
  CreateModifierGroupDto, UpdateModifierGroupDto,
  CreateModifierOptionDto, UpdateModifierOptionDto,
} from '../menu.dtos';

// ─── Modifier Group Queries ───────────────────────────────────

export async function findModifierGroupsByTenant(
  tenantId: string
): Promise<ModifierGroup[]> {
  const { data, error } = await supabaseAdmin
    .from('modifier_groups')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`[ModifierRepo] findModifierGroupsByTenant: ${error.message}`);
  return data ?? [];
}

export async function findModifierGroupById(
  tenantId: string,
  groupId: string
): Promise<ModifierGroup | null> {
  const { data, error } = await supabaseAdmin
    .from('modifier_groups')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', groupId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[ModifierRepo] findModifierGroupById: ${error.message}`);
  return data;
}

/** Load groups and their options for a given set of group IDs. */
export async function findModifierGroupsWithOptions(
  tenantId: string,
  groupIds: string[]
): Promise<ModifierGroupWithOptions[]> {
  if (groupIds.length === 0) return [];

  const { data: groups, error: gError } = await supabaseAdmin
    .from('modifier_groups')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', groupIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (gError) throw new Error(`[ModifierRepo] findModifierGroupsWithOptions (groups): ${gError.message}`);

  const { data: options, error: oError } = await supabaseAdmin
    .from('modifier_options')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('modifier_group_id', groupIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (oError) throw new Error(`[ModifierRepo] findModifierGroupsWithOptions (options): ${oError.message}`);

  const optionsByGroup = new Map<string, ModifierOption[]>();
  for (const opt of options ?? []) {
    const list = optionsByGroup.get(opt.modifier_group_id) ?? [];
    list.push(opt);
    optionsByGroup.set(opt.modifier_group_id, list);
  }

  return (groups ?? []).map((g) => ({
    ...g,
    options: optionsByGroup.get(g.id) ?? [],
  }));
}

// ─── Modifier Group Mutations ─────────────────────────────────

export async function createModifierGroup(
  tenantId: string,
  dto: CreateModifierGroupDto
): Promise<ModifierGroup> {
  const { data, error } = await supabaseAdmin
    .from('modifier_groups')
    .insert({
      tenant_id:   tenantId,
      name:        dto.name,
      description: dto.description ?? null,
      is_required: dto.is_required ?? false,
      min_select:  dto.min_select ?? 0,
      max_select:  dto.max_select ?? null,
      sort_order:  dto.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error, tenantId, dto }, 'createModifierGroup failed');
    throw new Error(`[ModifierRepo] createModifierGroup: ${error.message}`);
  }
  return data;
}

export async function updateModifierGroup(
  tenantId: string,
  groupId: string,
  dto: UpdateModifierGroupDto
): Promise<ModifierGroup> {
  const { data, error } = await supabaseAdmin
    .from('modifier_groups')
    .update({ ...dto })
    .eq('tenant_id', tenantId)
    .eq('id', groupId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw new Error(`[ModifierRepo] updateModifierGroup: ${error.message}`);
  return data;
}

export async function softDeleteModifierGroup(
  tenantId: string,
  groupId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('modifier_groups')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('tenant_id', tenantId)
    .eq('id', groupId);

  if (error) throw new Error(`[ModifierRepo] softDeleteModifierGroup: ${error.message}`);
}

// ─── Modifier Option Mutations ────────────────────────────────

export async function createModifierOption(
  tenantId: string,
  dto: CreateModifierOptionDto
): Promise<ModifierOption> {
  const { data, error } = await supabaseAdmin
    .from('modifier_options')
    .insert({
      tenant_id:         tenantId,
      modifier_group_id: dto.modifier_group_id,
      name:              dto.name,
      price_delta:       dto.price_delta ?? 0,
      is_default:        dto.is_default ?? false,
      sort_order:        dto.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw new Error(`[ModifierRepo] createModifierOption: ${error.message}`);
  return data;
}

export async function updateModifierOption(
  tenantId: string,
  optionId: string,
  dto: UpdateModifierOptionDto
): Promise<ModifierOption> {
  const { data, error } = await supabaseAdmin
    .from('modifier_options')
    .update({ ...dto })
    .eq('tenant_id', tenantId)
    .eq('id', optionId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw new Error(`[ModifierRepo] updateModifierOption: ${error.message}`);
  return data;
}

export async function softDeleteModifierOption(
  tenantId: string,
  optionId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('modifier_options')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('tenant_id', tenantId)
    .eq('id', optionId);

  if (error) throw new Error(`[ModifierRepo] softDeleteModifierOption: ${error.message}`);
}

// ─── Branch Modifier Overrides ────────────────────────────────

export async function upsertBranchModifierOptionOverride(
  tenantId: string,
  branchId: string,
  modifierOptionId: string,
  override: Partial<{ override_price_delta: number | null; is_available: boolean | null }>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('branch_modifier_option_overrides')
    .upsert(
      { tenant_id: tenantId, branch_id: branchId, modifier_option_id: modifierOptionId, ...override },
      { onConflict: 'tenant_id,branch_id,modifier_option_id' }
    );

  if (error) throw new Error(`[ModifierRepo] upsertBranchModifierOptionOverride: ${error.message}`);
}

export async function upsertBranchModifierGroupOverride(
  tenantId: string,
  branchId: string,
  modifierGroupId: string,
  isAvailable: boolean
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('branch_modifier_group_overrides')
    .upsert(
      { tenant_id: tenantId, branch_id: branchId, modifier_group_id: modifierGroupId, is_available: isAvailable },
      { onConflict: 'tenant_id,branch_id,modifier_group_id' }
    );

  if (error) throw new Error(`[ModifierRepo] upsertBranchModifierGroupOverride: ${error.message}`);
}

/** Load all branch overrides for modifier options in a set of groups. */
export async function findBranchModifierOverrides(
  tenantId: string,
  branchId: string,
  modifierOptionIds: string[]
): Promise<BranchModifierOptionOverride[]> {
  if (modifierOptionIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('branch_modifier_option_overrides')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .in('modifier_option_id', modifierOptionIds);

  if (error) throw new Error(`[ModifierRepo] findBranchModifierOverrides: ${error.message}`);
  return data ?? [];
}

export async function findBranchModifierGroupOverrides(
  tenantId: string,
  branchId: string,
  modifierGroupIds: string[]
): Promise<BranchModifierGroupOverride[]> {
  if (modifierGroupIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('branch_modifier_group_overrides')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .in('modifier_group_id', modifierGroupIds);

  if (error) throw new Error(`[ModifierRepo] findBranchModifierGroupOverrides: ${error.message}`);
  return data ?? [];
}
