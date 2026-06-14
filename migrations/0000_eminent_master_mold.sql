CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "budgets_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now()
);
