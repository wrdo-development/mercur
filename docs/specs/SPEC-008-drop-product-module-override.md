---
status: not_started
canonical: true
priority: 1
area: core/product
created: 2026-05-27
last_updated: 2026-05-27
---

# SPEC-008 Drop Mercur Product Module Override, Split Into `product-attribute` and `product-change`

> Design note (2026-05-27): `ProductBrand` and the marketplace-extension entity
> (`is_restricted`, `status`, `created_by`, `created_by_actor`) live **inside
> the `product-attribute` module** rather than in standalone `product-brand` /
> `product-extension` modules. There are only two new modules: `product-attribute`
> and `product-change`.

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
   relationships: `Product.custom_attributes` (1:N owned by a product —
   **dropped in this spec**, see migration below),
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
  `ProductAttributeValue`, **`ProductBrand`**, and **`ProductExtension`**
  (the marketplace-fields augment entity). Wired to stock `Product`,
  `ProductVariant`, `ProductCategory`, and `Seller` through Module Links —
  no entity-level relations cross the module boundary.
- **New `product-change` module** — owns `ProductChange`,
  `ProductChangeAction`. Wired to `Product` through a Module Link.

Marketplace-only product fields (`status` extension values,
`is_restricted`, `created_by`, `created_by_actor`) live on
`ProductExtension` inside `product-attribute` — a 1:1 augment table linked
to stock `Product` via Module Link with alias `mercur`.

Compatibility shape for vendor / admin / store query configs (see
`packages/core/src/api/vendor/products/query-config.ts:32-41`) is
preserved for `*variant_attributes`, `*attribute_values`,
`*variants.attribute_values` and `*variants.attribute_values.attribute`
field paths through Module-Link aliases. The `*custom_attributes` path
is **removed** — product-scoped custom attributes are migrated to stock
Medusa `ProductOption` / `ProductOptionValue` (queried via
`*options,*options.values`). The new modules' linkable names are chosen
so the remaining field-tree strings are valid against the joiner config
without rewriting every route's query config.

## Target architecture

