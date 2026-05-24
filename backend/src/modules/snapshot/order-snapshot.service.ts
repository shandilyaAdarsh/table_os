// ============================================================
// src/modules/snapshot/order-snapshot.service.ts
// Handles checkout-time immutable order snapshotting and validation.
// ============================================================

import crypto from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as cartRepo from '../cart/cart.repository';
import { BranchMenuResolutionService } from '../overrides/services/branch-menu-resolution.service';
import type { ResolvedTaxBatchRPC } from '../tax/tax.types';

export async function createOrderSnapshot(
  tenantId: string,
  cartId: string,
  versionNum: number,
): Promise<string> {
  // 1. Lock the cart to prevent further mutations during validation & checkout
  const lockedCart = await cartRepo.updateCartStatus(tenantId, cartId, 'locked', versionNum);
  if (!lockedCart) {
    throw new AppError('Cart was modified by another request. Reload and retry.', 409, ErrorCode.CONFLICT);
  }

  try {
    // 2. Fetch all cart items and modifier selections
    const items = await cartRepo.listCartItems(cartId);
    if (items.length === 0) {
      throw new AppError('Cart is empty', 422, ErrorCode.VALIDATION_ERROR);
    }

    const itemIds = items.map((i) => i.id);
    const modifiers = await cartRepo.listCartItemModifiers(itemIds);

    // 3. Resolve live branch menu items for price & availability verification
    const resolutionService = new BranchMenuResolutionService(supabaseAdmin);
    const effectiveMenu = await resolutionService.resolveEffectiveMenu({
      tenantId,
      branchId: lockedCart.branch_id,
      timestamp: new Date().toISOString(),
    });

    const menuItemsMap = new Map<string, any>();
    for (const cat of effectiveMenu.categories) {
      for (const it of cat.items) {
        menuItemsMap.set(it.id, { ...it, categoryName: cat.name });
      }
    }

    // 4. Validate items & modifiers
    let calculatedSubtotal = 0;
    const itemCalculatedLines: any[] = [];

    for (const item of items) {
      const liveItem = menuItemsMap.get(item.menu_item_id);
      if (!liveItem || !liveItem.is_visible) {
        throw new AppError(`Item '${item.item_name_snapshot}' is no longer available.`, 422, ErrorCode.VALIDATION_ERROR);
      }

      // pricing validation
      const liveUnitPrice = liveItem.price.price_minor;
      if (liveUnitPrice !== Number(item.unit_price_minor_snapshot)) {
        throw new AppError(`Price of '${item.item_name_snapshot}' has changed. Please review your cart.`, 422, ErrorCode.VALIDATION_ERROR);
      }

      const itemModifiers = modifiers.filter((m) => m.cart_item_id === item.id);
      const modifiersToSave: any[] = [];
      let itemModifiersTotal = 0;

      for (const mod of itemModifiers) {
        const group = liveItem.modifier_groups.find((g: any) => g.id === mod.modifier_group_id);
        if (!group || !group.is_available) {
          throw new AppError(`Modifier group '${mod.modifier_group_name_snapshot}' is no longer available.`, 422, ErrorCode.VALIDATION_ERROR);
        }

        const option = group.options.find((o: any) => o.id === mod.modifier_option_id);
        if (!option || !option.is_available) {
          throw new AppError(`Modifier option '${mod.modifier_option_name_snapshot}' is no longer available.`, 422, ErrorCode.VALIDATION_ERROR);
        }

        if (Number(option.price_delta_minor) !== Number(mod.price_delta_minor_snapshot)) {
          throw new AppError(`Price of modifier option '${mod.modifier_option_name_snapshot}' has changed.`, 422, ErrorCode.VALIDATION_ERROR);
        }

        itemModifiersTotal += Number(mod.price_delta_minor_snapshot);

        modifiersToSave.push({
          modifier_group_id: mod.modifier_group_id,
          modifier_option_id: mod.modifier_option_id,
          modifier_group_name_snapshot: mod.modifier_group_name_snapshot,
          modifier_option_name_snapshot: mod.modifier_option_name_snapshot,
          price_delta_minor: Number(mod.price_delta_minor_snapshot),
        });
      }

      const itemLineTotal = (liveUnitPrice + itemModifiersTotal) * item.quantity;
      calculatedSubtotal += itemLineTotal;

      itemCalculatedLines.push({
        cartItemId: item.id,
        menu_item_id: item.menu_item_id,
        item_name_snapshot: item.item_name_snapshot,
        item_sku_snapshot: item.item_sku_snapshot,
        item_category_name_snapshot: liveItem.categoryName,
        quantity: item.quantity,
        unit_price_minor: liveUnitPrice,
        line_total_minor: itemLineTotal,
        is_branch_price_override: liveItem.price.is_override ?? false,
        item_notes: item.item_notes,
        display_order: item.display_order,
        modifiers: modifiersToSave,
      });
    }

    // 5. Batch resolve taxes for all items in one query
    const menuItemIds = items.map((i) => i.menu_item_id);
    const { data: taxBatch, error: taxError } = await supabaseAdmin.rpc('resolve_tax_for_menu_items_batch', {
      p_tenant_id: tenantId,
      p_menu_item_ids: menuItemIds,
      p_effective_at: new Date().toISOString(),
    });

    if (taxError) {
      throw new AppError(`Failed to resolve tax profiles: ${taxError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const taxBatchResults = (taxBatch ?? []) as ResolvedTaxBatchRPC[];
    const taxProfilesMap = new Map<string, ResolvedTaxBatchRPC>();
    for (const r of taxBatchResults) {
      taxProfilesMap.set(r.menu_item_id, r);
    }

    const taxProfileIds = Array.from(new Set(taxBatchResults.map((r) => r.tax_profile_id)));
    let taxProfiles: any[] = [];
    if (taxProfileIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('tax_profiles')
        .select('id, name')
        .in('id', taxProfileIds);
      if (error) throw new AppError('Failed to fetch tax profile details', 500, ErrorCode.INTERNAL_SERVER_ERROR);
      taxProfiles = data ?? [];
    }

    const taxProfileNameMap = new Map<string, string>();
    for (const p of taxProfiles) {
      taxProfileNameMap.set(p.id, p.name);
    }

    // 6. Inclusive & Exclusive Tax calculations using integer math
    const taxCalculations = new Map<string, {
      tax_profile_name_snapshot: string;
      tax_strategy_id: string;
      rate_basis_points: number;
      calc_mode_snapshot: string;
      taxable_amount_minor: number;
      tax_amount_minor: number;
    }>();

    let calculatedTaxTotal = 0;

    for (const line of itemCalculatedLines) {
      const taxInfo = taxProfilesMap.get(line.menu_item_id);
      if (!taxInfo || taxInfo.total_basis_points === 0) continue;

      const profileName = taxProfileNameMap.get(taxInfo.tax_profile_id) ?? 'Tax';
      const existingCalc = taxCalculations.get(taxInfo.tax_profile_id) ?? {
        tax_profile_name_snapshot: profileName,
        tax_strategy_id: taxInfo.tax_profile_id,
        rate_basis_points: taxInfo.total_basis_points,
        calc_mode_snapshot: taxInfo.calculation_mode,
        taxable_amount_minor: 0,
        tax_amount_minor: 0,
      };

      let lineTaxAmount = 0;
      if (taxInfo.calculation_mode === 'inclusive') {
        // Base is included in line_total_minor
        // base = (total * 10000) / (10000 + rateBP)
        const base = Math.round((line.line_total_minor * 10000) / (10000 + taxInfo.total_basis_points));
        lineTaxAmount = line.line_total_minor - base;
        existingCalc.taxable_amount_minor += base;
      } else {
        // Exclusive tax is on top of line_total_minor
        lineTaxAmount = Math.round((line.line_total_minor * taxInfo.total_basis_points) / 10000);
        existingCalc.taxable_amount_minor += line.line_total_minor;
        calculatedTaxTotal += lineTaxAmount;
      }

      existingCalc.tax_amount_minor += lineTaxAmount;
      taxCalculations.set(taxInfo.tax_profile_id, existingCalc);
    }

    const calculatedGrandTotal = calculatedSubtotal + calculatedTaxTotal;

    // 7. Compute deterministic SHA-256 canonical snapshot hash
    const payloadToHash = {
      subtotal_minor: calculatedSubtotal,
      tax_total_minor: calculatedTaxTotal,
      discount_total_minor: 0,
      grand_total_minor: calculatedGrandTotal,
      item_count: itemCalculatedLines.length,
      currency_code: 'USD',
      items: itemCalculatedLines.map((i) => ({
        menu_item_id: i.menu_item_id,
        quantity: i.quantity,
        unit_price_minor: i.unit_price_minor,
        line_total_minor: i.line_total_minor,
        modifiers: i.modifiers.map((m: any) => ({
          modifier_group_id: m.modifier_group_id,
          modifier_option_id: m.modifier_option_id,
          price_delta_minor: m.price_delta_minor,
        })).sort((a: any, b: any) => a.modifier_group_id.localeCompare(b.modifier_group_id) || a.modifier_option_id.localeCompare(b.modifier_option_id))
      })).sort((a: any, b: any) => a.menu_item_id.localeCompare(b.menu_item_id))
    };

    const canonicalString = JSON.stringify(payloadToHash);
    const hash = 'sha256:' + crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
    const checkoutTimestamp = new Date().toISOString();

    // 8. Write immutable snapshot hierarchy
    const { data: snapshotHeader, error: headerError } = await supabaseAdmin
      .from('order_snapshots')
      .insert({
        tenant_id: tenantId,
        branch_id: lockedCart.branch_id,
        subtotal_minor: calculatedSubtotal,
        tax_total_minor: calculatedTaxTotal,
        discount_total_minor: 0,
        grand_total_minor: calculatedGrandTotal,
        currency_code: 'USD',
        item_count: itemCalculatedLines.length,
        menu_snapshot_hash: hash,
        checkout_timestamp: checkoutTimestamp,
        pricing_version: 'v1',
        tax_version: 'v1',
        override_version: 'v1',
        availability_version: 'v1',
      })
      .select()
      .single();

    if (headerError) {
      throw new AppError(`Failed to create order snapshot header: ${headerError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const snapshotId = snapshotHeader.id;

    for (const line of itemCalculatedLines) {
      const { data: itemSnapshot, error: lineError } = await supabaseAdmin
        .from('order_item_snapshots')
        .insert({
          tenant_id: tenantId,
          order_snapshot_id: snapshotId,
          menu_item_id: line.menu_item_id,
          item_name_snapshot: line.item_name_snapshot,
          item_sku_snapshot: line.item_sku_snapshot,
          item_category_name_snapshot: line.item_category_name_snapshot,
          quantity: line.quantity,
          unit_price_minor: line.unit_price_minor,
          line_total_minor: line.line_total_minor,
          is_branch_price_override: line.is_branch_price_override,
          item_notes: line.item_notes,
          display_order: line.display_order,
        })
        .select()
        .single();

      if (lineError) {
        throw new AppError(`Failed to create order item snapshot: ${lineError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      if (line.modifiers.length > 0) {
        const { error: modError } = await supabaseAdmin
          .from('order_modifier_snapshots')
          .insert(
            line.modifiers.map((m: any) => ({
              tenant_id: tenantId,
              order_item_snapshot_id: itemSnapshot.id,
              modifier_group_id: m.modifier_group_id,
              modifier_option_id: m.modifier_option_id,
              modifier_group_name_snapshot: m.modifier_group_name_snapshot,
              modifier_option_name_snapshot: m.modifier_option_name_snapshot,
              price_delta_minor: m.price_delta_minor,
            }))
          );

        if (modError) {
          throw new AppError(`Failed to create order modifier snapshot: ${modError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
        }
      }
    }

    const taxCalcsList = Array.from(taxCalculations.values());
    if (taxCalcsList.length > 0) {
      const { error: taxCalcError } = await supabaseAdmin
        .from('order_tax_snapshots')
        .insert(
          taxCalcsList.map((t) => ({
            tenant_id: tenantId,
            order_snapshot_id: snapshotId,
            tax_profile_name_snapshot: t.tax_profile_name_snapshot,
            tax_strategy_id: t.tax_strategy_id,
            rate_basis_points: t.rate_basis_points,
            calc_mode_snapshot: t.calc_mode_snapshot,
            taxable_amount_minor: t.taxable_amount_minor,
            tax_amount_minor: t.tax_amount_minor,
          }))
        );

      if (taxCalcError) {
        throw new AppError(`Failed to create order tax snapshot: ${taxCalcError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }
    }

    return snapshotId;
  } catch (err) {
    // If anything fails, revert the cart back to 'open' status to allow customer to adjust
    await cartRepo.updateCartStatus(tenantId, cartId, 'open', versionNum + 1);
    throw err;
  }
}
