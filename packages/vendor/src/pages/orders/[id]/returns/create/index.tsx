// Route: /orders/:id/returns/create
//
// SPEC-008 — Create Return focus modal. The backend route tree
// (`/vendor/returns` + sub-resources) is already shipped; this
// scaffold ports the Medusa-admin draft-and-mutate pattern to the
// vendor surface. The draft is created on mount via useInitiateReturn,
// each selected line item is persisted with useAddReturnItem, and the
// Confirm button flips the draft to "requested" via
// useConfirmReturnRequest. Closing the modal while the draft is open
// calls useCancelReturnRequest so the order never gets stranded with
// an empty return.
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Button,
  Checkbox,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { RouteFocusModal, useRouteModal } from "@components/modals"
import { useDocumentDirection } from "@hooks/use-document-direction"
import { useOrder, useOrderPreview } from "@hooks/api/orders"
import { useReturnReasons } from "@hooks/api/return-reasons"
import {
  useAddReturnItem,
  useAddReturnShipping,
  useCancelReturnRequest,
  useConfirmReturnRequest,
  useInitiateReturn,
  useUpdateReturn,
} from "@hooks/api/returns"
import { useShippingOptions } from "@hooks/api/shipping-options"
import { useStockLocations } from "@hooks/api/stock-locations"

type SelectedItem = {
  selected: boolean
  quantity: number
  reasonId?: string
  note?: string
  actionId?: string
}

let IS_REQUEST_RUNNING = false

