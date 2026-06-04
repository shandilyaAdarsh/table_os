-- ============================================================
-- Legacy menu_items tables (from orderlyy_admin-app bootstrap SQL)
-- may keep NOT NULL `category`, `price`, and `is_available` while the API
-- writes `category_id`, `base_price`, and `status`. Sync on write.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
  ) THEN
    RETURN;
  END IF;

  -- Backfill category text from menu_categories
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'category'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'category_id'
  ) THEN
    UPDATE public.menu_items mi
    SET category = mc.name
    FROM public.menu_categories mc
    WHERE mi.category IS NULL
      AND mi.category_id IS NOT NULL
      AND mc.id = mi.category_id
      AND mc.tenant_id = mi.tenant_id
      AND mc.deleted_at IS NULL;
  END IF;

  -- Backfill price from base_price
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'price'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'base_price'
  ) THEN
    UPDATE public.menu_items
    SET price = base_price
    WHERE price IS NULL AND base_price IS NOT NULL;
  END IF;

  -- Backfill is_available from status
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'is_available'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'status'
  ) THEN
    UPDATE public.menu_items
    SET is_available = (status = 'active')
    WHERE is_available IS NULL AND status IS NOT NULL;
  END IF;

  CREATE OR REPLACE FUNCTION public.sync_menu_item_legacy_bootstrap_columns()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    IF TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'category'
      ) AND NEW.category IS NULL AND NEW.category_id IS NOT NULL THEN
        SELECT c.name
        INTO NEW.category
        FROM public.menu_categories c
        WHERE c.id = NEW.category_id
          AND c.tenant_id = NEW.tenant_id
          AND c.deleted_at IS NULL;

        IF NEW.category IS NULL THEN
          RAISE EXCEPTION
            'menu_items.category_id % not found for tenant %',
            NEW.category_id,
            NEW.tenant_id;
        END IF;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'price'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'base_price'
      ) AND NEW.base_price IS NOT NULL
        AND (
          TG_OP = 'INSERT'
          OR NEW.base_price IS DISTINCT FROM OLD.base_price
        )
      THEN
        NEW.price := NEW.base_price;
      ELSIF TG_OP = 'INSERT' AND NEW.price IS NULL THEN
        NEW.price := 0;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'is_available'
    ) AND NEW.is_available IS NULL THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'status'
      ) AND NEW.status IS NOT NULL THEN
        NEW.is_available := (NEW.status = 'active');
      ELSE
        NEW.is_available := TRUE;
      END IF;
    END IF;

    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS trg_menu_items_sync_legacy_category ON public.menu_items;
  DROP TRIGGER IF EXISTS trg_menu_items_sync_legacy_bootstrap ON public.menu_items;

  CREATE TRIGGER trg_menu_items_sync_legacy_bootstrap
    BEFORE INSERT OR UPDATE
    ON public.menu_items
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_menu_item_legacy_bootstrap_columns();
END $$;
