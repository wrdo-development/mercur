import { orderExchangeAddNewItemWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"

import { VendorPostExchangesAddItemsReqType } from "../../../validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorPostExchangesAddItemsReqType>,
  res: MedusaResponse<{
    order_preview: HttpTypes.AdminOrderPreview
  }>
) => {
  const { id } = req.params

  const { result } = await orderExchangeAddNewItemWorkflow(req.scope).run({
    input: { ...req.validatedBody, exchange_id: id },
  })

  res.json({
    order_preview: result as unknown as HttpTypes.AdminOrderPreview,
  })
}
