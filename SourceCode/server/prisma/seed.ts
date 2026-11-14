import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, RoleCode, InventoryTransactionType } from '@prisma/client';
import { z } from 'zod';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SEED_OWNER_EMAIL: z.string().email(),
  SEED_OWNER_PASSWORD: z.string().min(6),
  SEED_STAFF_EMAIL: z.string().email(),
  SEED_STAFF_PASSWORD: z.string().min(6),
});

const parsedEnv = seedEnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(
    `Cấu hình seed không hợp lệ: ${parsedEnv.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
  );
}

const seedEnv = parsedEnv.data;
const prisma = new PrismaClient();
const supabaseAdmin = createClient(seedEnv.SUPABASE_URL, seedEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

async function getOrCreateAuthUser(email: string, password: string, fullName: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Không thể tra tài khoản Supabase ${email}: ${error.message}`);

    const existing = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (existing) return existing;
    if (data.users.length < 1000) break;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username: email.split('@')[0] },
  });

  if (error || !data.user) {
    throw new Error(`Không thể tạo tài khoản Supabase ${email}: ${error?.message ?? 'Không có dữ liệu user'}`);
  }

  return data.user;
}

const categories = [
  { code: 'DM001', name: 'Đồ uống', description: 'Nước uống và đồ giải khát' },
  { code: 'DM002', name: 'Thực phẩm khô', description: 'Mì, gạo và thực phẩm đóng gói' },
  { code: 'DM003', name: 'Gia vị', description: 'Gia vị và nguyên liệu nấu ăn' },
  { code: 'DM004', name: 'Chăm sóc cá nhân', description: 'Sản phẩm vệ sinh và chăm sóc cá nhân' },
  { code: 'DM005', name: 'Đồ gia dụng', description: 'Sản phẩm sử dụng trong gia đình' },
];

