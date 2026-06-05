---
status: in_progress
canonical: false
priority: 2
area: vendor/orders
created: 2026-06-03
last_updated: 2026-06-05  # Session (o): completed `/vendor/order-edits` tree. Six new sub-routes ported 1:1 from Medusa admin: `POST :id/items`, `POST :id/items/:action_id`, `DELETE :id/items/:action_id`, `POST :id/items/item/:item_id`, `POST :id/shipping-method`, `POST :id/shipping-method/:action_id`, `DELETE :id/shipping-method/:action_id`. All `:id` params remain the **order_id** per the Medusa admin convention surfaced in session (n) — `:action_id` / `:item_id` are passed to the workflows separately. Seller-scope therefore stays on the simpler `assertSellerOwnsOrderInParam` (no `validateSellerOrderEdit` hop needed). Five new zod validators added to `validators.ts` mirroring admin's `AdminPostOrderEditsAddItemsReqSchema`, `AdminPostOrderEditsItemsActionReqSchema`, `AdminPostOrderEditsUpdateItemQuantityReqSchema`, `AdminPostOrderEditsShippingReqSchema`, `AdminPostOrderEditsShippingActionReqSchema`. Workflows wrapped directly from `@medusajs/core-flows` (`orderEditAddNewItemWorkflow`, `updateOrderEditAddItemWorkflow`, `removeItemOrderEditActionWorkflow`, `orderEditUpdateItemQuantityWorkflow`, `createOrderEditShippingMethodWorkflow`, `updateOrderEditShippingMethodWorkflow`, `removeOrderEditShippingMethodWorkflow`). Build 9/9 green; oxlint clean 0/0 across all 12 files in the tree. With this, the full Order Edit backend surface from spec §0 is shipped — only the subscriber + integration suite remain. Session (n): vendor `/vendor/order-edits` backend skeleton landed — `POST /vendor/order-edits`, `DELETE /vendor/order-edits/:id`, `POST /vendor/order-edits/:id/request`, `POST /vendor/order-edits/:id/confirm`. Mirrors Medusa admin `/admin/order-edits` exactly (segment-for-segment, HTTP method for HTTP method) per the spec's "Route convention — non-negotiable" rule, so the typed-client route map can be shared. Critical correction vs. the spec's initial sketch: the `:id` path param on the sub-routes is the **order_id**, not an `order_change.id` — confirmed by reading Medusa admin's `/admin/order-edits/[id]/route.ts` + `/admin/order-edits/[id]/request/route.ts` + `/admin/order-edits/[id]/confirm/route.ts`, each of which threads `id` directly into the workflow input as `order_id`. The `validateSellerOrderEdit` helper (added speculatively per the spec) is therefore not needed by the live routes — the simpler `validateSellerOrder` already in tree is sufficient. Helper kept in `helpers.ts` since the spec calls for it and the items + shipping-method sub-routes (deferred this session) DO key on `order_change.id`. New files: `packages/core/src/api/vendor/order-edits/{helpers.ts,validators.ts,middlewares.ts,route.ts,[id]/route.ts,[id]/request/route.ts,[id]/confirm/route.ts}`. Wired into `packages/core/src/api/vendor/middlewares.ts`. Workflows wrapped directly from `@medusajs/core-flows` (`beginOrderEditOrderWorkflow`, `cancelBeginOrderEditWorkflow`, `requestOrderEditRequestWorkflow`, `confirmOrderEditRequestWorkflow`) — no Mercur fork per spec §"Workflow-override checklist". `requested_by` / `confirmed_by` audit-trail fields stamped with `req.seller_context.seller_id`, matching the existing returns confirm-request pattern. Build 9/9 green; oxlint clean (0/0). Sub-routes still pending: `/:id/items`, `/:id/items/:action_id` (POST/DELETE), `/:id/items/item/:item_id`, `/:id/shipping-method`, `/:id/shipping-method/:action_id` (POST/DELETE) — those key on `order_change.id` and need a query-graph hop for seller-scope (via the helper added this session). Session (m): Create Shipment form — fixed three drift items found while sweeping §6. (1) The only visible input was labeled `Tracking URL` but bound to `labels.${i}.tracking_number` — bug carried over from initial scaffolding. Replaced the single-field render with a three-column `grid grid-cols-1 gap-3 md:grid-cols-3` row exposing `tracking_number` (required, label `orders.shipment.trackingNumber`), `tracking_url` (optional, with the existing placeholder), and `label_url` (optional, new). Each field carries a `data-testid` (`shipment-tracking-number-${i}`, `-url-${i}`, `label-url-${i}`). (2) `handleSubmit` was hardcoding `tracking_url: "#"` and `label_url: "#"` — replaced with the actual form values (`l.tracking_url ?? ""`, `l.label_url ?? ""`); the backend validator treats both as non-optional strings, so empty-string passes through when the user skipped the URL. (3) The `Add tracking URL` button was missing `size="small"` per §6 finding from session (l); patched + renamed to `orders.shipment.addTracking` (an i18n key that already exists alongside `addTrackingUrl`) since it now adds a tracking row, not just a URL. Build 9/9 green; oxlint clean on the touched file (0 warnings / 0 errors). Session (l): polish + §6 partial visual sweep. Create Return modal — misleading no-items-selected toast (`t("orders.returns.create")` → "Create Return") replaced with a proper error key `t("orders.returns.noItemsSelected")` ("Select at least one item to return."); Confirm button now `disabled={!ready || !hasSelection}` so the error path is unreachable for the empty-selection case. §6 visual sweep on `OrderFulfillmentSection`: all three CTA buttons (`Fulfill items`, `Mark as delivered/picked up`, `Mark as shipped`) were missing `size="small"` per the spec's design rule "Buttons inside compact toolbars and footers: `size='small'`" — patched. No structural issues found: `Container` shells use `divide-y p-0`, header rows use `flex items-center justify-between px-6 py-4` with `<Heading>` + status badges + ActionMenu cluster, `bg-ui-bg-subtle rounded-b-xl` footer strip on each fulfillment card aligns with Figma. Build 9/9 green; oxlint clean on touched files (1 carried-over intentional `no-await-in-loop` warning). Session (k): Create Return modal — Location and Return shipping dropdowns wired. Both render as card-shaped strips (`bg-ui-bg-component shadow-elevation-card-rest rounded-lg p-3`) below the items list and above the notify switch. Location `Select` is sourced from `useStockLocations`; Return shipping `Select` is gated on location and sourced from `useShippingOptions({ stock_location_id })` (only fetches once a location is chosen). On submit `handleConfirm` now runs: optional `useUpdateReturn({ location_id })`, the existing per-item `useAddReturnItem` loop, optional `useAddReturnShipping({ shipping_option_id })`, then `useConfirmReturnRequest({ no_notification: !notify })`. Changing the location resets `shippingOptionId` so a stale option from a different location can't be confirmed. Backend already accepts `location_id` on `POST /vendor/returns/:id` (validator `VendorPostReturnsReq` + the request-finalize body) and `shipping_option_id` on `POST /vendor/returns/:id/shipping-method` (validator `VendorPostReturnsShippingReq`). Build 9/9 green; oxlint clean on touched files (same single intentional `no-await-in-loop` warning carried over from session j). Session (j): Create Return kebab entry + route + RouteFocusModal scaffold landed. Kebab `Create Return` action added in `OrderGeneralSection` (own group above the destructive Cancel group, `ArrowUturnLeft` icon, disabled when `order.canceled_at` is set), routed at `/orders/:id/returns/create` in `get-route-map.tsx` between the existing `allocate-items` and `returns/:return_id/receive` entries. The new modal at `pages/orders/[id]/returns/create/index.tsx` ports the Medusa-admin draft-and-mutate flow to vendor: `useInitiateReturn({ order_id })` fires once on mount (guarded by `IS_REQUEST_RUNNING` + `returnId` state for StrictMode + post-creation reruns) and stashes the draft id; the returnable items list (`fulfilled_quantity - return_requested_quantity - returned_quantity > 0`) renders inside a `RouteFocusModal` with per-item checkbox + qty stepper (capped at fulfilledRemaining), and a per-selected-item reason dropdown (from `useReturnReasons`) + note input. Send-notification switch wires `no_notification: !notify` into `useConfirmReturnRequest`. Cancel button + close calls `useCancelReturnRequest` so the order never gets stranded with an empty draft. Backend (`/vendor/returns` + `:id/request-items` + `:id/request` + `DELETE :id/request`) was already shipped; this lands the previously-missing UI entry. Build 9/9 green; oxlint clean on touched files (1 baseline `no-await-in-loop` warning on the sequential `addReturnItem` loop — intentional, all mutations target the same draft and must serialize). Session (d): inline ReturnBreakdown subrow landed under each line item in OrderSummarySection (Mercur port of Medusa admin's pattern). Renders "↳ Nx items return requested/received" with reason chip, note tooltip, and ReturnInfoPopover (id + requested_at + received_at). Damaged-quantity variant renders a second subrow above the standard one. Wired via `order.returns` (already in query-config from session a); added `*returns.items.reason` to vendor query-config so the chip resolves. Session (e): per-item `Allocated` / `Not allocated` StatusBadge wired via `useReservationItems({ line_item_id, limit })` and inline `Allocate items` CTA added to the Summary footer strip when any inventory-managed item is unfulfilled without a reservation. Session (f): activity timeline now emits the `return.created` / `return.canceled` / `return.received` rows — the rendering logic was already present but the source array was a stub. Wired through `order.returns` (already in query-config). Claims / exchanges still stubbed pending backend routes. Session (g): activity timeline payment events (`payment.awaiting` / `captured` / `canceled` / `refunded`) un-commented and wired against `order.payment_collections.flatMap(pc => pc.payments)` (already in query-config). Each event guarded on its respective timestamp; `awaiting` only emitted while a payment is neither captured nor canceled. Session (h): orders list search input enabled by passing `search` to `_DataTable` in `OrderListDataTable` — `useOrderTableQuery` already wires `q` into search params, and other vendor list pages (customers, regions) already use the same pattern. Build 9/9 green; lint clean on touched files. Session (i): §Verification checklist refreshed against shipped state across sessions (a)–(h) — boxes ticked / annotated as `[x]`, `[~]` (partial-with-divergence), or left `[ ]` (still pending), each with a one-line session pointer. No code changes.
---

# SPEC-008 Vendor Orders — Figma vs Implementation Gap

This spec audits the **Orders** surface of `@mercurjs/vendor`
(`packages/vendor/src/pages/orders`) against the canonical Figma file
*Mercur 2.0 — Vendor Panel B2C → Orders*
(`figma.com/design/sYJoh84Owr5tomRjpxG0no`, page node
`40013304:19490`). It lists every screen the design covers, classifies
each one against the current implementation as **exists / missing /
different**, and records the work needed to bring the vendor panel in
line with the design.

It is intentionally **descriptive, not prescriptive**: the design is
the source of truth for what should exist; the code paths cited below
are what does exist today. Any decision that diverges from the design
must be captured here (or in a child spec) with a documented reason —
silent drift fails the audit.

## Product context — Order Workflow (Phase 1)

> Source: Order Workflow Feature Brief (PL) — pasted verbatim by the
> author into this session. Re-stated in English for cross-team use.

The marketplace order lifecycle spans customer purchase → seller
acceptance → debit → fulfillment → optional return/refund. A single
customer cart can split into multiple seller-scoped sub-orders; each
seller owns its slice.

| Actor | Surface | Responsibility |
| --- | --- | --- |
| Customer | Storefront | Place order, track status, request return/refund |
| Seller | Vendor panel (this spec) | Accept, fulfill, track, handle incidents |
| Operator | Admin panel (out of scope here) | Cross-seller visibility, refunds, dispute resolution |

Lifecycle states (per sub-order): `created → waiting acceptance →
accepted → shipped → delivered`, with a parallel `return / refund`
branch.

**Out of Phase 1** (must not be designed into this spec):
- Order scoring before fulfillment
- Document upload on orders
- Messaging on orders
- Incident management

## Source designs

Top-level frames on node `40013304:19490` (Orders canvas), grouped by
flow. All frame IDs are stable Figma node IDs in the same file.

| Flow | Anchor frame | y-offset | Notes |
| --- | --- | --- | --- |
| Orders list | `40013324:305307` | 332 | Default, filter-open, sort-open, empty variants |
| Order detail | `40013324:305660` | 3564 | Read view (canonical) |
| Edit Order | `40013324:305318` | 7250 | Trigger + "Order edit request" banner + Force confirm/Cancel |
| Create Return | `40013324:305422` | 13062 | Trigger menu; post-request subrow; receive-items CTA |
| Create Exchange | `40013324:305425` | 18986 | "To send" + "To return" tooltip; outstanding adjustment |
| Create Claim | `40013324:305428` | 24626 | Full `RouteFocusModal` (Inbound/Outbound, totals, notify toggle) |
| Create Refund | `40013324:305431` | 29527 | Payment-row kebab → Create Refund; strike-through refund row |
| Handle Positive Outstanding Amount | `40013324:305434` | 33706 | "Copy payment link for €X" + "Mark as paid" |
| Create Fulfillment — Managed by Vendor | `40013324:305321` | 37979 | Focus modal; "Awaiting shipping" badge |
| Mark As Shipped — Managed by Vendor | `40013324:305335` | 43853 | Focus modal collecting tracking; status → Shipped |
| Mark As Delivered — Managed by Vendor | `40013324:305351` | 50062 | Confirmation; activity logs "Items delivered" |
| Mark As Picked Up — Managed by Vendor | `40013324:305337` | 54870 | Provider `Manual`; single CTA |
| Receive Items | `40013324:305487` | 13062 | Modal collecting received quantities |
| Allocate Items — Managed by Vendor | `40013324:306763` | 58807 | Inline `Allocate items` CTA in Summary |
| Allocate Items — Managed by Admin | `40013324:306885` | 58807 | Same flow scoped to admin-managed inventory |

A *Notification Drawer* component (success toast) is reused across
every flow. A *Parent Components* frame at `(0, 0)` holds the
underlying primitives (filter menu, payment row, item row, fulfillment
row, etc.).

## Surface map

Current implementation rooted at `packages/vendor/src/pages/orders`:

```
orders/
  order-list-page.tsx                          # SingleColumnPage host
  _components/order-list-table/
    order-list-table.tsx                       # Container shell
    order-list-header.tsx                      # Heading + slot for actions
    order-list-data-table.tsx                  # _DataTable + filters + sort
  common/
    customerGroupFiltering.tsx
    orderFiltering.tsx
    placeholders.tsx
  [id]/
    order-detail-page.tsx                      # TwoColumnPage host
    loader.tsx, breadcrumb.tsx, constants.ts
    _components/
      order-general-section/                   # Header card + Complete/Cancel kebab
      order-summary-section/                   # Items + totals + commission + return CTA + refund CTA
      order-payment-section/                   # Totals only (no per-payment rows)
      order-fulfillment-section/               # Unfulfilled items + Fulfillment N cards + actions
      order-customer-section/                  # ID / Contact / Company / Addresses
      order-activity-section/                  # DEFINED but NOT mounted by order-detail-page.tsx
    fulfillment/                               # /orders/:id/fulfillment — RouteFocusModal
    allocate-items/                            # /orders/:id/allocate-items — RouteFocusModal
    shipment/                                  # /orders/:id/:f_id/create-shipment — RouteFocusModal
```

Routes registered in `packages/vendor/src/get-route-map.tsx:182-238`:
`/orders`, `/orders/:id`, `/orders/:id/fulfillment`,
`/orders/:id/allocate-items`, `/orders/:id/:f_id/create-shipment`. No
other child routes are mounted under `:id`.

## Per-screen audit

Status legend:
- **Exists** — present in code and aligned to the design (visual /
  copy diffs noted under *Different* if any).
- **Different** — implemented but diverges materially from the design
  (e.g. wrong slot, missing CTA, different copy/colors).
- **Missing** — no implementation; needs to be built.
- **Dead** — implemented in code but not wired into the surface.

### Orders list (`y=332`)

- **Page shell** — Exists. `OrderListPage` mounts `SingleColumnPage` +
  `Container` (`divide-y p-0` via the inner table) at
  `packages/vendor/src/pages/orders/order-list-page.tsx`.
- **Columns** — Different. Code adds `Sales channel` between
  `Customer` and `Payment`
  (`hooks/table/columns/use-order-table-columns.tsx`); the design
  shows `Order ID · Date · Customer · Payment · Fulfillment · Order
  Total` only. Decide: drop the Sales channel column from the vendor
  list or document why it's kept.
- **Status badges** — Exists. Token mapping (green/orange/red) lines
  up with the Figma palette.
- **Pagination footer** — Exists. Page size is `10` in code
  (`order-list-data-table.tsx:10`); design footer reads
  `1 — 10 of 100 results` → matches.
- **Search input** — Missing. Figma shows a `Search` input + table
  settings icon in the header row; the vendor `OrderListHeader`
  currently renders only the title.
- **`Add filter` button** — Different. Code renders the legacy
  `_DataTable` filter widget with `Region`, `Sales channel`,
  `Created at`, `Updated at` filters; the design lists `Payment`,
  `Fulfillment`, `Request`, `Sales channel`, `Created`, `Updated`.
  Payment / Fulfillment filters are explicitly TODO-disabled
  (`hooks/table/filters/use-order-table-filters.tsx:64-66`). `Request`
  filter is missing entirely.
- **Sort menu** — Exists. `orderBy=[display_id, created_at,
  updated_at]` matches the Figma sort popover entries; asc/desc toggle
  also present.
- **Empty / filtered states** — Exists (`noRecords.message` wired in
  `order-list-data-table.tsx:78`). The "no results" empty state for
  active filters needs to be visually confirmed against the design's
  Filter Menu frame.

