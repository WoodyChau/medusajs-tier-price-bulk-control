import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260323093000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "price_control_template" (
        "id" text not null,
        "name" text not null,
        "tiers" jsonb not null,
        "default_tier1_by_currency" jsonb not null,
        "created_by" text null,
        "updated_by" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "price_control_template_pkey" primary key ("id")
      );
    `)

    this.addSql(`
      create unique index if not exists "IDX_price_control_template_name_unique"
      on "price_control_template" ("name")
      where deleted_at is null;
    `)

    this.addSql(`
      create index if not exists "IDX_price_control_template_deleted_at"
      on "price_control_template" ("deleted_at")
      where deleted_at is null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "price_control_template" cascade;`)
  }
}
