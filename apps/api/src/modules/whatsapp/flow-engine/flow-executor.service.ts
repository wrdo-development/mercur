/**
 * Flow Executor Service
 *
 * Walks a flow definition's node graph and dispatches the right channel IO.
 * Called by the webhook pipeline when a user is in an active session.
 *
 * Two execution paths coexist behind the `FLOW_EXECUTOR_V2` feature flag:
 *
 *   - LEGACY (default, flag off): the original WhatsApp-only switch that calls
 *     `MessageSenderService` directly. Lives in `flow-executor.legacy.ts`,
 *     preserved verbatim so Stream A's 50+ tests stay green and v1 flows
 *     authored against the old `wa-*` node types keep walking.
 *
 *   - V2 (flag on): delegates to a `ChannelRenderer` chosen from the registry
 *     by channel. The renderer returns a `RenderResult` with a list of
 *     `SideEffect`s the executor dispatches in order. Lives in
 *     `flow-executor.v2.ts`. The executor itself owns no channel-specific
 *     code in this path — that lives in `renderer/whatsapp.renderer.ts` today
 *     and in `telegram.renderer.ts`, `messenger.renderer.ts`,
 *     `web.renderer.ts` in later phases.
 *
 * Public API (`executeNode`, `handleUserInput`, `buildNativeFlowMessage`,
 * `isFlowExecutorV2Enabled`, `setV2Registries`) is preserved so the webhook
 * pipeline and the existing wa-native-flow tests keep working without
 * changes.
 */

import type { SessionContext, TribeSession } from '../../../types/tribe-flows.types';
import { MessageSenderService } from '../message-sender.service';
import { type ActionRegistry, createDefaultActionRegistry } from './actions/registry';
import type { FlowDefinition, FlowNode, FlowNodeData } from './flow-engine.types';
import { findNextNodeId, str } from './flow-executor.helpers';
import { buildNativeFlowMessage, executeNodeLegacy } from './flow-executor.legacy';
import { executeNodeV2, type IdentityResolver } from './flow-executor.v2';
import { type Channel, ChannelRendererRegistry } from './renderer/channel-renderer.types';
import { WhatsAppRenderer } from './renderer/whatsapp.renderer';

const sender = new MessageSenderService();

// ── V2 wiring (module-singleton, lazily constructed) ───────────────────────
let v2Registry: ChannelRendererRegistry | undefined;
let v2ActionRegistry: ActionRegistry | undefined;
let v2IdentityResolver: IdentityResolver | undefined;

/**
 * Returns the singleton channel-renderer registry, constructing it on first
 * call with a default WhatsApp renderer wired to the default action registry.
 *
 * Tests / DI containers that want a custom configuration should call
 * `setV2Registries` before invoking the executor.
 */
function ensureV2Registries(): {
  channelRegistry: ChannelRendererRegistry;
  actionRegistry: ActionRegistry;
} {
  if (v2Registry === undefined || v2ActionRegistry === undefined) {
    const actionRegistry = createDefaultActionRegistry();
    const channelRegistry = new ChannelRendererRegistry();
    channelRegistry.register(new WhatsAppRenderer({ actionRegistry }));
    v2Registry = channelRegistry;
    v2ActionRegistry = actionRegistry;
  }
  return { channelRegistry: v2Registry, actionRegistry: v2ActionRegistry };
}

/**
 * Override the V2 registries — primarily for tests and DI containers.
 * `undefined` resets back to lazy default-construction.
 */
export function setV2Registries(
  registries:
    | {
        channelRegistry?: ChannelRendererRegistry;
        actionRegistry?: ActionRegistry;
        identityResolver?: IdentityResolver;
      }
    | undefined,
): void {
  if (registries === undefined) {
    v2Registry = undefined;
    v2ActionRegistry = undefined;
    v2IdentityResolver = undefined;
    return;
  }
  v2Registry = registries.channelRegistry ?? v2Registry;
  v2ActionRegistry = registries.actionRegistry ?? v2ActionRegistry;
  v2IdentityResolver = registries.identityResolver ?? v2IdentityResolver;
}

/**
 * Read the feature flag fresh on every call so tests can flip it at runtime
 * without re-importing the module. The flag is intentionally string-equality
 * (`'true'`) so anything else — including unset — keeps us on the legacy path.
 */
export function isFlowExecutorV2Enabled(): boolean {
  return process.env['FLOW_EXECUTOR_V2'] === 'true';
}

export interface FlowExecutorDeps {
  updateSession: (
    id: string,
    nextNodeId: string,
    contextUpdate: Partial<SessionContext>,
  ) => Promise<TribeSession>;
  setWaitingForWeb: (id: string, token: string, expiresAt: Date) => Promise<void>;
  completeSession: (id: string) => Promise<void>;
  markSessionError: (id: string) => Promise<void>;
}

/**
 * Execute a single flow node — sends the appropriate channel message and
 * returns the next node ID, or null if waiting for user / web input.
 *
 * The signature is preserved across V1 and V2 paths. V2 defaults to
 * `'whatsapp'` since this executor is currently called only from the WhatsApp
 * webhook pipeline; when other channels light up they will pass `channel`.
 */
export async function executeNode(
  session: TribeSession,
  node: FlowNode,
  flow: FlowDefinition,
  deps: FlowExecutorDeps,
  options: { channel?: Channel } = {},
): Promise<string | null> {
  if (isFlowExecutorV2Enabled()) {
    const { channelRegistry } = ensureV2Registries();
    return executeNodeV2(session, node, flow, deps, {
      channelRegistry,
      sender,
      channel: options.channel ?? 'whatsapp',
      identityResolver: v2IdentityResolver,
    });
  }
  return executeNodeLegacy(session, node, flow, deps, sender);
}

/**
 * Handle incoming user input in an active session.
 */
export async function handleUserInput(
  session: TribeSession,
  userInput: string,
  flow: FlowDefinition,
  deps: FlowExecutorDeps,
): Promise<void> {
  const currentNode = flow.nodes.find((n) => n.id === session.currentNodeId);
  if (currentNode === undefined) {
    return;
  }

  const data: FlowNodeData = currentNode.data;
  const contextUpdate: Partial<SessionContext> = {};
  let nextNodeId: string | null = null;

  if (data.type === 'wa-interactive' || data.type === 'interactive') {
    const contextKey = str(data, 'contextKey', 'lastButtonId');
    const mutableContext = contextUpdate as Record<string, unknown>;
    // eslint-disable-next-line security/detect-object-injection
    mutableContext[contextKey] = userInput;
    contextUpdate.lastButtonId = userInput;
    nextNodeId = findNextNodeId(currentNode.id, flow.edges, userInput);
  } else {
    contextUpdate.lastUserInput = userInput;
    nextNodeId = findNextNodeId(currentNode.id, flow.edges);
  }

  if (nextNodeId === null) {
    return;
  }

  const updatedSession = await deps.updateSession(session.id, nextNodeId, contextUpdate);
  const nextNode = flow.nodes.find((n) => n.id === nextNodeId);
  if (nextNode === undefined) {
    return;
  }

  await executeNode(updatedSession, nextNode, flow, deps);
}

// Re-export the legacy native-flow builder so existing tests
// (`tests/unit/whatsapp/flow-engine/wa-native-flow.test.ts`) keep importing
// from the same path.
export { buildNativeFlowMessage };
