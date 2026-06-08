// Route: /orders/:id/exchanges/create
//
// SPEC-008 — Create Exchange focus modal. Initiates an exchange draft on
// mount (`useCreateExchange`), exposes a quantity stepper for each
// returnable line item (`useAddExchangeInboundItems`) and an outbound
// variant picker via StackedFocusModal (`useAddExchangeOutboundItems`).
// Walks the draft through request → confirm via the same
// `POST /vendor/exchanges/:id/request` route. Cancel closes the modal
// and discards the draft via `useCancelExchangeBegin` (DELETE :id/request).
//
// The outbound picker reuses the generic `AddOrderEditItemsTable` variant
// table from the Edit Order flow — same shape, both flows take
// `{ variant_id, quantity }` pairs as input.
//
// Per-row reason / location / shipping dropdowns deferred to a future
// sub-slice; backend already accepts those fields on the inbound /
// shipping-method sub-routes (hooks in tree).
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Button,
  Heading,
  Input,
  Label,
  Select,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  RouteFocusModal,
  StackedFocusModal,
  useRouteModal,
  useStackedModal,
} from "@components/modals"
import { useOrder, useOrderPreview } from "@hooks/api/orders"
import {
  useAddExchangeInboundItems,
  useAddExchangeInboundShipping,
  useAddExchangeOutboundItems,
  useCancelExchangeBegin,
  useCreateExchange,
  useRequestExchange,
} from "@hooks/api/exchanges"
import { useReturnReasons } from "@hooks/api/return-reasons"
import { useShippingOptions } from "@hooks/api/shipping-options"
import { useStockLocations } from "@hooks/api/stock-locations"

