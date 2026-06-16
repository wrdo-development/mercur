/**
 * WhatsApp Cloud API outgoing message types (sending to user).
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 */

// ──────────────────────────────────────────────
// Outgoing Message Types (sending to user)
// ──────────────────────────────────────────────

export interface WhatsAppOutgoingMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text' | 'template' | 'interactive' | 'image' | 'document' | 'location';
  text?: {
    preview_url?: boolean;
    body: string;
  };
  template?: WhatsAppTemplateMessage;
  interactive?: WhatsAppInteractiveMessage;
}

export interface WhatsAppTemplateMessage {
  name: string;
  language: {
    code: string;
  };
  components?: WhatsAppTemplateComponent[];
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: Array<{
    type: 'text' | 'image' | 'document';
    text?: string;
    image?: { link: string };
  }>;
}

export interface WhatsAppInteractiveMessage {
  type: 'button' | 'list' | 'flow';
  header?: {
    type: 'text';
    text: string;
  };
  body: {
    text: string;
  };
  footer?: {
    text: string;
  };
  action: WhatsAppInteractiveAction;
}

export interface WhatsAppInteractiveAction {
  buttons?: Array<{
    type: 'reply';
    reply: {
      id: string;
      title: string;
    };
  }>;
  button?: string;
  sections?: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
  /**
   * Native Flow interactive action payload. Required when `type === 'flow'`.
   *
   * @see https://developers.facebook.com/docs/whatsapp/flows/reference/sendflowmessage
   */
  name?: 'flow';
  parameters?: WhatsAppFlowActionParameters;
}

export interface WhatsAppFlowActionParameters {
  /** Idempotency key from the sender. UUID recommended. */
  flow_token: string;
  /** Meta-issued Flow ID, OR `flow_name` (one or the other). */
  flow_id?: string;
  flow_name?: string;
  /** Either "draft" (preview) or "published" (live). */
  flow_message_version: '3';
  /** Either "navigate" (open a screen) or "data_exchange" (run endpoint). */
  flow_action: 'navigate' | 'data_exchange';
  flow_cta: string;
  flow_action_payload?: {
    screen: string;
    data?: Record<string, unknown>;
  };
  mode?: 'draft' | 'published';
}
