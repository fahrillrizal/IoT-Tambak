-- Create enums for alert events
CREATE TYPE "alert_severity" AS ENUM ('WARNING', 'CRITICAL');
CREATE TYPE "alert_status" AS ENUM ('ACTIVE', 'CLEARED', 'ACKNOWLEDGED');

-- Create alert events table
CREATE TABLE "alert_events" (
    "id" BIGSERIAL NOT NULL,
    "event_key" VARCHAR(191) NOT NULL,
    "tb_alarm_id" VARCHAR(191),
    "tb_device_id" VARCHAR(255) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "pond_id" INTEGER NOT NULL,
    "device_id" INTEGER NOT NULL,
    "severity" "alert_severity" NOT NULL,
    "status" "alert_status" NOT NULL DEFAULT 'ACTIVE',
    "message" TEXT NOT NULL,
    "issue_count" INTEGER,
    "parameters" JSONB,
    "action" VARCHAR(255),
    "event_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "alert_events_event_key_key" ON "alert_events"("event_key");
CREATE INDEX "alert_events_tb_alarm_id_idx" ON "alert_events"("tb_alarm_id");
CREATE INDEX "alert_events_user_id_event_time_idx" ON "alert_events"("user_id", "event_time");
CREATE INDEX "alert_events_device_id_event_time_idx" ON "alert_events"("device_id", "event_time");
CREATE INDEX "alert_events_severity_status_event_time_idx" ON "alert_events"("severity", "status", "event_time");

-- Foreign keys
ALTER TABLE "alert_events"
    ADD CONSTRAINT "alert_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_events"
    ADD CONSTRAINT "alert_events_pond_id_fkey"
    FOREIGN KEY ("pond_id") REFERENCES "ponds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_events"
    ADD CONSTRAINT "alert_events_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;