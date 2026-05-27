-- Migration to add get_onboarding_status RPC

CREATE OR REPLACE FUNCTION public.get_onboarding_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_categories boolean;
  v_has_menu_items boolean;
  v_has_tax_profiles boolean;
  v_has_tables boolean;
  v_has_staff boolean;
  v_has_kds_stations boolean;
  v_setup_stage text;
BEGIN
  -- Check existences using lightweight EXISTS queries
  SELECT EXISTS(SELECT 1 FROM public.menu_categories WHERE tenant_id = p_tenant_id AND deleted_at IS NULL) INTO v_has_categories;
  SELECT EXISTS(SELECT 1 FROM public.menu_items WHERE tenant_id = p_tenant_id AND deleted_at IS NULL) INTO v_has_menu_items;
  SELECT EXISTS(SELECT 1 FROM public.tax_profiles WHERE tenant_id = p_tenant_id AND deleted_at IS NULL) INTO v_has_tax_profiles;
  SELECT EXISTS(SELECT 1 FROM public.tables WHERE tenant_id = p_tenant_id AND deleted_at IS NULL) INTO v_has_tables;
  SELECT EXISTS(SELECT 1 FROM public.staff WHERE tenant_id = p_tenant_id AND is_active = true) INTO v_has_staff;
  SELECT EXISTS(SELECT 1 FROM public.kitchen_stations WHERE tenant_id = p_tenant_id AND deleted_at IS NULL) INTO v_has_kds_stations;

  -- Determine stage
  IF v_has_categories AND v_has_menu_items AND v_has_tax_profiles AND v_has_tables AND v_has_staff AND v_has_kds_stations THEN
    v_setup_stage := 'OPERATIONAL';
  ELSIF NOT v_has_categories AND NOT v_has_menu_items AND NOT v_has_tax_profiles AND NOT v_has_tables AND NOT v_has_staff AND NOT v_has_kds_stations THEN
    v_setup_stage := 'EMPTY';
  ELSIF v_has_staff AND NOT v_has_tables THEN
    v_setup_stage := 'STAFF_CONFIGURED';
  ELSIF v_has_tables AND NOT v_has_categories THEN
    v_setup_stage := 'TABLES_CONFIGURED';
  ELSE
    v_setup_stage := 'MENU_CONFIGURED';
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'has_categories', v_has_categories,
    'has_menu_items', v_has_menu_items,
    'has_tax_profiles', v_has_tax_profiles,
    'has_tables', v_has_tables,
    'has_staff', v_has_staff,
    'has_kds_stations', v_has_kds_stations,
    'setup_stage', v_setup_stage,
    'is_operational', (v_setup_stage = 'OPERATIONAL')
  );
END;
$$;
