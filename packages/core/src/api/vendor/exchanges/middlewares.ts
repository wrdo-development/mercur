import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework"

import { validateSellerOrder } from "../orders/helpers"
import { validateSellerExchange } from "./helpers"
import {
  VendorPostCancelExchangeReq,
  VendorPostExchangesAddItemsReq,
  VendorPostExchangesItemsActionReq,
  VendorPostExchangesRequestItemsReturnActionReq,
  VendorPostExchangesReturnRequestItemsReq,
  VendorPostExchangesShippingActionReq,
  VendorPostExchangesShippingReq,
  VendorPostOrderExchangesReq,
} from "./validators"

const assertSellerOwnsOrderInBody = async (
  req: AuthenticatedMedusaRequest<{ order_id: string }>,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const sellerId = req.seller_context!.seller_id
  const orderId = req.validatedBody!.order_id
  await validateSellerOrder(req.scope, sellerId, orderId)
  return next()
}

const assertSellerOwnsExchangeInParam = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const sellerId = req.seller_context!.seller_id
  const { id } = req.params
  await validateSellerExchange(req.scope, sellerId, id)
  return next()
}

export const vendorExchangesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/vendor/exchanges",
    middlewares: [
      validateAndTransformBody(VendorPostOrderExchangesReq),
      assertSellerOwnsOrderInBody,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/cancel",
    middlewares: [
      validateAndTransformBody(VendorPostCancelExchangeReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/request",
    middlewares: [assertSellerOwnsExchangeInParam],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/exchanges/:id/request",
    middlewares: [assertSellerOwnsExchangeInParam],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/inbound/items",
    middlewares: [
      validateAndTransformBody(VendorPostExchangesReturnRequestItemsReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/inbound/items/:action_id",
    middlewares: [
      validateAndTransformBody(VendorPostExchangesRequestItemsReturnActionReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/exchanges/:id/inbound/items/:action_id",
    middlewares: [assertSellerOwnsExchangeInParam],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/inbound/shipping-method",
    middlewares: [
      validateAndTransformBody(VendorPostExchangesShippingReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/inbound/shipping-method/:action_id",
    middlewares: [
      validateAndTransformBody(VendorPostExchangesShippingActionReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/exchanges/:id/inbound/shipping-method/:action_id",
    middlewares: [assertSellerOwnsExchangeInParam],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/outbound/items",
    middlewares: [
      validateAndTransformBody(VendorPostExchangesAddItemsReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/outbound/items/:action_id",
    middlewares: [
      validateAndTransformBody(VendorPostExchangesItemsActionReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/exchanges/:id/outbound/items/:action_id",
    middlewares: [assertSellerOwnsExchangeInParam],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/outbound/shipping-method",
    middlewares: [
      validateAndTransformBody(VendorPostExchangesShippingReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/exchanges/:id/outbound/shipping-method/:action_id",
    middlewares: [
      validateAndTransformBody(VendorPostExchangesShippingActionReq),
      assertSellerOwnsExchangeInParam,
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/exchanges/:id/outbound/shipping-method/:action_id",
    middlewares: [assertSellerOwnsExchangeInParam],
  },
]
