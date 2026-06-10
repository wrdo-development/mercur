import { OrderEditWorkflowEvents } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { refreshOrderCommissionLinesWorkflow } from "../workflows/commission/workflows/refresh-order-commission-lines"

export default async function orderEditConfirmedHandler({
  event,
  container,
}: SubscriberArgs<{ order_id: string }>) {
  const orderId = event.data.order_id

  if (!orderId) {
    return
  }

  await refreshOrderCommissionLinesWorkflow(container).run({
    input: { order_ids: [orderId] },
  })
}

export const config: SubscriberConfig = {
  event: OrderEditWorkflowEvents.CONFIRMED,
  context: {
    subscriberId: "order-edit-confirmed-handler",
  },
}
