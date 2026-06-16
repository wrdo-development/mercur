/**
 * Flow-engine per-node-data types — the BaseNodeData contract, every
 * concrete node-type's data interface, and the FlowNodeData union.
 * Split from flow-engine.types.ts (200-line cap); re-exported from there.
 */

import type { ChannelConstraints, FallbackPolicy, FlowNodeType } from './flow-engine.types';
import type { Channel } from './renderer/channel-renderer.types';

// ────────────────────────────────────────────────────────────────────────────
// Per-node-type intent payloads
//
// Each interface carries:
//   - intent fields   (channel-agnostic content)
//   - `constraints`?  (per-channel limits — advisory)
//   - `fallback`?     (degraded path when a renderer can't natively render)
//
// Plus `type` and `label` to match the base FlowNodeData shape.
// ────────────────────────────────────────────────────────────────────────────

interface BaseNodeData {
  type: FlowNodeType;
  label: string;
  constraints?: ChannelConstraints;
  fallback?: FallbackPolicy;
  /** Optional per-node channel allowlist. Empty/undefined = all channels. */
  channels?: Channel[];
  /** Catch-all for v1 fields (the legacy executor still reads these). */
  [key: string]: unknown;
}

/** `message` — send text and optional media. No reply expected to advance. */
export interface MessageNodeData extends BaseNodeData {
  type: 'message' | 'wa-message';
  /** Channel-agnostic body text. v1 `messageText` is mirrored here for compat. */
  text?: string;
  /** Legacy v1 field — mirrored from `text` if not provided. */
  messageText?: string;
  media?: {
    kind: 'image' | 'audio' | 'video' | 'document';
    url: string;
    caption?: string;
  };
}

export interface InteractiveOption {
  /** Routes the outgoing edge by `label`. */
  id: string;
  /** User-facing button / row label. */
  title: string;
  description?: string;
}

/** `interactive` — ask user to pick one of N options. Pause until reply. */
export interface InteractiveNodeData extends BaseNodeData {
  type: 'interactive' | 'wa-interactive';
  prompt?: string;
  /** Legacy v1 field — used when `prompt` is absent. */
  bodyText?: string;
  options?: InteractiveOption[];
  /** Legacy v1 field — used when `options` is absent. */
  buttons?: InteractiveOption[];
  /** Renderer hint. Renderer may override based on channel limits. */
  preferredPresentation?: 'buttons' | 'list' | 'quick-reply';
  /** Legacy v1 alias for `preferredPresentation`. */
  interactiveType?: 'button' | 'list' | 'quick-reply';
  footer?: string;
  footerText?: string;
  /** Where to stash the user's choice in session context. */
  contextKey?: string;
}

/** `template` — send a pre-registered template message. */
export interface TemplateNodeData extends BaseNodeData {
  type: 'template' | 'wa-template';
  /** Channel-agnostic template identifier. Renderer resolves to channel-native template. */
  key?: string;
  /** Legacy v1 field — used when `key` is absent. */
  templateName?: string;
  language?: string;
  variables?: Record<string, string>;
}

export interface RichFormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multi-select' | 'checkbox';
  required?: boolean;
  /** Options for select / multi-select. */
  options?: string[];
}

/** `rich-form` — multi-step structured form. Each channel renders natively. */
export interface RichFormNodeData extends BaseNodeData {
  type: 'rich-form';
  title: string;
  description?: string;
  fields: RichFormField[];
  submitLabel?: string;
}

/**
 * `wa-native-flow` — channel-specific escape hatch for Meta Native Flows.
 *
 * WhatsApp authors who need Meta's screen-based UI use this directly. Other
 * channels (Telegram, Messenger, web) will not render this node; they should
 * be routed around it with a `condition` or by setting `channels: ['whatsapp']`.
 */
export interface WaNativeFlowNodeData extends BaseNodeData {
  type: 'wa-native-flow';
  flowId?: string;
  flowName?: string;
  flowCta: string;
  bodyText?: string;
  headerText?: string;
  footerText?: string;
  /** `'data_exchange'` (default) or `'navigate'`. */
  flowAction?: 'data_exchange' | 'navigate';
  /** `'published'` (default) or `'draft'`. */
  flowMode?: 'published' | 'draft';
  flowScreen?: string;
  flowData?: Record<string, unknown>;
}

/** `external-handoff` — send user to a hosted page on wrdo.co.za. */
export interface ExternalHandoffNodeData extends BaseNodeData {
  type: 'external-handoff' | 'web-handoff';
  pageType?: string;
  /** Legacy v1 alias for `pageType`. */
  webPageType?: string;
  messageText?: string;
  timeoutMinutes?: number;
}

/** `condition` — branch on session context. Channel-agnostic. */
export interface ConditionNodeData extends BaseNodeData {
  type: 'condition';
  contextKey: string;
  operator: 'exists' | 'not_exists' | 'eq' | 'neq' | 'contains' | 'gt' | 'lt';
  compareValue?: unknown;
  trueBranchLabel?: string;
  falseBranchLabel?: string;
}

/** `action` — execute a side-effect via the action registry. */
export interface ActionNodeData extends BaseNodeData {
  type: 'action';
  /** Registry key — must exist in tribe-api's ActionRegistry at flow-publish time. */
  handler: string;
  params?: Record<string, unknown>;
}

/** `end` — terminate the session successfully. */
export interface EndNodeData extends BaseNodeData {
  type: 'end';
  successMessage?: string;
}

/** `error` — terminate the session with an error message. */
export interface ErrorNodeData extends BaseNodeData {
  type: 'error';
  errorMessage?: string;
}

/**
 * Discriminated union over `type`. Callers that already know a node's type can
 * narrow safely; callers that don't can keep using the `FlowNodeData` alias
 * below, which is the union itself.
 */
export type FlowNodeData =
  | MessageNodeData
  | InteractiveNodeData
  | TemplateNodeData
  | RichFormNodeData
  | WaNativeFlowNodeData
  | ExternalHandoffNodeData
  | ConditionNodeData
  | ActionNodeData
  | EndNodeData
  | ErrorNodeData;
