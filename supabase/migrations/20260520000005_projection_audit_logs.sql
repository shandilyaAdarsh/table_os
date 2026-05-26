-- ============================================================
-- Migration: 20260520000005_projection_audit_logs.sql
-- Description: Creates the projection_audit_logs table for
--              diagnosing rebuilds, invalidations, and convergence.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.projection_audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projection_id       TEXT NOT NULL,
    projection_type     TEXT NOT NULL,
    branch_id           UUID REFERENCES public.branches(id),
    tenant_id           UUID REFERENCES public.tenants(id),
    event_type          TEXT NOT NULL, -- e.g., 'UPDATE_BROADCAST', 'INVALIDATION_BROADCAST', 'REBUILD_REQUEST'
    projection_revision INTEGER,
    source_revision     INTEGER,
    source_mutation_id  UUID,
    reason              TEXT,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid operational forensics
CREATE INDEX IF NOT EXISTS idx_projection_audit_projection
ON public.projection_audit_logs (projection_id, projection_type);

CREATE INDEX IF NOT EXISTS idx_projection_audit_tenant_branch 
ON public.projection_audit_logs (tenant_id, branch_id);

-- RLS Policies
ALTER TABLE public.projection_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projection_audit_logs_tenant_isolation" 
ON public.projection_audit_logs
AS RESTRICTIVE FOR ALL
USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- This is a system/backend-only append table in practice, 
-- but we allow authenticated inserts if clients report rebuilds directly via RPC.
CREATE POLICY "projection_audit_logs_insert" 
ON public.projection_audit_logs
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "projection_audit_logs_select" 
ON public.projection_audit_logs
FOR SELECT TO authenticated
USING (true);

COMMIT;
