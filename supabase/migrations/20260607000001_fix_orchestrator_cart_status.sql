-- Fix orchestrate_checkout_v1 to allow 'locked' cart status
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
       AND is_active = true;
    IF NOT FOUND THEN
      -- Optional session validation logic depending on if staff pos bypasses
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

  -- 5. Insert Order FIRST to satisfy the order_snapshots_order_id_fk foreign key
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
  )
  RETURNING * INTO v_order_record;

  -- 6. Associate Order ID inside Snapshot
  UPDATE public.order_snapshots
     SET order_id = p_order_id
   WHERE id = p_snapshot_id
     AND tenant_id = p_tenant_id;

  -- 7. Write State History Audit Trail
  INSERT INTO public.order_state_history (
    tenant_id,
    branch_id,
    order_id,
    from_status,
    to_status,
    changed_by,
    reason,
    occurred_at
  ) VALUES (
    p_tenant_id,
    v_cart_record.branch_id,
    p_order_id,
    NULL,
    'pending'::public.order_status,
    p_user_id,
    'Order submitted atomically via server-side orchestrator.',
    NOW()
  );

  -- 8. Retrieve default kitchen station (or first active) for KDS routing
  SELECT id INTO v_station_id
    FROM public.kitchen_stations
   WHERE branch_id = v_cart_record.branch_id
     AND tenant_id = p_tenant_id
     AND deleted_at IS NULL
   ORDER BY is_default DESC, display_order ASC
   LIMIT 1;

  -- 9. Insert Kitchen Ticket Header
  INSERT INTO public.kitchen_orders (
    tenant_id,
    branch_id,
    order_id,
    station_id,
    status,
    kitchen_notes,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) VALUES (
    p_tenant_id,
    v_cart_record.branch_id,
    p_order_id,
    v_station_id,
    'pending'::public.kitchen_order_status,
    p_order_notes,
    p_user_id,
    p_user_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_kitchen_order_id;

  -- 10. Insert Kitchen Items with modifier details concatenated
  INSERT INTO public.kitchen_order_items (
    tenant_id,
    kitchen_order_id,
    order_item_snapshot_id,
    item_name,
    quantity,
    item_notes,
    modifier_summary,
    display_order,
    created_at
  )
  SELECT
    ois.tenant_id,
    v_kitchen_order_id,
    ois.id,
    ois.item_name_snapshot,
    ois.quantity,
    ois.item_notes,
    (
      SELECT string_agg(oms.modifier_option_name_snapshot, ', ')
        FROM public.order_modifier_snapshots oms
       WHERE oms.order_item_snapshot_id = ois.id
    ),
    ois.display_order,
    NOW()
  FROM public.order_item_snapshots ois
  WHERE ois.order_snapshot_id = p_snapshot_id;

  -- 11. Generate chronological unpaid Invoice
  INSERT INTO public.invoices (
    id,
    tenant_id,
    branch_id,
    order_id,
    order_snapshot_id,
    invoice_number,
    status,
    subtotal_minor,
    tax_total_minor,
    discount_total_minor,
    grand_total_minor,
    currency_code,
    idempotency_key,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) VALUES (
    p_invoice_id,
    p_tenant_id,
    v_cart_record.branch_id,
    p_order_id,
    p_snapshot_id,
    p_invoice_number,
    'issued'::public.invoice_status,
    v_snapshot_record.subtotal_minor,
    v_snapshot_record.tax_total_minor,
    v_snapshot_record.discount_total_minor,
    v_snapshot_record.grand_total_minor,
    v_snapshot_record.currency_code,
    p_idempotency_key,
    p_user_id,
    p_user_id,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_invoice_record;

  -- 12. Write Outbox Domain Events
  INSERT INTO public.domain_events (
    tenant_id,
    branch_id,
    event_type,
    aggregate_id,
    aggregate_type,
    payload,
    occurred_at
  ) VALUES (
    p_tenant_id,
    v_cart_record.branch_id,
    'ORDER_CREATED',
    p_order_id,
    'order',
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', p_order_number,
      'grand_total_minor', v_snapshot_record.grand_total_minor,
      'cart_id', p_cart_id,
      'table_id', p_table_id
    ),
    NOW()
  );

  INSERT INTO public.domain_events (
    tenant_id,
    branch_id,
    event_type,
    aggregate_id,
    aggregate_type,
    payload,
    occurred_at
  ) VALUES (
    p_tenant_id,
    v_cart_record.branch_id,
    'KITCHEN_TICKET_QUEUED',
    v_kitchen_order_id,
    'kitchen_order',
    jsonb_build_object(
      'ticket_id', v_kitchen_order_id,
      'order_id', p_order_id,
      'station_id', v_station_id
    ),
    NOW()
  );

  -- 13. Compile and return unified result payload
  v_response := jsonb_build_object(
    'order', to_jsonb(v_order_record),
    'invoice', to_jsonb(v_invoice_record),
    'kitchen_order_id', v_kitchen_order_id
  );

  RETURN v_response;
END;
$$;

COMMIT;
