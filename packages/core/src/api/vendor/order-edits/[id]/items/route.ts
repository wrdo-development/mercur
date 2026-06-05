import { orderEditAddNewItemWorkflow } from "@medusajs/core-flows"
import { HttpTypes } from "@medusajs/framework/types"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { VendorPostOrderEditsAddItemsReqType } from "../../validators"

/**
 * `POST /vendor/order-edits/:id/items` — mirrors
 * `POST /admin/order-edits/:id/items`. Adds new items to the
 * draft edit on the seller-owned order.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorPostOrderEditsAddItemsReqType>,
  res: MedusaResponse<HttpTypes.AdminOrderEditPreviewResponse>
) => {
  const { id } = req.params

  const { result } = await orderEditAddNewItemWorkflow(req.scope).run({
    input: { ...req.validatedBody, order_id: id },
  })

  res.json({
    order_preview: result as unknown as HttpTypes.AdminOrderPreview,
  })
}
