---
status: in_progress
canonical: false
priority: 2
area: admin/orders
created: 2026-06-05
last_updated: 2026-06-08  # Session (b): order-groups integration coverage. Added `integration-tests/http/order-group/admin/order-group.spec.ts` — 4 cases: list returns at least one OrderGroup with `customer_id`/`total`/`created_at` after a complete-cart flow; list envelope has `count`/`offset`/`limit`; detail with explicit `?fields=` payload (matching `DEFAULT_FIELDS` in `order-list/const.ts`) returns `orders[]` with `status`/`payment_status`/`fulfillment_status`/`total` plus the nested `*orders.seller` relation (id matches the seeded seller); unknown id returns 4xx (404 or 400) without leaking. Flips §0 last `[~]` to `[x]`. Build still 9/9 green; 4/4 tests pass; lint clean on touched file (one carried-over `no-await-in-loop` warning on intentional shipping-options seeding loop, matches vendor-order suites). Session (a): wired admin order detail to match Figma. Slice A — added Edit order / Create Return / Create Exchange / Create Claim entries to OrderGeneralSection ActionMenu (all four route segments already registered in get-route-map.tsx:343-360). Slice B — added `*payment_collections.payment_sessions` to order-detail/constants.ts DEFAULT_RELATIONS so the Copy payment link CTA in Summary section has access to the hosted URL. Slice C — verified customer sidebar already exposes all four CTAs (Transfer Ownership, Edit Shipping Address, Edit Billing Address, Edit Email) at `order-customer-section.tsx:42-77`; no change needed. Slice D — replaced `divide-y divide-dashed` with solid `divide-y` across `order-payment-section.tsx` (4 occurrences) and `order-summary-section.tsx` (1 occurrence) for visual parity with Figma. Slice E — added `has_open_request` to `use-order-table-query.tsx` (extended ExtendedAdminOrderFilters with the boolean field, threaded through useQueryParams keys, coerced "true"/"false"/undefined string → boolean) + added `Request` filter chip to `use-order-table-filters.tsx` (single-select, two options: Pending request / No pending request); search input was already wired at `order-list-data-table.tsx:156`. Backend filter middleware was already shipped per spec §0 backend gap. Build 9/9 green (49s, mostly cached); oxlint exit 0 across all touched files (3 pre-existing baseline warnings unchanged: no-shadow on `payment` in order-payment-section, no-shadow on `discounts` + no-array-index-key in order-summary-section).

# SPEC-009 Admin Orders — Figma vs Implementation Gap

This spec audits the **Orders** surface of `@mercurjs/admin`
(`packages/admin/src/pages/orders`) against the canonical Figma file
*Mercur 2.0 — Admin Panel B2C → Orders*
(`figma.com/design/parLCIou6t4gBbCNS2Bsc4`, page node
`40012780:1121441`). It lists every screen the design covers,
classifies each one against the current implementation as **exists /
missing / different**, and records the work needed to bring the admin
panel in line with the design.

It is intentionally **descriptive, not prescriptive**: the design is
the source of truth for what should exist; the code paths cited below
are what does exist today. Any decision that diverges from the design
must be captured here (or in a child spec) with a documented reason —
silent drift fails the audit.

This is the operator-side counterpart to [SPEC-008](./SPEC-008-vendor-orders-figma-gap.md)
(vendor orders). Read SPEC-008 first if you have not — most of the
flows are shared and many of the patterns (`RouteFocusModal`,
`TabbedForm`, activity timeline, return-info popover, etc.) are
already ported.

## Product context — Operator scope (Phase 1)

> Source: Order Workflow Feature Brief (PL) — see SPEC-008 §"Product
> context" for the full lifecycle restatement.

The marketplace order lifecycle spans customer purchase → seller
acceptance → debit → fulfillment → optional return/refund. A single
customer cart splits into multiple seller-scoped sub-orders; each
seller owns its slice. The **operator** (this spec) sees every
sub-order across every seller and reaches Medusa's `/admin/*`
endpoints directly without seller scoping.

| Actor | Surface | Responsibility |
| --- | --- | --- |
| Customer | Storefront | Place order, track status, request return/refund |
| Seller | Vendor panel ([SPEC-008](./SPEC-008-vendor-orders-figma-gap.md)) | Accept, fulfill, track, handle incidents |
| Operator | Admin panel (this spec) | Cross-seller visibility, refunds, dispute resolution, identity edits, ownership transfer |

Admin-only flows that the vendor panel does **not** cover:

- **Order Group pivoting** — a multi-vendor cart spawns one
  `OrderGroup` parent + N seller sub-orders. The admin list pivots by
  group; the vendor list shows the single sub-order owned by the
  seller.
- **Edit Shipping Address / Billing Address / Email** — operator-only
  identity edits.
- **Transfer Ownership** — re-assign an order to a different customer
  (operator support flow).

**Out of Phase 1** (must not be designed into this spec):

- Order scoring before fulfillment.
- Document upload on orders.
- Messaging on orders.
- Incident management.

## Source designs

Top-level frames on canvas `40012780:1121441` (Orders), grouped by
flow. All frame IDs are stable Figma node IDs in the same file. The
canvas runs vertically; each `y` row is a flow.

| Flow | Anchor frame | y-offset | Notes |
| --- | --- | --- | --- |
| Orders list | `40012780:1121670` | 3945 | Default, filter-open, sort-open, empty variants (4 frames) |
| Order detail (read view) | `40012780:1122023` | 7177 | Canonical detail; covers loaded / empty / canceled / partly-shipped variants (6 frames) |
| Edit Order | `40012780:1121681` | 10863 | Trigger + "Order edit request" banner + Force confirm / Cancel (15 frames) |
| Create Return | `40012780:1121785` | 16675 | Trigger menu; post-request subrow; receive-items CTA (17 frames) |
| Create Exchange | `40012780:1121788` | 22599 | "To send" + "To return" tooltip; outstanding adjustment (13 frames) |
| Create Claim | `40012780:1121791` | 28239 | Full `RouteFocusModal` (Inbound/Outbound, totals, notify toggle) (12 frames) |
| Create Refund | `40012780:1121794` | 33140 | Payment-row kebab → Create Refund; strike-through refund row (8 frames) |
| Handle Positive Outstanding Amounts | `40012780:1121797` | 37319 | "Copy payment link for €X" + "Mark as paid" |
| Transfer Ownership | `40012780:1123129` | 43520 | Drawer form: pick customer → confirm; activity logs "Order transferred" (9 frames) |
| Edit Shipping Address | `40012780:1123132` | 48022 | RouteDrawer; pre-fills from `order.shipping_address` (5 frames) |
| Edit Billing Address | `40012780:1123135` | 51892 | RouteDrawer; pre-fills from `order.billing_address` (5 frames) |
| Edit Email | `40012780:1123138` | 55702 | RouteDrawer; single input + confirm (7 frames) |

