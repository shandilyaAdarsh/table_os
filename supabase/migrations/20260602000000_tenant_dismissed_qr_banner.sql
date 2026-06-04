-- Track per-tenant dismissal of the dashboard welcome / QR setup banner.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS dismissed_qr_banner BOOLEAN NOT NULL DEFAULT false;
