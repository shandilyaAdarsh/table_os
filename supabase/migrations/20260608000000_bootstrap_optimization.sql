-- ============================================================
-- Migration: Bootstrap Optimization
-- Description: Adds indexes and RPC to consolidate 3 sequential lookups
-- into 1, eliminating network latency during Admin Bootstrap.
-- ============================================================

-- 1. Create Concurrent Indexes (Prevents Table Locks)
CREATE INDEX IF NOT EXISTS idx_staff_tenant_branch ON staff(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

-- 2. Create RPC Function (Aggregates Data)
CREATE OR REPLACE FUNCTION get_bootstrap_context(p_tenant_id UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'tenant',           row_to_json(t),
      'branches',         (SELECT COALESCE(json_agg(b), '[]'::json) FROM (SELECT id, name, timezone, status FROM branches WHERE tenant_id = p_tenant_id AND status != 'deleted') b),
      'onboarding_state', row_to_json(o)
    )
    FROM (SELECT id, name, slug, status, dismissed_qr_banner FROM tenants WHERE id = p_tenant_id) t
    LEFT JOIN (SELECT is_complete, steps_completed FROM onboarding_state WHERE tenant_id = p_tenant_id) o ON true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
