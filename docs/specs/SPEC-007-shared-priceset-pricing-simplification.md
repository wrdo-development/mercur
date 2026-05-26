---
status: not_started
canonical: true
priority: 1
area: core/pricing
created: 2026-05-25
last_updated: 2026-05-26
supersedes_section_of: SPEC-002
---

# SPEC-007 Shared PriceSet Pricing Simplification

> **Entry point for the offer-pricing model.** SPEC-002 documents the
> per-offer-`PriceSet` design (each offer owns its own `PriceSet`,
> referenced via `offer.price_set_id`) and ships an override of
> Medusa's `addToCartWorkflow` plus an override of
> `updateLineItemInCartWorkflow`, a `calculateOfferPricesStep`, and a
> custom `unit_price` + `is_custom_price=true` carrier. SPEC-007
> reverts that design to a single shared `PriceSet` per master
> variant with an `offer_id` `PriceRule` discriminating Price rows per
> offer, **drops every cart-workflow override**, and routes per-offer
> pricing through Medusa's native `setPricingContext` hook on the stock
> `addToCartWorkflow`. Read SPEC-007 first for the current pricing
> contract; SPEC-002 still owns offer identity, links, inventory
> M:N semantics, vendor / admin / store surfaces, and the order-split
> workflow (`completeCartWithSplitOrdersWorkflow`).

## Why revert

The per-offer-`PriceSet` model was justified in SPEC-002 by three
arguments:

1. Single-bulk `calculatePrices` round-trip in the cart path.
2. PriceList SALE rows isolated to one offer.
3. Cross-offer write isolation via a foreign-key boundary.

Two of those three were tested empirically with
`apps/api/src/scripts/probe-shared-priceset.ts`. Findings:

- **Cart path.** Mercur's buybox guarantees one offer per variant per
  cart line — at most one offer per variant clears the buybox into a
  cart line. With scalar `offer_id` in `calculatePrices` context, the
  pricing module's rule filter excludes every sibling offer's rows
  before the resolver runs. A shared `PriceSet` returns the correct
  per-line price in a single bulk call when the context carries one
  `offer_id` per request. The cart-pricing motivation is therefore
  **independent of the data-model choice**.
- **PriceList SALE bleed.** Empirically does not occur with scalar
  `offer_id` context. A SALE row tagged `rules: { offer_id: "A" }`
  resolves to A only; B and C see their default rows unchanged.
- **Write isolation.** Real. Per-offer `PriceSet` makes the FK the
  access boundary; shared `PriceSet` requires application-level guards
  on every pricing write to reject `price.id`s whose `offer_id` rule
  does not belong to the caller. SPEC-007 keeps that requirement and
  pays for it in the offer-write workflow layer.

The net win: one fewer `PriceSet` per offer, one fewer cross-module
link, simpler offer-create / update / delete workflows, **zero cart
workflow overrides**, no custom `unit_price` carrier, and Medusa's
native cart pricing path drives everything via a single hook
implementation.

## Target data model

- **One `PriceSet` per master variant** — Medusa's native 1:1
  `ProductVariant ↔ PriceSet` is reused unchanged. No marketplace-only
  PriceSets exist.
- Every offer-owned `Price` row carries a `PriceRule` with
  `attribute: "offer_id"` and `value: <offer.id>`. Tier rows
  (`min_quantity` / `max_quantity`), region rows, and customer-group
  rows are stacked on top of that single rule as Medusa already
  supports.
- `offer.price_set_id` column is **dropped** along with its index
  `IDX_offer_price_set_id` and the `offer-price-set-link.ts` link.
- **`ProductVariant.manage_inventory` and `allow_backorder` are
  `computed` `false` constants** on Mercur's variant model
  (`packages/core/src/modules/product/models/product-variant.ts`,
  lines 28–29). Both columns are declared
  `model.boolean().default(false).computed()` so every variant read
  resolves to `false` regardless of any underlying DB state. This
  removes the field from the writable surface entirely — there is
  no migration to flip existing rows and no admin/vendor UI that
  can toggle it. Stock lives behind the offer ↔ inventory_item M:N
  link and is checked / reserved by Mercur's `validate` hook
  handler on `addToCartWorkflow` (see below). The computed columns
  are what unlock "reuse Medusa's native add-to-cart workflow
  unchanged" — Medusa's `confirmVariantInventoryWorkflow`
  short-circuits because every variant reports
  `manage_inventory: false`, so there is no native step to
  override. The `// todo: remove` comment on those lines signals
  that the fields can be deleted entirely once Medusa's
  upstream workflows stop reading them; until that lands they
  remain as defensive `false` stubs.

