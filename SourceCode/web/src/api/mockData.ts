import {
  Category,
  Customer,
  DisposalSlip,
  Expense,
  Invoice,
  Product,
  PurchaseOrder,
  ReturnSlip,
  StoreSettings,
  UserProfile,
} from '../types';

export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'usr-owner-001',
    username: 'chu@taphoahang.local',
    full_name: 'Chị Hằng (Chủ cửa hàng)',
    role: 'owner',
    status: 'active',
    created_at: '2026-01-01T08:00:00+07:00',
  },
  {
    id: 'usr-staff-001',
    username: 'nhanvien@taphoahang.local',
    full_name: 'Nguyễn Văn Nam (Nhân viên)',
    role: 'staff',
    status: 'active',
    created_at: '2026-02-01T08:00:00+07:00',
  },
];

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-1', code: 'DM001', name: 'Bánh kẹo & Snack', description: 'Bánh ngọt, bánh quy, kẹo, snack khoai tây' },
  { id: 'cat-2', code: 'DM002', name: 'Đồ uống & Giải khát', description: 'Nước ngọt, bia, nước suối, sữa' },
  { id: 'cat-3', code: 'DM003', name: 'Gia vị & Nấu ăn', description: 'Nước mắm, dầu ăn, bột ngọt, muối, tiêu' },
  { id: 'cat-4', code: 'DM004', name: 'Hóa mỹ phẩm & Tẩy rửa', description: 'Xà phòng, nước rửa chén, dầu gội, bột giặt' },
  { id: 'cat-5', code: 'DM005', name: 'Mì gói & Thực phẩm khô', description: 'Mì tôm, miến, phở ăn liền, đồ hộp' },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    barcode: '8934563123456',
    name: 'Mì tôm Hảo Hảo tôm chua cay 75g',
    category_id: 'cat-5',
    category_name: 'Mì gói & Thực phẩm khô',
    cost_price: 3800,
    selling_price: 4500,
    unit: 'gói',
    stock_quantity: 45,
    min_stock: 10,
  },
  {
    barcode: '8934563123457',
    name: 'Nước ngọt Coca-Cola lon 330ml',
    category_id: 'cat-2',
    category_name: 'Đồ uống & Giải khát',
    cost_price: 8500,
    selling_price: 10000,
    unit: 'lon',
    stock_quantity: 8, // Sắp hết
    min_stock: 15,
  },
  {
    barcode: '8934563123458',
    name: 'Nước mắm Nam Ngư Đệ Nhị 900ml',
    category_id: 'cat-3',
    category_name: 'Gia vị & Nấu ăn',
    cost_price: 24000,
    selling_price: 28000,
    unit: 'chai',
    stock_quantity: 2, // Sắp hết
    min_stock: 5,
  },
  {
    barcode: '8934563123459',
    name: 'Dầu ăn Simply Canola chai 1L',
    category_id: 'cat-3',
    category_name: 'Gia vị & Nấu ăn',
    cost_price: 52000,
    selling_price: 60000,
    unit: 'chai',
    stock_quantity: 12,
    min_stock: 5,
  },
  {
    barcode: '8934563123460',
    name: 'Bánh Chocopie Orion hộp 12 cái',
    category_id: 'cat-1',
    category_name: 'Bánh kẹo & Snack',
    cost_price: 48000,
    selling_price: 55000,
    unit: 'hộp',
    stock_quantity: 0, // Hết hàng
    min_stock: 5,
  },
  {
    barcode: '8934563123461',
    name: 'Bia Larue lon 330ml',
    category_id: 'cat-2',
    category_name: 'Đồ uống & Giải khát',
    cost_price: 11000,
    selling_price: 13000,
    unit: 'lon',
    stock_quantity: 72,
    min_stock: 24,
  },
  {
    barcode: '8934563123462',
    name: 'Xà phòng Lifebuoy bảo vệ vượt trội 90g',
    category_id: 'cat-4',
    category_name: 'Hóa mỹ phẩm & Tẩy rửa',
    cost_price: 13000,
    selling_price: 16000,
    unit: 'cục',
    stock_quantity: 20,
    min_stock: 6,
  },
  {
    barcode: '8934563123463',
    name: 'Nước rửa chén Sunlight Chanh 750g',
    category_id: 'cat-4',
    category_name: 'Hóa mỹ phẩm & Tẩy rửa',
    cost_price: 26000,
    selling_price: 32000,
    unit: 'chai',
    stock_quantity: 15,
    min_stock: 5,
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cus-1',
    code: 'KH000001',
    name: 'Cô Lan (Hàng xóm số nhà 30)',
    phone: '0905111222',
    type: 'loyal',
    notes: 'Khách quen sát nhà, thường gom hóa đơn trả cuối tháng',
    total_debt: 137000,
  },
  {
    id: 'cus-2',
    code: 'KH000002',
    name: 'Chú Ba (Thợ mộc ngõ 32)',
    phone: '0905222333',
    type: 'loyal',
    notes: 'Khách quen ngõ 32, trả tiền theo tuần',
    total_debt: 85000,
  },
  {
    id: 'cus-3',
    code: 'KH000003',
    name: 'Anh Tuấn (Công ty vật liệu)',
    phone: '0905333444',
    type: 'loyal',
    notes: 'Khách quen, thanh toán chuyển khoản',
    total_debt: 0,
  },
];