```
+---------------------------------------------------------+
|              @medusajs/medusa/product                   |
|  Product, ProductVariant, ProductOption,                |
|  ProductOptionValue, ProductCategory, ProductCollection,|
|  ProductTag, ProductType, ProductImage                  |
+---------------------------------------------------------+
                |                              |
                | links                        | links
                v                              v
+----------------------------------------+  +------------------+
| product-attribute                      |  | product-change   |
|   ProductAttribute                     |  | ProductChange    |
|   ProductAttributeValue                |  | ProductChange    |
|   ProductBrand                         |  |   Action         |
|   ProductExtension (marketplace fields)|  +------------------+
+----------------------------------------+
                |
                | link aliases:
                |   product.variant_attributes
                |   product.attribute_values
                |   product_variant.attribute_values
                |   product.brand
                |   product.mercur (extension)
                v
+---------------------------------------------------------+
|       Module Links (packages/core/src/links/)           |
|  - product-variant-attribute-link.ts                    |
|  - product-attribute-value-link.ts                      |
|  - product-variant-attribute-value-link.ts              |
|  - product-attribute-category-link.ts                   |
|  - product-brand-link.ts (Product <-> ProductBrand)     |
|  - product-brand-seller-link.ts (ProductBrand <-> Seller)|
|  - product-extension-link.ts (Product <-> ProductExt.)  |
|  - product-change-link.ts                               |
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
- `ProductBrand` — id, name, handle, is_restricted, metadata. **Dropped
  from this model**: the `products` hasMany relation — becomes a module
  link to stock `Product`. The seller link stays a separate Module Link.
- `ProductExtension` — id, status (Mercur enum), is_restricted,
  created_by, created_by_actor, metadata. 1:1 link to stock `Product`
  via Module Link with alias `mercur` (so `product.mercur.status` is a
  valid field-tree path).

Service: `ProductAttributeModuleService` exposes CRUD for all four
entities (attributes, values, brands, extensions). No product/variant/
category mutations.

Joiner aliases exported as `Module.linkable.productAttribute`,
`Module.linkable.productAttributeValue`,
`Module.linkable.productBrand`, and
`Module.linkable.productExtension`.

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
| `product-variant-attribute-link.ts` | `productModule.linkable.product` (isList: true) | `productAttributeModule.linkable.productAttribute` (isList: true) | `variant_attributes` |
| `product-attribute-value-link.ts` | `productModule.linkable.product` (isList: true) | `productAttributeModule.linkable.productAttributeValue` (isList: true) | `attribute_values` |
| `product-variant-attribute-value-link.ts` | `productModule.linkable.productVariant` (isList: true) | `productAttributeModule.linkable.productAttributeValue` (isList: true) | `attribute_values` (on variant) |
| `product-attribute-category-link.ts` | `productModule.linkable.productCategory` (isList: true) | `productAttributeModule.linkable.productAttribute` (isList: true) | `attributes` (on category) |
| `product-brand-link.ts` | `productModule.linkable.product` (isList: true) | `productAttributeModule.linkable.productBrand` | `brand` |
| `product-brand-seller-link.ts` | `productAttributeModule.linkable.productBrand` (isList: true) | `sellerModule.linkable.seller` (isList: true) | n/a (seller side) |
| `product-extension-link.ts` | `productModule.linkable.product` | `productAttributeModule.linkable.productExtension` | `mercur` |
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
| `*options,*options.values` | stock product joiner (`Product.options`) |
| `*attribute_values` | `product-attribute-value-link` |
| `*attribute_values.attribute` | product-attribute joiner |

The alias name on each link is the second column of the link table above
(`variant_attributes`, `attribute_values` on Product; `attribute_values`
on ProductVariant). The link's `database.table` is chosen to match the
existing pivot table names from the override so the data migration is
`INSERT ... SELECT` rather than a rename:

- `product_attribute_value_link` (existing pivot for
  `Product.attribute_values`).
- `product_variant_attribute_value` (existing pivot for
  `ProductVariant.attribute_values`).
- `product_variant_attribute` (existing pivot for
  `Product.variant_attributes`).
- New: `product_change_link` (was `change.product_id` FK on
  `ProductChange`; the column is dropped and rows are moved into a
  pivot to make the link symmetrical).

The legacy `ProductAttribute.product_id` FK (the column that backed
`Product.custom_attributes`) is dropped without a replacement pivot —
its rows are migrated into stock `ProductOption` / `ProductOptionValue`
(see Data migration below).

### Marketplace fields that aren't attributes / changes

`is_restricted`, the extended `status` enum, `created_by` /
`created_by_actor` are owned by the `ProductExtension` model inside the
`product-attribute` module. It is a 1:1 augment table on stock `Product`,
linked via `product-extension-link.ts` with alias `mercur` (so
`product.mercur.status` is a valid field-tree path). Workflows write to
this table after stock product mutations finish via Medusa's
`additional_data` extension hook.

Schema:
```
ProductExtension {
  id, status (Mercur enum), is_restricted, created_by,
  created_by_actor, metadata
}
```

The `product_id` correspondence lives in the link pivot, not as a column
on `ProductExtension`, so the augment table stays symmetric with the
other links.

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
   `ProductOption` / `ProductOptionValue`. Custom (product-scoped)
   attributes are no longer created at all — vendors define
   `options[]: { title, values: string[] }` instead, and the
   `useForVariants` toggle is gone (every option is a variant axis by
   construction in Medusa).

Field-array shape after migration:

```ts
// Existing/required (linked product-attribute path)
attributes: [{
  attribute_id: string,
  title: string,
  values: string[] | string,
  is_required: boolean,
  use_for_variants: boolean,
  available_values?: { id: string; name: string }[]
}]

// New (stock Medusa options) — replaces every "custom" attribute path
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
  `ProductAttributeValue`, when the attribute is **not** used as a
  variant axis.
- **Mirrored option** — when the attribute is selected with
  `use_for_variants = true`, the wrapper workflow materialises it into a
  stock `ProductOption` (and its chosen values into `ProductOptionValue`)
  so the stock `createProductsWorkflow` accepts the payload and generates
  variants from `options × values`. The materialised rows stay linked to
  the source attribute — see **Mirrored options for existing attributes**
  below.

The `custom_attributes` 1:N path (a product owning its own
`ProductAttribute` row) is removed entirely — from the model, from the
field tree, from the create form, and from query configs. There is no
`*custom_attributes` field path post-migration.

### Mirrored options for existing attributes

**Why this exists.** Stock `createProductsWorkflow` rejects any product
that has variants but no `options[]` (see
`validate-product-input` in `@medusajs/medusa/core-flows`). A product
with three variants and zero options is not creatable through the
standard workflow. We cannot drop the option requirement, and we cannot
keep variants tied only to `ProductAttributeValue` link rows because
variant identity in Medusa is anchored to `ProductOptionValue` rows that
physically belong to the product.

