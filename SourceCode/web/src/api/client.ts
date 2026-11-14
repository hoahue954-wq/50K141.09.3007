import {
  AuditLog,
  Category,
  Customer,
  DisposalSlip,
  Expense,
  Invoice,
  Product,
  PurchaseOrder,
  ReturnSlip,
  Role,
  StoreSettings,
  UserProfile,
} from '../types';
import {
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS,
  INITIAL_DISPOSAL_SLIPS,
  INITIAL_EXPENSES,
  INITIAL_INVOICES,
  INITIAL_PRODUCTS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_RETURN_SLIPS,
  INITIAL_STORE_SETTINGS,
  INITIAL_USERS,
} from './mockData';
import { supabase } from './supabase';
import { formatDate, generateCode, isSameDayVN } from '../utils/format';

const IS_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// --- LocalStorage persistence cho Mock Data ---
function getStorage<T>(key: string, initial: T): T {
  try {
    const saved = localStorage.getItem(`th_hang_${key}`);
    return saved ? JSON.parse(saved) : initial;
  } catch {
    return initial;
  }
}

function setStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`th_hang_${key}`, JSON.stringify(data));
  } catch (e) {
    console.error('LocalStorage write error', e);
  }
}

// Khởi tạo state mock nếu chưa có
function ensureMockState() {
  if (!localStorage.getItem('th_hang_initialized')) {
    setStorage('users', INITIAL_USERS);
    setStorage('categories', INITIAL_CATEGORIES);
    setStorage('products', INITIAL_PRODUCTS);
    setStorage('customers', INITIAL_CUSTOMERS);
    setStorage('invoices', INITIAL_INVOICES);
    setStorage('purchase_orders', INITIAL_PURCHASE_ORDERS);
    setStorage('disposal_slips', INITIAL_DISPOSAL_SLIPS);
    setStorage('return_slips', INITIAL_RETURN_SLIPS);
    setStorage('expenses', INITIAL_EXPENSES);
    setStorage('store_settings', INITIAL_STORE_SETTINGS);
    setStorage('audit_logs', []);
    setStorage('current_user', INITIAL_USERS[0]); // Mặc định Chủ
    localStorage.setItem('th_hang_initialized', 'true');
  }
}

if (IS_MOCK) {
  ensureMockState();
}

export function resetMockDataToDefault() {
  localStorage.removeItem('th_hang_initialized');
  localStorage.removeItem('th_hang_users');
  localStorage.removeItem('th_hang_categories');
  localStorage.removeItem('th_hang_products');
  localStorage.removeItem('th_hang_customers');
  localStorage.removeItem('th_hang_invoices');
  localStorage.removeItem('th_hang_purchase_orders');
  localStorage.removeItem('th_hang_disposal_slips');
  localStorage.removeItem('th_hang_return_slips');
  localStorage.removeItem('th_hang_expenses');
  localStorage.removeItem('th_hang_store_settings');
  localStorage.removeItem('th_hang_audit_logs');
  localStorage.removeItem('th_hang_current_user');
  ensureMockState();
}

// --- Quản lý Refresh Token dùng chung cho các request song song (Single-flight) ---
let refreshPromise: Promise<string | null> | null = null;

async function doSharedTokenRefresh(): Promise<string | null> {
  if (IS_MOCK) return null;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session?.access_token) {
          return null;
        }
        return data.session.access_token;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

