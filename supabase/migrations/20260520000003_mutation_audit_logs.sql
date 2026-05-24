-- ============================================================
-- Migration: 20260520000003_mutation_audit_logs.sql
-- Description: Creates the mutation_audit_logs table for
--              deterministic distributed-runtime governance.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mutation_audit_logs (
    mutation_id         UUID PRIMARY KEY,
    mutation_sequence   INTEGER NOT NULL,
    idempotency_key     TEXT NOT NULL,
    session_id          UUID NOT NULL,
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id),
    branch_id           UUID NOT NULL REFERENCES public.branches(id),
    mutation_type       TEXT NOT NULL,
    payload_hash        TEXT,
    status              TEXT NOT NULL,
    failure_reason      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at     TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ
);

-- Indices for rapid debugging and reconciliation queries
CREATE INDEX IF NOT EXISTS idx_mutation_audit_tenant_branch 
ON public.mutation_audit_logs (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_mutation_audit_session 
ON public.mutation_audit_logs (session_id);

CREATE INDEX IF NOT EXISTS idx_mutation_audit_idempotency 
ON public.mutation_audit_logs (idempotency_key);

-- RLS Policies
ALTER TABLE public.mutation_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mutation_audit_logs_tenant_isolation" 
ON public.mutation_audit_logs
AS RESTRICTIVE FOR ALL
USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

CREATE POLICY "mutation_audit_logs_insert_only" 
ON public.mutation_audit_logs
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "mutation_audit_logs_select" 
ON public.mutation_audit_logs
FOR SELECT TO authenticated
USING (true);

COMMIT;
