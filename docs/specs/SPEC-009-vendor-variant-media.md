---
status: in_progress
canonical: false
priority: 2
area: vendor/products
created: 2026-06-11
last_updated: 2026-06-11
---

# SPEC-009 Vendor Variant Media (per-variant images)

Split out of **MER-127** (*PRODUCTS — Vendor Panel — Product Creation —
Step 4 — Variant*). That ticket bundled three items; the two contained
bug fixes (variant-grid search, and the "Option value X does not exist"
create error) shipped in the MER-127 PR. This spec owns the remaining,
larger item: **selecting images per variant**, which needs new backend
persistence and is therefore tracked as its own feature.

## Decision (owner: framework author)

- **Persistence model:** native Medusa variant images. Medusa 2.11.2+
  ships a real `ProductVariantProductImage` link and a `variant.images`
  relation; we wire those through rather than storing URLs in
  `variant.metadata` (a stopgap that is not a first-class, queryable
  relation).
- **Media source / UX:** **upload per variant** — each variant gets its
  own upload control (mirrors the product-level Media section, which is
  upload-based), not a "pick from product media" selector.

These two choices were confirmed with the framework author on
2026-06-11.

## Why this is not just a UI field

The current vendor create flow has no path to persist variant images:

- Frontend create schema `ProductCreateVariantSchema`
  (`packages/vendor/src/pages/products/create/constants.ts`) has no
  `media`/`images` field.
- `normalizeVariants` / `normalizeProductFormValues`
  (`packages/vendor/src/pages/products/create/utils.ts`) send only
  `title` / `options` / `sku` / `variant_rank` per variant.
- Vendor create validator `CreateProductVariant`
  (`packages/core/src/api/vendor/products/validators.ts`) accepts no
  variant `images`. `UpdateProductVariant` accepts a single
  `thumbnail` only.
- Medusa's own `CreateProductVariantDTO`
  (`@medusajs/types` → `product/common.d.ts`) does **not** accept
  `images` or `thumbnail` on create — the native variant-image relation
  is only reachable via a post-create link step.

So a real implementation spans validator → workflow → UI.

## Source design

Figma — *Mercur 2.0 — Vendor Panel B2C*
(`figma.com/design/sYJoh84Owr5tomRjpxG0no`):

- Variant grid with a **Media** column, per-variant thumbnails + an
  add ("+") affordance — flow heading node `40009010:146111`; the
  end-state is also visible in node `40009019:257392`.

Confluence — *Products in Mercur Admin Panel*
(`rigbysoftwarehouse.atlassian.net/wiki/spaces/ME/pages/512786471`):
the variant **details page manages Details / Media / Price / Inventory
items** — confirming variant Media is a documented, first-class
per-variant section (not a Figma-only detail), so the same backend
serves both the create wizard and the variant detail/edit surface.

## User-Visible Behavior

- In the product-create **Variants** step, each variant row exposes a
  Media affordance. The vendor can upload one or more images for that
  specific variant.
- On submit, the uploaded files are stored and associated with the
  correct variant via the native variant-image relation.
- Opening the created product / variant shows the variant's images on
  the variant detail page (and they round-trip through edit).

## Scope

In scope:
- Backend: accept variant `images` on `POST /vendor/products` (and the
  update path), and a workflow step that creates `ProductImage` rows
  and links them to the right variant via `ProductVariantProductImage`.
- Frontend (vendor create): variant `media` schema field, upload UI in
  the Variants step, and normalization that uploads files and sends the
  resulting urls per variant.
- Round-trip on the vendor variant detail/edit surface (shares the
  backend).

Out of scope (here):
- The MER-127 variant-grid **search** and the **option-value create
  error** — both already shipped in the MER-127 PR.
- Admin-side variant media (mirror later if needed).

## Open questions

- Single thumbnail vs. multiple images per variant. The Figma shows one
  thumbnail per row; the variant detail "Media" section implies a full
  gallery. Default to **multiple** (native relation supports it) and
  surface the first as the variant thumbnail.
- Whether per-variant uploads should be de-duplicated against
  product-level media when the same file is used in both.
