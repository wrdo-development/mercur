/**
 * WhatsApp Cloud API webhook payload types -- barrel re-export.
 *
 * Based on Meta's WhatsApp Business Platform Cloud API.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

// -- Incoming webhook + message types
export type {
  WhatsAppButtonContent,
  WhatsAppChange,
  WhatsAppChangeValue,
  WhatsAppContact,
  WhatsAppContactContent,
  WhatsAppDocumentContent,
  WhatsAppEntry,
  WhatsAppError,
  WhatsAppInteractiveContent,
  WhatsAppLocationContent,
  WhatsAppMediaContent,
  WhatsAppMessage,
  WhatsAppMessageContext,
  WhatsAppMessageType,
  WhatsAppMetadata,
  WhatsAppReactionContent,
  WhatsAppStatus,
  WhatsAppStatusType,
  WhatsAppTextContent,
  WhatsAppWebhookPayload,
} from './whatsapp.incoming.types';

// -- Outgoing message types
export type {
  WhatsAppFlowActionParameters,
  WhatsAppInteractiveAction,
  WhatsAppInteractiveMessage,
  WhatsAppOutgoingMessage,
  WhatsAppTemplateComponent,
  WhatsAppTemplateMessage,
} from './whatsapp.outgoing.types';
