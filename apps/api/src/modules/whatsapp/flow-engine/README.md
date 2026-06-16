# Flow Engine (WhatsApp / channel-agnostic)

The flow engine walks an authored `FlowDefinition` (nodes + edges) and
drives a conversation forward on the active channel. As of Phase 1α the
engine is **channel-agnostic** at its core — the WhatsApp wire-up is one
implementation of a generic `ChannelRenderer`, and Telegram / Messenger /
web-chat renderers will plug in alongside it in later phases.

Full design rationale:
[`docs/plans/2026-05-11-channel-agnostic-flow-architecture.md`](../../../../docs/plans/2026-05-11-channel-agnostic-flow-architecture.md).

---

## File layout

```
flow-engine/
├── flow-engine.types.ts                 // FlowNode, FlowEdge, FlowDefinition, FlowNodeData union
├── flow-executor.service.ts             // Public API (executeNode, handleUserInput)
├── flow-executor.v2.ts                  // V2 path: delegate to ChannelRenderer + dispatch side-effects
├── flow-executor.legacy.ts              // V1 path: original WhatsApp-only switch (preserved verbatim)
├── flow-executor.helpers.ts             // Shared edge-walking + condition evaluation
├── web-handoff.service.ts               // Signed-JWT links to wrdo.co.za hosted pages
├── booking.flow-handler.ts              // (legacy mid-flow handler — pre-dates renderer pattern)
├── registration.flow-handler.ts         // (legacy mid-flow handler — pre-dates renderer pattern)
├── actions/
│   └── registry.ts                      // ActionRegistry + STUB_HANDLERS
├── renderer/
│   ├── channel-renderer.types.ts        // ChannelRenderer interface, RenderContext, RenderResult, SideEffect
│   ├── whatsapp.renderer.ts             // WhatsAppRenderer class (thin dispatcher)
│   └── whatsapp/
│       ├── whatsapp.constants.ts        // Meta API limits, shared helpers
│       ├── whatsapp.io-nodes.ts         // Per-node renderers: message, interactive, template, rich-form, wa-native-flow, external-handoff
│       └── whatsapp.logic-nodes.ts      // Per-node renderers: condition, action, end, error
└── meta-crypto/                         // Stream A: Meta Flows request/response encryption (DO NOT MODIFY without coordination)
```

---

## The renderer pattern

```
┌─────────────────┐    ┌──────────────────────────┐    ┌─────────────────────┐
│ FlowExecutorV2  │───▶│ ChannelRendererRegistry  │───▶│ WhatsAppRenderer    │
│ (flow-executor. │    │                          │    │ (or future          │
│  v2.ts)         │    │ .get('whatsapp') → ...   │    │  TelegramRenderer,  │
│                 │    │                          │    │  MessengerRenderer, │
│                 │    │                          │    │  WebChatRenderer)   │
└─────────────────┘    └──────────────────────────┘    └─────────────────────┘
         │                                                       │
         │                                                       ▼
         │                                          ┌────────────────────────┐
         │                                          │ RenderResult {         │
         │                                          │   nextNodeId,          │
         │                                          │   waitingForUser,      │
         │                                          │   sideEffects: [...]   │
         │                                          │ }                      │
         │                                          └────────────────────────┘
         │                                                       │
         ▼                                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Executor dispatches each SideEffect in order:                           │
│   sendMessage     → MessageSenderService.sendText / sendInteractive ... │
│   persistSession  → deps.updateSession                                  │
│   waitForWeb      → deps.setWaitingForWeb                               │
│   completeSession → deps.completeSession                                │
│   markSessionError→ deps.markSessionError                               │
│   scheduleJob     → (reserved for BullMQ in Phase 1β)                   │
│   log             → (reserved for pino in Phase 1β)                     │
└─────────────────────────────────────────────────────────────────────────┘
```

Key properties:

1. **The renderer is pure.** It does no IO. It returns a `RenderResult`
   with a list of `SideEffect`s the executor will dispatch. This makes
   the renderer trivially unit-testable — no mocks, no stubs, just assert
   the side-effect list.
2. **The executor knows nothing about channels.** It picks a renderer
   from the registry by channel name, hands it a `RenderContext`, walks
   the side-effects, and decides whether to pause (waiting for user) or
   advance.
3. **The action registry is owned at runtime.** Flow JSON stores only
   the handler key. tribe-api ships the implementation. `flow_publish`
   validates that every `action.handler` key exists in the registry
   before publishing (validator endpoint forthcoming).

---

## Feature flag

`FLOW_EXECUTOR_V2` (string, default unset).

- Unset / anything but `'true'` → legacy WhatsApp-only switch
  (`flow-executor.legacy.ts`).
- `'true'` → V2 renderer pattern.

The flag is read fresh on every `executeNode()` call so deployments can
flip it without restarting the process. Tests flip it per-test via
`process.env['FLOW_EXECUTOR_V2'] = 'true'`.

When ready to drop the legacy path:

1. Confirm V2 has been running in prod with the flag on for ≥ 1 week.
2. Delete `flow-executor.legacy.ts`.
3. Inline `executeNodeV2()` into `flow-executor.service.ts` and drop
   the feature-flag check.
4. Remove the `wa-*` / `web-handoff` legacy aliases from
   `FlowNodeType` (after migrating any remaining v1 flows in DB).

---

## How to add a new channel (forward-looking, Phase 2+)

This is the concrete sequence a future agent should follow when wiring
Telegram, Messenger, or web-chat:

