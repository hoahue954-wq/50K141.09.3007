export type Role = 'owner' | 'staff';

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  status: 'active' | 'locked';
  created_at?: string;
}

export interface Category {
  id: string;
  code: string; // VD: DM001
  name: string;
  description?: string;
}

export interface Product {
  barcode: string; // Mã sản phẩm duy nhất, gồm 13 chữ số
  name: string;
  category_id: string;
  category_name?: string;
  cost_price?: number; // Giá nhập được hiển thị cho Chủ và Nhân viên.
  selling_price: number;
  unit: string;
  stock_quantity: number;
  min_stock: number; // Tồn tối thiểu để cảnh báo
  image_url?: string;
}

export interface Customer {
  id: string;
  code: string; // VD: KH000123
  name: string;
  phone?: string;
  type: 'loyal' | 'guest'; // Khách quen hoặc khách vãng lai
  notes?: string;
  total_debt: number; // Tổng tiền các hóa đơn Chưa thanh toán
}

export interface InvoiceItem {
  product_barcode: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  cost_price?: number; // Lưu tại thời điểm bán
}

export type PaymentMethod = 'cash' | 'transfer' | 'debt';
export type InvoiceStatus = 'paid' | 'unpaid';

export interface Invoice {
  id: string;
  code: string; // VD: BH000128
  created_at: string; // ISO string dd/MM/yyyy HH:mm
  seller_id: string;
  seller_name: string;
  customer_id?: string;
  customer_name?: string;
  payment_method: PaymentMethod;
  status: InvoiceStatus; // Tiền mặt/CK: paid; Ghi nợ: unpaid
  cash_given?: number; // Tiền khách đưa (với tiền mặt)
  change_given?: number; // Tiền thừa (với tiền mặt)
  total_amount: number;
  paid_at?: string;
  payment_method_settled?: 'cash' | 'transfer'; // Phương thức thực tế khi gạch nợ
  is_deleted?: boolean; // Xóa mềm
  deleted_by?: string;
  deleted_at?: string;
  items: InvoiceItem[];
}

export interface PurchaseOrderItem {
  product_barcode: string;
  product_name: string;
  quantity: number;
  cost_price: number;
}

export interface PurchaseOrder {
  id: string;
  code: string; // VD: PHN000123
  order_date: string;
  creator_id: string;
  creator_name: string;
  status: 'saved' | 'completed'; // Đã lưu | Hoàn thành
  supplier_name?: string;
  notes?: string; // Đã thanh toán / chưa; tiền mặt / chuyển khoản
  total_amount: number;
  items: PurchaseOrderItem[];
  completed_at?: string;
  completed_by?: string;
}

export interface DisposalSlipItem {
  product_barcode: string;
  product_name: string;
  unit: string;
  quantity: number;
  cost_price?: number;
  total_value?: number;
}

export interface DisposalSlip {
  id: string;
  code: string; // VD: PHH000123
  slip_date: string;
  creator_id: string;
  creator_name: string;
  status: 'pending' | 'approved' | 'rejected'; // Chờ duyệt | Đã duyệt | Từ chối
  items: DisposalSlipItem[];
  reason: string;
  proof_image_url?: string; // Bắt buộc đối với Nhân viên
  approved_by?: string;
  approved_at?: string;
}

export interface ReturnSlipItem {
  product_barcode: string;
  product_name: string;
  quantity: number;
  selling_price: number;
  total_amount: number;
}

export interface ReturnSlip {
  id: string;
  code: string; // VD: PHD000123
  original_invoice_code: string; // Bắt buộc
  slip_date: string; // Cùng ngày dương lịch với ngày mua
  creator_id: string;
  creator_name: string;
  status: 'pending' | 'approved' | 'rejected'; // Chờ duyệt | Đã duyệt | Từ chối
  type: 'return' | 'exchange'; // Chỉ trả | Đổi hàng
  reason?: string;
  items: ReturnSlipItem[];
  exchange_items?: ReturnSlipItem[];
  total_refund: number;
  difference_amount?: number; // Chênh lệch tiền nếu đổi
  proof_image_url?: string;
  approved_by?: string;
  approved_at?: string;
}

export interface Expense {
  id: string;
  expense_date: string;
  category: 'electricity' | 'rent' | 'salary' | 'other';
  amount: number;
  notes?: string;
}

export interface StoreSettings {
  store_name: string;
  address: string;
  phone: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  target: string;
  target_id: string;
  timestamp: string;
  details?: string;
}
