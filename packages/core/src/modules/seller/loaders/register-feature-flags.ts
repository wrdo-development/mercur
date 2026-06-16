/**
 * Workaround: Medusa's feature flag discovery scans only up to depth 2
 * from the project root, so feature flags defined inside plugins
 * (node_modules) are never discovered. This loader manually registers
 * the plugin's feature flags on the global FeatureFlag router.
 */
import { LoaderOptions } from "@medusajs/framework/types"
import { FeatureFlag, registerFeatureFlag } from "@medusajs/framework/utils"
import { configManager } from "@medusajs/framework/config"

import SellerRegistrationFeatureFlag from "../../../feature-flags/seller-registration"

export default async function registerFeatureFlagsLoader({
  container: _container,
}: LoaderOptions) {
  // configManager.config is a getter that THROWS if config hasn't been loaded
  // yet. On Medusa Cloud's boot/migration sequence this loader can run before
  // the config loader has populated configManager, crashing the Seller module
  // with "[config] Config not loaded". Guard it: if config isn't ready, fall
  // back to empty projectConfigFlags (same as the original `= {}` default) —
  // the feature flag still registers correctly. (wrdo fork patch)
  let projectConfigFlags = {}
  try {
    projectConfigFlags = configManager.config?.featureFlags ?? {}
  } catch {
    projectConfigFlags = {}
  }

  registerFeatureFlag({
    flag: SellerRegistrationFeatureFlag,
    projectConfigFlags,
    router: FeatureFlag,
  })
}
