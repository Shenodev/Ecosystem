# Rules.md — Agent Rules & Execution Constraints

> **CRITICAL DIRECTIVE:** You are the Lead Architect and Core Developer for the ShenoDev Ecosystem. You must strictly follow these rules without deviation. Any code or action that violates these constraints is unacceptable.

**Binding rules for all AI agents and coding assistants working on this repository.**

These rules are **not advisory**. RULE 5 and RULE 6 protect production data and brand consistency; violating either is a defect, not a style preference.

| Rule | Covers |
|------|--------|
| **RULE 1** | Skill loading (2 per task) |
| **RULE 2** | Missing skills → `find skill` |
| **RULE 3** | Graphify before complex logic |
| **RULE 4** | TDD via Playwright (Red → Green → Refactor) |
| **RULE 5** | Demo isolation + tenant isolation |
| **RULE 6** | Brand enforcement |
| **RULE 7** | Workspace context + workflow adherence |

---

## RULE 1: SKILL LOADING (CRITICAL)

> Before executing any step, writing any code, or generating a file, you MUST load at least **2 relevant skills** from your library to ensure high-quality output.

**Applies to:** every task, not once per session.

**Completion criterion:** two skills, both genuinely relevant to the task at hand, are loaded into context before the first line of output is produced.

Two skills that both cover the same ground do not satisfy this. Two *distinct* relevant skills do.

---

## RULE 2: MISSING SKILLS

> If a required skill for the current task is not available in your loaded context, you MUST immediately use the `find skill` command to search for, download, and integrate the necessary skill before proceeding.

**Trigger:** you identify a capability the task needs, and no loaded skill covers it.

**Completion criterion:** the missing skill is found, integrated, and loaded — then work resumes. Do not proceed with a self-invented workaround while a skill exists to cover the gap.

---

## RULE 3: MANDATORY GRAPHING

> You must actively use the `graphify` skill to visualize and map out component hierarchies, data flows, and database schema relationships **before generating complex application logic**.

**Trigger:** "complex application logic" means anything touching more than one of these — a cross-app handoff, an order-status transition, a query joining multiple tables, a component tree spanning a shared package.

| Task | What to graph first |
|------|--------------------|
| Cross-app feature (e.g. dispatch) | Data flow across ShenoStore → ShenoFlow |
| Schema change | Table relationships before writing the query |
| New shared component | Component hierarchy + which apps consume it |

**Completion criterion:** the graph exists and has been read *before* the first line of implementation code.

Graphing a two-line change is overkill — this rule targets architecture, not trivia.

---

## RULE 4: TEST-DRIVEN DEVELOPMENT VIA PLAYWRIGHT

> **Test first, code second.** Write E2E and integration tests using **Playwright** *before* writing the actual implementation code.

### 4.1 The Cycle

| Phase | Action | Done when |
|-------|--------|-----------|
| **Red** | Write the Playwright test, run it, confirm it **fails** | Failure is for the *right* reason (missing feature, not a broken selector) |
| **Green** | Write the minimum code to pass | Test passes |
| **Refactor** | Improve structure, re-run | Test still passes |

**A feature is not complete until its Playwright test passes.** "The code looks right" is not completion — an unverified feature is unverified.

### 4.2 Scope

Playwright covers the three frameworks uniformly:

| Layer | Playwright tool |
|-------|-----------------|
| E2E | `test()` — full user journeys |
| Integration | API route tests against the serverless handlers |
| Visual/brand | Screenshot assertions for token + logo rendering |

### 4.3 Tests That Must Exist Per Phase

| Phase | Required test |
|-------|---------------|
| 1 | Tokens compile to the documented hex values (guards RULE 6) |
| 2 | One login works across all three subdomains; tenant scoping holds |
| 3 | Barcode scan commits stock; Admin cannot create a branch |
| 4 | Last-unit checkout: exactly one of two concurrent buyers succeeds |
| 5 | Agent accept race produces exactly one `deliveries` row |
| 6 | All three production domains serve the token-correct brand assets |

