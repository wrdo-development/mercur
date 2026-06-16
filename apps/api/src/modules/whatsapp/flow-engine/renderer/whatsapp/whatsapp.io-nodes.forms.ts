/**
 * WhatsApp IO renderers for the form/flow node types: rich-form (+ its
 * text-degradation fallback), wa-native-flow, and external-handoff.
 * Split from whatsapp.io-nodes.ts (200-line cap); re-exported from there.
 */

import type {
  WhatsAppFlowActionParameters,
  WhatsAppInteractiveMessage,
} from '../../../../../types/whatsapp.types';
import type {
  ExternalHandoffNodeData,
  FlowNode,
  RichFormNodeData,
  WaNativeFlowNodeData,
} from '../../flow-engine.types';
import { findNextNodeId } from '../../flow-executor.helpers';
import { buildHandoffLinkMessage, buildHandoffUrl } from '../../web-handoff.service';
import type { Channel, RenderContext, RenderResult } from '../channel-renderer.types';
import { buildNativeFlowMessageFromData, stringOr } from './whatsapp.constants';

const CHANNEL: Channel = 'whatsapp';

export function renderRichForm(
  node: FlowNode,
  data: RichFormNodeData,
  context: RenderContext,
): RenderResult {
  // On WhatsApp, a `rich-form` is implemented as a Meta Native Flow if the
  // author wired one up. Otherwise we degrade to a numbered text prompt.
  const flowId = stringOr(data['flowId'], '');
  const flowName = stringOr(data['flowName'], '');
  const cta = stringOr(data['flowCta'], data.submitLabel ?? 'Submit');

  if (flowId === '' && flowName === '') {
    return degradeRichFormToText(node, data, context);
  }

  const params: WhatsAppFlowActionParameters = {
    flow_token: `${context.session.id}:${node.id}`,
    flow_message_version: '3',
    flow_action: 'data_exchange',
    flow_cta: cta,
    mode: 'published',
  };
  if (flowId !== '') {
    params.flow_id = flowId;
  } else {
    params.flow_name = flowName;
  }

  const interactive: WhatsAppInteractiveMessage = {
    type: 'flow',
    body: { text: data.description ?? data.title },
    action: { name: 'flow', parameters: params },
  };

  return {
    nextNodeId: null,
    waitingForUser: true,
    sideEffects: [
      {
        kind: 'sendMessage',
        channel: CHANNEL,
        to: context.session.phoneNumber,
        payload: { kind: 'interactive', interactive },
      },
    ],
  };
}

function degradeRichFormToText(
  node: FlowNode,
  data: RichFormNodeData,
  context: RenderContext,
): RenderResult {
  const lines = [
    data.title,
    ...(data.description !== undefined ? [data.description] : []),
    ...data.fields.map((f, idx) => `${String(idx + 1)}. ${f.label}`),
  ];
  return {
    nextNodeId: null,
    waitingForUser: true,
    sideEffects: [
      {
        kind: 'sendMessage',
        channel: CHANNEL,
        to: context.session.phoneNumber,
        payload: { kind: 'text', body: lines.join('\n') },
      },
      {
        kind: 'log',
        level: 'warn',
        message: 'rich-form node has no Meta-registered flow id; degraded to text prompt',
        meta: { nodeId: node.id, flowSlug: context.flow.slug },
      },
    ],
  };
}

export function renderWaNativeFlow(
  node: FlowNode,
  data: WaNativeFlowNodeData,
  context: RenderContext,
): RenderResult {
  const message = buildNativeFlowMessageFromData(context.session, node, data);
  if (message === null) {
    return {
      nextNodeId: findNextNodeId(node.id, context.flow.edges),
      waitingForUser: false,
      sideEffects: [
        {
          kind: 'log',
          level: 'error',
          message: 'wa-native-flow node is missing flowId/flowName or flowCta',
          meta: { nodeId: node.id },
        },
      ],
    };
  }

  return {
    nextNodeId: null,
    waitingForUser: true,
    sideEffects: [
      {
        kind: 'sendMessage',
        channel: CHANNEL,
        to: context.session.phoneNumber,
        payload: { kind: 'interactive', interactive: message },
      },
    ],
  };
}

export function renderExternalHandoff(
  node: FlowNode,
  data: ExternalHandoffNodeData,
  context: RenderContext,
): RenderResult {
  const messageText = data.messageText ?? 'Please complete the next step:';
  const pageType = data.pageType ?? data.webPageType ?? 'form';
  const timeoutMinutes = data.timeoutMinutes ?? 60;

  const handoff = buildHandoffLinkMessage(
    context.session.id,
    node.id,
    context.session.phoneNumber,
    pageType,
    messageText,
    timeoutMinutes,
  );
  const fullMessage = `${handoff.messageText}\n\n${buildHandoffUrl(handoff.token)}`;

  return {
    nextNodeId: null,
    waitingForUser: true,
    sideEffects: [
      {
        kind: 'sendMessage',
        channel: CHANNEL,
        to: context.session.phoneNumber,
        payload: { kind: 'text', body: fullMessage },
      },
      {
        kind: 'waitForWeb',
        sessionId: context.session.id,
        token: handoff.token,
        expiresAt: handoff.expiresAt,
      },
    ],
  };
}
