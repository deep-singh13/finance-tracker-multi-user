# DESIGN.md

Generated from the live codebase. Reflects actual tokens, components, and motion patterns in production.

---

## Color

The palette is a **deep navy system** — OLED dark is the primary context, with a matching light mode that uses cool blue-grey. The accent is gold (amber), used sparingly for the shimmer treatment only. No gradients on text except the intentional gold shimmer.

### CSS Custom Properties (HSL)

```css
/* Light mode */
--background:          220 30% 96%;   /* cool blue-grey surface */
--foreground:          222 47% 11%;   /* deep navy text */
--card:                0 0% 100%;
--card-foreground:     222 47% 11%;
--primary:             217 91% 50%;   /* electric blue */
--primary-foreground:  0 0% 100%;
--secondary:           220 14% 93%;
--secondary-foreground: 222 47% 11%;
--muted:               220 14% 91%;
--muted-foreground:    220 9% 42%;
--accent:              43 96% 48%;    /* gold */
--accent-foreground:   222 47% 11%;
--destructive:         0 84% 58%;
--border:              220 13% 87%;
--input:               220 13% 87%;
--ring:                217 91% 50%;
--radius:              1rem;

/* Dark mode (.dark) */
--background:          222 47% 4%;    /* near-black navy — OLED */
--foreground:          210 40% 96%;
--card:                222 47% 8%;
--popover:             222 38% 10%;
--primary:             217 91% 58%;   /* slightly lighter blue on dark */
--secondary:           222 32% 14%;
--muted:               222 32% 12%;
--muted-foreground:    215 20% 52%;
--accent:              43 96% 48%;
--accent-foreground:   222 47% 6%;
--destructive:         0 84% 58%;
--border:              222 32% 16%;
--input:               222 32% 16%;
--ring:                217 91% 58%;
```

### Semantic Color Roles

| Role | Light | Dark | Usage |
|---|---|---|---|
| Positive / income | `text-emerald-600` | `text-emerald-400` | Net cash flow positive, income lines, "saving" copy |
| Negative / over-budget | `text-red-600` | `text-red-400` | Destructive actions, over-budget state |
| Warning | `text-amber-700` | `text-amber-400` | Budget 80–99% consumed |
| Primary action | `hsl(var(--primary))` | same | Buttons, active tab pill, progress fill |
| Muted secondary | `hsl(var(--muted-foreground))` | same | Labels, metadata, secondary numbers |

### Surface Opacity Scale

Used on the hero card and glass components — not as decoration but to create depth in a single-hue system:

```
white/10 — quiet container border
white/15 — icon-btn resting fill on hero
white/20 — icon-btn border on hero
white/25 — icon-btn hover fill on hero
rgba(255,255,255,0.85) — tab bar glass (light)
rgba(9,16,30,0.88) — tab bar glass (dark)
rgba(255,255,255,0.06) — glass-card fill (dark)
rgba(255,255,255,0.75) — glass-card fill (light)
```

### Hero Gradient

A fixed linear gradient. Not themeable — always dark navy, regardless of light/dark mode.

```css
/* Light context (still dark gradient) */
background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 55%, #1D4ED8 100%);

/* Dark context (deeper start) */
background: linear-gradient(135deg, #060B14 0%, #0F172A 50%, #1E3A8A 100%);
```

Decorative orbs layer beneath: `bg-blue-500/20 blur-3xl` (top-right) and `bg-indigo-600/20 blur-2xl` (bottom-left). These are pointer-events-none, not interactive.

### Gold Shimmer

Animated gradient text — used only on the gold-text component, which is a one-off for emphasis:

```css
background: linear-gradient(90deg, #EAA10A, #F5C842, #EAA10A);
background-size: 200% auto;
animation: shimmer 3s linear infinite;
```

**Do not use gradient text elsewhere.** This is a single named exception, not a pattern.

### Chart Colors

Sequential palette for pie and bar charts:

```js
["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"]
//  blue      emerald    amber     violet      red        cyan
```