`Offer` row after migration:

```
seller_id                text
variant_id               text
shipping_profile_id      text
sku                      text  (searchable)
ean / upc                text? (searchable)
created_by               text
metadata                 json?
```

Variant ↔ Price relationship resolution goes through Medusa's native
`variant.price_set` link. Reading an offer's prices goes through the
writable **Offer ↔ Price list-link** as `offer.prices: Price[]` (see
"Offer ↔ Price list-link" below) — one Query traversal, no
client-side filtering. The `offer_id` `PriceRule` on each Price row
exists purely so Medusa's `calculatePrices` resolver can scope rows
during cart pricing; reads on the offer side never rescan
`price_rules.value` to identify ownership.

## Cart strategy: no overrides, three hooks

SPEC-007 **deletes Mercur's `addToCartWorkflow` override** at
`packages/core/src/workflows/cart/workflows/add-to-cart.ts` along
with the override of `updateLineItemInCartWorkflow` and the entire
`packages/core/src/workflows/cart/steps/calculate-offer-prices.ts`
step. Medusa's stock `addToCartWorkflow`,
`updateLineItemInCartWorkflow`, `deleteLineItemsWorkflow`, and
`refreshCartItemsWorkflow` run end-to-end. Mercur contributes via
**three hook handlers** registered against those workflows — no
subscribers, no overrides.

### Hook 1: `setPricingContext` on `addToCartWorkflow` and `refreshCartItemsWorkflow`

Both workflows expose a `setPricingContext` hook with
`{ cart, variantIds, items, additional_data }` (add-to-cart) or
`{ cart_id, items, additional_data }` (refresh). The returned object
is merged into the pricing context that `getVariantsAndItemsWithPrices`
passes to `pricingModule.calculatePrices`.

Mercur registers **one shared handler** at
`packages/core/src/workflows/cart/hooks/set-pricing-context.ts` and
binds it to both workflows. The handler resolves `offer_id` from two
sources — never from `line_item.metadata`:

- **Add-to-cart path (bootstrap).** `input.items[i].offer_id` is a
  first-class field on the workflow's input, added by Mercur's
  TypeScript augmentation of `CreateCartCreateLineItemDTO` (already
  in place from SPEC-002). The Mercur storefront route
  `POST /store/carts/:id/line-items` reads `offer_id` from the
  request body and passes it through on each item. The hook reads
  `input.items[i].offer_id` directly. The route also forwards the
  same payload as `additional_data.mercur.offer_ids_by_variant`
  (a `Record<variant_id, offer_id>`) so downstream steps in the
  same workflow chain — including the refresh sub-workflow Medusa
  invokes at the tail — can recover the mapping without rereading
  the request body.
- **Refresh path (steady-state).** When `refreshCartItemsWorkflow`
  runs for any reason — promo apply, quantity change, locale
  switch, payment refresh — the cart's line items already exist and
  are linked to their offers via the writable
  `cart_line_item ↔ offer` link. The hook traverses
  `cart.items[*].offer.id` via Query to get each line's `offer_id`.
  No metadata, no link lookup against the line_item id table —
  Query resolves it in one round-trip.

The handler validates every relevant item resolves to a valid
`offer_id` (throws `INVALID_DATA` otherwise — the cart is corrupt
and should not silently fall back to variant-level pricing) and
returns `{ offer_id }` so Medusa merges it into the pricing context
that drives `pricingModule.calculatePrices`. The per-row `offer_id`
`PriceRule` on the variant's shared `PriceSet` filters every other
vendor's rows before resolution, so the correct per-offer
`unit_price` lands on every line item through Medusa's **native
calculated-price column**. There is no `is_custom_price=true` write;
Mercur stops touching `unit_price` at all.