### 1. Implement the renderer

Create `renderer/telegram.renderer.ts` (and optionally a
`renderer/telegram/` sub-directory mirroring the WhatsApp layout for
per-node splits). The class must:

- Implement `ChannelRenderer` (`channel-renderer.types.ts`).
- Have `channel = 'telegram' as const`.
- Map each of the 10 `FlowNodeData` variants to a `RenderResult`.
- Emit side-effects **only** — no direct IO.

Telegram-specific notes:

- `interactive` → render as `InlineKeyboardMarkup` with rows of 2-3
  buttons. Telegram allows up to 100 rows × 8 cols so the
  WhatsApp 3/10 limits don't apply.
- `template` → Telegram has no template system; expand variables
  inline and send as a plain message.
- `rich-form` → fan out as a sequence of interactive prompts (one per
  field), collecting answers into session context. No native form UI.
- `wa-native-flow` → not supported. Treat it as `skip` (advance to the
  next node) and log a warning. Authors who need this should mark the
  node `channels: ['whatsapp']` on the v2 schema.

### 2. Wire the renderer into the registry

In tribe-api's boot path (`create-pipeline.ts` or equivalent DI
container setup):

```ts
import { TelegramRenderer } from './flow-engine/renderer/telegram.renderer';
import { setV2Registries } from './flow-engine/flow-executor.service';

const channelRegistry = new ChannelRendererRegistry();
channelRegistry.register(new WhatsAppRenderer({ actionRegistry }));
channelRegistry.register(new TelegramRenderer({ actionRegistry, botClient }));
setV2Registries({ channelRegistry, actionRegistry });
```

### 3. Add the webhook intake

- `POST /webhooks/telegram` with `X-Telegram-Bot-Api-Secret-Token`
  verification.
- Parse the raw payload into one or more `InternalMessage`s (see
  Section 4 of the design doc).
- Resolve identity via the canonical resolver (Phase 1β work).
- Call `executeNode(session, node, flow, deps, { channel: 'telegram' })`.

### 4. Tests

- Per-node-type renderer tests (mirror the structure of
  `tests/unit/whatsapp/flow-engine/renderer/whatsapp.renderer.test.ts`).
- An end-to-end booking flow integration test, asserting the same
  flow walks correctly on the new channel.

---

## Action registry contract

The `ActionRegistry` (`actions/registry.ts`) is the runtime-side store
of `action` node handlers. Phase 1α ships with two stubs (`noop`,
`log`) so tests have something to call. Real handlers (e.g.
`create_booking`, `request_ride`, `compose_listing`) land in their own
follow-up tracks.

### Handler shape

```ts
type ActionHandler = (
  context: ActionHandlerContext,
) => Promise<ActionHandlerResult> | ActionHandlerResult;

interface ActionHandlerContext {
  params: Record<string, unknown>; // from the action node's `data.params`
  session: TribeSession; // live session, read-only inside the handler
  flow: FlowDefinition;
  node: FlowNode;
}

interface ActionHandlerResult {
  contextUpdate?: Partial<SessionContext>; // persisted with the node advance
  diagnostics?: Record<string, unknown>; // observability bag, not user-visible
}
```

### Registering a handler

```ts
import { ActionRegistry } from './actions/registry';

const registry = new ActionRegistry();
registry.register('create_booking', async ({ params, session }) => {
  const booking = await bookingService.create({
    userId: session.context.userId,
    serviceType: params['serviceType'] as string,
  });
  return { contextUpdate: { bookingId: booking.id } };
});
```

### Publish-time validation

`wrdo-mcp`'s `flow_publish` tool calls an admin endpoint that exposes
`ActionRegistry.getRegisteredKeys()`. The publish flow fails closed if
any `action.handler` in the submitted FlowDefinition is not in the
returned set. This keeps unknown handlers from reaching runtime and
stalling a conversation.

### Why not store the implementation in the flow JSON?

Three reasons (Section 7 Decision #9 of the design doc):

1. **Security**: secrets and business logic don't belong in
   author-editable JSON.
2. **Channel portability**: the same flow JSON drives WhatsApp,
   Telegram, web-chat. The implementation is platform-agnostic but
   needs to call platform-specific services — that's a runtime concern.
3. **Deploy coupling**: handlers ship with tribe-api, so they can be
   versioned with the rest of the API, code-reviewed, and tested.

---

## Type taxonomy quick reference

| Type               | Channel-agnostic | What it does                                                    |
| ------------------ | ---------------- | --------------------------------------------------------------- |
| `message`          | Yes              | Send text + optional media. No reply expected.                  |
| `interactive`      | Yes              | Ask user to pick one of N options.                              |
| `template`         | Yes              | Send a pre-registered template. Channel resolves the binding.   |
| `rich-form`        | Yes              | Multi-step structured form. WhatsApp uses Meta Native Flows.    |
| `external-handoff` | Yes              | Punt user to a hosted page on wrdo.co.za.                       |
| `condition`        | Yes              | Branch on session context.                                      |
| `action`           | Yes              | Run a side-effect via the action registry.                      |
| `end`              | Yes              | Terminate the session successfully.                             |
| `error`            | Yes              | Terminate the session with an error message.                    |
| `wa-native-flow`   | No (WA-only)     | Channel-specific escape hatch: dispatch a Meta-registered flow. |

Legacy v1 aliases (`wa-message`, `wa-interactive`, `wa-template`,
`web-handoff`) are still recognised by both executor paths until v1
flows are migrated to v2.