The naive workaround — copy the chosen attribute's name and values into
fresh `ProductOption` / `ProductOptionValue` rows at create time and
forget the link — turns those rows into **snapshots**. When the source
attribute is renamed (`Material` → `Fabric`) or a value is renamed
(`Cotton` → `Organic Cotton`), every product created from that
attribute keeps the stale label. That's exactly the failure mode the
existing Mercur override was avoiding (its `Product.variant_attributes`
M:N relation was a live reference, not a snapshot).

**The design.** Materialise + link, then propagate renames via
subscribers. The materialised `ProductOption` / `ProductOptionValue`
rows are real (so stock workflows + variant generation work), but each
row carries a Module Link back to the source so a rename of the source
fans out to every mirrored row.

1. **Create-time materialisation.** When the vendor picks an existing
   attribute with `use_for_variants = true`, the
   `createSellerProductsWorkflow` wrapper:
   - Resolves the attribute and its chosen `ProductAttributeValue` rows.
   - Injects a stock option into the createProductsWorkflow payload:
     ```ts
     options.push({
       title: attribute.name,                  // snapshot for display
       values: chosenValues.map(av => av.name) // snapshot for display
     })
     ```
   - Lets stock `createProductsWorkflow` run unchanged.
   - After the workflow returns, looks up the newly-created
     `ProductOption` (matched by title within that product) and its
     `ProductOptionValue` rows, then creates link rows:
     ```
     product_option_attribute_link
       product_option_id          → ProductOption.id
       product_attribute_id       → ProductAttribute.id
       fingerprint                → sha256(attribute_id|attribute.name)
       linked_at                  → now()

     product_option_value_attribute_value_link
       product_option_value_id    → ProductOptionValue.id
       product_attribute_value_id → ProductAttributeValue.id
       fingerprint                → sha256(av_id|av.name)
       linked_at                  → now()
     ```
   - These links are exposed through the joiner as aliases
     `ProductOption.source_attribute` and
     `ProductOptionValue.source_attribute_value`, so field-tree paths
     like `*options.source_attribute,*options.values.source_attribute_value`
     resolve.

   The `fingerprint` column is a content hash of the source row at the
   moment the link was created. It is **not** the integrity check — the
   foreign keys are. The fingerprint is what a reconciliation job uses
   to cheaply detect drift (`fingerprint != sha256(current source)` ⇒
   propagate or flag).

2. **Rename propagation.** Two subscribers in the `product-attribute`
   module:

   - `product-attribute.updated`: when `name` changes, run
     `mirrorProductAttributeRenameWorkflow`. Steps:
     1. Find every `product_option_attribute_link` row pointing at this
        attribute.
     2. For each linked `ProductOption`, call
        `productModuleService.updateProductOptions({ id, title: newName })`.
     3. Update `fingerprint = sha256(attribute_id|newName)` on the link
        row.
   - `product-attribute-value.updated`: when `name` changes, run
     `mirrorProductAttributeValueRenameWorkflow`. Steps:
     1. Find every `product_option_value_attribute_value_link` row
        pointing at this value.
     2. For each linked `ProductOptionValue`, call
        `productModuleService.updateProductOptionValues({ id, value: newName })`.
     3. Update `fingerprint = sha256(av_id|newName)`.

   Both subscribers run async, batched per attribute / value (so a bulk
   rename of one attribute touches all linked products in one
   transaction set). They are idempotent — re-running them with the
   same input is a no-op because the fingerprint already matches.

