# Orderlli Backend Foundation Hardening

This document establishes the rigorous, production-ready architectural foundation for the Orderlli platform. It refines and hardens the existing architecture (Multi-tenant Supabase/PostgreSQL, RLS, RBAC, Repository/Service pattern) by addressing unresolved production-grade concerns and architectural gaps without introducing unnecessary complexity.

---

## 1. Transaction Boundary Strategy

### 1. Problem
In a distributed backend handling multiple relational entities (e.g., creating a menu item and linking modifier groups), partial failures during multi-write operations can lead to orphaned data and inconsistent state.

### 2. Recommended Strategy
Use database-level RPC functions (stored procedures) for atomic multi-write operations that require strict transaction boundaries, while keeping the business validation strictly in the service layer. Avoid long-running backend transactions holding DB locks.

### 3. Implementation Rules
- **Service Responsibility:** The service layer performs all input validation, business logic checks, and data preparation.
- **Repository Responsibility:** The repository executes the writes. If multiple tables must be updated atomically (e.g., `menu_items` + `menu_item_modifier_groups`), invoke a custom Supabase RPC function that wraps the operations in a single PostgreSQL transaction.
- **Audit Consistency:** Ensure `created_by` or `updated_by` are passed to the RPC so that audit trails remain intact.
- **Rollback:** PostgreSQL automatically rolls back the RPC on any internal failure.
- **Examples:**
  - **Menu Item Creation:** Service validates DTOs, then calls an RPC `create_menu_item_with_modifiers` passing the item data and an array of modifier group IDs.
  - **Pricing Updates:** Service computes effective prices; repository executes a bulk update RPC.
  - **Branch Overrides:** Service validates override constraints; repository upserts the override and touches the item's `updated_at`.

### 4. Tradeoffs
- *Pros:* Guarantees atomicity without complex application-level transaction management. Reduces network round-trips.
- *Cons:* Moves some data-insertion logic into SQL, requiring DB migrations for changes to the transaction shape.

### 5. Production Recommendation
Adopt the RPC strategy for complex, multi-table atomic writes. For single-table operations or independent sequential writes where partial failure is tolerable or recoverable, standard repository `.insert()` or `.update()` calls are sufficient.

---

## 2. Category Tree Safety

### 1. Problem
Hierarchical data (e.g., parent-child menu categories) is susceptible to recursive cycles (A -> B -> A), deeply nested trees that degrade query performance, and orphaned child records upon parent deletion.

### 2. Recommended Strategy
Enforce structural limits at the database level and cyclical validation at the service level, coupled with recursive CTEs (Common Table Expressions) for safe, bounded read operations.

### 3. Implementation Rules
- **Cycle Prevention:** The Service layer must explicitly check for circular references (e.g., ensuring `parent_id` is not equal to `id` or any of its descendants) before allowing an update.
- **Max Category Depth:** Restrict the hierarchy to a shallow maximum depth (e.g., 3 levels) via service validation.
- **Recursive Query Strategy:** Use PostgreSQL recursive CTEs limited by a max depth to fetch category trees, preventing infinite loops.
- **Deletion Behavior:** Deleting a parent category should either cascade the soft delete to its children or restrict deletion if active children exist.
- **Orphan Prevention:** Ensure all `parent_id` foreign keys enforce `ON DELETE RESTRICT` or `ON DELETE CASCADE` appropriately at the DB level.

### 4. Tradeoffs
- *Pros:* Prevents catastrophic infinite loops in both the backend and frontend. Keeps payload sizes predictable.
- *Cons:* Requires slightly more complex read queries (CTEs) and upfront validation on update operations.

### 5. Production Recommendation
Strictly limit category depth to 3 levels. Prevent parent deletion if children exist (`RESTRICT` rather than `CASCADE`) to force explicit, intentional menu reorganization by the tenant administrator.

---

## 3. Snapshot Invalidation Ownership

### 1. Problem
When foundational data (menu items, prices, overrides) changes, dependent pre-computed snapshots (e.g., public menus, cached layouts) become stale. Relying on clients to fetch updates leads to inconsistency.

### 2. Recommended Strategy
The Service layer that successfully mutates the foundational data owns the responsibility of triggering snapshot invalidation.

### 3. Implementation Rules
- **Who Owns Rebuilding:** The backend service executing the write operation must emit an invalidation event or directly call the invalidation routine.
- **When Snapshots Invalidate:** On any successful mutation of categories, items, modifiers, or branch overrides.
- **Branch-Aware Invalidation:** Mutations affecting a specific branch override must only invalidate that branch's snapshot. Tenant-wide mutations invalidate all child branch snapshots.
- **Versioning Strategy:** Tag snapshots with an `updated_at` timestamp or hash. Clients send an `If-None-Match` or version param to check for staleness.