export const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv-1',
    code: 'BH000128',
    created_at: new Date().toISOString(), // Hôm nay
    seller_id: 'usr-owner-001',
    seller_name: 'Chị Hằng (Chủ)',
    customer_id: 'cus-1',
    customer_name: 'Cô Lan (Hàng xóm số nhà 30)',
    payment_method: 'debt',
    status: 'unpaid',
    total_amount: 137000,
    items: [
      {
        product_barcode: '8934563123456',
        product_name: 'Mì tôm Hảo Hảo tôm chua cay 75g',
        unit: 'gói',
        quantity: 6,
        unit_price: 4500,
        total_amount: 27000,
        cost_price: 3800,
      },
      {
        product_barcode: '8934563123459',
        product_name: 'Dầu ăn Simply Canola chai 1L',
        unit: 'chai',
        quantity: 1,
        unit_price: 60000,
        total_amount: 60000,
        cost_price: 52000,
      },
      {
        product_barcode: '8934563123457',
        product_name: 'Nước ngọt Coca-Cola lon 330ml',
        unit: 'lon',
        quantity: 5,
        unit_price: 10000,
        total_amount: 50000,
        cost_price: 8500,
      },
    ],
  },
  {
    id: 'inv-2',
    code: 'BH000129',
    created_at: new Date().toISOString(), // Hôm nay
    seller_id: 'usr-staff-001',
    seller_name: 'Nguyễn Văn Nam (Nhân viên)',
    payment_method: 'cash',
    status: 'paid',
    cash_given: 100000,
    change_given: 15000,
    total_amount: 85000,
    paid_at: new Date().toISOString(),
    items: [
      {
        product_barcode: '8934563123461',
        product_name: 'Bia Larue lon 330ml',
        unit: 'lon',
        quantity: 5,
        unit_price: 13000,
        total_amount: 65000,
        cost_price: 11000,
      },
      {
        product_barcode: '8934563123457',
        product_name: 'Nước ngọt Coca-Cola lon 330ml',
        unit: 'lon',
        quantity: 2,
        unit_price: 10000,
        total_amount: 20000,
        cost_price: 8500,
      },
    ],
  },
  {
    id: 'inv-3',
    code: 'BH000130',
    created_at: new Date(Date.now() - 86400000).toISOString(), // Hôm qua
    seller_id: 'usr-owner-001',
    seller_name: 'Chị Hằng (Chủ)',
    customer_id: 'cus-2',
    customer_name: 'Chú Ba (Thợ mộc ngõ 32)',
    payment_method: 'debt',
    status: 'unpaid',
    total_amount: 85000,
    items: [
      {
        product_barcode: '8934563123458',
        product_name: 'Nước mắm Nam Ngư Đệ Nhị 900ml',
        unit: 'chai',
        quantity: 2,
        unit_price: 28000,
        total_amount: 56000,
        cost_price: 24000,
      },
      {
        product_barcode: '8934563123462',
        product_name: 'Xà phòng Lifebuoy bảo vệ vượt trội 90g',
        unit: 'cục',
        quantity: 1,
        unit_price: 16000,
        total_amount: 16000,
        cost_price: 13000,
      },
      {
        product_barcode: '8934563123461',
        product_name: 'Bia Larue lon 330ml',
        unit: 'lon',
        quantity: 1,
        unit_price: 13000,
        total_amount: 13000,
        cost_price: 11000,
      },
    ],
  },
];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 'po-1',
    code: 'PHN000123',
    order_date: new Date(Date.now() - 86400000).toISOString(),
    creator_id: 'usr-owner-001',
    creator_name: 'Chị Hằng (Chủ)',
    status: 'completed',
    supplier_name: 'Đại lý bia nước ngọt Hòa Xuân',
    notes: 'Đã thanh toán tiền mặt',
    total_amount: 1320000,
    completed_at: new Date(Date.now() - 86400000).toISOString(),
    completed_by: 'Chị Hằng (Chủ)',
    items: [
      {
        product_barcode: '8934563123461',
        product_name: 'Bia Larue lon 330ml',
        quantity: 120,
        cost_price: 11000,
      },
    ],
  },
  {
    id: 'po-2',
    code: 'PHN000124',
    order_date: new Date().toISOString(),
    creator_id: 'usr-staff-001',
    creator_name: 'Nguyễn Văn Nam (Nhân viên)',
    status: 'saved', // Nhân viên lưu, chờ Chủ duyệt/sửa
    supplier_name: 'Nhà phân phối Masan Đà Nẵng',
    notes: 'Giao hàng buổi sáng, chưa thanh toán',
    total_amount: 480000,
    items: [
      {
        product_barcode: '8934563123458',
        product_name: 'Nước mắm Nam Ngư Đệ Nhị 900ml',
        quantity: 20,
        cost_price: 24000,
      },
    ],
  },
];

