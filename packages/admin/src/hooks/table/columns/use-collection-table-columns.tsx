import { HttpTypes } from "@medusajs/types"
import { ColumnDef, createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { TextCell } from "../../../components/table/table-cells/common/text-cell"

const columnHelper = createColumnHelper<HttpTypes.AdminCollection>()

// Explicit return type: under pnpm's symlinked node_modules, the inferred
// type references a non-portable @medusajs/types internal path (TS2742).
// Annotating with the named ColumnDef type keeps DTS generation portable.
// (wrdo fork patch)
export const useCollectionTableColumns = (): ColumnDef<
  HttpTypes.AdminCollection
>[] => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("title", {
        header: t("fields.title"),
        cell: ({ getValue }) => <TextCell text={getValue()} />,
      }),
      columnHelper.accessor("handle", {
        header: t("fields.handle"),
        cell: ({ getValue }) => <TextCell text={`/${getValue()}`} />,
      }),
      columnHelper.accessor("products", {
        header: t("fields.products"),
        cell: ({ getValue }) => {
          const count = getValue()?.length || undefined

          return <TextCell text={count} />
        },
      }),
    ],
    [t]
  )
}