### 4. Tradeoffs
- *Pros:* Ensures immediate eventual consistency. Centralizes cache logic in the domain that understands the change.
- *Cons:* Adds latency to write operations if snapshot rebuilding is performed synchronously.

### 5. Production Recommendation
Use an asynchronous trigger for rebuilding. The mutating service updates a `menu_snapshot_versions` table and emits a background event (via DB triggers or an in-memory queue) to asynchronously rebuild the JSON snapshot, allowing the write request to respond quickly.

---

## 4. Read/Write Optimization Rules

### 1. Problem
ORMs and standard repository queries often lead to N+1 problems or excessive network traffic for complex, nested reads (like building a full menu with modifiers and branch overrides). 

### 2. Recommended Strategy
Use standard Repository queries for point-reads and simple lists. Use SQL RPCs (PostgreSQL functions) specifically for complex, deeply-nested data aggregations and hot-path public endpoints.

### 3. Implementation Rules
- **RPCs for Aggregation:** The `getEffectiveMenuForBranch` operation should eventually transition to an optimized SQL RPC that returns a pre-joined JSON structure, preventing backend memory bloat and N+1 repository calls.
- **Business Logic Boundary:** SQL RPCs must strictly be for *data fetching and joining*. All business logic (e.g., "is this user allowed to see this item?") remains in the Service layer.
- **Repository Preference:** Default to standard Supabase client queries for CRUD operations and single-table reads.
- **Public Endpoints:** Public-facing endpoints (e.g., QR menus) must use optimized read-models or snapshot tables, not real-time relational joins.

### 4. Tradeoffs
- *Pros:* Massive performance gains for complex reads. Predictable memory usage.
- *Cons:* Splitting read logic between TypeScript and PL/pgSQL reduces code cohesion and complicates debugging.

### 5. Production Recommendation
Keep writes in TypeScript (Service/Repository). Move only the heaviest, most nested read operations (like full branch menu resolution) into SQL RPCs returning structured JSON.

---

## 5. JWT Branch Access Staleness Mitigation

### 1. Problem
JWTs contain `branch_ids` claims. If a user's branch access is revoked, their existing JWT remains valid until expiration, allowing unauthorized access.

### 2. Recommended Strategy
Employ short-lived JWTs combined with critical-write revalidation against the active session state.

### 3. Implementation Rules
- **Token Expiration:** Keep JWT lifespans extremely short (e.g., 15-30 minutes). Rely on seamless refresh token rotation.
- **Branch Membership Refresh:** When a user's branch access changes, invalidate their active `device_sessions` immediately.
- **Critical-Write Validation:** For high-risk mutations (e.g., processing refunds, deleting menus), the service layer must perform a live DB check of `tenant_user_branches` rather than relying solely on the JWT `req.context`.
- **Staleness Mitigation:** Middleware checks the `device_sessions` table. If the session was flagged or deleted due to access revocation, the request is rejected despite a cryptographically valid JWT.

### 4. Tradeoffs
- *Pros:* Balances performance (stateless JWTs for reads) with security (stateful checks for critical actions and session revocation).
- *Cons:* Requires a DB hit to check `device_sessions` on authenticated requests, adding slight latency.

### 5. Production Recommendation
Accept the minor latency hit of validating the `device_session_id` on every request. This provides immediate, secure revocation capabilities without waiting for JWT expiration.

---

## 6. Service Role vs RLS Clarification

### 1. Problem
Confusion regarding when to use the `service_role` key versus relying on PostgreSQL Row-Level Security (RLS) can lead to bypassed security or overly complex DB policies.

### 2. Recommended Strategy
Adopt a Defense-in-Depth model: The backend application uses `service_role` to perform all database operations, but RLS is strictly maintained as a fallback layer.

### 3. Implementation Rules
- **Backend Responsibilities:** The Node.js Service layer is 100% responsible for business validation, RBAC permission checks, and tenant-scoping enforcement.
- **Repository Safety Requirements:** Every repository method MUST accept `tenantId` and strictly append `.eq('tenant_id', tenantId)` to queries.
- **RLS Responsibilities:** RLS exists to protect the database from unauthorized direct access (e.g., Supabase Data API, client-side queries). It acts as a safety net, not the primary application logic layer.
- **Writes:** RLS policies should `DENY` direct client writes. All mutations must flow through the authenticated backend.

