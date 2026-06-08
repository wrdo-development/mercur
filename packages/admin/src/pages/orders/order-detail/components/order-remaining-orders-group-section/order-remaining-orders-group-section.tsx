import { HttpTypes } from "@medusajs/types"
import { Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"

import { useDate } from "@hooks/use-date"
import { useOrderGroupByOrderId } from "@hooks/api/order-groups"
import {
  getOrderFulfillmentStatus,
  getOrderPaymentStatus,
} from "@lib/order-helpers"

const DEFAULT_FIELDS =
  "id,display_id,*orders,*orders.customer,*orders.seller,*orders.sales_channel"

export const OrderRemainingOrdersGroupSection = () => {
  const { id } = useParams()
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  const { order_group, isLoading, isError, error } = useOrderGroupByOrderId(
    id!,
    { fields: DEFAULT_FIELDS }
  )

  const group = order_group as
    | (HttpTypes.AdminOrder & {
        display_id?: number
        orders?: HttpTypes.AdminOrder[]
      })
    | undefined

  const otherOrders = useMemo(() => {
    if (!group?.orders) return []
    return group.orders.filter((o) => o.id !== id)
  }, [group, id])

  if (isError) {
    throw error
  }

  if (!isLoading && otherOrders.length === 0) {
    return null
  }

  return (
    <Container
      className="divide-y p-0"
      data-testid="order-remaining-orders-group-section"
    >
      <div
        className="flex items-center justify-between px-6 py-4"
        data-testid="order-remaining-orders-group-header"
      >
        <Heading
          level="h2"
          data-testid="order-remaining-orders-group-heading"
        >
          {t("orders.detail.otherOrdersInGroup.title", {
            groupId: group?.display_id ? `#G${group.display_id}` : "",
          })}
        </Heading>
      </div>
      {otherOrders.map((order) => (
        <OrderGroupSiblingRow
          key={order.id}
          order={order}
          getFullDate={getFullDate}
          t={t}
        />
      ))}
    </Container>
  )
}

type OrderGroupSiblingRowProps = {
  order: HttpTypes.AdminOrder
  getFullDate: (args: { date: string | Date; includeTime?: boolean }) => string
  t: (key: string, options?: Record<string, unknown>) => string
}

const OrderGroupSiblingRow = ({
  order,
  getFullDate,
  t,
}: OrderGroupSiblingRowProps) => {
  const payment = getOrderPaymentStatus(t, order.payment_status)
  const fulfillment = getOrderFulfillmentStatus(t, order.fulfillment_status)

  return (
    <Link
      to={`/orders/${order.id}`}
      className="hover:bg-ui-bg-subtle-hover flex items-start justify-between gap-x-3 px-6 py-4 transition-colors"
      data-testid={`order-remaining-orders-group-row-${order.id}`}
    >
      <div className="flex min-w-0 flex-col gap-y-1">
        <Text size="small" weight="plus" className="text-ui-fg-base">
          #{order.display_id}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {getFullDate({ date: order.created_at, includeTime: true })}
        </Text>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-y-1">
        <StatusBadge color={payment.color} className="text-nowrap">
          {payment.label}
        </StatusBadge>
        <StatusBadge color={fulfillment.color} className="text-nowrap">
          {fulfillment.label}
        </StatusBadge>
      </div>
    </Link>
  )
}
