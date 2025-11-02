-- Create analyst_reports table manually
-- Run this in your Neon database console if drizzle-kit push hangs

CREATE TABLE IF NOT EXISTS "analyst_reports" (
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

-- Add foreign key
ALTER TABLE "analyst_reports" ADD CONSTRAINT "analyst_reports_user_id_users_id_fk" 
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- Create indexes
CREATE INDEX IF NOT EXISTS "analyst_reports_user_id_idx" ON "analyst_reports" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "analyst_reports_symbol_idx" ON "analyst_reports" USING btree ("symbol");
CREATE INDEX IF NOT EXISTS "analyst_reports_type_idx" ON "analyst_reports" USING btree ("type");
CREATE INDEX IF NOT EXISTS "analyst_reports_report_date_idx" ON "analyst_reports" USING btree ("report_date");
CREATE INDEX IF NOT EXISTS "analyst_reports_sentiment_idx" ON "analyst_reports" USING btree ("sentiment");

-- Also add missing foreign key for paper_positions if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'paper_positions_user_id_users_id_fk'
    ) THEN
        ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_user_id_users_id_fk" 
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
    END IF;
END $$;

SELECT 'analyst_reports table created successfully!' as result;

