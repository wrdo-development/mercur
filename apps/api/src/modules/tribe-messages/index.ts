import { Module } from '@medusajs/framework/utils';

import TribeMessagesModuleService from './service';

export const TRIBE_MESSAGES_MODULE = 'tribe_messages';

export default Module(TRIBE_MESSAGES_MODULE, {
  service: TribeMessagesModuleService,
});

// Spine API consumers (store routes) wire these together (WRDO-180, Task 8).
export {
  type AppendMessageInput,
  type Channel,
  type MessageRecord,
  type Sender,
  ThreadService,
  type ThreadServiceDirectory,
  type ThreadRecord,
} from './thread.service';
export {
  type ChannelRenderer,
  type ReplyAction,
  WebRenderer,
  type WebPayload,
  WhatsAppRenderer,
  type WhatsAppPayload,
  type WrdoReply,
} from './renderers/channel-renderer';
export {
  createWebTokenService,
  type WebTokenKv,
  type WebTokenService,
  type WebTokenServiceOptions,
} from './web-token';
