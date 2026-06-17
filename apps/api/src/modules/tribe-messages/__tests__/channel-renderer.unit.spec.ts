import { WebRenderer, WhatsAppRenderer, type WrdoReply } from '../renderers/channel-renderer';

const reply: WrdoReply = {
  text: 'Want me to book the plumber?',
  actions: [{ id: 'book', label: 'Book & Pay' }, { id: 'more', label: 'More options' }],
};

describe('ChannelRenderer', () => {
  it('WebRenderer returns structured JSON the widget renders', () => {
    const out = new WebRenderer().render(reply);
    expect(out).toEqual({ kind: 'web', text: reply.text, actions: reply.actions });
  });

  it('WhatsAppRenderer returns text + interactive button payload', () => {
    const out = new WhatsAppRenderer().render(reply);
    expect(out.kind).toBe('whatsapp');
    expect(out.text).toBe(reply.text);
    expect(out.buttons).toEqual([
      { id: 'book', title: 'Book & Pay' },
      { id: 'more', title: 'More options' },
    ]);
  });

  it('WhatsAppRenderer omits buttons when there are none', () => {
    const out = new WhatsAppRenderer().render({ text: 'hello' });
    expect(out.buttons).toBeUndefined();
  });
});
