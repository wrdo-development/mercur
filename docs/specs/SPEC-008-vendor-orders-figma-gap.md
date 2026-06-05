---
status: not_started
canonical: false
priority: 2
area: vendor/orders
created: 2026-06-03
last_updated: 2026-06-03  # Backend gap section added (`packages/core` audit): filters, missing route adapters, query-config additions, RBAC, integration tests.
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
| Transfer Ownership | `40013324:306766` | 63374 | Header kebab → Transfer ownership flow |

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
    Exchange`, `Create Claim`, `Transfer ownership`. Code kebab
    actions: `Complete`, `Cancel`. Almost the entire menu is missing
    (see below).
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

### Transfer Ownership (`y=63374`)

- **Kebab entry** — Missing.
- **Modal/drawer flow** — Missing.
- **Activity entry** — Missing.

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
  generators (Edit / Return / Exchange / Claim / Refund / Transfer
  ownership), or delete the dead component.
- **Metadata + JSON sections.** Add `MetadataSection` and
  `JsonViewSection` (already available from `@mercurjs/dashboard-shared`)
  at the bottom of the Main column.

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

### Filter gap — frontend only

The Orders-list filter discrepancy noted in the UI audit is **not** a
backend gap. `VendorGetOrdersParams`
(`orders/validators.ts:11-29`) already accepts every filter the design
requires:

- `q` (full-text search) ✅
- `status` ✅
- `payment_status` ✅
- `fulfillment_status` ✅
- `sales_channel_id` ✅
- `region_id` ✅
- `customer_id` ✅
- `currency_code` ✅
- `created_at` / `updated_at` (operator map) ✅

The vendor UI hook (`hooks/table/filters/use-order-table-filters.tsx:64-66`)
explicitly leaves `payment_status` and `fulfillment_status` commented
out with `TODO: enable when Payment, Fulfillments <> Orders are linked`.
That linkage now exists via the `order_seller` link middleware and the
fields are populated in the list query (`order-list-data-table.tsx:18-33`).
The comment is stale — re-enable them.

The only filter on the design that has **no backend equivalent today**
is the design's `Request` filter (refund / return / exchange / claim /
edit pending). To support it, add a derived filter — either:

1. a virtual `has_open_request: boolean` parameter on
   `VendorGetOrdersParams` that joins through `order_change.status` /
   `return.status`, **or**
2. a `request_status` enum (`none | pending_refund | pending_return |
   pending_exchange | pending_claim | pending_edit`) populated via a
   custom workflow step on the list query.

Recommend (1) for Phase 1 — it is a single boolean derived from
`order_change.status IN ('requested', 'pending')` plus
`return.status = 'requested'`. (2) is forward-compatible if the
design later needs sub-filtering.

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

Routes to add (mirroring admin precedent):
- `POST   /vendor/orders/:id/edits` (begin)
- `POST   /vendor/orders/:id/edits/items` (add item)
- `POST   /vendor/orders/:id/edits/items/item/:action_id` (update add-item action)
- `POST   /vendor/orders/:id/edits/items/:item_id` (update qty)
- `DELETE /vendor/orders/:id/edits/items/:action_id`
- `POST   /vendor/orders/:id/edits/shipping-method` + `:action_id` (POST/DELETE)
- `POST   /vendor/orders/:id/edits/request` (move from draft → requested; Figma "Order edit request")
- `POST   /vendor/orders/:id/edits/confirm` (Figma "Force confirm")
- `DELETE /vendor/orders/:id/edits` (cancel)

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

Routes:
- `POST   /vendor/exchanges` (begin from order)
- `GET    /vendor/exchanges`, `GET /vendor/exchanges/:id` (list + retrieve, scoped)
- `POST   /vendor/exchanges/:id/inbound/items` + `:action_id` (POST/DELETE)
- `POST   /vendor/exchanges/:id/outbound/items` + `:action_id` (POST/DELETE)
- `POST   /vendor/exchanges/:id/inbound/shipping-method` + `:action_id`
- `POST   /vendor/exchanges/:id/outbound/shipping-method` + `:action_id`
- `POST   /vendor/exchanges/:id/request`
- `POST   /vendor/exchanges/:id/cancel`
- `DELETE /vendor/exchanges/:id`

RBAC: add `validateSellerExchange` mirroring `validateSellerOrder`
(query the `order_seller` link via the parent `order_id`).

Note: the existing `/vendor/returns/:id/...` tree handles the
*return-side* of an exchange (`exchangeRequestItemReturnWorkflow`
writes into the same `Return` entity). Decide whether to reuse the
returns tree for the inbound leg or duplicate routes under
`/vendor/exchanges/:id/inbound/...`. The Figma design treats them as
one modal, so reusing the returns tree behind a `kind` discriminator
on the body is preferable.

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

Routes (same shape as Exchange):
- `POST   /vendor/claims` (begin)
- `GET    /vendor/claims`, `GET /vendor/claims/:id`
- `POST   /vendor/claims/:id/inbound/items` + `:action_id`
- `POST   /vendor/claims/:id/outbound/items` + `:action_id`
- `POST   /vendor/claims/:id/inbound/shipping-method` + `:action_id`
- `POST   /vendor/claims/:id/outbound/shipping-method` + `:action_id`
- `POST   /vendor/claims/:id/request`
- `POST   /vendor/claims/:id/cancel`
- `DELETE /vendor/claims/:id`

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

#### Transfer Ownership

Workflows:
- `requestOrderTransferWorkflow`
- `acceptOrderTransferWorkflow`
- `declineOrderTransferWorkflow`
- `cancelOrderTransferWorkflow`

Routes:
- `POST   /vendor/orders/:id/transfer/request`
- `POST   /vendor/orders/:id/transfer/cancel`
- `POST   /vendor/orders/:id/transfer/accept` (for the receiving party,
  if the marketplace lets the new customer self-confirm; otherwise
  skip and rely on the email-link route from the storefront)
- `POST   /vendor/orders/:id/transfer/decline`

Open questions for the spec author:
- Does Mercur allow seller-to-seller order transfer, or only
  customer-to-customer? The Medusa workflow signature is "to email +
  customer_id"; we need a Mercur-specific rule covering the seller
  case.
- Does the Vendor UI initiate the transfer or only confirm a
  customer-initiated one? The Figma frame shows a header-kebab action
  on the seller side, implying seller-initiated.

#### Handle Positive Outstanding Amounts

Workflows:
- `markPaymentCollectionAsPaidWorkflow` (Medusa core-flows,
  `dist/order/workflows/mark-payment-collection-as-paid.js`)
- "Copy payment link" — no workflow needed; the UI reads the URL out
  of an existing pending `payment_session.context.url` (or
  `payment_collection.payment_sessions[].provider_url` depending on
  provider). The backend just needs to **include payment sessions in
  the order detail query** so the URL is reachable from the UI.

Routes:
- `POST /vendor/orders/:id/payment-collections/:pc_id/mark-as-paid`
  (wraps `markPaymentCollectionAsPaidWorkflow`; RBAC via
  `validateSellerOrder`).
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

### RBAC / seller-scope rules

Every new route must apply the seller-scope guard, mirroring
`applySellerLinkFilter` (`orders/middlewares.ts:25-37`) and the
`validateSellerOrder` helper (`orders/helpers.ts`). For sub-resources
(exchange, claim, edit) add a one-liner helper that resolves the
parent `order_id` and delegates to `validateSellerOrder`:

```ts
export const validateSellerExchange = async (scope, sellerId, exchangeId) => {
  const { data: [ex] } = await scope.resolve("query").graph({
    entity: "order_exchange", filters: { id: exchangeId }, fields: ["order_id"],
  })
  if (!ex) throw new MedusaError(NOT_FOUND, ...)
  await validateSellerOrder(scope, sellerId, ex.order_id)
}
```

Add the equivalent for claims, order edits, and order transfers.

### Activity / Order Change emission

The Activity timeline on the order detail page is driven by
`GET /vendor/orders/:id/changes` (which already exists) plus the order
events written by every workflow above. For each new route make sure:

1. The wrapping workflow emits an `OrderChange` entry with the right
   `change_type` (`order_edit_request`, `claim_request`,
   `exchange_request`, `return_request`, `transfer_request`,
   `refund`, etc.) — most Medusa core-flows already do this; verify
   per route.
2. If the Mercur subscriber layer needs to react (commission
   recalculation, payout queue), wire that into the Mercur workflow
   override pattern used in
   `packages/core/src/workflows/order/workflows/cancel-order-fulfillment.ts`.
3. The vendor activity hook
   (`packages/vendor/src/pages/orders/[id]/_components/order-activity-section/hooks/...`)
   has a case for the new `change_type` value — extending the
   activity generator is the UI-side counterpart.

### Testing

Add integration suites under
`integration-tests/http/order/vendor/` (one file per feature):

- `order-edit.spec.ts`
- `order-exchange.spec.ts`
- `order-claim.spec.ts`
- `order-refund.spec.ts` (covers payment-row refund + outstanding
  handling)
- `order-transfer.spec.ts`
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

Expected Mercur overrides:
- `confirmOrderEditRequestWorkflow` — needs to call
  `refreshOrderCommissionLinesWorkflow` and update the seller payout
  queue once the edit lands.
- `confirmClaimRequestWorkflow` / `confirmExchangeRequestWorkflow` —
  same as above; commissions change when items are added or removed.
- `refundPaymentWorkflow` — already wrapped indirectly via the vendor
  route; verify the payout-deduction subscriber fires.
- `requestOrderTransferWorkflow` — Mercur needs to decide whether the
  `order_seller` link follows the transfer (likely **no**: the
  current seller stays unless explicitly re-assigned).

## Out of scope (Phase 2)

Per the Order Workflow Feature Brief these are explicitly **not** in
the Phase 1 contract and must not be designed into the vendor panel:

- Order scoring before fulfillment.
- Document upload on orders.
- Messaging on orders.
- Incident management.

If any frame on the Figma canvas implies one of these (e.g. an
attachment slot or a chat affordance), call it out here and confirm
with the author before implementing.

## Verification

A reviewer should be able to walk through this checklist with the
Figma file open and tick off each item against the running vendor
panel **and** the running API.

### Backend
0. **Vendor API**
   - [ ] `GET /vendor/orders` accepts `payment_status` and
     `fulfillment_status` filters (validators already permit them;
     confirm end-to-end via integration test).
   - [ ] `GET /vendor/orders` exposes a `has_open_request` (or
     equivalent) filter.
   - [ ] `GET /vendor/orders/:id` response includes
     `payment_collections.payments`,
     `payment_collections.payments.refunds`,
     `payment_collections.payment_sessions`, `returns`, `exchanges`,
     `claims`, and the fulfillment-set type.
   - [ ] `POST /vendor/orders/:id/edits` + sub-resources behave per
     Medusa core-flows; activity logged via `order_change`.
   - [ ] `POST /vendor/exchanges` + sub-resources; seller-scope guard
     enforced.
   - [ ] `POST /vendor/claims` + sub-resources; seller-scope guard
     enforced.
   - [ ] `POST /vendor/orders/:id/payment-collections/:pc_id/mark-as-paid`.
   - [ ] `POST /vendor/orders/:id/transfer/{request,cancel,accept,decline}`.
   - [ ] Integration suites added under `integration-tests/http/order/vendor/`
     covering each of the above and listed in §Backend gap / Testing.

1. **Orders list**
   - [ ] Search input visible in the header row.
   - [ ] `Add filter` exposes Payment, Fulfillment, Request, Sales
     channel, Created, Updated.
   - [ ] Sort popover lists Order ID / Created / Updated with asc/desc.
   - [ ] Column set matches Figma (no Sales channel column unless
     documented).
2. **Order detail — read view**
   - [ ] Header card shows payment + fulfillment badges only.
   - [ ] Kebab exposes Edit order, Create Return, Create Exchange,
     Create Claim, Transfer ownership.
   - [ ] Each line item can render a return/exchange/claim subrow with
     reason chip + tooltip.
   - [ ] Allocate items CTA appears inline in Summary when items are
     not allocated.
   - [ ] Outstanding action strip (`Copy payment link` / `Mark as
     paid`) renders when outstanding > 0.
   - [ ] Payment section renders per-payment rows with kebab → Create
     Refund.
   - [ ] Activity timeline mounted in the sidebar.
   - [ ] Metadata + JSON sections at the bottom of the main column.
3. **Edit Order**
   - [ ] Banner above the header with Force confirm / Cancel.
   - [ ] Route registered; activity entry logged.
4. **Create Return / Exchange / Claim / Refund**
   - [ ] Each has a kebab entry, a registered route, a focus modal
     with the structure described above, and an activity entry on
     success.
   - [ ] Refund flow is reachable from the Payment-row kebab.
5. **Receive Items**
   - [ ] CTA in Summary section.
   - [ ] Modal registered at
     `/orders/:id/returns/:return_id/receive`.
6. **Fulfillment, Shipment, Mark as delivered/picked up**
   - [ ] Existing flows confirmed visually identical to the design.
7. **Transfer Ownership**
   - [ ] Header-kebab action, route, modal, activity entry.
8. **Visual drift**
   - [ ] Solid `divide-y` (not dashed) across Summary + Payment.
   - [ ] `Allocated` / `Not allocated` chip on every Summary item row.

## Evidence

_To be filled in by the implementing agent. For each verification step
that passes, record one of:_

- a Loom / screen-capture link of the running vendor panel,
- a code-link to the file(s) that ship the behavior,
- a Figma screenshot diff comparing the live panel to the source
  frame (label with the frame ID from the *Source designs* table).

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
