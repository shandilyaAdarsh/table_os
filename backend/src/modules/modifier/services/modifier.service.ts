// ============================================================
// src/modules/modifier/services/modifier.service.ts
// Service layer for Core Modifier System & Selection Validation Engine.
// ============================================================

import type { ModifierRepository } from '../repositories/modifier.repository';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type {
  ModifierGroup,
  ModifierOption,
  MenuItemModifierGroup,
  ResolvedModifierGroupRPC,
  ResolvedModifierOptionRPC,
  ModifierValidationResult,
  SelectionGroupInput
} from '../modifier.types';
import type {
  CreateModifierGroupDto,
  UpdateModifierGroupDto,
  CreateModifierOptionDto,
  UpdateModifierOptionDto,
  CreateMenuItemModifierGroupDto,
  UpdateMenuItemModifierGroupDto,
  ValidateModifierSelectionDto
} from '../modifier.dtos';

export class ModifierService {
  constructor(private readonly repository: ModifierRepository) {}

  // ─── Modifier Groups ──────────────────────────────────────────

  async createGroup(tenantId: string, userId: string, dto: CreateModifierGroupDto): Promise<ModifierGroup> {
    return this.repository.createGroup(tenantId, userId, dto);
  }

  async getGroupById(tenantId: string, id: string): Promise<ModifierGroup> {
    return this.repository.getGroupById(tenantId, id);
  }

