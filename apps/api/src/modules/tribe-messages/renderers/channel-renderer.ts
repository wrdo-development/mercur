export interface ReplyAction {
  id: string;
  label: string;
}

/** Channel-agnostic reply produced by the brain. Same content, rendered per surface. */
export interface WrdoReply {
  text: string;
  actions?: ReplyAction[];
}

export interface WebPayload {
  kind: 'web';
  text: string;
  actions?: ReplyAction[];
}

export interface WhatsAppPayload {
  kind: 'whatsapp';
  text: string;
  buttons?: { id: string; title: string }[];
}

export interface ChannelRenderer<T> {
  render(reply: WrdoReply): T;
}

export class WebRenderer implements ChannelRenderer<WebPayload> {
  render(reply: WrdoReply): WebPayload {
    return { kind: 'web', text: reply.text, actions: reply.actions };
  }
}

export class WhatsAppRenderer implements ChannelRenderer<WhatsAppPayload> {
  render(reply: WrdoReply): WhatsAppPayload {
    const buttons = reply.actions?.map((a) => ({ id: a.id, title: a.label }));
    return {
      kind: 'whatsapp',
      text: reply.text,
      ...(buttons && buttons.length > 0 ? { buttons } : {}),
    };
  }
}
