CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"symbol" text,
	"alert_type" text NOT NULL,
	"message" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"is_read" boolean DEFAULT false,
	"action_required" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fundamental_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"market_cap" text,
	"pe_ratio" real,
	"pb_ratio" real,
	"dividend_yield" real,
	"debt_to_equity" real,
	"roe" real,
	"sector" text,
	"industry" text,
	"data" jsonb NOT NULL,
	"score" integer,
	"signal" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historical_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"interval" text NOT NULL,
	"from_date" timestamp NOT NULL,
	"to_date" timestamp NOT NULL,
	"data" jsonb NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_dashboard" (
	"id" serial PRIMARY KEY NOT NULL,
	"dashboard_type" text NOT NULL,
	"data" jsonb NOT NULL,
	"market_sentiment" text,
	"valid_until" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text,
	"news_type" text NOT NULL,
	"title" text NOT NULL,
	"link" text,
	"snippet" text,
	"source" text,
	"published_at" timestamp,
	"sentiment" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"position_type" text NOT NULL,
	"entry_price" real NOT NULL,
	"quantity" integer NOT NULL,
	"current_price" real,
	"stop_loss" real,
	"target1" real,
	"target2" real,
	"pnl" real,
	"pnl_percent" real,
	"status" text DEFAULT 'open' NOT NULL,
	"entry_time" timestamp NOT NULL,
	"exit_time" timestamp,
	"exit_price" real,
	"exit_reason" text,
	"notes" text,
	"strategy" text NOT NULL,
	"signal_data" jsonb,
	"momentum_score" integer,
	"confidence" real,
	"risk_amount" real,
	"capital_required" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pattern_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"analysis_type" text NOT NULL,
	"recommendation" text NOT NULL,
	"score" integer NOT NULL,
	"confidence" real,
	"success_rate" real,
	"patterns" jsonb,
	"intelligence" jsonb,
	"valid_until" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"position_type" text NOT NULL,
	"entry_price" real NOT NULL,
	"quantity" integer NOT NULL,
	"current_price" real,
	"stop_loss" real,
	"target" real,
	"pnl" real,
	"pnl_percent" real,
	"status" text DEFAULT 'open' NOT NULL,
	"entry_time" timestamp NOT NULL,
	"exit_time" timestamp,
	"exit_price" real,
	"notes" text,
	"strategy" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screener_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"screener_type" text NOT NULL,
	"screener_level" text,
	"results" jsonb NOT NULL,
	"total_stocks" integer,
	"signal_count" integer,
	"run_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"data" jsonb NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"position_id" integer,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"entry_price" real NOT NULL,
	"exit_price" real NOT NULL,
	"quantity" integer NOT NULL,
	"pnl" real NOT NULL,
	"pnl_percent" real NOT NULL,
	"strategy" text,
	"exit_reason" text,
	"entry_time" timestamp NOT NULL,
	"exit_time" timestamp NOT NULL,
	"duration" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"theme" text DEFAULT 'dark',
	"default_screener_level" text DEFAULT 'moderate',
	"notifications_enabled" boolean DEFAULT true,
	"auto_refresh_interval" integer DEFAULT 60,
	"default_position_size" integer DEFAULT 100,
	"risk_percentage" real DEFAULT 2,
	"preferences" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"kite_user_id" text NOT NULL,
	"email" text,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login" timestamp,
	CONSTRAINT "users_kite_user_id_unique" UNIQUE("kite_user_id")
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"instrument_token" integer,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screener_results" ADD CONSTRAINT "screener_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_history" ADD CONSTRAINT "trade_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_history" ADD CONSTRAINT "trade_history_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_user_id_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alerts_is_read_idx" ON "alerts" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "alerts_created_at_idx" ON "alerts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fundamental_data_symbol_exchange_idx" ON "fundamental_data" USING btree ("symbol","exchange");--> statement-breakpoint
CREATE INDEX "fundamental_data_fetched_at_idx" ON "fundamental_data" USING btree ("fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "historical_data_symbol_interval_idx" ON "historical_data" USING btree ("symbol","interval","from_date","to_date");--> statement-breakpoint
CREATE INDEX "historical_data_timestamp_idx" ON "historical_data" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "market_dashboard_type_valid_idx" ON "market_dashboard" USING btree ("dashboard_type","valid_until");--> statement-breakpoint
CREATE INDEX "news_data_symbol_idx" ON "news_data" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "news_data_news_type_idx" ON "news_data" USING btree ("news_type");--> statement-breakpoint
CREATE INDEX "news_data_published_at_idx" ON "news_data" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "paper_positions_user_id_idx" ON "paper_positions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paper_positions_status_idx" ON "paper_positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "paper_positions_symbol_idx" ON "paper_positions" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "paper_positions_strategy_idx" ON "paper_positions" USING btree ("strategy");--> statement-breakpoint
CREATE INDEX "pattern_analysis_symbol_type_idx" ON "pattern_analysis" USING btree ("symbol","analysis_type");--> statement-breakpoint
CREATE INDEX "pattern_analysis_valid_until_idx" ON "pattern_analysis" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "positions_user_id_idx" ON "positions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "positions_status_idx" ON "positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "positions_symbol_idx" ON "positions" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "screener_results_user_type_idx" ON "screener_results" USING btree ("user_id","screener_type");--> statement-breakpoint
CREATE INDEX "screener_results_run_at_idx" ON "screener_results" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_quotes_symbol_exchange_idx" ON "stock_quotes" USING btree ("symbol","exchange");--> statement-breakpoint
CREATE INDEX "stock_quotes_timestamp_idx" ON "stock_quotes" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "trade_history_user_id_idx" ON "trade_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_history_symbol_idx" ON "trade_history" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "trade_history_entry_time_idx" ON "trade_history" USING btree ("entry_time");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_user_symbol_idx" ON "watchlists" USING btree ("user_id","symbol","exchange");