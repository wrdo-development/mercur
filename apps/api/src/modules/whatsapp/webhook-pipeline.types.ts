/**
 * Types and interfaces for the webhook pipeline service.
 */

import type { IAiClient } from '../../clients/ai-client/ai-client';
import type { ConversationStateService } from '../tribe-sessions/conversation-state.service';
import type { TribeUserService } from './_step1-stubs'; // Step-1: stubbed
import type { DegradationService } from './degradation.service';
import type { FeedbackHandlerDeps } from './feedback/feedback-handler';
import type { BookingFlowHandler } from './flow-engine/booking.flow-handler';
import type { RegistrationFlowHandler } from './flow-engine/registration.flow-handler';
import type { IdempotencyService } from './idempotency.service';
import type { KillswitchService } from './killswitch.service';
import type { LanguageDetectionService } from './language-detection/language-detection.service';
import type { MessageSenderService } from './message-sender.service';
import type { WebhookHandlerService } from './webhook-handler.service';
import type { WhatsappLogger } from './whatsapp.logger';

export interface WebhookPipelineServiceOptions {
  handlerService: WebhookHandlerService;
  idempotencyService: IdempotencyService;
  killswitchService: KillswitchService;
  degradationService: DegradationService;
  messageSenderService: MessageSenderService;
  aiClient: IAiClient;
  whatsappLogger?: WhatsappLogger;
  bookingFlowHandler: BookingFlowHandler;
  registrationFlowHandler: RegistrationFlowHandler;
  conversationStateService: ConversationStateService;
  /** Language detection + confirmation nudge service (optional). */
  languageDetectionService?: LanguageDetectionService;
  /** Supabase deps for reply-to-report feedback capture (optional). Fire-and-forget. */
  feedbackHandlerDeps?: FeedbackHandlerDeps;
  /** Override system clock. Defaults to new Date(). Use in tests for deterministic timestamps. */
  nowFn?: () => Date;
  /** Persist phone↔BSUID pairing on every webhook that carries an identityPair. Best-effort; never fails message processing. */
  tribeUserService?: Pick<TribeUserService, 'updateBsuidByPhone'>;
  /**
   * Guest-first (WRDO-180): ensure a wrdo_user row exists at first contact so the
   * conversation spine has a stable user_id from message one. Called once per
   * processed inbound message. Optional + best-effort — when absent it's a clean
   * no-op, and a throw must never block the WhatsApp reply.
   */
  ensureGuestUser?: (phone: string) => Promise<void>;
  /**
   * Spine persistence (WRDO-180, Task 9): persist WhatsApp turns into the SAME
   * durable thread the web reads. Optional + best-effort — when absent it's a
   * clean no-op, and EVERY method may throw without ever blocking the WhatsApp
   * reply (the pipeline wraps each call in try/catch).
   *
   * resolveUserId maps the sender phone to the wrdo_users.id — it MUST reuse the
   * guest row already ensured by ensureGuestUser (getOrCreateByChannelIdentity is
   * idempotent) so we never create a second user. A null result means "couldn't
   * resolve" → persistence is skipped silently for that turn.
   */
  spinePersistence?: {
    resolveUserId(phone: string): Promise<string | null>;
    appendUser(userId: string, text: string, channel: 'whatsapp' | 'web'): Promise<void>;
    appendWrdo(userId: string, text: string, channel: 'whatsapp' | 'web'): Promise<void>;
  };
}
