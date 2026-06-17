/**
 * Unit tests for spine persistence in WebhookPipelineService (WRDO-180, Task 9).
 *
 * Goal: a processed inbound message persists the user's turn once (channel
 * 'whatsapp') and the WRDO reply once for the primary reply path. ALL persistence
 * is best-effort: a throwing spinePersistence must NEVER throw out of the pipeline
 * or block the WhatsApp reply, and an unresolvable userId skips silently.
 *
 * The killswitch is forced ON so the message flows through the classifyAndRoute
 * primary reply path (the AI / booking / registration deps are stubbed).
 */

import { WebhookPipelineService } from '../webhook-pipeline.service';
import type { WebhookPipelineServiceOptions } from '../webhook-pipeline.types';
import { WebhookHandlerService } from '../webhook-handler.service';

const PHONE = '27820000099';
const MESSAGE_ID = 'wamid.SPINE123';
const USER_ID = 'usr_spine_1';

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
              messages: [{ id: MESSAGE_ID, from: PHONE, type: 'text', text: { body: 'hi there' } }],
            },
          },
        ],
      },
    ],
  };
}

interface SpineCalls {
  resolve: string[];
  user: { userId: string; text: string; channel: string }[];
  wrdo: { userId: string; text: string; channel: string }[];
}

interface SpineFake {
  resolveUserId(phone: string): Promise<string | null>;
  appendUser(userId: string, text: string, channel: 'whatsapp' | 'web'): Promise<void>;
  appendWrdo(userId: string, text: string, channel: 'whatsapp' | 'web'): Promise<void>;
}

function buildPipeline(
  spinePersistence?: SpineFake,
): { service: WebhookPipelineService; sent: { to: string; text: string }[] } {
  const sent: { to: string; text: string }[] = [];
  const opts = {
    handlerService: new WebhookHandlerService(),
    idempotencyService: { isNew: async () => true },
    killswitchService: { isAiEnabled: () => true },
    degradationService: {
      getTier0DefaultMessage: () => 'Tier0 reply',
      getMessageFor: () => 'Degraded reply',
    },
    messageSenderService: {
      sendText: async (to: string, text: string) => {
        sent.push({ to, text });
        return { success: true };
      },
    },
    // No classifyIntent -> classifyAndRoute falls back to the degraded reply,
    // which is still a real reply that must be persisted.
    aiClient: {} as never,
    // Provider response: not handled -> falls through to conversation-state.
    bookingFlowHandler: {
      handleProviderResponse: async () => ({ handled: false }),
    },
    registrationFlowHandler: {} as never,
    // No conversation state -> classifyAndRoute primary path.
    conversationStateService: { getState: async () => null },
    spinePersistence,
  } as unknown as WebhookPipelineServiceOptions;

  return { service: new WebhookPipelineService(opts), sent };
}

function spineFake(opts: { userId?: string | null; throwOn?: 'resolve' | 'user' | 'wrdo' } = {}): {
  spine: SpineFake;
  calls: SpineCalls;
} {
  const calls: SpineCalls = { resolve: [], user: [], wrdo: [] };
  const userId = opts.userId === undefined ? USER_ID : opts.userId;
  const spine: SpineFake = {
    async resolveUserId(phone) {
      calls.resolve.push(phone);
      if (opts.throwOn === 'resolve') throw new Error('resolve down');
      return userId;
    },
    async appendUser(uid, text, channel) {
      calls.user.push({ userId: uid, text, channel });
      if (opts.throwOn === 'user') throw new Error('append user down');
    },
    async appendWrdo(uid, text, channel) {
      calls.wrdo.push({ userId: uid, text, channel });
      if (opts.throwOn === 'wrdo') throw new Error('append wrdo down');
    },
  };
  return { spine, calls };
}

// classifyAndRoute is invoked via the real module; stub its AI/handler deps so it
// returns a deterministic reply. We rely on the degradationService fallback path
// inside classifyAndRoute when aiClient is a no-op, so assert reply count instead.

describe('WebhookPipelineService — spine persistence (WRDO-180, Task 9)', () => {
  it('persists the inbound user turn once with channel whatsapp', async () => {
    const { spine, calls } = spineFake();
    const { service } = buildPipeline(spine);

    await service.handlePayload(payload());

    expect(calls.resolve).toEqual([PHONE]);
    expect(calls.user).toHaveLength(1);
    expect(calls.user[0]).toMatchObject({ userId: USER_ID, text: 'hi there', channel: 'whatsapp' });
  });

  it('persists the WRDO reply for the primary reply path', async () => {
    const { spine, calls } = spineFake();
    const { service, sent } = buildPipeline(spine);

    await service.handlePayload(payload());

    // A reply was actually sent...
    expect(sent.length).toBeGreaterThanOrEqual(1);
    // ...and it was persisted to the spine as a wrdo turn on the whatsapp channel.
    expect(calls.wrdo).toHaveLength(1);
    expect(calls.wrdo[0]).toMatchObject({ userId: USER_ID, channel: 'whatsapp' });
    expect(calls.wrdo[0]?.text).toBe(sent[sent.length - 1]?.text);
  });

  it('never throws out of the pipeline when persistence throws (best-effort)', async () => {
    const { spine } = spineFake({ throwOn: 'user' });
    const { service, sent } = buildPipeline(spine);

    await expect(service.handlePayload(payload())).resolves.toBeUndefined();
    // The friend still got a reply despite the persistence failure.
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });

  it('survives a throwing appendWrdo and still sends the reply', async () => {
    const { spine } = spineFake({ throwOn: 'wrdo' });
    const { service, sent } = buildPipeline(spine);

    await expect(service.handlePayload(payload())).resolves.toBeUndefined();
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });

  it('skips persistence silently when userId cannot be resolved', async () => {
    const { spine, calls } = spineFake({ userId: null });
    const { service, sent } = buildPipeline(spine);

    await service.handlePayload(payload());

    expect(calls.resolve).toEqual([PHONE]);
    // No userId -> no appends at all.
    expect(calls.user).toHaveLength(0);
    expect(calls.wrdo).toHaveLength(0);
    // Reply still goes out.
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });

  it('is a clean no-op when spinePersistence is not injected', async () => {
    const { service, sent } = buildPipeline(undefined);
    await expect(service.handlePayload(payload())).resolves.toBeUndefined();
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });

  it('swallows a throw from resolveUserId without sending appends', async () => {
    const { spine, calls } = spineFake({ throwOn: 'resolve' });
    const { service, sent } = buildPipeline(spine);

    await expect(service.handlePayload(payload())).resolves.toBeUndefined();
    expect(calls.user).toHaveLength(0);
    expect(calls.wrdo).toHaveLength(0);
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });
});
