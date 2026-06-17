import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260617070423 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tribe_thread" drop constraint if exists "tribe_thread_user_id_unique";`);
    this.addSql(`create table if not exists "tribe_message" ("id" text not null, "thread_id" text not null, "sender" text check ("sender" in ('user', 'wrdo')) not null, "channel" text check ("channel" in ('whatsapp', 'web')) not null, "text" text not null, "media_urls" jsonb null, "context" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tribe_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tribe_message_deleted_at" ON "tribe_message" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tribe_message_thread_id" ON "tribe_message" ("thread_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "tribe_thread" ("id" text not null, "user_id" text not null, "last_message_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tribe_thread_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tribe_thread_deleted_at" ON "tribe_thread" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tribe_thread_user_id_unique" ON "tribe_thread" ("user_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tribe_message" cascade;`);

    this.addSql(`drop table if exists "tribe_thread" cascade;`);
  }

}
