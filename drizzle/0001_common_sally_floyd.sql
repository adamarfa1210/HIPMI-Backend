CREATE TYPE "public"."attendance_status" AS ENUM('HADIR', 'IZIN', 'SAKIT', 'ALPHA');--> statement-breakpoint
CREATE TYPE "public"."calendar_category" AS ENUM('PROKER', 'INTERNAL_MEETING', 'COMPETITION_DEADLINE', 'ORGANIZATION_HOLIDAY');--> statement-breakpoint
CREATE TYPE "public"."proker_bidang" AS ENUM('OKK', 'MEDKOMINFO', 'EKSTERNAL', 'EKRAF');--> statement-breakpoint
CREATE TYPE "public"."proker_status" AS ENUM('PLANNED', 'ON_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."score_source_type" AS ENUM('PROKER_COMMITTEE', 'MEETING_ATTENDANCE', 'MANUAL_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('CASH_IN', 'CASH_OUT');--> statement-breakpoint
CREATE TYPE "public"."achievement_category" AS ENUM('Kompetisi Bisnis', 'Pendanaan & Hibah', 'Tingkat Nasional', 'Rekognisi');--> statement-breakpoint
CREATE TYPE "public"."announcement_audience" AS ENUM('INTERNAL', 'PUBLIC', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."bidang_slug" AS ENUM('okk', 'medkominfo', 'eksternal', 'ekraf');--> statement-breakpoint
CREATE TYPE "public"."business_sector" AS ENUM('Teknologi & Jasa', 'Kuliner / F&B', 'Kreatif & Media', 'Fesyen & Ritel');--> statement-breakpoint
CREATE TYPE "public"."operational_pattern" AS ENUM('proker-only', 'jobdesk-only', 'proker-jobdesk');--> statement-breakpoint
CREATE TYPE "public"."partner_category" AS ENUM('Korporasi & BUMN', 'Asosiasi & HIPMI', 'Dinas & Inkubator', 'Komunitas & Media', 'Mitra Strategis');--> statement-breakpoint
CREATE TYPE "public"."program_kind" AS ENUM('proker', 'jobdesk');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('ready', 'pending-asset');--> statement-breakpoint
CREATE TYPE "public"."testimonial_category" AS ENUM('Kader & Alumni', 'Mitra Kolaborasi');--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proker_id" uuid,
	"title" varchar(140) NOT NULL,
	"category" "calendar_category" NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"location" varchar(140) NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"google_event_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"kader_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proker_id" uuid,
	"title" varchar(120) NOT NULL,
	"meeting_date" timestamp with time zone NOT NULL,
	"points_per_attendance" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proker_committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proker_id" uuid NOT NULL,
	"kader_id" uuid NOT NULL,
	"committee_role" varchar(60) NOT NULL,
	"points_awarded" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bidang" "proker_bidang" NOT NULL,
	"title" varchar(120) NOT NULL,
	"pic_kader_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "proker_status" DEFAULT 'PLANNED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kader_id" uuid NOT NULL,
	"source_type" "score_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"description" varchar(180) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" varchar(40),
	"type" "transaction_type" NOT NULL,
	"from_entity" varchar(120) NOT NULL,
	"to_entity" varchar(120) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"description" text NOT NULL,
	"transaction_date" date NOT NULL,
	"status" "transaction_status" DEFAULT 'PENDING' NOT NULL,
	"receipt_pdf_url" text,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(55) NOT NULL,
	"category" "achievement_category" NOT NULL,
	"description" varchar(180) NOT NULL,
	"recipient_label" varchar(50) NOT NULL,
	"organizer_label" varchar(55) NOT NULL,
	"image_src" text,
	"image_url" text,
	"image_alt" varchar(140),
	"slot_status" "slot_status" DEFAULT 'ready' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(120) NOT NULL,
	"content" text NOT NULL,
	"target_audience" "announcement_audience" DEFAULT 'BOTH' NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compartment_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bidang_id" uuid NOT NULL,
	"code" varchar(35) NOT NULL,
	"name" varchar(35) NOT NULL,
	"operational_pattern" "operational_pattern" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hero_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(45) NOT NULL,
	"subtitle" varchar(180) NOT NULL,
	"image_src" text NOT NULL,
	"image_alt" varchar(140) NOT NULL,
	"index_label" varchar(10),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kader_businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kader_id" uuid,
	"business_name" varchar(45) NOT NULL,
	"sector" "business_sector" DEFAULT 'Teknologi & Jasa' NOT NULL,
	"description" varchar(180) NOT NULL,
	"owner_label" varchar(45) DEFAULT '' NOT NULL,
	"owner_name" varchar(60),
	"verified_label" varchar(40) DEFAULT 'Terverifikasi' NOT NULL,
	"image_src" text,
	"image_url" text,
	"image_alt" varchar(140),
	"slot_status" "slot_status" DEFAULT 'ready' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(35) NOT NULL,
	"category" "partner_category" NOT NULL,
	"scope" varchar(160) NOT NULL,
	"period" varchar(60) NOT NULL,
	"status" varchar(30) NOT NULL,
	"image_src" text NOT NULL,
	"image_alt" varchar(140) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compartment_id" uuid,
	"kind" "program_kind" NOT NULL,
	"title" varchar(45) NOT NULL,
	"description" varchar(200) NOT NULL,
	"media_source_label" varchar(50),
	"image_src" text,
	"image_alt" varchar(140),
	"slot_status" "slot_status" DEFAULT 'ready' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"google_docs_template_url" text,
	"score_weight_meeting" integer DEFAULT 5 NOT NULL,
	"score_weight_proker" integer DEFAULT 10 NOT NULL,
	"cta_collaboration_href" text DEFAULT '/partnership#ajukan' NOT NULL,
	"cta_business_href" text DEFAULT '/bisnis-kader#daftar' NOT NULL,
	"cta_achievement_href" text DEFAULT '/prestasi#lapor' NOT NULL,
	"secretariat_address" varchar(150) DEFAULT 'Student Center Lantai 2, Universitas Telkom, Jl. Telekomunikasi No. 1, Terusan Buahbatu, Bandung 40257' NOT NULL,
	"official_email" varchar(80) DEFAULT 'hipmipttelkom@gmail.com' NOT NULL,
	"official_instagram" varchar(40) DEFAULT '@yechipmitelkom' NOT NULL,
	"whatsapp_contact_label" varchar(60) DEFAULT 'Humas & Kemitraan HIPMI PT Telkom' NOT NULL,
	"whatsapp_contact_url" text DEFAULT 'https://wa.me/6281234567890' NOT NULL,
	"copyright_text" varchar(80) DEFAULT '© 2026 HIPMI PT Universitas Telkom. All rights reserved.' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentang_pillars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(32) NOT NULL,
	"description" varchar(120) NOT NULL,
	"sort_order" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentang_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"eyebrow" varchar(30) DEFAULT 'TENTANG HIPMI PT' NOT NULL,
	"title" varchar(70) NOT NULL,
	"description" varchar(320) NOT NULL,
	"secondary_description" varchar(280),
	"video_poster_src" text,
	"video_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "testimonial_category" NOT NULL,
	"quote" varchar(240) NOT NULL,
	"author_label" varchar(40) NOT NULL,
	"role_or_org" varchar(55) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_program_bidangs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "bidang_slug" NOT NULL,
	"short_name" varchar(15) NOT NULL,
	"title" varchar(25) NOT NULL,
	"eyebrow" varchar(40) NOT NULL,
	"description" varchar(240) NOT NULL,
	"compartment_summary" varchar(50) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "work_program_bidangs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_proker_id_prokers_id_fk" FOREIGN KEY ("proker_id") REFERENCES "public"."prokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendances" ADD CONSTRAINT "meeting_attendances_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendances" ADD CONSTRAINT "meeting_attendances_kader_id_kaders_id_fk" FOREIGN KEY ("kader_id") REFERENCES "public"."kaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_proker_id_prokers_id_fk" FOREIGN KEY ("proker_id") REFERENCES "public"."prokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proker_committees" ADD CONSTRAINT "proker_committees_proker_id_prokers_id_fk" FOREIGN KEY ("proker_id") REFERENCES "public"."prokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proker_committees" ADD CONSTRAINT "proker_committees_kader_id_kaders_id_fk" FOREIGN KEY ("kader_id") REFERENCES "public"."kaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prokers" ADD CONSTRAINT "prokers_pic_kader_id_kaders_id_fk" FOREIGN KEY ("pic_kader_id") REFERENCES "public"."kaders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_ledgers" ADD CONSTRAINT "score_ledgers_kader_id_kaders_id_fk" FOREIGN KEY ("kader_id") REFERENCES "public"."kaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_kaders_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."kaders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_approved_by_kaders_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."kaders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartment_stages" ADD CONSTRAINT "compartment_stages_bidang_id_work_program_bidangs_id_fk" FOREIGN KEY ("bidang_id") REFERENCES "public"."work_program_bidangs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kader_businesses" ADD CONSTRAINT "kader_businesses_kader_id_kaders_id_fk" FOREIGN KEY ("kader_id") REFERENCES "public"."kaders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_slides" ADD CONSTRAINT "program_slides_compartment_id_compartment_stages_id_fk" FOREIGN KEY ("compartment_id") REFERENCES "public"."compartment_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_calendar_events_start" ON "calendar_events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_public" ON "calendar_events" USING btree ("is_public","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_meeting_kader_unique" ON "meeting_attendances" USING btree ("meeting_id","kader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_proker_committee_unique" ON "proker_committees" USING btree ("proker_id","kader_id");--> statement-breakpoint
CREATE INDEX "idx_prokers_bidang_status" ON "prokers" USING btree ("bidang","status");--> statement-breakpoint
CREATE INDEX "idx_score_ledgers_kader" ON "score_ledgers" USING btree ("kader_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_score_ledgers_idempotency" ON "score_ledgers" USING btree ("kader_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_status_date" ON "transactions" USING btree ("status","transaction_date");--> statement-breakpoint
CREATE INDEX "idx_transactions_created_by" ON "transactions" USING btree ("created_by");