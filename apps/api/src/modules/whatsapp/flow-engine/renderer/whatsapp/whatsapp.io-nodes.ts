/**
 * Per-node renderers for WhatsApp channel-IO nodes:
 * `message`, `interactive`, `template`, `rich-form`, `wa-native-flow`,
 * `external-handoff`.
 *
 * Each function is a pure mapping from (FlowNode, RenderContext) to
 * RenderResult. No IO — side-effects are described, not executed.
 */

import type { WhatsAppInteractiveMessage } from '../../../../../types/whatsapp.types';
import type {
  FlowNode,
  InteractiveNodeData,
  MessageNodeData,
  TemplateNodeData,
} from '../../flow-engine.types';
import { findNextNodeId } from '../../flow-executor.helpers';
import type { Channel, RenderContext, RenderResult } from '../channel-renderer.types';
import {
  buildButtonInteractive,
  buildListInteractive,
  pickOptions,
  pickPresentation,
  pickText,
  WHATSAPP_LIMITS,
} from './whatsapp.constants';

const CHANNEL: Channel = 'whatsapp';

export function renderMessage(
  node: FlowNode,
  data: MessageNodeData,
  context: RenderContext,
): RenderResult {
  const text = pickText(data);
  return {
    nextNodeId: findNextNodeId(node.id, context.flow.edges),
    waitingForUser: false,
    sideEffects: [
      {
        kind: 'sendMessage',
        channel: CHANNEL,
        to: context.session.phoneNumber,
        payload: { kind: 'text', body: text },
      },
    ],
  };
}

export function renderInteractive(
  _node: FlowNode,
  data: InteractiveNodeData,
  context: RenderContext,
): RenderResult {
  const options = pickOptions(data);
  const bodyText = data.prompt ?? data.bodyText ?? '';
  const footerText = data.footer ?? data.footerText;
  const preferred = pickPresentation(data);

  const useList =
    preferred === 'list' ||
    options.length > WHATSAPP_LIMITS.MAX_BUTTONS ||
    options.some((o) => typeof o.description === 'string' && o.description.length > 0);

  const interactive: WhatsAppInteractiveMessage = useList
    ? buildListInteractive(bodyText, options, footerText)
    : buildButtonInteractive(bodyText, options, footerText);

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

export function renderTemplate(
  node: FlowNode,
  data: TemplateNodeData,
  context: RenderContext,
): RenderResult {
  const key = data.key ?? data.templateName ?? '';
  const language = data.language ?? 'en';
  const variables = data.variables ?? {};

  // Phase 1 template resolution is name-pass-through. A real template-store
  // lookup lands in Phase 1β (Decision #8 of the design doc).
  const template = {
    name: key,
    language: { code: language },
    components: Object.entries(variables).map(([, value]) => ({
      type: 'body' as const,
      parameters: [{ type: 'text' as const, text: value }],
    })),
  };

  return {
    nextNodeId: findNextNodeId(node.id, context.flow.edges),
    waitingForUser: false,
    sideEffects: [
      {
        kind: 'sendMessage',
        channel: CHANNEL,
        to: context.session.phoneNumber,
        payload: { kind: 'template', template },
      },
    ],
  };
}

// Form/flow-node renderers split to ./whatsapp.io-nodes.forms.ts (size cap);
// re-exported so importers keep the ./whatsapp.io-nodes.js path.
export * from './whatsapp.io-nodes.forms.js';
