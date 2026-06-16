/**
 * Legacy V1 flow-executor path. Walks node types directly with the
 * `MessageSenderService` — preserved verbatim from pre-Phase-1α so
 * Stream A's tests stay green and v1 flows keep working until they're
 * migrated to v2.
 *
 * This file is the fallback when `FLOW_EXECUTOR_V2 !== 'true'`. Will be
 * removed in the follow-up PR once the V2 path is validated in prod.
 *
 * NOTE: exceeds the 200-line src cap by design — it is frozen "verbatim" until
 * its imminent deletion, so it is deliberately NOT split (splitting frozen
 * dead-soon code adds churn + risk for zero lifespan). Documented exception.
 */

import type { TribeSession } from '../../../types/tribe-flows.types';
import type {
  WhatsAppFlowActionParameters,
  WhatsAppInteractiveMessage,
} from '../../../types/whatsapp.types';
import type { MessageSenderService } from '../message-sender.service';
import type { FlowDefinition, FlowNode } from './flow-engine.types';
import { evaluateCondition, findNextNodeId, num, str } from './flow-executor.helpers';
import { buildHandoffLinkMessage, buildHandoffUrl } from './web-handoff.service';

export interface LegacyExecutorDeps {
  setWaitingForWeb: (id: string, token: string, expiresAt: Date) => Promise<void>;
  completeSession: (id: string) => Promise<void>;
  markSessionError: (id: string) => Promise<void>;
}

/* eslint-disable complexity -- legacy switch preserved verbatim for backward compat */
export async function executeNodeLegacy(
  session: TribeSession,
  node: FlowNode,
  flow: FlowDefinition,
  deps: LegacyExecutorDeps,
  sender: MessageSenderService,
): Promise<string | null> {
  const { data } = node;

  switch (data.type) {
    case 'wa-message':
    case 'message': {
      await sender.sendText(session.phoneNumber, str(data, 'messageText', str(data, 'text', '')));
      return findNextNodeId(node.id, flow.edges);
    }

    case 'wa-interactive':
    case 'interactive': {
      const bodyText = str(data, 'bodyText', str(data, 'prompt', ''));
      const interactiveType = str(data, 'interactiveType', 'button');
      const footerText = data['footerText'];
      const buttons = data['buttons'];

      if (interactiveType === 'button' && Array.isArray(buttons)) {
        const typedButtons = buttons as Array<{ id: string; title: string }>;
        await sender.sendInteractive(session.phoneNumber, {
          type: 'button',
          body: { text: bodyText },
          ...(typeof footerText === 'string' ? { footer: { text: footerText } } : {}),
          action: {
            buttons: typedButtons.map((b) => ({
              type: 'reply' as const,
              reply: { id: b.id, title: b.title },
            })),
          },
        });
      }
      return null; // Wait for user button tap
    }

    case 'web-handoff':
    case 'external-handoff': {
      const messageText = str(data, 'messageText', 'Please complete the next step:');
      const pageType = str(data, 'webPageType', str(data, 'pageType', 'form'));
      const timeoutMinutes = num(data, 'timeoutMinutes', 60);

      const handoff = buildHandoffLinkMessage(
        session.id,
        node.id,
        session.phoneNumber,
        pageType,
        messageText,
        timeoutMinutes,
      );

      const fullMessage = `${handoff.messageText}\n\n${buildHandoffUrl(handoff.token)}`;
      await sender.sendText(session.phoneNumber, fullMessage);
      await deps.setWaitingForWeb(session.id, handoff.token, handoff.expiresAt);
      return null; // Wait for web completion
    }

    case 'condition': {
      return handleConditionNode(session, node, flow);
    }

    case 'action': {
      return findNextNodeId(node.id, flow.edges);
    }

    case 'end': {
      await deps.completeSession(session.id);
      return null;
    }

    case 'error': {
      const errorMessage = str(data, 'errorMessage', 'Something went wrong. Please try again.');
      await sender.sendText(session.phoneNumber, errorMessage);
      await deps.markSessionError(session.id);
      return null;
    }

    case 'wa-native-flow': {
      const flowMessage = buildNativeFlowMessage(session, node);
      if (flowMessage === null) {
        return findNextNodeId(node.id, flow.edges);
      }
      await sender.sendInteractive(session.phoneNumber, flowMessage);
      return null;
    }

    case 'wa-template':
    case 'template':
      return findNextNodeId(node.id, flow.edges);

    case 'rich-form':
      // Legacy path does not implement rich-form. Skip to next so the
      // conversation does not stall when v2 flows accidentally land here.
      return findNextNodeId(node.id, flow.edges);

    default:
      return null;
  }
}
/* eslint-enable complexity */

