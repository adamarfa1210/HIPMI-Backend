DO $$ BEGIN CREATE TYPE "public"."password_reset_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."news_category" AS ENUM('Kegiatan', 'Pengumuman', 'Prestasi', 'Bisnis'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TYPE "public"."calendar_category" ADD VALUE IF NOT EXISTS 'RBPL' BEFORE 'COMPETITION_DEADLINE';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kader_id" uuid NOT NULL,
	"nim" varchar(20) NOT NULL,
	"status" "password_reset_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"notes" varchar(240)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_event_target_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"role_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(120) NOT NULL,
	"category" "news_category" DEFAULT 'Kegiatan' NOT NULL,
	"summary" varchar(240) NOT NULL,
	"content" text NOT NULL,
	"image_src" text,
	"image_alt" varchar(140),
	"slot_status" "slot_status" DEFAULT 'pending-asset' NOT NULL,
	"target_audience" "announcement_audience" DEFAULT 'BOTH' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kaders" ADD COLUMN IF NOT EXISTS "profile_completed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "enable_qr_attendance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "points_per_attendance" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "qr_token" varchar(120);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "qr_is_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "meeting_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_kader_id_kaders_id_fk" FOREIGN KEY ("kader_id") REFERENCES "public"."kaders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolved_by_kaders_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."kaders"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "calendar_event_target_roles" ADD CONSTRAINT "calendar_event_target_roles_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "calendar_event_target_roles" ADD CONSTRAINT "calendar_event_target_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_created_by_kaders_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."kaders"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_status" ON "password_reset_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_nim" ON "password_reset_requests" USING btree ("nim");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_calendar_event_target_role_unique" ON "calendar_event_target_roles" USING btree ("event_id","role_id");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_kaders_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."kaders"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_qr_token_unique" UNIQUE("qr_token"); EXCEPTION WHEN duplicate_object THEN null; END $$;
