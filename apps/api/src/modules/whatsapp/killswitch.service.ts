/**
 * AI killswitch — when WRDO_AI_ENABLED=false, all responses from Tier 0 templates only.
 *
 * Toggle via environment variable WRDO_AI_ENABLED=false.
 * Intentionally env-driven: no admin endpoint needed (reduces attack surface).
 */

export interface KillswitchEnv {
  getEnv(key: string): string | undefined;
}

const defaultGetEnv = (key: string): string | undefined => {
  if (key !== 'WRDO_AI_ENABLED') {
    return undefined;
  }
  return process.env.WRDO_AI_ENABLED;
};

/**
 * Returns true when AI may be used; false when only Tier 0 templates must be used.
 *
 * Reads WRDO_AI_ENABLED. Treats "false" (case-insensitive) as disabled.
 * Unset or any other value → enabled.
 *
 * @param env - Optional env reader for DI/tests (object with getEnv method)
 * @returns true if AI is enabled, false for Tier 0 only
 */
export function isAiEnabled(env: KillswitchEnv = { getEnv: defaultGetEnv }): boolean {
  const raw = env.getEnv('WRDO_AI_ENABLED');
  if (raw === undefined || raw === '') {
    return true;
  }
  return raw.toLowerCase() !== 'false';
}

/**
 * Service that exposes the AI killswitch flag.
 * Toggle via env var WRDO_AI_ENABLED=false.
 */
export class KillswitchService {
  private readonly getEnv: KillswitchEnv['getEnv'];

  constructor(options?: { getEnv?: KillswitchEnv['getEnv'] }) {
    this.getEnv = options?.getEnv ?? defaultGetEnv;
  }

  /**
   * Returns true when AI may be called; false when responses must come from Tier 0 templates only.
   *
   * @returns true if AI enabled, false if killswitch on
   */
  isAiEnabled(): boolean {
    return isAiEnabled({ getEnv: this.getEnv });
  }
}