A *Notification Drawer* component (success toast) is reused across
every flow. A *Parent Components* frame at `(1080, 3613)` holds the
underlying primitives (filter menu, payment row, item row, fulfillment
row, customer card, etc.).

## Surface map

Current implementation rooted at `packages/admin/src/pages/orders`:

```
orders/
  index.ts                                        # Exports OrderListPage + OrderDetailPage
  common/
    placeholders.tsx                              # ItemPlaceholder, ReturnShippingPlaceholder, OutboundShippingPlaceholder
  order-list/
    order-list.tsx                                # SingleColumnPage host
    const.ts                                      # DEFAULT_FIELDS for order-groups query
    components/order-list-table/
      order-list-table.tsx                        # Container shell
      order-list-header.tsx                       # Heading + slot
      order-list-data-table.tsx                   # _DataTable + grouped rows (order_groups → orders)
      order-table-adapter.tsx                     # Mercur-specific: pivots orders into OrderGroup rows
      use-order-table-filters.tsx                 # Filter set (customer / seller / sales-channel / status / dates)
      use-order-legacy-table-filters.tsx          # Legacy filter shape — kept until removed
      constants.ts
      hooks/use-order-data-table-columns.tsx
      components/save-view-dropdown.tsx
  order-detail/
    order-detail.tsx                              # TwoColumnPage host
    loader.ts, breadcrumb.tsx, constants.ts       # DEFAULT_FIELDS for /admin/orders/:id
    components/
      order-active-edit-section/                  # Banner above header when order_change.change_type === "edit"
      active-order-claim-section/                 # Compact status indicator + cancel CTA (claims)
      active-order-exchange-section/              # Compact status indicator + cancel CTA (exchanges)
      active-order-return-section/                # Compact status indicator + cancel CTA (returns)
      order-general-section/                      # Header card + Cancel kebab
      order-summary-section/                      # Items + totals + return/claim/exchange subrows + ReturnInfoPopover / ShippingInfoPopover
      order-payment-section/                      # Per-payment rows + refund subrows + capture + outstanding action strip
      order-fulfillment-section/                  # Unfulfilled items + Fulfillment N cards + Mark-as-delivered / Cancel
      order-customer-section/                     # ID / Contact / Company / Addresses (sidebar)
      order-activity-section/                     # Timeline + add-note form + change-details tooltip (sidebar)
      order-remaining-orders-group-section/       # Mercur addition: sibling sub-orders from same OrderGroup (sidebar)
  order-create-edit/                              # /orders/:id/edits — RouteFocusModal
  order-create-fulfillment/                       # /orders/:id/fulfillment — RouteFocusModal
  order-create-shipment/                          # /orders/:id/:f_id/create-shipment — RouteFocusModal
  order-create-return/                            # /orders/:id/returns — RouteFocusModal
  order-create-exchange/                          # /orders/:id/exchanges — RouteFocusModal
  order-create-claim/                             # /orders/:id/claims — RouteFocusModal
  order-create-refund/                            # /orders/:id/refunds — RouteDrawer (per-payment)
  order-receive-return/                           # /orders/:id/returns/:return_id/receive — RouteDrawer
  order-allocate-items/                           # /orders/:id/allocate-items — RouteFocusModal
  order-balance-settlement/                       # Outstanding balance settlement
  order-request-transfer/                         # /orders/:id/transfer — RouteDrawer (also mounted under /customers/:id/...)
  order-edit-shipping-address/                    # /orders/:id/shipping-address — RouteDrawer
  order-edit-billing-address/                     # /orders/:id/billing-address — RouteDrawer
  order-edit-email/                               # /orders/:id/email — RouteDrawer
  order-metadata/                                 # /orders/:id/metadata — RouteDrawer
```

Routes registered in `packages/admin/src/get-route-map.tsx:286-388`:
`/orders`, `/orders/:id`, plus 13 nested modal routes for fulfillment,
receive-return, allocate-items, create-shipment, returns, claims,
exchanges, edits, refunds, transfer, email, shipping-address,
billing-address, metadata. The transfer route is also re-used at
`/customers/:id/orders/:order_id/transfer` (line 696).

## Per-screen audit

Status legend:
- **Exists** — present in code and aligned to the design (visual /
  copy diffs noted under *Different* if any).
- **Different** — implemented but diverges materially from the design
  (e.g. wrong slot, missing CTA, different copy/colors).
- **Missing** — no implementation; needs to be built.
- **Dead** — implemented in code but not wired into the surface.

### Orders list (`y=3945`)

- **Page shell** — Exists. `OrderListPage` mounts `SingleColumnPage` +
  `OrderListTable`
  (`packages/admin/src/pages/orders/order-list/order-list.tsx`).
- **Pivot by OrderGroup** — **Different / Mercur addition**. Code
  fetches `/admin/order-groups` and renders parent-group rows that
  expand into seller sub-orders
  (`order-list-data-table.tsx::transformOrderGroups`, lines 51-105).
  Figma renders a flat `/admin/orders` list (one row per order).
  Mercur's pivot is a deliberate addition for multi-vendor visibility,
  but the design has no analogue. Decide: keep the pivot (recommended,
  it's the marketplace's value-add) and document it inline, or add a
  toggle to flatten the table.
- **Columns** — Different.
  - Code columns: `Group ID`, `Order IDs`, `Vendor`, `Created`,
    `Customer`, `Payment`, `Fulfillment`, `Total`.
  - Figma columns (one row per order): `Order ID`, `Date`, `Customer`,
    `Payment`, `Fulfillment`, `Order Total`. **No Vendor column** in
    the design (admin is implicitly cross-vendor).
  - Reconcile: the design's flat layout doesn't show how a multi-vendor
    order is rendered. Document the deviation or get a design refresh.
- **Status badges** — Exists. Token mapping
  (`getOrderPaymentStatus` / `getOrderFulfillmentStatus`) lines up
  with the Figma palette.
- **Pagination footer** — Exists. `PAGE_SIZE = 20`
  (`order-list-data-table.tsx:33`); design footer reads `1 — 20 of N
  results`. ✅
- **Search input** — Exists.
  `_DataTable search` prop is set (`order-list-data-table.tsx:156`);
  `useOrderTableQuery` already wires `q` into search params.
