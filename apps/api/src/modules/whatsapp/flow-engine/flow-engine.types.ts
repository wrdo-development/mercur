/**
 * Flow Engine — internal types for Tribe flow execution.
 *
 * The flow definition (nodes/edges) is authored upstream (flow registry) and consumed here.
 * The taxonomy is intentionally hybrid: most node types are channel-agnostic
 * (`message`, `interactive`, `template`, `rich-form`, `external-handoff`,
 * `condition`, `action`, `end`, `error`) and one is a WhatsApp-specific escape
 * hatch (`wa-native-flow`) so authors who need a Meta Native Flow can opt in
 * without going through the generic `rich-form` abstraction.
 *
 * See `docs/plans/2026-05-11-channel-agnostic-flow-architecture.md` for the
 * full design rationale (Sections 1 & 2).
 *
 * BACKWARD COMPATIBILITY: the legacy v1 union (`wa-message`, `wa-interactive`,
 * `wa-template`, `web-handoff`) is still recognised at the union level. The
 * legacy `flow-executor` switch keeps walking those node types until v1 flows
 * are migrated. The V2 renderer-pattern path only fires when the feature flag
 * `FLOW_EXECUTOR_V2` is enabled (see flow-executor.service.ts).
 */
import type { Channel } from './renderer/channel-renderer.types';

/**
 * Hybrid taxonomy.
 *
 * Channel-agnostic (renderable on any channel via a `ChannelRenderer`):
 *   - `message`           — send content to the user, no reply expected
 *   - `interactive`       — ask the user to pick one of N options
 *   - `template`          — send a pre-registered template (channel resolves the binding)
 *   - `rich-form`         — multi-step structured form rendered natively per channel
 *   - `external-handoff`  — punt the user to a hosted URL on wrdo.co.za
 *
 * Pure-logic (rendered by the executor itself, not the renderer):
 *   - `condition` — branch on session context
 *   - `action`    — execute a side-effect via the action registry
 *   - `end`       — terminate the session successfully
 *   - `error`     — terminate the session with an error message
 *
 * Channel-specific escape hatches:
 *   - `wa-native-flow` — dispatch a Meta-registered WhatsApp Native Flow.
 *                       Coexists with `rich-form`: authors who need Meta's
 *                       screen UI use this; everyone else uses `rich-form`.
 *
 * Legacy aliases (read-only — kept until v1 flows are migrated). The V2
 * executor path does NOT support these; the legacy switch in
 * `flow-executor.service.ts` still does.
 */
export type FlowNodeType =
  // V2 channel-agnostic
  | 'message'
  | 'interactive'
  | 'template'
  | 'rich-form'
  | 'external-handoff'
  // V2 pure-logic
  | 'condition'
  | 'action'
  | 'end'
  | 'error'
  // V2 channel-specific escape hatch
  | 'wa-native-flow'
  // Legacy v1 aliases (deprecated — still walked by the legacy executor path)
  | 'wa-message'
  | 'wa-interactive'
  | 'wa-template'
  | 'web-handoff';

export interface FlowNodePosition {
  x: number;
  y: number;
}

/**
 * Per-channel constraints. Advisory — the renderer chooses what to do when a
 * constraint is exceeded (split, degrade, hand off). Only WhatsApp limits are
 * populated today; Telegram / Messenger / web shapes are reserved for future
 * phases.
 */
export interface WhatsAppConstraints {
  /** Max reply buttons WhatsApp will render (Meta cap: 3). */
  maxButtons?: number;
  /** Max list rows WhatsApp will render (Meta cap: 10). */
  maxListRows?: number;
  /** Whether the message requires a template (outside the 24h customer-care window). */
  requiresTemplate?: boolean;
}

export interface ChannelConstraints {
  whatsapp?: WhatsAppConstraints;
  /** Reserved for Phase 2 — TelegramRenderer will read these. */
  telegram?: Record<string, unknown>;
  /** Reserved for Phase 3 — MessengerRenderer will read these. */
  messenger?: Record<string, unknown>;
  /** Reserved for Phase 4 — WebChatRenderer will read these. */
  web?: Record<string, unknown>;
}

/**
 * Fallback policy applied by a renderer when the active channel cannot
 * natively render the node's intent.
 *
 *  - `degrade`: render as plain text + ASCII enumerated options.
 *  - `split`:   split a long list across multiple messages.
 *  - `handoff`: punt to an external-handoff URL on wrdo.co.za.
 *  - `skip`:    skip this node and advance to next.
 */
export type FallbackKind = 'degrade' | 'split' | 'handoff' | 'skip';

export interface FallbackPolicy {
  onUnsupported: FallbackKind;
  /** Optional explicit text override used when `onUnsupported = 'degrade'`. */
  degradedText?: string;
}

// Per-node-data types live in ./flow-engine.node-data.types.ts (size cap);
// imported for the graph types below + re-exported so the public surface is unchanged.
import type { FlowNodeData } from './flow-engine.node-data.types.js';

export * from './flow-engine.node-data.types.js';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: FlowNodePosition;
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  slug: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Default fallback applied to nodes without their own. Optional. */
  defaultFallback?: FallbackPolicy;
  /** Default channel allowlist for the flow. Optional. */
  defaultChannels?: Channel[];
}

export interface FlowExecutionContext {
  session: {
    id: string;
    phoneNumber: string;
    flowId: string;
    currentNodeId: string;
    context: Record<string, unknown>;
  };
  flow: FlowDefinition;
  currentNode: FlowNode;
}
