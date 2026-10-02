# Implementation Plan — ShenoDev Ecosystem

**Status:** Draft v1.0
**Last Updated:** 2026-10-02

---

## Phase 1: Foundation

**Goal:** a running monorepo with shared data access and a shared design system.

- Initialize **Turborepo**
- Set up `packages/db` — Prisma/Drizzle with **PostgreSQL**
- Set up `packages/ui` — design tokens from [UI_UX_Brief.md](./UI_UX_Brief.md)

**Tasks**

- [ ] `npx create-turbo@latest` monorepo scaffold
- [ ] `packages/db`: schema, migrations, typed client
- [ ] `packages/db`: all seven core tables from [Database_Schema.md](./Database_Schema.md) §2–§8
- [ ] `packages/db`: `branches` + `order_items` (§9)
- [ ] `packages/db`: Row Level Security policies + per-transaction `SET LOCAL app.tenant_id` (§10)
- [ ] `packages/db`: order status enum, exported for all three apps
- [ ] `packages/db`: seed script, including the reserved `demo_tenant_id` tenant (§11)
- [ ] `packages/ui`: three-layer token CSS (primitive → semantic → component)
- [ ] `packages/ui`: Tailwind preset (Next.js), Nuxt config preset, SvelteKit preset
- [ ] `packages/ui`: copy logo assets in; document usage rules
- [ ] `packages/config`: shared tsconfig, eslint, prettier

**Exit criteria**

- [ ] `turbo build` green across the monorepo
- [ ] Migration applies to an empty Postgres; `turbo db:seed` populates demo data
- [ ] A tenant-scoped query with a wrong `tenant_id` returns **zero rows** (RLS proven to fail closed)
- [ ] All three framework presets compile and resolve the same token values

---

## Phase 2: Authentication Core

**Goal:** one credential working across all three subdomains, with Demo mode.

- Build the **central JWT authentication API route**
- Configure **`.shenodev.tech` cookie sharing**

**Tasks**

- [ ] `packages/auth`: token mint/verify helpers, shared claim shape (TRD §8)
- [ ] `packages/auth`: JWT in HTTP-only cookie, `Domain=.shenodev.tech`, `Secure`, `SameSite=Lax`
- [ ] Auth API route in ShenoStore — register, login, logout, session
- [ ] Register → provision user + role assignments across all three apps (App_Flow §2)
- [ ] Session resolution helper in all three apps; **no cross-app auth calls** (TRD §7)
- [ ] Demo Mode: "Login as Demo" bypasses auth + payment, resolves to `demo_tenant_id`
- [ ] Rate-limit login; hash passwords with Argon2id
- [ ] Branch-scoping enforcement for Admin/Staff (§10 of schema)

**Exit criteria**

- [ ] Register on ShenoStore → land authenticated on ShenoInventory and ShenoFlow, no second login
- [ ] "Login as Demo" reaches all three apps as `demo_tenant_id`
- [ ] Token is unreadable from client JS (HTTP-only confirmed)
- [ ] An Admin cannot read another branch's inventory

---

## Phase 3: ShenoInventory (SvelteKit)

**Goal:** sellers can load stock onto a shelf and dispatch it.

- **Multi-branch management**
- **Barcode scanning input**
- **Low-stock email triggers**

**Tasks**