Monthly trend bars use `#8B5CF6` (violet) to distinguish from the primary-blue weekly bars.

### Category Icon Colors

| Category | Background | Icon |
|---|---|---|
| Food | `bg-orange-500` | white |
| Entertainment | `bg-purple-500` | white |
| Amenities | `bg-blue-500` | white |
| Miscellaneous | `bg-zinc-500` | white |
| Unknown | `bg-zinc-400` | white |

Shadow tint matches background: `shadow-orange-500/20`, etc.

---

## Typography

**Font:** IBM Plex Sans — loaded via Google Fonts (weights 300, 400, 500, 600, 700). Applied globally via `--font-sans`.

```css
--font-sans: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
```

Rendering: `-webkit-font-smoothing: antialiased` globally.

### Scale

| Role | Size | Weight | Tracking | Leading | Usage |
|---|---|---|---|---|---|
| Hero metric | 48px | 700 | `tracking-tight` | `leading-none` | Primary spend number |
| h1 | 32px | 700 | `tracking-tight` | `leading-none` | Page titles (History, Overview) |
| h2 | 24px | 600 | `tracking-tight` | — | Section headings |
| h3 | 18px | 600 | `tracking-tight` | — | Month group headers |
| Quick stat | 20px | 700 | — | — | Today/Week cards on hero |
| Card metric | 32px | 700 | `tracking-tight` | — | Net cash flow number |
| Row primary | 16px | 500–600 | — | `leading-snug` | Transaction descriptions, row amounts |
| Row secondary | 13px | 400 | — | — | Dates, categories, metadata |
| Section label | 10px | 600 | `tracking-[0.12em]` | — | Section headers (uppercase) |
| Badge / tag | 11px | 600 | — | — | Percentage badges, category tags |
| Chart axis | 11px | 400 | — | — | Bar/pie chart ticks |
| Tab label | 9.5px | 600 | `tracking-wide` | — | Nav tab labels |

### Section Label Pattern

A named utility class used consistently for all section headers:

```css
.section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: hsl(var(--muted-foreground));
}
```

On the hero card it gets overridden to `text-blue-200/70`.

---

## Spacing & Layout

### Border Radius

```
rounded-full   — badges, tab active pill, budget %, orbs
rounded-2xl    — cards, ios-list, hero quick-stat chips (16px)
rounded-xl     — icon-btn, input, buttons, budget remaining pill (12px)
rounded-lg     — tailwind override: 9px (used in shadcn components)
rounded-md     — tailwind override: 6px
rounded-sm     — tailwind override: 3px
CategoryIcon sizes:
  sm → rounded-md (6px)
  md → rounded-lg (9px)
  lg → rounded-xl (12px)
```

### Padding Patterns

```
Hero header:       px-5 pt-14 pb-8
Page header:       px-5 pt-12 pb-4
Card header row:   px-5 py-4
Card content:      px-5 py-4
Row item:          px-4 py-3 or px-5 py-3.5
Quick stat chip:   px-4 py-3
Main content:      px-4 max-w-2xl mx-auto
Tab bar:           px-2 py-2
Icon-btn touch:    px-3 py-2 (wrapper in tab bar)
```

### Layout Structure

- Single column on mobile, `md:grid-cols-2` on desktop for Dashboard
- `max-w-2xl mx-auto` container on all pages
- `pb-20` on Router wrapper to clear tab bar (80px)
- Tab bar is `fixed bottom-0` with `pb-safe` for iOS notch handling
- FAB on desktop: `fixed bottom-24 right-8`

### Touch Targets

Minimum 36px (icon-btn w-9 h-9) for icon actions. The wrapper `px-3 py-2` in the tab bar extends the tap region. Delete button in history rows starts at `opacity-0` and becomes `opacity-100` on `group-hover` — desktop only pattern.

---

## Elevation

Three elevation tiers, no drop shadows used decoratively:

