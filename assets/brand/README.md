# ShenoDev Brand Assets

Generated logo set for the ShenoDev Ecosystem. Reference: [UI_UX_Brief.md](../../docs/UI_UX_Brief.md).

---

## Source Files (do not use in apps)

| File | Status |
|------|--------|
| `../../Logo Horizontal without slugan.svg` | **Reference only.** Wrong color, live-font wordmark. |
| `../../Logo Icon.png` | **Reference only.** Wrong color, non-square. |

Both source files had defects (see [Corrections](#corrections-applied)). Everything in `assets/brand/` supersedes them.

---

## Corrections Applied

**1. Color was inconsistent.** The two source files used *different* teals for the same artwork:

| File | Mark color |
|------|-----------|
| Horizontal SVG | `#44afb9` |
| Icon PNG | `#29BDC5` |
| **Generated set** | **`#22d3ee`** (brand primary) |

A logo that changes color between the nav and the favicon reads as a bug. All generated assets use `#22d3ee`, unifying the logo with the primary button and active states.

**2. The wordmark was live `<text>`.** The original declared `font-family: SansSerifBold, SansSerif` — a generic fallback. Verified it resolves to **Noto Sans Regular** (not bold) on stock Linux and renders differently per OS.

The wordmark is now **outlined to vector paths** using Noto Sans Bold. Verified: zero `<text>`/`font-family`/`tspan` elements, and byte-identical renders across runs.

> **Tradeoff:** the wordmark letterforms are now frozen to Noto Sans Bold. Licensing a real brand typeface later means re-outlining the wordmark. The mark is unaffected — already a pure path.

---

## Layout

```
assets/brand/
├── svg/
│   ├── shenodev-horizontal.svg        mark + wordmark (primary cyan + white)
│   ├── shenodev-horizontal-mono.svg   all-white (single-ink / print / watermark)
│   ├── shenodev-mark.svg              mark only (cyan)
│   ├── shenodev-mark-mono.svg         mark only (white)
│   └── favicon.svg                    square, mark centred
├── png/
│   ├── horizontal/                    nav/footer lockups, 1x + @2x
│   │   ├── shenodev-horizontal-120w.png  (+ @2x)
│   │   ├── shenodev-horizontal-160w.png  (+ @2x)   ← nav default
│   │   ├── shenodev-horizontal-200w.png  (+ @2x)   ← footer default
│   │   ├── shenodev-horizontal-240w.png  (+ @2x)
│   │   ├── shenodev-horizontal-320w.png  (+ @2x)
│   │   ├── shenodev-horizontal-400w.png  (+ @2x)
│   │   └── shenodev-horizontal-480w.png  (+ @2x)
│   ├── mark/
│   │   ├── shenodev-mark-64h.png
│   │   ├── shenodev-mark-128h.png
│   │   ├── shenodev-mark-256h.png
│   │   └── shenodev-mark-512h.png
│   └── icons/
│       ├── favicon-16x16.png  ·  favicon-32x32.png
│       ├── favicon-48x48.png  ·  favicon-96x96.png
│       ├── apple-touch-icon.png         180×180, opaque #080e1e
│       ├── icon-192.png  ·  icon-512.png          PWA "any"
│       └── icon-maskable-192.png · icon-maskable-512.png   PWA maskable
├── favicon.ico            16/24/32/48/64/128/256
└── site.webmanifest       theme #22d3ee, background #080e1e
```

---

## Usage

| Placement | Asset |
|-----------|-------|
| Nav header | `png/horizontal/shenodev-horizontal-160w.png` + `@2x` |
| Auth screen | `svg/shenodev-horizontal.svg` |
| Footer | `png/horizontal/shenodev-horizontal-200w.png` + `@2x` |
| Browser tab | `svg/favicon.svg` + `favicon.ico` |
| Apple touch icon | `png/icons/apple-touch-icon.png` |
| PWA install | `png/icons/icon-192.png`, `icon-512.png` (+ maskable variants) |
| Tight spaces (<120px) | `svg/shenodev-mark.svg` |

### Next.js (`shenostore`)

```tsx
import Image from "next/image";

// App Router — file conventions
//   app/favicon.ico            -> assets/brand/favicon.ico
//   app/icon.png               -> assets/brand/png/icons/icon-192.png
//   app/apple-icon.png         -> assets/brand/png/icons/apple-touch-icon.png
```

Header:

```tsx
<Image src="/brand/shenodev-horizontal-160w.png"
       alt="ShenoDev" width={160} height={50} priority />
```

Metadata:

```tsx
export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/brand/site.webmanifest",
  themeColor: "#22d3ee",
};
```

### SvelteKit (`shenoinventory`) / Nuxt (`shenoflow`)

```
static/
├── favicon.ico
├── favicon.svg
├── apple-touch-icon.png
├── site.webmanifest
└── brand/
    ├── shenodev-horizontal-160w.png
    ├── shenodev-horizontal-160w@2x.png
    ├── shenodev-horizontal-200w.png
    ├── shenodev-horizontal-200w@2x.png
    └── icon-192.png
```

```svelte
<!-- SvelteKit -->
<script>
  import logo from "$lib/assets/brand/shenodev-horizontal-160w.png";
</script>
<img src={logo} alt="ShenoDev" width="160" height="50" />
```

```vue
<!-- Nuxt -->
<script setup>
const logo = new URL('~/assets/brand/shenodev-horizontal-160w.png', import.meta.url).href;
</script>
<img :src="logo" alt="ShenoDev" width="160" height="50" />
```

---

## Geometry

| Asset | viewBox | Aspect (w/h) |
|-------|---------|--------------|
| Horizontal lockup | `-4 -4 1663 523.5` | 3.177 |
| Mark only | `-2 -2 392 519.5` | 0.755 |

The lockup ratio matches the original SVG's 3.166. **If it ever drops to ~2.4, the wordmark has drifted onto the mark** — that was a real defect caught by a build-time overlap assertion.

**The mark is portrait (0.755), not square.** Square slots letterbox it — never stretch. All icon assets are centred square compositions.

**Minimum sizes:** lockup legible to **120px wide**. Below ~100px, the wordmark is unreadable — use the mark alone.

### Intrinsic sizes

Always set `width`/`height` (or an aspect ratio) to prevent layout shift.

| Asset | Size |
|-------|------|
| `shenodev-horizontal-120w.png` | 120×38 |
| `shenodev-horizontal-160w.png` | 160×50 |
| `shenodev-horizontal-200w.png` | 200×63 |
| `shenodev-horizontal-240w.png` | 240×76 |
| `shenodev-mark-64h.png` | 48×64 |
| `shenodev-mark-128h.png` | 97×128 |

---

## Rules

- Logo color is **`#22d3ee`** — identical to `--sheno-primary`. Never restyle or recolor.
- Use the mono (all-white) variant only for single-ink print/watermark contexts.
- Never animate, stretch, or add effects to the logo.
- Don't pull assets from the repo root (see [Corrections](#corrections-applied)).

Binding rules: [Rules.md](../../docs/Rules.md) RULE 6.