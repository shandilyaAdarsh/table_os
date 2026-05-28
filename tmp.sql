

-- Grant execute on helper to authenticated role
GRANT EXECUTE ON FUNCTION public.is_tenant_menu_admin() TO authenticated;
