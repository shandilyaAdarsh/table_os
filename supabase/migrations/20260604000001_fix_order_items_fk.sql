BEGIN;

-- Ensure the foreign key exists
ALTER TABLE IF EXISTS public.order_items
  DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_order_id_fkey
  FOREIGN KEY (order_id)
  REFERENCES public.orders(id)
  ON DELETE CASCADE;

-- Ensure postgrest reloads the schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