// Xử lý khi phiên đăng nhập hết hạn hoàn toàn
function handleAuthExpired(): void {
  if (IS_MOCK) return;
  supabase.auth.signOut().catch(() => {});
  sessionStorage.setItem('th_hang_session_expired', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
  if (!window.location.hash.includes('/login')) {
    window.location.hash = '#/login';
  }
}

// Hàm lấy token Supabase khi gọi API thật
async function getAuthHeader(): Promise<Record<string, string>> {
  if (IS_MOCK) return {};
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;

  // Nếu getSession() không có token thì thử refreshSession() một lần (dùng chung lock)
  if (!token) {
    token = (await doSharedTokenRefresh()) || undefined;
  }

  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Hàm fetch wrapper khi dùng API thật (tự động thử lại 1 lần nếu 401, hỗ trợ timeout)
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { timeout?: number } = {},
  isRetry = false
): Promise<T> {
  const headers = await getAuthHeader();
  const { timeout, ...fetchOptions } = options;

  let timer: any = null;
  let signal = fetchOptions.signal;

  if (timeout && !signal) {
    const controller = new AbortController();
    signal = controller.signal;
    timer = setTimeout(() => {
      controller.abort();
    }, timeout);
  }

  let res: Response;
  try {
    const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
    res = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      signal,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
        ...fetchOptions.headers,
      },
    });
  } catch (err: any) {
    if (timer) clearTimeout(timer);
    throw err;
  }
  if (timer) clearTimeout(timer);

  if (!res.ok) {
    // Nếu API trả 401 và chưa thử lại: refresh token rồi gửi lại đúng 1 lần
    if (res.status === 401 && !isRetry && !IS_MOCK) {
      const newToken = await doSharedTokenRefresh();
      if (newToken) {
        return apiFetch<T>(
          endpoint,
          {
            ...options,
            headers: {
              ...options.headers,
              Authorization: `Bearer ${newToken}`,
            },
          },
          true
        );
      } else {
        // Refresh thất bại: đăng xuất sạch và chuyển về /login
        handleAuthExpired();
        throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      }
    }

    if (res.status === 401 && isRetry && !IS_MOCK) {
      handleAuthExpired();
      throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    }

    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi API (${res.status}): ${res.statusText}`);
  }

  return res.json();
}

// Tạo log thao tác (audit log)
function logAudit(action: string, target: string, targetId: string, details?: string) {
  const user = api.auth.getCurrentUser();
  if (!user) return;
  const logs = getStorage<AuditLog[]>('audit_logs', []);
  logs.unshift({
    id: 'log-' + Date.now(),
    user_id: user.id,
    user_name: user.full_name,
    action,
    target,
    target_id: targetId,
    timestamp: new Date().toISOString(),
    details,
  });
  setStorage('audit_logs', logs.slice(0, 100)); // Lưu tối đa 100 log gần nhất
}

// Giả lập độ trễ mạng cho mock mode (150ms)
const mockDelay = () => new Promise((resolve) => setTimeout(resolve, 150));

function getStockValidationError(
  products: Product[],
  items: { product_barcode: string; quantity: number }[]
): string | null {
  const requestedByBarcode = new Map<string, number>();
  for (const item of items) {
    requestedByBarcode.set(
      item.product_barcode,
      (requestedByBarcode.get(item.product_barcode) || 0) + item.quantity
    );
  }

  for (const [barcode, quantity] of requestedByBarcode) {
    const product = products.find((entry) => entry.barcode === barcode);
    if (!product) return `Không tìm thấy sản phẩm có mã vạch ${barcode}.`;
    if (quantity > product.stock_quantity) {
      return `Tồn kho "${product.name}" chỉ còn ${product.stock_quantity} ${product.unit}.`;
    }
  }

  return null;
}

// ==========================================
// TOÀN BỘ LỚP API DUY NHẤT CỦA HỆ THỐNG
// ==========================================
export const api = {
  // 1. Xác thực & Tài khoản người dùng
  auth: {
    async login(username: string, password: string): Promise<UserProfile> {
      if (IS_MOCK) {
        await mockDelay();
        const users = getStorage<UserProfile[]>('users', INITIAL_USERS);
        const user = users.find(
          (u) => u.username.toLowerCase() === username.trim().toLowerCase()
        );
        if (!user) {
          throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
        }
        if (user.status === 'locked') {
          throw new Error('Tài khoản này đã bị khóa. Vui lòng liên hệ Chủ cửa hàng.');
        }
        setStorage('current_user', user);
        return user;
      }

      // Gọi Supabase Auth thật
      const email = username.includes('@') ? username : `${username}@taphoahang.local`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw new Error(error.message);
      }
      // Tra thông tin profile từ API
      return apiFetch<UserProfile>('/auth/me');
    },

    getCurrentUser(): UserProfile | null {
      if (IS_MOCK) {
        return getStorage<UserProfile | null>('current_user', INITIAL_USERS[0]);
      }
      return null;
    },

    async restoreSession(): Promise<UserProfile | null> {
      if (IS_MOCK) {
        return api.auth.getCurrentUser();
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          return null;
        }
        // Gọi API backend /auth/me để lấy profile người dùng
        const profile = await apiFetch<UserProfile>('/auth/me');
        return profile;
      } catch (err) {
        console.error('Không thể khôi phục phiên đăng nhập:', err);
        return null;
      }
    },

    onAuthStateChange(callback: (user: UserProfile | null) => void): () => void {
      if (IS_MOCK) return () => {};
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          callback(null);
        } else if (event === 'SIGNED_IN') {
          try {
            const profile = await apiFetch<UserProfile>('/auth/me');
            callback(profile);
          } catch {
            // Không làm gián đoạn UI nếu /auth/me lỗi tạm thời
          }
        }
      });
      return () => data.subscription.unsubscribe();
    },

    async logout(): Promise<void> {
      if (IS_MOCK) {
        await mockDelay();
        localStorage.removeItem('th_hang_current_user');
        return;
      }
      await supabase.auth.signOut();
    },

    async changePassword(oldPassword: string, newPassword: string): Promise<void> {
      if (IS_MOCK) {
        await mockDelay();
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
    },

    // Dành riêng cho chế độ Mock: Chuyển vai trò nhanh Chủ / Nhân viên
    switchMockRole(role: Role): UserProfile {
      const users = getStorage<UserProfile[]>('users', INITIAL_USERS);
      const targetUser = users.find((u) => u.role === role) || users[0];
      setStorage('current_user', targetUser);
      return targetUser;
    },
  },

  // 2. Sản phẩm (Tuân thủ phân quyền: Nhân viên không thấy giá nhập)
  products: {
    async list(): Promise<Product[]> {
      if (IS_MOCK) {
        await mockDelay();
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const currentUser = api.auth.getCurrentUser();
        // Nếu là Nhân viên: xóa trường giá nhập (cost_price)
        if (currentUser?.role === 'staff') {
          return products.map(({ cost_price, ...rest }) => rest as Product);
        }
        return products;
      }
      return apiFetch<Product[]>('/products');
    },

    async getByBarcode(barcode: string): Promise<Product | null> {
      if (IS_MOCK) {
        await mockDelay();
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const prod = products.find((p) => p.barcode === barcode);
        if (!prod) return null;
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role === 'staff') {
          const { cost_price, ...rest } = prod;
          return rest as Product;
        }
        return prod;
      }
      return apiFetch<Product>(`/products/${barcode}`);
    },

    async create(product: Omit<Product, 'stock_quantity'> & { stock_quantity?: number }): Promise<Product> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền tạo sản phẩm.');
        }
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        if (!/^\d{13}$/.test(product.barcode)) {
          throw new Error('Mã vạch sản phẩm phải gồm đúng 13 chữ số.');
        }
        if (products.some((p) => p.barcode === product.barcode)) {
          throw new Error(`Mã vạch ${product.barcode} đã tồn tại trong hệ thống.`);
        }
        if (
          products.some(
            (p) => p.name.trim().toLowerCase() === product.name.trim().toLowerCase()
          )
        ) {
          throw new Error(`Tên sản phẩm "${product.name}" đã tồn tại trong hệ thống.`);
        }
        const newProd: Product = {
          ...product,
          stock_quantity: product.stock_quantity ?? 0,
        };
        products.push(newProd);
        setStorage('products', products);
        logAudit('Tạo sản phẩm', 'Sản phẩm', newProd.barcode, `Tên: ${newProd.name}`);
        return newProd;
      }
      return apiFetch<Product>('/products', {
        method: 'POST',
        body: JSON.stringify(product),
      });
    },

    async update(barcode: string, updates: Partial<Product>): Promise<Product> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền sửa sản phẩm.');
        }
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const index = products.findIndex((p) => p.barcode === barcode);
        if (index === -1) throw new Error('Không tìm thấy sản phẩm.');
        if (
          updates.name &&
          products.some(
            (p) =>
              p.barcode !== barcode &&
              p.name.trim().toLowerCase() === updates.name!.trim().toLowerCase()
          )
        ) {
          throw new Error(`Tên sản phẩm "${updates.name}" đã trùng với sản phẩm khác.`);
        }
        products[index] = { ...products[index], ...updates };
        setStorage('products', products);
        logAudit('Cập nhật sản phẩm', 'Sản phẩm', barcode);
        return products[index];
      }
      return apiFetch<Product>(`/products/${barcode}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    async delete(barcode: string): Promise<void> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền xóa sản phẩm.');
        }
        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES);
        const hasInvoiceRef = invoices.some(
          (inv) => !inv.is_deleted && inv.items.some((i) => i.product_barcode === barcode)
        );
        if (hasInvoiceRef) {
          throw new Error(
            'Không thể xóa sản phẩm này vì đã có dữ liệu trong lịch sử hóa đơn bán hàng.'
          );
        }
        let products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        products = products.filter((p) => p.barcode !== barcode);
        setStorage('products', products);
        logAudit('Xóa sản phẩm', 'Sản phẩm', barcode);
        return;
      }
      return apiFetch<void>(`/products/${barcode}`, { method: 'DELETE' });
    },
  },

  // 3. Danh mục
  categories: {
    async list(): Promise<Category[]> {
      if (IS_MOCK) {
        await mockDelay();
        return getStorage<Category[]>('categories', INITIAL_CATEGORIES);
      }
      return apiFetch<Category[]>('/categories');
    },

    async create(category: Omit<Category, 'id' | 'code'>): Promise<Category> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền tạo danh mục.');
        }
        const categories = getStorage<Category[]>('categories', INITIAL_CATEGORIES);
        const code = generateCode('category', categories.map((item) => item.code));
        if (categories.some((item) => item.code === code)) {
          throw new Error(`Mã danh mục "${code}" đã tồn tại.`);
        }
        const newCat: Category = { ...category, code, id: 'cat-' + Date.now() };
        categories.push(newCat);
        setStorage('categories', categories);
        logAudit('Tạo danh mục', 'Danh mục', newCat.id, newCat.name);
        return newCat;
      }
      return apiFetch<Category>('/categories', {
        method: 'POST',
        body: JSON.stringify(category),
      });
    },

    async update(id: string, updates: Partial<Category>): Promise<Category> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền sửa danh mục.');
        }
        const categories = getStorage<Category[]>('categories', INITIAL_CATEGORIES);
        const index = categories.findIndex((c) => c.id === id);
        if (index === -1) throw new Error('Không tìm thấy danh mục.');
        categories[index] = { ...categories[index], ...updates };
        setStorage('categories', categories);
        // Đồng bộ cập nhật category_name trên danh sách sản phẩm nếu đổi tên
        if (updates.name) {
          const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
          products.forEach((p) => {
            if (p.category_id === id) p.category_name = updates.name;
          });
          setStorage('products', products);
        }
        logAudit('Sửa danh mục', 'Danh mục', id, updates.name);
        return categories[index];
      }
      return apiFetch<Category>(`/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    async delete(id: string): Promise<void> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền xóa danh mục.');
        }
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const count = products.filter((p) => p.category_id === id).length;
        if (count > 0) {
          throw new Error(
            `Không thể xóa danh mục vì vẫn còn ${count} sản phẩm thuộc danh mục này.`
          );
        }
        let categories = getStorage<Category[]>('categories', INITIAL_CATEGORIES);
        categories = categories.filter((c) => c.id !== id);
        setStorage('categories', categories);
        logAudit('Xóa danh mục', 'Danh mục', id);
        return;
      }
      return apiFetch<void>(`/categories/${id}`, { method: 'DELETE' });
    },
  },

  // 4. Khách hàng & Công nợ
  customers: {
    async list(): Promise<Customer[]> {
      if (IS_MOCK) {
        await mockDelay();
        return getStorage<Customer[]>('customers', INITIAL_CUSTOMERS);
      }
      return apiFetch<Customer[]>('/customers');
    },

    async create(customer: Omit<Customer, 'id' | 'code' | 'total_debt'>): Promise<Customer> {
      if (IS_MOCK) {
        await mockDelay();
        const customers = getStorage<Customer[]>('customers', INITIAL_CUSTOMERS);
        const newCust: Customer = {
          ...customer,
          id: 'cus-' + Date.now(),
          code: generateCode('customer', customers.map((customer) => customer.code)),
          total_debt: 0,
        };
        customers.push(newCust);
        setStorage('customers', customers);
        logAudit('Tạo khách hàng', 'Khách hàng', newCust.id, newCust.name);
        return newCust;
      }
      return apiFetch<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify(customer),
      });
    },

    async update(id: string, updates: Partial<Customer>): Promise<Customer> {
      if (IS_MOCK) {
        await mockDelay();
        const customers = getStorage<Customer[]>('customers', INITIAL_CUSTOMERS);
        const index = customers.findIndex((c) => c.id === id);
        if (index === -1) throw new Error('Không tìm thấy khách hàng.');
        customers[index] = { ...customers[index], ...updates };
        setStorage('customers', customers);
        return customers[index];
      }
      return apiFetch<Customer>(`/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    async delete(id: string): Promise<void> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền xóa khách hàng.');
        }
        let customers = getStorage<Customer[]>('customers', INITIAL_CUSTOMERS);
        customers = customers.filter((c) => c.id !== id);
        setStorage('customers', customers);
        logAudit('Xóa khách hàng', 'Khách hàng', id);
        return;
      }
      return apiFetch<void>(`/customers/${id}`, { method: 'DELETE' });
    },
  },

  // 5. Bán hàng & Hóa đơn
  invoices: {
    async list(filters?: { date?: string; status?: string; search?: string }): Promise<Invoice[]> {
      if (IS_MOCK) {
        await mockDelay();
        let invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES);
        // Lọc bỏ các hóa đơn đã xóa mềm (trừ khi xem chi tiết hoặc phục vụ kiểm tra)
        invoices = invoices.filter((i) => !i.is_deleted);

        if (filters?.date) {
          invoices = invoices.filter((i) => formatDate(i.created_at) === filters.date);
        }
        if (filters?.status) {
          invoices = invoices.filter((i) => i.status === filters.status);
        }
        if (filters?.search) {
          const q = filters.search.toLowerCase();
          invoices = invoices.filter(
            (i) =>
              i.code.toLowerCase().includes(q) ||
              (i.customer_name && i.customer_name.toLowerCase().includes(q))
          );
        }
        return invoices.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      const params = new URLSearchParams(filters as Record<string, string>).toString();
      return apiFetch<Invoice[]>(`/invoices?${params}`);
    },

    async getByCode(code: string): Promise<Invoice | null> {
      if (IS_MOCK) {
        await mockDelay();
        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES);
        return invoices.find((i) => i.code === code && !i.is_deleted) || null;
      }
      return apiFetch<Invoice>(`/invoices/code/${code}`);
    },

    async create(data: {
      customer_id?: string;
      customer_name?: string;
      payment_method: 'cash' | 'transfer' | 'debt';
      cash_given?: number;
      items: {
        product_barcode: string;
        product_name: string;
        unit: string;
        quantity: number;
        unit_price: number;
      }[];
    }): Promise<Invoice> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (!currentUser) throw new Error('Vui lòng đăng nhập trước khi bán hàng.');

        if (!data.items || data.items.length === 0) {
          throw new Error('Hóa đơn phải có ít nhất một sản phẩm.');
        }

        // Quy tắc: Khách vãng lai không được ghi nợ
        if (data.payment_method === 'debt' && !data.customer_id) {
          throw new Error('Ghi nợ bắt buộc phải chọn khách quen. Khách vãng lai không được ghi nợ.');
        }

        const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const changeGiven =
          data.payment_method === 'cash' && data.cash_given !== undefined
            ? Math.max(0, data.cash_given - totalAmount)
            : 0;

        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES);
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const stockError = getStockValidationError(products, data.items);
        if (stockError) {
          throw new Error(stockError);
        }

        // Lưu dòng hàng kèm giá vốn hiện tại
        const invoiceItems = data.items.map((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          return {
            ...item,
            total_amount: item.quantity * item.unit_price,
            cost_price: prod?.cost_price || 0,
          };
        });

        const newInvoice: Invoice = {
          id: 'inv-' + Date.now(),
          code: generateCode('invoice', invoices.map((invoice) => invoice.code)),
          created_at: new Date().toISOString(),
          seller_id: currentUser.id,
          seller_name: currentUser.full_name,
          customer_id: data.customer_id,
          customer_name: data.customer_name,
          payment_method: data.payment_method,
          status: data.payment_method === 'debt' ? 'unpaid' : 'paid',
          cash_given: data.cash_given,
          change_given: changeGiven,
          total_amount: totalAmount,
          paid_at: data.payment_method !== 'debt' ? new Date().toISOString() : undefined,
          items: invoiceItems,
        };

        // Trừ tồn kho tự động
        data.items.forEach((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          if (prod) {
            prod.stock_quantity = Math.max(-999, prod.stock_quantity - item.quantity);
          }
        });
        setStorage('products', products);

        // Nếu ghi nợ: cộng vào tổng nợ của khách
        if (data.payment_method === 'debt' && data.customer_id) {
          const customers = getStorage<Customer[]>('customers', INITIAL_CUSTOMERS);
          const cust = customers.find((c) => c.id === data.customer_id);
          if (cust) {
            cust.total_debt += totalAmount;
            setStorage('customers', customers);
          }
        }

        invoices.unshift(newInvoice);
        setStorage('invoices', invoices);

        logAudit(
          'Tạo hóa đơn',
          'Hóa đơn',
          newInvoice.code,
          `Tổng: ${totalAmount} ₫, PT: ${data.payment_method}`
        );
        return newInvoice;
      }

      return apiFetch<Invoice>('/invoices', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    // Thu nợ hóa đơn chưa thanh toán.
    async settleDebt(
      invoiceId: string,
      paymentMethod: 'cash' | 'transfer',
      amountReceived: number
    ): Promise<Invoice> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (!currentUser) throw new Error('Vui lòng đăng nhập.');

        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES);
        const inv = invoices.find((i) => i.id === invoiceId);
        if (!inv) throw new Error('Không tìm thấy hóa đơn.');
        if (inv.status === 'paid') throw new Error('Hóa đơn này đã được thanh toán rồi.');
        if (amountReceived < inv.total_amount) {
          throw new Error('Số tiền thanh toán phải bằng hoặc lớn hơn số cần trả.');
        }

        inv.status = 'paid';
        inv.paid_at = new Date().toISOString();
        inv.payment_method_settled = paymentMethod;
        inv.cash_given = amountReceived;
        inv.change_given = amountReceived - inv.total_amount;

        // Giảm nợ của khách hàng tương ứng
        if (inv.customer_id) {
          const customers = getStorage<Customer[]>('customers', INITIAL_CUSTOMERS);
          const cust = customers.find((c) => c.id === inv.customer_id);
          if (cust) {
            cust.total_debt = Math.max(0, cust.total_debt - inv.total_amount);
            setStorage('customers', customers);
          }
        }

        setStorage('invoices', invoices);
        logAudit(
          'Gạch nợ hóa đơn',
          'Hóa đơn',
          inv.code,
          `Số tiền: ${inv.total_amount} ₫, phương thức: ${paymentMethod}`
        );
        return inv;
      }

      return apiFetch<Invoice>(`/invoices/${invoiceId}/settle`, {
        method: 'POST',
        body: JSON.stringify({ payment_method: paymentMethod, amount_received: amountReceived }),
      });
    },

    // Xóa hóa đơn mềm & hoàn lại tồn kho (Chỉ Chủ)
    async delete(invoiceId: string): Promise<void> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền xóa hóa đơn.');
        }

        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES);
        const inv = invoices.find((i) => i.id === invoiceId);
        if (!inv) throw new Error('Không tìm thấy hóa đơn.');

        inv.is_deleted = true;
        inv.deleted_by = currentUser.full_name;
        inv.deleted_at = new Date().toISOString();

        // Hoàn lại tồn kho
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        inv.items.forEach((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          if (prod) {
            prod.stock_quantity += item.quantity;
          }
        });
        setStorage('products', products);

        // Nếu hóa đơn nợ chưa trả thì giảm nợ cho khách
        if (inv.status === 'unpaid' && inv.customer_id) {
          const customers = getStorage<Customer[]>('customers', INITIAL_CUSTOMERS);
          const cust = customers.find((c) => c.id === inv.customer_id);
          if (cust) {
            cust.total_debt = Math.max(0, cust.total_debt - inv.total_amount);
            setStorage('customers', customers);
          }
        }

        setStorage('invoices', invoices);
        logAudit('Xóa hóa đơn', 'Hóa đơn', inv.code, `Hoàn lại ${inv.items.length} mặt hàng`);
        return;
      }

      return apiFetch<void>(`/invoices/${invoiceId}`, { method: 'DELETE' });
    },
  },

  // 6. Nhập hàng (Luồng: Nhân viên bấm Lưu; Chủ sửa và Hoàn thành)
  purchaseOrders: {
    async list(): Promise<PurchaseOrder[]> {
      if (IS_MOCK) {
        await mockDelay();
        const pos = getStorage<PurchaseOrder[]>('purchase_orders', INITIAL_PURCHASE_ORDERS);
        const currentUser = api.auth.getCurrentUser();
        // Nhân viên chỉ xem phiếu do mình lập (SPEC Mục 8)
        if (currentUser?.role === 'staff') {
          return pos.filter((p) => p.creator_id === currentUser.id);
        }
        return pos.sort(
          (a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
        );
      }
      return apiFetch<PurchaseOrder[]>('/purchase-orders');
    },

    async create(data: {
      code?: string;
      order_date?: string;
      supplier_name?: string;
      notes?: string;
      items: {
        product_barcode: string;
        product_name: string;
        quantity: number;
        cost_price: number;
      }[];
    }): Promise<PurchaseOrder> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (!currentUser) throw new Error('Vui lòng đăng nhập.');

        const pos = getStorage<PurchaseOrder[]>('purchase_orders', INITIAL_PURCHASE_ORDERS);
        const total = data.items.reduce((s, i) => s + i.quantity * i.cost_price, 0);

        const newPo: PurchaseOrder = {
          id: 'po-' + Date.now(),
          code: data.code || generateCode('purchaseOrder', pos.map((order) => order.code)),
          order_date: data.order_date || new Date().toISOString(),
          creator_id: currentUser.id,
          creator_name: currentUser.full_name,
          status: 'saved', // Luôn là Đã lưu khi tạo
          supplier_name: data.supplier_name,
          notes: data.notes,
          total_amount: total,
          items: data.items,
        };

        // Lưu ý: Tồn kho KHÔNG đổi khi ở trạng thái Đã lưu
        pos.unshift(newPo);
        setStorage('purchase_orders', pos);
        logAudit('Lập phiếu nhập hàng', 'Phiếu nhập', newPo.code, `Tổng tiền: ${total} ₫`);
        return newPo;
      }
      return apiFetch<PurchaseOrder>('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(data),
        timeout: 50000, // Timeout 50s cho request lưu phiếu
      });
    },

    async update(
      id: string,
      updates: {
        supplier_name?: string;
        notes?: string;
        items: {
          product_barcode: string;
          product_name: string;
          quantity: number;
          cost_price: number;
        }[];
      }
    ): Promise<PurchaseOrder> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền sửa phiếu nhập.');
        }

        const pos = getStorage<PurchaseOrder[]>('purchase_orders', INITIAL_PURCHASE_ORDERS);
        const po = pos.find((p) => p.id === id);
        if (!po) throw new Error('Không tìm thấy phiếu nhập.');
        if (po.status === 'completed') {
          throw new Error('Phiếu nhập đã hoàn thành không được phép sửa.');
        }

        const total = updates.items.reduce((s, i) => s + i.quantity * i.cost_price, 0);
        po.supplier_name = updates.supplier_name;
        po.notes = updates.notes;
        po.items = updates.items;
        po.total_amount = total;

        setStorage('purchase_orders', pos);
        logAudit('Sửa phiếu nhập', 'Phiếu nhập', po.code);
        return po;
      }
      return apiFetch<PurchaseOrder>(`/purchase-orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    // Hoàn thành phiếu nhập -> Tăng tồn kho & Cập nhật giá nhập
    async complete(id: string): Promise<PurchaseOrder> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền hoàn thành phiếu nhập.');
        }

        const pos = getStorage<PurchaseOrder[]>('purchase_orders', INITIAL_PURCHASE_ORDERS);
        const po = pos.find((p) => p.id === id);
        if (!po) throw new Error('Không tìm thấy phiếu nhập.');
        if (po.status === 'completed') {
          throw new Error('Phiếu nhập này đã được hoàn thành trước đó.');
        }

        po.status = 'completed';
        po.completed_at = new Date().toISOString();
        po.completed_by = currentUser.full_name;

        // Cộng tồn kho và cập nhật giá nhập hiện tại
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        po.items.forEach((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          if (prod) {
            prod.stock_quantity += item.quantity;
            prod.cost_price = item.cost_price; // Cập nhật giá nhập mới nhất
          }
        });
        setStorage('products', products);
        setStorage('purchase_orders', pos);

        logAudit('Hoàn thành phiếu nhập', 'Phiếu nhập', po.code, `Cộng kho ${po.items.length} mặt hàng`);
        return po;
      }
      return apiFetch<PurchaseOrder>(`/purchase-orders/${id}/complete`, {
        method: 'POST',
      });
    },
  },

  // 7. Hủy hàng (Bắt buộc minh chứng ảnh với Nhân viên)
  disposalSlips: {
    async list(): Promise<DisposalSlip[]> {
      if (IS_MOCK) {
        await mockDelay();
        return getStorage<DisposalSlip[]>('disposal_slips', INITIAL_DISPOSAL_SLIPS);
      }
      return apiFetch<DisposalSlip[]>('/disposal-slips');
    },

    async create(data: {
      reason: string;
      proof_image_url?: string;
      items: {
        product_barcode: string;
        product_name: string;
        unit: string;
        quantity: number;
      }[];
    }): Promise<DisposalSlip> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (!currentUser) throw new Error('Vui lòng đăng nhập.');

        if (!data.reason?.trim()) {
          throw new Error('Bắt buộc phải nhập lý do hủy hàng.');
        }

        // Nhân viên bắt buộc đính kèm ảnh minh chứng (SPEC Mục 6.6 & 8)
        if (currentUser.role === 'staff' && !data.proof_image_url) {
          throw new Error('Nhân viên bắt buộc phải đính kèm ảnh minh chứng tình trạng sản phẩm.');
        }

        const slips = getStorage<DisposalSlip[]>('disposal_slips', INITIAL_DISPOSAL_SLIPS);
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const stockError = getStockValidationError(products, data.items);
        if (stockError) throw new Error(stockError);

        const slipItems = data.items.map((i) => {
          const prod = products.find((p) => p.barcode === i.product_barcode);
          const cost = prod?.cost_price || 0;
          return {
            ...i,
            cost_price: cost,
            total_value: cost * i.quantity,
          };
        });

        const newSlip: DisposalSlip = {
          id: 'disp-' + Date.now(),
          code: generateCode('disposal', slips.map((slip) => slip.code)),
          slip_date: new Date().toISOString(),
          creator_id: currentUser.id,
          creator_name: currentUser.full_name,
          status: currentUser.role === 'owner' ? 'approved' : 'pending', // Chủ lập thì duyệt ngay
          reason: data.reason,
          proof_image_url: data.proof_image_url,
          items: slipItems,
          approved_by: currentUser.role === 'owner' ? currentUser.full_name : undefined,
          approved_at: currentUser.role === 'owner' ? new Date().toISOString() : undefined,
        };

        // Nếu Chủ lập và duyệt ngay -> trừ kho ngay
        if (newSlip.status === 'approved') {
          slipItems.forEach((item) => {
            const prod = products.find((p) => p.barcode === item.product_barcode);
            if (prod) {
              prod.stock_quantity = Math.max(0, prod.stock_quantity - item.quantity);
            }
          });
          setStorage('products', products);
        }

        slips.unshift(newSlip);
        setStorage('disposal_slips', slips);
        logAudit('Tạo phiếu hủy', 'Phiếu hủy', newSlip.code, newSlip.reason);
        return newSlip;
      }
      return apiFetch<DisposalSlip>('/disposal-slips', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async approve(id: string): Promise<DisposalSlip> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền duyệt phiếu hủy.');
        }

        const slips = getStorage<DisposalSlip[]>('disposal_slips', INITIAL_DISPOSAL_SLIPS);
        const slip = slips.find((s) => s.id === id);
        if (!slip) throw new Error('Không tìm thấy phiếu hủy.');
        if (slip.status !== 'pending') throw new Error('Phiếu hủy không ở trạng thái chờ duyệt.');

        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const stockError = getStockValidationError(products, slip.items);
        if (stockError) throw new Error(stockError);

        slip.status = 'approved';
        slip.approved_by = currentUser.full_name;
        slip.approved_at = new Date().toISOString();

        // Trừ tồn kho khi duyệt
        slip.items.forEach((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          if (prod) {
            prod.stock_quantity = Math.max(0, prod.stock_quantity - item.quantity);
          }
        });
        setStorage('products', products);
        setStorage('disposal_slips', slips);

        logAudit('Duyệt phiếu hủy', 'Phiếu hủy', slip.code);
        return slip;
      }
      return apiFetch<DisposalSlip>(`/disposal-slips/${id}/approve`, {
        method: 'POST',
      });
    },

    async reject(id: string): Promise<DisposalSlip> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền từ chối phiếu hủy.');
        }
        const slips = getStorage<DisposalSlip[]>('disposal_slips', INITIAL_DISPOSAL_SLIPS);
        const slip = slips.find((s) => s.id === id);
        if (!slip) throw new Error('Không tìm thấy phiếu hủy.');

        slip.status = 'rejected';
        slip.approved_by = currentUser.full_name;
        slip.approved_at = new Date().toISOString();

        setStorage('disposal_slips', slips);
        logAudit('Từ chối phiếu hủy', 'Phiếu hủy', slip.code);
        return slip;
      }
      return apiFetch<DisposalSlip>(`/disposal-slips/${id}/reject`, {
        method: 'POST',
      });
    },

    async update(id: string, data: {
      reason: string;
      proof_image_url?: string;
      items: {
        product_barcode: string;
        product_name: string;
        unit: string;
        quantity: number;
      }[];
    }): Promise<DisposalSlip> {
      if (IS_MOCK) {
        await mockDelay();
        const slips = getStorage<DisposalSlip[]>('disposal_slips', INITIAL_DISPOSAL_SLIPS);
        const slipIndex = slips.findIndex((s) => s.id === id);
        if (slipIndex === -1) throw new Error('Không tìm thấy phiếu hủy.');
        if (slips[slipIndex].status === 'approved') {
          throw new Error('Không thể chỉnh sửa phiếu hủy đã duyệt.');
        }
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const stockError = getStockValidationError(products, data.items);
        if (stockError) throw new Error(stockError);
        const slipItems = data.items.map((i) => {
          const prod = products.find((p) => p.barcode === i.product_barcode);
          const cost = prod?.cost_price || 0;
          return {
            ...i,
            cost_price: cost,
            total_value: cost * i.quantity,
          };
        });
        slips[slipIndex] = {
          ...slips[slipIndex],
          reason: data.reason,
          proof_image_url: data.proof_image_url,
          items: slipItems,
        };
        setStorage('disposal_slips', slips);
        logAudit('Sửa phiếu hủy', 'Phiếu hủy', slips[slipIndex].code);
        return slips[slipIndex];
      }
      return apiFetch<DisposalSlip>(`/disposal-slips/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    async delete(id: string): Promise<void> {
      if (IS_MOCK) {
        await mockDelay();
        const slips = getStorage<DisposalSlip[]>('disposal_slips', INITIAL_DISPOSAL_SLIPS);
        const slip = slips.find((s) => s.id === id);
        if (!slip) throw new Error('Không tìm thấy phiếu hủy.');
        if (slip.status === 'approved') {
          throw new Error('Không thể xóa phiếu hủy đã duyệt.');
        }
        const filtered = slips.filter((s) => s.id !== id);
        setStorage('disposal_slips', filtered);
        logAudit('Xóa phiếu hủy', 'Phiếu hủy', slip.code);
        return;
      }
      return apiFetch<void>(`/disposal-slips/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // 8. Đổi / trả hàng (Chỉ trong ngày, có mã hóa đơn gốc, không vượt số lượng đã mua)
  returnSlips: {
    async list(): Promise<ReturnSlip[]> {
      if (IS_MOCK) {
        await mockDelay();
        return getStorage<ReturnSlip[]>('return_slips', INITIAL_RETURN_SLIPS);
      }
      return apiFetch<ReturnSlip[]>('/return-slips');
    },

    async create(data: {
      original_invoice_code: string;
      type: 'return' | 'exchange';
      reason: string;
      items: {
        product_barcode: string;
        product_name: string;
        quantity: number;
        selling_price: number;
      }[];
      exchange_items?: {
        product_barcode: string;
        product_name: string;
        quantity: number;
        selling_price: number;
      }[];
      proof_image_url?: string;
    }): Promise<ReturnSlip> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (!currentUser) throw new Error('Vui lòng đăng nhập.');

        // Tra cứu hóa đơn gốc
        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES);
        const originalInvoice = invoices.find(
          (i) => i.code === data.original_invoice_code && !i.is_deleted
        );
        if (!originalInvoice) {
          throw new Error(`Không tìm thấy hóa đơn gốc có mã "${data.original_invoice_code}".`);
        }

        const invoiceAge = Date.now() - new Date(originalInvoice.created_at).getTime();
        if (invoiceAge < 0 || invoiceAge > 24 * 60 * 60 * 1000) {
          throw new Error('Hóa đơn đã quá thời hạn đổi/trả 24 giờ.');
        }

        const slips = getStorage<ReturnSlip[]>('return_slips', INITIAL_RETURN_SLIPS);
        for (const item of data.items) {
          const invItem = originalInvoice.items.find(
            (ii) => ii.product_barcode === item.product_barcode
          );
          if (!invItem) {
            throw new Error(`Sản phẩm "${item.product_name}" không nằm trong hóa đơn gốc.`);
          }
          const alreadyReturned = slips
            .filter((slip) =>
              slip.original_invoice_code === originalInvoice.code && slip.status !== 'rejected'
            )
            .flatMap((slip) => slip.items)
            .filter((returned) => returned.product_barcode === item.product_barcode)
            .reduce((sum, returned) => sum + returned.quantity, 0);
          if (item.quantity + alreadyReturned > invItem.quantity) {
            throw new Error(
              `Số lượng trả của "${item.product_name}" vượt quá số lượng còn được phép trả trên hóa đơn (${Math.max(0, invItem.quantity - alreadyReturned)}).`
            );
          }
        }

        const returnTotal = data.items.reduce((s, i) => s + i.quantity * i.selling_price, 0);
        const exchangeTotal = (data.exchange_items || []).reduce(
          (s, i) => s + i.quantity * i.selling_price,
          0
        );

        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const insufficient = (data.exchange_items || []).filter((item) => {
          const product = products.find((candidate) => candidate.barcode === item.product_barcode);
          return !product || product.stock_quantity < item.quantity;
        });
        if (insufficient.length) throw new Error('Sản phẩm đổi không đủ tồn kho.');

        const now = new Date().toISOString();
        const newSlip: ReturnSlip = {
          id: 'ret-' + Date.now(),
          code: generateCode('return', slips.map((slip) => slip.code)),
          original_invoice_code: data.original_invoice_code,
          slip_date: new Date().toISOString(),
          creator_id: currentUser.id,
          creator_name: currentUser.full_name,
          status: 'approved',
          type: data.type,
          reason: data.reason,
          items: data.items.map((i) => ({ ...i, total_amount: i.quantity * i.selling_price })),
          exchange_items: data.exchange_items?.map((i) => ({
            ...i,
            total_amount: i.quantity * i.selling_price,
          })),
          total_refund: returnTotal,
          difference_amount: exchangeTotal - returnTotal,
          proof_image_url: data.proof_image_url,
          approved_at: now,
        };

        data.items.forEach((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          if (prod) prod.stock_quantity += item.quantity;
        });
        data.exchange_items?.forEach((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          if (prod) prod.stock_quantity -= item.quantity;
        });

        setStorage('products', products);
        slips.unshift(newSlip);
        setStorage('return_slips', slips);
        logAudit('Tạo phiếu đổi/trả', 'Phiếu đổi trả', newSlip.code, `Hóa đơn gốc: ${data.original_invoice_code}`);
        return newSlip;
      }
      return apiFetch<ReturnSlip>('/return-slips', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: {
        type: 'return' | 'exchange';
        reason: string;
        items: { product_barcode: string; quantity: number }[];
        exchange_items?: { product_barcode: string; quantity: number }[];
        proof_image_url?: string;
      }
    ): Promise<ReturnSlip> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền sửa phiếu đổi/trả.');
        }

        const slips = getStorage<ReturnSlip[]>('return_slips', INITIAL_RETURN_SLIPS);
        const slip = slips.find((item) => item.id === id);
        if (!slip) throw new Error('Không tìm thấy phiếu đổi/trả.');
        if (slip.status !== 'approved' && slip.status !== 'pending') {
          throw new Error('Chỉ được sửa phiếu đổi/trả đã ghi nhận.');
        }

        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES);
        const invoice = invoices.find((item) => item.code === slip.original_invoice_code);
        if (!invoice) throw new Error('Không tìm thấy hóa đơn gốc.');
        const invoiceAge = Date.now() - new Date(invoice.created_at).getTime();
        if (invoiceAge < 0 || invoiceAge > 24 * 60 * 60 * 1000) {
          throw new Error('Hóa đơn đã quá thời hạn đổi/trả 24 giờ.');
        }
        const otherSlips = slips.filter((item) =>
          item.id !== id && item.original_invoice_code === slip.original_invoice_code && item.status !== 'rejected'
        );
        for (const item of data.items) {
          const purchased = invoice.items
            .filter((invoiceItem) => invoiceItem.product_barcode === item.product_barcode)
            .reduce((sum, invoiceItem) => sum + invoiceItem.quantity, 0);
          const alreadyReturned = otherSlips
            .flatMap((other) => other.items)
            .filter((returned) => returned.product_barcode === item.product_barcode)
            .reduce((sum, returned) => sum + returned.quantity, 0);
          if (!purchased || item.quantity + alreadyReturned > purchased) {
            throw new Error(`Số lượng trả của sản phẩm ${item.product_barcode} vượt quá số lượng còn được phép trả.`);
          }
        }

        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        const impacts = new Map<string, number>();
        const addImpact = (barcode: string, quantity: number) => {
          impacts.set(barcode, (impacts.get(barcode) || 0) + quantity);
        };
        if (slip.status === 'approved') {
          slip.items.forEach((item) => addImpact(item.product_barcode, -item.quantity));
          slip.exchange_items?.forEach((item) => addImpact(item.product_barcode, item.quantity));
          data.items.forEach((item) => addImpact(item.product_barcode, item.quantity));
          (data.exchange_items || []).forEach((item) => addImpact(item.product_barcode, -item.quantity));
        }
        for (const [barcode, delta] of impacts) {
          const product = products.find((item) => item.barcode === barcode);
          if (!product || product.stock_quantity + delta < 0) {
            throw new Error(`Sản phẩm đổi ${barcode} không đủ tồn kho.`);
          }
        }

        const returnedItems = data.items.map((item) => {
          const invoiceItem = invoice.items.find((candidate) => candidate.product_barcode === item.product_barcode);
          if (!invoiceItem) throw new Error(`Sản phẩm ${item.product_barcode} không nằm trong hóa đơn gốc.`);
          return {
            product_barcode: item.product_barcode,
            product_name: invoiceItem.product_name,
            quantity: item.quantity,
            selling_price: invoiceItem.unit_price,
            total_amount: item.quantity * invoiceItem.unit_price,
          };
        });
        const exchangeItems = (data.exchange_items || []).map((item) => {
          const product = products.find((candidate) => candidate.barcode === item.product_barcode);
          if (!product) throw new Error(`Không tìm thấy sản phẩm đổi ${item.product_barcode}.`);
          return {
            product_barcode: item.product_barcode,
            product_name: product.name,
            quantity: item.quantity,
            selling_price: product.selling_price,
            total_amount: item.quantity * product.selling_price,
          };
        });
        impacts.forEach((delta, barcode) => {
          const product = products.find((item) => item.barcode === barcode);
          if (product) product.stock_quantity += delta;
        });

        const totalRefund = returnedItems.reduce((sum, item) => sum + item.total_amount, 0);
        const exchangeTotal = exchangeItems.reduce((sum, item) => sum + item.total_amount, 0);
        slip.type = data.type;
        slip.reason = data.reason;
        slip.items = returnedItems;
        slip.exchange_items = exchangeItems;
        slip.total_refund = totalRefund;
        slip.difference_amount = exchangeTotal - totalRefund;
        slip.proof_image_url = data.proof_image_url || slip.proof_image_url;
        setStorage('products', products);
        setStorage('return_slips', slips);
        logAudit('Sửa phiếu đổi/trả', 'Phiếu đổi trả', slip.code, data.reason);
        return slip;
      }
      return apiFetch<ReturnSlip>(`/return-slips/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async approve(id: string): Promise<ReturnSlip> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền duyệt phiếu đổi/trả.');
        }

        const slips = getStorage<ReturnSlip[]>('return_slips', INITIAL_RETURN_SLIPS);
        const slip = slips.find((s) => s.id === id);
        if (!slip) throw new Error('Không tìm thấy phiếu đổi/trả.');

        slip.status = 'approved';
        slip.approved_by = currentUser.full_name;
        slip.approved_at = new Date().toISOString();

        // Cộng lại tồn kho hàng trả, trừ tồn kho hàng đổi (nếu có)
        const products = getStorage<Product[]>('products', INITIAL_PRODUCTS);
        slip.items.forEach((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          if (prod) prod.stock_quantity += item.quantity;
        });
        slip.exchange_items?.forEach((item) => {
          const prod = products.find((p) => p.barcode === item.product_barcode);
          if (prod) prod.stock_quantity = Math.max(0, prod.stock_quantity - item.quantity);
        });
        setStorage('products', products);
        setStorage('return_slips', slips);

        logAudit('Duyệt phiếu đổi/trả', 'Phiếu đổi trả', slip.code);
        return slip;
      }
      return apiFetch<ReturnSlip>(`/return-slips/${id}/approve`, {
        method: 'POST',
      });
    },

    async reject(id: string): Promise<ReturnSlip> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền từ chối phiếu đổi/trả.');
        }

        const slips = getStorage<ReturnSlip[]>('return_slips', INITIAL_RETURN_SLIPS);
        const slip = slips.find((s) => s.id === id);
        if (!slip) throw new Error('Không tìm thấy phiếu đổi/trả.');

        slip.status = 'rejected';
        slip.approved_by = currentUser.full_name;
        slip.approved_at = new Date().toISOString();

        setStorage('return_slips', slips);
        logAudit('Từ chối phiếu đổi/trả', 'Phiếu đổi trả', slip.code);
        return slip;
      }
      return apiFetch<ReturnSlip>(`/return-slips/${id}/reject`, {
        method: 'POST',
      });
    },
  },

  // 9. Kho & Cảnh báo tồn kho
  inventory: {
    async getStats(): Promise<{
      products: Product[];
      lowStockProducts: Product[];
      outOfStockProducts: Product[];
    }> {
      if (IS_MOCK) {
        await mockDelay();
        const products = await api.products.list();
        const lowStockProducts = products.filter(
          (p) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock
        );
        const outOfStockProducts = products.filter((p) => p.stock_quantity <= 0);
        return { products, lowStockProducts, outOfStockProducts };
      }
      return apiFetch('/inventory/stats');
    },
  },

  // 10. Báo cáo & Dashboard (Chỉ Chủ)
  reports: {
    async getRevenueReport(from: string, to: string, groupBy: 'day' | 'week' | 'month' = 'day'): Promise<{
      from: string;
      to: string;
      group_by: string;
      summary: {
        total_revenue: number;
        invoice_count: number;
        payment_methods: { cash: number; transfer: number; debt: number };
      };
      data: {
        period: string;
        period_start: string;
        period_end: string;
        revenue: number;
        invoice_count: number;
        payment_methods: { cash: number; transfer: number; debt: number };
      }[];
    }> {
      const f = from.includes('/') ? from.split('/').reverse().join('-') : from;
      const t = to.includes('/') ? to.split('/').reverse().join('-') : to;
      return apiFetch(`/reports/revenue?from=${f}&to=${t}&group_by=${groupBy}`);
    },

    async getProfitReport(from: string, to: string, groupBy: 'day' | 'week' | 'month' = 'day'): Promise<{
      from: string;
      to: string;
      group_by: string;
      summary: {
        revenue: number;
        cost_of_goods_sold: number;
        returned_cost: number;
        exchanged_cost: number;
        disposal_cost: number;
        expenses: number;
        gross_profit: number;
        net_profit: number;
      };
      data: {
        period: string;
        period_start: string;
        period_end: string;
        revenue: number;
        invoice_count: number;
        cost_of_goods_sold: number;
        gross_profit: number;
        net_profit: number;
      }[];
    }> {
      const f = from.includes('/') ? from.split('/').reverse().join('-') : from;
      const t = to.includes('/') ? to.split('/').reverse().join('-') : to;
      return apiFetch(`/reports/profit?from=${f}&to=${t}&group_by=${groupBy}`);
    },

    async getDailyReport(dateStr: string): Promise<{
      date: string;
      totalRevenue: number;
      cashAmount: number;
      transferAmount: number;
      debtAmount: number;
      grossProfit: number;
      invoices: Invoice[];
    }> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới được xem báo cáo.');
        }

        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES).filter(
          (i) => !i.is_deleted && formatDate(i.created_at) === dateStr
        );

        let cashAmount = 0;
        let transferAmount = 0;
        let debtAmount = 0;
        let totalRevenue = 0;
        let totalCost = 0;

        invoices.forEach((inv) => {
          totalRevenue += inv.total_amount;
          if (inv.payment_method === 'cash') cashAmount += inv.total_amount;
          else if (inv.payment_method === 'transfer') transferAmount += inv.total_amount;
          else if (inv.payment_method === 'debt') debtAmount += inv.total_amount;

          inv.items.forEach((item) => {
            totalCost += (item.cost_price || 0) * item.quantity;
          });
        });

        // Trừ giá trị hoàn trả của phiếu đổi trả trong ngày
        const returnSlips = getStorage<ReturnSlip[]>('return_slips', INITIAL_RETURN_SLIPS).filter(
          (s) => s.status === 'approved' && formatDate(s.slip_date) === dateStr
        );
        const totalRefund = returnSlips.reduce((s, r) => s + r.total_refund, 0);
        totalRevenue -= totalRefund;

        return {
          date: dateStr,
          totalRevenue,
          cashAmount,
          transferAmount,
          debtAmount,
          grossProfit: totalRevenue - totalCost,
          invoices,
        };
      }
      const apiDate = dateStr.includes('/') ? dateStr.split('/').reverse().join('-') : dateStr;
      return apiFetch(`/reports/daily?date=${apiDate}`);
    },

    async getMonthlyReport(year: number, month: number): Promise<{
      year: number;
      month: number;
      totalRevenue: number;
      totalExpenses: number;
      netProfit: number;
      soldProducts: { barcode: string; name: string; quantity: number; totalAmount: number }[];
    }> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới được xem báo cáo.');
        }

        const invoices = getStorage<Invoice[]>('invoices', INITIAL_INVOICES).filter((i) => {
          if (i.is_deleted) return false;
          const d = new Date(i.created_at);
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        });

        let totalRevenue = 0;
        let totalCost = 0;
        const prodMap: Record<string, { barcode: string; name: string; quantity: number; totalAmount: number }> = {};

        invoices.forEach((inv) => {
          totalRevenue += inv.total_amount;
          inv.items.forEach((item) => {
            totalCost += (item.cost_price || 0) * item.quantity;
            if (!prodMap[item.product_barcode]) {
              prodMap[item.product_barcode] = {
                barcode: item.product_barcode,
                name: item.product_name,
                quantity: 0,
                totalAmount: 0,
              };
            }
            prodMap[item.product_barcode].quantity += item.quantity;
            prodMap[item.product_barcode].totalAmount += item.total_amount;
          });
        });

        // Chi phí phát sinh trong tháng
        const expenses = getStorage<Expense[]>('expenses', INITIAL_EXPENSES).filter((e) => {
          const d = new Date(e.expense_date);
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        });
        const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

        // Lợi nhuận thực tế theo tháng = Doanh thu - Giá vốn - Giá trị hủy - Chi phí phát sinh (SPEC 6.8)
        const netProfit = totalRevenue - totalCost - totalExpenses;

        return {
          year,
          month,
          totalRevenue,
          totalExpenses,
          netProfit,
          soldProducts: Object.values(prodMap).sort((a, b) => b.quantity - a.quantity),
        };
      }
      return apiFetch(`/reports/monthly?year=${year}&month=${month}`);
    },

    async getDashboardStats(): Promise<
      | {
        date: string;
        shift: {
          first_sale_at: string | null;
          last_sale_at: string | null;
          invoice_count: number;
          sales_amount: number;
        };
      }
      | {
      todayRevenue: number;
      todayCash: number;
      todayTransfer: number;
      todayDebt: number;
      lowStockCount: number;
        todayInvoiceCount?: number;
        topSellingProducts?: { barcode: string; name: string; quantity: number; total_amount: number }[];
      }
    > {
      if (IS_MOCK) {
        await mockDelay();
        const todayStr = formatDate(new Date());
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role === 'staff') {
          const staffInvoices = (await api.invoices.list()).filter(
            (invoice) => invoice.seller_id === currentUser.id && isSameDayVN(invoice.created_at, new Date())
          );
          const saleTimes = staffInvoices
            .map((invoice) => new Date(invoice.created_at).getTime())
            .sort((a, b) => a - b);
          return {
            date: todayStr,
            shift: {
              first_sale_at: saleTimes.length ? new Date(saleTimes[0]!).toISOString() : null,
              last_sale_at: saleTimes.length ? new Date(saleTimes[saleTimes.length - 1]!).toISOString() : null,
              invoice_count: staffInvoices.length,
              sales_amount: staffInvoices.reduce((total, invoice) => total + invoice.total_amount, 0),
            },
          };
        }

        const daily = await api.reports.getDailyReport(todayStr);
        const { lowStockProducts, outOfStockProducts } = await api.inventory.getStats();
        const invoices = await api.invoices.list({ date: todayStr });

        return {
          todayRevenue: daily.totalRevenue,
          todayCash: daily.cashAmount,
          todayTransfer: daily.transferAmount,
          todayDebt: daily.debtAmount,
          lowStockCount: lowStockProducts.length + outOfStockProducts.length,
          todayInvoiceCount: invoices.length,
        };
      }
      return apiFetch<
        | {
          date: string;
          shift: {
            first_sale_at: string | null;
            last_sale_at: string | null;
            invoice_count: number;
            sales_amount: number;
          };
        }
        | {
          todayRevenue: number;
          todayCash: number;
          todayTransfer: number;
          todayDebt: number;
          lowStockCount: number;
          todayInvoiceCount?: number;
          topSellingProducts?: { barcode: string; name: string; quantity: number; total_amount: number }[];
        }
      >('/reports/dashboard');
    },

    async importExpenses(file: File, month?: string): Promise<{
      success: boolean;
      message: string;
      imported_count: number;
      total_amount: number;
      month?: string;
    }> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền nhập chi phí.');
        }
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
          throw new Error('Chỉ chấp nhận file định dạng Excel (.xlsx).');
        }
        return {
          success: true,
          message: 'Nhập dữ liệu chi phí từ Excel thành công!',
          imported_count: 4,
          total_amount: 7000000,
          month,
        };
      }
      const formData = new FormData();
      formData.append('file', file);
      if (month) {
        formData.append('month', month);
      }
      return apiFetch('/reports/expenses/import', {
        method: 'POST',
        body: formData,
      });
    },
  },

  // 11. Chi phí phát sinh (Chỉ Chủ)
  expenses: {
    async list(): Promise<Expense[]> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới được xem chi phí phát sinh.');
        }
        return getStorage<Expense[]>('expenses', INITIAL_EXPENSES).sort(
          (a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime()
        );
      }
      return apiFetch<Expense[]>('/expenses');
    },

    async create(data: Omit<Expense, 'id'>): Promise<Expense> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới được thêm chi phí.');
        }
        const expenses = getStorage<Expense[]>('expenses', INITIAL_EXPENSES);
        const newExp: Expense = { ...data, id: 'exp-' + Date.now() };
        expenses.unshift(newExp);
        setStorage('expenses', expenses);
        logAudit('Thêm chi phí', 'Chi phí', newExp.id, `${newExp.amount} ₫ - ${newExp.notes}`);
        return newExp;
      }
      return apiFetch<Expense>('/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async delete(id: string): Promise<void> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới được xóa chi phí.');
        }
        let expenses = getStorage<Expense[]>('expenses', INITIAL_EXPENSES);
        expenses = expenses.filter((e) => e.id !== id);
        setStorage('expenses', expenses);
        logAudit('Xóa chi phí', 'Chi phí', id);
        return;
      }
      return apiFetch<void>(`/expenses/${id}`, { method: 'DELETE' });
    },
  },

  // 12. Cấu hình cửa hàng
  storeSettings: {
    async get(): Promise<StoreSettings> {
      if (IS_MOCK) {
        await mockDelay();
        return getStorage<StoreSettings>('store_settings', INITIAL_STORE_SETTINGS);
      }
      return apiFetch<StoreSettings>('/settings');
    },

    async update(settings: StoreSettings): Promise<StoreSettings> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền sửa cấu hình.');
        }
        setStorage('store_settings', settings);
        logAudit('Cập nhật cấu hình cửa hàng', 'Cấu hình', 'settings');
        return settings;
      }
      return apiFetch<StoreSettings>('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
    },
  },

  // 13. Quản lý tài khoản (Chủ quản lý nhân viên)
  accounts: {
    async list(): Promise<UserProfile[]> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền quản lý tài khoản.');
        }
        return getStorage<UserProfile[]>('users', INITIAL_USERS);
      }
      return apiFetch<UserProfile[]>('/accounts');
    },

    async create(user: { username: string; full_name: string; role: Role }): Promise<UserProfile> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền tạo tài khoản.');
        }
        const users = getStorage<UserProfile[]>('users', INITIAL_USERS);
        const newUser: UserProfile = {
          ...user,
          id: 'usr-' + Date.now(),
          status: 'active',
          created_at: new Date().toISOString(),
        };
        users.push(newUser);
        setStorage('users', users);
        logAudit('Tạo tài khoản', 'Tài khoản', newUser.username, newUser.full_name);
        return newUser;
      }
      return apiFetch<UserProfile>('/accounts', {
        method: 'POST',
        body: JSON.stringify(user),
      });
    },

    async toggleLock(id: string): Promise<UserProfile> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền khóa/mở tài khoản.');
        }
        const users = getStorage<UserProfile[]>('users', INITIAL_USERS);
        const user = users.find((u) => u.id === id);
        if (!user) throw new Error('Không tìm thấy tài khoản.');
        if (user.role === 'owner') throw new Error('Không thể khóa tài khoản Chủ cửa hàng.');

        user.status = user.status === 'active' ? 'locked' : 'active';
        setStorage('users', users);
        logAudit('Đổi trạng thái tài khoản', 'Tài khoản', user.username, `Trạng thái: ${user.status}`);
        return user;
      }
      return apiFetch<UserProfile>(`/accounts/${id}/toggle-lock`, {
        method: 'POST',
      });
    },
  },

  // 14. Nhật ký thao tác (Audit log - Chỉ Chủ)
  auditLogs: {
    async list(): Promise<AuditLog[]> {
      if (IS_MOCK) {
        await mockDelay();
        const currentUser = api.auth.getCurrentUser();
        if (currentUser?.role !== 'owner') {
          throw new Error('Chỉ Chủ cửa hàng mới có quyền xem nhật ký thao tác.');
        }
        return getStorage<AuditLog[]>('audit_logs', []);
      }
      return apiFetch<AuditLog[]>('/audit-logs');
    },
  },
};
