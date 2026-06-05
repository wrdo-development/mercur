// Route: /orders/:id/returns/:return_id/receive
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button, Heading, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { RouteDrawer, useRouteModal } from "@components/modals"
import { useOrder, useOrderPreview } from "@hooks/api/orders"
import {
  useAddReceiveItems,
  useConfirmReturnReceive,
  useInitiateReceiveReturn,
  useReturn,
} from "@hooks/api/returns"

let IS_REQUEST_RUNNING = false

export const Component = () => {
  const { id, return_id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { handleSuccess } = useRouteModal()

  const orderId = id ?? ""
  const returnId = return_id ?? ""

  const { order } = useOrder(orderId, { fields: "+currency_code,*items" })
  const { order: preview } = useOrderPreview(orderId)
  const { return: orderReturn } = useReturn(returnId, {
    fields: "*items.item,*items.item.variant,*items.item.variant.product",
  })

  const { mutateAsync: initiateReceiveReturn } = useInitiateReceiveReturn(
    returnId,
    orderId
  )
  const { mutateAsync: addReceiveItems } = useAddReceiveItems(
    returnId,
    orderId
  )
  const { mutateAsync: confirmReturnReceive, isPending: isConfirming } =
    useConfirmReturnReceive(returnId, orderId)

  useEffect(() => {
    ;(async () => {
      if (IS_REQUEST_RUNNING || !preview) {
        return
      }

      if (preview.order_change) {
        if (
          (preview.order_change.change_type as string) !== "return_receive"
        ) {
          navigate(`/orders/${orderId}`, { replace: true })
          toast.error(t("orders.returns.activeChangeError"))
        }
        return
      }

      if (!orderReturn) {
        return
      }

      IS_REQUEST_RUNNING = true
      try {
        const { return: initiated } = await initiateReceiveReturn({})
        await addReceiveItems({
          items: initiated.items.map(
            (i: { item_id: string; quantity: number }) => ({
              id: i.item_id,
              quantity: i.quantity,
            })
          ),
        })
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : t("errorBoundary.defaultTitle")
        )
      } finally {
        IS_REQUEST_RUNNING = false
      }
    })()
  }, [preview, orderReturn])

  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await confirmReturnReceive({})
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

  const ready = !!order && !!orderReturn && !!preview

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>
            {t("orders.returns.receive.title", {
              returnId: returnId.slice(-7),
            })}
          </Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {t("orders.returns.receive.itemsLabel")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>

      {ready && (
        <>
          <RouteDrawer.Body>
            <div className="flex flex-col gap-y-4">
              <Text size="small" weight="plus" leading="compact">
                {t("orders.returns.receive.itemsLabel")}
              </Text>
              <ul className="flex flex-col gap-y-2">
                {orderReturn.items.map(
                  (ri: {
                    id: string
                    item_id: string
                    quantity: number
                    item?: { title?: string }
                  }) => (
                    <li
                      key={ri.id}
                      className="bg-ui-bg-component shadow-elevation-card-rest flex items-center justify-between rounded-lg px-3 py-2"
                    >
                      <Text size="small" leading="compact">
                        {ri.item?.title ?? ri.item_id}
                      </Text>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        {`${ri.quantity}x`}
                      </Text>
                    </li>
                  )
                )}
              </ul>
            </div>
          </RouteDrawer.Body>
          <RouteDrawer.Footer>
            <div className="flex items-center gap-x-2">
              <RouteDrawer.Close asChild>
                <Button size="small" variant="secondary">
                  {t("actions.cancel")}
                </Button>
              </RouteDrawer.Close>
              <Button
                size="small"
                onClick={handleConfirm}
                isLoading={submitting || isConfirming}
              >
                {t("actions.confirm")}
              </Button>
            </div>
          </RouteDrawer.Footer>
        </>
      )}
    </RouteDrawer>
  )
}
