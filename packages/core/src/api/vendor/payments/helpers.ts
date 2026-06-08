import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

export const refetchPayment = async (
  scope: MedusaContainer,
  paymentId: string,
  fields: string[]
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [payment],
  } = await query.graph({
    entity: "payment",
    filters: { id: paymentId },
    fields,
  })

  return payment
}

// TODO(SPEC-008 follow-up): `entity: "seller_payment"` is a Module Link
// alias that throws a 500 (instead of a clean 404) when the link isn't
// registered in the test container. This blocks the `order-refund.spec.ts`
// integration suite from validating the non-existent-payment path. The
// fix is either (a) register the seller_payment link in the integration
// test container's medusa-config, or (b) replace this lookup with a
// transitive read `order_seller → order → payment_collection → payment`
// that uses entities already in the joiner graph. See SPEC-008 evidence
// session (ff) "Deliberate deferral" §2 for the documented trail.
export const validateSellerPayment = async (
  scope: MedusaContainer,
  sellerId: string,
  paymentId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [sellerPayment],
  } = await query.graph({
    entity: "seller_payment",
    filters: {
      seller_id: sellerId,
      payment_id: paymentId,
    },
    fields: ["seller_id"],
  })

  if (!sellerPayment) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Payment with id: ${paymentId} was not found`
    )
  }
}
