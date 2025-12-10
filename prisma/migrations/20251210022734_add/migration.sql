-- CreateTable
CREATE TABLE "device_access" (
    "id" SERIAL NOT NULL,
    "device_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'VIEWER',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_access_user_id_idx" ON "device_access"("user_id");

-- CreateIndex
CREATE INDEX "device_access_device_id_idx" ON "device_access"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_access_device_id_user_id_key" ON "device_access"("device_id", "user_id");

-- AddForeignKey
ALTER TABLE "device_access" ADD CONSTRAINT "device_access_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_access" ADD CONSTRAINT "device_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
