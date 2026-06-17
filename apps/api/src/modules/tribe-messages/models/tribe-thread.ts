import { model } from '@medusajs/framework/utils';

/**
 * tribe_thread — exactly ONE per person. Keyed on wrdo_users.id. WhatsApp, web,
 * and (later) other surfaces are all windows onto this single thread; there is
 * nothing to "sync" — one conversation rendered in many places.
 */
const TribeThread = model
  .define('tribe_thread', {
    id: model.id().primaryKey(),
    user_id: model.text(),
    last_message_at: model.dateTime().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([{ on: ['user_id'], unique: true }]);

export default TribeThread;