### 4. Tradeoffs
- *Pros:* Centralizes complex authorization logic in TypeScript where it is easily testable, while keeping the database secure from rogue client connections.
- *Cons:* Developers must remember to manually scope queries in the repository layer, as `service_role` bypasses the DB-level tenant checks.

### 5. Production Recommendation
Continue using `supabaseAdmin` for backend operations. Strictly enforce repository review guidelines ensuring `tenant_id` is always passed and filtered.

---

## 7. Soft Delete Cascading Semantics

### 1. Problem
Soft deleting a parent entity (like a Category or Menu Item) without handling children leaves orphaned data visible in queries, creating UI inconsistencies.

### 2. Recommended Strategy
Implement logical cascading at the Service layer for soft deletes, prioritizing visibility state over recursive data mutation.

### 3. Implementation Rules
- **Category Deletion:** Do not automatically soft-delete child items. Instead, either require the category to be empty before deletion (`RESTRICT`) or simply hide the category. If a category is soft-deleted, queries for branch menus must exclude items belonging to deleted categories.
- **Item Deletion:** Soft deleting a menu item must update its status to `archived`.
- **Relationship Behavior:** Override records and modifier links do not need to be physically deleted or soft-deleted when an item is archived; they simply become inactive because the parent item is filtered out.
- **Restore Behavior:** If an item is un-archived, its historical overrides and modifier links immediately become active again.

### 4. Tradeoffs
- *Pros:* Preserves historical data and allows for clean restoration. Reduces the complexity of cascading soft-delete updates across multiple tables.
- *Cons:* Read queries must consistently check the `deleted_at` status of the parent entities.

### 5. Production Recommendation
Enforce parent-level filtering on reads. When fetching the menu, join categories and items, and filter where `category.deleted_at IS NULL AND item.deleted_at IS NULL`. Do not cascade soft deletes to child tables.

---

## 8. Enum Usage Rules

### 1. Problem
Overuse of PostgreSQL ENUMs can cause migration pain (removing/renaming values is difficult), while using plain `TEXT` loses database-level data integrity.

### 2. Recommended Strategy
Use PostgreSQL ENUMs for core, immutable domain states. Use `TEXT` with strict application-level validation (Zod) + DB-level `CHECK` constraints for extensible categories.

### 3. Implementation Rules
- **Appropriate ENUM Use:** `admin_role`, `pricing_type`, `service_type` (Fixed business rules).
- **Appropriate TEXT Use:** Dietary tags, generic statuses that may expand infinitely. Use `CHECK (status IN ('a', 'b', 'c'))` if DB enforcement is desired without the rigidity of ENUMs.
- **Migration Risks:** You can easily add to a Postgres ENUM, but dropping a value requires recreating the type and rewriting the column.
- **Orderlli Policy:** Default to TypeScript union types + Zod validation. Use DB ENUMs strictly for values that drive core architectural logic (e.g., RBAC roles).

### 4. Tradeoffs
- *Pros:* Balances database integrity with rapid development and easy migrations.
- *Cons:* Relies slightly more on the application layer to prevent garbage data insertion.

### 5. Production Recommendation
Migrate highly volatile lists (like dietary tags) to `TEXT[]`. Retain ENUMs for system-critical constraints (Roles, Tax Calculation Modes).

---

## 9. Event Emission Ownership

### 1. Problem
Inconsistent event emission (triggers vs. application code) leads to lost events, difficult debugging, and issues when moving to asynchronous queue architectures.

### 2. Recommended Strategy
The Service layer owns all business-event emission. Database triggers are reserved strictly for technical data integrity (e.g., `updated_at`).

### 3. Implementation Rules
- **Service Rules:** After a successful DB mutation, the Service layer constructs the event payload and synchronously inserts it into a `domain_events` table.
- **Naming Conventions:** `[domain].[entity].[action]` (e.g., `menu.item.created`).
- **Payload Conventions:** Include `tenant_id`, `actor_id` (who did it), and a minimal JSONB `payload` containing the primary keys affected.
- **Realtime Ownership:** The backend service broadcasts standard Socket.io or Supabase Realtime messages *after* the transaction commits.
- **Future Readiness:** Writing to `domain_events` acts as an outbox pattern. A future worker can tail this table to process async queues.

### 4. Tradeoffs
- *Pros:* Highly scalable, sets up the Outbox pattern perfectly for future event-driven architecture, keeps business logic in TypeScript.
- *Cons:* Event insertion occurs within the backend request lifecycle, slightly increasing response times.

