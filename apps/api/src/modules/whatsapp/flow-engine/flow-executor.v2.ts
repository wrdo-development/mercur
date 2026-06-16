/**
 * V2 flow-executor path: delegates to a {@link ChannelRenderer} from the
 * registry, dispatches the returned `SideEffect`s.
 *
 * Activated when `FLOW_EXECUTOR_V2=true`. The legacy path stays in
 * `flow-executor.legacy.ts` and is preserved verbatim until Phase 1β.
 */

import type { TribeSession } from '../../../types/tribe-flows.types';
import type {
  WhatsAppInteractiveMessage,
  WhatsAppTemplateMessage,
} from '../../../types/whatsapp.types';
import type { MessageSenderService } from '../message-sender.service';
import type { FlowDefinition, FlowNode } from './flow-engine.types';
import type {
  Channel,
  ChannelRenderer,
  ChannelRendererRegistry,
  RenderContext,
  RenderResult,
  SideEffect,
} from './renderer/channel-renderer.types';

export interface ExecutorDeps {
  updateSession: (
    id: string,
    nextNodeId: string,
    contextUpdate: Record<string, unknown>,
  ) => Promise<TribeSession>;
  setWaitingForWeb: (id: string, token: string, expiresAt: Date) => Promise<void>;
  completeSession: (id: string) => Promise<void>;
  markSessionError: (id: string) => Promise<void>;
}

/**
 * Resolves a (channel, channelUserId) pair to the canonical `wrdo_users.id`.
 *
 * Phase 1β: implemented by `WrdoUserService.getOrCreateByChannelIdentity`.
 * Phase 1α had a TODO here that used `session.phoneNumber` as a stand-in;
 * that TODO is closed by injecting this resolver from the boot-time DI
 * container. When the resolver is omitted (legacy tests, ad-hoc wiring) the
 * executor falls back to the channel-specific id verbatim so the render path
 * stays unchanged.
 */
export interface IdentityResolver {
  resolve(channel: Channel, channelUserId: string): Promise<string>;
}

export interface ExecuteNodeV2Options {
  channelRegistry: ChannelRendererRegistry;
  sender: MessageSenderService;
  channel: Channel;
  /**
   * Phase 1β identity resolver. When provided, RenderContext.userId is the
   * canonical wrdo_users.id; when omitted, falls back to the channel-specific
   * id (legacy behaviour for tests that have not been wired to the resolver).
   */
  identityResolver?: IdentityResolver;
}

/**
 * Execute a single node via the renderer pattern.
 * Returns the next node id or null when paused / terminated.
 */
export async function executeNodeV2(
  session: TribeSession,
  node: FlowNode,
  flow: FlowDefinition,
  deps: ExecutorDeps,
  options: ExecuteNodeV2Options,
): Promise<string | null> {
  const renderer: ChannelRenderer | undefined = options.channelRegistry.get(options.channel);
  if (renderer === undefined) {
    await deps.markSessionError(session.id);
    return null;
  }

  // Phase 1β: resolve the channel-specific identifier (BSUID for WhatsApp,
  // numeric id for Telegram, PSID for Messenger, session subject for web)
  // to the canonical wrdo_users.id. For WhatsApp we prefer a BSUID stored on
  // the session context; legacy sessions still pass phone as a fallback.
  const channelUserId: string = resolveChannelUserId(session, options.channel);
  const userId: string =
    options.identityResolver !== undefined
      ? await options.identityResolver.resolve(options.channel, channelUserId)
      : channelUserId;

  const context: RenderContext = {
    userId,
    channelUserId,
    channel: options.channel,
    session,
    flow,
  };

  const result: RenderResult = await renderer.render(node, context);
  await dispatchSideEffects(result.sideEffects, deps, options.sender);

  if (result.waitingForUser) {
    return null;
  }
  return result.nextNodeId;
}

/**
 * Channel-specific identifier source per channel.
 *   - whatsapp: BSUID from session context (post-2026-06 Meta canonical handle),
 *               falls back to phone for legacy sessions.
 *   - telegram / messenger / web: reserved for Phase 2-4; falls back to the
 *               session phone-number field which serves as the stand-in id
 *               until those channels wire their own intake.
 */
function resolveChannelUserId(session: TribeSession, channel: Channel): string {
  if (channel === 'whatsapp') {
    const bsuid = session.context['bsuid'];
    if (typeof bsuid === 'string' && bsuid.length > 0) {
      return bsuid;
    }
  }
  return session.phoneNumber;
}

async function dispatchSideEffects(
  sideEffects: readonly SideEffect[],
  deps: ExecutorDeps,
  sender: MessageSenderService,
): Promise<void> {
  for (const effect of sideEffects) {
    await dispatchOne(effect, deps, sender);
  }
}

async function dispatchOne(
  effect: SideEffect,
  deps: ExecutorDeps,
  sender: MessageSenderService,
): Promise<void> {
  switch (effect.kind) {
    case 'sendMessage':
      await dispatchSendMessage(effect, sender);
      return;
    case 'persistSession':
      await deps.updateSession(effect.sessionId, effect.nextNodeId, effect.contextUpdate);
      return;
    case 'waitForWeb':
      await deps.setWaitingForWeb(effect.sessionId, effect.token, effect.expiresAt);
      return;
    case 'completeSession':
      await deps.completeSession(effect.sessionId);
      return;
    case 'markSessionError':
      await deps.markSessionError(effect.sessionId);
      return;
    case 'scheduleJob':
      // Reserved for Phase 1β when the BullMQ scheduler lands.
      return;
    case 'log':
      // Pino logger lands in a follow-up. Diagnostic logs are surfaced via
      // RenderResult.diagnostics in tests.
      return;
  }
}

interface SendMessageEffect {
  to: string;
  payload:
    | { kind: 'text'; body: string; previewUrl?: boolean }
    | { kind: 'interactive'; interactive: unknown }
    | { kind: 'template'; template: unknown };
}

async function dispatchSendMessage(
  effect: SendMessageEffect,
  sender: MessageSenderService,
): Promise<void> {
  const { to, payload } = effect;
  switch (payload.kind) {
    case 'text':
      await sender.sendText(to, payload.body, payload.previewUrl ?? false);
      return;
    case 'interactive':
      await sender.sendInteractive(to, payload.interactive as WhatsAppInteractiveMessage);
      return;
    case 'template':
      await sender.sendTemplate(to, payload.template as WhatsAppTemplateMessage);
      return;
  }
}
