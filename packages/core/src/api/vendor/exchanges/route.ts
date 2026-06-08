import { beginExchangeOrderWorkflow } from "@medusajs/core-flows"
import { HttpTypes } from "@medusajs/framework/types"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { VendorPostOrderExchangesReqType } from "./validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorPostOrderExchangesReqType>,
  res: MedusaResponse<HttpTypes.AdminExchangeOrderResponse>
) => {
  const input = {
    ...req.validatedBody,
    created_by: req.seller_context!.seller_id,
  }

  const { result } = await beginExchangeOrderWorkflow(req.scope).run({
    input,
  })

  res.json({
    exchange: { id: result.exchange_id } as HttpTypes.AdminExchange,
  } as HttpTypes.AdminExchangeOrderResponse)
}
