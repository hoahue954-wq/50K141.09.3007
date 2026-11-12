ALTER TABLE "purchase_orders"
ADD COLUMN "order_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "deleted_by_id" UUID,
ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "purchase_orders"
SET "order_date" = "created_at";

DROP INDEX IF EXISTS "purchase_orders_status_created_at_idx";
CREATE INDEX "purchase_orders_status_order_date_idx" ON "purchase_orders"("status", "order_date");
CREATE INDEX "purchase_orders_is_deleted_order_date_idx" ON "purchase_orders"("is_deleted", "order_date");
CREATE INDEX "inventory_transactions_type_created_at_idx" ON "inventory_transactions"("type", "created_at");

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id") REFERENCES "profiles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