export const Component = () => {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dir = useDocumentDirection()
  const { handleSuccess } = useRouteModal()

  const orderId = id ?? ""

  const { order } = useOrder(orderId, {
    fields: "+currency_code,*items,*items.detail,*items.variant",
  })
  const { order: preview } = useOrderPreview(orderId)
  const { return_reasons: returnReasons = [] } = useReturnReasons()

  const [returnId, setReturnId] = useState<string | undefined>(undefined)
  const [items, setItems] = useState<Record<string, SelectedItem>>({})
  const [notify, setNotify] = useState(true)
  const [locationId, setLocationId] = useState<string | undefined>(undefined)
  const [shippingOptionId, setShippingOptionId] = useState<string | undefined>(
    undefined
  )
  const [submitting, setSubmitting] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const { stock_locations: stockLocations = [] } = useStockLocations()
  const { shipping_options: shippingOptions = [] } = useShippingOptions(
    locationId ? { stock_location_id: locationId } : undefined,
    { enabled: !!locationId }
  )

  const { mutateAsync: initiateReturn } = useInitiateReturn(orderId)
  const { mutateAsync: addReturnItem } = useAddReturnItem(
    returnId ?? "",
    orderId
  )
  const { mutateAsync: updateReturn } = useUpdateReturn(
    returnId ?? "",
    orderId
  )
  const { mutateAsync: addReturnShipping } = useAddReturnShipping(
    returnId ?? "",
    orderId
  )
  const { mutateAsync: confirmReturn, isPending: isConfirming } =
    useConfirmReturnRequest(returnId ?? "", orderId)
  const { mutateAsync: cancelReturn } = useCancelReturnRequest(
    returnId ?? "",
    orderId
  )

  // Draft-and-mutate: spin up the return draft once the preview and
  // order are loaded. Re-runs are guarded by both the module-scoped
  // flag (handles React StrictMode double-mount) and a returnId state
  // check (handles the post-creation rerender).
  useEffect(() => {
    ;(async () => {
      if (IS_REQUEST_RUNNING || returnId || !preview || !order) {
        return
      }

      if (
        preview.order_change &&
        (preview.order_change.change_type as string) !== "return_request"
      ) {
        navigate(`/orders/${orderId}`, { replace: true })
        toast.error(t("orders.returns.activeChangeError"))
        return
      }

      IS_REQUEST_RUNNING = true
      try {
        const { return: initiated } = await initiateReturn({
          order_id: orderId,
        })
        setReturnId(initiated.id)
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : t("errorBoundary.defaultTitle")
        )
      } finally {
        IS_REQUEST_RUNNING = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, order, returnId, orderId])

  const returnableItems = useMemo(() => {
    if (!order?.items) {
      return []
    }

    return order.items.filter((item) => {
      const fulfilled = (item as any).detail?.fulfilled_quantity ?? 0
      const returnRequested =
        (item as any).detail?.return_requested_quantity ?? 0
      const returned = (item as any).detail?.returned_quantity ?? 0
      return fulfilled - returnRequested - returned > 0
    })
  }, [order?.items])

  const hasSelection = useMemo(
    () => Object.values(items).some((s) => s.selected && s.quantity > 0),
    [items]
  )

  const handleToggleItem = (itemId: string, fulfilledRemaining: number) => {
    setItems((prev) => {
      const next = { ...prev }
      if (next[itemId]?.selected) {
        next[itemId] = { ...next[itemId], selected: false }
      } else {
        next[itemId] = {
          ...(next[itemId] ?? {}),
          selected: true,
          quantity: next[itemId]?.quantity ?? fulfilledRemaining,
        }
      }
      return next
    })
  }

  const handleConfirm = async () => {
    if (!returnId) {
      return
    }

    const selectedIds = Object.entries(items)
      .filter(([, s]) => s.selected && s.quantity > 0)
      .map(([itemId]) => itemId)

    if (selectedIds.length === 0) {
      toast.error(t("orders.returns.noItemsSelected"))
      return
    }

    setSubmitting(true)
    try {
      if (locationId) {
        await updateReturn({ location_id: locationId } as any)
      }

      for (const itemId of selectedIds) {
        const sel = items[itemId]
        await addReturnItem({
          items: [
            {
              id: itemId,
              quantity: sel.quantity,
              reason_id: sel.reasonId,
              note: sel.note,
            },
          ],
        } as any)
      }

      if (shippingOptionId) {
        await addReturnShipping({
          shipping_option_id: shippingOptionId,
        } as any)
      }

      await confirmReturn({ no_notification: !notify } as any)
      toast.success(t("orders.returns.toast.confirmedSuccessfully"))
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
    if (!returnId || canceling) {
      navigate(`/orders/${orderId}`, { replace: true })
      return
    }
    setCanceling(true)
    try {
      await cancelReturn()
    } catch {
      // Swallow — the user is leaving; surface a toast on the order page if needed.
    } finally {
      setCanceling(false)
      navigate(`/orders/${orderId}`, { replace: true })
    }
  }

  const ready = !!order && !!preview && !!returnId

  return (
    <RouteFocusModal>
      <RouteFocusModal.Title asChild>
        <span className="sr-only">{t("orders.returns.create")}</span>
      </RouteFocusModal.Title>
      <RouteFocusModal.Description className="sr-only">
        {t("orders.returns.confirmText")}
      </RouteFocusModal.Description>

      <RouteFocusModal.Header>
        <div className="flex items-center gap-x-2">
          <Heading level="h1">{t("orders.returns.create")}</Heading>
        </div>
      </RouteFocusModal.Header>

      <RouteFocusModal.Body className="flex flex-col items-center overflow-y-auto p-16">
        <div className="flex w-full max-w-[720px] flex-col gap-y-8">
          {!ready ? (
            <Text size="small" className="text-ui-fg-subtle">
              {t("general.loading")}
            </Text>
          ) : (
            <>
              <div className="flex flex-col gap-y-4">
                <Text size="small" weight="plus" leading="compact">
                  {t("orders.returns.receive.itemsLabel")}
                </Text>
                {returnableItems.length === 0 ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("orders.returns.placeholders.noReturnShippingOptions.title")}
                  </Text>
                ) : (
                  <ul className="flex flex-col gap-y-3">
                    {returnableItems.map((item) => {
                      const detail = (item as any).detail ?? {}
                      const fulfilledRemaining =
                        (detail.fulfilled_quantity ?? 0) -
                        (detail.return_requested_quantity ?? 0) -
                        (detail.returned_quantity ?? 0)
                      const sel = items[item.id]
                      return (
                        <li
                          key={item.id}
                          className="bg-ui-bg-component shadow-elevation-card-rest flex flex-col gap-y-3 rounded-lg p-3"
                          data-testid={`return-item-${item.id}`}
                        >
                          <div className="flex items-center justify-between gap-x-3">
                            <Checkbox
                              checked={!!sel?.selected}
                              onCheckedChange={() =>
                                handleToggleItem(item.id, fulfilledRemaining)
                              }
                              data-testid={`return-item-${item.id}-checkbox`}
                            />
                            <div className="flex-1">
                              <Text size="small" leading="compact">
                                {item.product_title ?? item.title}
                              </Text>
                              {item.variant_title && (
                                <Text
                                  size="xsmall"
                                  className="text-ui-fg-subtle"
                                  leading="compact"
                                >
                                  {item.variant_title}
                                </Text>
                              )}
                            </div>
                            <Input
                              type="number"
                              min={1}
                              max={fulfilledRemaining}
                              disabled={!sel?.selected}
                              value={sel?.quantity ?? fulfilledRemaining}
                              onChange={(e) =>
                                setItems((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...(prev[item.id] ?? { selected: true }),
                                    quantity: Math.max(
                                      1,
                                      Math.min(
                                        fulfilledRemaining,
                                        Number(e.target.value) || 0
                                      )
                                    ),
                                  },
                                }))
                              }
                              className="w-24"
                              data-testid={`return-item-${item.id}-qty`}
                            />
                          </div>
                          {sel?.selected && (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="flex flex-col gap-y-1">
                                <Label size="xsmall">
                                  {t("orders.returns.reason")}
                                </Label>
                                <Select
                                  dir={dir}
                                  value={sel.reasonId ?? ""}
                                  onValueChange={(val) =>
                                    setItems((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        reasonId: val || undefined,
                                      },
                                    }))
                                  }
                                >
                                  <Select.Trigger
                                    data-testid={`return-item-${item.id}-reason`}
                                  >
                                    <Select.Value placeholder="—" />
                                  </Select.Trigger>
                                  <Select.Content>
                                    {returnReasons.map((r: any) => (
                                      <Select.Item key={r.id} value={r.id}>
                                        {r.label ?? r.value}
                                      </Select.Item>
                                    ))}
                                  </Select.Content>
                                </Select>
                              </div>
                              <div className="flex flex-col gap-y-1">
                                <Label size="xsmall">
                                  {t("orders.returns.note")}
                                </Label>
                                <Input
                                  value={sel.note ?? ""}
                                  onChange={(e) =>
                                    setItems((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        note: e.target.value,
                                      },
                                    }))
                                  }
                                  data-testid={`return-item-${item.id}-note`}
                                />
                              </div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="bg-ui-bg-component shadow-elevation-card-rest flex flex-col gap-y-2 rounded-lg p-3">
                <div className="flex flex-col gap-y-1">
                  <Text size="small" weight="plus" leading="compact">
                    {t("orders.returns.location")}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {t("orders.returns.locationHint")}
                  </Text>
                </div>
                <Select
                  dir={dir}
                  value={locationId ?? ""}
                  onValueChange={(val) => {
                    setLocationId(val || undefined)
                    setShippingOptionId(undefined)
                  }}
                >
                  <Select.Trigger data-testid="return-create-location">
                    <Select.Value placeholder="—" />
                  </Select.Trigger>
                  <Select.Content>
                    {stockLocations.map((loc: any) => (
                      <Select.Item key={loc.id} value={loc.id}>
                        {loc.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>

              <div className="bg-ui-bg-component shadow-elevation-card-rest flex flex-col gap-y-2 rounded-lg p-3">
                <div className="flex flex-col gap-y-1">
                  <Text size="small" weight="plus" leading="compact">
                    {t("orders.returns.inboundShipping")}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {t("orders.returns.inboundShippingHint")}
                  </Text>
                </div>
                <Select
                  dir={dir}
                  value={shippingOptionId ?? ""}
                  onValueChange={(val) =>
                    setShippingOptionId(val || undefined)
                  }
                  disabled={!locationId}
                >
                  <Select.Trigger data-testid="return-create-shipping-option">
                    <Select.Value placeholder="—" />
                  </Select.Trigger>
                  <Select.Content>
                    {shippingOptions.map((opt: any) => (
                      <Select.Item key={opt.id} value={opt.id}>
                        {opt.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>

              <div className="bg-ui-bg-component shadow-elevation-card-rest flex items-center justify-between gap-x-3 rounded-lg p-3">
                <div>
                  <Text size="small" weight="plus" leading="compact">
                    {t("orders.returns.sendNotification")}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {t("orders.returns.sendNotificationHint")}
                  </Text>
                </div>
                <Switch
                  checked={notify}
                  onCheckedChange={setNotify}
                  data-testid="return-create-notify"
                />
              </div>
            </>
          )}
        </div>
      </RouteFocusModal.Body>

      <RouteFocusModal.Footer>
        <div className="flex items-center justify-end gap-x-2">
          <Button
            size="small"
            variant="secondary"
            onClick={handleClose}
            data-testid="return-create-cancel"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            size="small"
            onClick={handleConfirm}
            isLoading={submitting || isConfirming}
            disabled={!ready || !hasSelection}
            data-testid="return-create-confirm"
          >
            {t("orders.returns.confirm")}
          </Button>
        </div>
      </RouteFocusModal.Footer>
    </RouteFocusModal>
  )
}
