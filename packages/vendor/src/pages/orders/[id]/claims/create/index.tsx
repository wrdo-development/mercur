// Route: /orders/:id/claims/create
//
// SPEC-008 — Create Claim focus modal. Initiates a claim draft on mount
// (`useCreateClaim`), exposes a quantity stepper for each fulfilled
// line item (claim-items, via `useAddClaimItems`). Walks the draft
// through request → confirm via `POST /vendor/claims/:id/request`.
// Cancel closes the modal and discards the draft via
// `useCancelClaimBegin` (DELETE :id/request).
//
// ClaimType selector at the top: "refund" (no replacement shipment)
// vs "replace" (with outbound shipment). Outbound variant picker is
// deferred to a follow-up sub-slice — hooks
// (`useAddClaimOutboundItems`, etc.) already exist in
// `hooks/api/claims.tsx` so the picker can be wired without
// revisiting the lifecycle code.
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Button,
  Heading,
  Input,
  Label,
  RadioGroup,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { RouteFocusModal, useRouteModal } from "@components/modals"
import { useOrder, useOrderPreview } from "@hooks/api/orders"
import {
  useAddClaimItems,
  useCancelClaimBegin,
  useCreateClaim,
  useRequestClaim,
} from "@hooks/api/claims"

let IS_REQUEST_RUNNING = false

type ClaimType = "refund" | "replace"

