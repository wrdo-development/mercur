import { beginClaimOrderWorkflow } from "@medusajs/core-flows"
import { HttpTypes } from "@medusajs/framework/types"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { VendorPostOrderClaimsReqType } from "./validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorPostOrderClaimsReqType>,
  res: MedusaResponse<HttpTypes.AdminClaimOrderResponse>
) => {
  const input = {
    ...req.validatedBody,
    created_by: req.seller_context!.seller_id,
  }

  const { result } = await beginClaimOrderWorkflow(req.scope).run({
    input,
  })

  res.json({
    claim: { id: result.claim_id } as HttpTypes.AdminClaim,
  } as HttpTypes.AdminClaimOrderResponse)
}
