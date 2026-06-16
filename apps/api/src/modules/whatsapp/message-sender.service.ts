/**
 * Sends messages to users via WhatsApp Cloud API.
 * Uses WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.
 * Retries up to 3 times with exponential backoff.
 */

import type {
  WhatsAppInteractiveMessage,
  WhatsAppOutgoingMessage,
  WhatsAppTemplateMessage,
} from '../../types/whatsapp.types';

const CLOUD_API_BASE = 'https://graph.facebook.com/v21';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export interface MessageSenderOptions {
  accessToken?: string;
  phoneNumberId?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** Meta API error code when success is false. */
  errorCode?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * DI-injectable service for sending WhatsApp messages via Cloud API.
 * Constructor takes no parameters to avoid awilix attempting to resolve
 * 'accessToken' as a named container registration.
 */
export class MessageSenderService {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor() {
    this.accessToken = process.env['WHATSAPP_ACCESS_TOKEN'] ?? '';
    this.phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'] ?? '';
  }

  /**
   * Send a text message to a phone number.
   *
   * @param to - E.164 phone number (e.g. 27821111111)
   * @param body - Message text
   * @param previewUrl - Whether to show link preview
   * @returns Result with success and optional messageId or error
   */
  async sendText(to: string, body: string, previewUrl = false): Promise<SendMessageResult> {
    const message: WhatsAppOutgoingMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replaceAll(/\D/g, ''),
      type: 'text',
      text: { body, preview_url: previewUrl },
    };
    return this.send(message);
  }

  /**
   * Send a template message (for outside 24h window).
   *
   * @param to - E.164 phone number
   * @param template - Template name and optional components
   * @param languageCode - BCP-47 language code (e.g. en)
   * @returns Result with success and optional messageId or error
   */
  async sendTemplate(
    to: string,
    template: WhatsAppTemplateMessage,
    _languageCode = 'en',
  ): Promise<SendMessageResult> {
    const message: WhatsAppOutgoingMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replaceAll(/\D/g, ''),
      type: 'template',
      template: {
        ...template,
        language: template.language,
      },
    };
    return this.send(message);
  }

  /**
   * Send an interactive message (buttons or list).
   *
   * @param to - E.164 phone number
   * @param interactive - Interactive message payload
   * @returns Result with success and optional messageId or error
   */
  async sendInteractive(
    to: string,
    interactive: WhatsAppInteractiveMessage,
  ): Promise<SendMessageResult> {
    const message: WhatsAppOutgoingMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replaceAll(/\D/g, ''),
      type: 'interactive',
      interactive,
    };
    return this.send(message);
  }

  /**
   * Send a raw outgoing message (generic).
   *
   * @param message - Full WhatsAppOutgoingMessage
   * @returns Result with success and optional messageId or error
   */
  async send(message: WhatsAppOutgoingMessage): Promise<SendMessageResult> {
    const url = `${CLOUD_API_BASE}/${this.phoneNumberId}/messages`;
    let lastError: string | undefined;
    let lastErrorCode: number | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
        if (attempt > 0) {
          await sleep(backoff);
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        const data = (await response.json()) as {
          messages?: Array<{ id: string }>;
          error?: { message: string; code?: number };
        };

        if (!response.ok) {
          lastError = data.error?.message ?? `HTTP ${String(response.status)}`;
          lastErrorCode = data.error?.code;
          continue;
        }

        const messageId = data.messages?.[0]?.id;
        return { success: true, messageId };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return { success: false, error: lastError, errorCode: lastErrorCode };
  }
}
