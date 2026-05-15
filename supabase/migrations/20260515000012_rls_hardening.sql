-- ============================================================
-- Migration: 011_rls_hardening
-- Drops all FOR ALL policies and replaces with explicit
-- per-operation policies including WITH CHECK clauses.
-- Fixes staff branch isolation bypass.
-- Adds missing policies for tenant_users, qr_sessions, domain_events.
-- Locks down device_sessions explicitly.
-- ============================================================

-- ─── Drop existing overly-broad policies ─────────────────────
DROP POLICY IF EXISTS tenant_isolation_policy      ON public.tenants;
DROP POLICY IF EXISTS branch_isolation_policy      ON public.branches;
DROP POLICY IF EXISTS staff_isolation_policy       ON public.staff;
DROP POLICY IF EXISTS device_isolation_policy      ON public.devices;
DROP POLICY IF EXISTS tub_isolation_policy         ON public.tenant_user_branches;

-- ─── Tenants ─────────────────────────────────────────────────
-- Only super_admin may insert or update tenants.
-- Any authenticated user may read their own tenant.

CREATE POLICY tenant_select ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.current_tenant_id());

CREATE POLICY tenant_insert ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY tenant_update ON public.tenants
  FOR UPDATE TO authenticated
  USING  (public.is_super_admin() OR id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin());

CREATE POLICY tenant_delete ON public.tenants
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ─── Branches ────────────────────────────────────────────────
-- Tenant admin / manager can read all their branches.
-- Staff can only read their assigned branches.
-- Only super_admin or tenant admin can write branches.

CREATE POLICY branch_select ON public.branches
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      (
        EXISTS (
          SELECT 1 FROM public.tenant_users
          WHERE tenant_id = public.current_tenant_id()
            AND user_id   = public.current_user_id()
            AND role IN ('RESTAURANT_ADMIN', 'MANAGER')
            AND deleted_at IS NULL
        ) OR
        id = ANY(public.current_branch_ids())
      )
    )
  );

CREATE POLICY branch_insert ON public.branches
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE tenant_id = public.current_tenant_id()
          AND user_id   = public.current_user_id()
          AND role = 'RESTAURANT_ADMIN'
          AND deleted_at IS NULL
      )
    )
  );

CREATE POLICY branch_update ON public.branches
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE tenant_id = public.current_tenant_id()
          AND user_id   = public.current_user_id()
          AND role = 'RESTAURANT_ADMIN'
          AND deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE tenant_id = public.current_tenant_id()
          AND user_id   = public.current_user_id()
          AND role = 'RESTAURANT_ADMIN'
          AND deleted_at IS NULL
      )
    )
  );

CREATE POLICY branch_delete ON public.branches
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE tenant_id = public.current_tenant_id()
          AND user_id   = public.current_user_id()
          AND role = 'RESTAURANT_ADMIN'
          AND deleted_at IS NULL
      )
    )
  );

-- ─── Staff ───────────────────────────────────────────────────
-- FIXED: Removed "OR current_branch_ids() IS NULL" fallback.
-- Users without branch_ids get no access — correct behavior.

CREATE POLICY staff_select ON public.staff
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY staff_insert ON public.staff
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY staff_update ON public.staff
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  )
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY staff_delete ON public.staff
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

-- ─── Devices ─────────────────────────────────────────────────

CREATE POLICY device_select ON public.devices
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY device_insert ON public.devices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY device_update ON public.devices
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  )
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY device_delete ON public.devices
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

-- ─── Tenant Users ─────────────────────────────────────────────
-- No policy existed before — now explicitly added.

CREATE POLICY tenant_users_select ON public.tenant_users
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    tenant_id = public.current_tenant_id()
  );

CREATE POLICY tenant_users_insert ON public.tenant_users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users tu2
        WHERE tu2.tenant_id = public.current_tenant_id()
          AND tu2.user_id   = public.current_user_id()
          AND tu2.role = 'RESTAURANT_ADMIN'
          AND tu2.deleted_at IS NULL
      )
    )
  );

CREATE POLICY tenant_users_update ON public.tenant_users
  FOR UPDATE TO authenticated
  USING  (public.is_super_admin() OR tenant_id = public.current_tenant_id())
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users tu2
        WHERE tu2.tenant_id = public.current_tenant_id()
          AND tu2.user_id   = public.current_user_id()
          AND tu2.role = 'RESTAURANT_ADMIN'
          AND tu2.deleted_at IS NULL
      )
    )
  );

CREATE POLICY tenant_users_delete ON public.tenant_users
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users tu2
        WHERE tu2.tenant_id = public.current_tenant_id()
          AND tu2.user_id   = public.current_user_id()
          AND tu2.role = 'RESTAURANT_ADMIN'
          AND tu2.deleted_at IS NULL
      )
    )
  );

-- ─── Tenant User Branches ─────────────────────────────────────

CREATE POLICY tub_select ON public.tenant_user_branches
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());

CREATE POLICY tub_insert ON public.tenant_user_branches
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = public.current_tenant_id()
          AND tu.user_id   = public.current_user_id()
          AND tu.role = 'RESTAURANT_ADMIN'
          AND tu.deleted_at IS NULL
      )
    )
  );

CREATE POLICY tub_delete ON public.tenant_user_branches
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = public.current_tenant_id()
          AND tu.user_id   = public.current_user_id()
          AND tu.role = 'RESTAURANT_ADMIN'
          AND tu.deleted_at IS NULL
      )
    )
  );

-- ─── QR Sessions ──────────────────────────────────────────────
-- No policy existed before.

CREATE POLICY qr_sessions_select ON public.qr_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY qr_sessions_insert ON public.qr_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

CREATE POLICY qr_sessions_update ON public.qr_sessions
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  )
  WITH CHECK (
    public.is_super_admin() OR
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

-- ─── Domain Events ────────────────────────────────────────────
-- Read-only for tenant users. Only backend writes via service_role.

CREATE POLICY domain_events_select ON public.domain_events
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    tenant_id = public.current_tenant_id()
  );

-- INSERT/UPDATE/DELETE on domain_events is service_role only.
-- No authenticated write policies → defaults to deny.

-- ─── Device Sessions — Explicit lockdown ─────────────────────
CREATE POLICY device_sessions_deny ON public.device_sessions
  FOR ALL TO authenticated
  USING (FALSE);

-- ─── Partial indexes for soft-delete performance ─────────────
CREATE INDEX IF NOT EXISTS idx_staff_active        ON public.staff(tenant_id, branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_devices_active      ON public.devices(tenant_id, branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qr_sessions_active  ON public.qr_sessions(tenant_id, branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_branches_active     ON public.branches(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_users_active ON public.tenant_users(tenant_id, user_id) WHERE deleted_at IS NULL;
