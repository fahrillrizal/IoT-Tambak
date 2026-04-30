-- Add Telegram connection fields to users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "telegram_connect_token" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "telegram_connect_token_exp" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "telegram_connected_at" TIMESTAMP(3);
