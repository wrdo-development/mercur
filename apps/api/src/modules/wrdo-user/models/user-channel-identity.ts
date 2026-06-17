import { model } from '@medusajs/framework/utils';

/**
 * user_channel_identity — one row per (wrdo_user, channel) pair.
 *
 * Resolves a channel-specific identifier (wa_id for WhatsApp, numeric id for
 * Telegram, PSID for Messenger, session subject for web) back to the canonical
 * `wrdo_users.id`. The UNIQUE (channel, channel_user_id) index is what makes
 * identity resolution a single-row indexed lookup and what makes
 * getOrCreateByChannelIdentity idempotent.
 *
 * Ported from product-tribe. `channel` reserves all four for later phases;
 * only `whatsapp` is wired today.
 */
const UserChannelIdentity = model
  .define('user_channel_identity', {
    id: model.id().primaryKey(),
    user_id: model.text(),
    channel: model.enum(['whatsapp', 'telegram', 'messenger', 'web']),
    channel_user_id: model.text(),
    display_name_on_channel: model.text().nullable(),
    is_verified: model.boolean().default(false),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ['channel', 'channel_user_id'],
      unique: true,
    },
    {
      on: ['user_id'],
    },
  ]);

export default UserChannelIdentity;
