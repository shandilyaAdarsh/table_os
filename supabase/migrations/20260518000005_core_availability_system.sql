-- ============================================================
-- Migration: 20260518000005_core_availability_system.sql
-- Production-grade Availability Engine for Orderlli.
-- ============================================================

-- ─── SECTION 1: TEARDOWN LEGACY AVAILABILITY SCHEMAS ──────────
-- Cleanly drops legacy tables and helpers to satisfy dependency graph.
DROP TABLE IF EXISTS public.item_temporary_disablements CASCADE;
DROP TABLE IF EXISTS public.item_availability_schedules CASCADE;
DROP FUNCTION IF EXISTS public.is_item_temporarily_disabled(UUID, UUID) CASCADE;

-- ─── SECTION 2: CREATE CORE SCHEMAS ────────────────────────────

-- 1. availability_schedules: Defines recurring weekly availability windows.
CREATE TABLE public.availability_schedules (
  id             UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID                     NOT NULL,
  menu_item_id   UUID                     NOT NULL,
  branch_id      UUID,                    -- NULL = global item default
  timezone       TEXT                     NOT NULL,
  day_of_week    SMALLINT                 NOT NULL, -- 0 (Sunday) to 6 (Saturday)
  start_time     TIME                     NOT NULL,
  end_time       TIME                     NOT NULL,
  priority       INTEGER                  NOT NULL DEFAULT 100,
  is_active      BOOLEAN                  NOT NULL DEFAULT true,
  version_num    INTEGER                  NOT NULL DEFAULT 1,
  created_by     UUID                     REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by     UUID                     REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,

  CONSTRAINT fk_avail_schedule_menu_item
    FOREIGN KEY (tenant_id, menu_item_id) REFERENCES public.menu_items(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_avail_schedule_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT chk_avail_schedule_day_of_week
    CHECK (day_of_week BETWEEN 0 AND 6),

  CONSTRAINT chk_avail_schedule_time_not_equal
    CHECK (start_time != end_time),

  CONSTRAINT chk_avail_schedule_priority
    CHECK (priority BETWEEN 0 AND 1000)
);

-- 2. branch_item_availability: Stores realtime branch operational state.
CREATE TABLE public.branch_item_availability (
  id                  UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID                     NOT NULL,
  branch_id           UUID                     NOT NULL,
  menu_item_id        UUID                     NOT NULL,
  availability_status TEXT                     NOT NULL,
  reason              TEXT,
  disabled_until      TIMESTAMPTZ,
  priority            INTEGER                  NOT NULL DEFAULT 100,
  is_active           BOOLEAN                  NOT NULL DEFAULT true,
  version_num         INTEGER                  NOT NULL DEFAULT 1,
  created_by          UUID                     REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          UUID                     REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ              NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT fk_branch_item_avail_menu_item
    FOREIGN KEY (tenant_id, menu_item_id) REFERENCES public.menu_items(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_branch_item_avail_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT chk_branch_item_avail_status
    CHECK (availability_status IN ('available', 'temporarily_disabled', 'out_of_stock')),

  CONSTRAINT chk_branch_item_avail_priority
    CHECK (priority BETWEEN 0 AND 1000)
);

-- 3. item_availability_exceptions: Special events and override exception windows.
CREATE TABLE public.item_availability_exceptions (
  id             UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID                     NOT NULL,
  menu_item_id   UUID                     NOT NULL,
  branch_id      UUID,                    -- NULL = global exception override
  exception_type TEXT                     NOT NULL,
  starts_at      TIMESTAMPTZ              NOT NULL,
  ends_at        TIMESTAMPTZ              NOT NULL,
  priority       INTEGER                  NOT NULL DEFAULT 100,
  is_active      BOOLEAN                  NOT NULL DEFAULT true,
  version_num    INTEGER                  NOT NULL DEFAULT 1,
  created_by     UUID                     REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by     UUID                     REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,

  CONSTRAINT fk_item_avail_exception_menu_item
    FOREIGN KEY (tenant_id, menu_item_id) REFERENCES public.menu_items(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_item_avail_exception_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT chk_item_avail_exception_type
    CHECK (exception_type IN ('force_available', 'force_unavailable')),

  CONSTRAINT chk_item_avail_exception_time
    CHECK (starts_at < ends_at),

  CONSTRAINT chk_item_avail_exception_priority
    CHECK (priority BETWEEN 0 AND 1000)
);

-- ─── SECTION 3: TRIGGERS FOR TIMESTAMPS & IMMUTABILITY ─────────

-- Standard set_updated_at triggers
CREATE TRIGGER set_availability_schedules_updated_at
  BEFORE UPDATE ON public.availability_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_branch_item_availability_updated_at
  BEFORE UPDATE ON public.branch_item_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_item_availability_exceptions_updated_at
  BEFORE UPDATE ON public.item_availability_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce Immutability of schedule parameters on UPDATE
CREATE OR REPLACE FUNCTION public.enforce_availability_schedules_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.menu_item_id != NEW.menu_item_id THEN
    RAISE EXCEPTION 'Field menu_item_id is immutable.' USING ERRCODE = '42501';
  END IF;
  IF (OLD.branch_id IS DISTINCT FROM NEW.branch_id) THEN
    RAISE EXCEPTION 'Field branch_id is immutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.timezone != NEW.timezone THEN
    RAISE EXCEPTION 'Field timezone is immutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.day_of_week != NEW.day_of_week THEN
    RAISE EXCEPTION 'Field day_of_week is immutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.start_time != NEW.start_time THEN
    RAISE EXCEPTION 'Field start_time is immutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.end_time != NEW.end_time THEN
    RAISE EXCEPTION 'Field end_time is immutable.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_availability_schedules_immutability_trg
  BEFORE UPDATE ON public.availability_schedules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_availability_schedules_immutability();

CREATE OR REPLACE FUNCTION public.enforce_branch_item_availability_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.menu_item_id != NEW.menu_item_id THEN
    RAISE EXCEPTION 'Field menu_item_id is immutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.branch_id != NEW.branch_id THEN
    RAISE EXCEPTION 'Field branch_id is immutable.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_branch_item_availability_immutability_trg
  BEFORE UPDATE ON public.branch_item_availability
  FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_item_availability_immutability();

CREATE OR REPLACE FUNCTION public.enforce_item_availability_exceptions_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.menu_item_id != NEW.menu_item_id THEN
    RAISE EXCEPTION 'Field menu_item_id is immutable.' USING ERRCODE = '42501';
  END IF;
  IF (OLD.branch_id IS DISTINCT FROM NEW.branch_id) THEN
    RAISE EXCEPTION 'Field branch_id is immutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.starts_at != NEW.starts_at THEN
    RAISE EXCEPTION 'Field starts_at is immutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.ends_at != NEW.ends_at THEN
    RAISE EXCEPTION 'Field ends_at is immutable.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_item_availability_exceptions_immutability_trg
  BEFORE UPDATE ON public.item_availability_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_item_availability_exceptions_immutability();

-- ─── SECTION 4: CONFLICT & OVERLAP PREVENTION ──────────────────

-- 1. Helper function: Detect overlap between recurring weekly time windows, including midnight wraps
CREATE OR REPLACE FUNCTION public.time_windows_overlap(
  start1 TIME, end1 TIME,
  start2 TIME, end2 TIME
) RETURNS BOOLEAN AS $$
DECLARE
  w1_wrap BOOLEAN := start1 > end1;
  w2_wrap BOOLEAN := start2 > end2;
BEGIN
  IF NOT w1_wrap AND NOT w2_wrap THEN
    RETURN start1 < end2 AND start2 < end1;
  ELSIF w1_wrap AND NOT w2_wrap THEN
    RETURN start2 < end1 OR start2 >= start1 OR end2 > start1;
  ELSIF NOT w1_wrap AND w2_wrap THEN
    RETURN start1 < end2 OR start1 >= start2 OR end1 > start2;
  ELSE
    RETURN true; -- Both wrap midnight, overlapping at 00:00/24:00
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Trigger function: Prevent overlapping schedules of identical scope + priority
CREATE OR REPLACE FUNCTION public.prevent_schedule_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.availability_schedules
    WHERE id != NEW.id
      AND tenant_id = NEW.tenant_id
      AND menu_item_id = NEW.menu_item_id
      AND (
        (branch_id IS NULL AND NEW.branch_id IS NULL)
        OR (branch_id = NEW.branch_id)
      )
      AND day_of_week = NEW.day_of_week
      AND priority = NEW.priority
      AND is_active = true
      AND deleted_at IS NULL
      AND public.time_windows_overlap(start_time, end_time, NEW.start_time, NEW.end_time)
  ) THEN
    RAISE EXCEPTION 'Conflicting availability schedule: an active schedule with the same scope, priority, and overlapping time range already exists.'
      USING ERRCODE = '23505'; -- SQLSTATE Unique Violation
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_schedule_no_overlap_trg
  BEFORE INSERT OR UPDATE ON public.availability_schedules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_schedule_overlap();

-- 3. Unique Index: Prevent duplicate active operational states per branch and item
CREATE UNIQUE INDEX idx_branch_item_avail_unique_active
  ON public.branch_item_availability (tenant_id, branch_id, menu_item_id)
  WHERE (is_active = true AND deleted_at IS NULL);

-- 4. Exclusion Constraint: Prevent overlapping exception windows for identical scope
ALTER TABLE public.item_availability_exceptions
  ADD CONSTRAINT exclude_item_availability_exception_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    menu_item_id WITH =,
    (coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (is_active = true AND deleted_at IS NULL);

-- ─── SECTION 5: ROW-LEVEL SECURITY (RLS) POLICIES ──────────────

-- Enable RLS on all tables
ALTER TABLE public.availability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_schedules FORCE ROW LEVEL SECURITY;

ALTER TABLE public.branch_item_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_item_availability FORCE ROW LEVEL SECURITY;

ALTER TABLE public.item_availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_availability_exceptions FORCE ROW LEVEL SECURITY;

-- 1. availability_schedules RESTRICTIVE policies
CREATE POLICY tenant_isolation_avail_schedules_select
  ON public.availability_schedules
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_avail_schedules_insert
  ON public.availability_schedules
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_avail_schedules_update
  ON public.availability_schedules
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_avail_schedules_delete
  ON public.availability_schedules
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- 2. branch_item_availability RESTRICTIVE policies
CREATE POLICY tenant_isolation_branch_item_select
  ON public.branch_item_availability
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_branch_item_insert
  ON public.branch_item_availability
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_branch_item_update
  ON public.branch_item_availability
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_branch_item_delete
  ON public.branch_item_availability
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- 3. item_availability_exceptions RESTRICTIVE policies
CREATE POLICY tenant_isolation_exceptions_select
  ON public.item_availability_exceptions
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_exceptions_insert
  ON public.item_availability_exceptions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_exceptions_update
  ON public.item_availability_exceptions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY tenant_isolation_exceptions_delete
  ON public.item_availability_exceptions
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- ─── SECTION 6: HIGH-PERFORMANCE INDEX COVERAGE ───────────────

-- 1. availability_schedules indexes
CREATE INDEX idx_avail_schedules_active_lookup
  ON public.availability_schedules (tenant_id, menu_item_id, day_of_week)
  WHERE (is_active = true AND deleted_at IS NULL);

CREATE INDEX idx_avail_schedules_branch
  ON public.availability_schedules (branch_id)
  WHERE (branch_id IS NOT NULL AND is_active = true AND deleted_at IS NULL);

CREATE INDEX idx_avail_schedules_deleted
  ON public.availability_schedules (tenant_id)
  WHERE (deleted_at IS NOT NULL);

-- 2. branch_item_availability indexes
CREATE INDEX idx_branch_item_avail_lookup
  ON public.branch_item_availability (tenant_id, branch_id, menu_item_id)
  WHERE (is_active = true AND deleted_at IS NULL);

CREATE INDEX idx_branch_item_avail_deleted
  ON public.branch_item_availability (tenant_id)
  WHERE (deleted_at IS NOT NULL);

-- 3. item_availability_exceptions indexes
CREATE INDEX idx_item_avail_exceptions_active
  ON public.item_availability_exceptions (tenant_id, menu_item_id, starts_at, ends_at)
  WHERE (is_active = true AND deleted_at IS NULL);

CREATE INDEX idx_item_avail_exceptions_deleted
  ON public.item_availability_exceptions (tenant_id)
  WHERE (deleted_at IS NOT NULL);

-- ─── SECTION 7: DETERMINISTIC RESOLUTION ENGINE (RPCS) ─────────

-- 1. resolve_item_availability: Timezone-safe state resolver for a single menu item.
CREATE OR REPLACE FUNCTION public.resolve_item_availability(
  p_tenant_id UUID,
  p_menu_item_id UUID,
  p_branch_id UUID,
  p_resolved_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  status TEXT,
  source_type TEXT,
  active_schedule_id UUID,
  branch_scope BOOLEAN,
  reason TEXT,
  resolved_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_local_time TIMESTAMP;
  v_dow INTEGER;
  v_time TIME;
  
  r_status TEXT := 'available';
  r_source TEXT := 'default';
  r_id UUID := NULL;
  r_branch_scope BOOLEAN := false;
  r_reason TEXT := NULL;
  
  v_has_schedules BOOLEAN := false;
  v_schedule_matched BOOLEAN := false;
BEGIN
  -- SET LOCAL search_path to public to prevent security boundary leakage
  PERFORM set_config('search_path', 'public', true);

  -- Priority 1: force_unavailable exception (highest dominance)
  SELECT 
    'unavailable_exception',
    'exception',
    id,
    (branch_id IS NOT NULL),
    'Force unavailable exception: ' || COALESCE(exception_type, '')
  INTO r_status, r_source, r_id, r_branch_scope, r_reason
  FROM public.item_availability_exceptions
  WHERE tenant_id = p_tenant_id
    AND menu_item_id = p_menu_item_id
    AND (branch_id = p_branch_id OR branch_id IS NULL)
    AND exception_type = 'force_unavailable'
    AND starts_at <= p_resolved_at
    AND ends_at > p_resolved_at
    AND is_active = true
    AND deleted_at IS NULL
  ORDER BY 
    (branch_id IS NOT NULL) DESC,
    priority DESC,
    created_at ASC,
    id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT r_status, r_source, r_id, r_branch_scope, r_reason, p_resolved_at;
    RETURN;
  END IF;

  -- Priority 2: force_available exception
  SELECT 
    'available',
    'exception',
    id,
    (branch_id IS NOT NULL),
    'Force available exception: ' || COALESCE(exception_type, '')
  INTO r_status, r_source, r_id, r_branch_scope, r_reason
  FROM public.item_availability_exceptions
  WHERE tenant_id = p_tenant_id
    AND menu_item_id = p_menu_item_id
    AND (branch_id = p_branch_id OR branch_id IS NULL)
    AND exception_type = 'force_available'
    AND starts_at <= p_resolved_at
    AND ends_at > p_resolved_at
    AND is_active = true
    AND deleted_at IS NULL
  ORDER BY 
    (branch_id IS NOT NULL) DESC,
    priority DESC,
    created_at ASC,
    id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT r_status, r_source, r_id, r_branch_scope, r_reason, p_resolved_at;
    RETURN;
  END IF;

  -- Priority 3: Branch operational state
  SELECT 
    b.availability_status,
    'operational_state',
    b.id,
    true,
    b.reason
  INTO r_status, r_source, r_id, r_branch_scope, r_reason
  FROM public.branch_item_availability b
  WHERE b.tenant_id = p_tenant_id
    AND b.branch_id = p_branch_id
    AND b.menu_item_id = p_menu_item_id
    AND b.is_active = true
    AND b.deleted_at IS NULL
    AND (
      b.availability_status = 'out_of_stock'
      OR (
        b.availability_status = 'temporarily_disabled'
        AND (b.disabled_until IS NULL OR b.disabled_until > p_resolved_at)
      )
    )
  ORDER BY 
    b.priority DESC,
    b.created_at ASC,
    b.id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT r_status, r_source, r_id, r_branch_scope, r_reason, p_resolved_at;
    RETURN;
  END IF;

  -- Priority 4: Weekly schedules (lowest priority)
  SELECT EXISTS (
    SELECT 1 
    FROM public.availability_schedules
    WHERE tenant_id = p_tenant_id
      AND menu_item_id = p_menu_item_id
      AND (branch_id = p_branch_id OR branch_id IS NULL)
      AND is_active = true
      AND deleted_at IS NULL
  ) INTO v_has_schedules;

  IF v_has_schedules THEN
    DECLARE
      v_sched RECORD;
    BEGIN
      FOR v_sched IN 
        SELECT 
          id, 
          branch_id, 
          timezone, 
          day_of_week, 
          start_time, 
          end_time
        FROM public.availability_schedules
        WHERE tenant_id = p_tenant_id
          AND menu_item_id = p_menu_item_id
          AND (branch_id = p_branch_id OR branch_id IS NULL)
          AND is_active = true
          AND deleted_at IS NULL
        ORDER BY 
          (branch_id IS NOT NULL) DESC,
          priority DESC,
          created_at ASC,
          id ASC
      LOOP
        -- Timezone-safe evaluation in the schedule's specified zone
        v_local_time := p_resolved_at AT TIME ZONE v_sched.timezone;
        v_dow := EXTRACT(dow FROM v_local_time);
        v_time := v_local_time::TIME;

        -- Overnight wrapping logic
        IF (
          (v_sched.start_time < v_sched.end_time AND v_dow = v_sched.day_of_week AND v_time >= v_sched.start_time AND v_time < v_sched.end_time)
          OR
          (
            v_sched.start_time > v_sched.end_time 
            AND (
              (v_dow = v_sched.day_of_week AND v_time >= v_sched.start_time)
              OR
              (v_dow = (v_sched.day_of_week + 1) % 7 AND v_time < v_sched.end_time)
            )
          )
        ) THEN
          r_status := 'available';
          r_source := 'schedule';
          r_id := v_sched.id;
          r_branch_scope := (v_sched.branch_id IS NOT NULL);
          r_reason := 'Active schedule matching timezone-safe local window';
          v_schedule_matched := true;
          EXIT;
        END IF;
      END LOOP;
    END;

    IF NOT v_schedule_matched THEN
      r_status := 'unavailable_schedule';
      r_source := 'schedule';
      r_id := NULL;
      r_branch_scope := false;
      r_reason := 'Outside of scheduled availability windows';
    END IF;
  ELSE
    r_status := 'available';
    r_source := 'default';
    r_id := NULL;
    r_branch_scope := false;
    r_reason := 'No schedules configured, available by default';
  END IF;

  RETURN QUERY SELECT r_status, r_source, r_id, r_branch_scope, r_reason, p_resolved_at;
END;
$$;

-- 2. resolve_item_availability_batch: Deterministic, lateral batch resolution mapping.
CREATE OR REPLACE FUNCTION public.resolve_item_availability_batch(
  p_tenant_id UUID,
  p_menu_item_ids UUID[],
  p_branch_id UUID,
  p_resolved_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  menu_item_id UUID,
  status TEXT,
  source_type TEXT,
  active_schedule_id UUID,
  branch_scope BOOLEAN,
  reason TEXT,
  resolved_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT 
      m_id AS menu_item_id,
      res.status,
      res.source_type,
      res.active_schedule_id,
      res.branch_scope,
      res.reason,
      res.resolved_at
    FROM unnest(p_menu_item_ids) AS m_id,
    LATERAL public.resolve_item_availability(p_tenant_id, m_id, p_branch_id, p_resolved_at) res;
END;
$$;
