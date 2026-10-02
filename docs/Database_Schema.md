# Database Schema — ShenoDev Ecosystem

**Status:** Draft v1.0
**Engine:** PostgreSQL (via Prisma or Drizzle — see [TRD.md](./TRD.md#5-database))
**Last Updated:** 2026-10-02

---

## 1. Table Overview

| Table | Purpose | Tenant-scoped |
|-------|---------|---------------|
| `tenants` | Root isolation boundary | — (is the boundary) |
| `users` | Accounts across all three apps | Yes |
| `products` | Catalog listings | Yes |
| `inventory` | Physical stock by branch/shelf | Yes (via product) |
| `orders` | Customer orders | Yes |
| `deliveries` | Agent assignments | Yes (via order) |

Supporting tables required by [App_Flow.md](./App_Flow.md) — `branches`, `order_items`, `roles` — are specified in §8.

---

## 2. Tenants

```sql
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  domain      TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `name` | TEXT | Display name |
| `domain` | TEXT | **Unique.** Custom domain for tenant-facing storefront |
| `created_at` | TIMESTAMPTZ | |

**`domain` is unique.** Two tenants sharing a domain means one seller's storefront is reachable under another's identity. This is a security constraint, not a convenience.

**`demo_tenant_id`** is a reserved row: the universal tenant all Demo-mode sessions resolve to ([PRD.md](./PRD.md#33-demo-mode)). Its `id` is a fixed constant, never generated — code branches on it ([Rules.md](./Rules.md) RULE 5).

---

## 3. Users

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         TEXT NOT NULL,
  role_id       UUID REFERENCES roles(id),
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | FK → `tenants`. **Never from client input** — always from session |
| `email` | TEXT | Unique **per tenant**, not globally — the same person may operate two tenants |
| `role_id` | UUID | FK → `roles` |
| `password_hash` | TEXT | Argon2id or bcrypt. `NULL` for Demo-mode and SSO-only accounts |

> **One user, three apps.** A user row is the *same* record behind ShenoStore, ShenoInventory, and ShenoFlow — authentication happens once, and the apps differ by domain and role, not by separate accounts. "Auto-provisioning" on registration means writing role assignments for the new tenant's apps, not creating duplicate user records.
>
> **Why `(tenant_id, email)` and not `UNIQUE(email)`:** a seller operating two storefronts under one login should be one identity with two tenant memberships. A global unique constraint forces duplicate accounts and breaks the shared identity across subdomains.

---

## 4. Roles

Referenced by `users.role_id`. Supports [PRD.md](./PRD.md#34-role-based-access-inventory).

```sql
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),  -- NULL = system role
  name        TEXT NOT NULL,                -- 'owner' | 'admin' | 'staff'
  scope       TEXT NOT NULL,                -- 'tenant' | 'branch'
  permissions JSONB NOT NULL
);
```

| Role | `scope` | Permissions |
|------|---------|-------------|
| **Owner** | `tenant` | Create branches, manage all branches, manage staff |
| **Admin** | `branch` | Manage stock, receive stock, dispatch — within one branch |
| **Staff** | `branch` | Receive stock, view stock — **no** branch creation, **no** dispatch |

**Branch scoping is a column, not a code path.** `users` carries `branch_id`; every Inventory query filters on it. Enforcing "Admin manages a single branch" in application code means every new query has to remember the rule.

> `tenant_id NULL` marks a system role (platform admin). Only those rows are tenant-independent; everything else is scoped.

---

## 5. Products

```sql
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  sku         TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | FK → `tenants` |
| `sku` | TEXT | **Unique per tenant.** The barcode-resolution key |
| `title` | TEXT | |
| `price` | NUMERIC(12,2) | `NUMERIC`, never `FLOAT` — money is not approximate |
| `image_url` | TEXT | |

**`sku` is unique per tenant, not globally.** Two sellers may both stock "SKU-1001"; they are different products. A global unique constraint would force SKU rewriting across tenants and break barcode scanning for anyone onboarding a second storefront.

**`NUMERIC(12,2)` for money.** Binary floating point cannot represent `0.10` exactly; summing float prices across an order produces reconciliation errors. Never `FLOAT`/`REAL`.

