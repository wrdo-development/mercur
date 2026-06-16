/**
 * ActionRegistry — runtime-side store of `action` node handlers.
 *
 * Design contract (Section 7, Decision #9 of the flow architecture doc):
 *   - Flow JSON stores only the handler `key`. The implementation lives in
 *     tribe-api at boot. This keeps the flow definition portable across
 *     channels and across deploys, and keeps secrets / business logic out of
 *     the authoring tool.
 *   - `flow_publish` (wrdo-mcp's tool) calls an admin endpoint that exposes
 *     `getRegisteredKeys()` so it can validate that every `action` node in a
 *     published flow has a known handler — fail closed at publish-time, not
 *     at runtime.
 *
 * Phase 1α ships with two stubs (`noop`, `log`). Real handlers (create_booking,
 * request_ride, compose_listing, ...) land in their own follow-up tracks.
 */

import type { SessionContext, TribeSession } from '../../../../types/tribe-flows.types';
import type { FlowDefinition, FlowNode } from '../flow-engine.types';

export interface ActionHandlerContext {
  /** The raw `params` map from the `action` node. */
  params: Record<string, unknown>;
  /** The live session — read-only inside the handler. */
  session: TribeSession;
  /** The whole flow definition. */
  flow: FlowDefinition;
  /** The action node itself, for diagnostics. */
  node: FlowNode;
}

export interface ActionHandlerResult {
  /**
   * Optional session-context update. If non-empty, the executor will persist
   * it together with the advance to the next node.
   */
  contextUpdate?: Partial<SessionContext>;
  /**
   * Free-form diagnostics — surfaced to the executor's diagnostics bag for
   * observability. Not user-visible.
   */
  diagnostics?: Record<string, unknown>;
}

export type ActionHandler = (
  context: ActionHandlerContext,
) => Promise<ActionHandlerResult> | ActionHandlerResult;

/**
 * Registry implementation. Boot-time: `register()`. Runtime: `lookup()`.
 * `getRegisteredKeys()` is the publish-time validator surface.
 *
 * Backed by a `Map` so key-collision is loud (the second `register()` on the
 * same key wins; callers in tests can `clear()` between runs).
 */
export class ActionRegistry {
  private readonly handlers = new Map<string, ActionHandler>();

  /** Register a handler. Throws if `key` is empty. */
  register(key: string, handler: ActionHandler): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('ActionRegistry.register: key must be a non-empty string');
    }
    this.handlers.set(key, handler);
  }

  /** Look up a handler. Returns `undefined` for unknown keys. */
  lookup(key: string): ActionHandler | undefined {
    return this.handlers.get(key);
  }

  /** True if a handler is registered under `key`. */
  has(key: string): boolean {
    return this.handlers.has(key);
  }

  /**
   * Snapshot of all registered keys. Sorted alphabetically so the publish
   * validator's error messages are stable across runs.
   */
  getRegisteredKeys(): string[] {
    return Array.from(this.handlers.keys()).sort();
  }

  /** Wipe all handlers. Test-only — production should never call this. */
  clear(): void {
    this.handlers.clear();
  }
}

/**
 * Stub handlers shipped in Phase 1α. Two intentionally trivial handlers so the
 * registry has something registered and tests can exercise the action node
 * code path without needing real business logic.
 */
export const STUB_HANDLERS: Readonly<Record<string, ActionHandler>> = Object.freeze({
  /** No-op. Advances to the next node, persists nothing. */
  noop: (): ActionHandlerResult => ({}),
  /**
   * Diagnostic logger. Returns the params bag as diagnostics so the executor
   * can surface what was logged without printing to console from inside the
   * handler.
   */
  log: ({ params }: ActionHandlerContext): ActionHandlerResult => ({
    diagnostics: { logged: params },
  }),
});

/**
 * Convenience factory used at boot in tribe-api's DI container and by tests
 * that want a default-configured registry without re-listing the stubs.
 */
export function createDefaultActionRegistry(): ActionRegistry {
  const registry = new ActionRegistry();
  for (const [key, handler] of Object.entries(STUB_HANDLERS)) {
    registry.register(key, handler);
  }
  return registry;
}