import { AddOrderEditItemsTable } from "../../edit/_components/add-order-edit-items-table"

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
  const [locationId, setLocationId] = useState<string>("")
  const [shippingOptionId, setShippingOptionId] = useState<string>("")
  const [inboundQuantities, setInboundQuantities] = useState<
    Record<string, number>
  >({})
  const [inboundReasons, setInboundReasons] = useState<
    Record<string, string>
  >({})
  const [inboundNotes, setInboundNotes] = useState<Record<string, string>>(
    {}
  )
  const [submitting, setSubmitting] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const { stock_locations: stockLocations = [] } = useStockLocations()
  const { shipping_options: shippingOptions = [] } = useShippingOptions(
    { stock_location_id: locationId },
    { enabled: !!locationId }
  )
  const { return_reasons: returnReasons = [] } = useReturnReasons()

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
  const { mutateAsync: addOutboundItems, isPending: isAddingOutbound } =
    useAddExchangeOutboundItems(exchangeId, orderId)
  const { mutateAsync: addInboundShipping, isPending: isAddingShipping } =
    useAddExchangeInboundShipping(exchangeId, orderId)

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

  const outboundItems = useMemo(() => {
    const previewItems = ((preview as any)?.items ?? []) as Array<{
      id: string
      title?: string
      product_title?: string
      quantity: number
      variant?: { title?: string }
    }>
    const originalIds = new Set(
      (((order as any)?.items ?? []) as Array<{ id: string }>).map((i) => i.id)
    )
    return previewItems.filter((i) => !originalIds.has(i.id))
  }, [preview, order])

  const hasSelection = useMemo(
    () =>
      Object.values(inboundQuantities).some((qty) => qty > 0) ||
      outboundItems.length > 0,
    [inboundQuantities, outboundItems]
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
        .map(([itemId, quantity]) => ({
          id: itemId,
          quantity,
          ...(inboundReasons[itemId]
            ? { reason_id: inboundReasons[itemId] }
            : {}),
          ...(inboundNotes[itemId]
            ? { internal_note: inboundNotes[itemId] }
            : {}),
        }))

      if (inboundPayload.length > 0) {
        await addInboundItems({
          items: inboundPayload,
          ...(locationId ? { location_id: locationId } : {}),
        })
      }

      if (shippingOptionId) {
        await addInboundShipping({ shipping_option_id: shippingOptionId })
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
                  const isSelected = currentQty > 0
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-y-3 px-4 py-3"
                      data-testid={`exchange-inbound-item-${item.id}`}
                    >
                      <div className="flex items-center justify-between gap-x-4">
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
                              const next = Math.max(
                                0,
                                Math.min(remaining, raw)
                              )
                              handleQtyChange(item.id, next)
                            }}
                            className="w-20"
                            data-testid={`exchange-inbound-item-${item.id}-qty`}
                          />
                        </div>
                      </div>
                      {isSelected && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <Select
                            value={inboundReasons[item.id] ?? ""}
                            onValueChange={(value) =>
                              setInboundReasons((prev) => ({
                                ...prev,
                                [item.id]: value,
                              }))
                            }
                          >
                            <Select.Trigger
                              data-testid={`exchange-inbound-item-${item.id}-reason`}
                            >
                              <Select.Value
                                placeholder={t(
                                  "orders.exchanges.reasonPlaceholder"
                                )}
                              />
                            </Select.Trigger>
                            <Select.Content>
                              {(returnReasons as any[]).map((r) => (
                                <Select.Item key={r.id} value={r.id}>
                                  {r.label ?? r.value}
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select>
                          <Input
                            type="text"
                            value={inboundNotes[item.id] ?? ""}
                            onChange={(e) =>
                              setInboundNotes((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            placeholder={t(
                              "orders.exchanges.itemNotePlaceholder"
                            )}
                            data-testid={`exchange-inbound-item-${item.id}-note`}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="bg-ui-bg-component shadow-elevation-card-rest flex flex-col gap-y-2 rounded-lg p-3">
              <Label htmlFor="exchange-location" weight="plus">
                {t("orders.exchanges.location")}
              </Label>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("orders.exchanges.locationHint")}
              </Text>
              <Select
                value={locationId}
                onValueChange={(value) => {
                  setLocationId(value)
                  setShippingOptionId("")
                }}
              >
                <Select.Trigger
                  id="exchange-location"
                  data-testid="exchange-location-trigger"
                >
                  <Select.Value
                    placeholder={t("orders.exchanges.locationPlaceholder")}
                  />
                </Select.Trigger>
                <Select.Content>
                  {stockLocations.map((loc: any) => (
                    <Select.Item key={loc.id} value={loc.id}>
                      {loc.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </section>

            <section className="bg-ui-bg-component shadow-elevation-card-rest flex flex-col gap-y-2 rounded-lg p-3">
              <Label htmlFor="exchange-shipping" weight="plus">
                {t("orders.exchanges.inboundShipping")}
              </Label>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("orders.exchanges.inboundShippingHint")}
              </Text>
              <Select
                value={shippingOptionId}
                onValueChange={(value) => setShippingOptionId(value)}
                disabled={!locationId}
              >
                <Select.Trigger
                  id="exchange-shipping"
                  data-testid="exchange-shipping-trigger"
                >
                  <Select.Value
                    placeholder={
                      locationId
                        ? t("orders.exchanges.inboundShippingPlaceholder")
                        : t("orders.exchanges.inboundShippingLockedPlaceholder")
                    }
                  />
                </Select.Trigger>
                <Select.Content>
                  {(shippingOptions as any[]).map((opt) => (
                    <Select.Item key={opt.id} value={opt.id}>
                      {opt.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </section>

            <section className="bg-ui-bg-component shadow-elevation-card-rest rounded-lg">
              <div className="border-ui-border-base flex items-center justify-between border-b px-4 py-3">
                <Heading level="h3" className="text-ui-fg-base">
                  {t("orders.exchanges.outboundItems")}
                </Heading>
                <AddOutboundItemsTrigger
                  disabled={!exchangeId || submitting || canceling}
                  isPending={isAddingOutbound}
                  onSubmit={async (variantIds) => {
                    if (!variantIds.length) {
                      return
                    }
                    try {
                      await addOutboundItems({
                        items: variantIds.map((variant_id) => ({
                          variant_id,
                          quantity: 1,
                        })),
                      })
                    } catch (e) {
                      toast.error(
                        e instanceof Error
                          ? e.message
                          : t("errorBoundary.defaultTitle")
                      )
                    }
                  }}
                />
              </div>
              <div className="divide-y">
                {outboundItems.length === 0 && (
                  <div className="px-4 py-6">
                    <Text size="small" className="text-ui-fg-subtle">
                      {t("orders.exchanges.noOutboundItems")}
                    </Text>
                  </div>
                )}
                {outboundItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-x-4 px-4 py-3"
                    data-testid={`exchange-outbound-item-${item.id}`}
                  >
                    <div className="flex flex-col">
                      <Text size="small" weight="plus">
                        {item.product_title ?? item.title ?? item.id}
                      </Text>
                      {item.variant?.title && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {item.variant.title}
                        </Text>
                      )}
                    </div>
                    <Text
                      size="small"
                      className="text-ui-fg-subtle tabular-nums"
                    >
                      {item.quantity}x
                    </Text>
                  </div>
                ))}
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
            isLoading={
              submitting || isAddingInbound || isAddingShipping
            }
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

type AddOutboundItemsTriggerProps = {
  disabled?: boolean
  isPending?: boolean
  onSubmit: (variantIds: string[]) => Promise<void> | void
}

const STACKED_MODAL_ID = "exchange-add-outbound-items"

const AddOutboundItemsTrigger = ({
  disabled,
  isPending,
  onSubmit,
}: AddOutboundItemsTriggerProps) => {
  const { t } = useTranslation()
  const { setIsOpen } = useStackedModal()
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([])

  const handleSave = async () => {
    await onSubmit(selectedVariantIds)
    setSelectedVariantIds([])
    setIsOpen(STACKED_MODAL_ID, false)
  }

  return (
    <StackedFocusModal id={STACKED_MODAL_ID}>
      <StackedFocusModal.Trigger asChild>
        <Button
          variant="secondary"
          size="small"
          disabled={disabled}
          data-testid="exchange-add-outbound-trigger"
        >
          {t("orders.exchanges.addOutboundItems")}
        </Button>
      </StackedFocusModal.Trigger>
      <StackedFocusModal.Content>
        <StackedFocusModal.Header />
        <StackedFocusModal.Title asChild>
          <span className="sr-only">
            {t("orders.exchanges.addOutboundItems")}
          </span>
        </StackedFocusModal.Title>
        <StackedFocusModal.Description className="sr-only">
          {t("orders.exchanges.addOutboundItemsDescription")}
        </StackedFocusModal.Description>

        <StackedFocusModal.Body className="size-full overflow-hidden">
          <AddOrderEditItemsTable
            onSelectionChange={(ids) => setSelectedVariantIds(ids)}
          />
        </StackedFocusModal.Body>

        <StackedFocusModal.Footer>
          <div className="flex w-full items-center justify-end gap-x-2">
            <StackedFocusModal.Close asChild>
              <Button
                type="button"
                variant="secondary"
                size="small"
                data-testid="exchange-add-outbound-cancel"
              >
                {t("actions.cancel")}
              </Button>
            </StackedFocusModal.Close>
            <Button
              size="small"
              type="button"
              onClick={handleSave}
              isLoading={isPending}
              disabled={!selectedVariantIds.length || isPending}
              data-testid="exchange-add-outbound-save"
            >
              {t("actions.save")}
            </Button>
          </div>
        </StackedFocusModal.Footer>
      </StackedFocusModal.Content>
    </StackedFocusModal>
  )
}