/**
 * Translate a `wa-native-flow` graph node into a Meta `interactive.type=flow`
 * payload. Returns `null` if the node is missing the minimum required fields
 * (`flowId` or `flowName`, plus a `cta` string).
 *
 * Exported for direct testing.
 */
export function buildNativeFlowMessage(
  session: TribeSession,
  node: FlowNode,
): WhatsAppInteractiveMessage | null {
  const { data } = node;
  const cta = str(data, 'flowCta', '');
  const flowId = str(data, 'flowId', '');
  const flowName = str(data, 'flowName', '');
  if (cta === '' || (flowId === '' && flowName === '')) {
    return null;
  }

  const headerText = data['headerText'];
  const footerText = data['footerText'];

  const message: WhatsAppInteractiveMessage = {
    type: 'flow',
    body: { text: str(data, 'bodyText', '') },
    action: {
      name: 'flow',
      parameters: buildNativeFlowParameters(session, node, { flowId, flowName, cta }),
    },
  };

  if (typeof headerText === 'string' && headerText.length > 0) {
    message.header = { type: 'text', text: headerText };
  }
  if (typeof footerText === 'string' && footerText.length > 0) {
    message.footer = { text: footerText };
  }
  return message;
}

interface FlowIdentifiers {
  flowId: string;
  flowName: string;
  cta: string;
}

function buildNativeFlowParameters(
  session: TribeSession,
  node: FlowNode,
  ids: FlowIdentifiers,
): WhatsAppFlowActionParameters {
  const { data } = node;
  const flowAction =
    str(data, 'flowAction', 'data_exchange') === 'navigate' ? 'navigate' : 'data_exchange';
  const mode = str(data, 'flowMode', 'published') === 'draft' ? 'draft' : 'published';
  const screen = str(data, 'flowScreen', '');

  const params: WhatsAppFlowActionParameters = {
    flow_token: `${session.id}:${node.id}`,
    flow_message_version: '3',
    flow_action: flowAction,
    flow_cta: ids.cta,
    mode,
  };
  if (ids.flowId !== '') {
    params.flow_id = ids.flowId;
  } else {
    params.flow_name = ids.flowName;
  }
  if (flowAction === 'navigate' && screen !== '') {
    const initialData = data['flowData'];
    params.flow_action_payload = {
      screen,
      ...(initialData !== null && typeof initialData === 'object'
        ? { data: initialData as Record<string, unknown> }
        : {}),
    };
  }
  return params;
}

function handleConditionNode(
  session: TribeSession,
  node: FlowNode,
  flow: FlowDefinition,
): string | null {
  const { data } = node;
  const contextKey = str(data, 'contextKey', '');
  const operator = str(data, 'operator', 'exists');
  const compareValue = data['compareValue'];
  // eslint-disable-next-line security/detect-object-injection
  const contextValue = (session.context as Record<string, unknown>)[contextKey];

  const result = evaluateCondition(contextValue, operator, compareValue);
  const trueBranchLabel = data['trueBranchLabel'];
  const falseBranchLabel = data['falseBranchLabel'];
  const matchLabel = pickBranchLabel(result, trueBranchLabel, falseBranchLabel);
  return findNextNodeId(node.id, flow.edges, matchLabel);
}

function pickBranchLabel(
  matched: boolean,
  trueBranchLabel: unknown,
  falseBranchLabel: unknown,
): string | undefined {
  if (matched) {
    return typeof trueBranchLabel === 'string' ? trueBranchLabel : undefined;
  }
  return typeof falseBranchLabel === 'string' ? falseBranchLabel : undefined;
}