const products = [
  { barcode: '8936136163307', name: 'Nước suối 500ml', categoryCode: 'DM001', cost: '3000', price: '5000', unit: 'chai', stock: 48, min: 10 },
  { barcode: '8936136163308', name: 'Nước suối 1.5L', categoryCode: 'DM001', cost: '7000', price: '10000', unit: 'chai', stock: 24, min: 6 },
  { barcode: '8936136163309', name: 'Nước ngọt có gas 330ml', categoryCode: 'DM001', cost: '7500', price: '10000', unit: 'lon', stock: 36, min: 8 },
  { barcode: '8936136163310', name: 'Trà xanh đóng chai', categoryCode: 'DM001', cost: '7000', price: '10000', unit: 'chai', stock: 30, min: 8 },
  { barcode: '8936136163311', name: 'Sữa tươi hộp 180ml', categoryCode: 'DM001', cost: '6500', price: '8500', unit: 'hộp', stock: 24, min: 8 },
  { barcode: '8936136163312', name: 'Cà phê hòa tan gói', categoryCode: 'DM001', cost: '1500', price: '2000', unit: 'gói', stock: 80, min: 20 },
  { barcode: '8936136163313', name: 'Mì ăn liền vị gà', categoryCode: 'DM002', cost: '3500', price: '5000', unit: 'gói', stock: 60, min: 15 },
  { barcode: '8936136163314', name: 'Mì ăn liền vị bò', categoryCode: 'DM002', cost: '3500', price: '5000', unit: 'gói', stock: 60, min: 15 },
  { barcode: '8936136163315', name: 'Gạo thơm', categoryCode: 'DM002', cost: '18000', price: '22000', unit: 'kg', stock: 25, min: 5 },
  { barcode: '8936136163316', name: 'Bánh quy bơ', categoryCode: 'DM002', cost: '12000', price: '16000', unit: 'hộp', stock: 18, min: 5 },
  { barcode: '8936136163317', name: 'Bánh snack khoai tây', categoryCode: 'DM002', cost: '7000', price: '10000', unit: 'gói', stock: 32, min: 8 },
  { barcode: '8936136163318', name: 'Đường cát trắng', categoryCode: 'DM002', cost: '18000', price: '22000', unit: 'kg', stock: 12, min: 4 },
  { barcode: '8936136163319', name: 'Dầu ăn thực vật', categoryCode: 'DM002', cost: '38000', price: '45000', unit: 'chai', stock: 10, min: 3 },
  { barcode: '8936136163320', name: 'Nước mắm', categoryCode: 'DM003', cost: '22000', price: '28000', unit: 'chai', stock: 14, min: 4 },
  { barcode: '8936136163321', name: 'Nước tương', categoryCode: 'DM003', cost: '12000', price: '16000', unit: 'chai', stock: 15, min: 4 },
  { barcode: '8936136163322', name: 'Muối i-ốt', categoryCode: 'DM003', cost: '4000', price: '6000', unit: 'gói', stock: 20, min: 5 },
  { barcode: '8936136163323', name: 'Bột ngọt', categoryCode: 'DM003', cost: '18000', price: '23000', unit: 'gói', stock: 10, min: 3 },
  { barcode: '8936136163324', name: 'Tương ớt', categoryCode: 'DM003', cost: '10000', price: '14000', unit: 'chai', stock: 12, min: 3 },
  { barcode: '8936136163325', name: 'Dầu gội gói', categoryCode: 'DM004', cost: '1500', price: '2000', unit: 'gói', stock: 50, min: 12 },
  { barcode: '8936136163326', name: 'Xà phòng tắm', categoryCode: 'DM004', cost: '12000', price: '16000', unit: 'bánh', stock: 15, min: 4 },
  { barcode: '8936136163327', name: 'Kem đánh răng', categoryCode: 'DM004', cost: '18000', price: '23000', unit: 'tuýp', stock: 12, min: 4 },
  { barcode: '8936136163328', name: 'Bàn chải đánh răng', categoryCode: 'DM004', cost: '8000', price: '12000', unit: 'cái', stock: 16, min: 4 },
  { barcode: '8936136163329', name: 'Khăn giấy hộp', categoryCode: 'DM004', cost: '18000', price: '24000', unit: 'hộp', stock: 10, min: 3 },
  { barcode: '8936136163330', name: 'Nước rửa chén', categoryCode: 'DM005', cost: '16000', price: '21000', unit: 'chai', stock: 12, min: 4 },
  { barcode: '8936136163331', name: 'Bột giặt gói nhỏ', categoryCode: 'DM005', cost: '9000', price: '12000', unit: 'gói', stock: 18, min: 5 },
  { barcode: '8936136163332', name: 'Nước lau sàn', categoryCode: 'DM005', cost: '24000', price: '30000', unit: 'chai', stock: 8, min: 3 },
  { barcode: '8936136163333', name: 'Túi rác cuộn', categoryCode: 'DM005', cost: '10000', price: '14000', unit: 'cuộn', stock: 10, min: 3 },
  { barcode: '8936136163334', name: 'Pin AA', categoryCode: 'DM005', cost: '5000', price: '8000', unit: 'viên', stock: 24, min: 6 },
  { barcode: '8936136163335', name: 'Bật lửa', categoryCode: 'DM005', cost: '4000', price: '7000', unit: 'cái', stock: 20, min: 5 },
  { barcode: '8936136163336', name: 'Màng bọc thực phẩm', categoryCode: 'DM005', cost: '12000', price: '16000', unit: 'cuộn', stock: 9, min: 3 },
];