- Coordinate with MER-136 / MER-137 (vendor product-details "create
  variant" / "variant details"), which already have worktrees and touch
  the same variant surface.

## Implementation Plan (evidence-backed)

### Medusa mechanism (researched, 2.13.4)

- Variant images are the native M2M `ProductVariant.images ⇄ ProductImage`
  via the `ProductVariantProductImage` junction
  (`@medusajs/product/dist/models/product-variant-product-image.d.ts`,
  `product-variant.d.ts:212`, since 2.11.2). A variant image **is** a
  `ProductImage` (same table as product images) that is additionally
  linked to a variant.
- The product module exposes
  `addImageToVariant(data: { variant_id, image_id }[])` and
  `removeImageFromVariant(...)`
  (`product-module-service.d.ts:178-187`,
  `VariantImageInput` at `product/dist/types/index.d.ts:34`). It links
  **existing** `ProductImage` ids — there is no standalone
  "create image" method and `CreateProductVariantDTO` has **no**
  `images` field (`@medusajs/types .../product/common.d.ts`).
- `ProductImage` rows are created from the product's `images: [{ url }]`
  array during the stock create workflow.

**Consequence:** variant image urls must be created as `ProductImage`
rows (by including them in the product `images` array), then linked to
the right variant by `image_id` in a post-create step. This keeps the
correct Medusa semantics (variant images are product images assigned to
a variant) and makes "upload per variant" a thin UX layer on top.

### Backend (`packages/core`)

1. **Validator** — `CreateProductVariant`
   (`src/api/vendor/products/validators.ts`): add
   `images: z.array(z.object({ url: z.string() })).optional()`. Widen the
   update variant schema the same way for the edit path (separate slice
   if needed).
2. **Workflow** — `createProductsWorkflow`
   (`src/workflows/product/workflows/create-products.ts`):
   - In the `stockProducts` transform, **union** each variant's image
     urls into the product-level `images` array (dedupe by url) so stock
     create materialises every url as a `ProductImage`. Strip `images`
     off the variant before handing it to stock (stock ignores unknown
     fields).
   - Keep a per-product map `variantIndex → image urls` in the transform
     output (or recompute from `input.products`).
   - After `stockCreateProductsWorkflow.runAsStep`, add a new
     `linkVariantImagesStep` that: resolves the product module, reads
     each created product's `images` (url → image_id), and calls
     `addImageToVariant` with `{ variant_id, image_id }` rows for every
     variant url. Match created variants to input variants by their
     `options`/`title` (the same key the rest of the wrapper uses).
   - Compensation: `removeImageFromVariant` for the rows it added.
3. **Query/GET** — confirm `variant.images` is selectable on
   `GET /vendor/products/:id` (Mercur `ProductVariantDTO.images` already
   exists in `packages/types`); add `*variants.images` to the vendor
   product query-config if not already returned.

### Frontend (`packages/vendor`)

4. **Schema** — `ProductCreateVariantSchema`
   (`pages/products/create/constants.ts`): add
   `media: z.array(MediaSchema).optional()` per variant (reuse the
   existing `MediaSchema`).
5. **UI** — variants step
   (`product-create-variants-form.tsx`): add a Media affordance per
   variant row (a `FileUpload`-backed cell / drawer) writing to
   `variants.${i}.media`. Mirror the product-level Media section's
   upload component.
6. **Normalize/submit** —
   (`product-create-form.tsx` + `utils.ts`): upload variant files via
   `uploadFilesQuery` alongside product media, then send each variant's
   resulting `images: [{ url }]` in the create payload
   (`normalizeVariants`).

### Tests

7. Integration (`integration-tests/http/product/vendor/`): `POST
   /vendor/products` with a variant carrying `images: [{ url }]`
   persists + links the image to that variant only; `GET` returns the
   variant with `images` populated and the other variant without it.

### Risks / decisions

- Variant images surface in the product image pool too (by the Medusa
  model). Acceptable; if the gallery must hide variant-only images,
  filter by the junction later.
- Matching created variants to input variants relies on `options`
  identity — the same key the wrapper already uses for option synthesis;
  reuse it to avoid a second matching scheme.

## Verification

1. `POST /vendor/products` with a variant carrying `images: [{ url }]`
   persists the image and links it to that variant (integration test in
   `integration-tests/http/product/vendor/`).
2. `GET /vendor/products/:id` (and the variant detail) returns the
   variant with its `images` populated.
3. Vendor create UI: upload an image on a variant row, publish, reopen
   the product — the image shows on the right variant only.
4. `bun run lint` and `bun run build` pass.

## Evidence

**Backend — done.**
- Validator: `CreateProductVariant.images` added
  (`packages/core/src/api/vendor/products/validators.ts`).
- Workflow: variant image urls unioned into the product image pool +
  `linkVariantImagesStep` (new) links them to the matching variant by
  title, with compensation
  (`packages/core/src/workflows/product/workflows/create-products.ts`,
  `.../steps/link-variant-images.ts`).
- Query-config: `*variants.images` exposed on list/retrieve + variant
  endpoints (`packages/core/src/api/vendor/products/query-config.ts`).
- Integration test `(A3)` in
  `integration-tests/http/product/vendor/product.spec.ts`: a variant
  carrying `images: [{ url }]` is materialised in the product image pool
  and linked to that variant **only** — **green** (`1 passed, 27
  skipped`). `bun run build` + `bun run lint` clean.

**Frontend data-path — done (type-checked).**
- Variant schema `media` field
  (`pages/products/create/constants.ts`).
- Submit uploads product + variant files in one batch and routes urls
  back per variant
  (`.../product-create-form/product-create-form.tsx`).
- `normalizeVariants` emits per-variant `images`
  (`pages/products/create/utils.ts`).

**Remaining — the input widget (needs in-browser verification).**
- A Media column in the variants DataGrid (thumbnail + add affordance,
  per Figma) that manages `variants.${i}.media`. The DataGrid's cells
  are tightly bound to its field/keyboard model (see
  `data-grid-textarea-modal-cell.tsx` for the interactive-cell
  precedent), so this layer must be built and verified live (upload,
  open/close, focus, keyboard) rather than blind. Verification step 3
  below covers it.

## Notes

The MER-127 PR (#968) delivered the two contained fixes (search +
option-value create bug) and referenced this spec for the deferred media
work. This branch (`viktorholik/spec-009-vendor-variant-media`) is
stacked on the MER-127 branch and adds the variant-media backend +
frontend data-path; the input widget is the only remaining piece.