For carts containing items priced under different `offer_id`s in
one workflow invocation, the handler issues
`pricingModule.calculatePrices({ id: variantPriceSetIds }, { context:
{ ..., offer_id } })` once per distinct `offer_id` inside the hook,
merging results into the per-variant calculated-price map Medusa
consumes. In practice add-to-cart only carries one item per call, so
the fan-out collapses to a single call; the refresh path may see
multi-offer carts and fans out accordingly.

### Hook 2: `validate` on `addToCartWorkflow` — stock availability pre-check

Medusa's `validate` hook fires before any cart mutation. Mercur's
handler at `packages/core/src/workflows/cart/hooks/validate.ts`
asserts stock availability based on the **offer ↔ inventory_item**
M:N link:

1. Resolves each input item's `offer.inventory_items[]` (each row
   carrying `inventory_item_id` + `required_quantity`) via Query.
2. For each linked inventory item, sums `stocked_quantity -
   reserved_quantity` across the cart's sales-channel-visible stock
   locations.
3. Multiplies each `required_quantity` by the requested
   `item.quantity` and asserts availability per inventory item. On
   shortfall, throws `MedusaError.Types.INSUFFICIENT_INVENTORY` —
   Medusa aborts the workflow before line items are created.

The handler is **read-only**: it does not reserve. Reservation lives
in Hook 3 below, where line items exist and have IDs.

### Hook 3: `beforeRefreshingPaymentCollection` on `refreshCartItemsWorkflow` — reserve / adjust / release

Every cart-mutation workflow (`addToCartWorkflow`,
`updateLineItemInCartWorkflow`, `deleteLineItemsWorkflow`,
promotion-apply, etc.) finishes with a
`refreshCartItemsWorkflow.runAsStep` call. That refresh exposes a
`beforeRefreshingPaymentCollection` hook that fires **after** line
items, taxes, and promotions have settled and **before** the payment
collection is refreshed — i.e. the exact point where the cart's
final shape is known and reservations can be reconciled
transactionally.

Mercur's handler at
`packages/core/src/workflows/cart/hooks/before-refreshing-payment-collection.ts`:

1. Loads the refreshed cart's current line items via Query with
   `cart.items[*].id`, `cart.items[*].variant_id`,
   `cart.items[*].quantity`, and the joined
   `cart.items[*].offer.id` (the writable
   `cart_line_item ↔ offer` link). For any newly created line item
   whose link does not exist yet — first add-to-cart for that
   variant — the `offer_id` is recovered from
   `additional_data.mercur.offer_ids_by_variant[item.variant_id]`,
   the carrier Mercur's storefront route stamped on the parent
   workflow. **Line item metadata is never consulted.**
2. Loads the existing reservations against those line items via
   `inventoryModule.listReservationItems({ line_item_id })`.
3. Diff-computes three sets:
   - **To create.** Line items without a `cart_line_item ↔ offer`
     link yet — these are brand-new lines from the most recent
     mutation. The handler:
     - Calls the existing `linkLineItemToOfferStep` (preserved at
       `packages/core/src/workflows/cart/steps/link-line-item-to-offer.ts`)
       with `{ line_item_id, offer_id }` pairs derived from the
       additional-data carrier described above. The
       `cart_line_item ↔ offer` link
       (`packages/core/src/links/cart-line-item-offer-link.ts`) is
       kept exactly as in SPEC-002. After this step every line
       item is reachable through `cart.items[*].offer.*` for the
       rest of its lifetime; the additional-data carrier is no
       longer needed on subsequent refreshes.
     - For each entry in `offer.inventory_items[]`, calls
       `inventoryModule.createReservationItems` with
       `quantity = item.quantity * required_quantity` against the
       cart's stock-location preference.
   - **To adjust.** Line items whose `quantity` changed since the
     last reservation. The handler resolves `offer_id` via the
     existing link traversal (`cart.items[i].offer.id`) and calls
     `inventoryModule.updateReservationItems` per linked inventory
     item with the new derived quantity.
   - **To release.** Reservations that point at a `line_item_id`
     that no longer exists in the cart (qty=0 → delete pipeline).
     The handler calls
     `inventoryModule.deleteReservationItems(reservation_id[])`,
     and dismisses the `cart_line_item ↔ offer` link pair via
     `dismissLinksWorkflow.runAsStep` in the same handler pass.
