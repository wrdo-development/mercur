import { model } from '@medusajs/framework/utils';

const TribeSession = model.define('tribe_conversation_session', {
  id: model.id().primaryKey(),
  phone_number: model.text(),
  flow_id: model.text().nullable(),
  current_node_id: model.text(),
  context: model.json(),
  web_token: model.text().nullable(),
  web_token_expires_at: model.dateTime().nullable(),
  status: model
    .enum(['active', 'waiting_web', 'completed', 'abandoned', 'error'])
    .default('active'),
  started_at: model.dateTime(),
  last_activity_at: model.dateTime(),
  completed_at: model.dateTime().nullable(),
  expires_at: model.dateTime(),
});

export default TribeSession;
