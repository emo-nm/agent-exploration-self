CREATE TYPE "public"."backend" AS ENUM('eve', 'flue', 'mastra');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'approved', 'denied', 'published');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comparison_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"eve_thread_id" text,
	"flue_thread_id" text,
	"smithers_run_id" text,
	"metrics_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"backend" "backend" NOT NULL,
	"external_session_id" text,
	"continuation_state_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publication_effects" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_checksum" text NOT NULL,
	"result_json" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publication_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publication_effects" ADD CONSTRAINT "publication_effects_proposal_id_publication_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."publication_proposals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publication_proposals" ADD CONSTRAINT "publication_proposals_thread_id_demo_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."demo_threads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "publication_effects_idempotency_key_unique" ON "publication_effects" USING btree ("idempotency_key");