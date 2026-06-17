export type Sender = 'user' | 'wrdo';
export type Channel = 'whatsapp' | 'web';

export interface ThreadRecord {
  id: string;
  user_id: string;
  last_message_at: Date | null;
  metadata: Record<string, unknown> | null;
}

export interface MessageRecord {
  id: string;
  thread_id: string;
  sender: Sender;
  channel: Channel;
  text: string;
  media_urls: string[] | null;
  context: Record<string, unknown> | null;
  created_at: Date;
}

export interface AppendMessageInput {
  sender: Sender;
  channel: Channel;
  text: string;
  context?: Record<string, unknown> | null;
}

/** Minimal slice of the MedusaService that ThreadService consumes (fake-able in tests). */
export interface ThreadServiceDirectory {
  listTribeThreads(filters: Record<string, unknown>): Promise<ThreadRecord[]>;
  createTribeThreads(data: Record<string, unknown>): Promise<ThreadRecord>;
  updateTribeThreads(data: Record<string, unknown>): Promise<ThreadRecord>;
  createTribeMessages(data: Record<string, unknown>): Promise<MessageRecord>;
  listTribeMessages(
    filters: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<MessageRecord[]>;
}

export class ThreadService {
  constructor(private readonly dir: ThreadServiceDirectory) {}

  /** Get-or-create the single thread for a person. */
  async getThread(userId: string): Promise<ThreadRecord> {
    const existing = await this.dir.listTribeThreads({ user_id: userId });
    if (existing[0] !== undefined) {
      return existing[0];
    }
    return this.dir.createTribeThreads({ user_id: userId });
  }

  /** Append one turn to the person's thread. The single durable write path. */
  async appendMessage(userId: string, input: AppendMessageInput): Promise<MessageRecord> {
    const thread = await this.getThread(userId);
    const message = await this.dir.createTribeMessages({
      thread_id: thread.id,
      sender: input.sender,
      channel: input.channel,
      text: input.text,
      context: input.context ?? null,
    });
    await this.dir.updateTribeThreads({ id: thread.id, last_message_at: message.created_at });
    return message;
  }

  /** Read this person's messages, optionally after a cursor (message id). */
  async getMessages(userId: string, options: { after?: string } = {}): Promise<MessageRecord[]> {
    const thread = await this.getThread(userId);
    return this.dir.listTribeMessages(
      { thread_id: thread.id, _after: options.after },
      { order: { created_at: 'ASC' } },
    );
  }
}
