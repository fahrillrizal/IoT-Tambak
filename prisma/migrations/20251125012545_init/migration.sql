-- CreateEnum
CREATE TYPE "device_type" AS ENUM ('SENSOR', 'FEEDER', 'CONTROLLER', 'HYBRID');

-- CreateEnum
CREATE TYPE "device_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "feeding_type" AS ENUM ('SCHEDULED', 'MANUAL', 'CONDITIONAL', 'AI');

-- CreateEnum
CREATE TYPE "feeding_status" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255),
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "phone" VARCHAR(15),
    "province_id" INTEGER,
    "regency_id" INTEGER,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ponds" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "pond_size" DECIMAL(10,2),
    "water_volume" DECIMAL(10,2),
    "shrimp_age_days" INTEGER DEFAULT 0,
    "biomass" DECIMAL(10,2),
    "stocking_date" TIMESTAMP(3),
    "thingsboard_device_id" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ponds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "pond_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "device_type" "device_type" NOT NULL,
    "device_token" VARCHAR(255) NOT NULL,
    "device_status" "device_status" NOT NULL DEFAULT 'ACTIVE',
    "thingsboard_device_id" VARCHAR(255),
    "firmware_version" VARCHAR(50),
    "hardware_version" VARCHAR(50),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_heartbeat" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feeding_schedules" (
    "id" SERIAL NOT NULL,
    "pond_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "days_of_week" TEXT NOT NULL,
    "conditional_feeding" BOOLEAN NOT NULL DEFAULT false,
    "min_ph" DECIMAL(4,2),
    "max_ph" DECIMAL(4,2),
    "min_do" DECIMAL(4,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feeding_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feeding_history" (
    "id" BIGSERIAL NOT NULL,
    "device_id" INTEGER NOT NULL,
    "pond_id" INTEGER NOT NULL,
    "feeding_type" "feeding_type" NOT NULL,
    "feeding_status" "feeding_status" NOT NULL DEFAULT 'COMPLETED',
    "amount" DECIMAL(10,2) NOT NULL,
    "planned_amount" DECIMAL(10,2),
    "temperature" DECIMAL(5,2),
    "ph" DECIMAL(4,2),
    "dissolved_oxygen" DECIMAL(5,2),
    "salinity" DECIMAL(5,2),
    "turbidity" DECIMAL(6,2),
    "scheduled_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered_by" INTEGER,
    "notes" TEXT,

    CONSTRAINT "feeding_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_summaries" (
    "id" SERIAL NOT NULL,
    "pond_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "avg_temperature" DECIMAL(5,2) NOT NULL,
    "min_temperature" DECIMAL(5,2) NOT NULL,
    "max_temperature" DECIMAL(5,2) NOT NULL,
    "avg_ph" DECIMAL(4,2) NOT NULL,
    "min_ph" DECIMAL(4,2) NOT NULL,
    "max_ph" DECIMAL(4,2) NOT NULL,
    "avg_dissolved_oxygen" DECIMAL(5,2) NOT NULL,
    "min_dissolved_oxygen" DECIMAL(5,2) NOT NULL,
    "max_dissolved_oxygen" DECIMAL(5,2) NOT NULL,
    "avg_salinity" DECIMAL(5,2) NOT NULL,
    "min_salinity" DECIMAL(5,2) NOT NULL,
    "max_salinity" DECIMAL(5,2) NOT NULL,
    "avg_turbidity" DECIMAL(6,2) NOT NULL,
    "min_turbidity" DECIMAL(6,2) NOT NULL,
    "max_turbidity" DECIMAL(6,2) NOT NULL,
    "data_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hourly_summaries" (
    "id" SERIAL NOT NULL,
    "pond_id" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "avg_temperature" DECIMAL(5,2) NOT NULL,
    "min_temperature" DECIMAL(5,2) NOT NULL,
    "max_temperature" DECIMAL(5,2) NOT NULL,
    "avg_ph" DECIMAL(4,2) NOT NULL,
    "min_ph" DECIMAL(4,2) NOT NULL,
    "max_ph" DECIMAL(4,2) NOT NULL,
    "avg_dissolved_oxygen" DECIMAL(5,2) NOT NULL,
    "min_dissolved_oxygen" DECIMAL(5,2) NOT NULL,
    "max_dissolved_oxygen" DECIMAL(5,2) NOT NULL,
    "avg_salinity" DECIMAL(5,2) NOT NULL,
    "avg_turbidity" DECIMAL(6,2) NOT NULL,
    "data_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hourly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "ponds_user_id_idx" ON "ponds"("user_id");

-- CreateIndex
CREATE INDEX "ponds_is_active_idx" ON "ponds"("is_active");

-- CreateIndex
CREATE INDEX "ponds_thingsboard_device_id_idx" ON "ponds"("thingsboard_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_token_key" ON "devices"("device_token");

-- CreateIndex
CREATE UNIQUE INDEX "devices_thingsboard_device_id_key" ON "devices"("thingsboard_device_id");

-- CreateIndex
CREATE INDEX "devices_pond_id_idx" ON "devices"("pond_id");

-- CreateIndex
CREATE INDEX "devices_device_token_idx" ON "devices"("device_token");

-- CreateIndex
CREATE INDEX "devices_thingsboard_device_id_idx" ON "devices"("thingsboard_device_id");

-- CreateIndex
CREATE INDEX "devices_device_status_idx" ON "devices"("device_status");

-- CreateIndex
CREATE INDEX "devices_is_active_idx" ON "devices"("is_active");

-- CreateIndex
CREATE INDEX "feeding_schedules_pond_id_idx" ON "feeding_schedules"("pond_id");

-- CreateIndex
CREATE INDEX "feeding_schedules_is_active_idx" ON "feeding_schedules"("is_active");

-- CreateIndex
CREATE INDEX "feeding_schedules_time_idx" ON "feeding_schedules"("time");

-- CreateIndex
CREATE INDEX "feeding_history_device_id_idx" ON "feeding_history"("device_id");

-- CreateIndex
CREATE INDEX "feeding_history_pond_id_idx" ON "feeding_history"("pond_id");

-- CreateIndex
CREATE INDEX "feeding_history_executed_at_idx" ON "feeding_history"("executed_at");

-- CreateIndex
CREATE INDEX "feeding_history_feeding_type_idx" ON "feeding_history"("feeding_type");

-- CreateIndex
CREATE INDEX "feeding_history_feeding_status_idx" ON "feeding_history"("feeding_status");

-- CreateIndex
CREATE INDEX "daily_summaries_pond_id_idx" ON "daily_summaries"("pond_id");

-- CreateIndex
CREATE INDEX "daily_summaries_date_idx" ON "daily_summaries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_summaries_pond_id_date_key" ON "daily_summaries"("pond_id", "date");

-- CreateIndex
CREATE INDEX "hourly_summaries_pond_id_idx" ON "hourly_summaries"("pond_id");

-- CreateIndex
CREATE INDEX "hourly_summaries_timestamp_idx" ON "hourly_summaries"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "hourly_summaries_pond_id_timestamp_key" ON "hourly_summaries"("pond_id", "timestamp");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ponds" ADD CONSTRAINT "ponds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_pond_id_fkey" FOREIGN KEY ("pond_id") REFERENCES "ponds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeding_schedules" ADD CONSTRAINT "feeding_schedules_pond_id_fkey" FOREIGN KEY ("pond_id") REFERENCES "ponds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeding_history" ADD CONSTRAINT "feeding_history_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_pond_id_fkey" FOREIGN KEY ("pond_id") REFERENCES "ponds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_summaries" ADD CONSTRAINT "hourly_summaries_pond_id_fkey" FOREIGN KEY ("pond_id") REFERENCES "ponds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
