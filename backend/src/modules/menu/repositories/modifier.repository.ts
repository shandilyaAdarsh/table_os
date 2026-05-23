// ============================================================
// src/modules/menu/repositories/modifier.repository.ts
// DB access for modifier groups and options.
// Bridges the legacy menu module to the new Core Modifier System schema.
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

// ─── Helper Mappers ───────────────────────────────────────────

function mapGroup(g: any): ModifierGroup {
  if (!g) return g;
  return {
    id: g.id,
    tenant_id: g.tenant_id,
    name: g.name,
    description: g.description,
    is_required: g.is_required,
    min_select: g.min_select,
    max_select: g.max_select,
    sort_order: g.display_order ?? 0,
    is_active: g.is_active,
    created_at: g.created_at,
    updated_at: g.updated_at,
    deleted_at: g.deleted_at,
  };
}

function mapOption(opt: any): ModifierOption {
  if (!opt) return opt;
  return {
    id: opt.id,
    tenant_id: opt.tenant_id,
    modifier_group_id: opt.modifier_group_id,
    name: opt.name,
    price_delta: opt.price_delta_minor !== null && opt.price_delta_minor !== undefined
      ? Number(opt.price_delta_minor) / 100
      : 0,
    is_default: opt.is_default,
    sort_order: opt.display_order ?? 0,
    is_active: opt.is_active,
    created_at: opt.created_at,
    updated_at: opt.updated_at,
    deleted_at: opt.deleted_at,
  };
}

// ─── Modifier Group Queries ───────────────────────────────────

export async function findModifierGroupsByTenant(
  tenantId: string
): Promise<ModifierGroup[]> {
  const { data, error } = await supabaseAdmin
    .from('modifier_groups')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('display_order', { ascending: true });

  if (error) throw new Error(`[ModifierRepo] findModifierGroupsByTenant: ${error.message}`);
  return (data ?? []).map(mapGroup);
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
  return data ? mapGroup(data) : null;
}