**A product with no `inventory` row has `stock: 0`.** Listing and stock are separate concerns — the seller builds the catalog first, fills stock by scanning later ([App_Flow.md](./App_Flow.md#2-buyer--seller-journey)).

---

## 6. Inventory

```sql
CREATE TABLE inventory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES branches(id),
  zone_shelf_row    TEXT NOT NULL,
  quantity          INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0
                                CHECK (reserved_quantity >= 0
                                   AND reserved_quantity <= quantity),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, branch_id, zone_shelf_row)
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_branch  ON inventory(branch_id);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `product_id` | UUID | FK → `products`, `ON DELETE CASCADE` — a deleted product has no stock |
| `branch_id` | UUID | FK → `branches` |
| `zone_shelf_row` | TEXT | Physical address: e.g. `A-03-2` (zone A, shelf 3, row 2) |
| `quantity` | INTEGER | Physical units on the shelf |
| `reserved_quantity` | INTEGER | Committed to unshipped orders |
| `updated_at` | TIMESTAMPTZ | Drives low-stock email triggers |

### 6.1 The Core Invariant

```
available = quantity - reserved_quantity
```

A **CHECK constraint** enforces `reserved_quantity <= quantity` at the database level. This is the one invariant in the schema that must never be violated — violating it means selling stock that is not physically present.

### 6.2 Design Decisions

**No `tenant_id` column.** Tenant is reached via `product_id → products.tenant_id`. Denormalizing it here would create a second copy of the tenant boundary that could disagree with the product's own tenant — and a disagreement between those two copies is a cross-tenant leak.

**The unique constraint is per-shelf, not per-product.** A product stocked in two shelves or two branches gets two `inventory` rows. Forcing one row per product would make branch-level stock impossible and turn "where is SKU-4471?" into a data model problem.

**`quantity >= 0` CHECK.** Physical stock cannot be negative. A negative `quantity` means a bug already shipped.

### 6.3 Low-Stock Triggers

`updated_at` plus a query for `quantity - reserved_quantity < threshold` (threshold per branch) drives low-stock email. This is a **read-time check**, not a stored flag — a cached flag would drift every time stock moved.

---

## 7. Orders

```sql
CREATE TABLE orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  client_id    UUID NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'in_progress',
  total        NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('prepaid','cod')),
  payment_status  TEXT NOT NULL DEFAULT 'pending'
                              CHECK (payment_status IN ('pending','paid','failed','refunded')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | FK → `tenants` |
| `client_id` | UUID | FK → `users` — the **buyer**, not the seller |
| `status` | TEXT | See enum below |
| `total` | NUMERIC(12,2) | Sum of `order_items`, not client input |
| `payment_method` | TEXT | `prepaid` or `cod` |
| `payment_status` | TEXT | Independent of `status` — a COD order is `completed` while still `pending` |

### 7.1 Order Status Enum

| Value | Meaning |
|-------|---------|
| `in_progress` | Order placed — waiting for seller to dispatch |
| `waiting_for_shipping` | Dispatched to Redis queue, awaiting an agent |
| `out_for_delivery` | Agent accepted, in motion |
| `completed` | Delivered (and COD settled, if applicable) |

Transitions: see [App_Flow.md](./App_Flow.md#44-status-transitions).

> **Store the enum in `packages/db` and import it in all three apps.** A string literal typed separately in React, Svelte, and Vue is how a status ends up in the database that no UI knows how to render. Drizzle `pgEnum` or Prisma enum — both give this for free.

### 7.2 `status` vs `payment_status`

These are separate because they move independently. A **COD order reaches `completed` while `payment_status` is still `pending`** — the goods are delivered but the cash has not been collected. Collapsing these into one column makes "is this paid?" unanswerable for COD, which is most orders.

### 7.3 The Reservation Transaction

Order creation and stock reservation are **one ACID transaction** ([App_Flow.md](./App_Flow.md#3-client--customer-journey)):

```sql
BEGIN;
  -- lock inventory rows to serialize concurrent checkouts on the same product
  SELECT id, quantity, reserved_quantity
    FROM inventory
   WHERE product_id = ANY($1)
     FOR UPDATE;

  -- verify availability for every line
  -- ...

  INSERT INTO orders (...) VALUES (...);
  INSERT INTO order_items (...) VALUES (...);

  UPDATE inventory
     SET reserved_quantity = reserved_quantity + $qty,
         updated_at = now()
   WHERE id = $inventory_id;
COMMIT;
```

`FOR UPDATE` row locks are what make two simultaneous checkouts for the last unit impossible. Without them, both read `available = 1`, both pass the check, both commit, and the store oversells.

---

## 8. Deliveries

```sql
CREATE TABLE deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  agent_id     UUID NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'assigned',
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  UNIQUE (order_id)
);

CREATE INDEX idx_deliveries_agent ON deliveries(agent_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `order_id` | UUID | FK → `orders`, `ON DELETE CASCADE` |
| `agent_id` | UUID | FK → `users` — the delivery agent |
| `status` | TEXT | `assigned` → `picked_up` → `delivered` |
| `assigned_at` | TIMESTAMPTZ | Queue acceptance time |
| `picked_up_at` | TIMESTAMPTZ | |
| `delivered_at` | TIMESTAMPTZ | |

### 8.1 Design Decisions

**`UNIQUE (order_id)` enforces one delivery per order.** Without it, two agents could both claim the same order and the buyer would see two agents. The constraint is the last line of defense behind the atomic Redis claim ([App_Flow.md](./App_Flow.md#42-agent-queue-redis)).

**`agent_id` joins to `users`.** One account table serves sellers, staff, buyers, and agents — separated by role, not by separate identity tables. Agent name and phone come from this join; `users` therefore carries `full_name` and `phone`.

**Redis holds the *queue*, Postgres holds the *truth*.** The queue is transient dispatch state; the `deliveries` row is the durable record. A Redis flush delays dispatch; it does not erase it.

**No `tenant_id` column.** Reached via `order_id → orders.tenant_id`, for the same reason as `inventory` — one boundary, one place.

---

## 9. Supporting Tables

### 9.1 Branches

Required by `inventory.branch_id`.

```sql
CREATE TABLE branches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  address      TEXT,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
```

**Only an Owner can create a branch** ([PRD.md](./PRD.md#34-role-based-access-inventory)).

### 9.2 Order Items

Required — `orders.total` is meaningless without line items.

```sql
CREATE TABLE order_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  inventory_id UUID REFERENCES inventory(id)   -- which shelf the units came from
);
```

**`unit_price` is copied at purchase time**, not read from `products.price` later. The order total is what the customer agreed to; a subsequent price edit must not rewrite history.

**`inventory_id` records the physical shelf**, which is what makes a return routable.

---

## 10. Multi-Tenancy Enforcement

Isolation is enforced in the **query layer**, with RLS as the backstop ([TRD.md](./TRD.md#51-data-isolation)).

**Rule:** every query against a tenant-scoped table filters on `tenant_id`. No exceptions.

**Second line of defense — Row Level Security:**

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory
  USING (product_id IN (
    SELECT id FROM products
     WHERE tenant_id = current_setting('app.tenant_id')::UUID
  ));
```

RLS makes a missed `WHERE` clause **fail closed** — the query returns nothing instead of another tenant's rows. For `inventory` and `deliveries`, which carry no `tenant_id`, the policy resolves tenancy through their parent table.

**Connection pooling:** the tenant context must be set per transaction (`SET LOCAL app.tenant_id`), or pooled connections leak one tenant's context into the next request. This is the most common way RLS silently stops protecting anything.

---

## 11. Demo Mode Data

The reserved `demo_tenant_id` tenant holds seeded demo data.

**Every query in Demo mode must filter to `demo_tenant_id`**, exactly as any other tenant filter does. Demo data is real rows in real tables, isolated by the same mechanism — not a bypass of isolation.

Demo-specific behavior:

| Concern | Normal | Demo |
|---------|--------|------|
| Password | Required | `NULL` — no password |
| Payment validation | Provider call | **Always returns `true`** ([Rules.md](./Rules.md) RULE 5) |
| Seeded data | None | Pre-populated catalog, stock, orders, deliveries |
| Isolation | `tenant_id` filter | Same filter, pointed at `demo_tenant_id` |

> Demo is a **data tenant**, not a **bypass**. The moment Demo mode skips isolation checks, it becomes a way to read production tenants. ([Rules.md](./Rules.md) RULE 5.)

---

## 12. Related Documents

- [PRD.md](./PRD.md) — product requirements
- [TRD.md](./TRD.md) — architecture
- [App_Flow.md](./App_Flow.md) — flows these tables serve