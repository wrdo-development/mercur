/**
 * Factory to create WebhookPipelineService with env-based Redis and a (stub) AI client.
 * Used by the webhook route when WHATSAPP_MODULE is not resolved from scope.
 */

import { createAiClient } from '../../clients/ai-client/ai-client';
import { TRIBE_DIRECTORY_MODULE, listProvidersByService } from './_step1-stubs'; // Step-1: stubbed
import type { IProviderDirectory } from './_step1-stubs'; // Step-1: stubbed
import { ConversationStateService } from '../tribe-sessions/conversation-state.service';
import { DegradationService } from './degradation.service';
import {
  BookingFlowHandler,
  type FindTopProvidersOptions,
  type IBookingProviderFinder,
} from './flow-engine/booking.flow-handler';
import {
  type OnRegistrationComplete,
  RegistrationFlowHandler,
} from './flow-engine/registration.flow-handler';
import { WRDO_USER_MODULE, WrdoUserService } from '../wrdo-user';
import type { WrdoUserDirectory } from '../wrdo-user';
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

  // Resolve the wrdo_user service once from the Medusa scope (absent in contexts
  // without a container — both hooks then stay clean no-ops).
  const wrdoUserService = resolveWrdoUserService(options?.scope);

  // Persist a wrdo_user on registration completion (WRDO-179). The hook is
  // best-effort — the handler swallows throws so the friend always gets welcomed.
  // Guest-first (WRDO-180): this now PROMOTES the row born at first contact.
  const onRegistrationComplete = buildOnRegistrationComplete(wrdoUserService, whatsappLogger);

  // Guest-first (WRDO-180): birth a wrdo_user at first contact so the spine has a
  // stable user_id from message one. Best-effort + idempotent; undefined = no-op.
  const ensureGuestUser = buildEnsureGuestUser(wrdoUserService);

  const registrationFlowHandler = new RegistrationFlowHandler({
    conversationStateService,
    onRegistrationComplete,
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
    ensureGuestUser,
  });
}

/**
 * Resolve a WrdoUserService from the Medusa scope, or undefined when no scope is
 * available or the wrdo_user module isn't registered in this context (e.g. local
 * runs without a container). Centralises the resolve so both the guest-first and
 * completion hooks share one service instance.
 *
 * @param scope - Optional Medusa injection scope
 * @returns WrdoUserService, or undefined
 */
function resolveWrdoUserService(
  scope: { resolve: (key: string) => unknown } | undefined,
): WrdoUserService | undefined {
  if (scope === undefined) {
    return undefined;
  }
  try {
    const directory = scope.resolve(WRDO_USER_MODULE) as WrdoUserDirectory;
    return new WrdoUserService(directory);
  } catch {
    // Module not registered in this context — hooks stay no-ops.
    return undefined;
  }
}

/**
 * Build the guest-first persistence hook (WRDO-180). Returns undefined when no
 * wrdo_user service is available — the pipeline treats undefined as a clean
 * no-op. The hook itself is idempotent (getOrCreate only sets state on CREATE)
 * so calling it on every inbound is safe and never downgrades a 'complete' user.
 *
 * @param service - Resolved WrdoUserService, or undefined
 * @returns ensureGuestUser hook, or undefined
 */
function buildEnsureGuestUser(
  service: WrdoUserService | undefined,
): ((phone: string) => Promise<void>) | undefined {
  if (service === undefined) {
    return undefined;
  }
  return async (phone) => {
    await service.ensureGuest('whatsapp', phone);
  };
}

/**
 * Build the registration-completion persistence hook.
 *
 * Returns undefined when no wrdo_user service is available (e.g. local contexts
 * without a container) — the handler treats an undefined hook as a clean no-op.
 * Guest-first (WRDO-180): the returned hook PROMOTES the row born at first
 * contact to 'complete' (update in place), never creating a duplicate.
 *
 * @param service - Resolved WrdoUserService, or undefined
 * @param logger - Optional WhatsApp logger for failure breadcrumbs
 * @returns OnRegistrationComplete hook, or undefined
 */
function buildOnRegistrationComplete(
  service: WrdoUserService | undefined,
  logger?: WhatsappLogger,
): OnRegistrationComplete | undefined {
  if (service === undefined) {
    return undefined;
  }

  return async (data) => {
    // Guest-first (WRDO-180): the row was born 'guest' at first contact. On
    // consent we PROMOTE it to 'complete' (update in place) rather than create —
    // a returning user's spine row is lifted, never duplicated. promoteToComplete
    // resolves the row by (channel, phone), creating a guest first only if
    // ensureGuest was somehow skipped.
    await service.promoteToComplete('whatsapp', data.phone, {
      displayName: data.name ?? null,
      // Consent copy ("Terms + Privacy") is service-only; marketing consent is a
      // separate later opt-in, so default it false here.
      serviceConsent: true,
      marketingConsent: false,
      metadata: {
        role: data.role ?? null,
        interests: data.interests ?? [],
        selfieProvided: data.selfieProvided ?? false,
        locationProvided: data.locationProvided ?? false,
      },
    });
    logger?.logTiming('registration_persisted', 0);
  };
}
