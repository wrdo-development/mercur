import { model } from "@medusajs/framework/utils"

// seller_count and total were declared as .computed() model fields, but they
// are ALSO computed in OrderGroupRepository.findAndCount() via raw SQL (the
// COUNT(DISTINCT ...) / SUM(...) at ~L168) and returned on the result object
// directly. The redundant .computed() model fields crash boot under the pinned
// Medusa 2.13.4 DML with "Cannot read properties of undefined (reading
// 'collection')" during MikroORM model init. Drop them from the schema — the
// repository still returns both values. (wrdo fork patch)
const OrderGroup = model.define("order_group", {
  id: model.id({ prefix: 'og' }).primaryKey(),
  display_id: model.autoincrement(),
  customer_id: model.text().nullable(),
  cart_id: model.text(),
})

export default OrderGroup
