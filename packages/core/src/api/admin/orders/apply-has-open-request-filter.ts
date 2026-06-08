import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  promiseAll,
} from "@medusajs/framework/utils"

const VALID_TYPES = ["edit", "return", "exchange", "claim"] as const
type RequestType = (typeof VALID_TYPES)[number]

const CHANGE_TYPE_FOR_REQUEST: Record<
  Exclude<RequestType, "return">,
  string
> = {
  edit: "edit",
  exchange: "exchange",
  claim: "claim",
}

export const applyHasOpenRequestFilter = async (
  req: MedusaRequest,
  _: MedusaResponse,
  next: MedusaNextFunction
) => {
  const raw = req.query.has_open_request

  if (raw === undefined) {
    return next()
  }

  let booleanMode: boolean | null = null
  let selectedTypes: RequestType[] | null = null

  const rawValues = Array.isArray(raw)
    ? raw.flatMap((v) => String(v).split(","))
    : String(raw).split(",")

  const trimmed = rawValues.map((v) => v.trim()).filter(Boolean)

  if (trimmed.length === 1 && (trimmed[0] === "true" || trimmed[0] === "false")) {
    booleanMode = trimmed[0] === "true"
  } else {
    const parsed = trimmed.filter((v): v is RequestType =>
      (VALID_TYPES as readonly string[]).includes(v)
    )
    if (parsed.length > 0) {
      selectedTypes = Array.from(new Set(parsed))
    }
  }

  if (booleanMode === null && selectedTypes === null) {
    return next()
  }

  const filterableFields = req.filterableFields ?? {}
  delete filterableFields.has_open_request

  const includeReturns =
    booleanMode === true ||
    booleanMode === false ||
    (selectedTypes !== null && selectedTypes.includes("return"))

  const nonReturnTypes =
    selectedTypes?.filter((t): t is Exclude<RequestType, "return"> => t !== "return") ??
    []

  const includeChanges =
    booleanMode !== null || (selectedTypes !== null && nonReturnTypes.length > 0)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const changeTypeFilter =
    selectedTypes !== null
      ? nonReturnTypes.map((t) => CHANGE_TYPE_FOR_REQUEST[t])
      : undefined

  const [changesRes, returnsRes] = await promiseAll([
    includeChanges
      ? query.graph({
          entity: "order_change",
          fields: ["order_id"],
          filters: {
            status: ["requested", "pending"],
            ...(changeTypeFilter
              ? { change_type: changeTypeFilter }
              : {}),
          },
        })
      : Promise.resolve({ data: [] as { order_id: string }[] }),
    includeReturns
      ? query.graph({
          entity: "return",
          fields: ["order_id"],
          filters: { status: "requested" },
        })
      : Promise.resolve({ data: [] as { order_id: string }[] }),
  ])

  const openOrderIds = Array.from(
    new Set<string>([
      ...changesRes.data.map((c: { order_id: string }) => c.order_id),
      ...returnsRes.data.map((r: { order_id: string }) => r.order_id),
    ])
  )

  const existingId = filterableFields.id

  const includeMode = booleanMode !== false

  if (includeMode) {
    if (openOrderIds.length === 0) {
      filterableFields.id = { $in: [""] }
    } else if (existingId !== undefined) {
      filterableFields.$and = [
        { id: existingId },
        { id: { $in: openOrderIds } },
      ]
      delete filterableFields.id
    } else {
      filterableFields.id = { $in: openOrderIds }
    }
  } else {
    if (openOrderIds.length > 0) {
      if (existingId !== undefined) {
        filterableFields.$and = [
          { id: existingId },
          { id: { $nin: openOrderIds } },
        ]
        delete filterableFields.id
      } else {
        filterableFields.id = { $nin: openOrderIds }
      }
    }
  }

  req.filterableFields = filterableFields

  return next()
}
