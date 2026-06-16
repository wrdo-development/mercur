/**
 * AI client types for Tribe — intent classification, response composition, and event logging.
 *
 * Heart (formerly Cave) is decommissioned (RESOLVED Q31, 2026-05-25). These types define
 * the contract that will be implemented via LiteLLM when Tribe goes live.
 *
 * TODO: implement via LiteLLM when Tribe goes live
 */

// ──────────────────────────────────────────────
// AI client endpoints
// ──────────────────────────────────────────────

/**
 * POST /ai/v1/intent
 * Detect user intent from a message.
 */
export interface IntentRequest {
  message: string;
  phone: string;
  messageType: 'text' | 'image' | 'audio' | 'location';
  conversationId?: string;
}

export interface IntentResponse {
  intent: Intent;
  confidence: number;
  entities: Record<string, string>;
  suggestedAction: string;
}

export type Intent =
  | 'book_service'
  | 'find_provider'
  | 'check_booking_status'
  | 'cancel_booking'
  | 'leave_review'
  | 'register'
  | 'ask_question'
  | 'report_issue'
  | 'greeting'
  | 'unknown';

/**
 * POST /ai/v1/compose
 * Generate WRDO's voice response.
 */
export interface ComposeRequest {
  userPhone: string;
  userMessage: string;
  intent: Intent;
  conversationContext?: ConversationContext;
  systemOverride?: string;
}

export interface ComposeResponse {
  message: string;
  tone: 'friendly' | 'empathetic' | 'urgent' | 'celebratory';
  suggestedActions?: SuggestedAction[];
  costZAR: number;
}

export interface ConversationContext {
  conversationId: string;
  messageHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  currentState?: string;
}

export interface SuggestedAction {
  type: 'button' | 'list_item';
  id: string;
  title: string;
  description?: string;
}

/**
 * GET /ai/v1/user/:phone
 * Retrieve user memory and context.
 */
export interface AiUser {
  phone: string;
  name: string | null;
  area: string | null;
  isRegistered: boolean;
  isVerified: boolean;
  bookingCount: number;
  sparksBalance: number;
  preferredProviders: string[];
  lastInteraction: string | null;
  tags: string[];
}

/**
 * POST /ai/v1/event
 * Log a business event for learning.
 */
export interface AiEvent {
  eventId: string;
  type: AiEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}

export type AiEventType =
  | 'booking.requested'
  | 'booking.confirmed'
  | 'booking.completed'
  | 'booking.cancelled'
  | 'booking.disputed'
  | 'booking.dispute_resolved'
  | 'payment.captured'
  | 'payment.refunded'
  | 'provider.declined'
  | 'provider.deactivated'
  | 'provider.registered'
  | 'provider.updated'
  | 'review.submitted'
  | 'sparks.earned'
  | 'sparks.redeemed'
  | 'user.deleted'
  | 'user.registered'
  | 'user.verified'
  | 'whatsapp.message_replied';

/**
 * POST /ai/v1/voice/transcribe
 * Transcribe a voice note.
 */
export interface TranscribeRequest {
  mediaId: string;
  mimeType: string;
  language?: string;
}

export interface TranscribeResponse {
  text: string;
  language: string;
  confidence: number;
  durationSeconds: number;
}

/**
 * POST /ai/v1/vision/analyze
 * Analyze an image.
 */
export interface VisionAnalyzeRequest {
  mediaId: string;
  mimeType: string;
  context?: string;
}

export interface VisionAnalyzeResponse {
  description: string;
  labels: string[];
  text?: string;
  isDocument: boolean;
}