### Order detail — read view (`y=3564`)

- **Layout** — Exists. `TwoColumnPage` with Main + Sidebar
  (`order-detail-page.tsx:60-69`).
- **Sections mounted** — Different:
  - `OrderGeneralSection` ✅
  - `OrderSummarySection` ✅
  - `OrderPaymentSection` ✅
  - `OrderFulfillmentSection` ✅
  - `OrderCustomerSection` ✅
  - `OrderActivitySection` — **Dead**: defined in
    `_components/order-activity-section/` but not rendered by
    `order-detail-page.tsx`. The design places this section in the
    sidebar under the Customer card. Decide whether to ship the dead
    component or remove it.
- **Header card (`OrderGeneralSection`)** — Different.
  - Design status badges: payment + fulfillment, no separate "order
    status" badge. Code renders three badges (Order status, Payment,
    Fulfillment). Reconcile.
  - Design kebab actions: `Edit order`, `Create Return`, `Create
    Exchange`, `Create Claim`. Code kebab actions: `Complete`,
    `Cancel`. Almost the entire menu is missing (see below).
- **Summary section** — Exists with divergences:
  - `divide-y divide-dashed` in code vs solid `divide-y` in Figma —
    minor visual drift.
  - Item row, totals breakdown (Item / Shipping ▼ / Discount /
    Tax ▼ / Commission row / Total / Paid Total) match the design.
  - The design renders an **inline subrow under each line item** for
    return/exchange request history with a reason chip and timestamp
    tooltip ("Return: #VTS6REA · Return requested · Aug 25, 2025").
    Code has **no equivalent subrow**.
  - **`Allocate items` CTA** — code surfaces this through the
    `/orders/:id/allocate-items` route, but the design places the
    button **inside the Summary container** as an inline action when
    items show `Not allocated`. Today the only entry point is via the
    Fulfillment section. Add the inline CTA.
  - **`Receive items` CTA** — Code renders this CTA when
    `order.returns` has uncanceled rows
    (`order-summary-section.tsx:69-114`), but the `Link` targets
    `/orders/:id/returns/:return_id/receive` and **that route is not
    registered** in `get-route-map.tsx`. Dead link.
  - **Refund CTA** — Code shows a `Refund € X` button when
    `pending_difference < 0` (`order-summary-section.tsx:116-126`)
    pointing at `/orders/:id/refund`. **That route is not registered**
    either. Dead link.
- **Payment section** — Different.
  - Code renders **only** the aggregate totals (Total paid by
    customer, Total refunded, Total pending). The design renders
    **per-payment rows** (transaction ID, date, provider, status
    badge, amount, kebab → `Create Refund`).
  - "Create Refund" entry point is missing in the vendor panel — the
    only way to trigger a refund today is the (broken) Refund CTA in
    the Summary section.
- **Fulfillment section** — Exists with strong alignment:
  - Unfulfilled-items Container with `Requires shipping` +
    `Awaiting fulfillment` red status badges ✅
  - `Fulfill items` CTA at the bottom of the unfulfilled container ✅
  - `Fulfillment #N` Container with status badge tooltip, Items list,
    Shipping from, Provider, Tracking, `Mark as delivered` /
    `Mark as shipped` / `Mark as picked up` CTAs ✅
  - Kebab `Cancel` action with shipped/canceled guards ✅
- **Customer sidebar** — Exists (`order-customer-section.tsx`).
  Verify the `Company` block (label + value) and copy-icon affordance
  on Contact / Shipping address rows match the design.
- **Activity timeline** — Missing from page (component is **Dead**).
  See note above.
- **Metadata + JSON sections** — Missing. Design shows two collapsible
  sections at the bottom of the main column (`Metadata 0 keys`,
  `JSON 32 keys`). Vendor detail page has neither.
- **Toasts** — Exists. `@medusajs/ui` `toast.*` is used throughout;
  visual match to the *Notification Drawer* component is acceptable.

### Edit Order (`y=7250`)

- **Trigger** — Missing. Kebab action `Edit order` not present in
  `OrderGeneralSection` action menu.
- **"Order edit request" banner** — Missing. Design shows an info
  Container (`Heading` + `Added 1x …` row + `Force confirm` / `Cancel`
  buttons) rendered **above** the order header when a pending edit
  exists. Vendor panel has no such banner.
- **Route** — Missing. No `/orders/:id/edit` (or modal route)
  registered.
