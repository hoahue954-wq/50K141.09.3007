CREATE UNIQUE INDEX "categories_name_lower_key" ON "categories" (LOWER("name"));

CREATE UNIQUE INDEX "products_name_lower_key" ON "products" (LOWER("name"));
