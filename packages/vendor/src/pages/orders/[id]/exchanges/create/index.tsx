// Route: /orders/:id/exchanges/create
//
// SPEC-008 — Create Exchange focus modal. Initiates an exchange draft on
// mount (`useCreateExchange`), exposes a quantity stepper for each
// returnable line item (`useAddExchangeInboundItems`). Walks the draft
// through request → confirm via the same `POST /vendor/exchanges/:id/request`
// route. Cancel closes the modal and discards the draft via
// `useCancelExchangeBegin` (DELETE :id/request).
//
// Outbound variant picker is deferred to a follow-up sub-slice — the
// hooks (`useAddExchangeOutboundItems`, etc.) already exist in
// `hooks/api/exchanges.tsx` so the picker can be wired without
// revisiting this file's lifecycle code.
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button, Heading, Input, Text, Textarea, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { RouteFocusModal, useRouteModal } from "@components/modals"
import { useOrder, useOrderPreview } from "@hooks/api/orders"
import {
  useAddExchangeInboundItems,
  useCancelExchangeBegin,
  useCreateExchange,
  useRequestExchange,
} from "@hooks/api/exchanges"

let IS_REQUEST_RUNNING = false

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

  const [exchangeId, setExchangeId] = useState<string>("")
  const [internalNote, setInternalNote] = useState("")
  const [inboundQuantities, setInboundQuantities] = useState<
    Record<string, number>
  >({})
  const [submitting, setSubmitting] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const { mutateAsync: createExchange } = useCreateExchange(orderId)
  const { mutateAsync: cancelBegin } = useCancelExchangeBegin(
    exchangeId,
    orderId
  )
  const { mutateAsync: requestExchange } = useRequestExchange(
    exchangeId,
    orderId
  )
  const { mutateAsync: addInboundItems, isPending: isAddingInbound } =
    useAddExchangeInboundItems(exchangeId, orderId)

  useEffect(() => {
    async function run() {
      if (IS_REQUEST_RUNNING || exchangeId || !preview) {
        return
      }

      if (preview.order_change) {
        if (preview.order_change.change_type !== "exchange") {
          navigate(`/orders/${orderId}`, { replace: true })
          toast.error(t("orders.exchanges.activeChangeError"))
          return
        }
        // @ts-expect-error — exchange_id present when change_type is exchange
        setExchangeId(preview.order_change.exchange_id)
        return
      }

      IS_REQUEST_RUNNING = true

      try {
        const { exchange } = await createExchange({ order_id: orderId })
        setExchangeId(exchange.id)
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
  }, [preview, orderId, exchangeId, createExchange, navigate, t])

  const returnableItems = useMemo(() => {
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
    () =>
      Object.values(inboundQuantities).some((qty) => qty > 0),
    [inboundQuantities]
  )

  const handleQtyChange = (itemId: string, nextQty: number) => {
    setInboundQuantities((prev) => ({ ...prev, [itemId]: nextQty }))
  }

  const handleConfirm = async () => {
    if (!exchangeId) {
      return
    }

    setSubmitting(true)
    try {
      const inboundPayload = Object.entries(inboundQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, quantity]) => ({ id: itemId, quantity }))

      if (inboundPayload.length > 0) {
        await addInboundItems({ items: inboundPayload })
      }

      await requestExchange()
      toast.success(t("orders.exchanges.toast.confirmedSuccessfully"))
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
    if (!exchangeId) {
      navigate(`/orders/${orderId}`, { replace: true })
      return
    }
    setCanceling(true)
    try {
      await cancelBegin()
      toast.success(t("orders.exchanges.toast.canceledSuccessfully"))
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
        <span className="sr-only">{t("orders.exchanges.title")}</span>
      </RouteFocusModal.Title>
      <RouteFocusModal.Description className="sr-only">
        {t("orders.exchanges.title")}
      </RouteFocusModal.Description>

      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-y-8 px-6 py-16">
            <div>
              <Heading>{t("orders.exchanges.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("orders.exchanges.description")}
              </Text>
            </div>

            <section className="bg-ui-bg-component shadow-elevation-card-rest rounded-lg">
              <div className="border-ui-border-base flex items-center justify-between border-b px-4 py-3">
                <Heading level="h3" className="text-ui-fg-base">
                  {t("orders.exchanges.inboundItems")}
                </Heading>
              </div>
              <div className="divide-y">
                {returnableItems.length === 0 && (
                  <div className="px-4 py-6">
                    <Text size="small" className="text-ui-fg-subtle">
                      {t("orders.exchanges.noReturnableItems")}
                    </Text>
                  </div>
                )}
                {returnableItems.map((item) => {
                  const detail = item.detail ?? {}
                  const fulfilled = detail.fulfilled_quantity ?? 0
                  const requested = detail.return_requested_quantity ?? 0
                  const returned = detail.returned_quantity ?? 0
                  const remaining = fulfilled - requested - returned
                  const currentQty = inboundQuantities[item.id] ?? 0
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-x-4 px-4 py-3"
                      data-testid={`exchange-inbound-item-${item.id}`}
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
                          {t("orders.exchanges.remainingQty", {
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
                          data-testid={`exchange-inbound-item-${item.id}-qty`}
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
                placeholder={t("orders.exchanges.noteHint")}
                data-testid="exchange-internal-note"
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
            data-testid="exchange-cancel"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            size="small"
            onClick={handleConfirm}
            isLoading={submitting || isAddingInbound}
            disabled={!exchangeId || canceling || !hasSelection}
            data-testid="exchange-confirm"
          >
            {t("orders.exchanges.confirm")}
          </Button>
        </div>
      </div>
    </RouteFocusModal>
  )
}

export default Component
