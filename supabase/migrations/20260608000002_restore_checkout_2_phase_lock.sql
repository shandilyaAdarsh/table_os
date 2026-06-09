BEGIN;

CREATE OR REPLACE FUNCTION public.orchestrate_checkout_v1(
  p_tenant_id        UUID,
  p_cart_id          UUID,
  p_snapshot_id      UUID,
  p_order_id         UUID,
  p_order_number     TEXT,
  p_invoice_id       UUID,
  p_invoice_number   TEXT,
  p_table_id         UUID,
  p_session_id       UUID,
  p_source           TEXT,
  p_order_notes      TEXT,
  p_user_id          UUID,
  p_idempotency_key  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cart_record       RECORD;
  v_snapshot_record   RECORD;
  v_station_id        UUID;
  v_kitchen_order_id  UUID;
  v_order_record      RECORD;
  v_invoice_record    RECORD;
  v_response          JSONB;
BEGIN
  -- 1. Retrieve & Lock Cart (SELECT FOR UPDATE) to prevent concurrency races
  SELECT * INTO v_cart_record
    FROM public.carts
   WHERE id = p_cart_id
     AND tenant_id = p_tenant_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cart not found' USING ERRCODE = 'P0002';
  END IF;

  -- ALLOW 'locked' status because createOrderSnapshot locks it immediately prior
  IF v_cart_record.status NOT IN ('open', 'locked') THEN
    RAISE EXCEPTION 'Cart is already checked out or submitted' USING ERRCODE = '22000';
  END IF;

  -- 2. Validate active session
  IF p_session_id IS NOT NULL THEN
    PERFORM 1 FROM public.guest_sessions
     WHERE id = p_session_id
       AND tenant_id = p_tenant_id
       AND expires_at > NOW()
       AND resolved_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'QR Session is expired or resolved' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 3. Lock Cart by transitioning to submitted
  UPDATE public.carts
     SET status = 'submitted',
         submitted_at = NOW(),
         version_num = version_num + 1
   WHERE id = p_cart_id
     AND tenant_id = p_tenant_id;

  -- 4. Retrieve Snapshot and verify
  SELECT * INTO v_snapshot_record
    FROM public.order_snapshots
   WHERE id = p_snapshot_id
     AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order snapshot not found' USING ERRCODE = 'P0002';
  END IF;

  -- 5. Associate Order ID inside Snapshot
  UPDATE public.order_snapshots
     SET order_id = p_order_id
   WHERE id = p_snapshot_id
     AND tenant_id = p_tenant_id;

  -- 6. Insert Order
  INSERT INTO public.orders (
    id,
    tenant_id,
    branch_id,
    table_id,
    session_id,
    cart_id,
    order_snapshot_id,
    order_number,
    status,
    source,
    idempotency_key,
    order_notes,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) VALUES (
    p_order_id,
    p_tenant_id,
    v_cart_record.branch_id,
    p_table_id,
    p_session_id,
    p_cart_id,
    p_snapshot_id,
    p_order_number,
    'pending'::public.order_status,
    p_source::public.order_source,
    p_idempotency_key,
    p_order_notes,
    p_user_id,
    p_user_id,
    NOW(),
    NOW()
  ) RETURNING * INTO v_order_record;

  -- 7. Insert Order Items directly from Snapshot into order_items
  INSERT INTO public.order_items (
    order_id,
    menu_item_id,
    name,
    quantity,
    unit_price,
    total_price,
    special_instructions
  )
  SELECT 
    p_order_id,
    menu_item_id,
    item_name_snapshot,
    quantity,
    (unit_price_minor / 100.0),
    (line_total_minor / 100.0),
    item_notes
  FROM public.order_item_snapshots
  WHERE order_snapshot_id = p_snapshot_id;

  -- 8. Create Invoice
  INSERT INTO public.invoices (
    id,
    tenant_id,
    branch_id,
    order_id,
    invoice_number,
    subtotal_minor,
    tax_total_minor,
    discount_total_minor,
    grand_total_minor,
    currency_code,
    status,
    created_at,
    updated_at
  ) VALUES (
    p_invoice_id,
    p_tenant_id,
    v_cart_record.branch_id,
    p_order_id,
    p_invoice_number,
    v_snapshot_record.subtotal_minor,
    v_snapshot_record.tax_total_minor,
    v_snapshot_record.discount_total_minor,
    v_snapshot_record.grand_total_minor,
    v_snapshot_record.currency_code,
    'pending'::public.invoice_status,
    NOW(),
    NOW()
  ) RETURNING * INTO v_invoice_record;

  -- 9. Create Kitchen Order
  v_kitchen_order_id := gen_random_uuid();
  
  -- Determine default station (simplified)
  SELECT id INTO v_station_id
    FROM public.kitchen_stations
   WHERE branch_id = v_cart_record.branch_id
   LIMIT 1;

  INSERT INTO public.kitchen_orders (
    id,
    tenant_id,
    branch_id,
    order_id,
    station_id,
    status,
    printed_at,
    created_at,
    updated_at
  ) VALUES (
    v_kitchen_order_id,
    p_tenant_id,
    v_cart_record.branch_id,
    p_order_id,
    v_station_id,
    'pending'::public.kitchen_order_status,
    NULL,
    NOW(),
    NOW()
  );

  v_response := jsonb_build_object(
    'order_id', v_order_record.id,
    'invoice_id', v_invoice_record.id,
    'kitchen_order_id', v_kitchen_order_id,
    'status', 'success'
  );

  RETURN v_response;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Atomic checkout failed: %', SQLERRM;
END;
$$;

COMMIT;
