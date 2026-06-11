import { IProductModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

/**
 * One product's variant→image plan. `variants` carries the per-variant
 * image urls keyed by the variant `title` (the wrapper preserves the
 * caller's title verbatim, and the dashboard generates a distinct title
 * per axis combination — so title is a stable match key against the
 * created variants).
 */
export type VariantImagePlanEntry = {
  product_id: string
  variants: { title: string; urls: string[] }[]
}

export interface LinkVariantImagesStepInput {
  plan: VariantImagePlanEntry[]
}

export const linkVariantImagesStepId = "mercur-link-variant-images"

/**
 * SPEC-009: associates per-variant images with their variants.
 *
 * Variant images are the native Medusa `ProductVariant.images ⇄
 * ProductImage` M2M (since 2.11.2). `CreateProductVariantDTO` has no
 * `images` field, so the create wrapper instead unions every variant
 * image url into the product `images` array (materialising one
 * `ProductImage` per url) and defers the variant association to this
 * step. Here we read the created product's images (url → image id) and
 * call `addImageToVariant` for each planned variant url, matching the
 * created variant by `title`.
 *
 * Idempotency / compensation: the rows added are returned so the
 * compensation handler can `removeImageFromVariant` them on rollback.
 */
export const linkVariantImagesStep = createStep(
  linkVariantImagesStepId,
  async (input: LinkVariantImagesStepInput, { container }) => {
    if (!input.plan?.length) {
      return new StepResponse<{ variant_id: string; image_id: string }[]>(
        [],
        [],
      )
    }

    const productService = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    )

    const links: { variant_id: string; image_id: string }[] = []

    for (const entry of input.plan) {
      const product = await productService.retrieveProduct(entry.product_id, {
        relations: ["images", "variants"],
      })

      const urlToImageId = new Map(
        (product.images ?? []).map((image) => [image.url, image.id]),
      )

      for (const planned of entry.variants) {
        const variant = (product.variants ?? []).find(
          (v) => v.title === planned.title,
        )
        if (!variant) {
          continue
        }
        for (const url of planned.urls) {
          const image_id = urlToImageId.get(url)
          if (image_id) {
            links.push({ variant_id: variant.id, image_id })
          }
        }
      }
    }

    if (!links.length) {
      return new StepResponse<{ variant_id: string; image_id: string }[]>(
        [],
        [],
      )
    }

    await productService.addImageToVariant(links)
    return new StepResponse(links, links)
  },
  async (links, { container }) => {
    if (!links?.length) {
      return
    }
    const productService = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    )
    await productService.removeImageFromVariant(links)
  },
)
