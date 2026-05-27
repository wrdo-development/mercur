---
status: not_started
canonical: true
priority: 1
area: core/product
created: 2026-05-27
last_updated: 2026-05-27
---

# SPEC-008 Drop Mercur Product Module Override, Split Into `product-attribute` and `product-change`

## Why this exists

Mercur currently ships a complete *override* of Medusa's stock Product module
at `packages/core/src/modules/product/`. The override is registered before
`@mercurjs/core` in `withMercur()` so that `container.resolve(Modules.PRODUCT)`
returns the Mercur subclass, and the type shim from SPEC-006
(`.mercur/types.d.ts`) re-declares `ModuleImplementations.product` against
`MercurProductModuleService`.

That override does four orthogonal things, fused into one module:

1. **Re-defines stock Medusa entities** (`Product`, `ProductVariant`,
   `ProductCategory`, `ProductCollection`, `ProductTag`, `ProductType`,
   `ProductImage`, `ProductVariantProductImage`) with marketplace fields
   (`status` enum extension, `is_restricted`, `created_by`,
   `created_by_actor`, computed `manage_inventory`/`allow_backorder`
   constants on the variant, slug/handle semantics on category).
2. **Adds product attribute entities** — `ProductAttribute`,
   `ProductAttributeValue` — with three independent product-side
   relationships: `Product.custom_attributes` (1:N owned by a product),
   `Product.variant_attributes` (M:N variant-axis attributes), and
   `Product.attribute_values` (M:N selected values).
3. **Adds product-change entities** — `ProductChange`, `ProductChangeAction`
   — to record the vendor approval lifecycle (`PENDING` → `CONFIRMED` /
   `DECLINED` / `CANCELED`).
4. **Adds product-brand entity** — `ProductBrand` with a seller link.

