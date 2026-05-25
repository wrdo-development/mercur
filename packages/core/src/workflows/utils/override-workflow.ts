import { WorkflowManager } from "@medusajs/framework/orchestration"
import { createWorkflow } from "@medusajs/framework/workflows-sdk"

/**
 * Drop-in replacement for `createWorkflow` that unregisters any existing
 * workflow with the same id before registering. Use when Mercur ships a
 * same-name replacement for a Medusa core-flow (e.g. `create-products`),
 * so `WorkflowManager.register` does not throw on the duplicate id.
 * No-op safety net for ids that don't yet collide.
 *
 * Note: the "override" is at workflow-registration time, not at runtime.
 * This helper is unrelated to retry idempotency.
 */
export const overrideWorkflow: typeof createWorkflow = ((
  nameOrConfig: Parameters<typeof createWorkflow>[0],
  composer: Parameters<typeof createWorkflow>[1]
) => {
  const id =
    typeof nameOrConfig === "string" ? nameOrConfig : nameOrConfig.name
  WorkflowManager.unregister(id)
  return createWorkflow(nameOrConfig as never, composer as never)
}) as typeof createWorkflow
