CREATE TABLE "analyst_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"symbol" text,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"report_date" timestamp NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"pdf_path" text NOT NULL,
	"full_text" text,
	"structured_data" jsonb,
	"sentiment" text,
	"sentiment_score" real,
	"confidence_level" real,
	"summary" text,
	"tags" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "telegram_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "telegram_bot_token" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "telegram_alert_preferences" jsonb;--> statement-breakpoint
ALTER TABLE "analyst_reports" ADD CONSTRAINT "analyst_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyst_reports_user_id_idx" ON "analyst_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analyst_reports_symbol_idx" ON "analyst_reports" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "analyst_reports_type_idx" ON "analyst_reports" USING btree ("type");--> statement-breakpoint
CREATE INDEX "analyst_reports_report_date_idx" ON "analyst_reports" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "analyst_reports_sentiment_idx" ON "analyst_reports" USING btree ("sentiment");