Fusing all of this into the stock Medusa module means **every Mercur project
loses access to stock Medusa product features** (`ProductOption` /
`ProductOptionValue` are missing entirely, native `manage_inventory` is
hard-coded `false`, stock workflows can't be reused because `MedusaService`
generated methods point at Mercur's entities). It also forces every
Mercur-side workflow that touches a product to import
`ProductModuleService` from the Mercur module instead of going through
Medusa's standard workflow surface.

The override is also opaque to downstream blocks: a block author who wants
to drop in a stock-Medusa-shaped Product surface gets Mercur's surface
silently. The build-time type shim (SPEC-006) helps with TypeScript but it
does not make the modules behaviorally identical.

This spec retires the Mercur Product module entirely. It splits the four
fused responsibilities into:

- **Stock `@medusajs/medusa/product`** — owns `Product`, `ProductVariant`,
  `ProductOption`, `ProductOptionValue`, `ProductCategory`,
  `ProductCollection`, `ProductTag`, `ProductType`, `ProductImage`. No
  Mercur subclass.
- **New `product-attribute` module** — owns `ProductAttribute`,
  `ProductAttributeValue`. Wired to `Product`, `ProductVariant`, and
  `ProductCategory` through Module Links, not through entity-level
  relations.
- **New `product-change` module** — owns `ProductChange`,
  `ProductChangeAction`. Wired to `Product` through a Module Link.
- **New `product-brand` module** — owns `ProductBrand`. Wired to `Product`
  and `Seller` through Module Links. (Already a separate concern; see
  Out of scope below.)

Marketplace-only product fields (`status` extension values,
`is_restricted`, `created_by`, `created_by_actor`) move to one of:

- Stock Medusa `Product.metadata.mercur.*` (for `created_by`,
  `created_by_actor`).
- A small `product-extension` link module that augments `Product` with
  `is_restricted: boolean` and `status: MercurProductStatus` (Mercur's
  enum extension), referenced by ID from stock product.

Compatibility shape for vendor / admin / store query configs (see
`packages/core/src/api/vendor/products/query-config.ts:32-41`) is
preserved by exposing the same `*custom_attributes`, `*variant_attributes`,
`*attribute_values`, `*variants.attribute_values` and
`*variants.attribute_values.attribute` field paths through Module-Link
aliases. The new modules' linkable names are chosen so that the existing
field-tree strings are valid against the joiner config without rewriting
every route's query config.

## Target architecture

```
+---------------------------------------------------------+
|              @medusajs/medusa/product                   |
|  Product, ProductVariant, ProductOption,                |
|  ProductOptionValue, ProductCategory, ProductCollection,|
|  ProductTag, ProductType, ProductImage                  |
+---------------------------------------------------------+
                |             |             |
                | links       | links       | links
                v             v             v
+-------------------+  +------------------+  +----------------+
| product-attribute |  | product-change   |  | product-brand  |
| ProductAttribute  |  | ProductChange    |  | ProductBrand   |
| ProductAttribute  |  | ProductChange    |  +----------------+
|   Value           |  |   Action         |
+-------------------+  +------------------+
                |
                | M:N link aliases:
                |   product.custom_attributes
                |   product.variant_attributes
                |   product.attribute_values
                |   product_variant.attribute_values
                v
+---------------------------------------------------------+
|       Module Links (packages/core/src/links/)           |
|  - product-custom-attribute-link.ts                     |
|  - product-variant-attribute-link.ts                    |
|  - product-attribute-value-link.ts                      |
|  - product-variant-attribute-value-link.ts              |
|  - product-change-link.ts                               |
|  - product-brand-link.ts (already exists semantically)  |
|  - product-attribute-category-link.ts                   |
+---------------------------------------------------------+
```

### Module: `product-attribute`

Location: `packages/core/src/modules/product-attribute/`.

Models:

- `ProductAttribute` — id, handle, name, description, type, is_required,
  is_filterable, is_variant_axis, rank, is_active, created_by, metadata.
  **Dropped from this model**: every `product`, `variant_products`,
  `categories` relation — those become module links.
- `ProductAttributeValue` — id, handle, name, rank, is_active, metadata,
  `attribute: belongsTo(ProductAttribute, { mappedBy: "values" })`.
  **Dropped**: the `variants` and `products` M:N relations.

Service: `ProductAttributeModuleService` exposes only attribute and value
CRUD. No product/variant/category mutations.

Joiner alias: `productAttribute` (also exported as
`Module.linkable.productAttribute` and
`Module.linkable.productAttributeValue`).

### Module: `product-change`

Location: `packages/core/src/modules/product-change/`.

Models:

- `ProductChange` — id, status, internal_note, external_note, created_by,
  confirmed_by, confirmed_at, declined_by, declined_at, declined_reason,
  canceled_by, canceled_at, metadata, `actions: hasMany(ProductChangeAction)`.
  **Dropped**: the `product` belongsTo relation — becomes a module link.
- `ProductChangeAction` — id, product_id (kept as a denormalised text
  column for fast filtering), ordering, action, details, internal_note,
  applied, `product_change: belongsTo(ProductChange)`.

Service: `ProductChangeModuleService` exposes change/action CRUD plus the
single helper `addAction(input: AddProductActionInput)` currently on the
fused service (logic is moved verbatim; the `PENDING`-parent validation
runs against the change row, not the product).

### Module Links

All new links live under `packages/core/src/links/`. Each link declares a
`field` alias so that the existing field-tree strings in query configs
keep working.

| Link file | Left | Right | Alias on `Product` |
|---|---|---|---|
| `product-custom-attribute-link.ts` | `productModule.linkable.product` | `productAttributeModule.linkable.productAttribute` (isList: true) | `custom_attributes` |
| `product-variant-attribute-link.ts` | `productModule.linkable.product` (isList: true) | `productAttributeModule.linkable.productAttribute` (isList: true) | `variant_attributes` |
| `product-attribute-value-link.ts` | `productModule.linkable.product` (isList: true) | `productAttributeModule.linkable.productAttributeValue` (isList: true) | `attribute_values` |
| `product-variant-attribute-value-link.ts` | `productModule.linkable.productVariant` (isList: true) | `productAttributeModule.linkable.productAttributeValue` (isList: true) | `attribute_values` (on variant) |
| `product-attribute-category-link.ts` | `productModule.linkable.productCategory` (isList: true) | `productAttributeModule.linkable.productAttribute` (isList: true) | `attributes` (on category) |
| `product-change-link.ts` | `productModule.linkable.product` (isList: true) | `productChangeModule.linkable.productChange` (isList: true) | `changes` |

`defineLink` supports `alias` on either side via the `database.table` and
`field` options; the alias picked here is what makes the existing
field-tree strings resolve. The mapping the spec must produce:

| Field string from `vendorProductFields` | Resolved via |
|---|---|
| `*variants` | stock product joiner (`Product.variants`) |
| `*variants.attribute_values` | `product-variant-attribute-value-link` |
| `*variants.attribute_values.attribute` | product-attribute joiner (`ProductAttributeValue.attribute`) |
| `*variant_attributes` | `product-variant-attribute-link` |
| `*variant_attributes.values` | product-attribute joiner (`ProductAttribute.values`) |
| `*custom_attributes` | `product-custom-attribute-link` |
| `*custom_attributes.values` | product-attribute joiner |
| `*attribute_values` | `product-attribute-value-link` |
| `*attribute_values.attribute` | product-attribute joiner |

The alias name on each link is the second column of the table above
(`custom_attributes`, `variant_attributes`, `attribute_values` on Product;
`attribute_values` on ProductVariant). The link's `database.table` is
chosen to match the existing pivot table names from the override so the
data migration is `INSERT ... SELECT` rather than a rename:

- `product_attribute_value_link` (existing pivot for
  `Product.attribute_values`).
- `product_variant_attribute_value` (existing pivot for
  `ProductVariant.attribute_values`).
- `product_variant_attribute` (existing pivot for
  `Product.variant_attributes`).
- New: `product_custom_attribute` (was `attribute.product_id` FK on
  `ProductAttribute`; the column is dropped and rows are moved into a
  pivot to make the link symmetrical).
- New: `product_change_link` (was `change.product_id` FK on
  `ProductChange`; same reason).

### Marketplace fields that aren't attributes / changes

`is_restricted`, the extended `status` enum, `created_by` /
`created_by_actor` need to keep working. Two acceptable shapes — the spec
must pick **one** before implementation and stick to it:

- **Option A (preferred)** — keep marketplace fields on stock `Product`
  via Medusa's `additional_data` extension hook; persist them in a
  link-table-style augment module
  (`packages/core/src/modules/product-extension/`) that owns:
  ```
  ProductExtension {
    id, product_id, status (Mercur enum), is_restricted, created_by,
    created_by_actor, metadata
  }
  ```
  Linked to `Product` 1:1 with alias `mercur` (so
  `product.mercur.status` is a valid field tree). Workflows write to
  this table after stock product mutations finish.
- **Option B** — move `is_restricted` and `created_by*` into
  `Product.metadata.mercur` and store the marketplace `status` in a
  separate `ProductStatus` link entity keyed by `product_id`. Lighter
  weight but loses queryability.

Implementation MUST pick Option A and document the chosen schema in
`Evidence` below before any workflow is migrated.

### Vendor product-create form change

`packages/vendor/src/pages/products/create/components/product-create-attributes-form/product-create-attributes-form.tsx`
currently fuses two flows in one UI:

1. **Add Existing** — pulls attributes that are flagged
   `is_required` for the chosen category (via
   `useProductAttributes({ category_id, is_required: true })`),
   resolves their type, and lets the vendor pick values from
   `attribute.values`. **This stays** — it is the
   `product-attribute` module surface. Linking happens via
   `product_attribute_value_link` (and `product_variant_attribute_value`
   for variant axes).
2. **Create New** — lets the vendor type a freeform attribute name and
   either a textarea value or a chip list, optionally toggling
   `use_for_variants`. **This is replaced** by stock Medusa
   `ProductOption` / `ProductOptionValue`. New attributes are no longer
   created at all from the create form; vendors define
   `options[]: { title, values: string[] }` instead, and the
   `useForVariants` toggle is gone (every option is a variant axis by
   construction in Medusa).

Field-array shape after migration:

```ts
// Existing/required (linked product-attribute path) — unchanged
attributes: [{
  attribute_id: string,
  title: string,
  values: string[] | string,
  is_custom: false,
  is_required: boolean,
  use_for_variants: boolean,
  available_values?: { id: string; name: string }[]
}]

// New (stock Medusa options) — replaces is_custom = true items
options: [{
  title: string,
  values: string[]
}]
```

On submit, `options[]` is passed straight to
`createProductsWorkflow.input.products[i].options`. The `attributes[]`
list is split per attribute type into:

- `attribute_values[]` (M:N link on Product) — for `SINGLE_SELECT`,
  `MULTI_SELECT`, `TOGGLE` value picks against an existing
  `ProductAttributeValue`.
- per-variant `attribute_values[]` (M:N link on Variant) — when
  `is_variant_axis = true` on the attribute, with one value linked per
  variant (Medusa variants are generated from `options × values`).

The `custom_attributes` 1:N path (a product owning its own
`ProductAttribute` row, e.g. for free-text material) is removed from the
create flow. Any existing free-text capture moves to either:

- `Product.material` (already a stock field), or
- a category-defined `TEXT`-typed attribute the vendor fills in via the
  Add-Existing flow.

This implies a **data migration**: existing
`ProductAttribute.product_id IS NOT NULL` rows (custom_attributes) must
be either migrated to a `product-attribute` row scoped to a
"Custom" category and linked via the value pivot, or surfaced as
free-text on the product (best-effort). Implementation must explicitly
choose and document the migration in Evidence.

### Workflow migration

Every workflow under
`packages/core/src/workflows/product/workflows/` that currently resolves
`Modules.PRODUCT` as the Mercur subclass must be updated:

- **Pure product CRUD** (`create-products`, `update-products`,
  `delete-products`, `create-product-variants`, `update-product-variants`,
  `delete-product-variants`) — replaced with thin wrappers that
  `runAsStep` the stock workflows from
  `@medusajs/medusa/core-flows` (`createProductsWorkflow`,
  `updateProductsWorkflow`, etc.), then add link-creation steps for
  seller scope + product-extension write + attribute-value link writes.
- **Attribute CRUD** (`create-product-attributes`,
  `update-product-attributes`, `delete-product-attributes`,
  `create-product-attribute-values`, `update-product-attribute-values`,
  `delete-product-attribute-values`,
  `upsert-product-attribute-values`, `batch-product-attributes`,
  `validate-attribute-accepts-values`,
  `remove-attribute-from-product`) — move to the
  `product-attribute` module and update steps to resolve
  `productAttributeModuleService` instead of
  `productModuleService.<method>`.
- **Change-flow workflows** (`submit-seller-products`,
  `confirm-products`, `reject-product`, `request-product-changes`,
  `resubmit-product`, plus the `validate-*` siblings) — move to the
  `product-change` module and the `addAction` helper there.
- **Brand workflows** (`create-product-brands`,
  `update-product-brands`, `delete-product-brands`,
  `link-sellers-to-product-brand`) — moved into a `product-brand`
  module (see Out of scope; covered by SPEC-008's adjacency but landed
  separately if it grows).

The step file
`packages/core/src/workflows/product/steps/create-products.ts` becomes:

```ts
import { createProductsWorkflow as stockCreateProductsWorkflow }
  from "@medusajs/medusa/core-flows"

// thin wrapper that just delegates — the marketplace fields are written
// after the stock workflow returns, in a follow-up step against
// product-extension.
```

The `withMercur()` modules array drops the explicit
`@mercurjs/core/modules/product` entry (lines 45–52 of
`packages/core/src/with-mercur.ts`) and instead adds the new modules:

```ts
{ resolve: "@mercurjs/core/modules/product-attribute" },
{ resolve: "@mercurjs/core/modules/product-change" },
{ resolve: "@mercurjs/core/modules/product-extension" },
{ resolve: "@mercurjs/core/modules/product-brand" }, // if not deferred
```

The build-time type shim from SPEC-006 (`.mercur/types.d.ts` /
`MercurProductModuleService` re-export) is removed.

## User-Visible Behavior

- Vendor product **list** and **detail** views render identically: the
  same field tree (`*variants`, `*variants.attribute_values`,
  `*variant_attributes`, `*custom_attributes`, `*attribute_values`)
  resolves through links instead of the fused module. Existing data
  appears unchanged.
- Vendor product **create** form:
  - "Add existing attributes" modal works exactly as before.
  - "Create new" no longer creates a Mercur `ProductAttribute` row.
    Instead it adds a stock Medusa `ProductOption` with a value list, and
    the resulting variants are spawned from `options × values` by the
    stock workflow.
  - Required attributes from the chosen category still appear and
    behave as before.
- Admin product views (admin detail page, lists) keep working with the
  same field tree.
- Storefront product queries keep working (same field tree, same JSON
  shape on `product.variants[i].options` plus the existing
  attribute-link paths).
- Product approval flow (submit / confirm / reject / request changes /
  resubmit) keeps working; status / changelog moves to the
  `product-change` module without any user-visible difference.

## Verification

1. `bun install` succeeds against the new module layout.
2. `bun run lint` passes — there should be no remaining imports of
   `@mercurjs/core/modules/product` outside the new modules.
3. `bun run build` produces all packages, including the
   `core-plugin/.mercur/_generated/index.ts` route map. The map MUST
   contain joiner entries for `productAttribute` and `productChange`
   modules and for every new link.
4. Database migrations run cleanly on a fresh DB (`bun run dev`
   booting `apps/api` for the first time):
   - new tables: `product_attribute`, `product_attribute_value`,
     `product_change`, `product_change_action`, `product_extension`.
   - new pivot/link tables: `product_custom_attribute`,
     `product_change_link`. Existing pivots
     (`product_attribute_value_link`, `product_variant_attribute_value`,
     `product_variant_attribute`) are re-pointed at the new module
     joiner without data loss.
   - existing FK columns dropped:
     `product_attribute.product_id`, `product_change.product_id`.
5. Data-migration script runs against a snapshot DB containing rows
   from each of:
   - `ProductAttribute` with `product_id IS NOT NULL` (custom
     attributes).
   - `ProductChange` rows in all statuses.
   - `ProductBrand` rows with seller links.

   After the migration, the counts match: `count(product_attribute)`,
   `count(product_attribute_value)`,
   `count(product_change)`, `count(product_change_action)` are
   unchanged; `count(product_custom_attribute)` equals the
   pre-migration `count(product_attribute WHERE product_id IS NOT
   NULL)`.
6. Integration tests:
   - `bun run test:integration:tests -- products` passes against the
     new module shape (vendor + admin + store routes).
   - `bun run test:integration:tests -- attributes` passes
     (product-attribute module CRUD).
   - `bun run test:integration:tests -- product-changes` passes
     (submit / confirm / reject / request-changes / resubmit).
   - New test: vendor `POST /vendor/products` with `options: [...]`
     payload produces a product whose variants are
     `options × values` from stock Medusa, **plus** any
     `attribute_values[]` from the linked attribute path.
   - New test: querying `/vendor/products?fields=*variants,\
     *variants.attribute_values,*variants.attribute_values.attribute,\
     *variant_attributes,*variant_attributes.values,\
     *custom_attributes,*custom_attributes.values,\
     *attribute_values,*attribute_values.attribute`
     returns the same JSON shape as before the migration for the same
     data set.
7. Admin/vendor dashboards build (`bun run build` inside
   `packages/admin` and `packages/vendor`) and the vendor product-create
   form renders both Add-Existing and the new Stock-Options panel.
8. `withMercur()` no longer registers
   `@mercurjs/core/modules/product`. A grep for that string returns
   only this spec and `claude-progress.md`.
9. SPEC-006's `MercurProductModuleService` re-export and the
   `.mercur/types.d.ts` shim's product module declaration are removed
   (or marked obsolete in SPEC-006 with a forward-pointer to this
   spec).

## Evidence

_To be filled in by the agent. Required artefacts:_

1. PR(s) merged (link), with passing CI.
2. Output of `bun run lint` and `bun run build` from a clean tree
   (paste tail of the log).
3. `psql` output of `\dt product_*` against a freshly-migrated DB,
   showing the new tables and the absence of dropped FK columns.
4. `psql` output of the row-count sanity check from Verification step 5.
5. Test summary from
   `bun run test:integration:tests -- products attributes product-changes`.
6. Diff of `vendorProductFields` (must be unchanged) plus a passing
   integration test that asserts the JSON shape of a product query is
   identical pre- and post-migration.
7. Decision record: which option (A or B) was chosen for the
   marketplace product fields, and why.
8. Decision record: how `custom_attributes` data was migrated
   (re-categorised + linked, or surfaced as `Product.material`, or
   dropped with operator opt-in).

## Notes

- **Influence from `/Users/viktorholik/Desktop/medusa`**: use the stock
  `packages/modules/product` layout and the stock
  `packages/core/core-flows/src/product/workflows/*` as the reference
  for what the Mercur side is delegating to. The thin Mercur wrappers
  should mirror the stock workflow input/output exactly so consumers
  can swap them transparently.
- **Order matters when implementing**:
  1. Land the two new modules with empty migrations and a joiner
     config first; this gets the `Module.linkable.*` exports in place.
  2. Land the link files. Field-tree validation will then accept the
     new alias paths in dev.
  3. Land the data-migration script (idempotent, dry-runnable).
  4. Land workflow wrappers, one workflow group at a time, behind a
     feature flag if needed.
  5. Drop the Mercur product module registration from `withMercur()`.
  6. Delete `packages/core/src/modules/product/` and update SPEC-006.
- **Risk: shared `PriceSet` from SPEC-007.** SPEC-007 relies on
  `ProductVariant ↔ PriceSet` being native Medusa. That stays true here
  — the variant is stock Medusa after this spec lands, so the
  shared-PriceSet model is unaffected. The variant's computed
  `manage_inventory = false` constant (override line 28-29) is dropped
  silently; downstream code that depends on the constant must be
  audited and either rely on Medusa's real column or be removed.
- **Out of scope for this spec**:
  - Moving `ProductBrand` into its own module. It is adjacent and
    should be done in the same migration window, but if it grows it
    can ship as a follow-up SPEC-009.
  - Search reindexing (Algolia / Meilisearch). The reindexers read the
    same field paths via the new links; no surface change expected,
    but a smoke test against `apps/api` with search enabled is
    required before close.
  - The `vendor-product-attribute` module under
    `packages/core/src/modules/vendor-product-attribute/` already
    exists as a separate concern; this spec does not touch it.
- **SPEC-006 follow-up**: once the Mercur product module is gone, the
  build-wrapper / type-shim machinery from SPEC-006 still exists for
  other modules but no longer declares
  `ModuleImplementations.product`. The shim emitter must skip the
  product re-declaration. Update SPEC-006 to record that the product
  surface returned to stock and that the shim is now empty by default
  for fresh projects.
