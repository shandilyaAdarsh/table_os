-- ============================================================
-- Migration: 20260519000014_branch_sequences.sql
-- Implements contention-free branch-scoped sequence allocation
-- table and stored allocator procedure.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.branch_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  sequence_type VARCHAR(50) NOT NULL,
  current_val BIGINT NOT NULL DEFAULT 0,
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_branch_sequence_type UNIQUE (branch_id, sequence_type)
);

-- Enable RLS
ALTER TABLE public.branch_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY branch_sequences_tenant_isolation ON public.branch_sequences
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Index for O(1) allocator lookups
CREATE INDEX IF NOT EXISTS idx_branch_sequences_lookup ON public.branch_sequences (branch_id, sequence_type);

-- Allocator Stored Function
CREATE OR REPLACE FUNCTION public.allocate_next_sequence(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_sequence_type VARCHAR,
  p_daily_reset BOOLEAN
)
RETURNS BIGINT AS $$
DECLARE
  v_seq_record RECORD;
  v_allocated BIGINT;
BEGIN
  -- 1. Acquire row lock on branch sequence record, inserting on conflict if absent
  INSERT INTO public.branch_sequences (tenant_id, branch_id, sequence_type, current_val, last_reset_date)
  VALUES (p_tenant_id, p_branch_id, p_sequence_type, 0, CURRENT_DATE)
  ON CONFLICT (branch_id, sequence_type) DO NOTHING;

  -- 2. Lock row FOR UPDATE to ensure serial allocation
  SELECT * INTO v_seq_record
  FROM public.branch_sequences
  WHERE branch_id = p_branch_id AND sequence_type = p_sequence_type
  FOR UPDATE;

  -- 3. Reset daily counter if requested and date has rolled over
  IF p_daily_reset AND v_seq_record.last_reset_date < CURRENT_DATE THEN
    UPDATE public.branch_sequences
    SET current_val = 1,
        last_reset_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE branch_id = p_branch_id AND sequence_type = p_sequence_type;
    v_allocated := 1;
  ELSE
    UPDATE public.branch_sequences
    SET current_val = v_seq_record.current_val + 1,
        updated_at = NOW()
    WHERE branch_id = p_branch_id AND sequence_type = p_sequence_type;
    v_allocated := v_seq_record.current_val + 1;
  END IF;

  RETURN v_allocated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
