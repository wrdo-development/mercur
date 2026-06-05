import { ArrowUturnLeft } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Text,
  Tooltip,
  toast,
} from "@medusajs/ui"

import { useTranslation } from "react-i18next"

import { ActionMenu } from "@components/common/action-menu"
import { useMarkPaymentCollectionAsPaid } from "../../../../../hooks/api/payment-collections"
import { getStylizedAmount } from "@lib/money-amount-helpers"
import { getOrderPaymentStatus } from "@lib/order-helpers"
import { getTotalCaptured, getTotalPending } from "@lib/payment"
import { useDate } from "@hooks/use-date"

type OrderPaymentSectionProps = {
  order: HttpTypes.AdminOrder
}

export const getPaymentsFromOrder = (order: HttpTypes.AdminOrder) => {
  return order.payment_collections
    ?.map((collection: HttpTypes.AdminPaymentCollection) => collection.payments)
    .flat(1)
    .filter(Boolean) as HttpTypes.AdminPayment[]
}

export const OrderPaymentSection = ({ order }: OrderPaymentSectionProps) => {
  const payments = getPaymentsFromOrder(order) ?? []

  return (
    <Container className="divide-y p-0">
      <Header order={order} />
      {payments.length > 0 && (
        <ul className="divide-y">
          {payments.map((payment) => (
            <PaymentRow key={payment.id} order={order} payment={payment} />
          ))}
        </ul>
      )}
      <Total order={order} />
      <OutstandingActions order={order} />
    </Container>
  )
}

const Header = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <Heading level="h2">{t("orders.payment.title")}</Heading>

      {order.payment_status && (
        <StatusBadge
          color={getOrderPaymentStatus(t, order.payment_status).color}
          className="text-nowrap"
        >
          {getOrderPaymentStatus(t, order.payment_status).label}
        </StatusBadge>
      )}
    </div>
  )
}

const Total = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()

  if (!order.payment_collections?.length) {
    return null
  }

  const paymentCollections = order.payment_collections
  const totalCaptured = getTotalCaptured(paymentCollections)
  const totalPending = getTotalPending(paymentCollections)
  const totalRefunded = paymentCollections.reduce(
    (acc, pc) => acc + ((pc.refunded_amount as number) || 0),
    0
  )

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4">
        <Text size="small" weight="plus" leading="compact">
          {t("orders.payment.totalPaidByCustomer")}
        </Text>

        <Text size="small" weight="plus" leading="compact">
          {getStylizedAmount(totalCaptured, order.currency_code)}
        </Text>
      </div>

      {totalRefunded > 0 && (
        <div className="flex items-center justify-between px-6 py-4">
          <Text size="small" weight="plus" leading="compact">
            {t("orders.payment.totalRefunded")}
          </Text>

          <Text size="small" weight="plus" leading="compact">
            {getStylizedAmount(totalRefunded, order.currency_code)}
          </Text>
        </div>
      )}

      {order.status !== "canceled" && totalPending > 0 && (
        <div className="flex items-center justify-between px-6 py-4">
          <Text size="small" weight="plus" leading="compact">
            {t("orders.payment.totalPending")}
          </Text>

          <Text size="small" weight="plus" leading="compact">
            {getStylizedAmount(totalPending, order.currency_code)}
          </Text>
        </div>
      )}
    </div>
  )
}

const getPaymentStatus = (
  payment: HttpTypes.AdminPayment
): { label: string; color: "green" | "orange" | "red" | "grey" } => {
  const refundedAmount = (payment.refunds ?? []).reduce(
    (acc: number, r: { amount?: number }) => acc + (r.amount ?? 0),
    0
  )
  if (payment.canceled_at) {
    return { label: "Canceled", color: "red" }
  }
  if (refundedAmount > 0 && refundedAmount >= (payment.amount as number)) {
    return { label: "Refunded", color: "grey" }
  }
  if (refundedAmount > 0) {
    return { label: "Partly refunded", color: "orange" }
  }
  if (payment.captured_at) {
    return { label: "Captured", color: "green" }
  }
  return { label: "Pending", color: "orange" }
}

