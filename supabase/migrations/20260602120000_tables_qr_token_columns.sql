-- Permanent table QR URL + token stored on tables row.

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS qr_token text,
  ADD COLUMN IF NOT EXISTS qr_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_qr_token
  ON public.tables (qr_token)
  WHERE qr_token IS NOT NULL AND deleted_at IS NULL;
