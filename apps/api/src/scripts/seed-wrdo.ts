/**
 * WRDO seed — South Africa / ZAR store configuration.
 *
 * Replaces Mercur's EU/EUR demo seed (seed.ts) for the WRDO marketplace.
 * Idempotent + self-guarding: checks for the SA region first and skips the
 * whole seed if it already exists, so it is safe to run on every deploy via
 * the predeploy hook. (wrdo fork addition.)
 *
 * Sets up: ZAR store currency, South Africa region, default sales channel,
 * publishable API key (linked to the sales channel), minimal SA stock
 * location + manual fulfillment (Medusa requires a fulfillment set for orders
 * even though home services don't physically ship), Mercur seller defaults,
 * and two placeholder products so the storefront has something to render
 * while wiring. Delete the demo products once real provider listings exist.
 */
import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { ApiKey } from "../../.medusa/types/query-entry-points"
import { createSellerDefaultsWorkflow } from "@mercurjs/core/workflows"

export default async function seedWrdo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const storeModuleService = container.resolve(Modules.STORE)
  const regionModuleService = container.resolve(Modules.REGION)

  // --- SELF-GUARD: skip the whole seed if the SA region already exists. ---
  const existingRegions = await regionModuleService.listRegions(
    {},
    { relations: ["countries"] }
  )
  const saExists = existingRegions.some((r) =>
    (r.countries || []).some((c) => c.iso_2 === "za")
  )
  if (saExists) {
    logger.info("[wrdo-seed] South Africa region already exists — skipping seed.")
    return
  }

  logger.info("[wrdo-seed] Seeding WRDO South Africa store...")
  const countries = ["za"]

  const [store] = await storeModuleService.listStores()

  // Sales channel
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "WRDO Marketplace",
  })
  if (!defaultSalesChannel.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "WRDO Marketplace" }] },
    })
    defaultSalesChannel = result
  }

  // Store currency = ZAR
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [{ currency_code: "zar", is_default: true }],
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  })

  // South Africa region
  logger.info("[wrdo-seed] Seeding region (South Africa / ZAR)...")
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "South Africa",
          currency_code: "zar",
          countries,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  })
  const region = regionResult[0]

  // Tax region
  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: "za", provider_id: "tp_system" }],
  })

  // Minimal SA stock location + manual fulfillment
  logger.info("[wrdo-seed] Seeding SA stock location + fulfillment...")
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "WRDO South Africa",
          address: { city: "Paarl", country_code: "ZA", address_1: "" },
        },
      ],
    },
  })
  const stockLocation = stockLocationResult[0]

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { default_location_id: stockLocation.id },
    },
  })

  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes("already exists"))) {
      throw error
    }
  }

  const { result: shippingProfileResult } =
    await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    })
  const shippingProfile = shippingProfileResult[0]

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "WRDO South Africa delivery",
    type: "shipping",
    service_zones: [
      {
        name: "South Africa",
        geo_zones: [{ country_code: "za", type: "country" }],
      },
    ],
  })

  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    })
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes("already exists"))) {
      throw error
    }
  }

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: { label: "Standard", description: "Standard", code: "standard" },
        prices: [
          { currency_code: "zar", amount: 0 },
          { region_id: region.id, amount: 0 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  })

  try {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: stockLocation.id, add: [defaultSalesChannel[0].id] },
    })
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes("already"))) {
      throw error
    }
  }

  // Publishable API key (linked to the sales channel) — what the storefront uses
  logger.info("[wrdo-seed] Seeding publishable API key...")
  let publishableApiKey: ApiKey | null = null
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["id"],
    filters: { type: "publishable" },
  })
  publishableApiKey = data?.[0]

  if (!publishableApiKey) {
    const {
      result: [created],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          { title: "WRDO Storefront", type: "publishable", created_by: "" },
        ],
      },
    })
    publishableApiKey = created as ApiKey
  }

  try {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableApiKey.id,
        add: [defaultSalesChannel[0].id],
      },
    })
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes("already"))) {
      throw error
    }
  }
  logger.info(
    `[wrdo-seed] Publishable API key id: ${publishableApiKey.id} (fetch the token via admin/API or mcloud).`
  )

  // Two placeholder products (ZAR) so the storefront renders something.
  // DELETE once real provider listings exist.
  logger.info("[wrdo-seed] Seeding 2 placeholder products...")
  const { result: categories } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: { product_categories: [{ name: "Demo", is_active: true }] },
  })

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "WRDO Demo Item A",
          category_ids: [categories[0].id],
          description: "Placeholder product — delete once real listings exist.",
          handle: "wrdo-demo-a",
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          options: [{ title: "Variant", values: ["Default"] }],
          variants: [
            {
              title: "Default",
              sku: "WRDO-DEMO-A",
              options: { Variant: "Default" },
              prices: [{ amount: 100, currency_code: "zar" }],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        {
          title: "WRDO Demo Item B",
          category_ids: [categories[0].id],
          description: "Placeholder product — delete once real listings exist.",
          handle: "wrdo-demo-b",
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          options: [{ title: "Variant", values: ["Default"] }],
          variants: [
            {
              title: "Default",
              sku: "WRDO-DEMO-B",
              options: { Variant: "Default" },
              prices: [{ amount: 250, currency_code: "zar" }],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
      ],
    },
  })

  // Stock levels for the demo variants
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  })
  const inventoryModule = container.resolve(Modules.INVENTORY)
  const existingLevels = await inventoryModule.listInventoryLevels({
    location_id: stockLocation.id,
  })
  const existingItemIds = new Set(existingLevels.map((l) => l.inventory_item_id))
  const inventoryLevels: CreateInventoryLevelInput[] = []
  for (const item of inventoryItems) {
    if (!existingItemIds.has(item.id)) {
      inventoryLevels.push({
        location_id: stockLocation.id,
        stocked_quantity: 1000000,
        inventory_item_id: item.id,
      })
    }
  }
  if (inventoryLevels.length > 0) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: inventoryLevels },
    })
  }

  // Mercur seller defaults (commission, etc.)
  await createSellerDefaultsWorkflow(container).run({})

  logger.info("[wrdo-seed] ✅ WRDO South Africa store seeded.")
}
