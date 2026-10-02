# UI/UX Brief — ShenoDev Ecosystem

**Status:** v1.0 — color placeholders resolved
**Last Updated:** 2026-10-02

---

## 1. Brand Identity

The entire visual language must **strictly adhere** to the official ShenoDev brand identity kit.

The **ShenoDev logo is the cornerstone of the UI**. It must be prominently displayed across:

- All auth screens (login, register, **Demo login**)
- Global headers on every app
- Email templates

**Approved logo assets** → `assets/brand/` (generated; see [assets/brand/README.md](../assets/brand/README.md))

| Asset | Path | Use |
|-------|------|-----|
| Horizontal lockup | `svg/shenodev-horizontal.svg` | Headers, email headers, auth screens |
| Horizontal lockup (all-white) | `svg/shenodev-horizontal-mono.svg` | Single-ink / print / watermark |
| Mark only | `svg/shenodev-mark.svg` | Favicon, avatars, tight spaces |
| Favicon (vector) | `svg/favicon.svg` | `<link rel="icon">` |
| Raster lockups | `png/horizontal/*-160w.png` (`@2x`) | Nav / footer, high-DPI |
| Icon set | `png/icons/*` | favicon, apple-touch-icon, PWA |
| `.ico` + manifest | `favicon.ico`, `site.webmanifest` | Browser tab, installable PWA |

### 1.1 Two Corrections Applied to the Source Files

Both original files had defects that are fixed in the generated set. Do not reintroduce them.

**1. Color was inconsistent.** The two source files used *different* teals for the same artwork — the horizontal SVG mark was `#44afb9` while `Logo Icon.png` was `#29BDC5`. A logo that changes color between the nav and the favicon reads as a bug. **All generated assets use `#22d3ee` (brand primary)**, unifying the mark with buttons, active states, and the brand system.

> The original `#44afb9` / `#29BDC5` files are still at the repo root for reference, but **are not to be used in any app**.

**2. The wordmark was live `<text>`.** The original declared `font-family: SansSerifBold, SansSerif` — a generic fallback, not a real font. Verified: it resolves to **Noto Sans Regular** (not bold) on a stock Linux box, and renders differently on macOS, Windows, and Linux. Rasterizing it produced inconsistent letterforms.

**The wordmark is now outlined to vector paths** (Noto Sans Bold, the closest match to the intended `SansSerifBold`). Verified: zero `<text>`, `font-family`, or `tspan` elements remain, and renders are byte-identical across runs.

> **Tradeoff to be aware of:** the wordmark letterforms are now *frozen* to Noto Sans Bold. If you later license a real brand typeface, the wordmark paths must be re-outlined. The mark itself is unaffected — it is already a pure path.

### 1.2 Logo Geometry

| Asset | viewBox | Aspect (w/h) |
|-------|---------|--------------|
| Horizontal lockup | `-4 -4 1663 523.5` | 3.177 |
| Mark only | `-2 -2 392 519.5` | 0.755 |

The lockup aspect (3.177) matches the original SVG's declared ratio (3.166) — a 0.3% difference from 4 units of padding on each edge. **If this ratio ever drops to ~2.4, the wordmark has drifted on top of the mark** — that was a real defect during generation, caught by a build-time overlap assertion.

**The mark is portrait (0.755), not square.** Any square slot must letterbox it — a square favicon is built by centring the mark, not stretching it. All icon assets are centred square compositions, not stretched ones.

**Minimum sizes:** the lockup is legible down to **120px wide** (mark + wordmark). Below that, use `shenodev-mark` alone — the wordmark becomes unreadable under ~100px.

**Intrinsic sizes** (use these to avoid layout shift — `width`/`height` are required):

| Asset | Size |
|-------|------|
| `shenodev-horizontal-160w.png` | 160×50 |
| `shenodev-horizontal-200w.png` | 200×63 |
| `shenodev-mark-64h.png` | 48×64 |

---

## 2. Color Palette

### 2.1 Backgrounds — Deep Slate

| Token | Hex | Role |
|-------|-----|------|
| `--sheno-bg-base` | **`#080e1e`** | **Primary site background** — all app shells, all page canvases |

Deepest value in the system. Every surface sits on top of this.

### 2.2 Surfaces & Cards — Dark Slate

| Token | Hex | Role |
|-------|-----|------|
| `--sheno-bg-surface` | **`#0F172A`** | Cards, sidebars, top-level panels |
| `--sheno-bg-elevated` | **`#1E293B`** | Nested surfaces, data tables, dropdowns, modals |

Used for **cards, sidebars, and data tables** in Inventory and Logistics.

The two-step elevation (`#0F172A` → `#1E293B`) is what makes nesting legible. A card inside a modal inside a page needs three depths, and this gives exactly that.

### 2.3 Primary Actions — Electric Cyan

| Token | Hex | Role |
|-------|-----|------|
| `--sheno-primary` | **`#22d3ee`** | **Primary buttons, active states, highlights** |