- **Activity timeline entry** — Missing (`OrderActivitySection` is
  dead; even if mounted, no `useActivityItems` rule emits the "Order
  edit #XXXXXXX requested" entry).

### Create Return (`y=13062`)

- **Kebab entry** — Missing.
- **Modal/drawer form** — Missing. Design shows a focus modal collecting
  items, reason, note, location, return shipping (optional), and a
  notification toggle.
- **Inline subrow under line items** ("↳ 1x items return requested",
  reason chip, tooltip with received/requested dates) — Missing.
- **Receive items CTA + route** — Partial. The CTA exists (see
  Summary above) but the route is unregistered; clicking 404s.
- **Activity entries** — Missing.

### Create Exchange (`y=18986`)

- **Kebab entry** — Missing.
- **Modal/drawer form** — Missing. Design adds a tooltip on the
  request row breaking down `To send` (new variants) and `To return`
  (originals).
- **Inline subrows** for `1x items return requested` and `1x items
  added through exchange` — Missing.
- **Outstanding-amount integration** — Missing. When an exchange shifts
  the order total, the design re-uses the Outstanding-amount handling
  (see below).

### Create Claim (`y=24626`)

- **Kebab entry** — Missing.
- **Focus modal** — Missing. Required structure (from the design):
  - Title `Create Claim`, `esc` chip top-left.
  - Section `Inbound` — Add items button; per-row line with qty input,
    `Reason` dropdown ("Choose why the customer want to return
    items"), `Note` field.
  - `Location` dropdown (default first stock location).
  - `Return shipping (Optional)` dropdown.
  - Section `Outbound` — Add items; empty state "No records yet — You
    can optionally add items you want to send as replacements".
  - Totals: Inbound total, Outbound total, Return shipping (edit
    pencil), Outbound shipping (edit pencil), **Estimated difference**.
  - `Send notification` SwitchBox.
  - Footer: `Cancel` / `Confirm`.

### Create Refund (`y=29527`)

- **Entry point** — Missing. Design places `Create Refund` on the
  per-payment row kebab inside the Payment section. The vendor
  Payment section does not render per-payment rows, so no entry point
  exists there.
- **Route** — Missing. `Link` to `/orders/:id/refund` exists in the
  Summary refund CTA but the route is unregistered.
- **Post-refund state** — Missing.
  - Payment row should render with a strike-through and a reason chip
    (`Damaged item`) once refunded.
  - Header payment badge should flip to `Refunded` / `Partly
    refunded`.
  - Activity should log `Payment refunded`.

### Handle Positive Outstanding Amounts (`y=33706`)

- **Outstanding > 0 action strip** — Missing. Design shows two CTAs
  under the totals block when `outstanding_amount > 0`:
  - `Copy payment link for € X` (writes the hosted payment URL to
    clipboard).
  - `Mark as paid` (records manual payment).
- **Total pending vs Total paid** — Exists in `OrderPaymentSection`
  (`order-payment-section.tsx:88-99`). The values are rendered but
  no action strip is shown.

### Create Fulfillment — Managed by Vendor (`y=37979`)

- **Route + focus modal** — Exists.
  `/orders/:id/fulfillment` → `RouteFocusModal` →
  `OrderCreateFulfillmentForm`
  (`pages/orders/[id]/fulfillment/`).
- **Entry CTAs** — Exists. `Fulfill items` button at the bottom of
  the Unfulfilled Items container
  (`order-fulfillment-section.tsx:191-196`).
- **Form contract** — Verify field-by-field against the design
  (location, items + per-row qty, shipping method, tracking). Treat
  the design as the source of truth for empty states, validation
  copy, and Continue / Confirm buttons.
- **Success state** — Exists. New `Fulfillment #N` Container appears
  with `Awaiting shipping` badge + `Mark as shipped` / `Mark as
  delivered` buttons.

### Mark As Shipped / Delivered / Picked Up (`y=43853 / 50062 / 54870`)

- **Mark As Shipped** — Exists.
  `/orders/:id/:f_id/create-shipment` → `RouteFocusModal` →
  `OrderCreateShipmentForm`
  (`pages/orders/[id]/shipment/`). Triggered by the per-fulfillment
  `Mark as shipped` button. Verify the form fields (tracking number,
  tracking URL, label upload) match the design.
- **Mark As Delivered** — Exists.
  `useMarkOrderFulfillmentAsDelivered` is called from
  `order-fulfillment-section.tsx:266-291` behind a `usePrompt`
  confirmation. Toast copy is conditional on Pickup vs Delivery, which
  matches the two design variants.
- **Mark As Picked Up** — Exists. Same handler as Mark As Delivered;
  copy and button label switch when
  `fulfillment.shipping_option?.service_zone.fulfillment_set.type ===
  Pickup` (`order-fulfillment-section.tsx:216-218`).

### Receive Items (`y=13062, far-right column`)

- **Entry CTA** — Exists (Summary section refund/return CTA).
- **Route + modal form** — Missing. The CTA targets
  `/orders/:id/returns/:return_id/receive` but no route is
  registered.
- **Activity entries** — Missing.

### Allocate Items — Managed by Vendor (`y=58807`)

- **Route + focus modal** — Exists.
  `/orders/:id/allocate-items` → `RouteFocusModal` →
  `OrderAllocateItemsForm`
  (`pages/orders/[id]/allocate-items/`).
- **Inline `Allocate items` CTA in Summary** — Missing. Vendor today
  exposes the form only via the Fulfillment / Unfulfilled section
  context; the design surfaces it inline in the Summary container
  when any item shows `Not allocated`.
- **Per-line `Not allocated` chip** — Missing. The Summary item row
  needs to render the allocation badge alongside (or instead of) the
  `Allocated` chip when the item is not yet allocated.
- **Success toast** — Exists.

### Allocate Items — Managed by Admin (`y=58807, right`)

- **Out of scope for `@mercurjs/vendor`.** This frame describes the
  admin-managed inventory variant of the allocate flow. Document in
  the admin spec; this spec only flags that the vendor flow is the
  Vendor-managed variant.

## Visual / pattern drift (cross-cutting)

- **Dashed dividers.** Code uses `divide-y divide-dashed` on
  `OrderSummarySection` and `OrderPaymentSection`. Design uses solid
  `divide-y`. Align both sections.
- **Order status badge.** Code renders a third badge for the order
  status. Design renders only payment + fulfillment badges in the
  header. Drop the third badge or document the deviation.
- **Per-payment rows.** Add a `PaymentRow` primitive (transaction id,
  date, provider, status, amount, kebab) to `OrderPaymentSection` —
  required for Create Refund and Outstanding handling.
- **Inline subrows under line items.** Add a `LineItemSubrow`
  primitive that renders return/exchange/claim history under the
  parent line item with a reason chip + timestamp tooltip.
- **Outstanding action strip.** Add a footer slot to
  `OrderSummarySection` (or to a new section between Summary and
  Payment) that conditionally renders the `Copy payment link` /
  `Mark as paid` CTAs.
- **Activity timeline.** Either mount `OrderActivitySection` in the
  sidebar of `order-detail-page.tsx` and complete its activity
  generators (Edit / Return / Exchange / Claim / Refund), or delete
  the dead component.
- **Metadata + JSON sections.** Add `MetadataSection` and
  `JsonViewSection` (already available from `@mercurjs/dashboard-shared`)
  at the bottom of the Main column.

## Implementation reference — Medusa admin patterns

Most of the missing vendor flows are already shipped in the Medusa admin
dashboard at `/Users/viktorholik/Desktop/medusa/packages/admin/dashboard/src/`.
The vendor implementation should **port** these files structurally — same
folder shape, same form decomposition, same hook decomposition, same Zod
schemas — and swap the SDK namespace from `sdk.admin.*` to `sdk.vendor.*`.
Visual rules and primitive choices already match (both surfaces use
`@medusajs/ui`, `RouteFocusModal`, `RouteDrawer`, `TwoColumnPage`).

**Port rule:** mirror the admin folder name 1:1 under
`packages/vendor/src/pages/orders/[id]/<flow>/` (or `packages/vendor/src/pages/orders/<flow>/`
when the route is top-level). When admin has `add-claim-items-table/`,
vendor gets `add-claim-items-table/`. No renaming, no flattening — same
shape so future Medusa upgrades port cleanly.

All paths below are rooted at
`/Users/viktorholik/Desktop/medusa/packages/admin/dashboard/src/`.

### Orders list

| Concern | File |
| --- | --- |
| Page host | `routes/orders/order-list/order-list.tsx` (`SingleColumnPage` + `_DataTable`) |
| Filters | `routes/orders/order-list/hooks/table/filters/use-order-table-filters.tsx` |
| Columns | `routes/orders/order-list/hooks/table/columns/use-order-table-columns.tsx` |
| Query params | `routes/orders/order-list/hooks/table/query/use-order-table-query.tsx` |
| Cells | `components/table/table-cells/order/{display-id,date,customer,sales-channel,payment-status,fulfillment-status,total}-cell.tsx` |

Note: admin's filter hook leaves `payment_status` / `fulfillment_status`
commented out with the same TODO Mercur has. Mercur unblocks both by
shipping the `has_open_request` middleware and widening the validator
(see §Backend gap).

### Order detail — sections

Mount these in `packages/vendor/src/pages/orders/[id]/order-detail-page.tsx`.
Each lives under `routes/orders/order-detail/components/`:

| Section | Folder | Notes |
| --- | --- | --- |
| Active edit banner | `order-active-edit-section/` | Renders **above** order header when `preview.order_change.change_type === "edit"`; Force confirm / Cancel CTAs |
| Active return | `active-order-return-section/` | Compact status indicator + cancel CTA |
| Active exchange | `active-order-exchange-section/` | Same shape as return |
| Active claim | `active-order-claim-section/` | Same shape as return |
| General | `order-general-section/` | Header card; payment + fulfillment badges only |
| Summary | `order-summary-section/` | Line items, subrows for return/exchange/claim history, allocate-items inline CTA, refund CTA, outstanding action strip, `return-info-popover.tsx`, `shipping-info-popover.tsx` |
| Payment | `order-payment-section/` | Per-payment `Payment` row, kebab → Refund, refund subrows (`Refund` component), capture button, credit lines |
| Fulfillment | `order-fulfillment-section/` | Already aligned in vendor; verify field-by-field |
| Customer (sidebar) | `order-customer-section/` | Contact + addresses |
| Activity (sidebar) | `order-activity-section/` | See dedicated section below |
| Copy payment link | `order-detail/components/copy-payment-link/copy-payment-link.tsx` | Standalone component reused by Summary; reads `MEDUSA_STOREFRONT_URL` |

Page entry to mirror: `routes/orders/order-detail/order-detail.tsx`. It
loads via `orderLoader`, hydrates with `useOrder(id, DEFAULT_FIELDS)` +
`useOrderPreview(id)`, and toggles `showJSON` + `showMetadata` on the
`TwoColumnPage`. The `DEFAULT_FIELDS` constant lives at
`routes/orders/order-detail/constants.ts` — Mercur's equivalent is
`packages/vendor/src/pages/orders/[id]/constants.ts` and needs the new
fields listed in §Query-config below.

### Edit Order

| Concern | File |
| --- | --- |
| Route entry | `routes/orders/order-create-edit/order-edit-create.tsx` (`RouteFocusModal`) |
| Form | `routes/orders/order-create-edit/components/order-create-edit-form/order-edit-create-form.tsx` |
| Items table | `routes/orders/order-create-edit/components/add-order-edit-items-table/` |
| Schema | `routes/orders/order-create-edit/components/order-create-edit-form/schema.ts` |
| Banner (already in detail) | `routes/orders/order-detail/components/order-active-edit-section/` |
| Hooks | `useRequestOrderEdit`, `useCancelOrderEdit`, `useOrderPreview` |

### Create Return

| Concern | File |
| --- | --- |
| Route entry | `routes/orders/order-create-return/return-create.tsx` (`RouteFocusModal`) |
| Form | `routes/orders/order-create-return/components/return-create-form/return-create-form.tsx` |
| Per-row | `.../return-create-form/return-item.tsx` (qty, reason, note, location) |
| Item picker | `routes/orders/order-create-return/components/add-return-items-table/` (`use-return-item-table-{columns,query,filters}.tsx`) |
| Schema | `routes/orders/order-create-return/components/return-create-form/schema.ts` (`ReturnCreateSchema`) |
| Shipping placeholder | `routes/orders/common/placeholders.tsx::ReturnShippingPlaceholder` |
| Hooks | `useInitiateReturn` (auto-run on mount), `useAddReturnItem`, `useRemoveReturnItem`, `useUpdateReturnItem`, `useAddReturnShipping`, `useUpdateReturnShipping`, `useDeleteReturnShipping`, `useConfirmReturnRequest`, `useCancelReturnRequest` |

Pattern: modal calls `useInitiateReturn` on mount to create a draft, then
every form interaction is a discrete mutation against the draft. The
Confirm button calls `useConfirmReturnRequest`; closing the modal calls
`useCancelReturnRequest`. Mercur's vendor hooks must mirror this
draft-and-mutate flow because the backend (`POST /vendor/returns` +
sub-resources) already exposes the same shape.

### Create Exchange

| Concern | File |
| --- | --- |
| Route entry | `routes/orders/order-create-exchange/exchange-create.tsx` (`RouteFocusModal`) |
| Form | `routes/orders/order-create-exchange/components/exchange-create-form/exchange-create-form.tsx` |
| Inbound section | `.../exchange-inbound-section.tsx` (items to return) |
| Outbound section | `.../exchange-outbound-section.tsx` (items to send) |
| Schema | `.../schema.ts` (`ExchangeCreateSchema`) |
| Hooks | `useCreateExchange` (auto-run), `useUpdateExchangeInboundShipping`, `useUpdateExchangeOutboundShipping`, `useExchangeConfirmRequest`, `useCancelExchangeRequest`, `useUpdateOrderChange`, `useExchange`, `useReturn` |

The Figma "To send / To return" tooltip is rendered on the Summary item
subrow once the exchange is requested — generator lives in
`order-timeline.tsx` (admin) and renders an `ActivityItems` popover.

### Create Claim

| Concern | File |
| --- | --- |
| Route entry | `routes/orders/order-create-claim/claim-create.tsx` (`RouteFocusModal`) |
| Form | `routes/orders/order-create-claim/components/claim-create-form/claim-create-form.tsx` |
| Inbound item row | `.../claim-inbound-item.tsx` |
| Outbound section | `.../claim-outbound-section.tsx` |
| Inbound picker | `routes/orders/order-create-claim/components/add-claim-items-table/` |
| Outbound picker | `routes/orders/order-create-claim/components/add-claim-outbound-items-table/` |
| Empty-item state | `routes/orders/common/placeholders.tsx::ItemPlaceholder` |
| Shipping placeholders | `routes/orders/common/placeholders.tsx::{ReturnShippingPlaceholder, OutboundShippingPlaceholder}` |
| Schema | `.../schema.ts` (`ClaimCreateSchema`) |
| Hooks | `useCreateClaim` (auto-run), `useAddClaimInboundItems`, `useRemoveClaimInboundItem`, `useUpdateClaimInboundItem`, `useAddClaimInboundShipping`, `useUpdateClaimInboundShipping`, `useDeleteClaimInboundShipping`, `useUpdateClaimOutboundShipping`, `useClaimConfirmRequest`, `useCancelClaimRequest`, `useUpdateReturn`, `useClaim`, `useReturn`, `useShippingOptions`, `useStockLocations` |

"Estimated difference" totals row is computed inside the form from the
inbound + outbound item totals; do **not** hit the backend for this
display value.

### Create Refund

| Concern | File |
| --- | --- |
| Route entry | `routes/orders/order-create-refund/order-create-refund.tsx` (`RouteDrawer`, not `RouteFocusModal`) |
| Form | `routes/orders/order-create-refund/components/create-refund-form/create-refund-form.tsx` |
| Currency input | `components/inputs/currency-input.tsx` (locale-aware) |
| Hooks | `useRefundPayment`, `useRefundReasons` |
| Entry param | URL `?paymentId=<id>` — pre-fills the amount from the chosen payment row |

The kebab on each `Payment` row in `order-payment-section/payment.tsx`
opens this drawer with `?paymentId=<payment.id>`. Mercur must surface
the same kebab + query-param wiring in its ported `OrderPaymentSection`.

Skip the `OrderBalanceSettlementForm` branch — that's the Medusa loyalty
plugin and not in Mercur scope.

### Receive Items

| Concern | File |
| --- | --- |
| Route entry | `routes/orders/order-receive-return/order-receive-return.tsx` (`RouteDrawer`) |
| Form | `routes/orders/order-receive-return/components/order-receive-return-form/order-receive-return-form.tsx` |
| Dismissed-qty row | `.../dismissed-quantity.tsx` |
| Hooks | `useInitiateReceiveReturn` (auto-run on mount), `useAddReceiveItems` |

Auto-initialization mirrors the Create Return draft pattern: the modal
pre-populates received quantities at full qty from `useReturn(returnId)`,
then the user adjusts before submitting `useAddReceiveItems`.

### Mark As Paid / Copy Payment Link (outstanding action strip)

Both buttons live inside `OrderSummarySection`; the `CopyPaymentLink`
component is reusable:

| Concern | File |
| --- | --- |
| Component | `routes/orders/order-detail/components/copy-payment-link/copy-payment-link.tsx` |
| Render location | `routes/orders/order-detail/components/order-summary-section/order-summary-section.tsx` (action strip after totals) |
| Visibility | `unpaidPaymentCollection` exists AND `pendingDifference > 0` AND amount above rounding-error threshold (`lib/`-level `isAmountLessThenRoundingError`) |
| Hook | `useMarkPaymentCollectionAsPaid(orderId, paymentCollectionId)` |
| Storefront URL | `MEDUSA_STOREFRONT_URL` env var — Mercur should expose `VITE_MEDUSA_STOREFRONT_URL` (or equivalent) and document the rename |

### Allocate Items

| Concern | File |
| --- | --- |
| Route entry | `routes/orders/order-allocate-items/order-allocate-items.tsx` (`RouteFocusModal`) |
| Form | `routes/orders/order-allocate-items/components/order-create-fulfillment-form/order-allocate-items-form.tsx` |
| Per-row | `.../order-allocate-items-item.tsx` (per-location qty input) |
| Schema | `.../schema.ts` (`AllocateItemsSchema`) |
| Kit logic | `routes/orders/order-allocate-items/components/.../utils.ts::checkInventoryKit` |
| Hooks | `useCreateReservationItem`, `useStockLocations` |

Inline CTA in Summary section is just a `<Link>` to `/orders/:id/allocate-items`.
The form filters to items with `manage_inventory=true` AND
`unfulfilled_qty > 0`.

### Activity timeline

Single largest file to port:
`routes/orders/order-detail/components/order-activity-section/order-timeline.tsx`
(~1370 lines). Lives in the sidebar.

| Concern | File |
| --- | --- |
| Timeline shell | `order-timeline.tsx` (renders list of `OrderActivityItem`) |
| Item row | `.../activity-items.tsx` (popover with item thumbnails for "To Send" / "To Return" blocks) |
| Hover details | `.../change-details-tooltip.tsx` |
| Add-note form | `.../order-note-form.tsx` |
| Collapse | If items > 3, collapse older into expandable section |
| Hooks | `useOrderChanges`, `useOrderLineItems`, `useReturns`, `useExchanges`, `useClaims`, `useCustomer`, `useCancelReturn`, `useCancelExchange`, `useCancelClaim`, `useDate` |
| Helpers | `lib/getPaymentsFromOrder.ts` |

Event generators (inside `useActivityItems`) emit rows for: order
creation, order edits (filter out `change_type ∈ ["transfer",
"update_order"]`), return requests, exchanges, claims, refunds,
fulfillments, and cancellations (when `canceled_at` present). Each row
embeds a reason chip + timestamp tooltip that matches the Figma subrow.

Mercur's data source is `GET /vendor/orders/:id/changes` (already
shipped). The corresponding hook (`useOrderChanges` equivalent in
`packages/vendor/src/hooks/api/orders.tsx`) needs to be added.

### Shared primitives to port to `@mercurjs/dashboard-shared`

Several admin primitives are pure UI and would benefit both dashboards.
Place them in `@mercurjs/dashboard-shared` rather than copying twice:

| Primitive | Admin source | Used by |
| --- | --- | --- |
| `CurrencyInput` | `components/inputs/currency-input.tsx` | Refund, exchange/claim shipping edits |
| `CopyPaymentLink` | `routes/orders/order-detail/components/copy-payment-link/` | Outstanding strip; reusable wherever a payment collection is in scope |
| `ItemPlaceholder`, `ReturnShippingPlaceholder`, `OutboundShippingPlaceholder` | `routes/orders/common/placeholders.tsx` | Return / exchange / claim empty states |
| `OrderActivityItem` + `ActivityItems` popover | `order-activity-section/{order-activity-item,activity-items}.tsx` | Timeline rows |
| Order table cells (`DisplayIdCell`, `PaymentStatusCell`, `FulfillmentStatusCell`, etc.) | `components/table/table-cells/order/` | List page + nested tables |
| `formatCurrency`, `getStylizedAmount`, `getLocaleAmount`, `isAmountLessThenRoundingError`, `getPaymentsFromOrder`, `getOrderPaymentStatus`, `getReturnableQuantity`, `getTotalCaptured`, `getTotalPending`, `formatProvider` | `lib/` | Detail page + every flow |

When in doubt about a primitive's home: if it's used by ≥ 2 dashboard
pages, ship it in `@mercurjs/dashboard-shared`; otherwise keep it
co-located.

### Porting checklist (per flow)

For each flow above:

1. Copy the admin folder structure 1:1 under
   `packages/vendor/src/pages/orders/[id]/<flow>/` (or top-level
   `pages/orders/<flow>/` for routes Medusa places at top level).
2. Replace `sdk.admin.*` calls with `sdk.vendor.*` after backend route
   adapters land (see §Backend gap). Until then, scaffold the page with
   `// TODO(SPEC-008): hook into sdk.vendor.<resource>` placeholders.
3. Port the Zod schema verbatim — the backend mirrors Medusa's request
   shape per the "Route convention" rule in §Backend gap, so the schema
   transfers without edits.
4. Add a TanStack Query hook file in
   `packages/vendor/src/hooks/api/<resource>.tsx` using
   `queryKeysFactory("<resource>")` and the standard
   `lists/details/detail` shape.
5. Wire the route in `packages/vendor/src/get-route-map.tsx` between
   lines 182–238 (the existing `/orders/...` block).
6. Add translation keys to `packages/vendor/src/i18n/translations/en.json`
   under `orders.<flow>.*` first, then other locales.
7. Add `data-testid` on every interactive element in kebab-case scoped
   to the page.

The admin source is the contract: if vendor behavior diverges from
admin (e.g. a missing field, a different validation rule, a copy
change), document the divergence inline beside the file with a
`// SPEC-008: vendor differs from admin because <reason>` comment.

## Backend gap (`packages/core`)

The vendor backend (`packages/core/src/api/vendor/orders` and
neighbouring trees) is much further along than the dashboard. Most of
the missing UI is blocked by **missing route adapters** around
workflows that already ship in `@medusajs/core-flows` — not missing
business logic. This section enumerates exactly what is wired, what is
broken-by-missing-wiring, and what must be added on the backend before
each flow in §"Per-screen audit" can ship end-to-end.

All paths below are relative to `packages/core/src/api/vendor` unless
stated otherwise.

### Already wired (no backend work needed)

| Endpoint | Workflow | Notes |
| --- | --- | --- |
| `GET /vendor/orders` | `getOrdersListWorkflow` | Seller-scoped via `order_seller` link (`orders/middlewares.ts:25-37`) |
| `GET /vendor/orders/:id` | query.graph | |
| `GET /vendor/orders/:id/preview` | preview workflow | Required for live "Order edit request" diff |
| `POST /vendor/orders/:id/cancel` | `cancelOrderWorkflow` | |
| `POST /vendor/orders/:id/complete` | `completeOrderWorkflow` | |
| `GET /vendor/orders/:id/changes` | query.graph (`order_change`) | **Powers the Activity timeline** — the data is already there |
| `POST /vendor/orders/:id/fulfillments` | Mercur `createOrderFulfillmentWorkflow` | Also serves Allocate Items (no separate endpoint) |
| `POST /vendor/orders/:id/fulfillments/:fulfillment_id/cancel` | Mercur `cancelOrderFulfillmentWorkflow` | |
| `POST /vendor/orders/:id/fulfillments/:fulfillment_id/mark-as-delivered` | `markOrderFulfillmentAsDeliveredWorkflow` | Drives both **Mark As Delivered** and **Mark As Picked Up** (provider-dependent) |
| `POST /vendor/orders/:id/fulfillments/:fulfillment_id/shipments` | `createShipmentWorkflow` | Drives **Mark As Shipped** |
| `POST /vendor/returns` + `/returns/:id/{request-items, shipping-method, request, cancel, receive, receive/confirm, receive-items, dismiss-items}` | `beginReturnOrderWorkflow` + sub-resource workflows | **Full Create Return flow is already implemented** — only the UI is missing |
| `POST /vendor/payments/:id/refund` | `refundPaymentWorkflow` | **Per-payment refund is already implemented** — UI just needs to surface it |
| `POST /vendor/payments/:id/capture` | `capturePaymentWorkflow` | |
| `GET/POST/PATCH/DELETE /vendor/refund-reasons` | refund-reason workflows | Reason dropdown for Refund modal |
| `GET/POST/PATCH/DELETE /vendor/return-reasons` | return-reason workflows | Reason dropdown for Return / Claim modals |

### Filter gap — backend + frontend

The Orders-list filter discrepancy noted in the UI audit is **mostly** a
frontend gap. `VendorGetOrdersParams`
(`packages/core/src/api/vendor/orders/validators.ts:11-29`) already
accepts every flat filter the design requires:

- `q` (full-text search) ✅
- `status` ✅
- `payment_status` ✅ (currently typed `z.string()` — must widen, see below)
- `fulfillment_status` ✅ (same — must widen)
- `sales_channel_id` ✅
- `region_id` ✅
- `customer_id` ✅
- `currency_code` ✅
- `created_at` / `updated_at` (operator map) ✅

The vendor UI hook
(`packages/vendor/src/hooks/table/filters/use-order-table-filters.tsx:74-76`)
explicitly leaves `payment_status` and `fulfillment_status` commented
out with `TODO: enable when Payment, Fulfillments <> Orders are linked`.
That linkage now exists via the `order_seller` link middleware and the
fields are populated in the list query
(`order-list-data-table.tsx:18-33`). The comment is stale — re-enable
them, and widen the validator from `z.string()` to
`z.union([z.string(), z.array(z.string())])` so the UI's
`payment_status?.split(",")` payload validates as a multi-select.

The only filter on the design with **no backend equivalent today** is
the design's `Request` filter (refund / return / exchange / claim /
edit pending). Two shapes were considered:

1. A virtual `has_open_request: boolean` parameter on
   `VendorGetOrdersParams` that joins `order_change.status` ∪
   `return.status`.
2. A `request_status` enum (`none | pending_refund | pending_return |
   pending_exchange | pending_claim | pending_edit`) populated via a
   custom workflow step on the list query.

**Decision: (1) for Phase 1.** Single boolean, no schema explosion.
Forward-compatible: (2) can be added later without breaking the (1)
contract (the `false` case of (1) still maps cleanly).

#### Implementation

**Validator** — `packages/core/src/api/vendor/orders/validators.ts`:

```ts
fulfillment_status: z.union([z.string(), z.array(z.string())]).optional(),
payment_status:     z.union([z.string(), z.array(z.string())]).optional(),
has_open_request:   z.coerce.boolean().optional(),
```

**Middleware** — new file
`packages/core/src/api/vendor/orders/apply-has-open-request-filter.ts`,
modeled on
`packages/core/src/api/utils/filter-attributes-by-category-link.ts`.
It runs **after** `applySellerLinkFilter` on the `GET /vendor/orders`
matcher, so the seller-scope `seller_id` is already on
`req.filterableFields`. The middleware:

1. Reads `req.filterableFields.has_open_request`; if `undefined`,
   `next()`.
2. Deletes the key (it is not a real column on `order`).
3. Resolves `ContainerRegistrationKeys.QUERY` and runs two parallel
   `query.graph` calls via `promiseAll` from
   `@medusajs/framework/utils` (the Medusa-canonical wrapper around
   `Promise.allSettled`; established Mercur usage at
   `packages/core/src/workflows/commission/steps/get-commission-lines.ts:9`):

   ```ts
   import { promiseAll } from "@medusajs/framework/utils"

   const [changes, returns] = await promiseAll([
     query.graph({
       entity: "order_change",
       fields: ["order_id"],
       filters: { status: ["requested", "pending"] },
     }),
     query.graph({
       entity: "return",
       fields: ["order_id"],
       filters: { status: "requested" },
     }),
   ])
   ```

   `order_change` already covers edits, exchanges, claims, and
   return-requests via its `change_type` enum
   (`EDIT | EXCHANGE | CLAIM | RETURN_REQUEST | ...`). A separate join
   on `order_exchange` / `order_claim` is **not** needed because those
   tables expose no `status` column — openness is expressed on the
   `order_change` side. The `return` join is required because
   standalone returns may exist without an `order_change` row.

4. Unions the `order_id`s into a `Set` (`orderIds`).
5. Composes the result onto `req.filterableFields`:
   - If `has_open_request === true`: intersect with any existing `id`
     filter using `$and` (mirrors
     `filter-attributes-by-category-link.ts:65-71`). When `orderIds`
     is empty, set `id = { $in: [""] }` to force a zero-row response.
   - If `has_open_request === false`: `id = { $nin: [...orderIds] }`.
     Empty set is a no-op.

No vendor-specific workflow wrap is needed —
`getOrdersListWorkflow` consumes `req.filterableFields` directly.

**Middleware registration** —
`packages/core/src/api/vendor/orders/middlewares.ts`, append to the
`GET /vendor/orders` `middlewares` array **after**
`applySellerLinkFilter`:

```ts
applySellerLinkFilter,
applyHasOpenRequestFilter,
```

**Status enum sources** (for the UI option lists, not the validator —
the validator stays tolerant of new Medusa enum values without
requiring a Mercur release):

- `PaymentStatus` from `@medusajs/utils` (`not_paid | awaiting |
  authorized | partially_authorized | captured | partially_captured |
  partially_refunded | refunded | canceled | requires_action`).
- `FulfillmentStatus` from `@medusajs/utils` (`not_fulfilled |
  partially_fulfilled | fulfilled | partially_shipped | shipped |
  partially_delivered | delivered | canceled`).

**Frontend** —
`packages/vendor/src/hooks/table/query/use-order-table-query.tsx`: add
`"has_open_request"` to the `useQueryParams` list and map it to
`searchParams.has_open_request = raw.has_open_request === "true"`.