4. The operation is idempotent on `(line_item_id, inventory_item_id)`
   so repeated refreshes converge without drift.

Because the refresh workflow runs under the same lock as the parent
cart mutation (Medusa acquires the cart lock at the top of
`refreshCartItemsWorkflow`), reservations cannot interleave with
concurrent add / update / delete operations.

### Cart line ↔ offer link

`linkLineItemToOfferStep` is **preserved** and runs inside Hook 3
(see "Hook 3: `beforeRefreshingPaymentCollection`" above). The
`cart_line_item ↔ offer` link definition at
`packages/core/src/links/cart-line-item-offer-link.ts` is unchanged.
After the first refresh that follows an add-to-cart, the link is
the **single source of truth** for which offer a cart line item
belongs to — every downstream consumer reads `cart.items[*].offer.*`
via Query. `line_item.metadata.offer_id` is never written or read;
the `additional_data.mercur.offer_ids_by_variant` carrier exists
only as the in-flight workflow bootstrap for the very first
add-to-cart of a given variant, and is dropped on the floor once
the link row lands. `decorateLineItemWithOfferStep` is removed —
line-item-side fields (`sku`, `shipping_profile_id`, `seller_id`)
are now read on demand from `cart.items[*].offer.*` via Query
instead of being duplicated onto line-item metadata at create time.
Order-line ↔ offer mirroring continues to be handled inside
`completeCartWithSplitOrdersWorkflow`, which is Mercur-owned and not
a Medusa override.

## Offer ↔ Price list-link (writable)

To make per-offer price-row identification cheap and explicit (so a
delete / update path can name the rows by FK rather than rescanning
`price_rules.value`), SPEC-007 introduces a **writable list-link**
between `Offer` and the pricing module's `Price`:

```ts
// packages/core/src/links/offer-price-link.ts
import { defineLink } from "@medusajs/framework/utils"
import PricingModule from "@medusajs/medusa/pricing"
import OfferModule from "../modules/offer"

export default defineLink(
  OfferModule.linkable.offer,
  {
    linkable: PricingModule.linkable.price,
    isList: true,
  }
)
```

The link is **writable** — Mercur's offer workflows own the join
table and treat it as the authoritative `offer → prices[]`
relationship. The `offer_id` `PriceRule` on each `Price` row remains
in place (it is what Medusa's `calculatePrices` resolver needs to
filter rows during cart pricing), but the link pivot is the FK-like
boundary used by every offer-side write path. `isList: true`
materialises the relation as `offer.prices: Price[]` in a single
Query traversal.

### Write rules

- The link is **only** written through the offer module's own
  workflows. The pricing module never creates or mutates these
  pivot rows on its own.
- Every row Mercur adds to a Price set under an offer is paired with
  one link row `(offer_id, price_id)`. Both writes are issued from
  the same workflow run so the link pivot stays consistent with the
  pricing-module state.
- The `offer_id` PriceRule and the link row are written together;
  on delete, both are removed together. The migration step in
  "Migration plan" backfills the pivot for existing offers in the
  same pass that materialises the `offer_id` rule.

### Consumers

- **Vendor / admin offer detail pages.** Read `offer.prices`
  directly — one Query field selection, no client-side filtering,
  fully typed.
- **`createOffersWorkflow`.** After
  `pricingModule.addPrices(...)` returns the new `Price` ids, the
  workflow issues `createLinksWorkflow` with one
  `OFFER.offer_id ↔ PRICING.price_id` pair per new row. The link
  row makes the new prices visible at `offer.prices` immediately.
- **`updateOffersWorkflow`.** Reads `offer.prices[*].id` from the
  link, validates every incoming `price.id` against that set
  (`assertOfferPriceOwnership` throws `NOT_ALLOWED` for foreign
  IDs), then either updates rows in place or adds / removes the
  difference. Newly added rows get a new link pair; removed rows
  get their link pair dismissed via `dismissLinksWorkflow`.