```
Resting card:     shadow-sm shadow-black/5 (barely perceptible lift)
Chart tooltip:    0 8px 24px rgba(0,0,0,0.15) — inline style on Recharts
FAB:              shadow-lg shadow-primary/30 — floating action button
Tab bar:          backdrop-blur-20, no traditional shadow — edge blur instead
Glass card:       backdrop-blur-16 + rgba fill — purposeful, for hero-on-gradient only
```

Glass is used for specific functional surfaces (tab bar, hero icon buttons, glass-card overlay content). Not applied to regular content cards.

---

## Components

### ios-list

The primary list container. Used for expense rows, subscription lists, insight rows.

```css
.ios-list {
  background: hsl(var(--card));
  border-radius: 1rem; /* rounded-2xl */
  overflow: hidden;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  border: 1px solid hsl(var(--border) / 0.5);
}
```

Row dividers are applied on the content element, not the row: `ios-list-content` has `border-b border-border` on all but the last child. This avoids a visible bottom border on the final row.

```css
.ios-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: hsl(var(--card));
  cursor: pointer;
  transition: background-color 150ms var(--ease-out),
              transform 120ms var(--ease-out);
}
/* hover only on non-touch devices */
@media (hover: hover) and (pointer: fine) {
  .ios-list-item:hover { background: hsl(var(--muted) / 0.5); }
}
.ios-list-item:active { transform: scale(0.99); }

.ios-list-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-block: 4px;
  margin-left: 12px;
}
```

### icon-btn

Press-feedback icon button. Used everywhere a square icon action appears.

```css
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: background-color 150ms var(--ease-out),
              transform 120ms var(--ease-out);
}
.icon-btn:active { transform: scale(0.93); }
```

Default size: `w-9 h-9` (36px). On the hero card, background is `bg-white/15` with `border border-white/20` and onMouseEnter/Leave toggling to `bg-white/25`.

### glass-card

Purposeful glass — only used as an overlay on coloured backgrounds (hero gradient). Not a default card style.

```css
.glass-card {
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.12);
  background: rgba(255, 255, 255, 0.06);  /* dark */
  backdrop-filter: blur(16px);
}
/* light context overrides */
background: rgba(255, 255, 255, 0.75);
border-color: rgba(0, 0, 0, 0.07);
```

### tab-bar-glass

```css
.tab-bar-glass {
  background: rgba(255, 255, 255, 0.85);  /* light */
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.dark .tab-bar-glass {
  background: rgba(9, 16, 30, 0.88);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
```

Active tab: icon gets `bg-primary text-primary-foreground shadow-md shadow-primary/25` inside a `rounded-xl` pill. Inactive: `text-muted-foreground`.

### Badges

```css
.badge-positive {
  background: rgb(16 185 129 / 0.12);  /* emerald/12 */
  color: #059669; /* emerald-600 light / emerald-400 dark */
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
}
.badge-negative { /* same, red-500/12 */ }
```

### CategoryIcon

Colored square with icon. Sizes:

| Size | Container | Icon | Radius |
|---|---|---|---|
| sm | 24×24 | 12px | rounded-md |
| md | 32×32 | 16px | rounded-lg + shadow-sm |
| lg | 48×48 | 24px | rounded-xl + shadow-md |

strokeWidth always 2.5.

### Budget Progress Bar

```
Container: h-2.5 bg-muted rounded-full overflow-hidden
Fill: h-full rounded-full
  — bg-primary (< 80%)
  — bg-amber-500 (80–99%)
  — bg-red-500 (≥ 100%)
Transition: width 500ms var(--ease-out), background-color 300ms var(--ease-out)
```

### Alert Banner

Full-width, appears above content when budget ≥ 80%:

```
rounded-2xl flex items-center gap-3 px-4 py-3 text-[13px] font-medium
Warning: bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20
Over: bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20
```

### Hero Quick-Stat Chips

```
bg-white/10 rounded-2xl px-4 py-3 border border-white/10
Label: 10px, semibold, text-blue-200/60, uppercase, tracking-wider
Value: 20px, bold, text-white
```

### pressable

For interactive rows that aren't inside ios-list:

