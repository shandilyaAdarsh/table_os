-- ============================================================
-- Migration: 019_item_availability
-- Branch-specific availability schedules for menu items.
-- Supports: scheduled (day/time), temporary disable, and
-- service-type restrictions (dine_in, takeaway, delivery).
-- ============================================================

-- ─── Item Availability Schedules ─────────────────────────────
-- Each row defines a time window a menu item is available.
-- Multiple rows per item/branch = union of all windows.
-- Null branch_id = applies to all branches (tenant default).

CREATE TABLE public.item_availability_schedules (
  id             UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID                     NOT NULL,
  item_id        UUID                     NOT NULL,
  branch_id      UUID,                    -- NULL = tenant-wide default
  -- ─── Day/Time Window ──────────────────────────────────────
  day_of_week    public.availability_day  NOT NULL,
  start_time     TIME                     NOT NULL, -- e.g. 06:00:00
  end_time       TIME                     NOT NULL, -- e.g. 11:00:00
  -- ─── Service Type Restriction ─────────────────────────────
  service_types  public.service_type[]    NOT NULL DEFAULT '{dine_in,takeaway,delivery}',
  -- Empty array = unavailable for all service types (use for disabling)
  is_active      BOOLEAN                  NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ              NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_avail_schedule_item
    FOREIGN KEY (tenant_id, item_id) REFERENCES public.menu_items(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_avail_schedule_branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE,

  CONSTRAINT chk_avail_schedule_time_range
    CHECK (start_time < end_time)
);

CREATE INDEX idx_avail_schedule_item_id   ON public.item_availability_schedules(item_id) WHERE is_active = TRUE;
CREATE INDEX idx_avail_schedule_branch_id ON public.item_availability_schedules(branch_id) WHERE branch_id IS NOT NULL AND is_active = TRUE;
CREATE INDEX idx_avail_schedule_day       ON public.item_availability_schedules(day_of_week, start_time, end_time) WHERE is_active = TRUE;
-- GIN index for service_types array queries
CREATE INDEX idx_avail_schedule_service   ON public.item_availability_schedules USING GIN (service_types);

CREATE TRIGGER set_avail_schedule_updated_at
  BEFORE UPDATE ON public.item_availability_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Temporary Item Disablement ───────────────────────────────
-- For manual on-the-fly overrides: "86 this item for today".
-- These always take precedence over schedules.
-- Automatically expires at disable_until; NULL = indefinite.

CREATE TABLE public.item_temporary_disablements (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  item_id       UUID        NOT NULL,
  branch_id     UUID        NOT NULL, -- Required: disablements are always branch-specific
  disabled_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason        TEXT,
  disabled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disable_until TIMESTAMPTZ,           -- NULL = until manually re-enabled
  re_enabled_at TIMESTAMPTZ,           -- Set when staff manually re-enables
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_temp_disable_item
    FOREIGN KEY (tenant_id, item_id) REFERENCES public.menu_items(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_temp_disable_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_temp_disable_item_branch
  ON public.item_temporary_disablements(item_id, branch_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_temp_disable_expires
  ON public.item_temporary_disablements(disable_until)
  WHERE is_active = TRUE AND disable_until IS NOT NULL;
-- This index supports a scheduled cleanup job to auto-re-enable expired disablements.

-- ─── DB-level helper: Check if item is temporarily disabled ──

CREATE OR REPLACE FUNCTION public.is_item_temporarily_disabled(
  p_item_id UUID,
  p_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.item_temporary_disablements
    WHERE item_id = p_item_id
      AND branch_id = p_branch_id
      AND is_active = TRUE
      AND re_enabled_at IS NULL
      AND (disable_until IS NULL OR disable_until > NOW())
  );
$$;

REVOKE ALL ON FUNCTION public.is_item_temporarily_disabled(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_item_temporarily_disabled(UUID, UUID) TO service_role;
