-- 20260603000000_menu_item_recommendations.sql
-- Create menu item recommendations table

CREATE TABLE public.menu_item_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    source_menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    recommended_menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    recommendation_type TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version_num INTEGER NOT NULL DEFAULT 1,
    
    CONSTRAINT uq_menu_item_recommendations UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id, source_menu_item_id, recommended_menu_item_id),
    CONSTRAINT chk_menu_item_rec_no_self_ref CHECK (source_menu_item_id != recommended_menu_item_id)
);

-- Performance indexes for recommendation resolution
CREATE INDEX idx_menu_item_recs_tenant_source ON public.menu_item_recommendations(tenant_id, source_menu_item_id);
CREATE INDEX idx_menu_item_recs_deleted_at ON public.menu_item_recommendations(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_item_recs_active_lookup ON public.menu_item_recommendations(tenant_id, source_menu_item_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_item_recs_branch_active ON public.menu_item_recommendations(tenant_id, branch_id, is_active) WHERE deleted_at IS NULL;

-- RLS Policies
ALTER TABLE public.menu_item_recommendations ENABLE ROW LEVEL SECURITY;

-- 1. Tenant Isolation (Restrictive)
CREATE POLICY "Tenant isolation for menu_item_recommendations" 
ON public.menu_item_recommendations
AS RESTRICTIVE FOR ALL 
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- 2. Tenant Users (Admins) can manage
CREATE POLICY "Tenant users can manage menu_item_recommendations"
ON public.menu_item_recommendations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = menu_item_recommendations.tenant_id
    AND tu.user_id = auth.uid()
    AND tu.deleted_at IS NULL
  )
);

-- 3. Public read (bounded by tenant isolation if app.current_tenant_id is set)
CREATE POLICY "Public read menu_item_recommendations"
ON public.menu_item_recommendations
FOR SELECT
USING (deleted_at IS NULL);