- **`deleteOffersWorkflow`.** On hard-delete, reads
  `offer.prices[*].id` via the link, calls
  `pricingModule.removePrices(ids)` and `dismissLinksWorkflow`
  for the same pairs in parallel inside the workflow. Soft-delete
  continues to leave prices untouched; the link rows are also kept
  so that historical reporting on a soft-deleted offer can still
  resolve its prices.
- **Storefront `wrap-variants-with-offers-prices`.** Keeps using the
  variant's `PriceSet` for resolved-price reads (so PriceList SALE /
  region / customer-group rules apply), but enriches the per-offer
  response with `offer.prices` for any UI that needs to show the
  full ladder (e.g. "regular price + quantity tiers" beside a sale
  badge).

The link does not introduce a new column on `Offer` or `Price` —
the join table is the only new piece of schema, created by Medusa's
link module the first time the link is registered.

### What this removes from the repo

- `packages/core/src/workflows/cart/workflows/add-to-cart.ts`
- `packages/core/src/workflows/cart/workflows/update-line-item-in-cart.ts`
- `packages/core/src/workflows/cart/steps/calculate-offer-prices.ts`
- `packages/core/src/workflows/cart/steps/decorate-line-item-with-offer.ts`
- `packages/core/src/workflows/cart/steps/get-line-item-actions.ts`
  (Medusa's default handles the case; the buybox constraint means
  at most one offer per variant ever enters a cart so the
  default same-variant-merge behaviour is correct)
- `packages/core/src/workflows/cart/hooks/validate-add-to-cart-stock.ts`
  (logic folded into the `validate` hook handler)
- `packages/core/src/workflows/cart/hooks/validate-update-line-item-stock.ts`
  (logic folded into the `validate` hook handler)