```css
.pressable {
  transition: background-color 150ms var(--ease-out),
              transform 120ms var(--ease-out);
}
.pressable:active { transform: scale(0.99); }
```

---

## Motion

### Easing Curves

```css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);    /* default — snappy exit */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);   /* on-screen movement */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* subtle spring for active */
```

Never use browser `ease`, `ease-in`, or `linear` for interactive feedback. Always use `var(--ease-out)` as the default.

### Transition Budgets

| Element | Property | Duration | Curve |
|---|---|---|---|
| icon-btn | background-color | 150ms | ease-out |
| icon-btn | transform | 120ms | ease-out |
| pressable / ios-list-item | background-color | 150ms | ease-out |
| pressable / ios-list-item | transform | 120ms | ease-out |
| tab icon/label | background-color, color | 150ms | ease-out |
| tab icon | transform | 120ms | ease-out |
| budget bar width | width | 500ms | ease-out |
| budget bar color | background-color | 300ms | ease-out |
| delete btn opacity | opacity | 150ms | ease-out |
| FAB | transform, opacity | 150ms | ease-out |
| hero icon hover | background-color | 150ms | ease-out (inline) |

### Active Press States

- `icon-btn:active` → `scale(0.93)` — tight, snappy
- `ios-list-item:active` → `scale(0.99)` — barely perceptible, row-safe
- `pressable:active` → `scale(0.99)`
- FAB `:active` → `scale(0.97)` via Tailwind `active:scale-[0.97]`

Never use `transform: none` on active. The scale provides tactile confirmation.

### Stagger Animation

Applied to list-level containers as they mount. The `.stagger-item` class:

```css
@keyframes fade-up {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.stagger-item {
  opacity: 0;
  animation: fade-up 240ms var(--ease-out) forwards;
}
/* Delays: 0 / 40 / 80 / 120 / 160 / 200 / 230 / 260 / 280ms for children 1–8+  */
```

Used on month groups in History. Apply to the outer group, not individual rows.

### Keyframes

```
shake    — login error feedback (translateX oscillation)
shimmer  — gold-text animation (background-position sweep, 3s linear)
fade-up  — stagger mount (opacity + translateY)
caret-blink — PIN entry caret (70%/20% opacity cycle)
```

### Reduced Motion

When `prefers-reduced-motion: reduce`:
- Stagger animation collapses to opacity-only `fade-in-only` (200ms ease)
- All `transform` active states are suppressed (`:active { transform: none }`)
- All animations and transitions forced to `0.01ms` duration

This preserves state feedback via opacity while eliminating positional motion.

---

## Iconography

**Library:** Lucide React — consistent 2px stroke weight except CategoryIcon (2.5px strokeWidth).

Standard icon size: `w-4 h-4` (16px) in most contexts. Tab bar: `w-[18px] h-[18px]`. CategoryIcon varies by size prop (12/16/24px).

---

## Privacy Mode

A session-level state (`isPrivate: boolean`). When active, the `mask()` helper replaces all amount strings with `••••••`. The ₹ symbol is also conditionally hidden to avoid partial reveals. The Eye/EyeOff toggle lives in the hero header.

```ts
const mask = (val: string) => isPrivate ? "••••••" : val;
```

This is a UI concern only — no data suppression on the API side.

---

## Data Display Conventions

- All amounts stored in **paise** (₹ × 100) as integers in the database
- Display: `(paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })`
- Sign convention: positive = income (emerald), negative = expense or over-budget (red)
- Net cash flow: `income − expenses − SIP investments`
- Budget tracks expenses only (SIP excluded from budget calculation)
- Dates: `parseISO()` from date-fns, stored as `yyyy-MM-dd` strings

---

## Tailwind Config Overrides

Border radius overrides (shadcn compatibility):
```
lg → 0.5625rem (9px)
md → 0.375rem  (6px)
sm → 0.1875rem (3px)
```

Font family resolves via CSS var: `font-sans → var(--font-sans)`.

Plugins: `tailwindcss-animate`, `@tailwindcss/typography`.
