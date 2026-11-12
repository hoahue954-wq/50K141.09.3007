CREATE TYPE "DebtPaymentMethod" AS ENUM ('CASH', 'TRANSFER');

ALTER TABLE "debt_payments"
ADD COLUMN "debt_record_id" UUID,
ADD COLUMN "payment_method" "DebtPaymentMethod";

UPDATE "debt_payments" AS payment
SET "debt_record_id" = record."id"
FROM "debt_records" AS record
WHERE payment."invoice_id" = record."invoice_id";

UPDATE "debt_payments" AS payment
SET "payment_method" = CASE invoice."payment_method_settled"::text
  WHEN 'CASH' THEN 'CASH'::"DebtPaymentMethod"
  WHEN 'TRANSFER' THEN 'TRANSFER'::"DebtPaymentMethod"
  ELSE NULL
END
FROM "invoices" AS invoice
WHERE payment."invoice_id" = invoice."id";

ALTER TABLE "debt_payments"
ADD CONSTRAINT "debt_payments_debt_record_id_fkey"
FOREIGN KEY ("debt_record_id") REFERENCES "debt_records"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "debt_payments_debt_record_id_idx" ON "debt_payments"("debt_record_id");