The single most prominent UI color. If something is the main action on screen, it is this.

### 2.4 Secondary Actions — Dark Cyan

| Token | Hex | Role |
|-------|-----|------|
| `--sheno-primary-hover` | **`#06B6D4`** | **Hover states, secondary elements** |

Darker than primary, so hover reads as a *press* rather than a *lift*. Applies to hover states and subordinate elements.

### 2.5 Typography

| Token | Value | Role |
|-------|-------|------|
| `--sheno-text-primary` | **`text-white`** (`#FFFFFF`) | Headings, primary body text, values in data tables |
| `--sheno-text-secondary` | **`text-gray-300`** (`#D1D5DB`) | Labels, helper text, metadata, de-emphasized columns |

Chosen for **maximum contrast against the dark backgrounds**. Measured WCAG 2.1 ratios — every pairing below clears AA, most clear AAA:

| Foreground | Background | Ratio | Grade |
|-----------|-----------|-------|-------|
| `#FFFFFF` | `#080e1e` | 19.23:1 | AAA |
| `#FFFFFF` | `#0F172A` | 17.85:1 | AAA |
| `#FFFFFF` | `#1E293B` | 14.63:1 | AAA |
| `#D1D5DB` | `#080e1e` | 13.05:1 | AAA |
| `#D1D5DB` | `#0F172A` | 12.12:1 | AAA |
| `#D1D5DB` | `#1E293B` | 9.93:1 | AAA |

Cyan clears AAA as **text** on every surface, so cyan labels are safe anywhere — not just on large type:

| Foreground | Background | Ratio | Grade |
|-----------|-----------|-------|-------|
| `#22d3ee` | `#080e1e` | 10.64:1 | AAA |
| `#22d3ee` | `#0F172A` | 9.88:1 | AAA |
| `#22d3ee` | `#1E293B` | 8.09:1 | AAA |
| `#06B6D4` | `#080e1e` | 7.92:1 | AAA |
| `#06B6D4` | `#0F172A` | 7.35:1 | AAA |
| `#06B6D4` | `#1E293B` | 6.03:1 | AA |

**Button text is dark on cyan**, not white: `#080e1e` on `#22d3ee` is 10.64:1, while white-on-cyan would be 1.7:1 and fail outright. Cyan is a light color — light text on it never works.

### 2.6 Status Colors

The base palette defines brand and hierarchy. **Logistics and stock states need a separate, unambiguous set** — a status that is misread costs a physical delivery.

| Status | Hex | On `#0F172A` | On `#1E293B` | Rationale |
|--------|-----|-----------|-----------|-----------|
| In Progress | `#38bdf8` | 8.33:1 AAA | 6.83:1 AA | Blue — work underway |
| Waiting for Shipping | `#fbbf24` | 10.69:1 AAA | 8.76:1 AAA | Amber — blocked, needs action |
| Out for Delivery | `#22d3ee` | 9.88:1 AAA | 8.09:1 AAA | Cyan — in motion, on brand |
| Completed | `#4ade80` | 10.25:1 AAA | 8.40:1 AAA | Green — done |
| Low Stock | `#f87171` | 6.45:1 AA | 5.29:1 AA | Red — needs action |
| Demo / Sandbox | `#a78bfa` | 6.56:1 AA | 5.38:1 AA | Violet — deliberately not a brand color, so sandbox never reads as real |

All six clear AA on both surfaces, so a chip reads correctly on a card (`#0F172A`) or inside a table (`#1E293B`) with no per-context override.

> **Rule:** cyan `#22d3ee` means *primary action* **or** *Out for Delivery* — never both on the same screen. On ShenoFlow, use cyan for the delivery state and shift primary buttons to `#06B6D4` so "click here" and "it's moving" stay distinct.

Every status chip pairs its color with a **text label and an icon**, never color alone.

---

## 3. Design System

Unified component logic to maintain a cohesive look across Next.js, Nuxt, and SvelteKit.

### 3.1 The Three-Framework Constraint

Next.js (React), SvelteKit (Svelte), and Nuxt (Vue) **cannot share a component runtime**. So `packages/ui` ships:

- **Design tokens** — a Tailwind v4 `@theme` block, shared 100%
- **Logo assets and usage rules** — shared 100%
- Component *implementations* — **per framework, per app**

Tailwind v4 is CSS-first and framework-agnostic, so **one file replaces three presets**: `packages/ui/src/theme.css`. Every app imports that single entry point and receives identical token values by construction rather than by three hand-maintained presets staying in sync. Apps wire it through their own integration — `@tailwindcss/postcss` (Next.js), `@tailwindcss/vite` (SvelteKit), `@tailwindcss/vite` (Nuxt).

Consistency is enforced at the **token layer**, where it can be shared. Where a component must be reimplemented, the tokens guarantee it looks identical.

### 3.2 Token Architecture

