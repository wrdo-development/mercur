/**
 * WhatsApp-layer logger wrapping the existing logger service.
 * All entries tagged { source: 'whatsapp', env }.
 * Must NOT use console.log.
 */

export interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const BASE_META = {
  source: 'whatsapp' as const,
  env: process.env.NODE_ENV ?? 'development',
};

export interface WhatsappLoggerOptions {
  logger: LoggerLike;
}

/**
 * Dedicated logger for WhatsApp-layer events.
 *
 * @param options - Must include base logger (e.g. Medusa ContainerRegistrationKeys.LOGGER)
 */
export class WhatsappLogger {
  private readonly logger: LoggerLike;

  constructor(options: WhatsappLoggerOptions) {
    this.logger = options.logger;
  }

  private meta(extra: Record<string, unknown>): Record<string, unknown> {
    return { ...BASE_META, ...extra };
  }

  /**
   * Log webhook parse errors (invalid payload structure).
   * Phone and messageId are redacted.
   *
   * @param reason - Why parsing failed
   * @param redactedPhone - Redacted phone (e.g. ***1111)
   * @param redactedMessageId - Redacted messageId (e.g. ***abc)
   */
  logParseError(reason: string, redactedPhone?: string, redactedMessageId?: string): void {
    this.logger.warn(
      'Webhook parse error',
      this.meta({
        reason,
        ...(redactedPhone !== undefined && { phoneRedacted: redactedPhone }),
        ...(redactedMessageId !== undefined && { messageIdRedacted: redactedMessageId }),
      }),
    );
  }

  /**
   * Log failed WhatsApp sends (non-2xx from Meta API).
   *
   * @param templateName - Template name if sending template
   * @param errorCode - Meta error code
   * @param errorMessage - Error message
   */
  logFailedSend(errorCode: string | number, errorMessage: string, templateName?: string): void {
    this.logger.error(
      'WhatsApp send failed',
      this.meta({
        templateName,
        errorCode,
        errorMessage,
      }),
    );
  }

  /**
   * Log booking state transitions triggered by WhatsApp.
   *
   * @param state - New state
   * @param bookingId - Booking ID
   * @param triggeredBy - 'resident' | 'provider'
   */
  logBookingTransition(
    state: string,
    bookingId: string,
    triggeredBy: 'resident' | 'provider',
  ): void {
    this.logger.info(
      'Booking state transition',
      this.meta({
        state,
        bookingId,
        triggeredBy,
      }),
    );
  }

  /**
   * Log idempotency cache hits (duplicate messageId skipped).
   *
   * @param messageIdRedacted - Redacted messageId
   */
  logIdempotencyHit(messageIdRedacted: string): void {
    this.logger.info(
      'Duplicate messageId skipped (idempotency)',
      this.meta({
        messageIdRedacted,
      }),
    );
  }

  /**
   * Log a warn-severity service event that is not a send failure.
   * Use for best-effort side-effects (e.g. BSUID pairing write failures) where
   * the message pipeline continues regardless.
   *
   * @param label - Short event label (e.g. 'bsuid_pair_error')
   * @param message - Human-readable description (no full phone numbers — POPIA)
   */
  logServiceWarn(label: string, message: string): void {
    this.logger.warn('WhatsApp service warn', this.meta({ label, message }));
  }

  /**
   * Log a debug-level breadcrumb for per-message no-op paths.
   * LoggerLike has no debug tier; delegates to info to avoid noise escalation.
   * Use for intentionally silent-in-production paths that need a trace anchor.
   *
   * @param label - Short event label
   * @param message - Human-readable description
   */
  logServiceDebug(label: string, message: string): void {
    this.logger.info('WhatsApp service debug', this.meta({ label, message, severity: 'debug' }));
  }

  /**
   * Log wall-clock timing for a hot-path step (latency instrumentation).
   *
   * @param step - Step identifier (e.g. 'idempotency_check', 'heart.classify', 'heart.compose')
   * @param durationMs - Elapsed milliseconds (use performance.now() delta)
   */
  logTiming(step: string, durationMs: number): void {
    this.logger.info('webhook.timing', this.meta({ step, durationMs }));
  }
}

/**
 * Redact a phone number: show last 4 digits only.
 *
 * @param phone - E.164 phone
 * @returns Redacted string (e.g. ***1111)
 */
export function redactPhone(phone: string): string {
  const digits = phone.replaceAll(/\D/g, '');
  if (digits.length <= 4) {
    return '****';
  }
  return `***${digits.slice(-4)}`;
}

/**
 * Redact a messageId: show last 6 chars.
 *
 * @param messageId - Meta message ID
 * @returns Redacted string (e.g. ***abc123)
 */
export function redactMessageId(messageId: string): string {
  if (messageId.length <= 6) {
    return '******';
  }
  return `***${messageId.slice(-6)}`;
}
