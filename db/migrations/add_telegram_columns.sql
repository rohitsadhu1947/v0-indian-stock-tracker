-- Add Telegram alert columns to user_preferences table
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_enabled" boolean DEFAULT false;
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_bot_token" text;
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_chat_id" text;
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "telegram_alert_preferences" jsonb;