- `packages/core/src/workflows/cart/utils/prepare-line-item-data.ts`
  (Medusa's default does the work)

What stays:

- `packages/core/src/workflows/cart/steps/link-line-item-to-offer.ts` —
  invoked by the `beforeRefreshingPaymentCollection` hook handler
  (Hook 3).
- `packages/core/src/links/cart-line-item-offer-link.ts` — link
  definition unchanged.
- `complete-cart-with-split-orders.ts` (Mercur-owned, not an override).
- `mirror-line-item-offer-links-to-order.ts` (used by the order-split
  workflow).
- The three new hook handlers
  (`set-pricing-context.ts`, `validate.ts`,
  `before-refreshing-payment-collection.ts`).
- The new read-only `offer-price-link.ts` (Offer ↔ Price list-link).

## Offer workflows after the migration

### `createOffersWorkflow`

Currently the workflow calls `createPriceSetsStep` to mint one
`PriceSet` per offer, then stamps `price_set_id` onto the offer row.

After the migration:

1. The variant's `PriceSet` is resolved via the existing Medusa link
   (or created lazily if the variant had no marketplace prices yet —
   single `pricingModule.upsertPriceSets` call keyed by `variant_id`).
2. `pricingModule.addPrices({ priceSetId: variant.price_set_id,
   prices: offer.prices.map(p => ({ ...p, rules: { ...(p.rules ?? {}),
   offer_id: offer.id } })) })` is called per offer. Rule stamping
   happens in a single transform — the workflow injects `offer_id`
   uniformly; callers do not supply it.
3. The `offer` row is inserted without `price_set_id`.
4. `createLinksWorkflow.runAsStep` is called with one
   `OFFER.offer_id ↔ PRICING.price_id` pair per new price row,
   materialising the writable `offer.prices` list-link in the same
   workflow run.
5. `createPriceSetsStep` and the read-only `offer.price_set` link are
   removed from the workflow composition.
6. No per-offer / per-variant work is required to set
   `manage_inventory: false`. Mercur's variant model declares the
   column as `model.boolean().default(false).computed()` (see
   "Target data model" above), so every read returns `false`
   regardless of any value the upstream Medusa schema might have
   set.

### `updateOffersWorkflow`

Currently rewrites the offer's own `PriceSet` with replace semantics
via `updatePriceSetsStep`.

After the migration:

1. Resolve the offer's `variant_id → price_set_id`.
2. Load `offer.prices` (via the writable list-link defined in
   "Offer ↔ Price list-link" above) — this is the authoritative
   per-offer row set, no rule-value rescan needed.
3. Apply replace semantics **scoped to `offer.prices`**: incoming
   rows with `id` are matched against `offer.prices[*].id`; rows
   without `id` are added with `rules.offer_id = offer.id` injected;
   `offer.prices[*].id` values absent from the incoming payload are
   removed via `pricingModule.removePrices`.
4. The write-isolation guard
   `assertOfferPriceOwnership({ offer_id, price_ids })` rejects any
   incoming `price.id` that is not in `offer.prices[*].id` with
   `MedusaError.Types.NOT_ALLOWED`.
5. `updatePriceSetsStep` is used with `id: variant.price_set_id` and
   the filtered `prices` payload.
6. Link pivot is kept in sync inside the same workflow run:
   `createLinksWorkflow` for newly added rows, `dismissLinksWorkflow`
   for the removed `price.id`s. Existing rows keep their link pair
   untouched.

### `deleteOffersWorkflow`

1. Soft-delete remains the default and **does not touch prices or
   link rows** — the variant's `PriceSet` is shared, and historical
   reads on the soft-deleted offer can still resolve its prices via
   the persisted link pivot.
2. Hard-delete loads `offer.prices[*].id` via the list-link, then
   in parallel calls `pricingModule.removePrices(ids)` and
   `dismissLinksWorkflow.runAsStep` for the same pairs, and finally
   deletes the `offer` row. No rule-value rescan, no risk of
   clipping sibling offers' rows, no orphan link rows.

## Migration plan

The repository currently ships per-offer `PriceSet`s. SPEC-007
needs a one-shot backfill that:

1. Resolves the master `variant.price_set_id` for each
   `offer.variant_id`. Variants without a `PriceSet` get a fresh
   empty one via Medusa's link service.
2. For each offer row:
   - Lists every `Price` on `offer.price_set_id`.
   - Re-creates each row on `variant.price_set_id` with the original
     `amount` / `currency_code` / `min_quantity` / `max_quantity`
     and `rules` extended with `offer_id: <offer.id>`.
   - Creates one `OFFER.offer_id ↔ PRICING.price_id` link pair per
     newly created Price row, populating the writable
     `offer.prices` list-link pivot.
3. **No per-variant `manage_inventory` update.** The computed
   columns on Mercur's `ProductVariant` model (see "Target data
   model" above) already report `false` for every variant on read,
   so there is nothing to migrate. Existing variant-level
   inventory-item links are left alone (they are not consulted by
   the cart path after the migration but remain queryable for
   historical orders).
4. After all offers are backfilled:
   - Drops the `offer-price-set-link.ts` link.
   - Drops `IDX_offer_price_set_id`.
   - Drops the `offer.price_set_id` column via a new
     `Migration<timestamp>.ts`.
   - Hard-deletes the now-orphaned per-offer `PriceSet`s via
     `pricingModule.deletePriceSets`.

The script lives at
`packages/core/src/scripts/migrate-shared-priceset.ts` (executed via
`medusa exec`). It is idempotent: re-running after a partial
completion detects offers whose price rows are already on the
variant's `PriceSet` (by inspecting `price_rules.value`) and skips
them.

A reverse script is **not** provided — the migration is one-way.
The DB column drop is the final commit point.

## Out of scope for SPEC-007

- Changes to the offer ↔ inventory-item M:N link, including
  `required_quantity` semantics — preserved as documented in SPEC-002.
- The seller-split order workflow
  (`completeCartWithSplitOrdersWorkflow`) — preserved.
- Changes to the storefront product surface beyond removing
  `offer.price_set` field selections — `wrap-variants-with-offers-prices`
  switches to filtering `variant.price_set.prices.price_rules` by
  `offer_id` value, but the response shape is unchanged.
- Admin / vendor UI page layouts. Form components that compose
  price ladders against `offer.prices` continue to work; their data
  loader now reads from the filtered shared `PriceSet`, not from a
  dedicated `offer.price_set`.

## User-Visible Behavior

A vendor or operator changing prices on an offer continues to see
exactly the same edit form, save behavior, and reflected prices on
the storefront — no externally visible change. Bulk vendor sales
authored as a `PriceList` continue to apply only to the offers whose
`offer_id` value matches the rule on each PriceList row.

A storefront fetching `/store/products/:id` continues to receive the
same product → variant → calculated-price shape. The only difference
is invisible: under the hood the variant's `PriceSet` is the source
of prices for all offers on that variant, not a fan-out of N
per-offer PriceSets, and the unit price comes from Medusa's
calculated-price column rather than a custom-price write.

## Verification

1. **Static.** `bun run lint` and `bun run build` exit clean. `tsc
   --noEmit` clean across `@mercurjs/core` and dependent packages.
2. **Schema.** A fresh `bun run dev` boot followed by `\d+ offer` in
   `psql` shows no `price_set_id` column and no
   `IDX_offer_price_set_id` index. A module-level read on any
   `ProductVariant` returns `manage_inventory: false` and
   `allow_backorder: false` (verified by Query because the
   underlying column is `computed` on Mercur's model — see "Target
   data model").
3. **No overrides.** `grep -r "overrideWorkflow" packages/core/src/workflows/cart`
   returns no matches. `addToCartWorkflow` and
   `updateLineItemInCartWorkflow` resolve to Medusa's stock
   implementations.
4. **Integration tests** (`integration-tests/http/offer/**`):
   - `vendor/offer.spec.ts` — pricing ladder create/update/delete on
     a single offer: all `Price` rows for that offer carry
     `price_rules.value = <offer.id>` on the variant's shared
     `PriceSet`. Sibling offers are unaffected by the write.
   - `store/offers.spec.ts` — `GET /store/products/:id` returns
     correct per-offer prices across regions / customer groups; a
     single `pricingModule.calculatePrices` round-trip per request
     (asserted via `jest.spyOn`).
   - `cart.spec.ts` — `POST /store/carts/:id/line-items` with
     `offer_id` returns the correct unit price for the offer chosen;
     updating quantity past a tier boundary recalculates correctly;
     reservation is created against the offer's linked inventory
     items (not the variant) and released on line-item delete.
   - New: `pricing-isolation.spec.ts` — vendor A's vendor route
     cannot update a `price.id` whose `offer_id` rule belongs to
     vendor B's offer (expect 403 / `NOT_ALLOWED`).
5. **Manual probe.** Re-run
   `apps/api/src/scripts/probe-shared-priceset.ts` against the live
   module: scalar offer_id contexts return correct per-offer prices
   including with a PriceList SALE row attached to one offer;
   sibling offers do not bleed.

## Evidence

To be filled in once the migration lands.

## Notes

- SPEC-007 is the first spec to enforce write isolation in workflow
  code rather than at the schema layer. Each pricing-write workflow
  (`createOffers`, `updateOffers`, `deleteOffers`, and any future
  `bulkPriceUpdate`) must call a shared `assertOfferPriceOwnership`
  helper before dispatch to the pricing module. This helper lives at
  `packages/core/src/workflows/offer/utils/assert-offer-price-ownership.ts`
  and takes `{ offer_id, price_ids[] }`, throws on mismatch, returns
  void on success.
- The `manage_inventory: false` precondition is what makes "no cart
  workflow override" possible. Without it, Medusa's
  `confirmVariantInventoryWorkflow` would run against the variant's
  own inventory-item links and either over-reserve (because Mercur's
  offer ↔ inventory M:N is the source of truth) or under-reserve
  (because the variant's links are stale). Mercur enforces the
  precondition via two `model.boolean().default(false).computed()`
  declarations on `ProductVariant` (`manage_inventory` and
  `allow_backorder`) rather than a row-level migration: every read
  resolves to `false` regardless of the DB column's value, which
  short-circuits the native step entirely and leaves no row-level
  state to drift. The `// todo: remove` comment on those two lines
  signals the columns should be deleted outright once upstream
  Medusa workflows stop reading them.
- Order snapshots are untouched. SPEC-002's order-line ↔ offer link
  is preserved. With this revision, the snapshot is **Medusa's
  calculated unit price** (filtered by `offer_id` rule), not a
  custom-price write — but the order line item's `unit_price` column
  still freezes the value at completion time, so historical pricing
  remains durable.
- The probe script in
  `apps/api/src/scripts/probe-shared-priceset.ts` is the canonical
  reference for what the pricing module returns under each context
  shape. It should be kept runnable.