export const Component = () => {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { handleSuccess } = useRouteModal()

  const orderId = id ?? ""

  const { order } = useOrder(orderId, {
    fields: "+currency_code,*items,*items.detail,*items.variant",
  })
  const { order: preview } = useOrderPreview(orderId)

  const [claimType, setClaimType] = useState<ClaimType>("refund")
  const [claimId, setClaimId] = useState<string>("")
  const [internalNote, setInternalNote] = useState("")
  const [itemQuantities, setItemQuantities] = useState<
    Record<string, number>
  >({})
  const [submitting, setSubmitting] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const { mutateAsync: createClaim } = useCreateClaim(orderId)
  const { mutateAsync: cancelBegin } = useCancelClaimBegin(claimId, orderId)
  const { mutateAsync: requestClaim } = useRequestClaim(claimId, orderId)
  const { mutateAsync: addClaimItems, isPending: isAddingItems } =
    useAddClaimItems(claimId, orderId)

  useEffect(() => {
    async function run() {
      if (IS_REQUEST_RUNNING || claimId || !preview) {
        return
      }

      if (preview.order_change) {
        if (preview.order_change.change_type !== "claim") {
          navigate(`/orders/${orderId}`, { replace: true })
          toast.error(t("orders.claims.activeChangeError"))
          return
        }
        // @ts-expect-error — claim_id present when change_type is claim
        setClaimId(preview.order_change.claim_id)
        return
      }

      IS_REQUEST_RUNNING = true

      try {
        const { claim } = await createClaim({
          type: claimType,
          order_id: orderId,
        })
        setClaimId(claim.id)
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : t("errorBoundary.defaultTitle")
        )
        navigate(`/orders/${orderId}`, { replace: true })
      } finally {
        IS_REQUEST_RUNNING = false
      }
    }

    run()
    // claimType is intentionally NOT in deps — it only affects the
    // initial create call; switching after creation requires cancel +
    // recreate flow, which is a separate slice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, orderId, claimId, createClaim, navigate, t])

  const claimableItems = useMemo(() => {
    const items = ((order as any)?.items ?? []) as Array<{
      id: string
      title?: string
      product_title?: string
      quantity: number
      variant?: { title?: string }
      detail?: {
        fulfilled_quantity?: number
        return_requested_quantity?: number
        returned_quantity?: number
      }
    }>
    return items.filter((item) => {
      const detail = item.detail ?? {}
      const fulfilled = detail.fulfilled_quantity ?? 0
      const requested = detail.return_requested_quantity ?? 0
      const returned = detail.returned_quantity ?? 0
      return fulfilled - requested - returned > 0
    })
  }, [order])

  const hasSelection = useMemo(
    () => Object.values(itemQuantities).some((qty) => qty > 0),
    [itemQuantities]
  )

  const handleQtyChange = (itemId: string, nextQty: number) => {
    setItemQuantities((prev) => ({ ...prev, [itemId]: nextQty }))
  }

  const handleConfirm = async () => {
    if (!claimId) {
      return
    }

    setSubmitting(true)
    try {
      const itemsPayload = Object.entries(itemQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, quantity]) => ({ id: itemId, quantity }))

      if (itemsPayload.length > 0) {
        await addClaimItems({ items: itemsPayload })
      }

      await requestClaim()
      toast.success(t("orders.claims.toast.confirmedSuccessfully"))
      handleSuccess(`/orders/${orderId}`)
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("errorBoundary.defaultTitle")
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = async () => {
    if (!claimId) {
      navigate(`/orders/${orderId}`, { replace: true })
      return
    }
    setCanceling(true)
    try {
      await cancelBegin()
      toast.success(t("orders.claims.toast.canceledSuccessfully"))
    } catch {
      // Swallow — user is leaving the screen.
    } finally {
      setCanceling(false)
      navigate(`/orders/${orderId}`, { replace: true })
    }
  }

  return (
    <RouteFocusModal>
      <RouteFocusModal.Title asChild>
        <span className="sr-only">{t("orders.claims.title")}</span>
      </RouteFocusModal.Title>
      <RouteFocusModal.Description className="sr-only">
        {t("orders.claims.title")}
      </RouteFocusModal.Description>

      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-y-8 px-6 py-16">
            <div>
              <Heading>{t("orders.claims.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("orders.claims.description")}
              </Text>
            </div>

            <section className="bg-ui-bg-component shadow-elevation-card-rest flex flex-col gap-y-3 rounded-lg p-3">
              <Text size="small" weight="plus">
                {t("orders.claims.typeLabel")}
              </Text>
              <RadioGroup
                value={claimType}
                onValueChange={(value) => setClaimType(value as ClaimType)}
                disabled={!!claimId}
              >
                <div className="flex items-center gap-x-2">
                  <RadioGroup.Item value="refund" id="claim-type-refund" />
                  <Label htmlFor="claim-type-refund" weight="plus">
                    {t("orders.claims.typeRefund")}
                  </Label>
                </div>
                <div className="flex items-center gap-x-2">
                  <RadioGroup.Item value="replace" id="claim-type-replace" />
                  <Label htmlFor="claim-type-replace" weight="plus">
                    {t("orders.claims.typeReplace")}
                  </Label>
                </div>
              </RadioGroup>
              {!!claimId && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("orders.claims.typeLockedAfterStart")}
                </Text>
              )}
            </section>

            <section className="bg-ui-bg-component shadow-elevation-card-rest rounded-lg">
              <div className="border-ui-border-base flex items-center justify-between border-b px-4 py-3">
                <Heading level="h3" className="text-ui-fg-base">
                  {t("orders.claims.claimItems")}
                </Heading>
              </div>
              <div className="divide-y">
                {claimableItems.length === 0 && (
                  <div className="px-4 py-6">
                    <Text size="small" className="text-ui-fg-subtle">
                      {t("orders.claims.noClaimableItems")}
                    </Text>
                  </div>
                )}
                {claimableItems.map((item) => {
                  const detail = item.detail ?? {}
                  const fulfilled = detail.fulfilled_quantity ?? 0
                  const requested = detail.return_requested_quantity ?? 0
                  const returned = detail.returned_quantity ?? 0
                  const remaining = fulfilled - requested - returned
                  const currentQty = itemQuantities[item.id] ?? 0
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-x-4 px-4 py-3"
                      data-testid={`claim-item-${item.id}`}
                    >
                      <div className="flex flex-col">
                        <Text size="small" weight="plus">
                          {item.product_title ?? item.title ?? item.id}
                        </Text>
                        {item.variant?.title && (
                          <Text
                            size="xsmall"
                            className="text-ui-fg-subtle"
                          >
                            {item.variant.title}
                          </Text>
                        )}
                      </div>
                      <div className="flex items-center gap-x-2">
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {t("orders.claims.remainingQty", {
                            count: remaining,
                          })}
                        </Text>
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          value={currentQty}
                          onChange={(e) => {
                            const raw = Number(e.target.value) || 0
                            const next = Math.max(0, Math.min(remaining, raw))
                            handleQtyChange(item.id, next)
                          }}
                          className="w-20"
                          data-testid={`claim-item-${item.id}-qty`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">
                {t("fields.internalNote", { defaultValue: "Internal note" })}
              </Text>
              <Textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder={t("orders.claims.noteHint")}
                data-testid="claim-internal-note"
              />
            </section>
          </div>
        </div>

        <div className="bg-ui-bg-base border-ui-border-base sticky bottom-0 flex items-center justify-end gap-x-2 border-t px-6 py-4">
          <Button
            variant="secondary"
            size="small"
            onClick={handleClose}
            disabled={submitting}
            isLoading={canceling}
            data-testid="claim-cancel"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            size="small"
            onClick={handleConfirm}
            isLoading={submitting || isAddingItems}
            disabled={!claimId || canceling || !hasSelection}
            data-testid="claim-confirm"
          >
            {t("orders.claims.confirm")}
          </Button>
        </div>
      </div>
    </RouteFocusModal>
  )
}

export default Component
