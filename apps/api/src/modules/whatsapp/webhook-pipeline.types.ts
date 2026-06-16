/**
 * Types and interfaces for the webhook pipeline service.
 */

import type { IAiClient } from '../../clients/ai-client/ai-client';
import type { ConversationStateService } from '../tribe-sessions/conversation-state.service';
import type { TribeUserService } from '../tribe-user/tribe-user.service';
import type { DegradationService } from './degradation.service';
import type { FeedbackHandlerDeps } from './feedback/feedback-handler.js';
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
}
