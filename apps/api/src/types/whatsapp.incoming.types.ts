/**
 * WhatsApp Cloud API incoming webhook payload types.
 *
 * Based on Meta's WhatsApp Business Platform Cloud API.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

// ──────────────────────────────────────────────
// Webhook Payload (incoming from Meta)
// ──────────────────────────────────────────────

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field: 'messages';
}

export interface WhatsAppChangeValue {
  messaging_product: 'whatsapp';
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
  errors?: WhatsAppError[];
}

export interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WhatsAppContact {
  profile: {
    name: string;
  };
  /**
   * Meta-issued WhatsApp account ID (E.164 phone, no +).
   *
   * From 2026-06 onwards Meta is gradually replacing `wa_id` with `user_id`
   * (the Business Solution User Identifier / BSUID). For now we accept both
   * and prefer `user_id` when present.
   *
   * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/migrate-to-business-solution-user-identifier
   */
  wa_id?: string;
  user_id?: string;
}

// ──────────────────────────────────────────────
// Incoming Message Types
// ──────────────────────────────────────────────

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
  | 'reaction'
  | 'sticker'
  | 'order'
  | 'unknown';

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: WhatsAppMessageType;
  text?: WhatsAppTextContent;
  image?: WhatsAppMediaContent;
  audio?: WhatsAppMediaContent;
  video?: WhatsAppMediaContent;
  document?: WhatsAppDocumentContent;
  location?: WhatsAppLocationContent;
  contacts?: WhatsAppContactContent[];
  interactive?: WhatsAppInteractiveContent;
  button?: WhatsAppButtonContent;
  reaction?: WhatsAppReactionContent;
  sticker?: WhatsAppMediaContent;
  context?: WhatsAppMessageContext;
}

export interface WhatsAppTextContent {
  body: string;
}

export interface WhatsAppMediaContent {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppDocumentContent extends WhatsAppMediaContent {
  filename: string;
}

export interface WhatsAppLocationContent {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WhatsAppContactContent {
  name: {
    formatted_name: string;
    first_name?: string;
    last_name?: string;
  };
  phones?: Array<{
    phone: string;
    type: string;
    wa_id?: string;
  }>;
}

export interface WhatsAppInteractiveContent {
  type: 'button_reply' | 'list_reply';
  button_reply?: {
    id: string;
    title: string;
  };
  list_reply?: {
    id: string;
    title: string;
    description?: string;
  };
}

export interface WhatsAppButtonContent {
  text: string;
  payload: string;
}

export interface WhatsAppReactionContent {
  message_id: string;
  emoji: string;
}

export interface WhatsAppMessageContext {
  message_id: string;
  from: string;
}

// ──────────────────────────────────────────────
// Message Status Updates
// ──────────────────────────────────────────────

export type WhatsAppStatusType = 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppStatus {
  id: string;
  status: WhatsAppStatusType;
  timestamp: string;
  recipient_id: string;
  errors?: WhatsAppError[];
}

export interface WhatsAppError {
  code: number;
  title: string;
  message: string;
  error_data?: {
    details: string;
  };
}
