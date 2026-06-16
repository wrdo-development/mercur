/**
 * WhatsAppRenderer — implements {@link ChannelRenderer} for `channel = 'whatsapp'`.
 *
 * The class itself is a thin dispatcher: each node type's translation lives
 * in a dedicated module under `./whatsapp/`. Keeping the class small means
 * we never blow past the 300-line-per-file structural rule as more node
 * types are added in later phases.
 *
 * The renderer is pure: it never performs IO itself, it emits `SideEffect`s
 * that the executor dispatches. This keeps it trivially unit-testable — see
 * `tests/unit/whatsapp/flow-engine/renderer/whatsapp.renderer.test.ts`.
 */

import type { ActionRegistry } from '../actions/registry';
import type { FlowNode } from '../flow-engine.types';
import type {
  Channel,
  ChannelRenderer,
  RenderContext,
  RenderResult,
} from './channel-renderer.types';
import {
  renderExternalHandoff,
  renderInteractive,
  renderMessage,
  renderRichForm,
  renderTemplate,
  renderWaNativeFlow,
} from './whatsapp/whatsapp.io-nodes';
import {
  renderAction,
  renderCondition,
  renderEnd,
  renderError,
} from './whatsapp/whatsapp.logic-nodes';

export { buildNativeFlowMessageFromData, WHATSAPP_LIMITS } from './whatsapp/whatsapp.constants';

export interface WhatsAppRendererOptions {
  /**
   * Action handler registry. Action nodes look up `data.handler` here at
   * render-time. Phase 1 ships with a small stub registry; real handlers
   * land in follow-up tracks.
   */
  actionRegistry: ActionRegistry;
}

export class WhatsAppRenderer implements ChannelRenderer {
  readonly channel: Channel = 'whatsapp';
  private readonly actionRegistry: ActionRegistry;

  constructor(options: WhatsAppRendererOptions) {
    this.actionRegistry = options.actionRegistry;
  }

  async render(node: FlowNode, context: RenderContext): Promise<RenderResult> {
    const { data } = node;
    switch (data.type) {
      case 'message':
      case 'wa-message':
        return Promise.resolve(renderMessage(node, data, context));
      case 'interactive':
      case 'wa-interactive':
        return Promise.resolve(renderInteractive(node, data, context));
      case 'template':
      case 'wa-template':
        return Promise.resolve(renderTemplate(node, data, context));
      case 'rich-form':
        return Promise.resolve(renderRichForm(node, data, context));
      case 'wa-native-flow':
        return Promise.resolve(renderWaNativeFlow(node, data, context));
      case 'external-handoff':
      case 'web-handoff':
        return Promise.resolve(renderExternalHandoff(node, data, context));
      case 'condition':
        return Promise.resolve(renderCondition(node, data, context));
      case 'action':
        return renderAction(node, data, context, this.actionRegistry);
      case 'end':
        return Promise.resolve(renderEnd(node, data, context));
      case 'error':
        return Promise.resolve(renderError(node, data, context));
      default:
        return Promise.resolve(unsupportedNode(data));
    }
  }
}

function unsupportedNode(data: FlowNode['data']): RenderResult {
  return {
    nextNodeId: null,
    waitingForUser: false,
    sideEffects: [
      {
        kind: 'log',
        level: 'error',
        message: `WhatsAppRenderer: unsupported node type "${data.type}"`,
      },
    ],
  };
}
