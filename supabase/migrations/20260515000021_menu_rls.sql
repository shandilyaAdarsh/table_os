-- ============================================================
-- Migration: 020_menu_rls
-- Row-Level Security for all menu foundation tables.
-- Pattern: service_role bypasses all policies (admin backend).
-- Authenticated anon reads own tenant's data only.
-- Writes always go through service_role (backend).
-- ============================================================

-- ─── Enable RLS ───────────────────────────────────────────────
ALTER TABLE public.tax_groups                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_category_branch_visibility  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_images                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_options                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifier_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_menu_item_overrides       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_modifier_option_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_modifier_group_overrides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_availability_schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_temporary_disablements      ENABLE ROW LEVEL SECURITY;

-- ─── Tenant-scoped SELECT policies ───────────────────────────
-- All authenticated users can SELECT within their own tenant.
-- Writes are controlled by the backend (service_role), not direct client access.

CREATE POLICY menu_tax_groups_tenant_select ON public.tax_groups
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY menu_tax_rates_tenant_select ON public.tax_rates
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY menu_categories_tenant_select ON public.menu_categories
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY menu_cat_visibility_tenant_select ON public.menu_category_branch_visibility
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      (branch_id = ANY(public.current_branch_ids()) OR public.current_branch_ids() = '{}')
    )
  );

CREATE POLICY menu_items_tenant_select ON public.menu_items
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY menu_item_images_tenant_select ON public.menu_item_images
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY modifier_groups_tenant_select ON public.modifier_groups
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY modifier_options_tenant_select ON public.modifier_options
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY item_modifier_groups_tenant_select ON public.menu_item_modifier_groups
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY branch_item_overrides_select ON public.branch_menu_item_overrides
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY branch_mod_option_overrides_select ON public.branch_modifier_option_overrides
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY branch_mod_group_overrides_select ON public.branch_modifier_group_overrides
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY item_avail_schedules_select ON public.item_availability_schedules
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      (branch_id IS NULL OR branch_id = ANY(public.current_branch_ids()))
    )
  );

CREATE POLICY item_temp_disablements_select ON public.item_temporary_disablements
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

-- ─── Write policies: backend-only via service_role ────────────
-- service_role bypasses RLS by default in Supabase.
-- These deny policies ensure authenticated clients (e.g., Realtime)
-- cannot perform mutations directly.

CREATE POLICY menu_tax_groups_no_write ON public.tax_groups
  FOR INSERT TO authenticated WITH CHECK (FALSE);
CREATE POLICY menu_tax_groups_no_update ON public.tax_groups
  FOR UPDATE TO authenticated USING (FALSE);

CREATE POLICY menu_items_no_write ON public.menu_items
  FOR INSERT TO authenticated WITH CHECK (FALSE);
CREATE POLICY menu_items_no_update ON public.menu_items
  FOR UPDATE TO authenticated USING (FALSE);

CREATE POLICY modifier_groups_no_write ON public.modifier_groups
  FOR INSERT TO authenticated WITH CHECK (FALSE);
CREATE POLICY modifier_options_no_write ON public.modifier_options
  FOR INSERT TO authenticated WITH CHECK (FALSE);
