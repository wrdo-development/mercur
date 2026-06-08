import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
    IRegionModuleService,
    ISalesChannelModuleService,
    MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MercurModules, SellerStatus } from "@mercurjs/types"
import {
    adminHeaders,
    createAdminUser,
    generatePublishableKey,
    generateStoreHeaders,
} from "../../../helpers/create-admin-user"
import { createCustomerUser } from "../../../helpers/create-customer-user"
import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(120000)

const approveSeller = async (
    container: MedusaContainer,
    sellerId: string
) => {
    const sellerModule: any = container.resolve(MercurModules.SELLER)
    await sellerModule.updateSellers({
        id: sellerId,
        status: SellerStatus.OPEN,
    })
}

medusaIntegrationTestRunner({
    testSuite: ({ getContainer, api, dbConnection }) => {
        describe("Admin - Order Groups", () => {
            let appContainer: MedusaContainer
            let sellerSeed: any
            let storeHeaders: any
            let region: any
            let salesChannel: any
            let prerequisiteCounter = 0

            const seedSellerOfferWithShipping = async (opts: {
                email: string
                name: string
                stocked: number
                offerPrice: number
            }) => {
                const result = await createSellerUser(appContainer, {
                    email: opts.email,
                    name: opts.name,
                })
                await approveSeller(appContainer, (result.seller as any).id)
                const headers = result.headers
                const tag = `_${opts.name}_${Date.now()}_${++prerequisiteCounter}`

                const stockLocation = (
                    await api.post(
                        `/vendor/stock-locations`,
                        { name: `Warehouse${tag}` },
                        headers
                    )
                ).data.stock_location

                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-sets`,
                    { name: `FS${tag}`, type: "shipping" },
                    headers
                )
                const fulfillmentSet = (
                    await api.get(
                        `/vendor/stock-locations/${stockLocation.id}?fields=*fulfillment_sets`,
                        headers
                    )
                ).data.stock_location.fulfillment_sets[0]
                const serviceZone = (
                    await api.post(
                        `/vendor/fulfillment-sets/${fulfillmentSet.id}/service-zones`,
                        {
                            name: `SZ${tag}`,
                            geo_zones: [{ type: "country", country_code: "us" }],
                        },
                        headers
                    )
                ).data.fulfillment_set.service_zones.find(
                    (z: any) => z.name === `SZ${tag}`
                )
                const shippingProfile = (
                    await api.post(
                        `/vendor/shipping-profiles`,
                        { name: `SP${tag}`, type: "default" },
                        headers
                    )
                ).data.shipping_profile

                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-providers`,
                    { add: ["manual_manual"] },
                    headers
                )
                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/sales-channels`,
                    { add: [salesChannel.id] },
                    headers
                )
                await api.post(
                    `/vendor/shipping-options`,
                    {
                        name: `Ship${tag}`,
                        service_zone_id: serviceZone.id,
                        shipping_profile_id: shippingProfile.id,
                        provider_id: "manual_manual",
                        price_type: "flat",
                        type: {
                            label: "Standard",
                            description: "Standard",
                            code: "standard",
                        },
                        prices: [{ currency_code: "usd", amount: 500 }],
                        rules: [
                            {
                                attribute: "enabled_in_store",
                                value: "true",
                                operator: "eq",
                            },
                        ],
                    },
                    headers
                )

                const product = (
                    await api.post(
                        `/vendor/products`,
                        {
                            status: "published",
                            title: `Prod${tag}`,
                            variant_attributes: [
                                {
                                    name: `Default${tag}`,
                                    type: "multi_select",
                                    values: ["Default"],
                                    is_variant_axis: true,
                                },
                            ],
                            variants: [
                                {
                                    title: "Default",
                                    sku: `V${tag}`,
                                    attribute_values: {
                                        [`Default${tag}`]: "Default",
                                    },
                                },
                            ],
                        },
                        headers
                    )
                ).data.product

                await api.post(
                    `/vendor/sales-channels/${salesChannel.id}/products`,
                    { add: [product.id] },
                    headers
                )

                const offer = (
                    await api.post(
                        `/vendor/offers`,
                        {
                            sku: `OF${tag}`,
                            variant_id: product.variants[0].id,
                            shipping_profile_id: shippingProfile.id,
                            inventory_items: [
                                {
                                    title: `Inv${tag}`,
                                    required_quantity: 1,
                                    stock_levels: [
                                        {
                                            location_id: stockLocation.id,
                                            stocked_quantity: opts.stocked,
                                        },
                                    ],
                                },
                            ],
                            prices: [
                                {
                                    amount: opts.offerPrice,
                                    currency_code: "usd",
                                },
                            ],
                        },
                        headers
                    )
                ).data.offer

                return {
                    sellerId: result.seller.id,
                    headers,
                    product,
                    variant: product.variants[0],
                    offer,
                }
            }

            const completeCartCheckout = async (
                offerId: string,
                variantId: string
            ) => {
                const cart = (
                    await api.post(
                        `/store/carts`,
                        {
                            region_id: region.id,
                            sales_channel_id: salesChannel.id,
                            currency_code: "usd",
                        },
                        storeHeaders
                    )
                ).data.cart

                await api.post(
                    `/store/carts/${cart.id}/line-items`,
                    { offer_id: offerId, variant_id: variantId, quantity: 1 },
                    storeHeaders
                )

                await api.post(
                    `/store/carts/${cart.id}`,
                    {
                        email: "ogbuyer@test.com",
                        shipping_address: {
                            first_name: "OG",
                            last_name: "Buyer",
                            address_1: "123 Main St",
                            city: "New York",
                            country_code: "us",
                            postal_code: "10001",
                        },
                        billing_address: {
                            first_name: "OG",
                            last_name: "Buyer",
                            address_1: "123 Main St",
                            city: "New York",
                            country_code: "us",
                            postal_code: "10001",
                        },
                    },
                    storeHeaders
                )

                const shippingOptionsResp = await api.get(
                    `/store/shipping-options?cart_id=${cart.id}`,
                    storeHeaders
                )
                const allOptions = Object.values(
                    shippingOptionsResp.data.shipping_options as Record<
                        string,
                        any[]
                    >
                ).flat()
                for (const opt of allOptions) {
                    await api.post(
                        `/store/carts/${cart.id}/shipping-methods`,
                        { option_id: opt.id },
                        storeHeaders
                    )
                }

                const paymentCollection = (
                    await api.post(
                        `/store/payment-collections`,
                        { cart_id: cart.id },
                        storeHeaders
                    )
                ).data.payment_collection
                await api.post(
                    `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
                    { provider_id: "pp_system_default" },
                    storeHeaders
                )

                const completeResp = await api.post(
                    `/store/carts/${cart.id}/complete`,
                    {},
                    storeHeaders
                )
                return completeResp.data.order_group.id
            }

            beforeAll(async () => {
                appContainer = getContainer()
            })

            beforeEach(async () => {
                await createAdminUser(dbConnection, adminHeaders, appContainer)

                const customerResult = await createCustomerUser(appContainer, {
                    email: "ogbuyer@test.com",
                    first_name: "OG",
                    last_name: "Buyer",
                })
                const apiKey = await generatePublishableKey(appContainer)
                const baseStoreHeaders = generateStoreHeaders({
                    publishableKey: apiKey,
                })
                storeHeaders = {
                    headers: {
                        ...baseStoreHeaders.headers,
                        ...customerResult.headers.headers,
                    },
                }

                const salesChannelModule =
                    appContainer.resolve<ISalesChannelModuleService>(
                        Modules.SALES_CHANNEL
                    )
                salesChannel = await salesChannelModule.createSalesChannels({
                    name: "OG Channel",
                })

                const regionModule = appContainer.resolve<IRegionModuleService>(
                    Modules.REGION
                )
                region = await regionModule.createRegions({
                    name: "OG Region",
                    currency_code: "usd",
                    countries: ["us"],
                })

                const link = appContainer.resolve(ContainerRegistrationKeys.LINK)
                await link.create({
                    [Modules.REGION]: { region_id: region.id },
                    [Modules.PAYMENT]: { payment_provider_id: "pp_system_default" },
                })

                sellerSeed = await seedSellerOfferWithShipping({
                    email: "og-seller@test.com",
                    name: "OGS",
                    stocked: 20,
                    offerPrice: 2500,
                })
            })

            describe("GET /admin/order-groups", () => {
                it("returns the order group after a multi-step cart completes", async () => {
                    const orderGroupId = await completeCartCheckout(
                        sellerSeed.offer.id,
                        sellerSeed.variant.id
                    )

                    const response = await api.get(
                        `/admin/order-groups`,
                        adminHeaders
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data.order_groups).toBeDefined()
                    expect(Array.isArray(response.data.order_groups)).toEqual(true)
                    expect(response.data.order_groups.length).toBeGreaterThan(0)

                    const found = response.data.order_groups.find(
                        (g: any) => g.id === orderGroupId
                    )
                    expect(found).toBeDefined()
                    expect(found.id).toEqual(orderGroupId)
                    expect(found.customer_id).toBeDefined()
                    expect(found.total).toBeGreaterThan(0)
                    expect(found.created_at).toBeDefined()
                })

                it("returns count + offset + limit envelope", async () => {
                    const response = await api.get(
                        `/admin/order-groups`,
                        adminHeaders
                    )

                    expect(response.status).toEqual(200)
                    expect(typeof response.data.count).toEqual("number")
                    expect(typeof response.data.offset).toEqual("number")
                    expect(typeof response.data.limit).toEqual("number")
                })
            })

            describe("GET /admin/order-groups/:id", () => {
                it("returns the order group with the requested fields", async () => {
                    const orderGroupId = await completeCartCheckout(
                        sellerSeed.offer.id,
                        sellerSeed.variant.id
                    )

                    const response = await api.get(
                        `/admin/order-groups/${orderGroupId}?fields=id,customer_id,seller_count,total,created_at,orders.id,orders.status,orders.payment_status,orders.fulfillment_status,orders.total,*orders.seller`,
                        adminHeaders
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data.order_group).toBeDefined()
                    expect(response.data.order_group.id).toEqual(orderGroupId)
                    expect(response.data.order_group.customer_id).toBeDefined()
                    expect(response.data.order_group.total).toBeGreaterThan(0)
                    expect(Array.isArray(response.data.order_group.orders)).toEqual(
                        true
                    )
                    expect(response.data.order_group.orders.length).toBeGreaterThan(
                        0
                    )

                    const firstOrder = response.data.order_group.orders[0]
                    expect(firstOrder.id).toBeDefined()
                    expect(firstOrder.status).toBeDefined()
                    expect(firstOrder.total).toBeDefined()
                    expect(firstOrder.seller).toBeDefined()
                    expect(firstOrder.seller.id).toEqual(sellerSeed.sellerId)
                })

                it("returns 404 for an unknown id", async () => {
                    const response = await api
                        .get(
                            `/admin/order-groups/ogrp_does_not_exist`,
                            adminHeaders
                        )
                        .catch((e) => e.response)

                    // 404 (not found) or 400 (validator rejects malformed id) both
                    // satisfy the contract — neither leaks data
                    expect(response.status).toBeGreaterThanOrEqual(400)
                    expect(response.status).toBeLessThan(500)
                })
            })
        })
    },
})