> These mirror the exit criteria in [Implementation_Plan.md](./Implementation_Plan.md) — a phase is not done until both its exit criteria and its test pass.

---

## RULE 5: SECURITY & MULTI-TENANCY

> **Data isolation:** every database query, mutation, and API route must enforce strict `tenant_id` isolation.
>
> **Demo environment bypass:** build conditional logic for the `demo_tenant_id` to safely bypass payment gateways (always return `true`) and prevent demo data from leaking into production metrics.

### 5.1 Payment Bypass

> Any database mutations or payment functions must inherently check for `demo_tenant_id` and bypass strict validations/charges accordingly.

Demo-mode payment validation **always returns `true`**. No provider call, no signature check, no charge.

### 5.2 Database Mutations

Every mutating operation checks the session's tenant against the universal `demo_tenant_id` and relaxes validation accordingly.

### 5.3 Demo Data Must Not Leak Into Production Metrics

Demo activity is excluded from production analytics, revenue figures, and operational dashboards. A demo order must never inflate real sales metrics, and demo analytics must never be presented as real.

| Surface | Rule |
|---------|------|
| Revenue / sales dashboards | Exclude `demo_tenant_id` |
| Product analytics | Exclude `demo_tenant_id` |
| Operational reports | Exclude `demo_tenant_id` |
| Demo views themselves | Full demo data, clearly badged ([UI_UX_Brief.md](./UI_UX_Brief.md#6-demo-mode)) |

Filtering on tenant is not optional here — a production metric that includes demo volume is wrong, and a demo figure presented as real is a trust failure with a customer.

### 5.4 The Boundary That Is Not Negotiable

**Demo mode relaxes *business* validation. It never relaxes *tenant isolation*.**

| Bypassed in Demo mode | Never bypassed |
|----------------------|----------------|
| Payment processing | Tenant filtering (`tenant_id` predicates) |
| Payment signature verification | Row Level Security policies |
| Charge amounts | Branch-scope checks for Admin/Staff |
| External service calls | The `UNIQUE(order_id)` delivery constraint |
| — | The `reserved_quantity <= quantity` CHECK |

**Demo is a data tenant, not an isolation bypass.** `demo_tenant_id` holds real rows in real tables, filtered by exactly the same `tenant_id` predicate as any other tenant.

**Why:** Demo mode is reachable without credentials and is often the first thing an external reviewer touches. If it skips isolation checks, it is a read path into every other tenant's data.

**Audit pattern — every payment or mutation function must visibly branch:**

```ts
async function processPayment(order: Order) {
  const session = await getSession();

  // Demo: simulated, no provider call, always succeeds
  if (session.tenantId === DEMO_TENANT_ID) {
    return { status: 'paid' as const, simulated: true };
  }

  // Production: real validation
  return await gateway.charge(/* ... */);
}
```

```ts
// Tenant isolation applies to BOTH paths — no early return above this line
const rows = await db.inventory.findMany({
  where: { tenantId: session.tenantId },  // present whether demo or not
});
```

A bypass that returns before the tenant filter is the exact bug this rule exists to prevent.

> Related: [PRD.md](./PRD.md#33-demo-mode) · [Database_Schema.md](./Database_Schema.md#11-demo-mode-data)

---

## RULE 6: UI/UX BRAND ENFORCEMENT

> **Design tokens:** strictly utilize the official ShenoDev Color Palette defined in [UI_UX_Brief.md](./UI_UX_Brief.md).
>
> **No hallucinations:** never invent, hallucinate, or use random colors outside this established identity kit.

### 6.1 The Tokens

Tailwind v4 is the token source of truth. Tokens are declared once in
`packages/ui/src/theme.css` as a Tailwind `@theme` block and consumed by all
three apps as generated utilities.

| Token | Hex | Utility example | Role |
|-------|-----|-----------------|------|
| `--color-sheno-bg-base` | `#080e1e` | `bg-sheno-bg-base` | Page background |
| `--color-sheno-bg-surface` | `#0F172A` | `bg-sheno-bg-surface` | Cards, sidebars, panels |
| `--color-sheno-bg-elevated` | `#1E293B` | `bg-sheno-bg-elevated` | Data tables, nested surfaces, modals |
| `--color-sheno-primary` | `#22d3ee` | `bg-sheno-primary` | Primary buttons, active states, highlights |
| `--color-sheno-primary-hover` | `#06B6D4` | `bg-sheno-primary-hover` | Hover states, **and ShenoFlow primary buttons** (§6.5) |
| `--color-sheno-text-primary` | `#FFFFFF` | `text-sheno-text-primary` | Headings, primary text, key values |
| `--color-sheno-text-secondary` | `#D1D5DB` | `text-sheno-text-secondary` | Labels, helper text, metadata |

Tokens resolve through three layers: **primitive** (`--color-sheno-cyan-400`) →
**semantic** (`--color-sheno-primary`) → **component** (utility classes). Only the
primitive layer may contain a hex.

### 6.2 Correct vs Incorrect

```tsx
// ✅ CORRECT — utilities resolve through the shared theme
<div className="bg-sheno-bg-surface text-sheno-text-primary" />
<button className="bg-sheno-primary text-sheno-bg-base hover:bg-sheno-primary-hover" />
```

```css
/* ❌ WRONG — hardcoded hex, cannot be re-themed or audited */
.btn-primary { background: #22d3ee; }
.card { background: #0f172a; }
```

```jsx
// ❌ WRONG — arbitrary color, not in the brand identity
<div style={{ background: '#1a2b3c' }} />
```

```jsx
// ❌ WRONG — arbitrary-value escape hatch bypasses the token system
<div className="bg-[#22d3ee]" />
```

**A hardcoded hex in app code is a build failure.** `packages/ui` asserts this
today via `tests/theme.spec.ts`. Enforce the app-side cases with a lint rule or
the `validate-tokens` script from the `design-system` skill — do not rely on
review to catch it.

**Changing a color** means editing `packages/ui/src/theme.css`. All three apps pick it up. Never edit an app's CSS or use a Tailwind arbitrary value to shift a color.

### 6.3 Status Colors

Logistics states use the dedicated status palette from [UI_UX_Brief.md](./UI_UX_Brief.md#26-status-colors) — `--color-sheno-status-in-progress`, `--color-sheno-status-waiting`, `--color-sheno-status-out-for-delivery`, `--color-sheno-status-completed`, `--color-sheno-status-low-stock`, `--color-sheno-status-demo`. Status colors are **never** substituted with brand tokens.

Every status chip pairs color with **an icon and a text label**. Color alone fails colorblind users and fails on washed-out displays.

### 6.5 ShenoFlow Cyan Split

On ShenoFlow, `--color-sheno-primary` (`#22d3ee`) means the **delivery state**
only, and primary buttons use `bg-sheno-primary-hover` (`#06B6D4`). Never put
cyan on both a primary button and an "Out for Delivery" chip in the same view.
Enforced by `apps/shenoflow/tests/home.spec.ts`.

### 6.4 The Logo

The ShenoDev logo is displayed on all auth screens, global headers, and email templates. Use the approved assets in `assets/brand/` — do not redraw, recolor, or restyle them.

| Placement | Asset |
|-----------|-------|
| Nav header | `png/horizontal/shenodev-horizontal-160w.png` (`@2x`), or the SVG |
| Auth screen / footer | `svg/shenodev-horizontal.svg`, or `png/horizontal/*-200w@2x.png` |
| Browser tab | `svg/favicon.svg` + `favicon.ico` |
| Apple touch / PWA | `png/icons/apple-touch-icon.png`, `icon-192.png`, `icon-512.png` |
| Tight spaces (<120px) | `svg/shenodev-mark.svg` |

**Logo color is `#22d3ee`** — the same value as `--color-sheno-primary`. The mark and the primary button sharing one color is what makes the brand read as a single system.

**Two source defects are already fixed in `assets/brand/`. Do not reintroduce:**

1. **Color.** The original files disagreed with each other (`#44afb9` in the SVG, `#29BDC5` in the PNG). The logo must be one color everywhere. The originals at the repo root are reference-only and **must not be used in any app**.
2. **Live text.** The original wordmark was a `<text>` element with a generic font stack, so it rendered differently per OS. It is now **outlined to paths** — no font dependency, identical rendering everywhere. Do not reintroduce a live `<text>` wordmark.
3. **Overlap.** The wordmark must sit **beside** the mark, never on top of it. The lockup aspect is **3.177**; a ratio near 2.4 means the wordmark has drifted onto the mark.

---

## RULE 7: CONTEXT & WORKSPACE DISCIPLINE

> **Mandatory tools:** use `caveman` and `headroom` to manage workspace context, monitor file states, and maintain a clear understanding of the project structure. Do not modify files without first validating context through these tools.
>
> **Strict adherence:** never deviate from the workflows defined in [PRD.md](./PRD.md), [TRD.md](./TRD.md), [App_Flow.md](./App_Flow.md), and [Implementation_Plan.md](./Implementation_Plan.md). Do not introduce unauthorized frameworks, libraries, or architectural changes outside the specified Next.js, Nuxt.js, SvelteKit, and Turborepo ecosystem.

### 7.1 Approved Stack

| Layer | Approved | Not without a decision |
|-------|----------|----------------------|
| Monorepo | Turborepo | npm workspaces, Nx, pnpm workspaces, Lerna |
| Store | Next.js | Remix, Astro |
| Inventory | SvelteKit | Nuxt, Next.js |
| Flow | Nuxt.js | Next.js, SvelteKit |
| Database | PostgreSQL + Prisma/Drizzle | MongoDB, SQLite, Firebase |
| Cache/Queue | Redis (Upstash) | Memcached, BullMQ, RabbitMQ |
| Tests | Playwright | Cypress, Puppeteer |
| Components | `packages/ui` tokens | MUI, Chakra, Ant Design |

**Adding a framework is a decision for you, not for the agent.** If a task appears to require a new dependency, stop and raise it. Unrequested scaffolding is how a monorepo loses its shared tokens.

### 7.2 Context Validation

Before editing files: confirm the target path, read the file's current state, and check for existing conventions in that directory. Read before writing — an overwrite of unexamined existing work is out of bounds.

### 7.3 Workflow Adherence

Follow the phase order in [Implementation_Plan.md](./Implementation_Plan.md). Do not reorder phases or start a later phase early. If the plan is wrong, say so — do not silently work around it.

---

## Priority Order

When rules conflict, the higher-severity rule wins:

| Priority | Rule | Severity |
|----------|------|----------|
| 1 | RULE 5 — Security & multi-tenancy | Data leak / trust failure |
| 2 | RULE 6 — Brand enforcement | Cross-app inconsistency |
| 3 | RULE 4 — TDD via Playwright | Unverified behaviour |
| 4 | RULE 7 — Context & workflow discipline | Scope creep |
| 5 | RULE 3 — Mandatory graphing | Architectural error |
| 6 | RULE 2 — Missing skills | Blocked work |
| 7 | RULE 1 — Skill loading | Quality degradation |

---

## Related Documents

- [Agent.md](./Agent.md) — role definition
- [UI_UX_Brief.md](./UI_UX_Brief.md) — full token reference
- [PRD.md](./PRD.md) — Demo Mode product intent
- [Database_Schema.md](./Database_Schema.md) — isolation enforcement