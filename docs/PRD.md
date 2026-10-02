# PRD — ShenoDev Ecosystem

**Status:** Draft v1.0
**Owner:** ShenoDev
**Last Updated:** 2026-10-02

---

## 1. Project Name

**ShenoDev Ecosystem** — three interconnected applications:

| App | Domain | Audience |
|-----|--------|----------|
| **ShenoStore** | `shenostore.shenodev.tech` | Storefront (B2C) + Seller onboarding (B2B) |
| **ShenoInventory** | `shenoinventory.shenodev.tech` | Sellers, branch staff |
| **ShenoFlow** | `shenoflow.shenodev.tech` | Delivery agents, buyers tracking orders |

---

## 2. Objective

Build an interconnected suite of applications handling B2B/B2C e-commerce, multi-tenant inventory management, and real-time logistics.

The three apps are **not independent**. One account, one tenant, one order lifecycle that spans all three. The value is in the seams:

- A sale on ShenoStore **reserves** stock in ShenoInventory.
- Stock loaded in ShenoInventory **appears** on ShenoStore with no sync job.
- A dispatch action in ShenoInventory **creates** a delivery job in ShenoFlow.

---

## 3. Core Features

### 3.1 Unified SSO

Single account access across all `*.shenodev.tech` subdomains using **JWT cookies**.

- One credential, three apps. No per-app login.
- Session minted once, honoured by all three hosts.
- Shared across subdomains → cookie must be scoped to `.shenodev.tech`.

> Technical constraints (cookie domain, signing, rotation) live in [TRD.md](./TRD.md#3-authentication).

### 3.2 Multi-Tenancy

**Strict data isolation** between different sellers/buyers.

- Every tenant-scoped table carries `tenant_id`.
- Isolation is enforced at the query layer, not by convention. A query without a tenant predicate is a bug.
- Cross-tenant reads are a security incident, not a UX edge case.

> Schema: [Database_Schema.md](./Database_Schema.md). Query-layer enforcement: [TRD.md](./TRD.md#5-data-isolation).

### 3.3 Demo Mode

A frictionless **"Login as Demo"** feature:

- Bypasses standard auth **and** payment gateways.
- Payment validation **always returns true**.
- Mapped to a universal **`demo_tenant_id`**.

Goal: a reviewer can click once and see the entire ecosystem working end-to-end, with seeded data and no external service dependency.

> Implementation rules: [Rules.md](./Rules.md) RULE 5. UI treatment: [UI_UX_Brief.md](./UI_UX_Brief.md#6-demo-mode).

### 3.4 Role-Based Access (Inventory)

| Role | Scope | Permissions |
|------|-------|-------------|
| **Owner** | Tenant-wide | Create branches, manage all branches, manage staff |
| **Admin** | Single branch | Manage stock, receive stock, dispatch, manage that branch |
| **Staff** | Single branch | Receive stock, view stock. **No** branch creation, **no** dispatch |

---

## 4. Target Audience

| Audience | Primary app | What they need |
|----------|-------------|----------------|
| **E-commerce clients** (buyers) | ShenoStore | Browse, cart, pay/COD, track delivery |
| **B2B store owners** (sellers) | ShenoStore + ShenoInventory | List products, load stock, dispatch, track agent |
| **Delivery agents** | ShenoFlow | See available jobs, accept one, update status |

---

## 5. Success Criteria

A demo is successful when, in one sitting, a reviewer can:

1. Register on ShenoStore and land on an auto-provisioned account in the other two apps.
2. Create a product with `stock: 0`.
3. Add stock to that product via barcode scan in ShenoInventory, on a specific branch/shelf.
4. See the product purchasable on ShenoStore without any manual sync step.
5. Buy it (COD or Demo mode).
6. Dispatch it, watch an agent accept it in ShenoFlow.
7. Track it as a client and see the agent's name and phone number.

Steps 1→7 are the spine of [App_Flow.md](./App_Flow.md). If any step requires a manual cross-app poke, the ecosystem is broken.

---

## 6. Out of Scope (v1)

- Real payment processor integration (Demo mode stubs this)
- Native mobile apps
- Multi-warehouse transfer between tenants
- Returns/refunds workflow
- Marketing tooling (coupons, campaigns, SEO tooling)

---

## 7. Related Documents

- [TRD.md](./TRD.md) — architecture, frameworks, infrastructure
- [UI_UX_Brief.md](./UI_UX_Brief.md) — brand identity, design tokens
- [App_Flow.md](./App_Flow.md) — user journeys and system flows
- [Database_Schema.md](./Database_Schema.md) — data model
- [Implementation_Plan.md](./Implementation_Plan.md) — phased build order
- [Agent.md](./Agent.md) — assistant role definition
- [Rules.md](./Rules.md) — binding agent rules