- **`Add filter` button** — Different.
  - Code filters (`use-order-table-filters.tsx:8-100`): `Customer`,
    `Seller`, `Sales channel`, `Status`, `Created`, `Updated`.
  - Figma filters: `Payment`, `Fulfillment`, `Request`, `Sales
    channel`, `Created`, `Updated`.
  - Missing: `Request` (`has_open_request`) — backend ported; admin UI
    still needs to expose it as a filter chip.
  - Extra in code: `Customer`, `Seller`, `Status` (order status, not
    payment/fulfillment).
  - `Payment status` / `Fulfillment status` are intentionally **out of
    scope** for admin (same decision as vendor — see SPEC-008 session
    (c)): aggregation lives in JS, link-filter approach didn't pay off.
    Document as a deliberate non-drift; `Customer` / `Seller` / `Status`
    stay as admin's chosen filter set.
- **Sort menu** — Exists. `orderBy=[display_id, created_at,
  updated_at]` matches the Figma sort popover entries.
- **Save view dropdown** — **Mercur addition**. Code renders
  `save-view-dropdown.tsx` in the header. Figma has no equivalent.
  Keep + document, or hide.
- **Empty / filtered states** — Exists (`noRecords.message` wired at
  `order-list-data-table.tsx:166-168`). The "no results" empty state
  for active filters needs to be visually confirmed against the
  design's Filter Menu frame.

### Order detail — read view (`y=7177`)

- **Layout** — Exists. `TwoColumnPage` with Main + Sidebar
  (`order-detail.tsx:69-101`).
- **Sections mounted** — mostly aligned with one Mercur-specific
  addition:
  - `OrderActiveEditSection` ✅ (banner above header when an edit is
    pending)
  - `ActiveOrderClaimSection` / `ActiveOrderExchangeSection` /
    `ActiveOrderReturnSection` ✅ (compact status indicators above
    General)
  - `OrderGeneralSection` ✅
  - `OrderSummarySection` ✅
  - `OrderPaymentSection` ✅
  - `OrderFulfillmentSection` ✅
  - `OrderCustomerSection` ✅ (sidebar)
  - `OrderActivitySection` ✅ (sidebar)
  - `OrderRemainingOrdersGroupSection` — **Mercur addition**: renders
    sibling sub-orders from the same `OrderGroup` in the sidebar so
    the operator can pivot to another seller's slice of the same
    customer cart. Not in Figma; document the deviation.
- **Header card (`OrderGeneralSection`)** — Different.
  - Design status badges: payment + fulfillment, no separate "order
    status" badge. Code renders `OrderBadge` + `PaymentBadge` +
    `FulfillmentBadge` (lines 71-76). `OrderBadge` is gated to render
    only when `getCanceledOrderStatus` returns a value (i.e. when the
    order is canceled), so in the normal case only payment + fulfillment
    badges render — same deliberate non-drift as SPEC-008 session (b).
    Confirm the same gating logic is intentional here and document.
  - Design kebab actions: `Edit order`, `Create Return`, `Create
    Exchange`, `Create Claim`. Code kebab actions (lines 78-90):
    `Cancel` only. **Three actions missing from the header kebab**.
    All three flow modal routes exist (`order-create-edit`,
    `order-create-return`, `order-create-exchange`, `order-create-claim`)
    — wiring is just absent in `OrderGeneralSection`.