3. **Value additions / deletions on the source attribute.**
   - **Add value** to the source attribute → **not** automatically
     propagated to mirrored options. Adding a global "Linen" to
     `Material` should not silently spawn a new variant on every linked
     product. Vendors opt in per product via the edit flow ("Pull new
     values from `Material`"), which appends the new value and
     regenerates the option's `ProductOptionValue` rows.
   - **Delete value** from the source attribute → soft-blocked at the
     module level: `ProductAttributeValue.delete()` raises if any
     `product_option_value_attribute_value_link` still references the
     value. Operator must reassign or unlink the affected products
     first. (The reason: deleting a value would orphan variants whose
     identity is anchored to the corresponding `ProductOptionValue`.)
   - **Delete the source attribute** → same soft-block via
     `product_option_attribute_link`.

4. **Unlinking.** A vendor can "unlink" a mirrored option (or a single
   mirrored value) from the source. Unlink drops the link row but keeps
   the materialised `ProductOption` / `ProductOptionValue` intact — the
   option becomes a freeform snapshot the vendor owns, and future
   renames on the source no longer propagate to it. There is no
   re-link UI in this spec; relinking a previously-unlinked option is
   out of scope (vendors who want it back can recreate the product).

5. **Reconciliation job.** A scheduled task (daily, plus on-demand via
   `mercurjs reconcile-mirrored-options`) walks both link tables and
   compares `fingerprint` against `sha256(current source)`. Mismatches
   are either auto-fixed (subscriber missed an event) or flagged in the
   admin "Marketplace health" panel for operator review. The
   fingerprint avoids hot-loading the source row when reconciling.

6. **What this is NOT.**
   - Not a virtual-option pattern. The `ProductOption` and
     `ProductOptionValue` rows are real, persisted, queryable through
     stock joins, and variants reference them with FKs. The link is
     additive metadata, not a substitute.
   - Not a cache. The mirrored row's `title`/`value` is the source of
     truth for storefront display until the next propagation run; the
     link enforces a same-on-both-sides invariant only after the
     subscriber lands.

7. **API surface.** New endpoints under `/vendor/product-attributes` and
   `/admin/product-attributes`:
   - `GET .../:id/linked-products?fields=*,*options.title` — what would
     be affected by a rename.
   - `POST .../:id/values/:value_id/relink/:product_option_value_id` —
     manual re-link (operator tool).
   - `POST /vendor/products/:id/options/:option_id/unlink` —
     vendor unlink, drops the link rows for that option.

   These are additive; they do not break the existing attribute CRUD
   surface.

**Storage summary** (new tables added by this section, all owned by
`product-attribute`):

```
product_option_attribute_link
  id, product_option_id, product_attribute_id, fingerprint, linked_at, deleted_at
  unique (product_option_id) -- one source per option
  index (product_attribute_id)

product_option_value_attribute_value_link
  id, product_option_value_id, product_attribute_value_id, fingerprint, linked_at, deleted_at
  unique (product_option_value_id) -- one source per option value
  index (product_attribute_value_id)
```

**Field-tree additions**:

| Field string | Resolved via |
|---|---|
| `*options.source_attribute` | `product_option_attribute_link` joiner |
| `*options.values.source_attribute_value` | `product_option_value_attribute_value_link` joiner |

### Data migration: custom_attributes → stock options

Every legacy `ProductAttribute.product_id IS NOT NULL` row is migrated
to a stock Medusa `ProductOption` on the owning product, with its
`ProductAttributeValue` children migrated to that option's
`ProductOptionValue` rows:

```
ProductAttribute  (product_id = P, name = "Material", type = TEXT|SELECT|...)
  └─ ProductAttributeValue (name = "Cotton") ─┐
  └─ ProductAttributeValue (name = "Wool")    ─┤
                                              v
ProductOption     (product_id = P, title = "Material")
  └─ ProductOptionValue (value = "Cotton")
  └─ ProductOptionValue (value = "Wool")
```

Rules:

- Title for the new `ProductOption` is the attribute's `name`.
- Option-value `value` is the attribute-value's `name`. If the legacy
  type was `TEXT` and the attribute had no `ProductAttributeValue`
  children, fall back to the free-text payload stored on the legacy
  product link (one option with a single value, or skip the row with a
  log line if no value exists).
- After the rows are moved, the legacy
  `ProductAttribute WHERE product_id IS NOT NULL` rows (and their
  `ProductAttributeValue` children) are deleted, and the
  `ProductAttribute.product_id` column is dropped.
- Category-scoped attributes (`product_id IS NULL`) are untouched —
  they remain in the `product-attribute` module and continue to flow
  through the Add-Existing path.

The migration is idempotent and dry-runnable: a `--check` mode reports
counts of attributes that will become options, option-values that will
be created, and rows with no resolvable value (which are logged for
operator review and skipped).

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
  `link-sellers-to-product-brand`) — moved into the `product-attribute`
  module and updated to resolve `productAttributeModuleService` for
  brand CRUD; the seller link continues to write to
  `product-brand-seller-link`.

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
`packages/core/src/with-mercur.ts`) and instead adds two new modules:

