// Route: /orders/:id/edit
//
// SPEC-008 — Edit Order focus modal. Initiates an order-edit draft on
// mount (`useCreateOrderEdit`), exposes a quantity stepper for each
// original line item (`useUpdateOrderEditOriginalItem` — qty=0 removes),
// and a variant picker that adds new items to the draft via a stacked
// focus modal (`useAddOrderEditItems`). Walks the draft through
// request → confirm. Cancel closes the modal and discards the draft via
// `useCancelOrderEdit`.
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button, Heading, Input, Text, Textarea, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  RouteFocusModal,
  StackedFocusModal,
  useRouteModal,
  useStackedModal,
} from "@components/modals"
import { useOrder, useOrderPreview } from "@hooks/api/orders"
import {
  useAddOrderEditItems,
  useCancelOrderEdit,
  useConfirmOrderEdit,
  useCreateOrderEdit,
  useRequestOrderEdit,
  useUpdateOrderEditOriginalItem,
} from "@hooks/api/order-edits"

import { AddOrderEditItemsTable } from "./_components/add-order-edit-items-table"

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

  const [draftReady, setDraftReady] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [internalNote, setInternalNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const { mutateAsync: createOrderEdit } = useCreateOrderEdit(orderId)
  const { mutateAsync: cancelOrderEdit } = useCancelOrderEdit(orderId)
  const { mutateAsync: requestOrderEdit } = useRequestOrderEdit(orderId)
  const { mutateAsync: confirmOrderEdit } = useConfirmOrderEdit(orderId)
  const { mutateAsync: updateOriginalItem } =
    useUpdateOrderEditOriginalItem(orderId)
  const { mutateAsync: addOrderEditItems, isPending: isAddingItems } =
    useAddOrderEditItems(orderId)

  // Initiate draft on mount; redirect away if a non-edit change is
  // already active.
  useEffect(() => {
    async function run() {
      if (IS_REQUEST_RUNNING || draftReady || !preview) {
        return
      }

      if (preview.order_change) {
        if (preview.order_change.change_type !== "edit") {
          navigate(`/orders/${orderId}`, { replace: true })
          toast.error(t("orders.edits.activeChangeError"))
          return
        }
        setDraftReady(true)
        return
      }

      IS_REQUEST_RUNNING = true

      try {
        await createOrderEdit({ order_id: orderId })
        setDraftReady(true)
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
  }, [preview, orderId, draftReady, createOrderEdit, navigate, t])

  const originalItems = useMemo(() => {
    const items = (order as any)?.items ?? []
    return items as Array<{
      id: string
      title?: string
      product_title?: string
      quantity: number
      variant?: { title?: string }
      detail?: { fulfilled_quantity?: number }
    }>
  }, [order])

  const addedItems = useMemo(() => {
    const previewItems = (preview as any)?.items ?? []
    const originalIds = new Set(originalItems.map((i) => i.id))
    return (previewItems as Array<{
      id: string
      title?: string
      product_title?: string
      quantity: number
      variant?: { title?: string }
    }>).filter((i) => !originalIds.has(i.id))
  }, [preview, originalItems])

  const handleQtyChange = async (itemId: string, nextQty: number) => {
    setQuantities((prev) => ({ ...prev, [itemId]: nextQty }))
    try {
      await updateOriginalItem({ $itemId: itemId, quantity: nextQty })
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("errorBoundary.defaultTitle")
      )
    }
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await requestOrderEdit()
      await confirmOrderEdit()
      toast.success(t("orders.edits.toast.confirmedSuccessfully"))
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
    if (!draftReady) {
      navigate(`/orders/${orderId}`, { replace: true })
      return
    }
    setCanceling(true)
    try {
      await cancelOrderEdit()
      toast.success(t("orders.edits.toast.canceledSuccessfully"))
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
        <span className="sr-only">{t("orders.edits.title")}</span>
      </RouteFocusModal.Title>
      <RouteFocusModal.Description className="sr-only">
        {t("orders.edits.title")}
      </RouteFocusModal.Description>

      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-y-8 px-6 py-16">
            <div>
              <Heading>{t("orders.edits.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("orders.edits.currentItemsDescription")}
              </Text>
            </div>

            <section className="bg-ui-bg-component shadow-elevation-card-rest rounded-lg">
              <div className="border-ui-border-base flex items-center justify-between border-b px-4 py-3">
                <Heading level="h3" className="text-ui-fg-base">
                  {t("orders.edits.currentItems")}
                </Heading>
                <AddItemsTrigger
                  disabled={!draftReady || submitting || canceling}
                  isPending={isAddingItems}
                  onSubmit={async (variantIds) => {
                    if (!variantIds.length) {
                      return
                    }
                    try {
                      await addOrderEditItems({
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
                {originalItems.length === 0 && (
                  <div className="px-4 py-6">
                    <Text size="small" className="text-ui-fg-subtle">
                      {t("general.noResultsTitle")}
                    </Text>
                  </div>
                )}
                {originalItems.map((item) => {
                  const currentQty =
                    quantities[item.id] !== undefined
                      ? quantities[item.id]
                      : item.quantity
                  const minQty = item.detail?.fulfilled_quantity ?? 0
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-x-4 px-4 py-3"
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
                        <Input
                          type="number"
                          min={minQty}
                          value={currentQty}
                          onChange={(e) => {
                            const next = Math.max(
                              minQty,
                              Number(e.target.value) || 0
                            )
                            handleQtyChange(item.id, next)
                          }}
                          className="w-20"
                          data-testid={`edit-item-${item.id}-qty`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {addedItems.length > 0 && (
              <section className="bg-ui-bg-component shadow-elevation-card-rest rounded-lg">
                <div className="border-ui-border-base flex items-center justify-between border-b px-4 py-3">
                  <Heading level="h3" className="text-ui-fg-base">
                    {t("orders.edits.addItems")}
                  </Heading>
                </div>
                <div className="divide-y">
                  {addedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-x-4 px-4 py-3"
                      data-testid={`edit-added-item-${item.id}`}
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
                      <Text size="small" className="text-ui-fg-subtle tabular-nums">
                        {item.quantity}x
                      </Text>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">
                {t("fields.internalNote", { defaultValue: "Internal note" })}
              </Text>
              <Textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder={t("orders.edits.noteHint")}
                data-testid="edit-internal-note"
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
            data-testid="edit-cancel"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            size="small"
            onClick={handleConfirm}
            isLoading={submitting}
            disabled={!draftReady || canceling}
            data-testid="edit-confirm"
          >
            {t("orders.edits.confirm")}
          </Button>
        </div>
      </div>
    </RouteFocusModal>
  )
}

export default Component

type AddItemsTriggerProps = {
  disabled?: boolean
  isPending?: boolean
  onSubmit: (variantIds: string[]) => Promise<void> | void
}

const STACKED_MODAL_ID = "order-edit-add-items"

const AddItemsTrigger = ({
  disabled,
  isPending,
  onSubmit,
}: AddItemsTriggerProps) => {
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
          data-testid="edit-add-items-trigger"
        >
          {t("orders.edits.addItems")}
        </Button>
      </StackedFocusModal.Trigger>
      <StackedFocusModal.Content>
        <StackedFocusModal.Header />
        <StackedFocusModal.Title asChild>
          <span className="sr-only">{t("orders.edits.addItems")}</span>
        </StackedFocusModal.Title>
        <StackedFocusModal.Description className="sr-only">
          {t("orders.edits.addItemsDescription")}
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
                data-testid="edit-add-items-cancel"
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
              data-testid="edit-add-items-save"
            >
              {t("actions.save")}
            </Button>
          </div>
        </StackedFocusModal.Footer>
      </StackedFocusModal.Content>
    </StackedFocusModal>
  )
}
