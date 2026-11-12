ALTER TABLE "return_items"
ADD COLUMN "cost_price" DECIMAL(12, 2) NOT NULL DEFAULT 0;

UPDATE "return_items" AS item
SET "cost_price" = detail."cost_price"
FROM "invoice_details" AS detail
WHERE item."kind" = 'RETURNED'
  AND item."invoice_detail_id" = detail."id";

UPDATE "return_items" AS item
SET "cost_price" = product."cost_price"
FROM "products" AS product
WHERE item."kind" = 'EXCHANGED'
  AND item."product_id" = product."id";