const PaymentRow = ({
  order,
  payment,
}: {
  order: HttpTypes.AdminOrder
  payment: HttpTypes.AdminPayment
}) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  const status = getPaymentStatus(payment)
  const refundedAmount = (payment.refunds ?? []).reduce(
    (acc: number, r: { amount?: number }) => acc + (r.amount ?? 0),
    0
  )
  const isFullyRefunded =
    refundedAmount > 0 && refundedAmount >= (payment.amount as number)
  const canRefund =
    !!payment.captured_at && !payment.canceled_at && !isFullyRefunded

  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      data-testid={`payment-row-${payment.id}`}
    >
      <div className="flex min-w-0 flex-col">
        <Tooltip content={payment.id}>
          <Text
            size="small"
            weight="plus"
            leading="compact"
            className="text-ui-fg-base truncate"
          >
            {`#${payment.id.slice(-7)}`}
          </Text>
        </Tooltip>
        <Text
          size="xsmall"
          leading="compact"
          className={
            isFullyRefunded
              ? "text-ui-fg-muted line-through"
              : "text-ui-fg-subtle"
          }
        >
          {payment.created_at
            ? getFullDate({ date: payment.created_at, includeTime: true })
            : null}
        </Text>
      </div>

      <div className="flex items-center gap-x-3">
        <StatusBadge color={status.color} className="text-nowrap">
          {status.label}
        </StatusBadge>
        <Text size="small" weight="plus" leading="compact">
          {getStylizedAmount(payment.amount as number, order.currency_code)}
        </Text>

        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: t("orders.payment.createRefund"),
                  icon: <ArrowUturnLeft />,
                  to: `/orders/${order.id}/refund?payment_id=${payment.id}`,
                  disabled: !canRefund,
                },
              ],
            },
          ]}
        />
      </div>
    </div>
  )
}

const OutstandingActions = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()

  const unpaidCollection = order.payment_collections?.find(
    (pc) => pc.status !== "captured" && pc.status !== "canceled"
  )

  const pendingDifference = order.summary?.pending_difference || 0
  const isOutstanding =
    pendingDifference > 0.005 && order.status !== "canceled" && !!unpaidCollection

  const markAsPaid = useMarkPaymentCollectionAsPaid(
    order.id,
    unpaidCollection?.id ?? ""
  )

  if (!isOutstanding || !unpaidCollection) {
    return null
  }

  const paymentLink =
    (unpaidCollection.payment_sessions?.[0]?.data as
      | { url?: string }
      | undefined)?.url ?? null

  const handleCopyLink = async () => {
    if (!paymentLink) {
      toast.error(t("orders.payment.copyLinkMissing"))
      return
    }
    try {
      await navigator.clipboard.writeText(paymentLink)
      toast.success(t("orders.payment.copyLinkSuccess"))
    } catch {
      toast.error(t("orders.payment.copyLinkError"))
    }
  }

  const handleMarkAsPaid = () => {
    markAsPaid.mutate(
      { order_id: order.id },
      {
        onSuccess: () => toast.success(t("orders.payment.markAsPaidSuccess")),
        onError: (e) => toast.error(e.message),
      }
    )
  }

  return (
    <div className="bg-ui-bg-subtle flex items-center justify-end gap-x-2 rounded-b-xl px-4 py-4">
      {paymentLink && (
        <Button size="small" variant="secondary" onClick={handleCopyLink}>
          {t("orders.payment.copyPaymentLink", {
            amount: getStylizedAmount(pendingDifference, order.currency_code),
          })}
        </Button>
      )}

      <Button
        size="small"
        variant="secondary"
        onClick={handleMarkAsPaid}
        isLoading={markAsPaid.isPending}
      >
        {t("orders.payment.markAsPaid")}
      </Button>
    </div>
  )
}