async function main() {
  const [ownerAuth, staffAuth] = await Promise.all([
    getOrCreateAuthUser(seedEnv.SEED_OWNER_EMAIL, seedEnv.SEED_OWNER_PASSWORD, 'Chủ cửa hàng'),
    getOrCreateAuthUser(seedEnv.SEED_STAFF_EMAIL, seedEnv.SEED_STAFF_PASSWORD, 'Nhân viên'),
  ]);

  const ownerRole = await prisma.role.upsert({
    where: { code: RoleCode.OWNER },
    create: { code: RoleCode.OWNER, name: 'Chủ cửa hàng' },
    update: { name: 'Chủ cửa hàng' },
  });
  const staffRole = await prisma.role.upsert({
    where: { code: RoleCode.STAFF },
    create: { code: RoleCode.STAFF, name: 'Nhân viên' },
    update: { name: 'Nhân viên' },
  });

  await prisma.profile.upsert({
    where: { id: ownerAuth.id },
    create: {
      id: ownerAuth.id,
      username: seedEnv.SEED_OWNER_EMAIL.split('@')[0]!,
      fullName: 'Chủ cửa hàng',
      roleId: ownerRole.id,
    },
    update: {
      username: seedEnv.SEED_OWNER_EMAIL.split('@')[0]!,
      fullName: 'Chủ cửa hàng',
      roleId: ownerRole.id,
    },
  });
  await prisma.profile.upsert({
    where: { id: staffAuth.id },
    create: {
      id: staffAuth.id,
      username: seedEnv.SEED_STAFF_EMAIL.split('@')[0]!,
      fullName: 'Nhân viên',
      roleId: staffRole.id,
    },
    update: {
      username: seedEnv.SEED_STAFF_EMAIL.split('@')[0]!,
      fullName: 'Nhân viên',
      roleId: staffRole.id,
    },
  });

  await prisma.$transaction(async (tx) => {
    const categoryIds = new Map<string, string>();

    for (const category of categories) {
      const saved = await tx.category.upsert({
        where: { code: category.code },
        create: category,
        update: { name: category.name, description: category.description },
      });
      categoryIds.set(category.code, saved.id);
    }

    const existingProducts = await tx.product.findMany({
      where: { barcode: { in: products.map((product) => product.barcode) } },
      select: { barcode: true },
    });
    const existingBarcodes = new Set(existingProducts.map((product) => product.barcode));
    const productsToCreate = products.filter((product) => !existingBarcodes.has(product.barcode));
    const productData = productsToCreate.map((product) => {
      const categoryId = categoryIds.get(product.categoryCode);
      if (!categoryId) throw new Error(`Thiếu danh mục seed ${product.categoryCode}`);

      return {
        barcode: product.barcode,
        name: product.name,
        categoryId,
        costPrice: product.cost,
        sellingPrice: product.price,
        unit: product.unit,
        stockQuantity: product.stock,
        minStock: product.min,
      };
    });

    await tx.product.createMany({ data: productData, skipDuplicates: true });

    if (productsToCreate.length > 0) {
      const createdProducts = await tx.product.findMany({
        where: { barcode: { in: productsToCreate.map((product) => product.barcode) } },
        select: { id: true, barcode: true },
      });
      const productByBarcode = new Map(createdProducts.map((product) => [product.barcode, product]));
      const inventoryTransactions = productsToCreate.flatMap((product) => {
        const created = productByBarcode.get(product.barcode);
        return created
          ? [{
            productId: created.id,
            type: InventoryTransactionType.ADJUSTMENT,
            quantity: product.stock,
            stockAfter: product.stock,
            refType: 'SEED',
            createdById: ownerAuth.id,
          }]
          : [];
      });

      await tx.inventoryTransaction.createMany({ data: inventoryTransactions });
    }

    await tx.customer.upsert({
      where: { code: 'KH000001' },
      create: { code: 'KH000001', name: 'Trần Văn Bình', phone: '0900000001', isRegular: true },
      update: { name: 'Trần Văn Bình' },
    });
    await tx.customer.upsert({
      where: { code: 'KH000002' },
      create: { code: 'KH000002', name: 'Nguyễn Văn An', phone: '0900000002', isRegular: true },
      update: { name: 'Nguyễn Văn An' },
    });
    await tx.storeSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        storeName: 'Tạp hóa Hằng',
        address: '32 Phạm Xuân Ẩn, Hòa Xuân, Đà Nẵng',
        phone: '',
        bankName: '',
        bankAccountNumber: '',
        bankAccountHolder: '',
      },
      update: {},
    });
  }, { maxWait: 20000, timeout: 120000 });

  console.info('Seed hoàn tất: roles, profiles Supabase, danh mục, 30 sản phẩm và khách quen mẫu.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