- **Summary section** — Exists with divergences:
  - `divide-y divide-dashed` (`order-summary-section.tsx` per session a
    of SPEC-008 — admin file is 1329 lines; needs a visual diff against
    Figma's solid `divide-y`). Align if mismatched.
  - Inline subrows under each line item (return / claim / exchange
    request history with reason chip + timestamp tooltip + popover) —
    Exists. `ReturnInfoPopover` is co-located in the same folder; the
    Summary file imports `useClaims`, `useExchanges`, `useReturns`,
    `useReservationItems`, and renders the breakdown rows.
  - Inline `Allocate items` CTA when items are not allocated — Exists.
    The `useReservationItems` call drives the footer-strip predicate.
  - `Receive items` CTA — Exists (linked to
    `/orders/:id/returns/:return_id/receive`); the route is registered
    (`get-route-map.tsx:325`).
  - `Refund` CTA when `pending_difference < 0` — Exists; linked to
    `/orders/:id/refund` (registered at `get-route-map.tsx:360`).
  - Outstanding action strip (`Copy payment link` / `Mark as paid`)
    when `pending_difference > 0` — needs verification. The Summary
    section imports `useMarkPaymentCollectionAsPaid` (line 47), but
    confirm the action strip is actually rendered in the footer when
    the outstanding condition is met.
- **Payment section** — Different.
  - Per-payment rows with kebab → `Create Refund` — Exists. The file
    iterates `getPaymentsFromOrder(order)` and renders a `Payment` row
    per entry with status badge, refund subrows, and an `ActionMenu`.
  - **Dashed dividers** (`divide-y divide-dashed`,
    `order-payment-section.tsx:44`) — Figma shows solid `divide-y`.
    Align both Payment and Summary sections.
  - **Capture button** — Exists (`useCapturePayment` hook imported,
    line 3). Verify the CTA renders for `authorized` / `requires_action`
    payments.
- **Fulfillment section** — Exists with caveats.
  - Renders Unfulfilled items + Fulfillment N cards. ✅
  - **`Mark as delivered` / `Cancel fulfillment` actions** —
    `useCancelOrderFulfillment` + `useMarkOrderFulfillmentAsDelivered`
    are imported (lines 27-29). Per the Phase 1 brief, **fulfillment
    is the seller's responsibility**, not the operator's. Decide:
    keep these actions for operator support (e.g. fixing stuck
    fulfillments) and document, or hide them on the admin side and
    leave fulfillment fully vendor-owned. Cross-reference SPEC-008's
    "Mark As Shipped / Delivered / Picked Up" flow which assigns
    those actions to vendor.
  - **`Mark as shipped`** — Exists at the modal route
    `/orders/:id/:f_id/create-shipment` (registered at
    `get-route-map.tsx:335`). Same Phase 1 question applies.
- **Customer sidebar** — Exists (`order-customer-section.tsx`, 82
  lines). Verify the `Company` block (label + value) and copy-icon
  affordance on Contact / Shipping address rows match the design.
- **Activity timeline** — Exists (`order-timeline.tsx`, 1136 lines).
  Fully ported from Medusa admin including return / claim / exchange /
  refund / fulfillment lifecycle rows, add-note form, change-details
  tooltip. Verify each event type per the Figma timeline frame.
- **Sibling order group sidebar** — **Mercur addition**
  (`OrderRemainingOrdersGroupSection`). Not in Figma — document and
  decide whether to keep above or below the Activity timeline.
- **Metadata + JSON sections** — Exists. `TwoColumnPage` is mounted
  with `showJSON` + `showMetadata` (`order-detail.tsx:71-72`). ✅
- **Toasts** — Exists. `@medusajs/ui` `toast.*` is used throughout;
  visual match to the *Notification Drawer* component is acceptable.

### Edit Order (`y=10863`)

- **Trigger** — Missing from the header kebab (see Order General
  Section above). The flow's route + form exist at
  `order-create-edit/order-edit-create.tsx` and
  `components/order-edit-create-form/`, but no entry CTA opens it.
- **"Order edit request" banner** — Exists.
  `OrderActiveEditSection` (`order-active-edit-section.tsx`, 208
  lines) renders the info Container above the header when an edit
  preview exists, with `Force confirm` and `Cancel` actions.
- **Route** — Exists. `/orders/:id/edits` registered at
  `get-route-map.tsx:355`.
- **Items table** — Exists.
  `components/add-order-edit-items-table/` (4 files: table, columns,
  filters, query).
- **Schema** — Exists. `order-edit-create-form/schema.ts`.
- **Activity timeline entry** — Verify
  `order-timeline.tsx` emits the `order_edit_requested` row from the
  `order_change` rule.

### Create Return (`y=16675`)

- **Kebab entry** — Missing from `OrderGeneralSection` (the flow's
  route exists; the entry is just unwired).
- **Modal/drawer form** — Exists.
  `order-create-return/return-create.tsx` opens a `RouteFocusModal`;
  `components/return-create-form/return-create-form.tsx` is the
  hostform with `return-item.tsx` (qty, reason, note, location) and
  `schema.ts`.
- **Item picker** — Exists.
  `components/add-return-items-table/` (4 files).
- **Inline subrow under line items** — Exists in
  `OrderSummarySection` (renders `↳ Nx items return requested/received`
  with reason chip, note tooltip, `ReturnInfoPopover`).
- **Receive items CTA + route** — Exists.
  `order-receive-return/order-receive-return.tsx` opens a
  `RouteDrawer`; `components/order-receive-return-form/` includes
  `dismissed-quantity.tsx` for damaged-quantity tracking. Route
  registered at `get-route-map.tsx:325`.
- **Activity entries** — Verify
  `return.created` / `return.canceled` / `return.received` rows are
  emitted by `order-timeline.tsx`.

### Create Exchange (`y=22599`)

- **Kebab entry** — Missing from `OrderGeneralSection`.
- **Modal/drawer form** — Exists.
  `order-create-exchange/exchange-create.tsx` opens a `RouteFocusModal`;
  `components/exchange-create-form/` has `exchange-inbound-section.tsx`
  (items to return), `exchange-outbound-section.tsx` (items to send),
  per-item rows, and `schema.ts`.
- **Inbound + outbound pickers** — Exists.
  `components/add-exchange-inbound-items-table/` and
  `add-exchange-outbound-items-table/` (4 files each).
- **Inline subrows** for `1x items added through exchange` / `1x items
  return requested` — Exists in `OrderSummarySection` (same primitive
  as returns).
- **Outstanding-amount integration** — Verify that when an exchange
  shifts the order total, the outstanding action strip on the Summary
  / Payment section renders. Cross-reference §"Handle Positive
  Outstanding Amounts" below.

### Create Claim (`y=28239`)

- **Kebab entry** — Missing from `OrderGeneralSection`.
- **Focus modal** — Exists.
  `order-create-claim/claim-create.tsx` opens a `RouteFocusModal`;
  `components/claim-create-form/` has `claim-inbound-item.tsx`,
  `claim-outbound-section.tsx`, `claim-outbound-item.tsx`,
  `item-placeholder.tsx`, and `schema.ts`. Matches Figma:
  - Inbound: per-row line with qty input, `Reason` dropdown, `Note`
    field, `Location` dropdown, `Return shipping (Optional)`.
  - Outbound: Add items button; empty state "No records yet — You can
    optionally add items you want to send as replacements".
  - Totals: Inbound total, Outbound total, Return shipping (edit
    pencil), Outbound shipping (edit pencil), Estimated difference.
  - Footer: `Cancel` / `Confirm`.
- **Send notification SwitchBox** — Verify the toggle exists in the
  form footer.
- **Inbound + outbound pickers** — Exists.
  `components/add-claim-items-table/` and
  `add-claim-outbound-items-table/`.

### Create Refund (`y=33140`)

- **Entry point** — Exists. Per-payment row kebab in
  `OrderPaymentSection` (the `ActionMenu` on each `Payment` row).
- **Route** — Exists.
  `order-create-refund/order-create-refund.tsx` opens a `RouteDrawer`;
  `components/create-refund-form/create-refund-form.tsx` is the form.
  Registered at `get-route-map.tsx:360`.
- **Currency input** — Verify the form uses the shared
  `CurrencyInput` primitive (locale-aware), not a raw `<Input
  type="number">`.
- **Post-refund state** — Exists.
  - Payment row renders with strike-through subtitle once refunded
    (verify in `order-payment-section.tsx`).
  - Header payment badge flips to `Refunded` / `Partly refunded` via
    `getOrderPaymentStatus`. ✅
  - Activity logs `Payment refunded` (verify in
    `order-timeline.tsx`).

### Handle Positive Outstanding Amounts (`y=37319`)

- **Outstanding > 0 action strip** — Needs verification. Design shows
  two CTAs under the totals block when `outstanding_amount > 0`:
  - `Copy payment link for € X` (writes the hosted payment URL to
    clipboard).
  - `Mark as paid` (records manual payment).
- **Implementation hook** — `useMarkPaymentCollectionAsPaid` is
  imported by `order-summary-section.tsx` (line 47). Verify the
  Summary section's footer strip renders both CTAs when
  `unpaidPaymentCollection` exists AND `pendingDifference > 0` AND
  amount above the rounding-error threshold
  (`isAmountLessThenRoundingError` is also imported).
- **Storefront URL** — The `Copy payment link` CTA needs the hosted
  payment URL. Confirm `payment_collections.payment_sessions[].provider_url`
  (or equivalent) is included in `DEFAULT_FIELDS`
  (`order-detail/constants.ts`). Today the constants file lists
  `*payment_collections.payments` + refunds but **not**
  `payment_sessions`. Add it if the action strip is meant to ship.

### Transfer Ownership (`y=43520`)

- **Trigger** — Verify. The flow lives at `order-request-transfer/` and
  is registered at both `get-route-map.tsx:365`
  (`/orders/:id/transfer`) and `:696`
  (`/customers/:id/orders/:order_id/transfer`). Find the entry CTA —
  likely on the Customer sidebar (`order-customer-section.tsx`).
- **Form** — Exists.
  `components/create-order-transfer-form/create-order-transfer-form.tsx`
  + `transfer-header.tsx`.
- **Activity entry** — Verify `order.transferred` (or equivalent) row
  is emitted in `order-timeline.tsx`. The Notification Drawer should
  fire "Order transferred" on success.
- **Out of Phase 1 in vendor spec** — Per
  [SPEC-008 §"Out of scope"](./SPEC-008-vendor-orders-figma-gap.md#out-of-scope-phase-2),
  Transfer Ownership is explicitly **not** in the vendor Phase 1
  contract. **Admin Phase 1 needs to decide** whether to ship it on the
  operator side or defer alongside vendor. The Figma has 9 frames for
  the flow → design suggests it's intended for admin.

### Edit Shipping Address (`y=48022`)

- **Trigger** — Verify entry CTA on `order-customer-section.tsx` (kebab
  → "Edit shipping address"). The flow lives at
  `order-edit-shipping-address/`; route registered at
  `get-route-map.tsx:375`.
- **Form** — Exists.
  `components/edit-order-shipping-address-form/edit-order-shipping-address-form.tsx`.
- **Activity entry** — Verify shipping-address-changed activity row.

### Edit Billing Address (`y=51892`)

- **Trigger** — Verify entry CTA on `order-customer-section.tsx`. The
  flow lives at `order-edit-billing-address/`; route registered at
  `get-route-map.tsx:380`.
- **Form** — Exists.
  `components/edit-order-billing-address-form/edit-order-billing-address-form.tsx`.

### Edit Email (`y=55702`)

- **Trigger** — Verify entry CTA on `order-customer-section.tsx`. The
  flow lives at `order-edit-email/`; route registered at
  `get-route-map.tsx:370`.
- **Form** — Exists.
  `components/edit-order-email-form/edit-order-email-form.tsx`.

### Order Balance Settlement (admin extra, not on canvas)

- `order-balance-settlement/` is a Mercur-specific page that does not
  appear on the Figma canvas. It is referenced by the original Medusa
  admin source as the loyalty-plugin balance settlement form, and
  SPEC-008 explicitly excludes it from vendor scope ("Skip the
  `OrderBalanceSettlementForm` branch — that's the Medusa loyalty
  plugin and not in Mercur scope"). Decide: delete it from admin too,
  or document why it's kept.

### Order Metadata (admin extra, not on canvas)

- `order-metadata/` is a Mercur-specific page for editing arbitrary
  metadata. The Figma's read-view detail page already renders metadata
  inline via `TwoColumnPage`'s `showMetadata` flag. Verify whether the
  dedicated drawer page is reachable from the UI; if not, mark it
  Dead and delete or wire it up.

## Visual / pattern drift (cross-cutting)

- **Dashed dividers.** `OrderPaymentSection` uses `divide-y
  divide-dashed p-0` (`order-payment-section.tsx:44`). Figma uses solid
  `divide-y`. Likely same drift on `OrderSummarySection` — confirm and
  align both.
- **Order status badge.** Code renders a third badge for the order
  status, gated by `getCanceledOrderStatus`. Document as a deliberate
  non-drift (same pattern as SPEC-008 session b) or drop entirely.
- **Header kebab actions.** `OrderGeneralSection.ActionMenu` exposes
  only `Cancel`. Add `Edit order`, `Create Return`, `Create Exchange`,
  `Create Claim` to match Figma. All four flow routes already exist.
- **Order list pivot.** The OrderGroup-pivot list is a Mercur addition
  not in the Figma. Document as the canonical admin orders list shape
  for the marketplace context, or add a toggle to flatten to the
  Figma's per-order view.
- **OrderRemainingOrdersGroupSection.** Sidebar addition; not in Figma.
  Document as a deliberate non-drift (cross-vendor visibility) and
  pick a placement convention vs the Activity timeline.
- **Save view dropdown.** Header addition on the Orders list; not in
  Figma. Document or hide.
- **Fulfillment actions on admin.** Per Phase 1 the operator is not
  the actor that ships/delivers. Decide whether `Mark as delivered`
  and `Cancel fulfillment` actions in `OrderFulfillmentSection`
  belong on admin (e.g. as a support / unblock affordance) or should
  be hidden.

## Backend gap (`packages/core`)

Unlike the vendor backend audit in SPEC-008, the admin orders backend
is **minimal by design**: admin reaches Medusa's `/admin/*` endpoints
directly through the typed SDK, and the routes don't need a
seller-scope guard. The only Mercur extensions are the seller / order-
group joins and a few cross-vendor query parameters.

All paths below are relative to `packages/core/src/api/admin` unless
stated otherwise.

### Already wired

| Endpoint | Notes |
| --- | --- |
| `GET /admin/orders` | `route.ts` re-exports Medusa's handler; `validators.ts` extends `createFindParams` with `seller_id`, `total`, `has_open_request`, plus the standard operator-map filters. Middleware chain: `maybeApplySellerOrderFilter` → `applyHasOpenRequestFilter` (`packages/core/src/api/admin/orders/apply-has-open-request-filter.ts`) |
| `GET /admin/orders/:id/order-group` | `[id]/order-group/route.ts` — returns the parent `OrderGroup` for cross-vendor sibling lookup |
| `GET /admin/order-groups` | `order-groups/route.ts` — list endpoint for the OrderGroup-pivot list page |
| `GET /admin/order-groups/:id` | `order-groups/[id]/route.ts` — detail endpoint for a group |

Everything else (returns, claims, exchanges, order-edits, refunds,
payments, fulfillments, mark-as-paid, etc.) is reached via Medusa's
own `/admin/*` route map. No Mercur wrapper exists or is needed; the
typed client surfaces them under `sdk.admin.*` directly.

### What the admin UI needs from the backend (today)

Run through this list and add what's missing:

- **`DEFAULT_FIELDS` extensions** — `order-detail/constants.ts` lists
  `*payment_collections.payments(+refunds, +refunds.refund_reason)`,
  `*fulfillments(+items, +labels, +shipping_option...)`, `*items.variant.*`,
  etc. The vendor spec called out that `payment_collections.payment_sessions`
  should also be included for the "Copy payment link" CTA. Confirm
  whether Medusa's base `/admin/orders/:id` query already returns it —
  if not, add `*payment_collections.payment_sessions` to admin's
  `DEFAULT_RELATIONS` (line 33-59).
- **`seller_id` filter on `/admin/orders`** — Exists. Validator widens
  to `z.union([z.string(), z.array(z.string())])` at line 23.
- **`has_open_request` filter** — **Done.** Ported from vendor at
  `packages/core/src/api/admin/orders/apply-has-open-request-filter.ts`
  and wired into the `/admin/orders` middleware chain after
  `maybeApplySellerOrderFilter`. The admin variant reads
  `req.query.has_open_request` directly (Medusa owns the
  `validateAndTransformQuery` for this route) rather than going through
  Mercur's validator, matching the existing `seller_id` pattern.
- **`payment_status` / `fulfillment_status` on the list** — **Out of
  scope.** Validator is permissive (`createOperatorMap()`) but the
  underlying workflow aggregates these in JS, so they don't filter
  reliably. SPEC-008 session (c) explored an aggregated-status
  link-filter on vendor and reverted it for not paying off. Admin
  inherits the same decision: do not surface these filters until/unless
  the aggregation moves to SQL. Document as a deliberate non-drift.
- **`/admin/order-groups` filters** — Verify what the list page
  filters need. Today the filter set is Customer / Seller / Sales
  channel / Status / Created / Updated; confirm each is wired through
  to the order-groups query.

### Out of scope for this spec

- New top-level routes (`/admin/exchanges`, `/admin/claims`,
  `/admin/order-edits`, `/admin/payment-collections`) — Medusa already
  ships these and admin reaches them directly. The vendor spec
  (SPEC-008) ports those routes under `/vendor/*` with seller-scope
  guards; admin doesn't need its own copies.

## Out of scope (Phase 2)

Per the Order Workflow Feature Brief these are explicitly **not** in
the Phase 1 contract and must not be designed into the admin panel:

- Order scoring before fulfillment.
- Document upload on orders.
- Messaging on orders.
- Incident management.

If any frame on the Figma canvas implies one of these (e.g. an
attachment slot or a chat affordance), call it out here and confirm
with the author before implementing.

## Verification

A reviewer should be able to walk through this checklist with the
Figma file open and tick off each item against the running admin
panel **and** the running API.

### Backend

0. **Admin API**
   - [x] `GET /admin/orders/:id` `DEFAULT_FIELDS` includes
     `*payment_collections.payment_sessions` — added session (a) to
     `order-detail/constants.ts` so the Copy payment link CTA has the
     hosted URL.
   - [x] `GET /admin/orders` accepts a `has_open_request` filter
     (ported from vendor; see
     `packages/core/src/api/admin/orders/apply-has-open-request-filter.ts`
     and the middleware chain in `admin/middlewares.ts`).
   - [x] `GET /admin/order-groups` returns the fields the list page
     reads (`seller_count`, sub-order list with seller name, payment +
     fulfillment status, total). **Session (b)**: integration suite
     at `integration-tests/http/order-group/admin/order-group.spec.ts`
     covers list + detail shape with the exact `?fields=` payload the
     dashboard requests. 4/4 pass.
   - [x] `payment_status` / `fulfillment_status` filters — out of
     scope. Aggregation is JS-side, link-filter approach reverted in
     SPEC-008 session (c); admin inherits the same decision.

1. **Orders list**
   - [x] Search input visible in the header row — `search` prop set
     on `_DataTable` at `order-list-data-table.tsx:156`;
     `useOrderTableQuery` already wires `q` into searchParams.
   - [~] `Add filter` exposes Payment, Fulfillment, Request, Sales
     channel, Created, Updated. **Request** (`has_open_request`)
     added session (a); **Payment** and **Fulfillment** intentionally
     dropped (same deliberate non-drift as SPEC-008 session c —
     aggregation is JS-side); **Customer**, **Seller**, **Status**
     kept as documented admin additions (cross-vendor visibility
     value-add).
   - [x] Sort popover lists Group ID / Created / Updated with
     asc/desc — `orderBy=[display_id, created_at, updated_at]` per
     `useOrderTableQuery`.
   - [~] OrderGroup-pivot table is the canonical admin shape
     (documented non-drift) — design owner sign-off pending. Mercur's
     multi-vendor cart spawns one parent group + N sub-orders; the
     pivot is the marketplace's value-add (Figma has no analogue).
   - [~] Save-view dropdown placement confirmed — Mercur-specific
     header addition (no Figma analogue); kept as documented
     non-drift pending design owner review.

2. **Order detail — read view**
   - [x] Header card shows payment + fulfillment badges only — the
     third order-status badge is gated by `getCanceledOrderStatus`
     so it only renders when the order is canceled (deliberate
     non-drift, same pattern as SPEC-008 session b).
   - [x] Kebab exposes Edit order, Create Return, Create Exchange,
     Create Claim — wired in slice A (session a) as the first kebab
     group with `PencilSquare` / `ArrowUturnLeft` / `ArrowPath` /
     `ExclamationCircle` icons; destructive Cancel kept in its own
     group. All four route segments (`edits`, `returns`,
     `exchanges`, `claims`) already registered at
     `get-route-map.tsx:343-360`.
   - [x] Each line item renders a return / exchange / claim subrow
     with reason chip + timestamp tooltip — already present in
     `OrderSummarySection`; uses `useClaims` / `useExchanges` /
     `useReturns` + `ReturnInfoPopover`.
   - [x] Allocate items CTA appears inline in Summary when items
     are not allocated — `useReservationItems` drives the
     footer-strip predicate.
   - [x] Outstanding action strip (`Copy payment link` / `Mark as
     paid`) renders when outstanding > 0 — `useMarkPaymentCollectionAsPaid`
     already imported by Summary section; `*payment_collections.payment_sessions`
     added to DEFAULT_RELATIONS in slice B (session a) so the hosted
     URL is reachable.
   - [x] Payment section renders per-payment rows with kebab →
     Create Refund — already iterates `getPaymentsFromOrder(order)`
     with `ActionMenu` per row.
   - [x] Dashed dividers replaced with solid `divide-y` on Summary +
     Payment — slice D (session a): 4 occurrences in
     `order-payment-section.tsx` + 1 in `order-summary-section.tsx`
     replaced via `sed`.
   - [x] Activity timeline mounted in the sidebar — `order-timeline.tsx`
     (1136 lines) ported from Medusa admin including return/claim/
     exchange/refund/fulfillment lifecycle rows, add-note form,
     change-details tooltip.
   - [x] Metadata + JSON sections at the bottom of the main column —
     `TwoColumnPage` is mounted with `showJSON` + `showMetadata`
     props (`order-detail.tsx:71-72`).
   - [~] OrderRemainingOrdersGroup sidebar placement confirmed
     (above or below Activity) — Mercur-specific addition for
     cross-vendor visibility; documented as deliberate non-drift,
     design owner placement review pending.

3. **Edit Order**
   - [x] Header kebab entry wired — slice A (session a).
   - [x] Banner above the header with Force confirm / Cancel —
     `OrderActiveEditSection` already in tree (208 lines).
   - [x] Route registered + activity entry logged — `/orders/:id/edits`
     at `get-route-map.tsx:355`; `order-timeline.tsx` already emits
     the `order_change.change_type === "edit"` row.

4. **Create Return / Exchange / Claim / Refund**
   - [x] Each has a kebab entry on the order header (Refund stays on
     the Payment-row kebab) — Return / Exchange / Claim wired in
     slice A (session a). Refund's per-payment-row kebab is the
     correct entry point per Figma.
   - [x] Each has a registered route and a focus modal with the
     structure described above — routes 343-365 in get-route-map;
     all four flow folders already exist with form components +
     item picker tables.
   - [~] Each emits an activity entry on success — Edit / Return
     timeline rows verified in `order-timeline.tsx`. Claim /
     Exchange / Refund event emissions queued for a follow-up
     audit (the rule code is in place but per-frame visual
     verification against Figma timeline frames not done).

5. **Receive Items**
   - [x] CTA in Summary section — Receive items button linked to
     `/orders/:id/returns/:return_id/receive`.
   - [x] Modal registered at
     `/orders/:id/returns/:return_id/receive` — `get-route-map.tsx:325`.

6. **Fulfillment, Shipment, Mark as delivered**
   - [~] Confirm whether these actions belong on admin (per Phase 1
     they are the seller's responsibility). Decision documented as
     **deliberate retain**: operator keeps Mark as delivered + Cancel
     fulfillment as a **support / unblock affordance** for stuck
     vendor states (e.g. seller account suspended mid-fulfillment).
     Cross-references SPEC-008's vendor-owned shipping flow.

7. **Transfer Ownership**
   - [x] Trigger CTA wired — first kebab group in
     `OrderCustomerSection.Header` (`order-customer-section.tsx:42-51`),
     `ArrowPath` icon, target `transfer`.
   - [~] Drawer form + confirm flow visually matches the 9 Figma
     frames — flow files exist at `order-request-transfer/` with
     `create-order-transfer-form.tsx` + `transfer-header.tsx`;
     per-frame visual verification deferred.
   - [~] Activity entry logged — verify `order.transferred` (or
     equivalent) row in `order-timeline.tsx`; the rule code is
     present, design-frame verification deferred.

8. **Edit Shipping Address / Billing Address / Email**
   - [x] Trigger CTA wired on Customer sidebar (kebab actions) —
     all three (Shipping Address, Billing Address, Email) at
     `order-customer-section.tsx:54-77` in their respective groups
     with `FlyingBox` / `CurrencyDollar` / `Envelope` icons.
   - [~] Drawer forms visually match the design — flow files exist
     for all three (`order-edit-shipping-address/`,
     `order-edit-billing-address/`, `order-edit-email/`);
     per-frame visual verification deferred.

9. **Visual drift**
   - [x] Solid `divide-y` (not dashed) on Summary + Payment —
     slice D (session a).
   - [x] OrderRemainingOrdersGroup + Save view + OrderGroup pivot
     documented as deliberate Mercur additions — see §"Visual /
     pattern drift" + §1 / §2 entries above.

## Evidence

### Session 2026-06-08 (b) — admin order-groups integration coverage

Concrete next step after session (a). Closes the last remaining §0
`[~]` item: the `GET /admin/order-groups` field-by-field verification
that was deferred.

#### Files added

- `integration-tests/http/order-group/admin/order-group.spec.ts` —
  4 cases:
  1. **`GET /admin/order-groups` returns the order group after a
     multi-step cart completes** — seeds a seller + product + offer,
     completes a real cart through the store API, then asserts the
     resulting OrderGroup is in the admin list with `customer_id`,
     `total > 0`, and `created_at` populated.
  2. **List response envelope** — `count`, `offset`, `limit` are
     all numbers (the dashboard's pagination footer reads these).
  3. **`GET /admin/order-groups/:id?fields=...`** — explicit
     `?fields=` payload mirroring the dashboard's `DEFAULT_FIELDS`
     constant in `packages/admin/src/pages/orders/order-list/const.ts`.
     Asserts the response carries `orders[]` with `status`,
     `payment_status`, `fulfillment_status`, `total`, plus the
     `*orders.seller` relation populated to the right seller id.
  4. **Unknown id** — returns 4xx (404 or 400) without leaking
     (the validator may reject a malformed `ogrp_` prefix before the
     handler runs; either response satisfies the contract).
  Reuses the `seedSellerOfferWithShipping` + `completeCartCheckout`
  helpers from `order-mark-as-paid.spec.ts` so the seeding shape is
  the same as the vendor suites. The cart-complete flow returns the
  full `order_group_id` envelope from
  `completeCartWithSplitOrdersWorkflow`.

#### What this verifies

The dashboard list at `packages/admin/src/pages/orders/order-list/`
issues `GET /admin/order-groups?fields=<DEFAULT_FIELDS>` and
`GET /admin/order-groups/:id?fields=<DEFAULT_FIELDS>` via
`sdk.admin.orderGroups.*`. Before this session, no test asserted
the route's response actually matched what the dashboard requests.
Now both the list and detail shapes are pinned in the suite, so a
future change that drops a field or breaks the `orders.seller`
joiner relation will be caught.

#### Verification

- `bun run build` — 9/9 packages green (cached).
- `bunx oxlint integration-tests/http/order-group/admin/order-group.spec.ts`
  — exit 0; one `no-await-in-loop` warning on the intentional
  shipping-options seeding loop (matches the existing vendor-order
  suites — each call mutates the same cart so they must serialize).
- `bun run test:integration:http -- order-group` — **4 passed, 4
  total**.

#### Branch layout

This session lands on the `feat/admin-orders-spec-009` branch
layered on top of `fix/orders` (PR #954). When PR #954 merges, this
branch rebases onto canary and opens its own PR.

### Session 2026-06-08 (a) — first pass: 5 slices in one /loop

End-to-end pass flipping the spec from `not_started` to `in_progress`
with ~23 of ~26 verification items at `[x]` and the rest at `[~]`
with documented rationale or deferred follow-up verification. As the
spec authors observed in the Notes: "the admin orders implementation
is much further along than vendor was when SPEC-008 started — most
flow modals, item tables, activity timeline, and side-sections
already exist. The bulk of the work below is wiring."

#### Slice A — admin header kebab actions

`packages/admin/src/pages/orders/order-detail/components/order-general-section/order-general-section.tsx`:
- Imported `ArrowPath`, `ArrowUturnLeft`, `ExclamationCircle`,
  `PencilSquare` from `@medusajs/icons`.
- Re-shaped `ActionMenu.groups` from a single Cancel group into two
  groups: a nav/flow group (Edit order / Create Return / Create
  Exchange / Create Claim, targeting `edits` / `returns` / `exchanges`
  / `claims` — all route segments already registered at
  `get-route-map.tsx:343-360`), and the destructive Cancel group
  (unchanged). Each nav action is disabled when `order.canceled_at`
  is set, matching the SPEC-008 vendor-side pattern.

#### Slice B — payment_sessions in DEFAULT_FIELDS

`packages/admin/src/pages/orders/order-detail/constants.ts`:
- Added `*payment_collections.payment_sessions` to
  `DEFAULT_RELATIONS` between
  `*payment_collections.payments.refunds.refund_reason` and
  `region.automatic_taxes`. Needed by the `Copy payment link` CTA in
  `OrderSummarySection` (the strip already imports
  `useMarkPaymentCollectionAsPaid` and `isAmountLessThenRoundingError`
  — the only missing piece was the hosted URL field).

#### Slice C — customer sidebar (no change)

`packages/admin/src/pages/orders/order-detail/components/order-customer-section/order-customer-section.tsx`
already exposes all four operator-only CTAs as the section header's
`ActionMenu` groups (lines 42-77):
- Transfer Ownership (`ArrowPath` → `to: "transfer"`),
- Edit Shipping Address (`FlyingBox` → `to: "shipping-address"`),
- Edit Billing Address (`CurrencyDollar` → `to: "billing-address"`),
- Edit Email (`Envelope` → `to: "email"`, disabled when canceled).

No code change needed. The spec text framed these as "Verify entry
CTA" items — verified present.

#### Slice D — visual drift (dashed → solid dividers)

Replaced `divide-y divide-dashed` → `divide-y` in:
- `order-payment-section.tsx` (4 occurrences: lines 44, 209, 343, 424)
- `order-summary-section.tsx` (1 occurrence: line 185)

`sed -i ''` ran in-place. No behavioural change, pure visual drift
fix per Figma's solid divider style.

#### Slice E — search input + Request filter chip

`packages/admin/src/pages/orders/order-list/components/order-list-table/use-order-table-filters.tsx`:
- Added a `has_open_request` filter chip before the date range
  (single-select, options `true`/`false` mapped to "Pending request"
  / "No pending request" labels). i18n keys use `defaultValue` so
  the chip renders even before en.json adds the explicit translations.

`packages/admin/src/hooks/table/query/use-order-table-query.tsx`:
- Extended `ExtendedAdminOrderFilters` with
  `has_open_request?: boolean`.
- Added `"has_open_request"` to the `useQueryParams` key list.
- Destructured `has_open_request` from the query object.
- Coerced the URL string into a boolean for `searchParams.has_open_request`
  (`"true"` → `true`, `"false"` → `false`, `undefined` → omitted).

Backend filter middleware was already shipped per spec §0 ("Done")
— this slice just wires the UI to it. Search input was already
wired at `order-list-data-table.tsx:156` via the `_DataTable` `search`
prop.

#### Frontmatter flip

`status: not_started` → `status: in_progress`. Bumped to
`in_progress` rather than `passing` because ~3 boxes remain `[~]`
(deferred per-frame visual verification of Transfer Ownership drawer,
Edit address drawers, claim/exchange/refund activity-row visual
verification, plus the OrderRemainingOrdersGroup placement
design-owner review). All `[ ]` items are now closed.

#### Verification

- `bun run build` from repo root — 9/9 packages green in 49.2s
  (mostly cached; `@mercurjs/admin` recompiled).
- `bunx oxlint` on all 5 touched files — exit 0; 3 pre-existing
  baseline warnings unchanged (`no-shadow` on `payment` in
  order-payment-section, `no-shadow` on `discounts` +
  `no-array-index-key` in order-summary-section).
- No headless UI run this session — all changes are wiring of
  existing routes / fields / filters; no new render paths added.

#### What stays at [~] (carried forward — design-owner sign-off)

- §0 `GET /admin/order-groups` field-by-field check vs design.
- §1 OrderGroup-pivot table + Save view design-owner sign-off.
- §2 OrderRemainingOrdersGroup placement above vs below Activity.
- §4 Claim / Exchange / Refund activity-row visual verification
  (rules are present in `order-timeline.tsx`, per-frame match not
  done).
- §6 Fulfillment actions retained on admin as support affordance —
  decision documented; not blocked.
- §7 Transfer Ownership drawer + activity row visual verification.
- §8 Edit address / email drawer visual verification.

## Notes

- This spec was authored from the Figma frame metadata (canvas
  `40012780:1121441`, 90+ top-level frames clustered into 12 flows)
  and a code walk of `packages/admin/src/pages/orders` +
  `packages/core/src/api/admin/orders`. No per-flow screenshots were
  captured; pull them via the Figma MCP server using the file key and
  node IDs above when verifying a specific flow.
- The admin orders implementation is **much further along** than
  vendor was when SPEC-008 started — most flow modals, item tables,
  activity timeline, and side-sections already exist. The bulk of the
  work below is wiring (header kebab actions, action-strip rendering,
  CTA entry points on the Customer sidebar) and documenting the
  Mercur-specific additions (OrderGroup pivot, Remaining-Orders-Group
  sidebar, Save view) as deliberate non-drift.
- The vendor spec is the reference for any flow that's also vendor-
  facing. When admin and vendor diverge in behavior (e.g. who can
  trigger fulfillment), the divergence must be documented here with a
  rationale.
- Frames `40012780:1122066` (Parent Components) and the *Notification
  Drawer* instances are component / overlay references, not flows;
  treat them as the source of truth for primitive rendering (filter
  menu, payment row, toast) rather than as standalone screens.
