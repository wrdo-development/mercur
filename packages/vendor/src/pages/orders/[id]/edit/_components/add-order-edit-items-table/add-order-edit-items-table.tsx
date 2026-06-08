import { OnChangeFn, RowSelectionState } from "@tanstack/react-table"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { _DataTable } from "@components/table/data-table"
import { useVariants } from "@hooks/api/product-variants"
import { useDataTable } from "@hooks/use-data-table"

import { useOrderEditItemsTableColumns } from "./use-order-edit-item-table-columns"
import { useOrderEditItemTableFilters } from "./use-order-edit-item-table-filters"
import { useOrderEditItemTableQuery } from "./use-order-edit-item-table-query"

const PAGE_SIZE = 50
const PREFIX = "rit"

type AddOrderEditItemsTableProps = {
  onSelectionChange: (ids: string[]) => void
}

export const AddOrderEditItemsTable = ({
  onSelectionChange,
}: AddOrderEditItemsTableProps) => {
  const { t } = useTranslation()

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const updater: OnChangeFn<RowSelectionState> = (fn) => {
    const newState: RowSelectionState =
      typeof fn === "function" ? fn(rowSelection) : fn

    setRowSelection(newState)
    onSelectionChange(Object.keys(newState))
  }

  const { searchParams, raw } = useOrderEditItemTableQuery({
    pageSize: PAGE_SIZE,
    prefix: PREFIX,
  })

  const variantsResponse = useVariants({
    ...searchParams,
    fields: "*inventory_items.inventory.location_levels,+inventory_quantity",
  } as any)
  const variants = (variantsResponse as any).variants ?? []
  const count = (variantsResponse as any).count ?? 0

  const columns = useOrderEditItemsTableColumns()
  const filters = useOrderEditItemTableFilters()

  const { table } = useDataTable({
    data: variants,
    columns,
    count,
    enablePagination: true,
    getRowId: (row) => row.id,
    pageSize: PAGE_SIZE,
    enableRowSelection: () => true,
    rowSelection: {
      state: rowSelection,
      updater,
    },
  })

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <_DataTable
        table={table}
        columns={columns}
        pageSize={PAGE_SIZE}
        count={count}
        filters={filters}
        pagination
        layout="fill"
        search
        orderBy={[
          { key: "product_id", label: t("fields.product") },
          { key: "title", label: t("fields.title") },
          { key: "sku", label: t("fields.sku") },
        ]}
        prefix={PREFIX}
        queryObject={raw}
      />
    </div>
  )
}
