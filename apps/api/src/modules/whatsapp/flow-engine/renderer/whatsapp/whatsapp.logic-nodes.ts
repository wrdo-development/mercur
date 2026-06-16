/**
 * Per-node renderers for the pure-logic nodes (`condition`, `action`, `end`,
 * `error`). These don't have channel-specific shapes, but they still flow
 * through the renderer so the executor's dispatch loop stays uniform.
 */

import type { ActionRegistry } from '../../actions/registry';
import type {
  ActionNodeData,
  ConditionNodeData,
  EndNodeData,
  ErrorNodeData,
  FlowNode,
} from '../../flow-engine.types';
import { evaluateCondition, findNextNodeId } from '../../flow-executor.helpers';
import type { Channel, RenderContext, RenderResult, SideEffect } from '../channel-renderer.types';

const CHANNEL: Channel = 'whatsapp';

export function renderCondition(
  node: FlowNode,
  data: ConditionNodeData,
  context: RenderContext,
): RenderResult {
  const sessionContext = context.session.context as Record<string, unknown>;
  const contextValue = sessionContext[data.contextKey];
  const matched = evaluateCondition(contextValue, data.operator, data.compareValue);
  const matchLabel = matched ? data.trueBranchLabel : data.falseBranchLabel;
  return {
    nextNodeId: findNextNodeId(node.id, context.flow.edges, matchLabel),
    waitingForUser: false,
    sideEffects: [],
    diagnostics: { matched },
  };
}

export async function renderAction(
  node: FlowNode,
  data: ActionNodeData,
  context: RenderContext,
  actionRegistry: ActionRegistry,
): Promise<RenderResult> {
  const handler = actionRegistry.lookup(data.handler);
  if (handler === undefined) {
    return {
      nextNodeId: findNextNodeId(node.id, context.flow.edges),
      waitingForUser: false,
      sideEffects: [
        {
          kind: 'log',
          level: 'error',
          message: `action handler not registered: ${data.handler}`,
          meta: { nodeId: node.id, registered: actionRegistry.getRegisteredKeys() },
        },
      ],
    };
  }

  const result = await handler({
    params: data.params ?? {},
    session: context.session,
    flow: context.flow,
    node,
  });

  const sideEffects: SideEffect[] = [];
  if (result.contextUpdate !== undefined && Object.keys(result.contextUpdate).length > 0) {
    sideEffects.push({
      kind: 'persistSession',
      sessionId: context.session.id,
      nextNodeId: findNextNodeId(node.id, context.flow.edges) ?? context.session.currentNodeId,
      contextUpdate: result.contextUpdate,
    });
  }

  return {
    nextNodeId: findNextNodeId(node.id, context.flow.edges),
    waitingForUser: false,
    sideEffects,
    diagnostics: { handlerKey: data.handler },
  };
}

export function renderEnd(
  _node: FlowNode,
  data: EndNodeData,
  context: RenderContext,
): RenderResult {
  const sideEffects: SideEffect[] = [];
  if (typeof data.successMessage === 'string' && data.successMessage.length > 0) {
    sideEffects.push({
      kind: 'sendMessage',
      channel: CHANNEL,
      to: context.session.phoneNumber,
      payload: { kind: 'text', body: data.successMessage },
    });
  }
  sideEffects.push({ kind: 'completeSession', sessionId: context.session.id });
  return {
    nextNodeId: null,
    waitingForUser: false,
    sideEffects,
  };
}

export function renderError(
  _node: FlowNode,
  data: ErrorNodeData,
  context: RenderContext,
): RenderResult {
  const errorMessage = data.errorMessage ?? 'Something went wrong. Please try again.';
  return {
    nextNodeId: null,
    waitingForUser: false,
    sideEffects: [
      {
        kind: 'sendMessage',
        channel: CHANNEL,
        to: context.session.phoneNumber,
        payload: { kind: 'text', body: errorMessage },
      },
      {
        kind: 'markSessionError',
        sessionId: context.session.id,
        reason: errorMessage,
      },
    ],
  };
}