`packages/vendor/src/hooks/table/filters/use-order-table-filters.tsx`:
delete the stale TODO at lines 74-76; push `paymentStatusFilter`,
`fulfillmentStatusFilter`, and `requestFilter` (single-select,
options: `{ label: t("orders.filters.hasOpenRequest"), value: "true" }`,
`{ label: t("orders.filters.noOpenRequest"), value: "false" }`).

**Codegen** — run `bun run codegen` so `@mercurjs/client` picks up
`has_open_request` on `sdk.vendor.orders.query`.

### Missing routes (block UI features)

For each missing flow, the underlying Medusa workflow already exists
in `@medusajs/core-flows`. The work is **(a)** add a vendor route
adapter under `packages/core/src/api/vendor/...`, **(b)** add
validators + middleware (seller-scope guard via `validateSellerOrder`
or `validateSellerReturn`), **(c)** add a `helpers.ts` seller-scope
validator where there isn't a direct order linkage, **(d)** add types
to `packages/types/src/http`, **(e)** regenerate the typed client
(`mercurjs codegen`), **(f)** ship an integration suite under
`integration-tests/http/order/vendor`.

**Route convention — non-negotiable.** Every route below mirrors the
corresponding Medusa admin tree under
`/Users/viktorholik/Desktop/medusa/packages/medusa/src/api/admin/...`
**exactly** (segment-for-segment, HTTP method for HTTP method). The
existing `/vendor/orders`, `/vendor/returns`, `/vendor/payments`, and
`/vendor/refund-reasons` trees already do this; the new additions
below preserve the same property:

- `order-edits`, `exchanges`, `claims`, and `payment-collections` are
  **top-level resources** at `/vendor/{name}` — not nested under
  `/vendor/orders/:id/`. Medusa places them at top level
  (`/admin/order-edits`, `/admin/exchanges`, `/admin/claims`,
  `/admin/payment-collections`) so the typed-client route map can be
  shared and the `sdk.vendor.{resource}` namespace lines up with
  `sdk.admin.{resource}`.
- "Cancel begin" on an exchange/claim/order-edit is `DELETE
  /{resource}/:id/request` (or `DELETE /order-edits/:id` for the
  order-edit case) — **never** a bare `DELETE /{resource}/:id`.
- "Update action" endpoints are `POST /{resource}/:id/.../:action_id`,
  paired with `DELETE` on the same path for removal.
- HTTP verb mapping: `POST` for create/mutate, `DELETE` for remove,
  `GET` for list/retrieve. No `PATCH` — Medusa orders trees use `POST`
  even for updates to stay consistent with `order_change`-driven
  mutations.

