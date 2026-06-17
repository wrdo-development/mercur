import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260617063329 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "user_channel_identity" drop constraint if exists "user_channel_identity_channel_channel_user_id_unique";`);
    this.addSql(`create table if not exists "user_channel_identity" ("id" text not null, "user_id" text not null, "channel" text check ("channel" in ('whatsapp', 'telegram', 'messenger', 'web')) not null, "channel_user_id" text not null, "display_name_on_channel" text null, "is_verified" boolean not null default false, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "user_channel_identity_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_user_channel_identity_deleted_at" ON "user_channel_identity" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_channel_identity_channel_channel_user_id_unique" ON "user_channel_identity" ("channel", "channel_user_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_user_channel_identity_user_id" ON "user_channel_identity" ("user_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wrdo_users" ("id" text not null, "display_name" text null, "marketing_consent" boolean not null default false, "service_consent" boolean not null default true, "is_active" boolean not null default true, "registration_state" text not null default 'pending', "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wrdo_users_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wrdo_users_deleted_at" ON "wrdo_users" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "user_channel_identity" cascade;`);

    this.addSql(`drop table if exists "wrdo_users" cascade;`);
  }

}