```ts
{ resolve: "@mercurjs/core/modules/product-attribute" },
{ resolve: "@mercurjs/core/modules/product-change" },
```

`ProductBrand` and `ProductExtension` ship inside `product-attribute`, so
no extra module registrations are needed for them.

The build-time type shim from SPEC-006 (`.mercur/types.d.ts` /
`MercurProductModuleService` re-export) is removed.

## User-Visible Behavior

- Vendor product **list** and **detail** views render with the field
  tree `*variants`, `*variants.attribute_values`,
  `*variant_attributes`, `*attribute_values`, plus stock `*options` /
  `*options.values`. `*custom_attributes` is no longer a valid field
  path. What was previously surfaced under `custom_attributes` appears
  under `options` instead.
- Vendor product **create** form:
  - "Add existing attributes" modal works exactly as before.
  - "Create new" no longer creates a Mercur `ProductAttribute` row.
    Instead it adds a stock Medusa `ProductOption` with a value list, and
    the resulting variants are spawned from `options × values` by the
    stock workflow.
  - Required attributes from the chosen category still appear and
    behave as before.
- Admin product views (admin detail page, lists) keep working with the
  updated field tree (custom attributes appear as options).
- Storefront product queries keep working — `product.variants[i].options`
  and `product.options[].values[]` are now the canonical surface for
  what used to be `custom_attributes`.
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
   - new tables owned by `product-attribute`: `product_attribute`,
     `product_attribute_value`, `product_brand`, `product_extension`.
   - new tables owned by `product-change`: `product_change`,
     `product_change_action`.
   - new pivot/link tables: `product_brand_link`,
     `product_extension_link`, `product_change_link`,
     `product_option_attribute_link`,
     `product_option_value_attribute_value_link`. Existing pivots
     (`product_attribute_value_link`, `product_variant_attribute_value`,
     `product_variant_attribute`) are re-pointed at the new module
     joiner without data loss.
   - existing FK columns dropped:
     `product_attribute.product_id`, `product_change.product_id`,
     `product_brand.product_id` (if present on the legacy table).
5. Data-migration script runs against a snapshot DB containing rows
   from each of:
   - `ProductAttribute` with `product_id IS NOT NULL` (custom
     attributes — these become stock `ProductOption` rows).
   - `ProductChange` rows in all statuses.
   - `ProductBrand` rows with seller links.

   After the migration:
   - `count(product_attribute WHERE product_id IS NOT NULL)` is `0`.
   - `count(product_option)` increases by the pre-migration count of
     custom attributes (modulo skipped rows that had no resolvable
     value).
   - `count(product_option_value)` increases by the pre-migration count
     of `ProductAttributeValue` children of custom attributes (plus one
     synthesized value per TEXT-typed custom attribute that had no
     children but had a stored value).
   - `count(product_change)`, `count(product_change_action)`,
     `count(product_brand)` are unchanged.
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
     *options,*options.values,\
     *attribute_values,*attribute_values.attribute`
     returns the same JSON shape as before the migration for the same
     data set, with what used to live under `custom_attributes` now
     surfaced under `options`.
   - New test: `*custom_attributes` is rejected by the field-tree
     validator (no joiner alias matches), proving the path is gone.
   - New test (mirrored options): vendor creates a product with
     `attributes: [{ attribute_id, value_ids, use_for_variants: true }]`.
     Assert: a `ProductOption` is created with the attribute's title,
     `ProductOptionValue` rows are created for each chosen value, and
     `product_option_attribute_link` + `product_option_value_attribute_value_link`
     rows exist with fingerprints matching the source.
   - New test (rename propagation): renaming the source
     `ProductAttribute.name` triggers the subscriber and the linked
     `ProductOption.title` updates within one tick. Same for
     `ProductAttributeValue.name` → linked `ProductOptionValue.value`.
   - New test (delete soft-block): deleting a
     `ProductAttributeValue` while a linked
     `ProductOptionValue` exists raises a controlled error.
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
6. Diff of `vendorProductFields` — `custom_attributes` paths replaced
   with `options` / `options.values`. Integration test asserting the
   JSON shape of a product query for the existing data set: legacy
   `custom_attributes` payload appears under `options` post-migration.
7. Row-count report from the data-migration script (custom attributes
   converted, option-values created, rows skipped with reasons), plus
   the dry-run output from the `--check` pass.

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