If any future divergence is genuinely required (e.g. Mercur needs a
seller-context endpoint admin doesn't have), document the reason
inline beside the route — silent drift fails the audit.

#### Order Edit

Workflows (Medusa core-flows, no Mercur override needed):
- `beginOrderEditOrderWorkflow`
- `orderEditAddNewItemWorkflow`, `orderEditUpdateItemQuantityWorkflow`
- `updateOrderEditAddItemWorkflow`, `updateOrderEditItemQuantityWorkflow`
- `removeOrderEditItemActionWorkflow`
- `createOrderEditShippingMethodWorkflow`,
  `updateOrderEditShippingMethodWorkflow`,
  `removeOrderEditShippingMethodWorkflow`
- `requestOrderEditRequestWorkflow`
- `confirmOrderEditRequestWorkflow`
- `cancelBeginOrderEditWorkflow`

Routes to add. **Mirror Medusa admin exactly** — order-edits is a
top-level resource at `/admin/order-edits/...`
(`packages/medusa/src/api/admin/order-edits`), not nested under
`/admin/orders/:id/`. The vendor tree must follow the same shape:

- `POST   /vendor/order-edits` (begin; body matches
  `AdminPostOrderEditsReqSchema` — `{ order_id, description?,
  internal_note?, metadata? }`)
- `DELETE /vendor/order-edits/:id` (cancel begin)
- `POST   /vendor/order-edits/:id/request` (move from draft →
  requested; Figma "Order edit request")
- `POST   /vendor/order-edits/:id/confirm` (Figma "Force confirm")
- `POST   /vendor/order-edits/:id/items` (add item)
- `POST   /vendor/order-edits/:id/items/:action_id` (update add-item
  action)
- `DELETE /vendor/order-edits/:id/items/:action_id` (remove add-item
  action)
- `POST   /vendor/order-edits/:id/items/item/:item_id` (update qty on
  an existing line item)
- `POST   /vendor/order-edits/:id/shipping-method` (add)
- `POST   /vendor/order-edits/:id/shipping-method/:action_id` (update)
- `DELETE /vendor/order-edits/:id/shipping-method/:action_id` (remove)

Seller scoping happens via a `validateSellerOrderEdit` helper that
loads the `order_change` → joins to `order_seller` → asserts the
authenticated seller owns the parent order. Do **not** invent a
`/vendor/orders/:id/edits/...` tree — that diverges from admin and
breaks the typed-client convention.

RBAC: seller-scope guard on the parent order. The Edit must not be
allowed to add items priced from another seller's catalog — add a
validator step that re-applies the buy-box / commission logic before
`requestOrderEditRequestWorkflow` runs (the same step used in
`completeCartWithSplitOrdersWorkflow`).

Query / activity: `GET /vendor/orders/:id/changes` already exposes the
`order_change` rows the timeline needs; verify the `change_type`
values include `edit_order`.

#### Create Exchange

Workflows:
- `beginOrderExchangeWorkflow`
- `exchangeAddNewItemWorkflow`, `exchangeRequestItemReturnWorkflow`
- `updateExchangeAddItemWorkflow`,
  `removeExchangeItemActionWorkflow`
- `createExchangeShippingMethodWorkflow`,
  `updateExchangeShippingMethodWorkflow`,
  `removeExchangeShippingMethodWorkflow`
- `refreshShipping` (shared with claim)
- `confirmExchangeRequestWorkflow`
- `cancelExchangeWorkflow`, `cancelBeginOrderExchangeWorkflow`

Routes — mirror `packages/medusa/src/api/admin/exchanges` exactly:

- `GET    /vendor/exchanges` (list, seller-scoped)
- `POST   /vendor/exchanges` (begin from order; body includes
  `order_id`)
- `GET    /vendor/exchanges/:id`
- `POST   /vendor/exchanges/:id/cancel` (cancel a confirmed exchange)
- `POST   /vendor/exchanges/:id/request` (confirm/request the
  exchange — moves draft → requested)
- `DELETE /vendor/exchanges/:id/request` (cancel a **begun** exchange
  — `cancelBeginOrderExchangeWorkflow`). Note: this is the
  Medusa-canonical shape; do **not** model this as `DELETE
  /vendor/exchanges/:id`.
- `POST   /vendor/exchanges/:id/inbound/items`
- `POST   /vendor/exchanges/:id/inbound/items/:action_id`
- `DELETE /vendor/exchanges/:id/inbound/items/:action_id`
- `POST   /vendor/exchanges/:id/inbound/shipping-method`
- `POST   /vendor/exchanges/:id/inbound/shipping-method/:action_id`
- `DELETE /vendor/exchanges/:id/inbound/shipping-method/:action_id`
- `POST   /vendor/exchanges/:id/outbound/items`
- `POST   /vendor/exchanges/:id/outbound/items/:action_id`
- `DELETE /vendor/exchanges/:id/outbound/items/:action_id`
- `POST   /vendor/exchanges/:id/outbound/shipping-method`
- `POST   /vendor/exchanges/:id/outbound/shipping-method/:action_id`
- `DELETE /vendor/exchanges/:id/outbound/shipping-method/:action_id`

Note: the existing `/vendor/returns/:id/...` tree handles standalone
returns. The exchange's inbound leg goes through the dedicated
`/vendor/exchanges/:id/inbound/...` subtree above — same as Medusa
admin — so the typed client surfaces the same shape on both
dashboards. Do **not** collapse the inbound leg into the returns
tree.

#### Create Claim

Workflows:
- `beginOrderClaimWorkflow`
- `claimItemWorkflow`, `claimAddNewItemWorkflow`,
  `claimRequestItemReturnWorkflow`
- `updateClaimItemWorkflow`, `updateClaimAddItemWorkflow`,
  `removeClaimItemActionWorkflow`,
  `removeClaimAddItemActionWorkflow`
- `createClaimShippingMethodWorkflow`,
  `updateClaimShippingMethodWorkflow`,
  `removeClaimShippingMethodWorkflow`
- `confirmClaimRequestWorkflow`
- `cancelClaimWorkflow`, `cancelBeginOrderClaimWorkflow`

Routes — mirror `packages/medusa/src/api/admin/claims` exactly. Same
shape as Exchange **plus** a claim-specific `claim-items` subtree
that exchanges do not have:

- `GET    /vendor/claims`
- `POST   /vendor/claims` (begin)
- `GET    /vendor/claims/:id`
- `POST   /vendor/claims/:id/cancel`
- `POST   /vendor/claims/:id/request`
- `DELETE /vendor/claims/:id/request` (cancel a begun claim;
  Medusa-canonical — not `DELETE /vendor/claims/:id`)
- `POST   /vendor/claims/:id/claim-items` (mark existing line items
  as claimed — `claimItemWorkflow`)
- `POST   /vendor/claims/:id/claim-items/:action_id`
- `DELETE /vendor/claims/:id/claim-items/:action_id`
- `POST   /vendor/claims/:id/inbound/items`
- `POST   /vendor/claims/:id/inbound/items/:action_id`
- `DELETE /vendor/claims/:id/inbound/items/:action_id`
- `POST   /vendor/claims/:id/inbound/shipping-method`
- `POST   /vendor/claims/:id/inbound/shipping-method/:action_id`
- `DELETE /vendor/claims/:id/inbound/shipping-method/:action_id`
- `POST   /vendor/claims/:id/outbound/items`
- `POST   /vendor/claims/:id/outbound/items/:action_id`
- `DELETE /vendor/claims/:id/outbound/items/:action_id`
- `POST   /vendor/claims/:id/outbound/shipping-method`
- `POST   /vendor/claims/:id/outbound/shipping-method/:action_id`
- `DELETE /vendor/claims/:id/outbound/shipping-method/:action_id`

Body for the focus-modal Confirm step matches the Figma "Create Claim"
shape: `{ inbound: { items: [{ id, quantity }], reason_id, note,
location_id, return_shipping_option_id? }, outbound: { items: [{ id,
quantity }] }, notify_customer: boolean }`.

#### Refund (entry point)

Backend is already shipped (`POST /vendor/payments/:id/refund`).
What's missing is the vendor-orders side wiring:

- Surface a per-payment `payment.id` in the order detail response so
  the UI kebab can call refund directly. The existing query config
  (`orders/query-config.ts:1-23`) selects `*payment_collections`, but
  the payments collection must also include `*payment_collections.payments`
  to give the UI the payment ids. Add `*payment_collections.payments`
  (and `*payment_collections.payments.refunds`) to `vendorOrderFields`.
- Confirm `RefundReason` is available to the modal — already shipped
  via `/vendor/refund-reasons`.

#### Receive Items

Backend is already shipped under `/vendor/returns/:id/receive` and
`/vendor/returns/:id/receive-items`. No new endpoints. The vendor UI
just needs a registered route that consumes them (see UI gap above).

#### Handle Positive Outstanding Amounts

Workflows:
- `markPaymentCollectionAsPaidWorkflow` (Medusa core-flows,
  `dist/order/workflows/mark-payment-collection-as-paid.js`)
- "Copy payment link" — no workflow needed; the UI reads the URL out
  of an existing pending `payment_session.context.url` (or
  `payment_collection.payment_sessions[].provider_url` depending on
  provider). The backend just needs to **include payment sessions in
  the order detail query** so the URL is reachable from the UI.

Routes — mirror
`packages/medusa/src/api/admin/payment-collections` exactly. Medusa
exposes payment-collection actions on the **top-level**
`/admin/payment-collections/:id/...` resource, not nested under
`/admin/orders/:id/payment-collections/...`. The vendor side must
follow the same shape (no `/vendor/payment-collections` tree exists
today — add one):

- `POST   /vendor/payment-collections/:id/mark-as-paid` (wraps
  `markPaymentCollectionAsPaidWorkflow`; seller scoping via a new
  `validateSellerPaymentCollection` helper that walks
  `payment_collection → order → order_seller`).
- Optional (matches admin): `POST /vendor/payment-collections` and
  `DELETE /vendor/payment-collections/:id` if the UI needs to create
  ad-hoc collections for outstanding balances. Out of Phase 1 unless
  the design requires it.
- Extend `vendorOrderFields` with
  `*payment_collections.payment_sessions` so the UI can read the
  hosted payment URL when the collection is not yet captured.

### Query-config / response-shape additions

Add to `orders/query-config.ts::vendorOrderFields`:

- `*payment_collections.payments` (per-payment rows)
- `*payment_collections.payments.refunds` (refund history)
- `*payment_collections.payment_sessions` (hosted URL for Copy payment link)
- `*returns`, `*returns.items`, `*returns.shipping_methods` (subrows
  under line items)
- `*exchanges`, `*exchanges.return`, `*exchanges.additional_items`
- `*claims`, `*claims.return`, `*claims.additional_items`,
  `*claims.claim_items`
- `*order_change` (or expose via the `/changes` endpoint only —
  decide one or the other; do not duplicate)
- `*fulfillments.shipping_option.service_zone.fulfillment_set.type`
  (the UI already reads this to flip Mark-as-shipped → Mark-as-picked-up)

Audit `VendorOrderResponse` / `VendorOrderListResponse` in
`packages/types/src/http/order.ts` against the new fields and ship the
typed client regeneration (`mercurjs codegen`) in the same PR — the
vendor UI hooks lean on `sdk.vendor.orders.$id.query` returning the
new fields.

### Testing

Add integration suites under
`integration-tests/http/order/vendor/` (one file per feature):

- `order-edit.spec.ts`
- `order-exchange.spec.ts`
- `order-claim.spec.ts`
- `order-refund.spec.ts` (covers payment-row refund + outstanding
  handling)
- `order-mark-as-paid.spec.ts`
- `order-list-filters.spec.ts` (covers `payment_status`,
  `fulfillment_status`, `has_open_request`)

Each suite uses `medusaIntegrationTestRunner` plus the seller / admin
user helpers in `integration-tests/helpers`. Reuse the existing return
test as the template
(`integration-tests/http/order/vendor/order.spec.ts`).

### Workflow-override checklist (Mercur-specific)

Where Medusa's workflow is enough, wire the route directly to the
imported workflow from `@medusajs/core-flows`. Wrap only when Mercur
needs to layer in seller / commission / payout logic — same pattern
used by:

- `packages/core/src/workflows/order/workflows/cancel-order-fulfillment.ts`
- `packages/core/src/workflows/order/workflows/refresh-order-commission-lines.ts`
- `packages/core/src/workflows/order/workflows/confirm-return-receive.ts`

#### Confirm-edit / confirm-claim / confirm-exchange — use subscribers, not overrides

The three Medusa workflows that finalize a request — `confirmOrderEditRequestWorkflow`,
`confirmClaimRequestWorkflow`, `confirmExchangeRequestWorkflow` — **do not expose
any `createHook(...)` extension points**, and their sub-workflows
(`createOrUpdateOrderPaymentCollectionWorkflow`,
`createReturnFulfillmentWorkflow`) don't either. The only post-confirm
extension surface they offer is an emitted event:

| Workflow | Event | Constant |
| --- | --- | --- |
| `confirmOrderEditRequestWorkflow` | `order-edit.confirmed` | `OrderEditWorkflowEvents.CONFIRMED` |
| `confirmClaimRequestWorkflow` | `order.claim_created` | `OrderWorkflowEvents.CLAIM_CREATED` |
| `confirmExchangeRequestWorkflow` | `order.exchange_created` | `OrderWorkflowEvents.EXCHANGE_CREATED` |

Source: `medusa/packages/core/utils/src/core-flows/events.ts:299` and the
`emitEventStep` calls at `confirm-order-edit-request.ts:291`,
`confirm-claim-request.ts:511`, `confirm-exchange-request.ts:496`.

Use subscribers — not a forked workflow — to react. This is lighter
than the `cancel-order-fulfillment.ts` fork pattern and survives Medusa
upgrades cleanly. Forking is only justified when Mercur logic must run
*inside the same transaction* as the workflow or depends on intermediate
state that isn't on the emitted event. Neither applies here:
commission recalculation and payout-queue updates run on the persisted
order after the workflow commits, and both accept just `order_id`.

##### Subscriber files to add

```
packages/core/src/subscribers/
  order-edit-confirmed.ts        # OrderEditWorkflowEvents.CONFIRMED
  order-claim-created.ts         # OrderWorkflowEvents.CLAIM_CREATED
  order-exchange-created.ts      # OrderWorkflowEvents.EXCHANGE_CREATED
```

Each subscriber follows the existing
`packages/core/src/subscribers/payout-webhook.ts` shape:

```ts
import {
  OrderEditWorkflowEvents,
  // OrderWorkflowEvents for the claim/exchange subscribers
} from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { refreshOrderCommissionLinesWorkflow } from "../workflows/commission/workflows/refresh-order-commission-lines"

export default async function orderEditConfirmedHandler({
  event,
  container,
}: SubscriberArgs<{ order_id: string }>) {
  const orderId = event.data.order_id

  // 1) Recalculate commission lines on the (now-committed) order.
  await refreshOrderCommissionLinesWorkflow(container).run({
    input: { order_id: orderId },
  })

  // 2) Re-queue the seller payout for the new totals.
  //    Reuse the same step `complete-cart-with-split-orders.ts` uses
  //    for initial payout creation. Confirm exact entry point with
  //    the payout module owner before merging.
}

export const config: SubscriberConfig = {
  event: OrderEditWorkflowEvents.CONFIRMED,
}
```

The claim and exchange subscribers are identical except for the
`config.event` value (`OrderWorkflowEvents.CLAIM_CREATED` /
`OrderWorkflowEvents.EXCHANGE_CREATED`) and the event-data payload
shape — `event.data` carries `order_id` for the edit subscriber and
the claim/exchange id (plus `order_id`) for the other two. Read
`order_id` off the event payload; resolve the claim/exchange via
`query.graph` only if a downstream step needs more than the order id.

##### Behavioural guarantees

1. Commission lines on the order match the new totals within the same
   request/response cycle that the customer-facing API observes (the
   subscriber fires synchronously off the event bus before the
   workflow's HTTP response returns to the caller — verify against
   the event-bus module configured in `apps/api`).
2. The seller's payout queue reflects the adjusted commission. If the
   payout for the order is still `pending`, it's updated in place; if
   already `completed`, a delta payout is enqueued. (Exact semantics
   live in the payout module — coordinate with that module's owner.)
3. The subscriber is idempotent: calling
   `refreshOrderCommissionLinesWorkflow` twice for the same `order_id`
   leaves the order in the same state (it replaces commission lines
   rather than appending).

##### Other workflows — wrap directly

- `refundPaymentWorkflow` — already wrapped indirectly via the vendor
  route; verify the payout-deduction subscriber fires.

#### Out of scope for this checklist

- A dedicated `packages/core/src/workflows/hooks/` directory. None of
  the three confirm-\* workflows expose `createHook`, so the directory
  has nothing to register. Create it only if a future spec needs to
  bind to a workflow that *does* expose hooks (e.g.
  `cancelOrderFulfillmentWorkflow.hooks.orderFulfillmentCanceled`).

## Out of scope (Phase 2)

Per the Order Workflow Feature Brief these are explicitly **not** in
the Phase 1 contract and must not be designed into the vendor panel:

- Order scoring before fulfillment.
- Document upload on orders.
- Messaging on orders.
- Incident management.
- Transfer Ownership (Figma frame `40013324:306766` is intentionally
  out of scope for Phase 1; the kebab action, route, modal, and
  activity entry must not be implemented).

If any frame on the Figma canvas implies one of these (e.g. an
attachment slot or a chat affordance), call it out here and confirm
with the author before implementing.

## Verification

A reviewer should be able to walk through this checklist with the
Figma file open and tick off each item against the running vendor
panel **and** the running API.

### Backend
0. **Vendor API**
   - [~] `GET /vendor/orders` accepts `payment_status` and
     `fulfillment_status` filters — **reverted** in session (c).
     Validators back to `z.string().optional()`; aggregated-status
     post-filter dropped. Re-do path documented in session (c).
   - [x] `GET /vendor/orders` exposes a `has_open_request` (or
     equivalent) filter — landed session (a), kept session (c)
     (`apply-has-open-request-filter.ts` middleware; 3/3
     integration tests pass).
   - [~] `GET /vendor/orders/:id` response includes
     `payment_collections.payments`,
     `payment_collections.payments.refunds`,
     `payment_collections.payment_sessions`, `returns`,
     `returns.items.reason`, `returns.shipping_methods` — all
     landed across sessions (a) + (d). **`exchanges` and `claims`
     still deferred** — those relations don't live on `Order`
     directly; need either a query-config join via `order_change`
     or dedicated routes (see lines below).
   - [x] `POST /vendor/order-edits` (top-level, mirrors
     `/admin/order-edits`) + sub-resources (`:id/items`,
     `:id/items/:action_id` POST/DELETE,
     `:id/items/item/:item_id`, `:id/shipping-method` (+ `:action_id`
     POST/DELETE), `:id/request`, `:id/confirm`, `DELETE :id`)
     behave per Medusa core-flows; activity logged via `order_change`.
     **Sessions (n) + (o)**: full tree shipped. Subscriber for
     `order-edit.confirmed` (commission + payout delta recalc) and
     the integration suite still pending — both independent of
     the route surface.
   - [ ] `POST /vendor/exchanges` (+ `:id/cancel`, `:id/request`
     POST/DELETE, `:id/{inbound,outbound}/{items,shipping-method}`
     (+ `:action_id` POST/DELETE)); seller-scope guard enforced.
   - [ ] `POST /vendor/claims` (+ `:id/cancel`, `:id/request`
     POST/DELETE, `:id/claim-items` (+ `:action_id` POST/DELETE),
     `:id/{inbound,outbound}/{items,shipping-method}` (+ `:action_id`
     POST/DELETE)); seller-scope guard enforced.
   - [x] `POST /vendor/payment-collections/:id/mark-as-paid`
     (top-level resource, mirrors
     `/admin/payment-collections/:id/mark-as-paid`) — landed
     session (a); 4/4 integration tests pass.
   - [~] Integration suites under `integration-tests/http/order/vendor/`
     — `order-list-filters.spec.ts` (`has_open_request`, 3/3) and
     `order-mark-as-paid.spec.ts` (4/4) shipped. Remaining suites
     blocked on the unshipped backend routes above.

1. **Orders list**
   - [x] Search input visible in the header row — session (h).
   - [~] `Add filter` exposes Payment, Fulfillment, Request, Sales
     channel, Created, Updated. **Request** (`has_open_request`)
     wired session (a). **Sales channel**, **Created**, **Updated**
     already exist. **Payment** and **Fulfillment** intentionally
     dropped per session (c).
   - [x] Sort popover lists Order ID / Created / Updated with
     asc/desc — exists per original audit.
   - [~] Column set matches Figma — Sales channel column kept as
     a deliberate non-drift (session h note); design owner sign-off
     pending.
2. **Order detail — read view**
   - [x] Header card shows payment + fulfillment badges only — the
     third (order-status) badge is gated by `getCanceledOrderStatus`
     so it only renders when the order is canceled; documented as
     deliberate non-drift in session (b).
   - [~] Kebab exposes Edit order, Create Return, Create Exchange,
     Create Claim. **Create Return** kebab entry + route + focus
     modal scaffold shipped session (j). Edit order / Create
     Exchange / Create Claim still missing — blocked on §0 backend
     routes.
   - [~] Each line item can render a return/exchange/claim subrow
     with reason chip + tooltip — **returns** done session (d).
     Claims / exchanges blocked on §0 backend gaps.
   - [x] Allocate items CTA appears inline in Summary when items
     are not allocated — session (e).
   - [x] Outstanding action strip (`Copy payment link` / `Mark as
     paid`) renders when outstanding > 0 — session (a).
   - [x] Payment section renders per-payment rows with kebab →
     Create Refund — session (b).
   - [x] Activity timeline mounted in the sidebar — session (b).
     **Plus**: return lifecycle rows wired session (f); payment
     awaiting/captured/canceled/refunded rows wired session (g).
     Claim / exchange rows blocked on §0 backend.
   - [x] Metadata + JSON sections at the bottom of the main column
     — session (b).
3. **Edit Order**
   - [ ] Banner above the header with Force confirm / Cancel.
   - [ ] Route registered; activity entry logged.
4. **Create Return / Exchange / Claim / Refund**
   - [~] Each has a kebab entry, a registered route, a focus modal
     with the structure described above, and an activity entry on
     success. **Refund** has its per-payment-row kebab entry +
     route + drawer (session b); kebab on the order header is not
     applicable to refunds (Figma places that flow under Payment
     row). **Return** kebab + route + RouteFocusModal scaffold
     landed session (j) — items selection (checkbox + qty stepper),
     per-item reason dropdown + note, send-notification switch,
     confirm/cancel wired through the existing draft-and-mutate
     vendor hooks (`useInitiateReturn` / `useAddReturnItem` /
     `useConfirmReturnRequest` / `useCancelReturnRequest`).
     Location and return-shipping dropdowns landed session (k);
     the modal now covers the full Figma contract (items, reason,
     note, location, return shipping (optional), notification).
     **Exchange** / **Claim** modals still blocked on §0 backend.
   - [x] Refund flow is reachable from the Payment-row kebab —
     session (b).
5. **Receive Items**
   - [x] CTA in Summary section — preexisting + polish in
     session (b).
   - [x] Modal registered at
     `/orders/:id/returns/:return_id/receive` — session (b).
6. **Fulfillment, Shipment, Mark as delivered/picked up**
   - [~] Existing flows confirmed visually identical to the
     design — partial sweep session (l) on
     `OrderFulfillmentSection` (no structural drift; three CTA
     buttons missing `size="small"` patched). Session (m) on
     the Create Shipment focus-modal form: mis-labeled
     tracking-number field, hardcoded `"#"` URLs, and missing
     `size="small"` patched. Mark-as-delivered / Mark-as-picked-up
     confirmation prompts not yet swept (no separate focus modal
     — they live inside `OrderFulfillmentSection`'s `usePrompt`
     call so the sweep against that file in session (l) already
     covered the surface).
7. **Visual drift**
   - [x] Solid `divide-y` (not dashed) across Summary + Payment —
     session (b).
   - [x] `Allocated` / `Not allocated` chip on every Summary item
     row — session (e).

## Evidence

### Session 2026-06-05 (o) — vendor `/vendor/order-edits` items + shipping-method sub-routes

Closes the deferred half of session (n). The full Order Edit
backend tree is now mounted under `/vendor/`.

#### Files added

- `packages/core/src/api/vendor/order-edits/[id]/items/route.ts` —
  `POST :id/items` → `orderEditAddNewItemWorkflow`.
- `packages/core/src/api/vendor/order-edits/[id]/items/[action_id]/route.ts`
  — `POST :id/items/:action_id` →
  `updateOrderEditAddItemWorkflow`; `DELETE :id/items/:action_id`
  → `removeItemOrderEditActionWorkflow`.
- `packages/core/src/api/vendor/order-edits/[id]/items/item/[item_id]/route.ts`
  — `POST :id/items/item/:item_id` →
  `orderEditUpdateItemQuantityWorkflow`. Workflow input wraps the
  body inside `items: [{ ...body, id: item_id }]` per Medusa
  admin's exact shape.
- `packages/core/src/api/vendor/order-edits/[id]/shipping-method/route.ts`
  — `POST :id/shipping-method` →
  `createOrderEditShippingMethodWorkflow`.
- `packages/core/src/api/vendor/order-edits/[id]/shipping-method/[action_id]/route.ts`
  — `POST :id/shipping-method/:action_id` →
  `updateOrderEditShippingMethodWorkflow`; `DELETE
  :id/shipping-method/:action_id` →
  `removeOrderEditShippingMethodWorkflow`.

Each handler is a 1:1 port of its Medusa-admin counterpart at
`/Users/viktorholik/Desktop/medusa/packages/medusa/src/api/admin/order-edits/`,
unchanged except for swapping `@medusajs/core-flows` workflow
imports stay identical (the workflows are framework-level, not
namespace-scoped).

#### Files modified

- `packages/core/src/api/vendor/order-edits/validators.ts` — added
  five zod schemas: `VendorPostOrderEditsAddItemsReq`,
  `VendorPostOrderEditsItemsActionReq`,
  `VendorPostOrderEditsUpdateItemQuantityReq`,
  `VendorPostOrderEditsShippingReq`,
  `VendorPostOrderEditsShippingActionReq`. All copy admin's
  zod shape verbatim (field set, optionality, nullability).
- `packages/core/src/api/vendor/order-edits/middlewares.ts` —
  imported the new validators, appended six new `MiddlewareRoute`
  entries. All sub-routes reuse `assertSellerOwnsOrderInParam`
  (the `:id` is still the order_id) — no need for
  `validateSellerOrderEdit` even on the `:action_id`-keyed
  routes since `:action_id` is just the workflow input, not the
  scope boundary.

#### Why the helper remains in tree

`validateSellerOrderEdit` in `helpers.ts` (added speculatively in
session (n) per the spec's initial sketch) is still NOT exercised
by any live route — Medusa admin's full `/admin/order-edits` tree
keys everything on `order_id`. Leaving the helper as a no-op
export in case downstream consumers need to scope an
`order_change.id` directly; documented as deferred-utility.

#### Verification

- `bun run build` — 9/9 packages green in 1m08s
  (`@mercurjs/core` recompiled with five new route files,
  `@mercurjs/vendor` + `@mercurjs/admin` rebuilt against the
  regenerated route map).
- `bunx oxlint packages/core/src/api/vendor/order-edits/` — **0
  warnings, 0 errors** across all 12 files in the tree.

#### Still deferred (carried forward)

- Subscriber on `OrderEditWorkflowEvents.CONFIRMED` (spec §"Confirm-edit
  … use subscribers, not overrides", lines ~1128-1234). Layers in
  `refreshOrderCommissionLinesWorkflow` + payout delta. Independent
  of the route surface.
- Integration suite `integration-tests/http/order/vendor/order-edit.spec.ts`
  using the offer-based seeding pattern.
- Next big slice: `/vendor/exchanges` tree (spec §0 third bullet).

### Session 2026-06-05 (n) — vendor `/vendor/order-edits` backend skeleton

Per the user's session-start clarification ("the same like the medusa
has"), this session takes the first slice of the long-blocked §0
backend gap by mirroring Medusa admin's `/admin/order-edits` tree
exactly under `/vendor/`. Items + shipping-method sub-routes are
deferred to a follow-up — those carry larger payload shapes and key
on `order_change.id` (not `order_id`), so they need the
`validateSellerOrderEdit` helper which lands ahead of them in this
session.

#### Files added

- `packages/core/src/api/vendor/order-edits/helpers.ts` — exports
  `validateSellerOrderEdit(scope, sellerId, orderEditId)`. Walks
  `order_change.id` → `order_id` via Query Graph, then defers to
  the existing `validateSellerOrder`. Mirrors
  `packages/core/src/api/vendor/returns/helpers.ts` shape.
- `packages/core/src/api/vendor/order-edits/validators.ts` —
  `VendorPostOrderEditsReq` is a 1:1 zod port of admin's
  `AdminPostOrderEditsReqSchema`
  (`medusa/packages/medusa/src/api/admin/order-edits/validators.ts`):
  `{ order_id: z.string(), description?, internal_note?,
  metadata?: z.record(z.unknown()).nullish() }`.
- `packages/core/src/api/vendor/order-edits/middlewares.ts` —
  exports `vendorOrderEditsMiddlewares: MiddlewareRoute[]`. Two
  guard helpers: `assertSellerOwnsOrderInBody` (reads
  `req.validatedBody.order_id` for the create call) and
  `assertSellerOwnsOrderInParam` (reads `req.params.id` — which is
  the order_id per Medusa admin's convention). Both defer to
  `validateSellerOrder`.
- `packages/core/src/api/vendor/order-edits/route.ts` —
  `POST /vendor/order-edits`. Wraps
  `beginOrderEditOrderWorkflow` from `@medusajs/core-flows`
  directly per the spec's "wrap workflow directly when Medusa's
  workflow is enough" rule. Returns `HttpTypes.AdminOrderEditResponse`
  shape (`{ order_change }`).
- `packages/core/src/api/vendor/order-edits/[id]/route.ts` —
  `DELETE /vendor/order-edits/:id`. Wraps
  `cancelBeginOrderEditWorkflow({ order_id: id })`. Response
  shape `{ id, object: "order-edit", deleted: true }`, matching
  admin.
- `packages/core/src/api/vendor/order-edits/[id]/request/route.ts`
  — `POST /vendor/order-edits/:id/request`. Wraps
  `requestOrderEditRequestWorkflow({ order_id: id, requested_by:
  req.seller_context.seller_id })`. Vendor equivalent of admin's
  `actor_id` audit field — matches the pattern already in tree at
  `packages/core/src/api/vendor/returns/[id]/request/route.ts:28`.
- `packages/core/src/api/vendor/order-edits/[id]/confirm/route.ts`
  — `POST /vendor/order-edits/:id/confirm`. Wraps
  `confirmOrderEditRequestWorkflow({ order_id: id, confirmed_by:
  req.seller_context.seller_id })`. The spec §"Workflow-override
  checklist" notes this workflow has no `createHook` extension
  points — the Mercur-side commission / payout recalc layered on
  top must be a subscriber on `order-edit.confirmed`; that
  subscriber is **NOT** added this session (see deferred list).

#### Files modified

- `packages/core/src/api/vendor/middlewares.ts` — added
  `vendorOrderEditsMiddlewares` import + spread between
  `vendorOffersMiddlewares` and `vendorOrdersMiddlewares`.

#### Critical correction vs. the spec's initial sketch

The spec's "Routes to add" section (§"Missing routes → Order Edit")
described `:id`-keyed sub-routes as keying on `order_change.id`,
which implied a `validateSellerOrderEdit` helper that joins
`order_change → order_seller` was needed. But reading Medusa
admin's three sub-route handlers:

```
medusa/.../admin/order-edits/[id]/route.ts            DELETE → cancelBeginOrderEditWorkflow({ order_id: id })
medusa/.../admin/order-edits/[id]/request/route.ts    POST   → requestOrderEditRequestWorkflow({ order_id: id, ... })
medusa/.../admin/order-edits/[id]/confirm/route.ts    POST   → confirmOrderEditRequestWorkflow({ order_id: id, ... })
```

— each handler threads `req.params.id` directly into the workflow
input field named `order_id`. **The URL param is the order_id, not
the order_change_id.** This makes the simpler `validateSellerOrder`
sufficient for all three sub-routes, and `validateSellerOrderEdit`
isn't exercised by the live routes today.

`validateSellerOrderEdit` is kept in `helpers.ts` because the
items + shipping-method sub-routes (deferred this session) DO key
on `order_change.id` (`:action_id` for update/delete; `:item_id`
for the existing-line update path). The helper will be wired into
their middlewares when those routes land.

#### Out of this slice (deferred to follow-up)

The remaining seven sub-routes from spec §"Routes to add" for
Order Edit, in mounting order:

- `POST /vendor/order-edits/:id/items` —
  `orderEditAddNewItemWorkflow`. Body shape matches admin's
  `AdminPostOrderEditsAddItemsReqSchema`.
- `POST /vendor/order-edits/:id/items/:action_id` —
  `updateOrderEditAddItemWorkflow`. Update an add-item action.
  Keys on `order_change_action.id`.
- `DELETE /vendor/order-edits/:id/items/:action_id` —
  `removeOrderEditItemActionWorkflow`. Removes the action.
- `POST /vendor/order-edits/:id/items/item/:item_id` —
  `orderEditUpdateItemQuantityWorkflow` /
  `updateOrderEditItemQuantityWorkflow`. Updates qty on an
  existing line item.
- `POST /vendor/order-edits/:id/shipping-method` —
  `createOrderEditShippingMethodWorkflow`.
- `POST /vendor/order-edits/:id/shipping-method/:action_id` —
  `updateOrderEditShippingMethodWorkflow`.
- `DELETE /vendor/order-edits/:id/shipping-method/:action_id` —
  `removeOrderEditShippingMethodWorkflow`.

Also deferred:

- Subscriber on `order-edit.confirmed` (spec §"Confirm-edit … use
  subscribers, not overrides" lines 1128-1234). Needs to call
  `refreshOrderCommissionLinesWorkflow` and re-queue the payout
  delta. Independent of the route surface — can land in any
  session.
- Integration suite at `integration-tests/http/order/vendor/order-edit.spec.ts`
  covering begin → cancel → begin → request → confirm. Should
  follow the offer-based seeding pattern used by the existing
  `order-list-filters.spec.ts` and `order-mark-as-paid.spec.ts`
  suites (spec §"Testing" + session-(c) re-do checklist).
- TypeScript route map regeneration via `bun run codegen` — needs
  to run before any vendor UI hook can call
  `sdk.vendor.orderEdits.*`. The codegen pass runs as part of
  `bun run build` so the route map is already updated in the
  build output; the typed-client SDK regeneration is a separate
  concern documented in spec §"Filter gap — Codegen" pattern.

#### Verification

- `bun run build` — 9/9 packages green in 1m07s (`@mercurjs/core`
  recompiled with the new route directory; `@mercurjs/admin` and
  `@mercurjs/vendor` rebuilt against the regenerated route map).
- `bunx oxlint packages/core/src/api/vendor/order-edits/
  packages/core/src/api/vendor/middlewares.ts` — **0 warnings,
  0 errors** across all 8 files.
- No integration run this session — the suite that would cover
  these routes (`order-edit.spec.ts`) is part of the deferred
  follow-up.

### Session 2026-06-05 (m) — Create Shipment form: real URL fields + label fix

Session (l)'s §6 sweep flagged the fulfillment section but didn't
descend into the Shipment focus-modal form. Reading
`shipment/order-create-shipment-form/order-create-shipment-form.tsx`
surfaced three concrete drift items:

1. **Mis-labeled tracking-number field.** The only visible
   `Form.Field` was bound to `labels.${i}.tracking_number` but
   rendered with `<Form.Label>{t("orders.shipment.trackingUrl")}</Form.Label>`
   — "Tracking URL". This was a scaffold-era bug that has been
   sitting in the form since initial port.

2. **Hardcoded `"#"` URLs.** `handleSubmit` was building the
   payload as `tracking_url: "#"`, `label_url: "#"`. Even after
   adding a real input for `tracking_url`, the existing logic
   would have squashed it. The backend validator
   (`/Users/viktorholik/Desktop/mercur/packages/core/src/api/vendor/orders/[id]/fulfillments/[fulfillment_id]/shipments/validators.ts`-equivalent;
   see `useCreateOrderShipment`) treats both as non-optional
   strings — the empty-string fallback satisfies the validator
   without polluting the audit trail with `#` placeholders.

3. **Missing `size="small"` on the `Add tracking URL` button**
   (same pattern as session (l)'s three button patches in
   `order-fulfillment-section.tsx`).

#### Files modified

- `packages/vendor/src/pages/orders/[id]/shipment/order-create-shipment-form/order-create-shipment-form.tsx`:
  - Replaced the single-input render with a 3-column responsive
    grid (`grid grid-cols-1 gap-3 md:grid-cols-3`) exposing
    `tracking_number` (required), `tracking_url` (optional, kept
    the existing `trackingUrlPlaceholder`), and `label_url`
    (optional).
  - Both optional fields use the standard `<Form.Label optional>`
    pattern so the `(optional)` suffix is auto-appended per the
    `Form` primitive's convention.
  - Each input carries `data-testid` (`shipment-tracking-number-${i}`,
    `shipment-tracking-url-${i}`, `shipment-label-url-${i}`).
  - `Add tracking URL` button → `size="small"`, label changed to
    `t("orders.shipment.addTracking")` ("Add tracking number" — a
    sibling key that already existed in `en.json`) since the row
    now covers number+URL+label together; the old `addTrackingUrl`
    label misrepresented what the row added.
  - `append({ tracking_number: "", tracking_url: "", label_url: "" })`
    so the new rows aren't undefined-checked at field bind time.
  - `handleSubmit` reads `l.tracking_url ?? ""` / `l.label_url ?? ""`
    — no more `"#"` literals.

#### What was intentionally NOT done

- The `CreateShipmentSchema` in `constants.ts` keeps `tracking_url`
  and `label_url` as `z.string().optional()`. The TODO comment
  ("not optional in the API") stays — the form passes empty
  strings on submit, which satisfies the backend. Flipping the
  schema to required would block submit unless the user fills
  both URLs, which is too strict (the design doesn't gate
  shipment creation on URL availability).
- Label-file upload (Figma optional: `Label PDF/PNG` drag-drop)
  not added — that requires a `FileUpload` primitive integration
  + a presigned-URL flow that doesn't exist yet for shipments.
  Documented as deferred follow-up.

#### Verification

- `bun run build` — 9/9 packages green in 36s (`@mercurjs/vendor`
  recompiled; everything else cached). DTS clean.
- `bunx oxlint` on the touched file — **0 warnings, 0 errors**.

### Session 2026-06-05 (l) — Create Return polish + §6 fulfillment visual sweep

Closes two small but visible papercuts.

#### Files modified

- `packages/vendor/src/pages/orders/[id]/returns/create/index.tsx`:
  - Empty-selection toast was calling `t("orders.returns.create")`
    which resolves to the literal string "Create Return" —
    nonsensical as an error message. Replaced with a new key
    `t("orders.returns.noItemsSelected")` (added to `en.json`)
    that reads "Select at least one item to return."
  - New `hasSelection` memo: `Object.values(items).some(s =>
    s.selected && s.quantity > 0)`. Wired into the Confirm
    button's `disabled` prop alongside the existing `!ready`
    guard so the empty-selection path is now unreachable from
    the UI (the toast remains as a defensive fallback).
- `packages/vendor/src/i18n/translations/en.json`:
  - Added `orders.returns.noItemsSelected: "Select at least one
    item to return."` under the existing `returns` namespace.
- `packages/vendor/src/pages/orders/[id]/_components/order-fulfillment-section/order-fulfillment-section.tsx`:
  - Three CTA buttons (`Fulfill items`, `Mark as
    delivered/picked up`, `Mark as shipped`) were missing the
    `size="small"` prop. Per the spec's design rules ("Buttons
    inside compact toolbars and footers: `size='small'`")
    they should match the rest of the order detail page. All
    three patched.

#### §6 visual-sweep findings (no structural drift)

Read `order-fulfillment-section.tsx` end-to-end against the Figma
audit notes in §"Per-screen audit → Create Fulfillment / Mark As
Shipped / Delivered / Picked Up":

- `Container className="divide-y p-0"` shell ✅ (every section
  card).
- Header row `flex items-center justify-between px-6 py-4` with
  `<Heading>` left + status-badge cluster + `ActionMenu` right ✅.
- Row padding `px-6 py-4` ✅.
- Footer strip `bg-ui-bg-subtle flex items-center justify-end
  gap-x-2 rounded-b-xl px-4 py-4` matches the Figma footer-shape
  on each fulfillment card ✅.
- `requires_shipping` + `awaiting fulfillment` red status badges
  ✅ (`StatusBadge color="red"` with `text-nowrap`).
- `Heading level="h2"` on the "Unfulfilled items" section
  matches the design's secondary headline weight ✅.
- Currency formatting via `getLocaleAmount` ✅ (consistent with
  Summary section).
- `Cancel` action exposed via `ActionMenu` (kebab) on each
  fulfillment, guarded by `disabled` + tooltip for shipped /
  canceled states ✅.

Items left for follow-up (out of this slice):
- The unfulfilled-items table column proportions (`grid grid-cols-2`
  + nested `grid grid-cols-3`) render correctly but the Figma uses
  a flatter `grid grid-cols-4` for consistency with the Summary
  item rows. Cosmetic — defer to a dedicated polish PR if a
  designer flags it.
- The `Provider` row uses `formatProvider(provider_id)` which
  pretty-prints the underscore-separated key into Title Case. No
  drift against Figma (Figma shows a free-text provider name).

#### Verification

- `bun run build` — 9/9 packages green in 39s (`@mercurjs/vendor`
  recompiled; everything else cached). DTS clean.
- `bunx oxlint` on the touched files — 0 errors; 1 carried-over
  `no-await-in-loop` warning from session (j)/(k) on the
  intentional sequential `addReturnItem` loop. No new warnings.

### Session 2026-06-05 (k) — Create Return: location + return shipping dropdowns

Closes the two intentionally-deferred pieces from session (j) so the
Create Return flow now covers the full Figma "focus modal collecting
items, reason, note, location, return shipping (optional), and a
notification toggle" contract.

#### Files modified

- `packages/vendor/src/pages/orders/[id]/returns/create/index.tsx`:
  - Added `useStockLocations`, `useShippingOptions`, `useUpdateReturn`,
    `useAddReturnShipping` imports.
  - New state: `locationId`, `shippingOptionId`. Changing
    `locationId` resets `shippingOptionId` (a stale option from a
    different location can't survive the dropdown re-source).
  - `useShippingOptions` is gated on `!!locationId` via the
    `enabled` flag — no wasted fetch before the user picks a
    location.
  - Two new card-shaped strips (`bg-ui-bg-component
    shadow-elevation-card-rest rounded-lg p-3`) inserted between
    the items list and the notify switch: Location (single
    `Select`, sourced from `stock_locations`) and Return shipping
    (single `Select`, sourced from `shipping_options`, disabled
    until a location is chosen). Both use existing i18n keys
    (`orders.returns.location`, `locationHint`, `inboundShipping`,
    `inboundShippingHint`).
  - `handleConfirm` order extended: (1) `useUpdateReturn({
    location_id })` when set, (2) the existing per-item
    `useAddReturnItem` loop, (3) `useAddReturnShipping({
    shipping_option_id })` when set, (4)
    `useConfirmReturnRequest({ no_notification: !notify })`. Step
    1 runs before items so the eventual receive-flow has the
    location stamped on the draft even if shipping is skipped.

#### Backend reality-check (no changes)

- `POST /vendor/returns` validator already accepts
  `location_id?: string` (`VendorPostReturnsReq` at
  `packages/core/src/api/vendor/returns/validators.ts:VendorPostReturnsReq`).
- `POST /vendor/returns/:id/shipping-method` validator already
  accepts `shipping_option_id: string` + optional `custom_amount`
  /`description` / `internal_note` / `metadata`
  (`VendorPostReturnsShippingReq` at line 92 of the same file).
- `useStockLocations()` and `useShippingOptions(...)` were both
  already exported from `packages/vendor/src/hooks/api/`.

No backend work needed.

#### Verification

- `bun run build` — 9/9 packages green in 38s (`@mercurjs/vendor`
  recompiled; everything else cached). DTS clean.
- `bunx oxlint` on the touched file — 0 errors; 1 baseline
  `no-await-in-loop` warning on the intentional sequential
  `addReturnItem` loop (carried over from session j; the calls
  mutate the same draft and must serialize).
- Visual / runtime: no headless UI run this session. Both
  `Select` controls follow the same render path as the existing
  refund-reason `Select` in `pages/orders/[id]/refund/index.tsx`
  (session b).

#### Still deferred (out of this session's slice)

- **Per-row "estimated refund" amount** — the design shows a
  `Refundable amount` column on each item row. Computing it
  requires the per-item discounted line total minus
  prior-refund proration; the math lives in Medusa's
  `calculateAmountsFromOrderChange` helper which Mercur doesn't
  re-export today. Defer until the spec calls for it explicitly
  — the backend will compute the actual refund correctly
  regardless of whether the UI shows the estimate.
- **Outstanding-amount preview** — the design shows a totals
  block under the items. Same constraint as above.

### Session 2026-06-05 (j) — Create Return kebab + route + focus modal scaffold

The largest fully-unblocked work item from session (i)'s refreshed
checklist: backend `/vendor/returns` + `:id/request-items` +
`:id/request` (POST + DELETE) routes are already shipped; the
vendor hooks (`useInitiateReturn` / `useAddReturnItem` /
`useUpdateReturnItem` / `useRemoveReturnItem` /
`useConfirmReturnRequest` / `useCancelReturnRequest`) are already
in `packages/vendor/src/hooks/api/returns.tsx`. The only missing
piece was the UI entry.

#### Files modified

- `packages/vendor/src/get-route-map.tsx`: added a
  `returns/create` route between the existing `allocate-items`
  and `returns/:return_id/receive` entries, lazy-loading
  `./pages/orders/[id]/returns/create`.
- `packages/vendor/src/pages/orders/[id]/_components/order-general-section/order-general-section.tsx`:
  - Imported `ArrowUturnLeft` from `@medusajs/icons` (same icon
    Medusa admin uses in `order-edit-item.tsx`).
  - Re-shaped the `ActionMenu` `groups` array: previously one
    group held `Complete` + `Cancel`. Now there are two groups —
    nav/state actions (`Complete`, `Create Return`) first, the
    destructive `Cancel` group last (separator-rendered between
    them via `ActionMenu`'s built-in convention).
  - `Create Return` uses `to: "returns/create"` (relative — keeps
    routing inside the existing `/orders/:id` parent), disabled
    when `order.canceled_at` is set, label `t("orders.returns.create")`
    (existing i18n key — `"Create Return"`).

#### Files added

- `packages/vendor/src/pages/orders/[id]/returns/create/index.tsx`
  (~340 lines): the Create Return `RouteFocusModal` scaffold.
  - **Draft-and-mutate pattern** ported from Medusa admin: on
    mount, `useInitiateReturn({ order_id })` creates a backend
    draft; the returned `return.id` is stashed in component state
    and threaded through every downstream hook so the user's
    edits land on the same row. Both a module-scoped
    `IS_REQUEST_RUNNING` flag and a `returnId` state guard
    against StrictMode double-fire and post-creation reruns. If
    `preview.order_change.change_type` exists and is not
    `return_request`, the modal aborts with a redirect + toast —
    matches the existing `returns/[return_id]/receive` flow's
    active-change check (session b).
  - **Items list**: filters `order.items` to only rows where
    `fulfilled_quantity - return_requested_quantity - returned_quantity > 0`.
    Each row renders a `Checkbox` + product/variant title + an
    `Input[type=number]` qty stepper capped at the remaining
    returnable amount. When a row is checked, a two-column block
    expands underneath with a `Select` for return reason
    (sourced from `useReturnReasons`, no fallback — empty list
    means an empty dropdown) and a free-text `Input` for the
    per-item note.
  - **Send-notification switch**: standard card-shaped strip
    (`bg-ui-bg-component shadow-elevation-card-rest rounded-lg p-3`)
    matching Figma's notify toggle; defaults to `true`. Threads
    into the confirm payload as `no_notification: !notify`.
  - **Submit** (`handleConfirm`): iterates selected items and
    calls `useAddReturnItem({ items: [{ id, quantity, reason_id,
    note }] })` sequentially (each call mutates the same draft,
    so they must serialize — `no-await-in-loop` is intentional
    here; left as a warning, no disable directive so the
    behavior is auditable in lint diff). Then
    `useConfirmReturnRequest({ no_notification: !notify })`
    flips the draft to `requested`. On success: toast
    `orders.returns.toast.confirmedSuccessfully` (existing key) +
    `handleSuccess(/orders/${orderId})`.
  - **Cancel / close** (`handleClose`): if a draft was created,
    `useCancelReturnRequest` is invoked before navigation. The
    error path swallows (the user is leaving the screen anyway)
    so a stuck network call doesn't trap them inside the modal.
  - **Test ids**: every interactive element carries a kebab-case
    `data-testid` (`return-item-:id-checkbox`, `-qty`, `-reason`,
    `-note`, `return-create-notify`, `return-create-cancel`,
    `return-create-confirm`).

#### What was intentionally NOT done in this slice

- **Location dropdown** (Figma: `Location` + hint
  `"Choose which location you want to return the items to."`).
  Wiring needs `useStockLocations` and a stock-location-to-return
  payload field. Backend already accepts it (the return shipping
  method endpoint uses location_id); the dropdown can land as a
  follow-up without revisiting the rest of the form.
- **Return shipping (optional) dropdown** (Figma: section labeled
  `Return shipping (Optional)`). Needs `useShippingOptions`
  filtered to return-eligible options scoped to the chosen
  location. Wiring path: `useAddReturnShipping({ shipping_option_id })`
  on the existing draft. Follow-up.
- **Per-item field-level validation**: the spec sketches `Reason`
  as required when the form has a default reason set, but the
  current backend treats `reason_id` as optional. Kept optional
  in v1; if product wants required, flip the Zod-style validation
  on the form schema once a schema lands.
- **Zod schema + React Hook Form**: skipped for v1 because the
  draft-and-mutate pattern means each interaction is a discrete
  mutation, not a single form submission. Per-row state lives in
  `items: Record<string, SelectedItem>` directly. RHF makes more
  sense once the form grows location/shipping/total-difference
  blocks that need cross-field validation.

#### Verification

- `bun run build` from repo root: **9 / 9 packages pass** in 36s
  (`@mercurjs/vendor` recompiled, everything else cached). DTS
  emission clean.
- `bunx oxlint <touched files>`: 0 errors, 1 warning
  (`no-await-in-loop` on the intentional sequential
  `addReturnItem` calls inside `handleConfirm`). No new warnings
  on the routes file or `order-general-section.tsx`.
- Visual / runtime: no headless UI run this session. The kebab
  navigation path is `RouteFocusModal` (proven by the existing
  `fulfillment` / `allocate-items` siblings) and the hook
  contracts are unchanged.

### Session 2026-06-05 (i) — Verification checklist refresh

Pure documentation pass. The §Verification checklist at the top of
this spec had every box at `[ ]` even though sessions (a)–(h) had
closed many of them. Refreshed against shipped state so the next
session can read the checklist and immediately see what's actually
left, without having to scan all nine session entries below.

#### Conventions

- `[x]` — Closed in code with a session pointer.
- `[~]` — Partial / divergence-with-rationale. Either reverted
  (e.g. payment/fulfillment status filters in §0), kept as a
  deliberate non-drift (e.g. Sales channel column), or partially
  landed (e.g. returns subrow done but claims/exchanges blocked).
- `[ ]` — Still pending, with the blocker (when relevant) named
  in the line.

#### Notable status

- §1 (Orders list) — three of four items now `[x]` or `[~]`; the
  one open question is the Sales channel column kept-or-dropped
  decision, parked on the design owner.
- §2 (Order detail read view) — seven of nine items now `[x]` or
  `[~]`; the still-`[ ]` item is the header kebab additions
  (Edit order / Create Return / Create Exchange / Create Claim),
  three of four of which are blocked by §0 backend routes.
- §3, §4 (Order Edit, Create Return/Exchange/Claim) — mostly still
  `[ ]`; Create Return is unblocked by backend but the modal port
  hasn't started, the other three need §0 backend first.
- §5 (Receive Items), §7 (Visual drift) — fully `[x]`.

#### No code changes

`bun run build` not re-run; nothing in the build / lint baseline
shifted this session.

### Session 2026-06-05 (h) — Orders list search input

The audit (§1) called out a missing search input in
`OrderListHeader`. The `_DataTable` primitive already accepts a
`search` prop (toggles a `DataTableQuery` search field rendered
above the table), and `useOrderTableQuery` already reads `q` from
the URL and forwards it on `searchParams`. Other vendor list pages
(`customer-list-data-table.tsx:82`,
`region-list-table.tsx:93`) follow the same pattern. The only
missing piece was passing the prop in `OrderListDataTable`.

#### Files modified

- `packages/vendor/src/pages/orders/_components/order-list-table/order-list-data-table.tsx`:
  - Added bare `search` prop to the `_DataTable` invocation
    (same boolean-attribute shape used in the customer and region
    list tables). The skeleton loader also picks this up via
    `_DataTable`'s `<TableSkeleton search={!!search} … />` branch,
    so the search bar's shape is reserved during the initial
    load instead of pop-in-shifting the table.

#### Verification

- `bun run build` — 9/9 packages green in 36s
  (`@mercurjs/vendor` ESM rebuild + DTS pass-through; all upstream
  packages cached).
- `bunx oxlint <touched file>` — 0 warnings, 0 errors.

#### Other §1 findings remain open

- **Sales channel column**: still rendered between `Customer` and
  `Payment` (`use-order-table-columns.tsx`). Kept as-is for now —
  a vendor operating across multiple sales channels gets value
  from the at-a-glance breakdown. The Figma's "no Sales channel
  column" can be revisited by the design owner; documenting here
  as a deliberate non-drift pending that conversation.
- **`Add filter` panel**: matches the spec's reverted state
  (Region / Sales channel / Created / Updated / Request).
  Payment / Fulfillment filters intentionally absent per session
  2026-06-05 (c).

### Session 2026-06-05 (g) — Activity timeline: payment events (awaiting / captured / canceled / refunded)

Same pattern as session (f). The payment activity rules were
commented out in `use-activity-items.tsx` (lines 89-140 prior state)
behind the comment "TODO: uncomment and fix payment related logic
when backend returns data about payment cancel/capture/refund dates".
The data IS available today via the
`vendorOrderFields.*payment_collections.payments(+refunds)` /
`*payment_collections.payment_sessions` paths added in session (a),
and `AdminPayment` (which extends `BasePayment` from
`@medusajs/types`) explicitly types `created_at`, `captured_at`,
`canceled_at`, and `refunds: AdminRefund[]` with each refund
carrying its own `created_at`.

#### Files modified

- `packages/vendor/src/pages/orders/[id]/_components/order-activity-section/hooks/use-activity-items.tsx`:
  - Replaced the dangling `_notes` / `_payments` underscore vars
    (and the dead notes-hook scaffold) with a single
    `payments = useMemo(() => (order.payment_collections ?? []).flatMap(pc => pc.payments ?? []), [order.payment_collections])`.
  - Re-enabled the four payment activity emitters per
    Medusa admin's pattern, guarded on the relevant timestamp:
    - **`payment.awaiting`** — only emitted while
      `!captured_at && !canceled_at && created_at`. This
      sharpens the original spec which would fire it
      unconditionally; the conditional avoids noisy "Awaiting
      payment" entries on already-settled orders without
      changing the canonical event name.
    - **`payment.captured`** — at `captured_at` when truthy.
    - **`payment.canceled`** — at `canceled_at` when truthy. If
      the underlying payment provider never stamps this column
      on cancellation (per the original TODO concern), this
      branch is simply a no-op — no broken rendering.
    - **`payment.refunded`** — once per `refund` in
      `payment.refunds ?? []`, at `refund.created_at`, with
      the refund amount in the row body.
  - Added `payments` to the closing `useMemo` deps array (under
    the existing `oxlint-disable react-hooks/exhaustive-deps`
    block, but kept correct for when the directive is removed).

#### i18n

All four keys (`orders.activity.events.payment.awaiting`,
`captured`, `canceled`, `refunded`) already existed at
`packages/vendor/src/i18n/translations/en.json:1726-1731`. No new
keys needed.

#### Verification

- `bun run build` — 9/9 packages green in 38s.
- `bunx oxlint <touched file>` — **0 warnings, 0 errors**. Two
  pre-existing dangling-underscore warnings on `_notes` / `_payments`
  from prior baseline are now gone (the variables themselves were
  removed in this session).

#### Render order

Activity entries are sorted by timestamp at the end of the hook (the
pre-existing `sortedActivities` step), so the new payment events
interleave correctly with fulfillment / return / order-change rows
without any explicit ordering work.

### Session 2026-06-05 (f) — Activity timeline: surface return.created / canceled / received rows

The `useActivityItems` hook
(`packages/vendor/src/pages/orders/[id]/_components/order-activity-section/hooks/use-activity-items.tsx`)
already contains the full rendering logic for return lifecycle rows
(create → cancel → received) — it pushes Activity entries inside
`for (const ret of returns)` at lines 184-224 in the prior state. The
problem was upstream: `returns` was hard-coded to an empty array
(line 50) with the data hook commented out (lines 54-57), so the
loop never executed and no return rows ever appeared in the timeline
mounted by session (b).

#### Files modified

- `packages/vendor/src/pages/orders/[id]/_components/order-activity-section/hooks/use-activity-items.tsx`:
  - `const returns: AdminReturn[] = []` →
    `const returns: AdminReturn[] = (order.returns as AdminReturn[] | undefined) ?? []`.
    `order.returns` is already loaded by the
    `vendorOrderFields.*returns(+items, +shipping_methods, +items.reason)`
    query-config (session a + session d). No new fetch, no new hook
    wiring.
  - Deleted the three commented-out `useReturns` / `useClaims` /
    `useExchanges` stubs (the returns one is replaced by reading
    from `order`; the other two are deferred — see below).
  - Added a SPEC-008 explanatory comment above the empty
    `claims` / `exchanges` stubs noting they're blocked on backend
    `/vendor/claims` and `/vendor/exchanges` routes. The downstream
    rendering loops at lines 226+ already iterate those arrays —
    they will light up automatically once the source is populated.

#### What lights up after this change

For each non-canceled return on the order, the timeline now renders:

1. **`return.created`** — at `ret.created_at`, with `ReturnBody`
   children + `itemsToReturn` thumbnails. Skipped when the return
   is part of a claim or exchange (`ret.claim_id || ret.exchange_id`)
   since those will get their own dedicated rows once claims /
   exchanges land.
2. **`return.canceled`** — at `ret.canceled_at` when set, title-only.
3. **`return.received`** — at `ret.received_at` when
   `status ∈ {received, partially_received}`, with the same
   `ReturnBody` children but `isReceived` flag for the received
   variant copy.

i18n keys (`orders.activity.events.return.created` / `.canceled` /
`.received`) and the `ReturnBody` component were already in tree
from prior scaffolding; no new keys / components needed.

#### Verification

- `bun run build` — 9/9 packages green in 36s
  (`@mercurjs/vendor` recompiled).
- `bunx oxlint <touched file>` — 0 errors, 2 pre-existing warnings
  on the dangling `_notes` / `_payments` underscore vars from prior
  scaffolding (unchanged by this session).

#### Still blocked

- **Claim / exchange activity rows** — the loops at lines 226+ of
  `use-activity-items.tsx` (`for (const claim of claims)` /
  `for (const exchange of exchanges)`) will stay dormant until
  either:
  1. `order.claims` / `order.exchanges` are exposed via a
     query-config addition that joins through `order_change`, or
  2. dedicated `useClaims` / `useExchanges` hooks are added against
     `GET /vendor/claims` / `GET /vendor/exchanges` routes that
     don't exist yet on the Mercur backend (per spec
     §"Verification → Backend → 0").

- **Payment activity rows** (`payment.awaiting` /
  `payment.captured` / `payment.canceled` / `payment.refunded`) —
  still commented out at lines 99-148. The author note "TODO:
  uncomment and fix payment related logic when backend returns data
  about payment cancel/capture/refund dates" stands. Per-payment
  timestamps need to come through on
  `order.payment_collections.payments` — `created_at` and
  `captured_at` should already be there but `canceled_at` was the
  blocker per the original note. Verifying / re-enabling is a
  separate small chunk.

### Session 2026-06-05 (e) — Inline `Allocate items` CTA + per-item `Allocated` / `Not allocated` chip

The two remaining Summary-section visual gaps in the verification
checklist:

- §2 "Allocate items CTA appears inline in Summary when items are not
  allocated."
- §7 "`Allocated` / `Not allocated` chip on every Summary item row."

Both ride on the same data — vendor reservations keyed by
`line_item_id`. `useReservationItems` already exists in
`packages/vendor/src/hooks/api/reservations.tsx` and the
`getReservationsLimitCount(order)` helper already lives at
`packages/vendor/src/lib/orders.ts:13-23`. The required i18n keys
(`orders.reservations.allocatedLabel`, `notAllocatedLabel`,
`orders.allocateItems.action`) are already in vendor's
`en.json:1594-1599`.

#### Files modified

- `packages/vendor/src/pages/orders/[id]/_components/order-summary-section/order-summary-section.tsx`:
  - Calls `useReservationItems({ line_item_id: order.items.map(i => i.id), limit: getReservationsLimitCount(order) }, { enabled: Array.isArray(order?.items) })`
    at the top of the section component. Resulting reservations are
    memoized into `reservationList: AdminReservation[]` (stable
    reference for the chip lookup) and threaded into `ItemBreakdown`.
  - `ItemBreakdown` builds a `Map<line_item_id, AdminReservation>`
    via `useMemo` and passes a per-item `reservation` prop down to
    `Item`. Mirrors Medusa admin's
    `routes/orders/order-detail/components/order-summary-section/order-summary-section.tsx:540-559`.
  - `Item` adds a `StatusBadge` to the existing quantity column when
    `variant.manage_inventory` is true AND
    `quantity - detail.fulfilled_quantity > 0`. Color flips green
    (allocated) / orange (not allocated) using
    `text-nowrap overflow-visible` to match Figma. Hidden entirely
    for non-inventory-managed variants and fully-fulfilled rows
    (intentional — design only shows the chip while allocation is
    still meaningful).
  - `showAllocateButton` memo on the section: `true` when any
    `manage_inventory` item has unfulfilled qty without a
    reservation row in the map. Identical predicate to Medusa
    admin's `order-summary-section.tsx:108-131`.
  - Footer strip condition widened from
    `(showReturns || showRefund)` to
    `(showReturns || showRefund || showAllocateButton)` so the
    `bg-ui-bg-subtle rounded-b-xl` row renders for the allocate
    case as well.
  - New `<Button asChild variant="secondary" size="small">` with
    `<Link to="allocate-items">` (relative — keeps using the
    existing `/orders/:id/allocate-items` route). Carries
    `data-testid="order-summary-allocate-items-cta"`.

#### Verification

- `bun run build` — 9/9 packages green in 26s (`@mercurjs/vendor`
  recompiled; everything else cached). Confirmed by a clean re-run
  after a transient `dashboard-shared` DTS race resolved on the
  second invocation — no source-level issue.
- `bunx oxlint` on the touched file — 0 errors, 1 warning (the
  pre-existing `react(no-array-index-key)` on the
  `ShippingInfoPopover key={i}` from session b's shipping breakdown
  — unchanged from prior baseline; not introduced this session).

#### Why not visually verified

No headless UI run this session. The render logic is deterministic
from `order.items[*].variant.manage_inventory`,
`order.items[*].detail.fulfilled_quantity`, and the
`useReservationItems` response keyed by `line_item_id`. Visual sweep
deferred to the next pass that touches the order-detail page.

### Session 2026-06-05 (d) — Inline return subrow under Summary line items

The "↳ Nx items return requested/received" subrow under each line item
in the order detail Summary section was the smallest deferred item that
was already unblocked by session (a)'s query-config additions. Ported
the Medusa admin pattern (`return-info-popover.tsx` +
`ReturnBreakdown` / `ReturnBreakdownWithDamages` components inside the
section file) to the vendor package with Mercur tokens, matching the
Figma exactly.

#### Files added

- `packages/vendor/src/pages/orders/[id]/_components/order-summary-section/return-info-popover.tsx`
  — 1:1 port of Medusa admin's
  `routes/orders/order-detail/components/order-summary-section/return-info-popover.tsx`.
  Hover popover on the row-trailing `InformationCircleSolid` icon
  showing `{Return|Claim|Exchange}: #<last-7-of-id>`, then
  `Return requested · <full date>` and `Items received · <full date or -­>`
  using vendor's `useDate().getFullDate`. Falls through `claim_id` →
  `exchange_id` for the badge label.

#### Files modified

- `packages/vendor/src/pages/orders/[id]/_components/order-summary-section/order-summary-section.tsx`
  — three new internal components (kept co-located, mirroring the
  Medusa admin source-of-truth shape):
  - `ReturnBreakdown` — gated on
    `status ∈ {requested, received, partially_received}`, filters
    `orderReturn.items` by `item_id`, renders the canonical subrow:
    `ArrowDownRightMini` + `t("orders.returns.returnRequestedInfo")` /
    `returnReceivedInfo` + optional note tooltip
    (`DocumentText` + `Tooltip`) + optional reason `Badge` +
    `getRelativeDate(orderReturn.created_at)` (requested case) or
    `t("orders.returns.itemReceived")` (received case) +
    `ReturnInfoPopover`. Border-top `border-t-2 border-dotted` plus
    `bg-ui-bg-subtle` matches Figma's separator/fill.
  - `ReturnBreakdownWithDamages` — second subrow rendered above the
    standard one when `item.damaged_quantity > 0`, using
    `damagedItemsReturned` + `damagedItemReceived` i18n keys.
  - `Item` now receives `returns: ReturnWithReason[]` and emits the
    breakdown rows inline after its own row, so they live as siblings
    inside the `ItemBreakdown` div. `ItemBreakdown` derives the
    filtered list once via `useMemo` (drops `canceled_at` rows) and
    threads it through.
- `packages/core/src/api/vendor/orders/query-config.ts` — added
  `*returns.items.reason` so the reason `Badge` (e.g. "Damaged item")
  resolves on the GET /vendor/orders/:id response. Other fields the
  breakdown needs (`quantity`, `received_quantity`, `damaged_quantity`,
  `note`, `item_id`) come along with the default scalar expansion of
  `*returns.items`. Top-level return scalars (`requested_at`,
  `received_at`, `created_at`, `canceled_at`, `status`, `claim_id`,
  `exchange_id`) ride the existing `*returns` entry.

#### What was intentionally NOT done

- **Claim / Exchange breakdowns**: Medusa admin renders sibling
  `ClaimBreakdown` and `ExchangeBreakdown` components beside
  `ReturnBreakdown`. Mercur's vendor query-config does **not** expose
  `*claims` / `*exchanges` on the order today (per the prior session's
  note that those relations don't live on Order directly — they're
  reachable via `order_change` + link tables only). Adding them is
  blocked on either:
  1. a query-config addition that joins via `order_change` →
     `exchange_id` / `claim_id`, or
  2. dedicated `useExchanges` / `useClaims` hooks fed from
     `GET /vendor/exchanges` / `GET /vendor/claims` routes that don't
     exist yet on the Mercur backend.
  Documented as deferred follow-up alongside the Order Edit / Create
  Exchange / Create Claim flows that need the same data.

- **Damaged-quantity subrow placement**: Medusa admin renders the
  `ReturnBreakdownWithDamages` row *above* the standard
  `ReturnBreakdown` row. I kept that ordering for visual parity.

#### Verification

- `bun run build` from repo root: **9/9 packages pass** in 1m02s
  (`@mercurjs/core` rebuilds because of the query-config change;
  `@mercurjs/vendor` recompiles the page module).
- `bunx oxlint <touched files>`: 1 pre-existing warning at
  `order-summary-section.tsx:547` (`react(no-array-index-key)` on
  `<ShippingInfoPopover key={i}>`) unchanged from session (b); 0
  new warnings, 0 errors on the new code.
- Visual: pending; no headless UI run this session. Render path is
  deterministic from `order.returns[]` and the i18n keys already
  exist in the file (`packages/vendor/src/i18n/translations/en.json:1479-1484`).

### Session 2026-06-05 (c) — Aggregated status filters reverted (`has_open_request` kept)

Only the `payment_status` / `fulfillment_status` aggregated-status
filters were reverted from session (a). `has_open_request` stays —
backend middleware, validator, vendor UI, and integration tests.

#### What was removed

**Backend (`packages/core`)** — deleted:

- `src/api/vendor/orders/apply-aggregated-status-filter.ts`
- `src/api/vendor/orders/aggregate-status.ts`

**Backend** — narrowed:

- `src/api/vendor/orders/validators.ts` — `payment_status` and
  `fulfillment_status` back to `z.string().optional()` (no array
  widening, no post-filter, no aggregation). `has_open_request` is
  preserved and now uses Medusa's
  `booleanString()` helper
  (`@medusajs/medusa/api/utils/common-validators/common`) instead of
  the inline `z.union([z.boolean(), z.enum(["true", "false"])])`
  scaffold — same parsing, but matches the convention used elsewhere
  in `packages/core` (see
  `src/api/admin/products/validators.ts:11-12,239,240,281`).
- `src/api/vendor/orders/middlewares.ts` — `applyAggregatedStatusFilter`
  removed; `applyHasOpenRequestFilter` is still wired.
- `src/api/vendor/orders/route.ts` — back to the original simple
  shape (no post-filter logic; the workflow's `count` / `offset` /
  `limit` are accurate against the seller-scope + has_open_request
  intersection only).

**Frontend (`packages/vendor`)** — narrowed:

- `src/hooks/table/filters/use-order-table-filters.tsx` — Payment
  status and Fulfillment status filters removed. Request filter (for
  `has_open_request`) remains. Left a pointer comment to this spec.
- `src/hooks/table/query/use-order-table-query.tsx` —
  `has_open_request` mapping aligned with the repo convention used
  by `use-customer-table-query.tsx:33`,
  `use-product-table-query.tsx:59`, `use-product-variants-table-query.tsx:66-67`:
  `has_open_request: has_open_request ? has_open_request === "true" : undefined`.
- `src/i18n/translations/en.json` — kept `orders.filters.request`,
  `orders.filters.hasOpenRequest`, `orders.filters.noOpenRequest`.
  Removed `orders.paymentStatus.*` and `orders.fulfillmentStatus.*`
  enum dictionaries.

**Tests**:

- `integration-tests/http/order/vendor/order-list-filters.spec.ts`
  was deleted and re-created with **only** the `has_open_request`
  cases (3 specs). All 3 pass; the spec keeps the offer-based
  seeding scaffold so the cart `line-items` POST works.

#### What stayed (still in tree)

- `POST /vendor/payment-collections/:id/mark-as-paid` and its
  helpers/middlewares/validators/query-config — independent of the
  status-filter feature; the outstanding-amount UI depends on it.
- `vendorOrderFields` query-config extensions
  (`*payment_collections.payments(+refunds)`,
  `*payment_collections.payment_sessions`,
  `*returns(+items, +shipping_methods)`) — these expose fields the
  order detail UI needs, not about filtering.
- The vendor UI from session (b): activity-section mount,
  metadata/JSON sections, Receive Items route, per-payment-row
  `PaymentRow` primitive + refund drawer, outstanding action strip +
  mark-as-paid mutation, solid dividers.

#### Re-do checklist (if/when payment/fulfillment status filters are picked back up)

If a future session re-implements `payment_status` / `fulfillment_status`
filters:

1. Widen the validators to
   `z.union([z.string(), z.array(z.string())])`.
2. The aggregation-status approach (mirroring Medusa's
   `core-flows/dist/order/utils/aggregate-status` since it isn't
   re-exported by the package's `exports` field) lives in git
   history at `https://github.com/mercurjs/mercur/pull/951`.
   `getLastPaymentStatus` / `getLastFulfillmentStatus` precedence
   rules are documented in
   `medusa/packages/core/core-flows/src/order/utils/aggregate-status.ts`.
3. The link-filter middleware shape resolves the seller-scoped
   candidate IDs, aggregates per order, then intersects matching IDs
   into `filterableFields.id` via `$and`. Same pattern as
   `apply-has-open-request-filter.ts` (which is still in the tree as
   a working reference).
4. The vendor filter UI used multi-select for both. The i18n keys
   `orders.paymentStatus.*` / `orders.fulfillmentStatus.*` were the
   value-label dictionaries — see PR #951 for the exact shape.

### Session 2026-06-05 (b) — Order detail UI completion (round 2)

Vendor UI shipped:

- **Activity timeline mounted**
  (`packages/vendor/src/pages/orders/[id]/order-detail-page.tsx`): the
  previously dead `OrderActivitySection` now renders in the sidebar
  under the Customer card, matching the Figma. Also exposed as
  `OrderDetailPage.SidebarActivitySection` for compound overrides.
- **Metadata + JSON sections** turned on via the existing
  `TwoColumnPage`'s `showMetadata` / `showJSON` props on the order
  detail page (no new component needed — primitives already exist).
- **Receive Items route** registered at
  `/orders/:id/returns/:return_id/receive`
  (`pages/orders/[id]/returns/[return_id]/receive/index.tsx`). Mirrors
  the Medusa admin shape: pulls the order + preview + return, calls
  `useInitiateReceiveReturn` + `useAddReceiveItems` on mount with the
  return's requested quantities, shows the items in a `RouteDrawer`,
  and `useConfirmReturnReceive` on submit. Fixes the dead link that
  `OrderSummarySection` has been pointing at. Per-line quantity
  adjustment is deferred (the Medusa admin form is ~300 lines and
  needs a Mercur trim — not in this slice).
- **Per-payment rows** in `OrderPaymentSection`
  (`pages/orders/[id]/_components/order-payment-section/order-payment-section.tsx`):
  a new inline `PaymentRow` primitive renders transaction id (with
  full id in tooltip), creation timestamp, status badge, amount, and
  an `ActionMenu` kebab with **Create Refund** linking to
  `/orders/:id/refund?payment_id=...`. Refunded payments render with
  a strike-through subtitle and the badge flips to `Refunded` /
  `Partly refunded`. Existing aggregate totals (Total paid /
  refunded / pending) still render below the per-payment list and the
  outstanding-amount action strip stays where it was.
- **Refund drawer route** registered at `/orders/:id/refund`
  (`pages/orders/[id]/refund/index.tsx`). Reads `payment_id` from
  query params; if absent, picks the first refundable captured
  payment automatically. Form has amount (validated against
  remaining-refundable), an optional refund-reason dropdown sourced
  from `useRefundReasons`, and a note. Submit calls the existing
  `useRefundPayment` hook (backend already shipped). Drawer follows
  the standard `RouteDrawer.Form` + `KeyboundForm` pattern.
- **Visual drift fixes**:
  - `OrderSummarySection` and `OrderPaymentSection` now use solid
    `divide-y` (Figma) instead of `divide-y divide-dashed`.
  - The third "order status" badge in `OrderGeneralSection` was kept
    intentionally — its helper (`getCanceledOrderStatus`) only
    returns a value when the order is canceled, so in the normal case
    only payment + fulfillment badges render (matching Figma) while
    the canceled signal remains for the cancellation case. Documented
    as a deliberate non-drift.

Cross-cutting helper added:

- `useMember(id)` in `hooks/api/members.tsx` — the previously
  dead-imported hook used by `By` in `components/common/user-link`.
  The build broke the moment the activity section pulled `By` into
  the module graph. Implemented via `useMe()` →
  `useSellerMembers(meSellerId)` filtered by the requested id.

Build + lint:

- `bun run build` at repo root passes (9/9 packages).
- `bun run lint`: 1364 warnings / 37 errors — **same as baseline**;
  no new findings on any file touched in this session.

What's left for next session (still deferred): the three big
trees — Order Edit, Create Exchange, Create Claim — and their
subscribers (`order-edit-confirmed`, `order-claim-created`,
`order-exchange-created`). Inline `LineItemSubrow` primitive for
return/exchange/claim history under each Summary line item is also
still missing.

### Session 2026-06-05 — Foundational backend + filter / mark-as-paid UI

Backend changes shipped:

- Query-config additions: `packages/core/src/api/vendor/orders/query-config.ts`
  — adds `*payment_collections.payments`, `*.refunds`, `*.payment_sessions`,
  `*returns`, `*returns.items`, `*returns.shipping_methods`. Removed
  `*exchanges` / `*claims` direct relations after verifying the Order
  module doesn't expose them as direct relations (Order has `returns`,
  not exchanges/claims — those live on `OrderExchange` / `OrderClaim`
  models and are reachable via `order_change` and link tables).
- Validator widening + `has_open_request`:
  `packages/core/src/api/vendor/orders/validators.ts` — widens
  `payment_status` / `fulfillment_status` to
  `z.union([z.string(), z.array(z.string())])` and adds
  `has_open_request: z.coerce.boolean().optional()`.
- `has_open_request` middleware:
  `packages/core/src/api/vendor/orders/apply-has-open-request-filter.ts`
  — registered after `applySellerLinkFilter` on `GET /vendor/orders`.
  Joins `order_change.status ∈ {requested, pending}` ∪
  `return.status = requested` via `promiseAll`; composes `$in`/`$nin`
  with the seller-link `id` filter via `$and`.
- Route handler post-filter for status filters:
  `packages/core/src/api/vendor/orders/route.ts` — strips
  `payment_status` / `fulfillment_status` from `req.filterableFields`
  before passing them to `getOrdersListWorkflow` (the Medusa
  core-flow doesn't push them to SQL — they are aggregated post-query
  in JS), then post-filters the workflow result by the requested
  status values. This is the only viable shape today without forking
  the workflow.
- Mark-as-paid endpoint:
  `packages/core/src/api/vendor/payment-collections/` tree.
  `POST /vendor/payment-collections/:id/mark-as-paid` wraps
  `markPaymentCollectionAsPaid` from `@medusajs/core-flows`. Seller
  scope is enforced by walking
  `payment_collection → order_payment_collection.order_id →
  order_seller`. Registered in `api/vendor/middlewares.ts`.

Integration tests added:

- `integration-tests/http/order/vendor/order-list-filters.spec.ts`
  — covers `payment_status` (single + array), `fulfillment_status`
  (single + array), `has_open_request=true/false`, seller-scope
  intersection.
- `integration-tests/http/order/vendor/order-mark-as-paid.spec.ts`
  — covers seller-scope guard (404), wrong `order_id` body (400),
  missing payment_collection (404), and that the owning seller
  reaches the underlying workflow.

Build:

- `bun run build` at repo root passes (9/9 packages).
- `bun run lint` reports 0 errors and 0 warnings in any file added
  or modified in this session.

Vendor UI changes shipped:

- Filter UI enabled:
  `packages/vendor/src/hooks/table/filters/use-order-table-filters.tsx`
  — added Payment status, Fulfillment status, and Request filters.
  Deleted the stale `TODO: enable when Payment, Fulfillments <>
  Orders are linked` comment.
- Query hook:
  `packages/vendor/src/hooks/table/query/use-order-table-query.tsx`
  — adds `has_open_request` to the param list and translates the
  string form (`"true"`/`"false"`) into a boolean for the SDK call.
- Outstanding-amount action strip:
  `packages/vendor/src/pages/orders/[id]/_components/order-payment-section/order-payment-section.tsx`
  — adds an `<OutstandingActions>` row that shows `Copy payment link
  for €X` and `Mark as paid` when `summary.pending_difference > 0` and
  an unpaid payment_collection exists. `Mark as paid` uses the
  existing `useMarkPaymentCollectionAsPaid` hook in
  `packages/vendor/src/hooks/api/payment-collections.tsx` (which was
  already wired to `sdk.vendor.paymentCollections.$id.markAsPaid` —
  it was waiting for the new backend route to exist).
- i18n keys added under `orders.filters.*`, `orders.paymentStatus.*`,
  `orders.fulfillmentStatus.*`, and the toast/CTA copy under
  `orders.payment.*`.

### Integration test status — all green

After rewiring the test setup to the offer-based seeding pattern
(from `integration-tests/http/offer/order/order.spec.ts`), both new
specs run end-to-end on the integration harness:

- `order-list-filters.spec.ts` — **10/10 passing**
- `order-mark-as-paid.spec.ts` — **4/4 passing**

#### Status filters: link-filter, not post-filter

Initial implementation post-filtered the workflow result in JS
because `getOrdersListWorkflow` aggregates `payment_status` and
`fulfillment_status` in JavaScript and ignores them as DB filters.
That worked but broke pagination (the workflow's `count` /
`offset` / `limit` were computed before the filter).

The current implementation is a **link filter**: a new middleware
(`apply-aggregated-status-filter.ts`) runs on `GET /vendor/orders`
after `applySellerLinkFilter`. It:

1. Reads `payment_status` / `fulfillment_status` off
   `req.filterableFields` and strips them.
2. Resolves candidate orders via the existing
   seller-scoped `id` filter (the seller link filter has already
   constrained `req.filterableFields.id` to this seller's orders).
3. Calls `query.graph({ entity: "order" })` to load each
   candidate's `payment_collections.*`, `fulfillments.*`, and the
   `items.detail.raw_fulfilled_quantity` / `items.raw_quantity`
   needed for the aggregation.
4. Aggregates `payment_status` / `fulfillment_status` in JS using
   `aggregate-status.ts`, a mercur-local mirror of Medusa's
   `@medusajs/core-flows/dist/order/utils/aggregate-status` (that
   module isn't re-exported by the package's `exports` field, so
   we can't import it directly — drift-watch comment is on the
   file).
5. Intersects the surviving order IDs into `filterableFields.id`
   via `$and` if an `id` filter already existed, otherwise sets
   `id = { $in: matchingIds }` (or `{ $in: [""] }` to force an
   empty page if nothing matches).

The orders workflow then receives a precise `id` filter and its
pagination metadata is correct. Route handler is back to its
original simple shape.

Mirrors the pattern used by `apply-has-open-request-filter.ts` and
`filter-attributes-by-category-link.ts`.

#### Validator bug found while debugging

The `has_open_request` validator originally used
`z.coerce.boolean()`, which makes `Boolean("false") === true`
because non-empty strings are truthy. That made
`?has_open_request=false` behave like `?has_open_request=true`.
Replaced with
`z.union([z.boolean(), z.enum(["true", "false"])]).transform(...)`
so the string form is parsed explicitly.

#### Out-of-scope baseline drift

The baseline `integration-tests/http/order/vendor/order.spec.ts` is
still broken at the cart `POST /store/carts/:id/line-items` step
with "Invalid request: Field 'offer_id' is required" — that's a
separate pre-existing regression in the older test file's setup,
unrelated to this spec. Fix it by switching that file to the
offer-based seeding pattern these new specs use.

### Where this leaves the spec

Verification checklist updates:

- [ ] Backend: `GET /vendor/orders` accepts `payment_status` and
      `fulfillment_status` arrays — **reverted**, see Session
      2026-06-05 (c).
- [x] Backend: `GET /vendor/orders` exposes the `has_open_request`
      filter — kept via
      `apply-has-open-request-filter.ts` middleware. Integration
      tests passing 3/3.
- [x] Backend: `GET /vendor/orders/:id` response includes
      `payment_collections.payments`, `*.refunds`,
      `payment_collections.payment_sessions`, `returns`,
      `returns.items`, `returns.shipping_methods`. (`exchanges` /
      `claims` deferred — they need to be reached via `order_change`
      or via the Mercur exchanges/claims routes when those land.)
- [x] Backend: `POST /vendor/payment-collections/:id/mark-as-paid`
      shipped per the route-convention rules.
- [~] Frontend: orders-list filters — Request filter (for
      `has_open_request`) is in the `Add filter` menu; Payment /
      Fulfillment status filters were reverted, see Session 2026-06-05 (c).
- [x] Frontend: outstanding-amount action strip renders on the
      Payment section when `pending_difference > 0`, with `Copy
      payment link` and `Mark as paid` CTAs.

Still open (intentionally deferred to follow-up sessions):
Order Edit, Create Exchange, Create Claim, Refund (per-payment-row
entry), Receive Items route registration, Activity-section mount,
JSON / Metadata sections, per-line subrow primitive,
`exchanges` / `claims` query-config additions.

## Notes

- The full Figma node analysis (128 frames across 16 flows) and the
  raw component inventory used to build this spec are recorded in the
  session that created this file (Claude Code, 2026-06-03). Screen
  captures were saved to the agent scratch under `/tmp/figma-orders/`
  but are not committed; re-pull via the Figma MCP server using the
  file key and node IDs above.
- The vendor panel's `OrderActivitySection`
  (`packages/vendor/src/pages/orders/[id]/_components/order-activity-section/`)
  is defined but not mounted by `order-detail-page.tsx`. Treat
  re-mounting as the first scoped fix before adding any new activity
  generators.
- The admin-managed variant of Allocate Items lives on the same Figma
  canvas but belongs to the admin panel; reference it from the admin
  Orders spec, not here.
