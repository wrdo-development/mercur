/**
 * Tribe API — WhatsApp Flow execution types
 * Session state machine + web handoff contracts
 */

// ─── Session ──────────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'active' // Bot is handling the session
  | 'waiting_web' // Waiting for user to complete a web handoff step
  | 'completed' // Session ended normally
  | 'abandoned' // Session timed out or was explicitly abandoned
  | 'error'; // Session ended due to unrecoverable error

export interface TribeSession {
  id: string;
  phoneNumber: string;
  flowId: string;
  currentNodeId: string;
  context: SessionContext;
  webToken: string | null;
  webTokenExpiresAt: string | null;
  status: SessionStatus;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  expiresAt: string;
}

/**
 * Accumulated data collected throughout the session.
 * Grows as nodes execute and the user provides information.
 */
export interface SessionContext {
  // Identity
  phoneNumber: string;
  userId?: string;
  userName?: string;

  // Booking context (populated by booking-related flows)
  serviceCategory?: string;
  serviceDescription?: string;
  preferredDate?: string;
  preferredTime?: string;
  locationLat?: number;
  locationLng?: number;
  locationDescription?: string;
  bookingId?: string;
  providerId?: string;
  providerName?: string;

  // Payment context
  quoteAmount?: number;
  quoteCurrency?: string;
  paymentSessionId?: string;
  paymentStatus?: 'pending' | 'paid' | 'failed';

  // Verification context
  selfieVerified?: boolean;
  documentVerified?: boolean;

  // Feedback context
  rating?: number;
  feedbackText?: string;

  // Flow navigation
  lastUserInput?: string;
  lastButtonId?: string;
  errorCount?: number;

  // Arbitrary additional keys from web handoff and action nodes
  [key: string]: unknown;
}

// ─── Web Handoff ──────────────────────────────────────────────────────────────

export interface WebHandoffTokenClaims {
  sessionId: string;
  nodeId: string;
  phoneNumber: string;
  pageType: string;
  iat: number;
  exp: number;
}

export interface WebHandoffCompleteRequest {
  token: string;
  data: Record<string, unknown>;
}

export interface WebHandoffCompleteResponse {
  success: boolean;
  message: string;
}

// ─── Flow Execution ───────────────────────────────────────────────────────────

export interface FlowExecutionResult {
  success: boolean;
  nextNodeId: string | null;
  messageSent: boolean;
  sessionStatus: SessionStatus;
  error?: string;
}

export interface WebHandoffLinkMessage {
  token: string;
  url: string;
  expiresAt: Date;
  messageText: string;
}