  async listGroups(
    tenantId: string,
    filters: { is_active?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ data: ModifierGroup[]; count: number }> {
    return this.repository.listGroups(tenantId, filters);
  }

  async updateGroup(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateModifierGroupDto
  ): Promise<ModifierGroup> {
    // Business rules validation:
    // When updating, we must verify bounds if they are supplied
    const current = await this.repository.getGroupById(tenantId, id);
    const selectionMode = dto.selection_mode ?? current.selection_mode;
    const minSelect = dto.min_select ?? current.min_select;
    const maxSelect = dto.max_select ?? current.max_select;
    const isRequired = dto.is_required ?? current.is_required;
    const minQty = dto.min_quantity_per_option ?? current.min_quantity_per_option;
    const maxQty = dto.max_quantity_per_option ?? current.max_quantity_per_option;

    if (maxSelect < minSelect) {
      throw new AppError('max_select cannot be less than min_select', 400, ErrorCode.BAD_REQUEST);
    }
    if (selectionMode === 'single' && maxSelect > 1) {
      throw new AppError('single-select modifier groups cannot allow max_select > 1', 400, ErrorCode.BAD_REQUEST);
    }
    if (isRequired && minSelect < 1) {
      throw new AppError('required modifier groups must have min_select >= 1', 400, ErrorCode.BAD_REQUEST);
    }
    if (maxQty < minQty) {
      throw new AppError('max_quantity_per_option cannot be less than min_quantity_per_option', 400, ErrorCode.BAD_REQUEST);
    }

    return this.repository.updateGroup(tenantId, id, userId, dto);
  }

  async softDeleteGroup(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.repository.softDeleteGroup(tenantId, id, userId, versionNum);
  }

  // ─── Modifier Options ──────────────────────────────────────────

  async createOption(tenantId: string, userId: string, dto: CreateModifierOptionDto): Promise<ModifierOption> {
    // 1. Verify parent group exists and belongs to the same tenant
    const group = await this.repository.getGroupById(tenantId, dto.modifier_group_id);
    if (!group) throw new NotFoundError('Modifier group');

    // 2. Default options check for single select groups:
    // If the group is single select, and this option is marked default, verify there isn't already another default option.
    if (dto.is_default && group.selection_mode === 'single') {
      const activeOptions = await this.repository.listOptionsByGroup(tenantId, dto.modifier_group_id, { is_active: true });
      const currentDefault = activeOptions.find((opt) => opt.is_default);
      if (currentDefault) {
        throw new AppError(
          'Single-select modifier groups can only have at most one default option active.',
          400,
          ErrorCode.BAD_REQUEST
        );
      }
    }

    // 3. Parent nested option link check
    if (dto.parent_modifier_option_id) {
      const parentOption = await this.repository.getOptionById(tenantId, dto.parent_modifier_option_id);
      if (!parentOption.is_active) {
        throw new AppError('Cannot link to an inactive parent modifier option.', 400, ErrorCode.BAD_REQUEST);
      }
      if (parentOption.modifier_group_id === dto.modifier_group_id) {
        throw new AppError('Parent modifier option must belong to a different modifier group (cannot self-reference in same group).', 400, ErrorCode.BAD_REQUEST);
      }
    }

    return this.repository.createOption(tenantId, userId, dto);
  }

  async getOptionById(tenantId: string, id: string): Promise<ModifierOption> {
    return this.repository.getOptionById(tenantId, id);
  }

  async listOptionsByGroup(tenantId: string, groupId: string, filters: { is_active?: boolean } = {}): Promise<ModifierOption[]> {
    return this.repository.listOptionsByGroup(tenantId, groupId, filters);
  }

  async updateOption(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateModifierOptionDto
  ): Promise<ModifierOption> {
    const current = await this.repository.getOptionById(tenantId, id);

    // 1. Single default check
    const isDefault = dto.is_default ?? current.is_default;
    if (isDefault) {
      const group = await this.repository.getGroupById(tenantId, current.modifier_group_id);
      if (group.selection_mode === 'single') {
        const activeOptions = await this.repository.listOptionsByGroup(tenantId, current.modifier_group_id, { is_active: true });
        const otherDefault = activeOptions.find((opt) => opt.is_default && opt.id !== id);
        if (otherDefault) {
          throw new AppError(
            'Single-select modifier groups can only have at most one default option active.',
            400,
            ErrorCode.BAD_REQUEST
          );
        }
      }
    }

    // 2. Parent nesting check
    const parentId = dto.parent_modifier_option_id !== undefined ? dto.parent_modifier_option_id : current.parent_modifier_option_id;
    if (parentId) {
      if (parentId === id) {
        throw new AppError('Modifier option cannot be its own parent.', 400, ErrorCode.BAD_REQUEST);
      }
      const parentOption = await this.repository.getOptionById(tenantId, parentId);
      if (!parentOption.is_active) {
        throw new AppError('Cannot link to an inactive parent modifier option.', 400, ErrorCode.BAD_REQUEST);
      }
      if (parentOption.modifier_group_id === current.modifier_group_id) {
        throw new AppError('Parent modifier option must belong to a different modifier group.', 400, ErrorCode.BAD_REQUEST);
      }
    }

    return this.repository.updateOption(tenantId, id, userId, dto);
  }

  async softDeleteOption(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.repository.softDeleteOption(tenantId, id, userId, versionNum);
  }

  // ─── Menu Item Modifier Group Assignments ──────────────────────

  async assignGroupToItem(
    tenantId: string,
    userId: string,
    dto: CreateMenuItemModifierGroupDto
  ): Promise<MenuItemModifierGroup> {
    // 1. Verify item exists and belongs to tenant
    const { data: item, error: itemErr } = await this.repository['supabase']
      .from('menu_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', dto.menu_item_id)
      .is('deleted_at', null)
      .single();

    if (itemErr || !item) {
      throw new NotFoundError('Menu item');
    }

    // 2. Verify group exists and belongs to tenant
    const group = await this.repository.getGroupById(tenantId, dto.modifier_group_id);
    if (!group) throw new NotFoundError('Modifier group');

    return this.repository.assignGroupToItem(tenantId, userId, dto);
  }

  async getAssignmentById(tenantId: string, id: string): Promise<MenuItemModifierGroup> {
    return this.repository.getAssignmentById(tenantId, id);
  }

  async listAssignmentsByItem(tenantId: string, menuItemId: string): Promise<MenuItemModifierGroup[]> {
    return this.repository.listAssignmentsByItem(tenantId, menuItemId);
  }

  async updateAssignment(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateMenuItemModifierGroupDto
  ): Promise<MenuItemModifierGroup> {
    return this.repository.updateAssignment(tenantId, id, userId, dto);
  }

  async softDeleteAssignment(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.repository.softDeleteAssignment(tenantId, id, userId, versionNum);
  }

  // ─── Resolvers ──────────────────────────────────────────────

  async resolveMenuItemModifiers(tenantId: string, menuItemId: string): Promise<ResolvedModifierGroupRPC[]> {
    return this.repository.resolveMenuItemModifiers(tenantId, menuItemId);
  }

  // ─── Selection Validation & Pricing Delta Engine ───────────────────

  /**
   * pure validation utility & pricing calculator that checks selection payloads
   * completely offline using the resolved rules of the menu item.
   */
  async validateSelection(
    tenantId: string,
    dto: ValidateModifierSelectionDto
  ): Promise<ModifierValidationResult> {
    const { menu_item_id, selections } = dto;

    // 1. Fetch resolved rule set for this item (using deterministic RPC)
    const resolvedGroups = await this.repository.resolveMenuItemModifiers(tenantId, menu_item_id);

    const errors: ModifierValidationResult['errors'] = [];
    let totalDelta = BigInt(0);

    // Build indexing lookup structures for O(1) matching
    const groupLookup = new Map<string, ResolvedModifierGroupRPC>();
    const optionLookup = new Map<string, { option: ResolvedModifierOptionRPC; group: ResolvedModifierGroupRPC }>();

    for (const rg of resolvedGroups) {
      groupLookup.set(rg.modifier_group_id, rg);
      for (const opt of rg.options) {
        optionLookup.set(opt.id, { option: opt, group: rg });
      }
    }

    // Index payload selections
    const selectionMap = new Map<string, SelectionGroupInput>();
    for (const s of selections) {
      if (selectionMap.has(s.group_id)) {
        errors.push({
          code: 'DUPLICATE_GROUP_SELECTION',
          message: `Group ID ${s.group_id} was submitted multiple times in the selection payload.`,
          group_id: s.group_id
        });
      }
      selectionMap.set(s.group_id, s);
    }

    // 2. Validate Selection Mode & Limits for each assigned group
    for (const rg of resolvedGroups) {
      const payloadGroup = selectionMap.get(rg.modifier_group_id);
      const totalSelectionsCount = payloadGroup?.selections.length ?? 0;

      // Rule: Required groups must be selected
      if (rg.is_required && (!payloadGroup || totalSelectionsCount === 0)) {
        errors.push({
          code: 'REQUIRED_GROUP_MISSING',
          message: `Modifier group "${rg.group_name}" is required but no options were selected.`,
          group_id: rg.modifier_group_id
        });
        continue;
      }

      if (!payloadGroup || totalSelectionsCount === 0) {
        continue;
      }

      // Rule: Check option duplicates inside the same group in selection payload
      const optionIdsInGroup = new Set<string>();

      for (const optSel of payloadGroup.selections) {
        if (optionIdsInGroup.has(optSel.option_id)) {
          errors.push({
            code: 'DUPLICATE_OPTION_SELECTION',
            message: `Option ID ${optSel.option_id} was selected multiple times within the same group.`,
            group_id: rg.modifier_group_id,
            option_id: optSel.option_id
          });
        }
        optionIdsInGroup.add(optSel.option_id);

        // Fetch detailed option metadata
        const optMeta = optionLookup.get(optSel.option_id);
        if (!optMeta || optMeta.group.modifier_group_id !== rg.modifier_group_id) {
          errors.push({
            code: 'OPTION_NOT_IN_GROUP',
            message: `Selected option ${optSel.option_id} does not belong to group ${rg.modifier_group_id}.`,
            group_id: rg.modifier_group_id,
            option_id: optSel.option_id
          });
          continue;
        }

        // Rule: Check Option Quantity Limits
        if (rg.allow_quantity) {
          if (optSel.quantity < rg.min_qty_per_opt || optSel.quantity > rg.max_qty_per_opt) {
            errors.push({
              code: 'QUANTITY_OUT_OF_BOUNDS',
              message: `Quantity for option "${optMeta.option.name}" must be between ${rg.min_qty_per_opt} and ${rg.max_qty_per_opt}. Received: ${optSel.quantity}.`,
              group_id: rg.modifier_group_id,
              option_id: optSel.option_id
            });
          }
        } else {
          // If allow_quantity is false, option quantity MUST be strictly 1
          if (optSel.quantity !== 1) {
            errors.push({
              code: 'QUANTITY_NOT_ALLOWED',
              message: `Quantity configuration is disabled for group "${rg.group_name}". Option "${optMeta.option.name}" quantity must be exactly 1. Received: ${optSel.quantity}.`,
              group_id: rg.modifier_group_id,
              option_id: optSel.option_id
            });
          }
        }

        // 3. Pricing Delta Engine execution
        // BIGINT Math: Prevent float conversion. Multiply delta by quantity.
        const delta = BigInt(optMeta.option.price_delta_minor);
        const qty = BigInt(optSel.quantity);
        totalDelta += delta * qty;
      }

      // Rule: Selection count bounds check (min_select and max_select)
      // Note: Selection count refers to the number of distinct OPTIONS selected (choices),
      // whereas quantity is option-specific.
      if (totalSelectionsCount < rg.min_select) {
        errors.push({
          code: 'MIN_SELECT_NOT_SATISFIED',
          message: `Modifier group "${rg.group_name}" requires at least ${rg.min_select} option selections. Received: ${totalSelectionsCount}.`,
          group_id: rg.modifier_group_id
        });
      }

      if (rg.max_select !== null && totalSelectionsCount > rg.max_select) {
        errors.push({
          code: 'MAX_SELECT_EXCEEDED',
          message: `Modifier group "${rg.group_name}" allows at most ${rg.max_select} option selections. Received: ${totalSelectionsCount}.`,
          group_id: rg.modifier_group_id
        });
      }
    }

    // Validate that there aren't any payload groups that are NOT assigned to this item
    for (const s of selections) {
      if (!groupLookup.has(s.group_id)) {
        errors.push({
          code: 'GROUP_NOT_ASSIGNED',
          message: `Modifier group ID ${s.group_id} is not actively assigned to menu item ${menu_item_id}.`,
          group_id: s.group_id
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      pricing: {
        total_delta_minor: totalDelta.toString(),
      },
    };
  }
}
