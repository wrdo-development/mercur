import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  promiseAll,
} from "@medusajs/framework/utils"

type RequestType = "edit" | "return" | "exchange" | "claim"

const REQUEST_TYPES: RequestType[] = ["edit", "return", "exchange", "claim"]
const isOpenOrderChange = { status: ["requested", "pending"] }
const isRequestedStatus = { status: "requested" }

const respondEmpty = (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const pagination = (req.queryConfig?.pagination ?? {}) as {
    skip?: number
    take?: number
  }
  res.json({
    orders: [],
    count: 0,
    offset: pagination.skip ?? 0,
    limit: pagination.take ?? 0,
  })
}

const parseRequestParam = (raw: unknown): RequestType[] | undefined => {
  if (!raw) {
    return undefined
  }
  const values = Array.isArray(raw)
    ? raw.flatMap((v) => String(v).split(","))
    : String(raw).split(",")
  const filtered = values
    .map((v) => v.trim())
    .filter((v): v is RequestType =>
      (REQUEST_TYPES as string[]).includes(v)
    )
  return filtered.length ? filtered : undefined
}

export const applyRequestFilter = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  // Medusa's validator strips unknown query keys, so the value never lands in
  // `filterableFields`. Read it from the raw query — same pattern used for
  // `seller_id` in `maybeApplySellerOrderFilter`.
  const request = parseRequestParam(req.query.request)
  if (!request) {
    return next()
  }

  const filterableFields = req.filterableFields ?? {}
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // When admin also filters by seller, scope the request lookups to that
  // seller's orders — otherwise every open order_change/return/exchange/claim
  // row in the marketplace gets scanned and then narrowed after the join.
  const sellerId = req.query.seller_id as string | string[] | undefined
  let sellerOrderIds: string[] | undefined
  if (sellerId) {
    const { data: sellerLinks } = await query.graph({
      entity: "order_seller",
      fields: ["order_id"],
      filters: { seller_id: sellerId },
    })
    sellerOrderIds = sellerLinks.map(
      (l: { order_id: string }) => l.order_id
    )
    if (sellerOrderIds.length === 0) {
      return respondEmpty(req, res)
    }
  }

  const wantsEdit = request.includes("edit")
  const wantsReturn = request.includes("return")
  const wantsExchange = request.includes("exchange")
  const wantsClaim = request.includes("claim")

  const emptyResult = Promise.resolve({ data: [] as { order_id: string }[] })

  const scopedOrderFilter = sellerOrderIds
    ? { order_id: sellerOrderIds }
    : {}

  const [editRes, returnRes, exchangeRes, claimRes] = await promiseAll([
    wantsEdit
      ? query.graph({
          entity: "order_change",
          fields: ["order_id"],
          filters: {
            ...isOpenOrderChange,
            change_type: "edit",
            ...scopedOrderFilter,
          },
        })
      : emptyResult,
    wantsReturn
      ? query.graph({
          entity: "return",
          fields: ["order_id"],
          filters: { ...isRequestedStatus, ...scopedOrderFilter },
        })
      : emptyResult,
    wantsExchange
      ? query.graph({
          entity: "order_exchange",
          fields: ["order_id"],
          filters: { ...isRequestedStatus, ...scopedOrderFilter },
        })
      : emptyResult,
    wantsClaim
      ? query.graph({
          entity: "order_claim",
          fields: ["order_id"],
          filters: { ...isRequestedStatus, ...scopedOrderFilter },
        })
      : emptyResult,
  ])

  const matchingOrderIds = Array.from(
    new Set<string>([
      ...editRes.data.map((c: { order_id: string }) => c.order_id),
      ...returnRes.data.map((r: { order_id: string }) => r.order_id),
      ...exchangeRes.data.map((e: { order_id: string }) => e.order_id),
      ...claimRes.data.map((c: { order_id: string }) => c.order_id),
    ])
  )

  if (matchingOrderIds.length === 0) {
    return respondEmpty(req, res)
  }

  const existingId = filterableFields.id

  if (existingId !== undefined) {
    filterableFields.$and = [
      { id: existingId },
      { id: { $in: matchingOrderIds } },
    ]
    delete filterableFields.id
  } else {
    filterableFields.id = { $in: matchingOrderIds }
  }

  req.filterableFields = filterableFields

  return next()
}
