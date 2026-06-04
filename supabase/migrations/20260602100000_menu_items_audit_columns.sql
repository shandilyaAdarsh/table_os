-- Restore audit columns expected by the menu API when the table was created
-- from a simplified schema or older migration set.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS version_num INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;
