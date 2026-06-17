import {
  type MessageRecord,
  type ThreadRecord,
  ThreadService,
  type ThreadServiceDirectory,
} from '../thread.service';

function fakeDirectory() {
  const threads = new Map<string, ThreadRecord>();
  const messages: MessageRecord[] = [];
  let tSeq = 0;
  let mSeq = 0;
  const dir: ThreadServiceDirectory = {
    async listTribeThreads(filters) {
      return [...threads.values()].filter((t) => t.user_id === filters.user_id);
    },
    async createTribeThreads(data) {
      tSeq += 1;
      const t: ThreadRecord = { id: `thr_${tSeq}`, user_id: data.user_id as string, last_message_at: null, metadata: null };
      threads.set(t.id, t);
      return t;
    },
    async updateTribeThreads(data) {
      const t = threads.get(data.id as string)!;
      Object.assign(t, data);
      return t;
    },
    async createTribeMessages(data) {
      mSeq += 1;
      const m: MessageRecord = {
        id: `msg_${mSeq}`,
        thread_id: data.thread_id as string,
        sender: data.sender as MessageRecord['sender'],
        channel: data.channel as MessageRecord['channel'],
        text: data.text as string,
        media_urls: null,
        context: (data.context as Record<string, unknown> | null) ?? null,
        created_at: new Date(2026, 5, 17, 0, 0, mSeq),
      };
      messages.push(m);
      return m;
    },
    async listTribeMessages(filters, _config) {
      return messages
        .filter((m) => m.thread_id === filters.thread_id)
        .filter((m) => (filters._after ? m.id > (filters._after as string) : true));
    },
  };
  return { dir, _threadCount: () => threads.size, _messages: () => messages };
}

describe('ThreadService.appendMessage — one thread per person', () => {
  it('creates the thread on first append and reuses it on the second', async () => {
    const f = fakeDirectory();
    const svc = new ThreadService(f.dir);
    await svc.appendMessage('user_1', { sender: 'user', channel: 'whatsapp', text: 'hi' });
    await svc.appendMessage('user_1', { sender: 'wrdo', channel: 'whatsapp', text: 'hey!' });
    expect(f._threadCount()).toBe(1);
    expect(f._messages()).toHaveLength(2);
  });

  it('stamps channel + sender on each message', async () => {
    const f = fakeDirectory();
    const svc = new ThreadService(f.dir);
    await svc.appendMessage('user_1', { sender: 'user', channel: 'web', text: 'about this couch', context: { product_id: 'p1' } });
    const m = f._messages()[0];
    expect(m.channel).toBe('web');
    expect(m.sender).toBe('user');
    expect(m.context).toEqual({ product_id: 'p1' });
  });
});

describe('ThreadService.getMessages — cursor paging', () => {
  it('returns only messages after the cursor', async () => {
    const f = fakeDirectory();
    const svc = new ThreadService(f.dir);
    await svc.appendMessage('user_1', { sender: 'user', channel: 'web', text: 'one' });
    const all = await svc.getMessages('user_1');
    await svc.appendMessage('user_1', { sender: 'wrdo', channel: 'web', text: 'two' });
    const after = await svc.getMessages('user_1', { after: all[0].id });
    expect(after.map((m) => m.text)).toEqual(['two']);
  });
});
