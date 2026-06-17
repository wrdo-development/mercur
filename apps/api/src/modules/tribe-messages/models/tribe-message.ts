import { model } from '@medusajs/framework/utils';

/**
 * tribe_message — one row per turn. `channel` + `created_at` are load-bearing:
 * they are the permanent substrate for cross-channel, time-aware recall
 * ("on WhatsApp, on 12 June, you said…"). `context` carries order/product/subject
 * as message metadata (NOT a separate thread).
 */
const TribeMessage = model
  .define('tribe_message', {
    id: model.id().primaryKey(),
    thread_id: model.text(),
    sender: model.enum(['user', 'wrdo']),
    channel: model.enum(['whatsapp', 'web']),
    text: model.text(),
    media_urls: model.json().nullable(),
    context: model.json().nullable(),
  })
  .indexes([{ on: ['thread_id'] }]);

export default TribeMessage;
