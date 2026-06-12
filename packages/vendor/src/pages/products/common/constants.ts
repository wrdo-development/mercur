export const PRODUCT_VARIANT_IDS_KEY = "product_variant_ids"

export const PRODUCT_DETAIL_FIELDS = [
  "*variants.images",
  "+variants.title",
  "+variants.sku",
  "*categories",
  "+additional_data",
  "*scoped_attributes",
  "+attribute_values.*",
  "+attribute_values.attribute.*",
].join(",")

export const PRODUCT_DETAIL_QUERY = { fields: PRODUCT_DETAIL_FIELDS } as const