### 5. Production Recommendation
Implement the Outbox pattern. All critical actions insert a record into `domain_events`. Use Supabase Realtime to broadcast UI updates directly from the backend.

---

## 10. Public Menu Snapshot Architecture

### 1. Problem
Calculating the "effective menu" (base item + branch overrides + modifiers) on the fly for thousands of concurrent customer QR scans will bottleneck the database.

### 2. Recommended Strategy
Pre-compute and persist branch-specific, JSON-structured menu snapshots for public, read-heavy endpoints.

### 3. Implementation Rules
- **Snapshot Ownership:** A dedicated `MenuSnapshotService` owns the compilation and saving of the snapshot.
- **Payload Optimization:** The snapshot is a flattened JSON document containing only the fields required by the frontend (no internal IDs or audit fields).
- **Lazy-Loading:** For large menus, the snapshot can be segmented by category.
- **Rebuild Strategy:** When a mutation occurs, the backend triggers an async worker (or simple background promise) to rebuild the snapshot for the affected branch(es) and save it to a `branch_menu_snapshots` table or Redis cache.
- **Resolution:** QR clients query the snapshot table by `branch_id`, retrieving the entire menu in a single, index-optimized read.

### 4. Tradeoffs
- *Pros:* O(1) read performance for public menus. Shields the relational database from traffic spikes.
- *Cons:* Eventual consistency. A price update might take 1-2 seconds to reflect on the public QR menu.

### 5. Production Recommendation
Store snapshots directly in a PostgreSQL `branch_menu_snapshots` table with a `jsonb` column. This leverages Supabase's existing infrastructure without introducing Redis immediately, while achieving massive read scalability.

---

## 11. Concurrency & Consistency Rules

### 1. Problem
Two admins modifying the same menu item or inventory count simultaneously can overwrite each other's changes (lost-update anomaly).

### 2. Recommended Strategy
Implement Optimistic Concurrency Control (OCC) using a `version_num` column for highly contested entities, prioritizing fail-fast behavior over complex automated retries.

### 3. Implementation Rules
- **Locking Strategy:** Add `version_num INTEGER DEFAULT 1`.
- **Update Flow:** The frontend passes the known `version_num` with the update payload.
- **Query Modification:** The repository executes: `UPDATE ... SET version_num = version_num + 1 WHERE id = X AND version_num = Y`.
- **Lost-Update Handling:** If the affected row count is 0, throw an `IdempotencyConflict` error. The frontend must inform the user that the data was modified by someone else and prompt a refresh.
- **Retry Strategy:** Do not auto-retry business configuration updates. Require user intervention to resolve the conflict.

### 4. Tradeoffs
- *Pros:* Prevents data corruption without expensive database-level row locks (`SELECT FOR UPDATE`).
- *Cons:* Requires the frontend to handle and display concurrency errors gracefully.

### 5. Production Recommendation
Implement optimistic locking strictly on highly critical or contested entities (e.g., KDS ticket advancement, Inventory counts, Branch Overrides). Standard menu item edits can rely on last-write-wins if concurrency is low.

---

## 12. Minimal Event/Realtimes Strategy

### 1. Problem
Over-engineering realtime websockets and event buses early on leads to infrastructure bloat and difficult local development.

### 2. Recommended Strategy
Leverage Supabase Realtime's Postgres Changes for backend-to-frontend synchronization, keeping the architecture monolithic and infrastructure-light.

### 3. Implementation Rules
- **Current Approach:** The frontend subscribes to Supabase Realtime channels specifically filtered by `tenant_id` and `branch_id`.
- **Backend Flow:** The backend mutates the database. Supabase automatically broadcasts the `INSERT/UPDATE/DELETE` events to subscribed clients.
- **Invalidation Flow:** Upon receiving an event, the frontend invalidates its local state (e.g., Riverpod/React Query cache) and fetches fresh data. Do not send full payloads over websockets.
- **Future Compatibility:** This relies entirely on PostgreSQL. If a dedicated queue is needed later, tools like Debezium can tail the WAL without changing the application code.

### 4. Tradeoffs
- *Pros:* Zero additional infrastructure. Native to the current stack. Highly scalable.
- *Cons:* Frontend receives granular table updates rather than curated domain events, requiring UI logic to determine what data to refetch.

### 5. Production Recommendation
Use Supabase Realtime strictly as an invalidation signal. Send minimal payloads (e.g., `{"table": "menu_items", "id": "123", "action": "UPDATE"}`). The client receives the signal and performs a standard HTTP GET to retrieve the updated, fully-resolved data.
