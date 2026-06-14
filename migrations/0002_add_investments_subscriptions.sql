-- Investments table
CREATE TABLE IF NOT EXISTS "investments" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "amount" integer NOT NULL,
  "start_date" date,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "amount" integer NOT NULL,
  "billing_day" integer DEFAULT 1 NOT NULL,
  "category" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_billed_month" text,
  "created_at" timestamp DEFAULT now()
);