export async function findAnyModifierGroupById(
  tenantId: string,
  groupId: string
): Promise<ModifierGroup | null> {
  const { data, error } = await supabaseAdmin
    .from('modifier_groups')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw new Error(`[ModifierRepo] findAnyModifierGroupById: ${error.message}`);
  return data ? mapGroup(data) : null;
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
    .order('display_order', { ascending: true });

  if (gError) throw new Error(`[ModifierRepo] findModifierGroupsWithOptions (groups): ${gError.message}`);

  const { data: options, error: oError } = await supabaseAdmin
    .from('modifier_options')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('modifier_group_id', groupIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_order', { ascending: true });

  if (oError) throw new Error(`[ModifierRepo] findModifierGroupsWithOptions (options): ${oError.message}`);

  const optionsByGroup = new Map<string, ModifierOption[]>();
  for (const opt of options ?? []) {
    const mapped = mapOption(opt);
    const list = optionsByGroup.get(mapped.modifier_group_id) ?? [];
    list.push(mapped);
    optionsByGroup.set(mapped.modifier_group_id, list);
  }

  return (groups ?? []).map((g) => ({
    ...mapGroup(g),
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
      display_order: dto.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error, tenantId, dto }, 'createModifierGroup failed');
    throw new Error(`[ModifierRepo] createModifierGroup: ${error.message}`);
  }
  return mapGroup(data);
}

export async function updateModifierGroup(
  tenantId: string,
  groupId: string,
  dto: UpdateModifierGroupDto
): Promise<ModifierGroup> {
  const mappedPayload: any = { ...dto };
  if (dto.sort_order !== undefined) {
    mappedPayload.display_order = dto.sort_order;
    delete mappedPayload.sort_order;
  }

  const { data, error } = await supabaseAdmin
    .from('modifier_groups')
    .update(mappedPayload)
    .eq('tenant_id', tenantId)
    .eq('id', groupId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw new Error(`[ModifierRepo] updateModifierGroup: ${error.message}`);
  return mapGroup(data);
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

export async function restoreModifierGroup(
  tenantId: string,
  groupId: string
): Promise<ModifierGroup> {
  const { data, error } = await supabaseAdmin
    .from('modifier_groups')
    .update({ deleted_at: null, is_active: true })
    .eq('tenant_id', tenantId)
    .eq('id', groupId)
    .select()
    .single();

  if (error) throw new Error(`[ModifierRepo] restoreModifierGroup: ${error.message}`);
  return mapGroup(data);
}

// ─── Modifier Option Queries/Mutations ────────────────────────

export async function findModifierOptionById(
  tenantId: string,
  optionId: string
): Promise<ModifierOption | null> {
  const { data, error } = await supabaseAdmin
    .from('modifier_options')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', optionId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[ModifierRepo] findModifierOptionById: ${error.message}`);
  return data ? mapOption(data) : null;
}

export async function findAnyModifierOptionById(
  tenantId: string,
  optionId: string
): Promise<ModifierOption | null> {
  const { data, error } = await supabaseAdmin
    .from('modifier_options')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', optionId)
    .maybeSingle();

  if (error) throw new Error(`[ModifierRepo] findAnyModifierOptionById: ${error.message}`);
  return data ? mapOption(data) : null;
}

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
      price_delta_minor: dto.price_delta !== undefined ? Math.round(dto.price_delta * 100) : 0,
      is_default:        dto.is_default ?? false,
      display_order:     dto.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw new Error(`[ModifierRepo] createModifierOption: ${error.message}`);
  return mapOption(data);
}

export async function updateModifierOption(
  tenantId: string,
  optionId: string,
  dto: UpdateModifierOptionDto
): Promise<ModifierOption> {
  const mappedPayload: any = { ...dto };
  if (dto.sort_order !== undefined) {
    mappedPayload.display_order = dto.sort_order;
    delete mappedPayload.sort_order;
  }
  if (dto.price_delta !== undefined) {
    mappedPayload.price_delta_minor = Math.round(dto.price_delta * 100);
    delete mappedPayload.price_delta;
  }

  const { data, error } = await supabaseAdmin
    .from('modifier_options')
    .update(mappedPayload)
    .eq('tenant_id', tenantId)
    .eq('id', optionId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw new Error(`[ModifierRepo] updateModifierOption: ${error.message}`);
  return mapOption(data);
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

export async function restoreModifierOption(
  tenantId: string,
  optionId: string
): Promise<ModifierOption> {
  const { data, error } = await supabaseAdmin
    .from('modifier_options')
    .update({ deleted_at: null, is_active: true })
    .eq('tenant_id', tenantId)
    .eq('id', optionId)
    .select()
    .single();

  if (error) throw new Error(`[ModifierRepo] restoreModifierOption: ${error.message}`);
  return mapOption(data);
}

// ─── Branch Modifier Overrides ────────────────────────────────

export async function upsertBranchModifierOptionOverride(
  tenantId: string,
  branchId: string,
  modifierOptionId: string,
  override: Partial<{ override_price_delta: number | null; is_available: boolean | null }>
): Promise<void> {
  const mappedOverride: any = { ...override };
  if (override.override_price_delta !== undefined) {
    mappedOverride.override_price_delta_minor = override.override_price_delta !== null
      ? Math.round(override.override_price_delta * 100)
      : null;
    delete mappedOverride.override_price_delta;
  }

  const { error } = await supabaseAdmin
    .from('branch_modifier_option_overrides')
    .upsert(
      { tenant_id: tenantId, branch_id: branchId, modifier_option_id: modifierOptionId, ...mappedOverride },
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

  return (data ?? []).map((o: any) => ({
    ...o,
    override_price_delta: o.override_price_delta_minor !== undefined && o.override_price_delta_minor !== null
      ? Number(o.override_price_delta_minor) / 100
      : null
  }));
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
