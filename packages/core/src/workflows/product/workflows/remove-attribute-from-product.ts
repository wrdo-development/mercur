import {
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"

import { ProductAttributeWorkflowEvents } from "../events"
import { removeAttributeFromProductStep } from "../steps/remove-attribute-from-product"
import { overrideWorkflow } from "../../utils/override-workflow"

export const removeAttributeFromProductWorkflowId =
  "remove-attribute-from-product"

type RemoveAttributeFromProductWorkflowInput = {
  product_id: string
  attribute_id: string
}

export const removeAttributeFromProductWorkflow = overrideWorkflow(
  removeAttributeFromProductWorkflowId,
  function (input: RemoveAttributeFromProductWorkflowInput) {
    removeAttributeFromProductStep(input)

    emitEventStep({
      eventName: ProductAttributeWorkflowEvents.DELETED,
      data: transform({ input }, ({ input }) => [
        { id: input.attribute_id },
      ]),
    })

    return new WorkflowResponse(void 0)
  }
)
