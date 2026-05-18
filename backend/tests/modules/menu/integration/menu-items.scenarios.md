# Menu Items Integration Test Scenarios

## 1. Item Creation and Validation
- **Scenario:** Create a standard menu item with a unique SKU and slug.
  - **Expected:** Returns 201 Created. Item persists correctly.
- **Scenario:** Create an item with an existing SKU.
  - **Expected:** Returns 409 Conflict.
- **Scenario:** Create an item with invalid dietary tags.
  - **Expected:** Returns 400 Bad Request via Zod validator.
- **Scenario:** Create an item missing required fields (name, category_id, base_price).
  - **Expected:** Returns 400 Bad Request.

## 2. Item Retrieval and Pagination
- **Scenario:** Retrieve a list of items with pagination (`page=1, limit=10`).
  - **Expected:** Returns max 10 items, total count matching DB.
- **Scenario:** Filter items by category.
  - **Expected:** Returns only items belonging to the requested `category_id`.
- **Scenario:** Filter items by dietary tags (`dietary_tags[]=vegan&dietary_tags[]=gluten_free`).
  - **Expected:** Returns items containing both tags.

## 3. Full-Text Search
- **Scenario:** Search by exact item name.
  - **Expected:** Returns the item matching the query.
- **Scenario:** Search by partial keyword matching item description.
  - **Expected:** GIN index resolves the search vector (using `simple` tokenizer) and returns matching items.
- **Scenario:** Search by exact SKU.
  - **Expected:** Returns the exact matching item.

## 4. Item Updates and Optimistic Locking
- **Scenario:** Update an item's base price with correct `version_num`.
  - **Expected:** Returns 200 OK. `version_num` increments by 1.
- **Scenario:** Update an item with an outdated `version_num` (Concurrency Simulation).
  - **Expected:** Returns 409 Conflict. DB state remains unchanged.
- **Scenario:** Update an item's slug to a slug already in use by another item in the same tenant.
  - **Expected:** Returns 409 Conflict.
- **Scenario:** Create an item with a slug already in use by an item in a DIFFERENT tenant.
  - **Expected:** Returns 201 Created. Slugs are isolated by tenant.

## 5. Soft Delete and Audit Trail
- **Scenario:** Soft-delete an existing item providing the correct `version_num`.
  - **Expected:** Returns 204 No Content. Item status changes to `archived`, `deleted_at` is set, `updated_by` reflects the current user, and `version_num` increments by 1.
- **Scenario:** Attempt to retrieve a soft-deleted item via `getById`.
  - **Expected:** Returns 404 Not Found.
- **Scenario:** Ensure `created_by` is set accurately on item creation and unmodified on subsequent updates.
  - **Expected:** Audit fields are correctly populated across the object lifecycle.
- **Scenario:** Ensure soft-deleted rows are excluded from list queries, pagination, and search results.
  - **Expected:** Total count and returned data array omit the deleted item.

## 6. Access Control and Roles
- **Scenario:** Attempt to create an item as a `staff` member (insufficient role).
  - **Expected:** Returns 403 Forbidden.
- **Scenario:** Update an item with `restaurant_admin` role.
  - **Expected:** Returns 200 OK.