export const INITIAL_DISPOSAL_SLIPS: DisposalSlip[] = [
  {
    id: 'disp-1',
    code: 'PHH000123',
    slip_date: new Date().toISOString(),
    creator_id: 'usr-staff-001',
    creator_name: 'Nguyễn Văn Nam (Nhân viên)',
    status: 'pending',
    reason: 'Chuột cắn rách bao bì và gói mì bị ẩm mốc',
    proof_image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600',
    items: [
      {
        product_barcode: '8934563123456',
        product_name: 'Mì tôm Hảo Hảo tôm chua cay 75g',
        unit: 'gói',
        quantity: 5,
        cost_price: 3800,
        total_value: 19000,
      },
    ],
  },
];

export const INITIAL_RETURN_SLIPS: ReturnSlip[] = [
  {
    id: 'ret-1',
    code: 'PHD000123',
    original_invoice_code: 'BH000129',
    slip_date: new Date().toISOString(),
    creator_id: 'usr-staff-001',
    creator_name: 'Nguyễn Văn Nam (Nhân viên)',
    status: 'pending',
    type: 'return',
    total_refund: 20000,
    proof_image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600',
    items: [
      {
        product_barcode: '8934563123457',
        product_name: 'Nước ngọt Coca-Cola lon 330ml',
        quantity: 2,
        selling_price: 10000,
        total_amount: 20000,
      },
    ],
  },
];

export const INITIAL_EXPENSES: Expense[] = [
  {
    id: 'exp-1',
    expense_date: '2026-11-01T09:00:00+07:00',
    category: 'rent',
    amount: 3500000,
    notes: 'Tiền thuê mặt bằng tạp hóa tháng 11/2026',
  },
  {
    id: 'exp-2',
    expense_date: '2026-11-05T14:30:00+07:00',
    category: 'electricity',
    amount: 680000,
    notes: 'Tiền điện sinh hoạt và tủ mát tháng 10/2026',
  },
];

export const INITIAL_STORE_SETTINGS: StoreSettings = {
  store_name: 'Tạp hóa Hằng',
  address: '32 Phạm Xuân Ẩn, Hòa Xuân, Cẩm Lệ, Đà Nẵng',
  phone: '0905 123 456',
  bank_name: 'MBBank',
  bank_account_number: '0905123456',
  bank_account_holder: 'NGUYEN THI HANG',
};
