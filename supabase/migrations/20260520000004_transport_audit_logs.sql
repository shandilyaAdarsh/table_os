-- ============================================================
-- Migration: 20260520000004_transport_audit_logs.sql
-- Description: Creates the transport_audit_logs table for
--              websocket lifecycle and gap detection logging.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.transport_audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       TEXT NOT NULL,
    stream_instance_id  TEXT NOT NULL,
    tenant_id           UUID REFERENCES public.tenants(id),
    branch_id           UUID REFERENCES public.branches(id),
    session_id          UUID,
    user_id             UUID,
    event_type          TEXT NOT NULL, -- e.g., 'CONNECT', 'AUTH_FAIL', 'DISCONNECT', 'GAP_DETECTED', 'STALE_HEARTBEAT'
    reason              TEXT,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid operational forensics
CREATE INDEX IF NOT EXISTS idx_transport_audit_connection
ON public.transport_audit_logs (connection_id);

CREATE INDEX IF NOT EXISTS idx_transport_audit_tenant_branch 
ON public.transport_audit_logs (tenant_id, branch_id);

-- RLS Policies
ALTER TABLE public.transport_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transport_audit_logs_tenant_isolation" 
ON public.transport_audit_logs
AS RESTRICTIVE FOR ALL
USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- This is a system/backend-only append table in practice, 
-- but we allow authenticated inserts if clients report gaps directly via RPC.
CREATE POLICY "transport_audit_logs_insert" 
ON public.transport_audit_logs
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "transport_audit_logs_select" 
ON public.transport_audit_logs
FOR SELECT TO authenticated
USING (true);

COMMIT;
