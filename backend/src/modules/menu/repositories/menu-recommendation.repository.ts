// ============================================================
// src/modules/menu/repositories/menu-recommendation.repository.ts
// DB access for menu item recommendations
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { MenuItemRecommendation } from '../menu.types';
import type { CreateRecommendationDto, UpdateRecommendationDto } from '../menu.dtos';

export async function findRecommendationsForItems(
  tenantId: string,
  itemIds: string[],
  limit: number = 5
): Promise<MenuItemRecommendation[]> {
  if (itemIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('menu_item_recommendations')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('source_menu_item_id', itemIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ error, tenantId, itemIds }, 'Error finding recommendations for items');
    throw new Error('Database error fetching recommendations');
  }

  return data as MenuItemRecommendation[];
}

export async function upsertRecommendation(
  tenantId: string,
  sourceItemId: string,
  dto: CreateRecommendationDto
): Promise<MenuItemRecommendation> {
  // Point 7: Application-layer self-reference guard (DB CHECK also catches this)
  if (sourceItemId === dto.recommended_menu_item_id) {
    throw new Error('Cannot recommend an item to itself');
  }

  const payload = {
    tenant_id: tenantId,
    branch_id: dto.branch_id ?? null,
    source_menu_item_id: sourceItemId,
    recommended_menu_item_id: dto.recommended_menu_item_id,
    recommendation_type: dto.recommendation_type,
    priority: dto.priority ?? 0,
    is_active: true,
    deleted_at: null, // re-activate if previously soft-deleted
  };

  const { data, error } = await supabaseAdmin
    .from('menu_item_recommendations')
    .upsert(payload, { 
      onConflict: 'tenant_id, branch_id, source_menu_item_id, recommended_menu_item_id',
      ignoreDuplicates: false 
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, tenantId, sourceItemId }, 'Error upserting recommendation');
    throw new Error('Database error upserting recommendation');
  }

  return data as MenuItemRecommendation;
}

export async function updateRecommendation(
  tenantId: string,
  id: string,
  dto: UpdateRecommendationDto
): Promise<MenuItemRecommendation> {
  const { data, error } = await supabaseAdmin
    .from('menu_item_recommendations')
    .update({
      ...dto,
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error({ error, tenantId, id }, 'Error updating recommendation');
    throw new Error('Database error updating recommendation');
  }

  return data as MenuItemRecommendation;
}

export async function softDeleteRecommendation(
  tenantId: string,
  id: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('menu_item_recommendations')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) {
    logger.error({ error, tenantId, id }, 'Error soft deleting recommendation');
    throw new Error('Database error deleting recommendation');
  }
}
