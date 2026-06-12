import { describe, expect, test } from "vitest"

import { PRODUCT_DETAIL_FIELDS } from "./constants"

/**
 * Regression guard for the product detail General section going blank.
 *
 * Medusa's FieldParser switches into "replace defaults" mode the moment a
 * single requested field is not modifier-prefixed. That drops the product's
 * built-in top-level fields (title, status, description, handle, ...), which
 * left the vendor General section with an empty title and a broken status
 * badge. Keep every appended field prefixed so the defaults are preserved.
 */
describe("PRODUCT_DETAIL_FIELDS", () => {
  const fields = PRODUCT_DETAIL_FIELDS.split(",").filter(Boolean)

  test("every field is modifier-prefixed so Medusa keeps its defaults", () => {
    const isModifierPrefixed = (field: string) =>
      field.startsWith("+") ||
      field.startsWith("-") ||
      field.startsWith("*") ||
      field.endsWith(".*")

    const plainFields = fields.filter((field) => !isModifierPrefixed(field))

    expect(plainFields).toEqual([])
  })

  test("requests variant identity used by the active edit-request block", () => {
    expect(fields).toContain("+variants.title")
    expect(fields).toContain("+variants.sku")
  })
})
