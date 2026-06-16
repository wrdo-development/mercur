/**
 * Shared constants and helpers used by the per-node WhatsApp renderers.
 * Lives in its own file so each per-node renderer can keep under the 300-line
 * max while still re-using the helpers.
 */

import type { TribeSession } from '../../../../../types/tribe-flows.types';
import type {
  WhatsAppFlowActionParameters,
  WhatsAppInteractiveMessage,
} from '../../../../../types/whatsapp.types';
import type {
  FlowNode,
  InteractiveNodeData,
  InteractiveOption,
  MessageNodeData,
  WaNativeFlowNodeData,
} from '../../flow-engine.types';

/** WhatsApp Meta Cloud API v21 caps. */
export const WHATSAPP_LIMITS = Object.freeze({
  MAX_BUTTONS: 3,
  MAX_LIST_ROWS: 10,
});

export function pickText(data: MessageNodeData): string {
  if (typeof data.text === 'string' && data.text.length > 0) {
    return data.text;
  }
  if (typeof data.messageText === 'string') {
    return data.messageText;
  }
  return '';
}

export function pickOptions(data: InteractiveNodeData): InteractiveOption[] {
  if (Array.isArray(data.options) && data.options.length > 0) {
    return data.options;
  }
  if (Array.isArray(data.buttons)) {
    return data.buttons;
  }
  return [];
}

export function pickPresentation(data: InteractiveNodeData): 'buttons' | 'list' | 'quick-reply' {
  if (data.preferredPresentation !== undefined) {
    return data.preferredPresentation;
  }
  switch (data.interactiveType) {
    case 'list':
      return 'list';
    case 'quick-reply':
      return 'quick-reply';
    default:
      return 'buttons';
  }
}

export function buildButtonInteractive(
  bodyText: string,
  options: InteractiveOption[],
  footerText: string | undefined,
): WhatsAppInteractiveMessage {
  const capped = options.slice(0, WHATSAPP_LIMITS.MAX_BUTTONS);
  return {
    type: 'button',
    body: { text: bodyText },
    ...(typeof footerText === 'string' ? { footer: { text: footerText } } : {}),
    action: {
      buttons: capped.map((o) => ({
        type: 'reply' as const,
        reply: { id: o.id, title: o.title },
      })),
    },
  };
}

export function buildListInteractive(
  bodyText: string,
  options: InteractiveOption[],
  footerText: string | undefined,
): WhatsAppInteractiveMessage {
  const capped = options.slice(0, WHATSAPP_LIMITS.MAX_LIST_ROWS);
  return {
    type: 'list',
    body: { text: bodyText },
    ...(typeof footerText === 'string' ? { footer: { text: footerText } } : {}),
    action: {
      button: 'Choose',
      sections: [
        {
          title: 'Options',
          rows: capped.map((o) => ({
            id: o.id,
            title: o.title,
            ...(typeof o.description === 'string' ? { description: o.description } : {}),
          })),
        },
      ],
    },
  };
}

export function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Build a Meta-native flow interactive message from a typed `WaNativeFlowNodeData`.
 * Returns null when the node is missing required fields (`flowCta` plus
 * either `flowId` or `flowName`). Exported for direct unit testing.
 */
export function buildNativeFlowMessageFromData(
  session: TribeSession,
  node: FlowNode,
  data: WaNativeFlowNodeData,
): WhatsAppInteractiveMessage | null {
  const flowId = stringOr(data.flowId, '');
  const flowName = stringOr(data.flowName, '');
  const cta = stringOr(data.flowCta, '');
  if (cta === '' || (flowId === '' && flowName === '')) {
    return null;
  }

  const flowAction = data.flowAction === 'navigate' ? 'navigate' : 'data_exchange';
  const mode = data.flowMode === 'draft' ? 'draft' : 'published';
  const screen = stringOr(data.flowScreen, '');

  const params: WhatsAppFlowActionParameters = {
    flow_token: `${session.id}:${node.id}`,
    flow_message_version: '3',
    flow_action: flowAction,
    flow_cta: cta,
    mode,
  };
  if (flowId === '') {
    params.flow_name = flowName;
  } else {
    params.flow_id = flowId;
  }
  if (flowAction === 'navigate' && screen !== '') {
    const initialData = data.flowData;
    params.flow_action_payload = {
      screen,
      ...(initialData !== undefined ? { data: initialData } : {}),
    };
  }

  const message: WhatsAppInteractiveMessage = {
    type: 'flow',
    body: { text: stringOr(data.bodyText, '') },
    action: { name: 'flow', parameters: params },
  };

  if (typeof data.headerText === 'string' && data.headerText.length > 0) {
    message.header = { type: 'text', text: data.headerText };
  }
  if (typeof data.footerText === 'string' && data.footerText.length > 0) {
    message.footer = { text: data.footerText };
  }
  return message;
}
