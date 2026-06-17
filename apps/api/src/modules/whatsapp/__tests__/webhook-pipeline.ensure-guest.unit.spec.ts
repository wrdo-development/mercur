/**
 * Unit tests for the guest-first wiring in WebhookPipelineService (WRDO-180).
 *
 * Goal: on a processed inbound message the pipeline calls the injected
 * ensureGuestUser hook with the sender's phone exactly once, and a throw from
 * that hook is swallowed — it must NEVER block the WhatsApp reply.
 *
 * The killswitch is forced OFF so the pipeline short-circuits to the Tier-0
 * fallback right after ensureGuest, keeping the test independent of the AI /
 * booking / registration deps (which are stubbed but never invoked here).
 */

import { WebhookPipelineService } from '../webhook-pipeline.service';
import type { WebhookPipelineServiceOptions } from '../webhook-pipeline.types';
import { WebhookHandlerService } from '../webhook-handler.service';

const PHONE = '27820000099';
const MESSAGE_ID = 'wamid.TEST123';

/** Minimal valid Meta webhook payload carrying one text message from PHONE. */
function payload() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: 'pnid', display_phone_number: '27110000000' },
              contacts: [{ wa_id: PHONE, profile: { name: 'Tester' } }],
              messages: [{ id: MESSAGE_ID, from: PHONE, type: 'text', text: { body: 'hi' } }],
            },
          },
        ],
      },
    ],
  };
}

function buildPipeline(
  ensureGuestUser?: (phone: string) => Promise<void>,
): { service: WebhookPipelineService; sent: { to: string; text: string }[] } {
  const sent: { to: string; text: string }[] = [];
  const opts = {
    handlerService: new WebhookHandlerService(),
    idempotencyService: { isNew: async () => true },
    // Killswitch OFF -> Tier-0 fallback path -> early return after ensureGuest.
    killswitchService: { isAiEnabled: () => false },
    degradationService: { getTier0DefaultMessage: () => 'Tier0 reply' },
    messageSenderService: {
      sendText: async (to: string, text: string) => {
        sent.push({ to, text });
        return { success: true };
      },
    },
    // Required by the type but never invoked on the killswitch-off path.
    aiClient: {} as never,
    bookingFlowHandler: {} as never,
    registrationFlowHandler: {} as never,
    conversationStateService: {} as never,
    ensureGuestUser,
  } as unknown as WebhookPipelineServiceOptions;

  return { service: new WebhookPipelineService(opts), sent };
}

describe('WebhookPipelineService — guest-first ensureGuest wiring (WRDO-180)', () => {
  it('calls ensureGuestUser once with the sender phone on a processed message', async () => {
    const ensureGuestUser = jest.fn(async () => {});
    const { service } = buildPipeline(ensureGuestUser);

    await service.handlePayload(payload());

    expect(ensureGuestUser).toHaveBeenCalledTimes(1);
    expect(ensureGuestUser).toHaveBeenCalledWith(PHONE);
  });

  it('swallows a throw from ensureGuestUser — the reply is still sent', async () => {
    const ensureGuestUser = jest.fn(async () => {
      throw new Error('DB down');
    });
    const { service, sent } = buildPipeline(ensureGuestUser);

    // Must not throw out of the pipeline.
    await expect(service.handlePayload(payload())).resolves.toBeUndefined();

    expect(ensureGuestUser).toHaveBeenCalledTimes(1);
    // The friend still gets a reply despite the guest-write failure.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(PHONE);
  });

  it('is a clean no-op when ensureGuestUser is not injected', async () => {
    const { service, sent } = buildPipeline(undefined);

    await expect(service.handlePayload(payload())).resolves.toBeUndefined();

    // Pipeline still runs to the Tier-0 reply.
    expect(sent).toHaveLength(1);
  });
});
