import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import { validateSellerOrder } from "../orders/helpers"

/**
 * Resolves an `order_change` (the underlying record of an order edit)
 * to its parent `order_id`, then defers to the canonical seller-scope
 * check on the order.
 *
 * Mirrors the shape of `validateSellerReturn` in
 * `packages/core/src/api/vendor/returns/helpers.ts`.
 */
export const validateSellerOrderEdit = async (
  scope: MedusaContainer,
  sellerId: string,
  orderEditId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [orderChange],
  } = await query.graph({
    entity: "order_change",
    filters: {
      id: orderEditId,
    },
    fields: ["id", "order_id"],
  })

  if (!orderChange) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Order edit with id: ${orderEditId} was not found`
    )
  }

  await validateSellerOrder(scope, sellerId, orderChange.order_id)
}
