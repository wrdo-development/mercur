/**
 * Meta Flows Data Exchange dispatcher.
 *
 * Maps each Meta-defined `action` (INIT / BACK / data_exchange / ping) to a
 * pure response builder. The handler is stateless on its own — domain state
 * lives in the screen handlers that the dispatcher delegates to.
 *
 * Design contract:
 *   - `ping` returns `{ data: { status: 'active' } }` synchronously. This is
 *     Meta's health probe and must respond fast (<1s required, <300ms target).
 *   - `data.error` from the client is acknowledged silently so the user is not
 *     left staring at a stuck screen. We log it, return `{ data: { acknowledged: true } }`.
 *   - INIT / BACK / data_exchange are routed by `screen` to a registered
 *     handler. Unknown screens are an error — the caller must register every
 *     screen ID it uses.
 */

import type { MetaFlowDecryptedRequest, MetaFlowResponse } from './meta-crypto.types';

/** Logger contract — the wider tribe-api logger already satisfies this. */
export interface DispatcherLogger {
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

/**
 * A screen handler is a pure-ish function that decides what to render next.
 *
 * It receives the decrypted Meta request and returns the cleartext response
 * that the dispatcher will hand to {@link encryptResponse}. Throwing from
 * here propagates to the route, which surfaces a 500.
 */
export type ScreenHandler = (
  decryptedBody: MetaFlowDecryptedRequest,
) => Promise<MetaFlowResponse> | MetaFlowResponse;

export interface FlowDispatcherOptions {
  /** Map of screen ID -> handler. The dispatcher will call the matching handler for INIT / BACK / data_exchange. */
  screens: Record<string, ScreenHandler>;
  /**
   * Optional override used by INIT when the client has not yet selected a screen.
   * Most Meta flows expect INIT to land on a fixed entry screen — provide it here.
   */
  initialScreen?: string;
  logger?: DispatcherLogger;
}

const PING_RESPONSE: MetaFlowResponse = Object.freeze({
  data: { status: 'active' },
});

const ERROR_ACK_RESPONSE: MetaFlowResponse = Object.freeze({
  data: { acknowledged: true },
});

/**
 * Returned when a screen ID has no registered handler. We respond with an
 * encrypted 200 instead of throwing (which would 500 → Meta retries hard).
 * `error_msg` is shown to the user as a friendly "this screen is gone".
 */
const UNKNOWN_SCREEN_RESPONSE: MetaFlowResponse = Object.freeze({
  data: { acknowledged: true, error_msg: 'This screen is no longer available' },
});

export class FlowDispatcher {
  private readonly screens: Record<string, ScreenHandler>;
  private readonly initialScreen: string | undefined;
  private readonly logger: DispatcherLogger | undefined;

  constructor(options: FlowDispatcherOptions) {
    this.screens = options.screens;
    this.initialScreen = options.initialScreen;
    this.logger = options.logger;
  }

  /**
   * Resolve the response body for a decrypted Meta payload.
   *
   * The dispatcher does not encrypt or decode anything — it is a pure
   * action → response mapper, so it is trivially unit-testable.
   */
  async dispatch(decryptedBody: MetaFlowDecryptedRequest): Promise<MetaFlowResponse> {
    const { action, screen, data } = decryptedBody;

    if (action === 'ping') {
      return PING_RESPONSE;
    }

    if (data !== undefined && data['error'] !== undefined) {
      this.logger?.warn('Meta Flows client error', { error: data['error'] });
      return ERROR_ACK_RESPONSE;
    }

    const targetScreen = this.resolveScreen(action, screen);
    const handler = lookupScreen(this.screens, targetScreen);
    if (handler === undefined) {
      // We deliberately do NOT throw here. Throwing surfaces as a 500 in the
      // route, and Meta retries 500s aggressively. An encrypted-200 with an
      // `error_msg` shows the user a friendly message and lets Meta move on.
      this.logger?.error('Meta Flows: no handler for screen', { screen: targetScreen, action });
      return UNKNOWN_SCREEN_RESPONSE;
    }

    return await handler(decryptedBody);
  }

  private resolveScreen(action: string, screen: string | undefined): string {
    if (action === 'INIT' && this.initialScreen !== undefined) {
      return this.initialScreen;
    }
    if (typeof screen === 'string' && screen.length > 0) {
      return screen;
    }
    throw new Error(`Meta Flows ${action} request did not include a screen`);
  }
}

/**
 * Map-lookup helper that returns `undefined` when the key isn't an own property.
 * Keeps `security/detect-object-injection` happy and avoids relying on
 * `noUncheckedIndexedAccess` being enabled in the consumer's tsconfig.
 */
function lookupScreen(map: Record<string, ScreenHandler>, key: string): ScreenHandler | undefined {
  if (!Object.hasOwn(map, key)) {
    return undefined;
  }
  // eslint-disable-next-line security/detect-object-injection -- hasOwnProperty guard above
  return map[key];
}
