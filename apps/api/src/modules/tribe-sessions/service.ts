import { MedusaService } from '@medusajs/framework/utils';
import type { SessionContext, SessionStatus } from '../../types/tribe-flows.types';
import TribeSession from './models/tribe-session';

class TribeSessionModuleService extends MedusaService({
  TribeSession,
}) {
  /** Overridable in tests via subclass. Returns current time as Date. */
  protected _now(): Date {
    return new Date();
  }

  // ─── Session lifecycle ─────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async createSession(
    phoneNumber: string,
    flowId: string,
    startNodeId: string,
    initialContext: Partial<SessionContext> = {},
  ) {
    const now = this._now();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const context: SessionContext = { phoneNumber, ...initialContext };

    return this.createTribeSessions({
      phone_number: phoneNumber,
      flow_id: flowId,
      current_node_id: startNodeId,
      context,
      status: 'active' as const,
      started_at: now,
      last_activity_at: now,
      expires_at: expires,
    });
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getActiveSession(phoneNumber: string) {
    const results = await this.listTribeSessions(
      {
        phone_number: phoneNumber,
        status: ['active', 'waiting_web'] as SessionStatus[],
      },
      { take: 1, order: { started_at: 'DESC' } },
    );
    return results[0] ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async advanceSession(
    sessionId: string,
    nextNodeId: string,
    contextUpdate: Partial<SessionContext> = {},
  ) {
    const session = await this.retrieveTribeSession(sessionId);
    const mergedContext: SessionContext = {
      ...(session.context as SessionContext),
      ...contextUpdate,
    };
    return this.updateTribeSessions({
      id: sessionId,
      current_node_id: nextNodeId,
      context: mergedContext,
      status: 'active' as const,
      last_activity_at: this._now(),
    });
  }

  async setWaitingForWeb(sessionId: string, token: string, expiresAt: Date): Promise<void> {
    await this.updateTribeSessions({
      id: sessionId,
      web_token: token,
      web_token_expires_at: expiresAt,
      status: 'waiting_web' as const,
      last_activity_at: this._now(),
    });
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async resumeFromWeb(token: string, webData: Record<string, unknown>) {
    const results = await this.listTribeSessions(
      { web_token: token, status: 'waiting_web' },
      { take: 1 },
    );
    if (results.length === 0) {
      throw new Error('No waiting_web session found for token');
    }
    const [session] = results;

    const expiresAt = session.web_token_expires_at;
    if (expiresAt !== null && this._now() > new Date(expiresAt as unknown as string)) {
      await this.updateTribeSessions({ id: session.id, status: 'abandoned' as const });
      throw new Error('Web handoff token expired');
    }

    const mergedContext: SessionContext = {
      ...(session.context as SessionContext),
      ...webData,
    };

    return this.updateTribeSessions({
      id: session.id,
      context: mergedContext,
      status: 'active' as const,
      web_token: null,
      web_token_expires_at: null,
      last_activity_at: this._now(),
    });
  }

  async completeSession(sessionId: string): Promise<void> {
    await this.updateTribeSessions({
      id: sessionId,
      status: 'completed' as const,
      completed_at: this._now(),
      last_activity_at: this._now(),
    });
  }

  async markSessionError(sessionId: string): Promise<void> {
    await this.updateTribeSessions({
      id: sessionId,
      status: 'error' as const,
      last_activity_at: this._now(),
    });
  }

  /**
   * Abandon sessions where web handoff has timed out.
   * Called by a scheduled cron job. Returns count of abandoned sessions.
   */
  async abandonStaleWebSessions(): Promise<number> {
    const stale = await this.listTribeSessions({ status: 'waiting_web' });
    const now = this._now();
    let count = 0;

    await Promise.all(
      stale
        .filter((s) => {
          const exp = s.web_token_expires_at;
          return exp !== null && new Date(exp as unknown as string) < now;
        })
        .map(async (s) => {
          await this.updateTribeSessions({ id: s.id, status: 'abandoned' as const });
          count++;
        }),
    );

    return count;
  }
}

export default TribeSessionModuleService;
