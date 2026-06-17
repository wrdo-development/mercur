# WRDO — Figma File Setup Blueprint

> A proper, production-ready WRDO design file — structured so it converts cleanly to
> storefront React code and stays maintainable. Built from Alwyn's real spec (read via
> Figma Dev-Mode MCP, file 9MCHXMg15fz67ID8QiE98K, node 2005-1268).
>
> **Why a clean file:** the current "10 Product Cards (Community)" file is a community
> template sketched over. This blueprint is the *real* WRDO design system.

---

## 0. File + naming conventions (read first — this is what makes it convert cleanly)

- **File name:** `WRDO — Product Design`
- **Component names: PascalCase**, no spaces. `ProductCard`, `NavTile`, `RideTracker`.
  (Figma component name → code component name is 1:1 when named this way. Messy Figma
  names = messy code.)
- **Variants: slash-organized** with named properties. e.g. `ProductCard` with a
  `kind` property = `product | relic | sundowner`, and a `compact` boolean.
- **Use Figma Variables/Styles for ALL tokens** (colors, type, shadow, radius) — never
  hardcode a hex on a layer. This is what lets the whole file re-theme + map to code
  tokens. Name them to match the code tokens (below).
- **Auto-layout everything** — frames use auto-layout (not absolute positioning) so they
  convert to flex/grid cleanly and stay responsive. (Your current file uses absolute
  positioning — that's fine for a sketch, but the clean file should be auto-layout.)
- **Component properties** for swappable bits: `label` (text), `icon` (instance swap),
  `image` (image fill), so one component handles many instances.

---

## 1. Pages (the tabs across the top of the Figma file)

1. **🎨 Foundations** — tokens: color styles, type scale, spacing, shadow, radius.
2. **🧩 Components** — every reusable component, organized in sections.
3. **📱 Mobile** — mobile screens (390px wide frames).
4. **💻 Web** — web/desktop screens (1440px wide frames, responsive intent).
5. **🗃 Assets** — hand-drawn icons, spiral logo, tape labels, character art.

---

## 2. 🎨 Foundations — the tokens (your EXACT real values)

### Color styles (name them exactly like the code tokens)
| Style name | Hex | Role |
|---|---|---|
| `void` | `#1C110D` | near-black, dark surfaces, text |
| `lime` | `#CCFF00` | THE accent + active + CTA |
| `lime/alt` | `#A9D300` / `#A9D200` | the slightly-muted lime used on titles/prices (you use this for card titles) |
| `ember` | `#E46227` (and `rgba(228,98,39,0.95)`) | warm secondary / ember-deal accent |
| `dust` | `#F5F2ED` | warm page background |
| `mist` | `#678590` | cool calm / secondary |
| `tile/grey-1` | `#EFEFEF` | inactive nav tile (Shop) |
| `tile/grey-2` | `#ECECEC` | inactive nav tile (Book) |
| `tile/grey-3` | `#E8E8E8` | inactive nav tile (Stash) |
| `text/body-60` | `rgba(38,38,38,0.6)` | "powdery" 60%-opacity body text |
| `text/heading-80` | `rgba(48,48,48,0.8)` | section headings ("Deals") |

> The multi-grey inactive tiles are a real, premium detail — keep all three distinct.

### Type scale (Inter — confirmed, all weights)
| Style | Size | Weight | Use |
|---|---|---|---|
| `Heading/Section` | 45px | Medium | "Deals" |
| `Heading/Card` | 30px | Semibold | "Your ride is on the way!" |
| `Title/Nav` | 25px | Semibold | nav tile labels |
| `Title/Card` | 24px | Semibold | product card titles (in accent color) |
| `Price` | 22px | Bold | card price (accent color) |
| `Body` | 14px | Regular | descriptions (text/body-60) |
| `Driver/Name` | 26px | Semibold | tracker driver name |

### Shadow style
- `shadow/lift` = `0px 60px 100px 0px rgba(72,72,72,0.16)` — the big soft premium lift.
  Used on every card/tile. This shadow is doing a LOT of the premium feel — keep it.

### Radius (your real values)
- `radius/card` = **42px** (cards, nav tiles — the big soft squircle)
- `radius/image` = **32px** (inner image panel)
- `radius/sm` = ~12px (chips, small elements)

---

## 3. 🧩 Components (build these, named exactly)

### `Logo`
- Spiral mark + "WRDO" + lime-tape handwritten "as you are". ~223px. Variants: `full`,
  `compact` (spiral + WRDO only).

### `NavTile`
- 211×193px, `radius/card` (42px), `shadow/lift`.
- Properties: `label` (text), `icon` (instance swap), `state` = `active | default`.
- `active`: `bg = lime`, black text + label, the hand-drawn icon.
- `default`: `bg = tile/grey-1|2|3` (pass grey as a variant or property), `void` text.
- Label centered at bottom, `Title/Nav` (25px semibold).

### `ProductCard`
- 358×540px, `radius/card` (42px), white bg, `shadow/lift`.
- Properties: `kind` = `product | relic | sundowner`, `compact` boolean.
- Inner image panel: `radius/image` (32px), inset ~10px.
- `TapeLabel` instance top-left, rotated ~-8.7° ("New" / "Pre-order" / "Relic").
- Title: `Title/Card` (24px semibold) in the **accent color** (lime/alt for product+relic,
  ember for ember-deals — the title picks up the deal's color).
- Price: `Price` (22px bold), same accent.
- Description: `Body` (14px, text/body-60).
- **Notch + floating cart button** bottom-left (the concave cut-out cradling a `size-24`
  cart-icon button). `compact=true` skips the notch.
- Optional chip-tags row.

### `RideTracker` (the WRDO × Paarl Taxis co-brand card)
- `bg = void`, `radius/card` (42px), `shadow/lift`.
- Driver avatar + name (`Driver/Name`) + verified-star icon.
- Paarl Taxis logo. "Your ride is on the way! Arriving in **8 minutes**".
- **Lime progress fill** with 3 step-nodes (icons on lime).
- Lime side-panel with call / cancel / chat buttons.

### `AskBar`
- The "What do you need?" glass element, `radius/card`-ish, frosted, lime submit chip.

### `WrdoMessage`
- The voice bubble: spiral ring + "WRDO" label (lime/alt) + message text.

### `Button`
- Squircle (use `radius/card` scaled down, ~20-24px for buttons). Variants: `primary`
  (lime bg, void text), `void` (void bg, dust text), `ghost` (outline).

### `Chip`, `TapeLabel`, `Avatar`
- `TapeLabel`: the torn-tape look, `label` text, `color` = `lime | ember`. The signature
  hand gesture. Rotated slightly when placed.

---

## 4. 📱 Mobile + 💻 Web screens

### Frame sizes
- **Mobile:** 390 × (variable) — iPhone-ish width. Single column.
- **Web:** 1440 × (variable). The same content, re-laid-out: nav tiles in a row up top or
  a left rail, cards in a multi-column grid, the tracker as a wider banner.

### Homepage = Discovery (build both mobile + web)
Compose from the components, in this order (your real layout):
1. `Logo` (top-left).
2. `WrdoMessage` greeting + `AskBar`.
3. **Nav tile row**: `NavTile` ×4 (Pay active/lime, Shop/Book/Stash default greys).
4. `RideTracker` (if an active ride) — the void+lime co-brand card.
5. **"Deals"** section heading (`Heading/Section`, 45px) → horizontal scroll of
   `ProductCard`s (relic/sundowner/product, accent titles, tape labels).
6. (Web) re-flow: nav as a row/rail, cards in a grid, tracker as a banner.

**Responsive intent:** design mobile + web from the SAME components so they stay in sync —
only the layout (column count, nav placement) changes, not the component design.

---

## 5. The handoff to code (how this becomes the storefront)

Once the clean file exists:
1. Alwyn selects a component or screen in Figma desktop (Dev Mode MCP server ON, port 3845).
2. Claude reads it via `get_design_context` → gets exact React+Tailwind + the real asset
   URLs (your hand-drawn icons download as PNG/SVG).
3. Claude converts to **storefront-native** components: maps Figma color/type/shadow/radius
   styles → the storefront's design tokens (mercur-storefront uses a 2-tier token system),
   downloads your real icons into the repo, builds proper React components with auto-layout
   → flex/grid. NO Tailwind hardcoded hexes — everything via the token system.
4. Result: your exact design, your real icons, as production React in the storefront.

**Conventions that make step 3 clean:** PascalCase component names, Figma Variables/Styles
for all tokens (named like the code tokens), auto-layout (not absolute positioning),
component properties for swappable content. Build the file this way and the conversion is
near-mechanical instead of a guessing game.
