-- Migration: 20260529000000_onboarding_state
-- Create onboarding_state table to track skipped and completed setups per tenant.

CREATE TABLE IF NOT EXISTS public.onboarding_state (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_skipped BOOLEAN NOT NULL DEFAULT false,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  steps_completed TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform users can manage onboarding state" ON public.onboarding_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_users
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tenant users can view own onboarding state" ON public.onboarding_state
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can update onboarding state" ON public.onboarding_state
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND role IN ('RESTAURANT_ADMIN', 'SUPER_ADMIN')
    )
  );

-- Trigger for updated_at
CREATE TRIGGER set_onboarding_state_updated_at
  BEFORE UPDATE ON public.onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
