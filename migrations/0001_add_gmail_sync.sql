-- Add source and external_id columns to expenses for Gmail sync deduplication
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "external_id" text;

-- Create gmail_sync table to store OAuth tokens and last sync timestamp
CREATE TABLE IF NOT EXISTS "gmail_sync" (
  "id" serial PRIMARY KEY NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "token_expiry" timestamp,
  "last_synced_at" timestamp
);
