-- ============================================================
-- Migration: 20260528000000_place_direct_order_rpc.sql
-- Direct checkout bypass for prototyping frontend
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.place_direct_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id        UUID;
  v_branch_id        UUID;
  v_table_id         UUID;
  v_session_id       UUID;
  v_order_id         UUID;
  v_order_snapshot_id UUID;
  v_kitchen_order_id UUID;
  v_order_number     TEXT;
  
  v_note             TEXT;
  v_total_amount     BIGINT;
  
  v_item             JSONB;
  v_station_id       UUID;
BEGIN
  v_tenant_id := (payload->>'tenant_id')::UUID;
  v_table_id  := (payload->>'table_id')::UUID;
  v_session_id := (payload->>'session_id')::UUID;
  v_note := payload->>'note';
  v_total_amount := (payload->>'total_amount')::BIGINT;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  -- 1. Get branch from table
  IF v_table_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id FROM public.tables WHERE id = v_table_id;
  ELSE
    -- fallback to first branch of tenant
    SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = v_tenant_id LIMIT 1;
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve branch_id';
  END IF;

  v_order_id := gen_random_uuid();
  v_order_snapshot_id := gen_random_uuid();
  v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD-HH24MISSMS');

  -- 2. Insert snapshot
  INSERT INTO public.order_snapshots (
    id, tenant_id, branch_id, order_id, currency_code, 
    subtotal_minor, tax_total_minor, discount_total_minor, grand_total_minor
  ) VALUES (
    v_order_snapshot_id, v_tenant_id, v_branch_id, v_order_id, 'INR',
    v_total_amount, 0, 0, v_total_amount
  );

  -- 3. Insert order
  INSERT INTO public.orders (
    id, tenant_id, branch_id, table_id, session_id,
    order_snapshot_id, order_number, status, source, order_notes
  ) VALUES (
    v_order_id, v_tenant_id, v_branch_id, v_table_id, v_session_id,
    v_order_snapshot_id, v_order_number, 'pending', 'qr_scan', v_note
  );

  -- 4. Get default kitchen station
  SELECT id INTO v_station_id
    FROM public.kitchen_stations
   WHERE branch_id = v_branch_id
     AND tenant_id = v_tenant_id
     AND deleted_at IS NULL
   ORDER BY is_default DESC, display_order ASC
   LIMIT 1;

  -- 5. Insert kitchen order
  IF v_station_id IS NOT NULL THEN
    INSERT INTO public.kitchen_orders (
      tenant_id, branch_id, order_id, station_id, status, kitchen_notes
    ) VALUES (
      v_tenant_id, v_branch_id, v_order_id, v_station_id, 'pending', v_note
    ) RETURNING id INTO v_kitchen_order_id;
  END IF;

  -- 6. Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items')
  LOOP
    DECLARE
      v_item_snap_id UUID := gen_random_uuid();
      v_menu_item_id UUID;
    BEGIN
      -- Validate UUID format or leave null
      BEGIN
        v_menu_item_id := (v_item->>'id')::UUID;
      EXCEPTION WHEN OTHERS THEN
        v_menu_item_id := NULL;
      END;
      
      INSERT INTO public.order_item_snapshots (
        id, tenant_id, branch_id, order_snapshot_id,
        menu_item_id, item_name_snapshot, quantity, unit_price_minor_snapshot
      ) VALUES (
        v_item_snap_id, v_tenant_id, v_branch_id, v_order_snapshot_id,
        v_menu_item_id, (v_item->>'name'), (v_item->>'qty')::INTEGER, (v_item->>'unit_price')::BIGINT
      );

      IF v_kitchen_order_id IS NOT NULL THEN
        INSERT INTO public.kitchen_order_items (
          tenant_id, kitchen_order_id, order_item_snapshot_id,
          item_name, quantity, modifier_summary
        ) VALUES (
          v_tenant_id, v_kitchen_order_id, v_item_snap_id,
          (v_item->>'name'), (v_item->>'qty')::INTEGER, ''
        );
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

COMMIT;
