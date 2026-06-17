import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260617070953 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tribe_message_thread_id_created_at" ON "tribe_message" ("thread_id", "created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_tribe_message_thread_id_created_at";`);
  }

}