Three layers, following the standard primitive → semantic → component pattern. Implemented in `packages/ui/src/theme.css`:

```css
/* Layer 1 — Primitive (raw values). The only layer allowed to hold a hex. */
@theme {
  --color-sheno-slate-950: #080e1e;
  --color-sheno-slate-900: #0F172A;
  --color-sheno-slate-800: #1E293B;
  --color-sheno-cyan-400:  #22d3ee;
  --color-sheno-cyan-500:  #06B6D4;
  --color-sheno-white:     #FFFFFF;
  --color-sheno-gray-300:  #D1D5DB;
}

/* Layer 2 — Semantic (purpose). Pure var() references, so re-theming a
   primitive propagates. `inline` makes Tailwind emit the var() reference into
   utilities instead of inlining the resolved value. */
@theme inline {
  --color-sheno-bg-base:      var(--color-sheno-slate-950);
  --color-sheno-bg-surface:   var(--color-sheno-slate-900);
  --color-sheno-bg-elevated:  var(--color-sheno-slate-800);
  --color-sheno-primary:      var(--color-sheno-cyan-400);
  --color-sheno-primary-hover:var(--color-sheno-cyan-500);
  --color-sheno-text-primary: var(--color-sheno-white);
  --color-sheno-text-secondary: var(--color-sheno-gray-300);
}

/* Layer 3 — Component. Utility compositions in app markup, never a hex. */
<button class="bg-sheno-primary text-sheno-bg-base hover:bg-sheno-primary-hover" />
<div class="bg-sheno-bg-surface" />
<table class="bg-sheno-bg-elevated" />
```

### 3.3 Component State Matrix

| Component | Default | Hover | Active | Disabled |
|-----------|---------|-------|--------|----------|
| Button (primary) | `#22d3ee` | `#06B6D4` | `#06B6D4` | `#1E293B` |
| Button (secondary) | transparent + `#22d3ee` border | `#1E293B` bg | `#1E293B` bg | `#1E293B` border, muted text |
| Card | `#0F172A` | — | — | — |
| Table | `#1E293B` | — | — | — |
| Sidebar item | transparent | `#1E293B` | `#0F172A` | — |
| Sidebar item (active) | `#1E293B` + `#22d3ee` left bar | — | — | — |
| Nav / tab (active) | `#22d3ee` text + underline | — | — | — |

**Rule:** component styles reference **semantic tokens only**. A component that hardcodes `#22d3ee` instead of `var(--sheno-primary)` cannot be re-themed and cannot be audited.

---

## 4. Layout & Typography Rules

- **Page background** is always `#080e1e`. No exceptions — a light page inside this system reads as broken.
- **Cards and sidebars** are `#0F172A`. **Data tables and nested surfaces** are `#1E293B`.
- Primary actions are solid `#22d3ee` fills with **dark text** (`#080e1e`) for contrast — cyan-on-cyan text fails.
- Body text is `#D1D5DB`; reserve pure white for headings and high-value data.
- Numeric columns (quantity, price, totals) are **tabular-nums** and right-aligned, or they will not scan in a data grid.

---

## 5. Logistics UI

Must include **high-contrast status indicators** for: `In Progress`, `Waiting for Shipping`, `Out for Delivery` (plus `Completed`).

**Requirements:**

- Every status is a **filled chip**: status text at full-strength color on the surface color from §2.6. No low-opacity text on dark backgrounds.
- Every chip carries **an icon and a text label**. Color alone fails colorblind users and fails on washed-out displays.
- Status chips are visually identical across ShenoInventory (dispatch column), ShenoFlow (agent queue), and the client tracking view in ShenoStore.
- The **agent's name and phone number** appear once an agent accepts — this is the moment the buyer stops wondering. It gets emphasis, not muted metadata styling.

---

## 6. Demo Mode UI

Clearly **distinct banner or badge** indicating the user is in a sandbox environment.

**Requirements:**

- Persistent, non-dismissible banner at the top of every app while Demo mode is active.
- Uses `--status-demo` (`#a78bfa`) — deliberately outside the brand palette so a screenshot can never be mistaken for a real environment.
- Banner text states plainly: **"Demo Mode — sandbox data, no real payments or deliveries."**
- Payment UI in Demo mode is labeled as simulated at the point of the charge, not only in the banner.
- Never place the demo badge where it could be mistaken for a dismissible notification.

---

## 7. Enforcement

- Hardcoded hex values in app code are a **build failure**, not a style nit. Enforce with a lint rule or the `validate-tokens` script from the `design-system` skill.
- The token source of truth is `packages/ui`. Changing a color means editing tokens and letting all three apps pick it up — never editing an app's CSS directly.
- Full rules: [Rules.md](./Rules.md) RULE 6.

---

## 8. Related Documents

- [PRD.md](./PRD.md) — product requirements
- [TRD.md](./TRD.md) — architecture
- [Rules.md](./Rules.md) — RULE 6 brand enforcement