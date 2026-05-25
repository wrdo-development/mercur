import {
  createHook,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"

import { ProductVariantWorkflowEvents } from "../events"
import { deleteProductVariantsStep } from "../steps/delete-product-variants"
import { overrideWorkflow } from "../../utils/override-workflow"

export const deleteProductVariantsWorkflowId = "delete-product-variants"

type DeleteProductVariantsWorkflowInput = {
  ids: string[]
}

export const deleteProductVariantsWorkflow = overrideWorkflow(
  deleteProductVariantsWorkflowId,
  function (input: DeleteProductVariantsWorkflowInput) {
    const deleted = deleteProductVariantsStep(input.ids)

    const productVariantsDeleted = createHook("productVariantsDeleted", {
      ids: input.ids,
    })

    const eventData = transform({ input }, ({ input }) =>
      input.ids.map((id) => ({ id }))
    )

    emitEventStep({
      eventName: ProductVariantWorkflowEvents.DELETED,
      data: eventData,
    })

    return new WorkflowResponse(deleted, {
      hooks: [productVariantsDeleted],
    })
  }
)
