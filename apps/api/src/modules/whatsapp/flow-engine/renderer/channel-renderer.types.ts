/**
 * ChannelRenderer interface.
 *
 * A renderer translates a channel-agnostic `FlowNode` into channel-specific
 * IO. The executor never knows which channel it is rendering on — it picks a
 * renderer from the registry and asks it to render.
 *
 * Design contract (Section 2 of the channel-agnostic flow architecture doc):
 *   - `render()` is the only entry point used by the executor today. It
 *     returns a `RenderResult` describing what happened, what side-effects to
 *     run, whether the executor should wait for user input, and (for pure-
 *     logic nodes like `condition` / `action`) the next node id.
 *   - Side-effects are produced as a list of discriminated-union events so
 *     the executor can process them in order without the renderer reaching
 *     back into the session store, message sender, etc. This keeps renderers
 *     pure-ish and trivially mockable in tests.
 *   - The other two methods from the design doc (`parseIncoming`,
 *     `extractReplyId`) are reserved for Phase 2 when additional channels
 *     come online and the webhook intake needs per-channel parsing.
 */

import type { SessionContext, TribeSession } from '../../../../types/tribe-flows.types';
import type { FlowDefinition, FlowNode } from '../flow-engine.types';

/**
 * Active channels. Only `whatsapp` is implemented in Phase 1α. The other
 * values are reserved by the type system so renderers, identity resolvers and
 * the executor can compile-check exhaustive switches as channels are added.
 */
export type Channel = 'whatsapp' | 'telegram' | 'messenger' | 'web';

/**
 * Context handed to every renderer call. The renderer may consult anything on
 * here but must not mutate `session` directly — mutations are expressed as
 * `SideEffect`s in the returned `RenderResult`.
 */
export interface RenderContext {
  /** Resolved canonical user id (Section 3 of the design doc). */
  userId: string;
  /** Raw channel-specific identifier (BSUID for WhatsApp, etc.). */
  channelUserId: string;
  /** Active channel for this render. */
  channel: Channel;
  /** Live session — the renderer reads, but expresses changes via side-effects. */
  session: TribeSession;
  /** The whole flow definition — renderers need access to `edges` to compute next. */
  flow: FlowDefinition;
}

// ────────────────────────────────────────────────────────────────────────────
// Side-effect discriminated union
//
// Renderers describe what should happen rather than doing it themselves. The
// executor walks the list and dispatches each side-effect to the right
// collaborator (message sender, session store, web-handoff service, etc.).
// This keeps renderers purely about translation.
// ────────────────────────────────────────────────────────────────────────────

export interface SendMessageSideEffect {
  kind: 'sendMessage';
  channel: Channel;
  /** E.164 phone number for WhatsApp; channel-specific id for others. */
  to: string;
  payload:
    | { kind: 'text'; body: string; previewUrl?: boolean }
    | { kind: 'interactive'; interactive: unknown }
    | { kind: 'template'; template: unknown };
}

export interface PersistSessionSideEffect {
  kind: 'persistSession';
  sessionId: string;
  nextNodeId: string;
  contextUpdate: Partial<SessionContext>;
}

export interface ScheduleJobSideEffect {
  kind: 'scheduleJob';
  jobKey: string;
  payload: Record<string, unknown>;
  runAt: Date;
}

export interface WaitForWebSideEffect {
  kind: 'waitForWeb';
  sessionId: string;
  token: string;
  expiresAt: Date;
}

export interface CompleteSessionSideEffect {
  kind: 'completeSession';
  sessionId: string;
}

export interface MarkSessionErrorSideEffect {
  kind: 'markSessionError';
  sessionId: string;
  reason: string;
}

export interface LogSideEffect {
  kind: 'log';
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

export type SideEffect =
  | SendMessageSideEffect
  | PersistSessionSideEffect
  | ScheduleJobSideEffect
  | WaitForWebSideEffect
  | CompleteSessionSideEffect
  | MarkSessionErrorSideEffect
  | LogSideEffect;

/**
 * Result of rendering a single node.
 *
 *  - `nextNodeId === null` AND `waitingForUser === false`  → the flow is over
 *    (end / error node, or no outgoing edge).
 *  - `nextNodeId === null` AND `waitingForUser === true`   → pause; we will
 *    resume when a user reply / web completion arrives.
 *  - `nextNodeId !== null`                                  → the executor
 *    should immediately walk to `nextNodeId`.
 */
export interface RenderResult {
  nextNodeId: string | null;
  sideEffects: SideEffect[];
  waitingForUser: boolean;
  /** Optional diagnostic bag for observability. Free-form. */
  diagnostics?: Record<string, unknown>;
}

/**
 * The renderer contract. One implementation per channel.
 *
 * `render()` is sync-or-async by design — WhatsApp's path is sync-state-only
 * (no IO inside the renderer) but Telegram or Web may need to look up
 * channel-specific user state before emitting side-effects.
 */
export interface ChannelRenderer {
  readonly channel: Channel;
  render(node: FlowNode, context: RenderContext): Promise<RenderResult>;
}

/**
 * Registry of channel renderers, keyed by channel. The executor looks one up
 * per render. Registry is mutable at boot but treated as read-only at runtime.
 */
export class ChannelRendererRegistry {
  private readonly map = new Map<Channel, ChannelRenderer>();

  register(renderer: ChannelRenderer): void {
    this.map.set(renderer.channel, renderer);
  }

  get(channel: Channel): ChannelRenderer | undefined {
    return this.map.get(channel);
  }

  /** Returns true if every channel in `channels` has a renderer. */
  hasAll(channels: readonly Channel[]): boolean {
    return channels.every((c) => this.map.has(c));
  }

  /** Defensive copy of the registered channels — useful for diagnostics. */
  channels(): Channel[] {
    return Array.from(this.map.keys());
  }
}
