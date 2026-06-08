import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import {
  addProductAttributeWorkflow,
  deleteProductAttributesWorkflow,
  detachProductAttributeWorkflow,
} from "../../../../../../workflows/product-attribute"
import { AdminUpdateProductAttributeType } from "../../../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.AdminProductAttributeResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const productId = req.params.id
  const attributeId = req.params.attribute_id

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: [
      "attribute_values.id",
      "attribute_values.name",
      "attribute_values.attribute.id",
      "attribute_values.attribute.name",
      "attribute_values.attribute.type",
    ],
    filters: { id: productId },
  })

  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id ${productId} was not found`
    )
  }

  const values = ((product as any).attribute_values ?? []).filter(
    (v: any) => v.attribute?.id === attributeId
  )

  if (!values.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Attribute with id ${attributeId} was not found on product ${productId}`
    )
  }

  const product_attribute = {
    ...values[0].attribute,
    values: values.map((v: any) => ({ id: v.id, name: v.name })),
  }

  res.json({ product_attribute })
}

/**
 * Replaces the value set of a product attribute in one round-trip.
 * Admin operates directly on the catalogue (no ProductChange staging
 * like the vendor surface) — detach + re-add chained inline so the new
 * value set is the only end state visible to readers.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<AdminUpdateProductAttributeType>,
  res: MedusaResponse<HttpTypes.AdminProductAttributeResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const productId = req.params.id
  const attributeId = req.params.attribute_id
  const body = req.validatedBody

  await detachProductAttributeWorkflow(req.scope).run({
    input: { product_id: productId, attribute_id: attributeId },
  })

  await addProductAttributeWorkflow(req.scope).run({
    input: {
      product_id: productId,
      attribute_id: attributeId,
      value_ids: body.attribute_value_ids,
      values: body.values,
    },
  })

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: [
      "attribute_values.id",
      "attribute_values.name",
      "attribute_values.attribute.id",
      "attribute_values.attribute.name",
      "attribute_values.attribute.type",
    ],
    filters: { id: productId },
  })

  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id ${productId} was not found`
    )
  }

  const values = ((product as any).attribute_values ?? []).filter(
    (v: any) => v.attribute?.id === attributeId
  )
  const product_attribute = values.length
    ? {
        ...values[0].attribute,
        values: values.map((v: any) => ({ id: v.id, name: v.name })),
      }
    : null

  res.json({ product_attribute } as HttpTypes.AdminProductAttributeResponse)
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const productId = req.params.id
  const attributeId = req.params.attribute_id

  await detachProductAttributeWorkflow(req.scope).run({
    input: { product_id: productId, attribute_id: attributeId },
  })

  // Product-scoped (inline-created) attributes have `product_id` pinned
  // to this product. They're hidden from the global catalogue and have
  // no other consumer, so the only sensible delete is full removal —
  // otherwise the attribute lingers on `product.attributes` with an
  // empty value set after every value is detached.
  const { data: attrs } = await query.graph({
    entity: "product_attribute",
    fields: ["id", "product_id"],
    filters: { id: attributeId },
  })
  const attr = attrs?.[0] as { product_id?: string | null } | undefined
  if (attr?.product_id === productId) {
    await deleteProductAttributesWorkflow(req.scope).run({
      input: { ids: [attributeId] },
    })
  }

  res.json({
    id: attributeId,
    object: "product_attribute",
    deleted: true,
  })
}
