CREATE TYPE "public"."cadre_interest" AS ENUM('Kompetisi', 'Punya Bisnis', 'Belum Punya Bisnis', 'Belum Punya Bisnis tapi Minat Kompetisi');--> statement-breakpoint
CREATE TYPE "public"."cadre_status" AS ENUM('Aktif', 'Non-Aktif', 'Alumni');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_kader_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_name" varchar(60) NOT NULL,
	"entity_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kaders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"nim" varchar(20) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"whatsapp_number" varchar(20) NOT NULL,
	"prodi" varchar(80) NOT NULL,
	"fakultas" varchar(80) NOT NULL,
	"instagram" varchar(60),
	"business_name" varchar(120),
	"interest_category" "cadre_interest" NOT NULL,
	"status" "cadre_status" DEFAULT 'Aktif' NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kaders_nim_unique" UNIQUE("nim")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"label" varchar(80) NOT NULL,
	CONSTRAINT "modules_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"can_read" boolean DEFAULT false NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_update" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"can_approve" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_kader_id_kaders_id_fk" FOREIGN KEY ("actor_kader_id") REFERENCES "public"."kaders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaders" ADD CONSTRAINT "kaders_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor_kader_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" USING btree ("entity_name","entity_id");--> statement-breakpoint
CREATE INDEX "idx_kaders_nim" ON "kaders" USING btree ("nim");--> statement-breakpoint
CREATE INDEX "idx_kaders_total_score" ON "kaders" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "idx_kaders_status" ON "kaders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_kaders_prodi" ON "kaders" USING btree ("prodi");--> statement-breakpoint
CREATE INDEX "idx_kaders_fakultas" ON "kaders" USING btree ("fakultas");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_role_module_unique" ON "role_permissions" USING btree ("role_id","module_id");