import {
  ClientError,
  InferClientInput,
  InferClientOutput,
} from "@mercurjs/client";
import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { sdk } from "../../lib/client";
import { queryClient } from "../../lib/query-client";
import { ordersQueryKeys } from "./orders";

const invalidateOrder = (orderId: string) => {
  queryClient.invalidateQueries({ queryKey: ordersQueryKeys.details() });
  queryClient.invalidateQueries({ queryKey: ordersQueryKeys.preview(orderId) });
  queryClient.invalidateQueries({ queryKey: ordersQueryKeys.changes(orderId) });
};

export const useCreateClaim = (
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.claims.mutate>,
    ClientError,
    InferClientInput<typeof sdk.vendor.claims.mutate>
  >
) => {
  return useMutation({
    mutationFn: (payload) => sdk.vendor.claims.mutate(payload),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useCancelClaimBegin = (
  claimId: string,
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.claims.$id.request.delete>,
    ClientError
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.vendor.claims.$id.request.delete({ $id: claimId }),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useRequestClaim = (
  claimId: string,
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.claims.$id.request.mutate>,
    ClientError
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.vendor.claims.$id.request.mutate({ $id: claimId }),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useCancelClaim = (
  claimId: string,
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.claims.$id.cancel.mutate>,
    ClientError,
    Omit<InferClientInput<typeof sdk.vendor.claims.$id.cancel.mutate>, "$id">
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.vendor.claims.$id.cancel.mutate({ $id: claimId, ...payload }),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useAddClaimItems = (
  claimId: string,
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.claims.$id.claimItems.mutate>,
    ClientError,
    Omit<
      InferClientInput<typeof sdk.vendor.claims.$id.claimItems.mutate>,
      "$id"
    >
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.vendor.claims.$id.claimItems.mutate({ $id: claimId, ...payload }),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useUpdateClaimItem = (
  claimId: string,
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<
      typeof sdk.vendor.claims.$id.claimItems.$actionId.mutate
    >,
    ClientError,
    Omit<
      InferClientInput<
        typeof sdk.vendor.claims.$id.claimItems.$actionId.mutate
      >,
      "$id"
    >
  >
) => {
  return useMutation({
    mutationFn: ({ $actionId, ...payload }) =>
      sdk.vendor.claims.$id.claimItems.$actionId.mutate({
        $id: claimId,
        $actionId,
        ...payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useRemoveClaimItem = (
  claimId: string,
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<
      typeof sdk.vendor.claims.$id.claimItems.$actionId.delete
    >,
    ClientError,
    string
  >
) => {
  return useMutation({
    mutationFn: (actionId: string) =>
      sdk.vendor.claims.$id.claimItems.$actionId.delete({
        $id: claimId,
        $actionId: actionId,
      }),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useAddClaimInboundItems = (
  claimId: string,
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.claims.$id.inbound.items.mutate>,
    ClientError,
    Omit<
      InferClientInput<typeof sdk.vendor.claims.$id.inbound.items.mutate>,
      "$id"
    >
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.vendor.claims.$id.inbound.items.mutate({
        $id: claimId,
        ...payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useAddClaimOutboundItems = (
  claimId: string,
  orderId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.claims.$id.outbound.items.mutate>,
    ClientError,
    Omit<
      InferClientInput<typeof sdk.vendor.claims.$id.outbound.items.mutate>,
      "$id"
    >
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.vendor.claims.$id.outbound.items.mutate({
        $id: claimId,
        ...payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidateOrder(orderId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};
