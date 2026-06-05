import { HttpTypes } from "@medusajs/types";
import { useQueryParams } from "../../use-query-params";

type UseOrderTableQueryProps = {
  prefix?: string;
  pageSize?: number;
};

export const useOrderTableQuery = ({
  prefix,
  pageSize = 20,
}: UseOrderTableQueryProps) => {
  const queryObject = useQueryParams(
    [
      "offset",
      "q",
      "created_at",
      "updated_at",
      "region_id",
      "sales_channel_id",
      "payment_status",
      "fulfillment_status",
      "has_open_request",
      "order",
    ],
    prefix,
  );

  const {
    offset,
    sales_channel_id,
    created_at,
    updated_at,
    fulfillment_status,
    payment_status,
    has_open_request,
    region_id,
    q,
    order,
  } = queryObject;

  const searchParams: HttpTypes.AdminOrderFilters & {
    has_open_request?: boolean;
  } = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    sales_channel_id: sales_channel_id?.split(","),
    fulfillment_status: fulfillment_status?.split(","),
    payment_status: payment_status?.split(","),
    has_open_request: has_open_request
      ? has_open_request === "true"
      : undefined,
    created_at: created_at ? JSON.parse(created_at) : undefined,
    updated_at: updated_at ? JSON.parse(updated_at) : undefined,
    region_id: region_id?.split(","),
    order: order ? order : "-created_at",
    q,
  };

  return {
    searchParams,
    raw: queryObject,
  };
};
