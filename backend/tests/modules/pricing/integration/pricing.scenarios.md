# Core Pricing Integration Scenarios

## 1. Effective Window Validation
- **Scenario:** Create a price with `effective_from` in the future.
  - **Expected:** Returns 201 Created. Price is not resolved if `as_of` is today.
- **Scenario:** Create a price with `effective_to` < `effective_from`.
  - **Expected:** Returns 400 Bad Request (Validation fails).
- **Scenario:** Resolve price on a date exactly matching `effective_from`.
  - **Expected:** Price is successfully resolved (inclusive boundary).
- **Scenario:** Resolve price on a date exactly matching `effective_to`.
  - **Expected:** Price is NOT resolved (exclusive boundary).

## 2. Priority Bounds and Resolution
- **Scenario:** Two active prices exist for an item, one with priority 1000 and another with priority 0.
  - **Expected:** The RPC resolves the price with priority 1000.
- **Scenario:** Two active prices exist with the SAME priority, but different `effective_from` dates.
  - **Expected:** The RPC resolves the price with the latest (newest) `effective_from` date.
- **Scenario:** Create a price with `priority` outside 0-1000 bounds (e.g. 1001 or -1).
  - **Expected:** Rejected by `menu_item_prices_priority_check` constraint and DTO validators.

## 3. Currency and Content Validation
- **Scenario:** Item has a USD price and a EUR price. Client requests resolution for EUR.
  - **Expected:** RPC correctly filters by currency_code and returns the EUR price.
- **Scenario:** Client submits price with invalid currency_code 'usd' (lowercase).
  - **Expected:** Validation auto-uppercases to 'USD' and passes, or rejects if it's completely invalid.
- **Scenario:** Client submits price with invalid currency_code 'EURO'.
  - **Expected:** Returns 400 Bad Request (Must be valid ISO-4217 3-letter code).

## 4. OCC and Concurrency
- **Scenario:** Two admins attempt to update the same price concurrently. Admin A submits `version_num=1`, Admin B submits `version_num=1`.
  - **Expected:** Admin A succeeds (`version_num` becomes 2). Admin B gets 409 Conflict.
- **Scenario:** Admin attempts to soft-delete a price with an outdated `version_num`.
  - **Expected:** Returns 409 Conflict.
- **Scenario:** Admin attempts to update metadata (e.g. `is_active`) on a stale `version_num`.
  - **Expected:** Returns 409 Conflict.

## 5. Overlap Rejection
- **Scenario:** Admin attempts to create a price that overlaps an active effective window for the same menu item, pricing tier, and currency.
  - **Expected:** Database exclusion constraint catches the overlap and returns 409 Conflict with a friendly error. Priority is ignored; NO overlapping active prices are allowed for the same tier/currency.

## 6. Immutable History and Append-Only Workflow
- **Scenario:** Admin attempts to maliciously bypass service layer and UPDATE `amount_minor` directly in database.
  - **Expected:** Rejected by `enforce_menu_item_prices_immutability` trigger.
- **Scenario:** Admin updates `amount_minor` via API endpoint.
  - **Expected:** Service layer detects financial change, atomatically soft-deletes the old row (preserving history) and inserts a new row with the new `amount_minor`, avoiding trigger failure while enforcing append-only workflow.

## 7. Soft Deletion and Operational Queries
- **Scenario:** Soft-delete the active price.
  - **Expected:** The price is marked with `deleted_at`, preserving history but excluding it from `resolve_menu_item_price` and list queries.
- **Scenario:** Query deleted records utilizing `idx_menu_item_prices_deleted_at` index for archiving operations.
  - **Expected:** Fast retrieval of soft-deleted rows using the operational partial index.
- **Scenario:** Resolve a price for an item where all prices are `is_active=false`.
  - **Expected:** RPC returns `null`.

## 6. Structured RPC and Batch Resolution Performance
- **Scenario:** Resolve single price via `resolve_menu_item_price`.
  - **Expected:** Returns structured object including `price_id`, `amount_minor`, `effective_from`, etc., rather than just the integer amount.
- **Scenario:** Resolve prices for 50 menu items simultaneously using `resolve_menu_item_prices_batch`.
  - **Expected:** Returns an array of structured objects mapping `menu_item_id` to `amount_minor` and `price_id`. Executed via a single RPC query, avoiding N+1.

## 9. Tenant Isolation and Split RLS
- **Scenario:** Resolve a price using `tenant_A` ID, for an item that belongs to `tenant_B`.
  - **Expected:** Returns `null`. No cross-tenant resolution occurs.
- **Scenario:** Read using SELECT operation without tenant context.
  - **Expected:** Returns 0 rows (blocked by `menu_item_prices_select` policy).
- **Scenario:** Malicious UPDATE attempt passing a different tenant_id in the payload.
  - **Expected:** Rejected by `WITH CHECK` on `menu_item_prices_update` policy.

## 8. Cache Strategy Recommendations
- **Resolver Query Caching:** Due to the deterministic nature of the RPC, backend nodes can safely implement an LRU cache mapping `tenant_id:menu_item_id:currency_code` -> `amount_minor` with a TTL of 5 minutes.
- **Cache Invalidation:** When `createPrice`, `updatePrice`, or `deletePrice` is executed, the service layer should emit a cache invalidation event (e.g., via Redis Pub/Sub) to clear the specific `tenant_id:menu_item_id` key.
