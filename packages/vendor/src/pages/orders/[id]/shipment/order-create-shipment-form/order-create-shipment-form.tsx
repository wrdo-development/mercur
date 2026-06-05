import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Button, Heading, Input, toast } from "@medusajs/ui"
import { useFieldArray, useForm } from "react-hook-form"

import { Form } from "@components/common/form"
import {
  RouteFocusModal,
  useRouteModal,
} from "@components/modals"
import { KeyboundForm } from "@components/utilities/keybound-form"
import { useCreateOrderShipment } from "@hooks/api"
import {
  ExtendedAdminOrder,
  ExtendedAdminOrderFulfillment,
} from "@custom-types/order"
import { CreateShipmentSchema } from "./constants"

type OrderCreateFulfillmentFormProps = {
  order: ExtendedAdminOrder
  fulfillment: ExtendedAdminOrderFulfillment
}

export function OrderCreateShipmentForm({
  order,
  fulfillment,
}: OrderCreateFulfillmentFormProps) {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  const { mutateAsync: createShipment, isPending: isMutating } =
    useCreateOrderShipment(order.id, fulfillment?.id)

  const form = useForm<zod.infer<typeof CreateShipmentSchema>>({
    defaultValues: {},
    resolver: zodResolver(CreateShipmentSchema),
  })

  const { fields: labels, append } = useFieldArray({
    name: "labels",
    control: form.control,
  })

  const handleSubmit = form.handleSubmit(async (data) => {
    await createShipment(
      {
        items:
          fulfillment?.items
            ?.map((i) => ({ id: i?.line_item_id, quantity: i.quantity }))
            .filter((item) => !!item.id) ?? [],
        labels: data.labels
          .filter((l) => !!l.tracking_number)
          .map((l) => ({
            tracking_number: l.tracking_number,
            // Backend validator treats these as non-optional; pass
            // empty strings rather than the literal "#" placeholder
            // when the user didn't supply a URL.
            tracking_url: l.tracking_url ?? "",
            label_url: l.label_url ?? "",
          })),
      },
      {
        onSuccess: () => {
          toast.success(t("orders.shipment.toastCreated"))
          handleSuccess(`/orders/${order.id}`)
        },
        onError: (e) => {
          toast.error(e.message)
        },
      }
    )
  })

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex h-full flex-col overflow-hidden"
      >
        <RouteFocusModal.Header>
          <div className="flex items-center justify-end gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isMutating}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteFocusModal.Header>
        <RouteFocusModal.Body className="flex h-full w-full flex-col items-center divide-y overflow-y-auto">
          <div className="flex size-full flex-col items-center overflow-auto p-16">
            <div className="flex w-full max-w-[736px] flex-col justify-center px-2 pb-2">
              <div className="flex flex-col divide-y">
                <div className="flex flex-1 flex-col">
                  <Heading className="mb-4">
                    {t("orders.shipment.title")}
                  </Heading>

                  {labels.map((label, index) => (
                    <div
                      key={label.id}
                      className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3"
                    >
                      <Form.Field
                        control={form.control}
                        name={`labels.${index}.tracking_number`}
                        render={({ field }) => (
                          <Form.Item>
                            <Form.Label>
                              {t("orders.shipment.trackingNumber")}
                            </Form.Label>
                            <Form.Control>
                              <Input
                                {...field}
                                data-testid={`shipment-tracking-number-${index}`}
                              />
                            </Form.Control>
                            <Form.ErrorMessage />
                          </Form.Item>
                        )}
                      />
                      <Form.Field
                        control={form.control}
                        name={`labels.${index}.tracking_url`}
                        render={({ field }) => (
                          <Form.Item>
                            <Form.Label optional>
                              {t("orders.shipment.trackingUrl")}
                            </Form.Label>
                            <Form.Control>
                              <Input
                                {...field}
                                value={field.value ?? ""}
                                placeholder={t(
                                  "orders.shipment.trackingUrlPlaceholder"
                                )}
                                data-testid={`shipment-tracking-url-${index}`}
                              />
                            </Form.Control>
                            <Form.ErrorMessage />
                          </Form.Item>
                        )}
                      />
                      <Form.Field
                        control={form.control}
                        name={`labels.${index}.label_url`}
                        render={({ field }) => (
                          <Form.Item>
                            <Form.Label optional>
                              {t("orders.shipment.labelUrl")}
                            </Form.Label>
                            <Form.Control>
                              <Input
                                {...field}
                                value={field.value ?? ""}
                                data-testid={`shipment-label-url-${index}`}
                              />
                            </Form.Control>
                            <Form.ErrorMessage />
                          </Form.Item>
                        )}
                      />
                    </div>
                  ))}

                  <Button
                    type="button"
                    size="small"
                    onClick={() =>
                      append({
                        tracking_number: "",
                        tracking_url: "",
                        label_url: "",
                      })
                    }
                    className="self-end"
                    variant="secondary"
                    data-testid="shipment-add-tracking"
                  >
                    {t("orders.shipment.addTracking")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </RouteFocusModal.Body>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
