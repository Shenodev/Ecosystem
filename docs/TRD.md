# TRD — ShenoDev Ecosystem

**Status:** Draft v1.0
**Companion to:** [PRD.md](./PRD.md)
**Last Updated:** 2026-10-02

---

## 1. Architecture

**Monorepo managed via Turborepo.**

One repository, three deployable apps, shared packages. Cross-app consistency (types, design tokens, DB access) is the reason for the monorepo — not build speed.

### 1.1 Layout

```
sheno-ecosystem/
├── apps/
│   ├── shenostore/      # Next.js
│   ├── shenoinventory/  # SvelteKit
│   └── shenoflow/       # Nuxt.js
├── packages/
│   ├── db/              # Prisma/Drizzle + PostgreSQL
│   ├── ui/              # shared design tokens + components
│   ├── auth/            # JWT mint/verify helpers
│   └── config/          # shared tsconfig, eslint, tsconfig
└── docs/
```

`packages/db` and `packages/ui` are the load-bearing shared packages. Every other package is optional.

---

## 2. Hosting & Deployment

**Vercel (Edge/Serverless environments).**

Three separate Vercel projects, one per app, all pointing at the same monorepo with different root directories.

**Constraint that shapes everything downstream:** serverless functions are stateless and short-lived. There is no connection pool to keep open, no in-memory cache that survives a request, no background worker that runs forever.

Consequences:

- Sessions live in **Redis**, not in process memory.
- The delivery-agent queue lives in **Redis**, not in a Node worker.
- Anything that must outlive a request needs an external home or an explicit kick-off from a request.

---

## 3. Frontend Frameworks

Each framework is chosen for what that app actually does. This is not a preference split.

| App | Framework | Why this framework |
|-----|-----------|--------------------|
| **ShenoStore** | **Next.js** | Optimized for SEO and SSR. Public catalog pages must be indexable and fast on first paint. |
| **ShenoInventory** | **SvelteKit** | High-performance DOM updates. Heavy data grids and barcode-scanner input re-render constantly; compile-time reactivity keeps large tables responsive where a vdom diff would not. |
| **ShenoFlow** | **Nuxt.js** | High reactivity for real-time delivery agent dashboards. Status ticks and queue updates repaint continuously; the reactivity model is built for it. |

**Consequence:** no shared component *library* beyond tokens. The three frameworks cannot share a component runtime. What they share is `packages/ui` — **design tokens and asset conventions**, not JSX/Svelte/Vue components. See [UI_UX_Brief.md](./UI_UX_Brief.md#3-design-system).

---

## 4. Backend & APIs

**Next.js / Nuxt.js API routes handling business logic within the Vercel serverless ecosystem.**

No separate backend service. Business logic lives in route handlers colocated with the app that owns the domain:

| Domain | Owner app | Rationale |
|--------|-----------|-----------|
| Auth / session / SSO | Next.js (`shenostore`) | First-party, owns the account lifecycle |
| Catalog, cart, orders, payments | Next.js (`shenostore`) | Transactional with checkout |
| Stock, branches, barcode intake | SvelteKit (`shenoinventory`) server routes | Physical-world operations |
| Dispatch, agent queue, tracking | Nuxt.js (`shenoflow`) server routes | Real-time, highest churn |

ShenoFlow **reads** order and stock data; ShenoStore is the **writer of record** for orders and payments. ShenoFlow never mutates catalog or payment state.

---

## 5. Database

**PostgreSQL** for robust ACID transactions, multi-tenancy, and relational integrity.

Order placement must atomically: decrement available stock, increment reserved stock, create the order, and write the reservation. Partial failure here means overselling. This is an ACID requirement, not a preference.

### 5.1 Data Isolation

Tenant isolation is enforced in the **query layer**, not by developer discipline.

- Every tenant-scoped query filters on `tenant_id`.
- Writes always set `tenant_id` from the session, never from client input.
- Postgres Row Level Security is the intended second line of defense — a missed `WHERE` clause then fails closed instead of leaking another tenant's rows.

> Tables and columns: [Database_Schema.md](./Database_Schema.md).

---

## 6. Caching & Queues

**Redis (Upstash)** for two distinct jobs:

1. **Session management** — the shared SSO session backing the JWT cookie across all three subdomains.
2. **Routing delivery agent requests** — the dispatch queue that pings available agents sequentially when an order enters `Waiting for Shipping`.

Upstash is used specifically because it speaks HTTP, so it works from Edge and serverless runtimes where a TCP client would need a long-lived connection.

> Queue semantics: [App_Flow.md](./App_Flow.md#4-logistics-journey).

---

## 7. Authentication Detail

> Product intent: [PRD.md](./PRD.md#31-unified-sso).

- **JWT in an HTTP-only cookie**, scoped to `.shenodev.tech` so all three apps receive it.
- Cookie is the transport; the token is the proof. Never read the token into app state or expose it to client JS.
- Each app verifies the signature and reads claims. **No app calls another app to check "am I logged in"** — that turns every request into a cross-region round trip.
- Demo mode mints a session carrying the universal `demo_tenant_id`, which downstream code checks explicitly ([Rules.md](./Rules.md) RULE 5).

---

## 8. Cross-App Contracts

Three apps sharing one database is only safe if they agree on the shapes between them.

| Contract | Owned by | Consumed by |
|----------|----------|-------------|
| Order status enum | `packages/db` | all three apps |
| Stock availability (`quantity - reserved_quantity`) | `packages/db` | ShenoStore, ShenoFlow |
| Design tokens | `packages/ui` | all three apps |
| Session claim shape | `packages/auth` | all three apps |

**The order status enum is imported, never redeclared.** A string literal copy in a second framework is a silent divergence bug that surfaces as a status that nothing renders.

---

## 9. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Stock display freshness | No manual sync; changes visible on next read |
| Barcode scan → stock update | Immediate, single scan commits one unit |
| Tenant isolation | Fails closed — RLS backstop behind the query layer |
| Demo mode | Zero external dependencies, works offline of any payment provider |
| Design consistency | All three apps render from the same token source |

---

## 10. Related Documents

- [PRD.md](./PRD.md) — product requirements
- [UI_UX_Brief.md](./UI_UX_Brief.md) — design tokens and brand rules
- [App_Flow.md](./App_Flow.md) — flows
- [Database_Schema.md](./Database_Schema.md) — schema
- [Implementation_Plan.md](./Implementation_Plan.md) — build order