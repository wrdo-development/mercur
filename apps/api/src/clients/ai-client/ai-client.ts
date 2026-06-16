/**
 * AI client interface for Tribe — intent classification, response composition,
 * and event logging.
 *
 * Heart is decommissioned (RESOLVED Q31, 2026-05-25). The former HeartClientImpl
 * (HTTP transport + opossum circuit breaker) has been removed. All callers now
 * receive `createAiClient()` which returns a no-op stub that gracefully degrades.
 *
 * TODO: implement via LiteLLM when Tribe goes live
 * @see https://linear.app/wrdo — track the LiteLLM integration work item
 */

import type {
  AiEvent,
  AiUser,
  ComposeRequest,
  ComposeResponse,
  IntentRequest,
  IntentResponse,
  TranscribeRequest,
  TranscribeResponse,
  VisionAnalyzeRequest,
  VisionAnalyzeResponse,
} from '../../types/ai-client.types';

// ── Contract ────────────────────────────────────────────────────────────────

export interface IAiClient {
  classifyIntent(request: IntentRequest): Promise<IntentResponse>;
  compose(request: ComposeRequest): Promise<ComposeResponse>;
  getUser(phone: string): Promise<AiUser | null>;
  logEvent(event: AiEvent): Promise<void>;
  transcribeVoice(request: TranscribeRequest): Promise<TranscribeResponse>;
  analyzeImage(request: VisionAnalyzeRequest): Promise<VisionAnalyzeResponse>;
  isHealthy(): Promise<boolean>;
}

// ── Stub fallback responses (match former circuit-breaker fallbacks) ─────────

const STUB_FALLBACK_MESSAGE = "I'm having a moment — give me a sec to recover! 🙏";

const INTENT_FALLBACK: IntentResponse = {
  intent: 'unknown',
  confidence: 0,
  entities: {},
  suggestedAction: 'none',
};

const COMPOSE_FALLBACK: ComposeResponse = {
  message: STUB_FALLBACK_MESSAGE,
  tone: 'friendly',
  costZAR: 0,
};

// ── Stub implementation ──────────────────────────────────────────────────────

/**
 * Stub AI client used while Heart is decommissioned and LiteLLM is not yet wired.
 *
 * - classifyIntent: returns `intent: 'unknown'` (same as old circuit-breaker fallback)
 * - compose: returns the friendly fallback message (same as old circuit-breaker fallback)
 * - logEvent: no-op (fire-and-forget callers ignore failures anyway)
 * - getUser: returns null
 * - transcribeVoice / analyzeImage: throw — callers must handle gracefully
 * - isHealthy: returns false (honest — no backend is wired)
 *
 * TODO: replace with LiteLLM transport when Tribe goes live
 */
class AiClientStub implements IAiClient {
  classifyIntent(_request: IntentRequest): Promise<IntentResponse> {
    // TODO: implement via LiteLLM when Tribe goes live
    return Promise.resolve(INTENT_FALLBACK);
  }

  compose(_request: ComposeRequest): Promise<ComposeResponse> {
    // TODO: implement via LiteLLM when Tribe goes live
    return Promise.resolve(COMPOSE_FALLBACK);
  }

  getUser(_phone: string): Promise<AiUser | null> {
    // TODO: implement via LiteLLM / Supabase when Tribe goes live
    return Promise.resolve(null);
  }

  logEvent(_event: AiEvent): Promise<void> {
    // TODO: implement via event pipeline when Tribe goes live
    // No-op — fire-and-forget callers catch and swallow errors anyway
    return Promise.resolve();
  }

  transcribeVoice(_request: TranscribeRequest): Promise<TranscribeResponse> {
    // TODO: implement via LiteLLM when Tribe goes live
    return Promise.reject(
      new Error('AiClientStub: transcribeVoice not yet implemented (Heart decommissioned)'),
    );
  }

  analyzeImage(_request: VisionAnalyzeRequest): Promise<VisionAnalyzeResponse> {
    // TODO: implement via LiteLLM when Tribe goes live
    return Promise.reject(
      new Error('AiClientStub: analyzeImage not yet implemented (Heart decommissioned)'),
    );
  }

  isHealthy(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an AI client.
 *
 * Currently returns a stub while Heart is decommissioned and LiteLLM integration
 * is pending. The stub gracefully degrades — intent falls back to 'unknown',
 * compose returns a friendly error message, logEvent is a no-op.
 *
 * TODO: wire LiteLLM transport here when Tribe goes live
 */
export function createAiClient(): IAiClient {
  return new AiClientStub();
}
