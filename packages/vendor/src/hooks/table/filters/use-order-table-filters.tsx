import { useTranslation } from "react-i18next";

import type { Filter } from "../../../components/table/data-table";
import { useRegions } from "../../api/regions";
import { useSalesChannels } from "../../api/sales-channels";
import { useMemo } from "react";

/**
 * @Deprecated This should only be used for the deprecated DataTable component
 */
export const useOrderTableFilters = (): Filter[] => {
  const { t } = useTranslation();

  const { regions } = useRegions({
    limit: 1000,
    fields: "id,name",
  });

  const { sales_channels } = useSalesChannels({
    limit: 1000,
    fields: "id,name",
  });

  return useMemo(() => {
    let filters: Filter[] = [];

    if (regions) {
      const regionFilter: Filter = {
        key: "region_id",
        label: t("fields.region"),
        type: "select",
        options: regions.map((r) => ({
          label: r.name,
          value: r.id,
        })),
        multiple: true,
        searchable: true,
      };

      filters.push(regionFilter);
    }

    if (sales_channels) {
      const salesChannelFilter: Filter = {
        key: "sales_channel_id",
        label: t("fields.salesChannel"),
        type: "select",
        multiple: true,
        searchable: true,
        options: sales_channels.map((s) => ({
          label: s.name,
          value: s.id,
        })),
      };

      filters.push(salesChannelFilter);
    }

    

    

    const requestFilter: Filter = {
      key: "has_open_request",
      label: t("orders.filters.request"),
      type: "select",
      options: [
        { label: t("orders.filters.hasOpenRequest"), value: "true" },
        { label: t("orders.filters.noOpenRequest"), value: "false" },
      ],
    };

    filters.push(requestFilter);

    const dateFilters: Filter[] = [
      { label: t("fields.createdAt"), key: "created_at" },
      { label: t("fields.updatedAt"), key: "updated_at" },
    ].map((f) => ({
      key: f.key,
      label: f.label,
      type: "date",
    }));

    filters.push(...dateFilters);

    // Payment / fulfillment status filters were prototyped but
    // reverted — see docs/specs/SPEC-008-vendor-orders-figma-gap.md
    // ("Filter gap — partial revert"). Re-enable here once the
    // backend aggregation approach is settled.

    return filters;
  }, [regions, sales_channels, t]);
};
