/**
 * Factory to create WebhookPipelineService with env-based Redis and a (stub) AI client.
 * Used by the webhook route when WHATSAPP_MODULE is not resolved from scope.
 */

import { createAiClient } from '../../clients/ai-client/ai-client';
import { TRIBE_DIRECTORY_MODULE } from '../tribe-directory';
import { listProvidersByService } from '../tribe-directory/provider.repository';
import type { IProviderDirectory } from '../tribe-directory/provider.types';
import { ConversationStateService } from '../tribe-sessions/conversation-state.service';
import { DegradationService } from './degradation.service';
import {
  BookingFlowHandler,
  type FindTopProvidersOptions,
  type IBookingProviderFinder,
} from './flow-engine/booking.flow-handler';
import { RegistrationFlowHandler } from './flow-engine/registration.flow-handler';
import { IdempotencyService } from './idempotency.service';
import { KillswitchService } from './killswitch.service';
import { createLanguageProfileStore, LanguageDetectionService } from './language-detection/index';
import { MessageSenderService } from './message-sender.service';
import { createRedisAdapter } from './redis-adapter';
import { WebhookHandlerService } from './webhook-handler.service';
import { WebhookPipelineService } from './webhook-pipeline.service';
import { type LoggerLike, WhatsappLogger } from './whatsapp.logger';

export interface CreateWebhookPipelineOptions {
  /** Base logger (e.g. Medusa ContainerRegistrationKeys.LOGGER). When omitted, no WhatsApp logging. */
  logger?: LoggerLike;
  /** Medusa injection scope */
  scope?: { resolve: (key: string) => unknown };
}

/**
 * Create a webhook pipeline with Redis from REDIS_URL and a stub AI client (Heart is decommissioned).
 * Safe to call multiple times; Redis adapter is shared.
 *
 * @param options - Optional logger for WhatsApp-layer logging
 * @returns WebhookPipelineService
 */
export function createWebhookPipeline(
  options?: CreateWebhookPipelineOptions,
): WebhookPipelineService {
  const redis = createRedisAdapter();
  const languageProfileStore = createLanguageProfileStore(redis);
  const languageDetectionService = new LanguageDetectionService({ store: languageProfileStore });
  const handlerService = new WebhookHandlerService();
  const idempotencyService = new IdempotencyService({ redis });
  const killswitchService = new KillswitchService();
  const degradationService = new DegradationService();
  const messageSenderService = new MessageSenderService();
  // TODO: implement via LiteLLM when Tribe goes live — Heart is decommissioned (RESOLVED Q31)
  const aiClient = createAiClient();
  const whatsappLogger = options?.logger
    ? new WhatsappLogger({ logger: options.logger })
    : undefined;

  const conversationStateService = new ConversationStateService({ redis });

  const providerFinder: IBookingProviderFinder = {
    async findTopProviders(finderOptions: FindTopProvidersOptions) {
      if (options?.scope === undefined) {
        return [];
      }
      try {
        const directory = options.scope.resolve(TRIBE_DIRECTORY_MODULE) as IProviderDirectory;
        const result = await listProvidersByService(
          directory,
          {
            area: finderOptions.areaId,
            category: finderOptions.serviceTypeInput, // Best effort guess using user input as category name for now
            is_active: true,
          },
          {
            take: finderOptions.limit,
          },
        );
        interface RawProvider {
          id: string;
          user?: { first_name?: string; last_name?: string };
          category?: unknown;
          rating_average?: number;
        }
        return result.map((pRaw: unknown) => {
          const p = pRaw as RawProvider;
          return {
            id: p.id,
            name:
              typeof p.user?.first_name === 'string' && p.user.first_name !== ''
                ? `${p.user.first_name} ${typeof p.user.last_name === 'string' ? p.user.last_name : ''}`.trim()
                : 'Provider',
            category: typeof p.category === 'string' ? p.category : 'Service',
            average_rating: typeof p.rating_average === 'number' ? p.rating_average : undefined,
          };
        });
      } catch (err) {
        if (whatsappLogger) {
          whatsappLogger.logFailedSend(
            'directory_error',
            err instanceof Error ? err.message : 'Unknown error',
          );
        }
        return [];
      }
    },
  };

  const bookingFlowHandler = new BookingFlowHandler({
    conversationStateService,
    pendingBookingRedis: redis,
    providerFinder,
    // eslint-disable-next-line @typescript-eslint/require-await
    getAreaForResident: async (_phone: string) => {
      // Stub area fetching logic until real Supabase integration handles radius/postcode logic
      return 'TestArea';
    },
  });

  const registrationFlowHandler = new RegistrationFlowHandler({
    conversationStateService,
  });

  const feedbackHandlerDeps =
    process.env['SUPABASE_URL'] !== undefined && process.env['SUPABASE_SECRET_KEY'] !== undefined
      ? {
          supabaseUrl: process.env['SUPABASE_URL'],
          supabaseKey: process.env['SUPABASE_SECRET_KEY'],
          // TODO(phase-3): wire message_logs lookup so quoted_msg_body is populated
          getMessageBody: (_id: string): Promise<string | null> => Promise.resolve(null),
        }
      : undefined;

  // TODO(WRDO-169): inject TribeUserService once module wiring allows.
  // createWebhookPipeline receives only an optional Medusa scope, not a full DI
  // container — PgConnection is not available here without structural change.
  // tribeUserService is an optional dep, so omitting it is a clean no-op.

  return new WebhookPipelineService({
    handlerService,
    idempotencyService,
    killswitchService,
    degradationService,
    messageSenderService,
    aiClient,
    whatsappLogger,
    bookingFlowHandler,
    registrationFlowHandler,
    conversationStateService,
    languageDetectionService,
    feedbackHandlerDeps,
  });
}
