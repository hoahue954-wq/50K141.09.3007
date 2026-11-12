ALTER TABLE "disposal_slips"
ADD COLUMN "deleted_by_id" UUID,
ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "return_slips"
ADD COLUMN "deleted_by_id" UUID,
ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "debt_credit" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE INDEX "disposal_slips_is_deleted_created_at_idx" ON "disposal_slips"("is_deleted", "created_at");
CREATE INDEX "return_slips_is_deleted_created_at_idx" ON "return_slips"("is_deleted", "created_at");

ALTER TABLE "disposal_slips"
ADD CONSTRAINT "disposal_slips_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id") REFERENCES "profiles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "return_slips"
ADD CONSTRAINT "return_slips_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id") REFERENCES "profiles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