- [ ] SvelteKit app, dark theme, token import, logo in header
- [ ] Branch list + create (**Owner only**)
- [ ] Branch-scoped dashboard for Admin/Staff
- [ ] Shelf/zone/row management per branch
- [ ] Barcode scanner input → `sku` → `product_id` resolution
- [ ] Unknown barcode → **creation prompt**, not an error (App_Flow §2)
- [ ] Bulk stock add; single scan commits one unit
- [ ] Stock table showing `quantity` / `reserved_quantity` / `available`
- [ ] Low-stock detection (available < branch threshold) → email trigger
- [ ] Product catalog read (from ShenoStore's `products` table)
- [ ] Dispatch action → `waiting_for_shipping`

**Exit criteria**

- [ ] Owner creates a branch; Admin cannot
- [ ] Scanning a barcode increments stock in one transaction
- [ ] An unknown barcode offers product creation inline
- [ ] `reserved_quantity` never exceeds `quantity` (DB CHECK proven)
- [ ] Low-stock email fires on threshold crossing

---

## Phase 4: ShenoStore (Next.js)

**Goal:** the public storefront and checkout.

- **Client-facing catalog**
- **Shopping cart**
- **Mock payment gateway for Demo mode**

**Tasks**

- [ ] Next.js app, SSR catalog pages, SEO metadata (TRD §3)
- [ ] Product detail, listing, search
- [ ] Only products with `available > 0` are purchasable
- [ ] Cart
- [ ] Checkout: prepaid or COD
- [ ] **Order + stock reservation in one ACID transaction**, `FOR UPDATE` row locks (schema §7.3)
- [ ] Mock payment gateway; **Demo mode always returns `true`** (Rules RULE 5)
- [ ] Seller onboarding: create products (`stock: 0`)
- [ ] Order history + status view for buyer and seller
- [ ] Order tracking entry point → ShenoFlow

**Exit criteria**

- [ ] `stock: 0` products are visible but unpurchasable
- [ ] Two simultaneous checkouts for the last unit: **exactly one succeeds**
- [ ] Demo mode checkout succeeds with no payment provider configured
- [ ] Order creation is atomic — no order exists without its reservation

---

## Phase 5: ShenoFlow (Nuxt.js)

**Goal:** agents get jobs; everyone tracks them.

- **Redis-backed agent queue**
- **Live order tracking dashboards**

**Tasks**

- [ ] Nuxt app, dark theme, token import, logo in header
- [ ] Upstash Redis client
- [ ] Enqueue on dispatch: `LPUSH delivery:queue:{tenant_id}`
- [ ] **Sequential** agent ping with per-agent timeout (App_Flow §4.2)
- [ ] **Atomic accept** — first claim wins, later claims fail
- [ ] `deliveries` row on accept; order → `out_for_delivery`
- [ ] Agent dashboard: available jobs, my jobs, status transitions
- [ ] Client tracking view — **public**, no login, by order reference
- [ ] Buyer view: agent **name + phone number** after acceptance
- [ ] Exhausted-queue fallback: order stays `waiting_for_shipping` + flagged
- [ ] High-contrast status chips per UI/UX brief §5

**Exit criteria**

- [ ] Dispatch pings agents **one at a time**, not broadcast
- [ ] Two agents racing to accept: **one `deliveries` row**, enforced by `UNIQUE(order_id)`
- [ ] Queue is tenant-scoped — agents never see another tenant's jobs
- [ ] Client sees agent name + phone after acceptance
- [ ] Queue exhaustion surfaces, never silently drops

---

## Phase 6: Vercel Deployment

**Goal:** all three apps live on their domains.

**Tasks**

- [ ] Configure environment variables across all three projects
- [ ] Connect the monorepo to Vercel (three projects, distinct root dirs)
- [ ] Map custom domains: `shenostore` / `shenoinventory` / `shenoflow` `.shenodev.tech`
- [ ] Verify the shared cookie works across all three production domains
- [ ] Production Postgres + Upstash Redis
- [ ] Migrations run on deploy; RLS context set per request
- [ ] Seed the `demo_tenant_id` tenant
- [ ] Verify SSL, region, and cold-start latency per app
- [ ] Confirm brand tokens identical on all three deployed apps

**Exit criteria**

- [ ] All three domains serve over HTTPS
- [ ] One login works across all three production subdomains
- [ ] Demo mode works in production with no payment provider configured
- [ ] No hardcoded hex in deployed CSS (token lint clean)
- [ ] End-to-end pass of PRD §5, steps 1→7, in production

---

## Build Order Rationale

```
1  Foundation   ──► everything depends on db + tokens
2  Auth         ──► every app depends on the session
3  Inventory    ──► stock must exist before anything can be sold
4  Store        ──► selling requires stock
5  Flow         ──► delivery requires orders
6  Deploy       ──► only once the whole path works
```

**Why Inventory before Store:** building the storefront first means a demo where nothing is purchasable — every catalog view is `stock: 0`. Shipping Inventory first means Phase 4 ends with a working purchase.

**Why Flow before deploy:** the demo's payoff is agent assignment and live tracking. Deploying without it leaves a storefront with no delivery story.

---

## Related Documents

- [PRD.md](./PRD.md) — what is being built
- [TRD.md](./TRD.md) — how it is built
- [Database_Schema.md](./Database_Schema.md) — data model
- [UI_UX_Brief.md](./UI_UX_Brief.md) — design system
- [App_Flow.md](./App_Flow.md) — flows