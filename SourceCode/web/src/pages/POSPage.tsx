import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Customer, Product } from '../types';
import { formatVND, formatDateTime } from '../utils/format';
import {
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  CreditCard,
  QrCode,
  Banknote,
  User,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  X,
  Check,
  FileText,
  Store,
  NotebookPen,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePOSDraft } from '../context/POSDraftContext';
import { useAuth } from '../context/AuthContext';

export const POSPage: React.FC = () => {
  const storeName = 'Tạp hóa Hằng';
  const bankAccount = '0123456789';
  const bankName = 'MB';
  const bankAccountHolder = 'NGUYEN THI HANG';
  const { cart, setCart } = usePOSDraft();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>('all');
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [scanNotFound, setScanNotFound] = useState<string | null>(null);

  // Checkout states
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'debt'>('cash');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cashGivenStr, setCashGivenStr] = useState<string>('');
  const [completedInvoice, setCompletedInvoice] = useState<any | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();
  const { isOwner } = useAuth();

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.list(),
  });

  useEffect(() => {
    if (step === 'cart') {
      barcodeInputRef.current?.focus();
    }
  }, [step, cart]);

  const addToCart = (product: Product, qty = 1): boolean => {
    const existing = cart.find((item) => item.product.barcode === product.barcode);
    const requestedQty = (existing?.quantity || 0) + qty;
    if (product.stock_quantity < requestedQty) {
      showError(
        product.stock_quantity <= 0
          ? `"${product.name}" đã hết hàng.`
          : `Tồn kho "${product.name}" chỉ còn ${product.stock_quantity} ${product.unit}.`
      );
      return false;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.product.barcode === product.barcode);
      if (existing) {
        return prev.map((i) =>
          i.product.barcode === product.barcode ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [...prev, { product, quantity: qty }];
    });
    return true;
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    const found = products.find((p) => p.barcode === code);
    if (found) {
      if (addToCart(found, 1)) {
        setBarcodeInput('');
        setSearchQuery('');
        setScanNotFound(null);
      }
    } else {
      setScanNotFound(code);
      showError(`Mã ${code} · Không tìm thấy sản phẩm!`);
    }
  };

  const updateQuantity = (barcode: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(barcode);
      return;
    }
    const item = cart.find((entry) => entry.product.barcode === barcode);
    if (item && newQty > item.product.stock_quantity) {
      showError(
        `Tồn kho "${item.product.name}" chỉ còn ${item.product.stock_quantity} ${item.product.unit}.`
      );
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.product.barcode === barcode ? { ...i, quantity: newQty } : i))
    );
  };

  const removeFromCart = (barcode: string) => {
    setCart((prev) => prev.filter((i) => i.product.barcode !== barcode));
  };

  const handleResetOrder = () => {
    setCart([]);
    setStep('cart');
    setSelectedCustomerId('');
    setCashGivenStr('');
    setPaymentMethod('cash');
    setCompletedInvoice(null);
    setScanNotFound(null);
  };

  // Tính tổng tiền
  const totalAmount = cart.reduce(
    (sum, item) => sum + item.quantity * item.product.selling_price,
    0
  );

  // Format số hàng nghìn có dấu "."
  const formatNumberWithDots = (val: string | number): string => {
    if (!val && val !== 0) return '';
    const numStr = val.toString().replace(/\D/g, '');
    if (!numStr) return '';
    return Number(numStr).toLocaleString('vi-VN');
  };

  const formatCustomerPhone = (phone?: string): string => {
    if (!phone) return 'Không có SĐT';
    const clean = phone.trim();
    if (clean.length >= 9) {
      return `${clean.slice(0, 4)} ••• ${clean.slice(-3)}`;
    }
    return clean;
  };

  const parsedCashGiven = Number(cashGivenStr) || 0;
  const changeAmount = Math.max(0, parsedCashGiven - totalAmount);

  // NumPad click handler
  const handleNumpadClick = (val: string) => {
    if (val === 'backspace') {
      setCashGivenStr((prev) => prev.slice(0, -1));
    } else {
      setCashGivenStr((prev) => {
        const next = prev + val;
        // Bỏ số 0 vô nghĩa ở đầu
        return next.replace(/^0+(?=\d)/, '');
      });
    }
  };

  // Thanh toán
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error('Giỏ hàng đang trống.');
      if (paymentMethod === 'debt' && !selectedCustomerId) {
        throw new Error('Ghi nợ bắt buộc phải chọn khách quen. Khách vãng lai không được ghi nợ!');
      }
      const outOfStockItem = cart.find((item) => {
        const currentProduct = products.find((product) => product.barcode === item.product.barcode);
        return !currentProduct || item.quantity > currentProduct.stock_quantity;
      });
      if (outOfStockItem) {
        const currentProduct = products.find(
          (product) => product.barcode === outOfStockItem.product.barcode
        );
        throw new Error(
          currentProduct
            ? `Tồn kho "${currentProduct.name}" chỉ còn ${currentProduct.stock_quantity} ${currentProduct.unit}. Vui lòng điều chỉnh số lượng.`
            : `Không tìm thấy sản phẩm "${outOfStockItem.product.name}" trong danh sách hiện tại.`
        );
      }

      const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

      return api.invoices.create({
        customer_id: selectedCustomer?.id,
        customer_name: selectedCustomer?.name,
        payment_method: paymentMethod,
        cash_given: paymentMethod === 'cash' ? parsedCashGiven || totalAmount : undefined,
        items: cart.map((item) => ({
          product_barcode: item.product.barcode,
          product_name: item.product.name,
          unit: item.product.unit,
          quantity: item.quantity,
          unit_price: item.product.selling_price,
        })),
      });
    },
    onSuccess: (newInvoice) => {
      showSuccess(
        newInvoice.status === 'unpaid'
          ? `Đã lưu hóa đơn nợ ${newInvoice.code}; hóa đơn chưa được thanh toán.`
          : `Đã thanh toán thành công hóa đơn ${newInvoice.code}!`
      );
      setCompletedInvoice(newInvoice);
      setStep('success');
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });

      // Tự động in hóa đơn 80mm
      setTimeout(() => {
        window.print();
      }, 400);
    },
    onError: (err: any) => showError(err.message),
  });

  // Lọc sản phẩm theo danh mục và tìm kiếm
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCatId === 'all' || p.category_id === selectedCatId;
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery.trim());
    return matchesCat && matchesSearch;
  });

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Link VietQR
  const qrUrl = `https://img.vietqr.io/image/${bankName}-${bankAccount}-compact2.png?amount=${totalAmount}&addInfo=BH${Date.now().toString().slice(-6)}`;

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-7xl mx-auto space-y-6">
      {/* ============================================================== */}
      {/* GIAO DIỆN BÁN HÀNG CHÍNH (FIGMA UC 2)                          */}
      {/* ============================================================== */}
      {step === 'cart' && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-primary)] tracking-tight">Bán hàng</h1>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 xl:gap-6 items-start">
            {/* CỘT TRÁI: DANH SÁCH HÀNG & Ô QUÉT MÃ VẠCH */}
            <div className="xl:col-span-5 space-y-4">
              {/* Nút Tạo đơn hàng mới */}
              <button
                onClick={handleResetOrder}
                className="ui-button ui-button-primary w-full min-h-12 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo đơn hàng mới</span>
              </button>

              {/* Ô tìm kiếm & Ô quét mã vạch */}
              <form onSubmit={handleBarcodeSubmit} className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setBarcodeInput(e.target.value);
                        if (scanNotFound) setScanNotFound(null);
                      }}
                      placeholder="Tên sản phẩm"
                      className="ui-input w-full pl-10 pr-4 py-2.5 text-sm focus:border-[#024E82]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="ui-button w-11 h-11 min-h-11 p-0 rounded-lg flex items-center justify-center shrink-0 bg-[#024E82] text-white hover:bg-blue-900"
                    title="Nhận mã quét"
                  >
                    <Barcode className="w-5 h-5" />
                  </button>
                </div>

                {/* Banner báo lỗi khi không tìm thấy mã sản phẩm chuẩn ảnh 49 */}
                {scanNotFound && (
                  <div className="flex items-center gap-2 p-2.5 bg-[#FEECEB] border border-red-100 rounded-xl text-xs text-[#E12B2B]">
                    <AlertCircle className="w-4 h-4 shrink-0 text-[#E12B2B]" />
                    <span>Mã {scanNotFound} · Không tìm thấy sản phẩm!</span>
                  </div>
                )}
              </form>

              {/* Bộ lọc Pills danh mục chuẩn Figma */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedCatId('all')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    selectedCatId === 'all'
                      ? 'bg-[#024E82] text-white'
                      : 'bg-primary-soft text-[#024E82] hover:bg-[#024E82] hover:text-white'
                  }`}
                >
                  Tất cả
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCatId(c.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      selectedCatId === c.id
                        ? 'bg-[#024E82] text-white'
                        : 'bg-primary-soft text-[#024E82] hover:bg-[#024E82] hover:text-white'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* Section: Hàng bán thường xuyên (Figma UC 2) */}
              <div className="flex items-center justify-between pt-1">
                <h3 className="text-sm font-bold text-[#024E82]">Hàng bán thường xuyên</h3>
                <span className="text-xs text-slate-400">{filteredProducts.length} mặt hàng</span>
              </div>

              {/* Grid thẻ sản phẩm chuẩn Figma UC 2 (2 cột) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[min(62vh,620px)] overflow-y-auto pr-1">
                {filteredProducts.map((p) => (
                  <button
                    key={p.barcode}
                    type="button"
                    onClick={() => addToCart(p, 1)}
                    disabled={p.stock_quantity <= 0}
                    className="w-full min-h-[148px] text-left bg-white p-4 rounded-xl border border-slate-200/80 hover:border-[#024E82] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer transition-colors flex flex-col justify-between shadow-2xs"
                  >
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono mb-1">
                        <span className="truncate">{p.barcode} · {p.unit}</span>
                        <span className="font-bold text-slate-500">Tồn {p.stock_quantity}</span>
                      </div>
                      <p className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug">
                        {p.name}
                      </p>
                    </div>
                    <div className="mt-3">
                      <span className="text-base font-black text-[#024E82]">
                        {formatVND(p.selling_price)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* CỘT PHẢI: GIỎ HÀNG CHUẨN FIGMA UC 2 */}
            <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-[#024E82]">Giỏ hàng</h2>
              </div>

              {/* Bảng dòng hàng trong giỏ */}
              <div className="overflow-x-auto min-h-[220px] max-h-[min(52vh,460px)] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#EEF3F8] text-slate-500 font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Mã SP / Tên sản phẩm</th>
                      <th className="py-2.5 px-2 text-center">ĐVT</th>
                      <th className="py-2.5 px-2 text-right">Đơn giá</th>
                      <th className="py-2.5 px-2 text-center">Số lượng</th>
                      <th className="py-2.5 px-3 text-right">Thành tiền</th>
                      <th className="py-2.5 px-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map((item) => (
                      <tr key={item.product.barcode}>
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-900 leading-tight">
                            {item.product.name}
                          </p>
                          <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                            {item.product.barcode}
                          </p>
                        </td>
                        <td className="py-3 px-2 text-center text-slate-500">{item.product.unit}</td>
                        <td className="py-3 px-2 text-right text-slate-600 font-medium">
                          {formatVND(item.product.selling_price).replace(' ₫', '')}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <div className="inline-flex items-center border border-slate-300 rounded-md bg-white overflow-hidden">
                            <button
                              onClick={() => updateQuantity(item.product.barcode, item.quantity - 1)}
                              className="px-1.5 py-0.5 hover:bg-slate-100 text-slate-600"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-bold text-slate-800 text-xs">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.product.barcode, item.quantity + 1)}
                              className="px-1.5 py-0.5 hover:bg-slate-100 text-slate-600"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {formatVND(item.quantity * item.product.selling_price)}
                        </td>
                        <td className="py-3 px-1 text-center">
                          <button
                            onClick={() => removeFromCart(item.product.barcode)}
                            className="text-red-500 hover:bg-red-50 p-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {cart.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          Chưa có sản phẩm nào trong giỏ hàng.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tổng tiền chuẩn Figma */}
              <div className="p-4 bg-[#ECF3F9] m-4 rounded-xl flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Tổng tiền</span>
                <span className="text-2xl font-black text-[#024E82]">{formatVND(totalAmount)}</span>
              </div>

              {/* 2 Nút Hủy đơn & Hoàn thành đơn chuẩn Figma */}
              <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
                <button
                  type="button"
                  onClick={handleResetOrder}
                  disabled={cart.length === 0}
                  className="py-3 px-4 border border-red-300 text-red-600 hover:bg-red-50 bg-white rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                  Hủy đơn
                </button>

                <button
                  type="button"
                  onClick={() => setStep('checkout')}
                  disabled={cart.length === 0}
                  className="py-3 px-4 bg-[#24963E] hover:bg-emerald-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-40 transition-colors"
                >
                  <span>Hoàn thành đơn</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================== */}
      {/* GIAO DIỆN THANH TOÁN (FIGMA UC 4, 5, 6)                        */}
      {/* ============================================================== */}
      {step === 'checkout' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#024E82] tracking-tight">Thanh toán đơn hàng</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 xl:gap-6 items-start">
            {/* CỘT TRÁI (5 CỘT): TÓM TẮT GIỎ HÀNG FIGMA */}
            <div className="xl:col-span-5 bg-white p-5 rounded-xl border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-[#024E82]">Giỏ hàng</h2>

              <div className="space-y-3 divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.product.barcode} className="pt-2 flex justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{item.product.name}</p>
                      <p className="text-slate-400 font-mono text-[10px]">
                        {item.product.barcode} · {item.quantity} {item.product.unit} × {formatVND(item.product.selling_price)}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900">
                      {formatVND(item.quantity * item.product.selling_price)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between text-xs text-slate-500">
                <span>Tạm tính</span>
                <span className="font-bold text-slate-900">{formatVND(totalAmount)}</span>
              </div>

              {/* Ô Tổng tiền chuẩn Figma */}
              <div className="p-4 bg-[#ECF3F9] rounded-xl flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Tổng tiền</span>
                <span className="text-2xl font-black text-[#024E82]">{formatVND(totalAmount)}</span>
              </div>
            </div>

            {/* CỘT PHẢI (7 CỘT): PHƯƠNG THỨC THANH TOÁN (TIỀN MẶT / CHUYỂN KHOẢN / GHI NỢ) */}
            <div className="xl:col-span-7 bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-5">
              <h2 className="text-base font-bold text-slate-900">Chọn phương thức thanh toán</h2>

              {/* 3 Thẻ phương thức thanh toán chuẩn Figma UC 4, 5, 6 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'cash'
                      ? 'border-[#024E82] bg-primary-soft text-[#024E82] font-bold ring-2 ring-[#024E82]/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-xs">Tiền mặt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'transfer'
                      ? 'border-[#024E82] bg-primary-soft text-[#024E82] font-bold ring-2 ring-[#024E82]/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <QrCode className="w-5 h-5" />
                  <span className="text-xs">Chuyển khoản</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('debt')}
                  className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'debt'
                      ? 'border-[#024E82] bg-primary-soft text-[#024E82] font-bold ring-2 ring-[#024E82]/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <NotebookPen className="w-5 h-5" />
                  <span className="text-xs">Ghi nợ</span>
                </button>
              </div>

              {/* 1. THANH TOÁN TIỀN MẶT: BÀN PHÍM NUMPAD FIGMA UC 6 */}
              {paymentMethod === 'cash' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Tiền khách đưa
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formatNumberWithDots(cashGivenStr)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          setCashGivenStr(raw);
                        }}
                        placeholder={formatNumberWithDots(totalAmount)}
                        className="w-full text-2xl font-black text-slate-900 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-[#024E82]"
                      />
                      <span className="absolute right-4 top-4 font-bold text-slate-400">đ</span>
                    </div>
                  </div>

                  {/* NumPad số bấm chuẩn màn hình POS */}
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => handleNumpadClick(digit)}
                        className="py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 hover:bg-slate-50 text-base"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleNumpadClick('0')}
                      className="py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 hover:bg-slate-50 text-base"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNumpadClick('backspace')}
                      className="py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 hover:bg-slate-50 text-base"
                    >
                      ⌫
                    </button>
                    <button
                      type="button"
                      onClick={() => setCashGivenStr(totalAmount.toString())}
                      className="py-3 bg-[#024E82] text-white rounded-xl font-bold text-sm hover:bg-blue-900"
                    >
                      Xác nhận
                    </button>
                  </div>

                  <div className="pt-2 flex justify-between text-xs text-slate-500">
                    <span>Khách cần trả:</span>
                    <span className="font-bold text-slate-900">{formatVND(totalAmount)}</span>
                  </div>

                  {/* Khối Tiền thừa màu hồng/đỏ nhạt chuẩn Figma UC 6 */}
                  <div className="p-4 bg-[#FEECEB] rounded-xl flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Tiền thừa</span>
                    <span className="text-2xl font-black text-[#E12B2B]">
                      {formatVND(changeAmount)}
                    </span>
                  </div>

                  {/* Nút Thanh toán hoàn tất màu xanh lá Figma */}
                  <button
                    type="button"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full py-4 bg-[#24963E] hover:bg-emerald-700 text-white font-bold rounded-lg text-base flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Check className="w-5 h-5" />
                    <span>
                      {checkoutMutation.isPending ? 'Đang thanh toán...' : 'Thanh toán hoàn tất'}
                    </span>
                  </button>
                </div>
              )}

              {/* 2. CHUYỂN KHOẢN: MÃ VIETQR ĐỘNG FIGMA UC 5 */}
              {paymentMethod === 'transfer' && (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-xs">
                    <img src={qrUrl} alt="VietQR" className="w-56 h-56 object-contain" />
                  </div>

                  <div className="text-center font-black text-3xl text-slate-900">
                    {formatVND(totalAmount)}
                  </div>

                  <div className="w-full bg-[var(--surface-muted)] p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ngân hàng:</span>
                      <span className="font-bold">{bankName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Chủ tài khoản:</span>
                      <span className="font-bold uppercase">
                        {bankAccountHolder}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Số tài khoản:</span>
                      <span className="font-mono font-bold">
                        {bankAccount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nội dung:</span>
                      <span className="font-mono font-bold text-[#024E82]">
                        BH{Date.now().toString().slice(-6)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full py-4 bg-[#24963E] hover:bg-emerald-700 text-white font-bold rounded-lg text-base flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Check className="w-5 h-5" />
                    <span>
                      {checkoutMutation.isPending ? 'Đang xác nhận...' : 'Thanh toán hoàn tất'}
                    </span>
                  </button>
                </div>
              )}

              {/* 3. GHI NỢ KHÁCH QUEN FIGMA UC 4 */}
              {paymentMethod === 'debt' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Khách hàng
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Tên hoặc số điện thoại"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#024E82] bg-white"
                      />
                    </div>
                  </div>

                  {/* Danh sách gợi ý khách quen khi tìm kiếm */}
                  {!selectedCustomerId && customerSearch.trim() && (
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 shadow-xs">
                      {customers
                        .filter(
                          (c) =>
                            c.type === 'loyal' &&
                            (c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                              (c.phone && c.phone.includes(customerSearch.trim())))
                        )
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(c.id);
                              setCustomerSearch('');
                            }}
                            className="w-full px-4 py-2.5 text-left hover:bg-[#ECF3F9] flex items-center justify-between text-xs"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{c.name}</p>
                              <p className="text-slate-500 font-mono text-[11px]">
                                {c.code} · {formatCustomerPhone(c.phone)}
                              </p>
                            </div>
                            <span className="text-slate-500">Nợ cũ: {formatVND(c.total_debt)}</span>
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Dropdown danh sách nếu chưa chọn và chưa gõ tìm kiếm */}
                  {!selectedCustomerId && !customerSearch.trim() && (
                    <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 shadow-xs">
                      <div className="px-3 py-1.5 bg-slate-50 text-[11px] text-slate-400 font-medium">
                        Chọn nhanh khách quen:
                      </div>
                      {customers
                        .filter((c) => c.type === 'loyal')
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCustomerId(c.id)}
                            className="w-full px-4 py-2 text-left hover:bg-[#ECF3F9] flex items-center justify-between text-xs"
                          >
                            <span className="font-bold text-slate-800">{c.name}</span>
                            <span className="text-slate-400 text-[11px] font-mono">{formatCustomerPhone(c.phone)}</span>
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Khung thông tin khách quen chuẩn ảnh 62 */}
                  {selectedCustomer && (
                    <div className="p-4 rounded-xl border border-[#024E82] bg-[#ECF3F9] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white text-[#024E82] font-bold flex items-center justify-center text-sm shrink-0 border border-slate-200">
                          {selectedCustomer.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{selectedCustomer.name}</p>
                          <span className="text-xs font-medium text-slate-700">Khách quen</span>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {selectedCustomer.code} · {formatCustomerPhone(selectedCustomer.phone)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomerId('');
                          setCustomerSearch('');
                        }}
                        className="text-slate-400 hover:text-slate-600 p-1"
                        title="Chọn khách khác"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Khung Ghi nợ mới chuẩn ảnh 62 */}
                  <div className="p-4 bg-[#ECF3F9] rounded-xl flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">Ghi nợ mới</span>
                    <span className="text-2xl font-black text-[#024E82]">{formatVND(totalAmount)}</span>
                  </div>

                  {/* Nút Lưu đơn nợ & in hóa đơn chuẩn ảnh 62 */}
                  <button
                    type="button"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={!selectedCustomerId || checkoutMutation.isPending}
                    className="w-full py-4 bg-[#024E82] hover:bg-blue-900 text-white font-bold rounded-xl text-base flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 transition-colors"
                  >
                    <NotebookPen className="w-5 h-5" />
                    <span>
                      {checkoutMutation.isPending ? 'Đang ghi nợ...' : 'Lưu đơn nợ & in hóa đơn'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* GIAO DIỆN KẾT THÚC / IN HÓA ĐƠN (FIGMA UC 3)                   */}
      {/* ============================================================== */}
      {step === 'success' && completedInvoice && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#024E82] tracking-tight">Hoàn tất đơn hàng</h1>
            </div>
            <button
              onClick={handleResetOrder}
              className="px-4 py-2 bg-[#024E82] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo đơn hàng tiếp theo</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* CỘT TRÁI (4 CỘT): THÔNG BÁO HOÀN TẤT CHUẨN ẢNH 66 */}
            <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-6 w-6 stroke-[3]" />
              </div>

              <h2 className="text-2xl font-black text-[#15803D]">
                Đơn hàng đã hoàn tất!
              </h2>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Tiền khách đưa:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {formatVND(completedInvoice.cash_given || completedInvoice.total_amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Đã trả lại khách:</span>
                  <span className="font-bold text-[#E12B2B] text-sm">
                    {formatVND(completedInvoice.change_given || 0)}
                  </span>
                </div>
              </div>
              {/* BỎ nút In lại hóa đơn theo mục 38 / ảnh 66 */}
            </div>

            {/* CỘT PHẢI (8 CỘT): PHIẾU HÓA ĐƠN BÁN HÀNG FIGMA UC 3 */}
            <div className="lg:col-span-8 bg-white p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6">
              <div className="text-center pb-4 border-b border-slate-100 space-y-1">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#024E82] mx-auto flex items-center justify-center mb-2">
                  <Store className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-[#024E82] uppercase tracking-wide">
                  TẠP HÓA HẰNG
                </h3>
                <p className="text-xs text-slate-500">
                  32 Phạm Xuân Ẩn, Hòa Xuân, Đà Nẵng
                </p>
                <h4 className="text-base font-bold text-slate-800 pt-3 uppercase tracking-wide">
                  HÓA ĐƠN BÁN HÀNG
                </h4>
                <p className="font-mono text-xs font-bold text-slate-700">{completedInvoice.code}</p>
              </div>

              <div className="flex justify-between text-xs text-slate-600 py-1">
                <span>Thời gian: <span className="font-medium text-slate-800">{formatDateTime(completedInvoice.created_at).replace(' ', ' · ')}</span></span>
                <span>Khách hàng: <span className="font-medium text-slate-800">{completedInvoice.customer_name || 'Khách lẻ'}</span></span>
              </div>

              {/* Bảng dòng hàng hóa đơn */}
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8FAFC] text-slate-500 font-semibold border-y border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Mã SP / Tên sản phẩm</th>
                    <th className="py-2.5 px-2 text-center">ĐVT</th>
                    <th className="py-2.5 px-2 text-center">SL</th>
                    <th className="py-2.5 px-2 text-right">Đơn giá</th>
                    <th className="py-2.5 px-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completedInvoice.items.map((i: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-slate-900">{i.product_name}</p>
                        <p className="font-mono text-[10px] text-slate-400">{i.product_barcode}</p>
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-500">{i.unit}</td>
                      <td className="py-2.5 px-2 text-center font-bold text-slate-800">{i.quantity}</td>
                      <td className="py-2.5 px-2 text-right text-slate-600">
                        {formatVND(i.unit_price).replace(' ₫', '').replace(' đ', '')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        {formatVND(i.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Ô Tổng tiền chuẩn Figma */}
              <div className="p-4 bg-[#ECF3F9] rounded-xl flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Tổng tiền</span>
                <span className="text-2xl font-black text-[#024E82]">
                  {formatVND(completedInvoice.total_amount)}
                </span>
              </div>

              <div className="space-y-2 text-xs pt-1">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Phương thức:</span>
                  <span className="font-bold text-slate-800">
                    {completedInvoice.payment_method === 'cash' ? 'Tiền mặt' : completedInvoice.payment_method === 'transfer' ? 'Chuyển khoản' : 'Ghi nợ'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Đã thanh toán:</span>
                  <span className="font-bold text-emerald-600">{formatVND(completedInvoice.status === 'unpaid' ? 0 : completedInvoice.total_amount)}</span>
                </div>
                {completedInvoice.payment_method === 'cash' && (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Tiền khách đưa:</span>
                      <span className="font-bold text-slate-800">{formatVND(completedInvoice.cash_given || completedInvoice.total_amount)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Tiền thừa trả khách:</span>
                      <span className="font-bold text-[#E12B2B]">{formatVND(completedInvoice.change_given || 0)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="text-center pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-800">Cảm ơn quý khách. Hẹn gặp lại!</p>
                <p className="text-[11px] text-slate-400">Vui lòng giữ hóa đơn để đối chiếu.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KHU VỰC IN HÓA ĐƠN KHỔ 80MM */}
      <div id="receipt-print-area" className="print-only">
        {completedInvoice && (
          <div className="text-black font-sans leading-tight">
            <div className="text-center pb-2 border-b border-black">
              <h2 className="text-base font-bold uppercase">{storeName}</h2>
              <h3 className="text-xs font-bold mt-2">HÓA ĐƠN BÁN HÀNG</h3>
              <p className="text-[10px]">Mã: {completedInvoice.code}</p>
              <p className="text-[10px]">Ngày: {formatDateTime(completedInvoice.created_at)}</p>
              <p className="text-[10px]">Người bán: {isOwner ? 'Chủ cửa hàng' : 'Nhân viên'}</p>
              {completedInvoice.customer_name && (
                <p className="text-[10px] font-bold">Khách: {completedInvoice.customer_name}</p>
              )}
            </div>

            <table className="w-full text-[10px] my-2 text-left">
              <thead>
                <tr className="border-b border-black">
                  <th className="py-1">Mặt hàng</th>
                  <th className="py-1 text-center">SL</th>
                  <th className="py-1 text-right">Đơn giá</th>
                  <th className="py-1 text-right">T.Tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dotted divide-gray-400">
                {completedInvoice.items.map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-1">
                      <p className="font-medium">{item.product_name}</p>
                    </td>
                    <td className="py-1 text-center">{item.quantity}</td>
                    <td className="py-1 text-right">{item.unit_price?.toLocaleString('vi-VN')}</td>
                    <td className="py-1 text-right font-bold">{item.total_amount?.toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pt-2 border-t border-black space-y-1 text-[11px]">
              <div className="flex justify-between font-bold">
                <span>Tổng tiền:</span>
                <span>{completedInvoice.total_amount?.toLocaleString('vi-VN')} ₫</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>Phương thức:</span>
                <span className="font-bold">
                  {completedInvoice.payment_method === 'cash'
                    ? 'Tiền mặt'
                    : completedInvoice.payment_method === 'transfer'
                    ? 'Chuyển khoản'
                    : 'Ghi nợ'}
                </span>
              </div>
              {completedInvoice.payment_method === 'cash' && (
                <>
                  <div className="flex justify-between text-[10px]">
                    <span>Tiền khách đưa:</span>
                    <span>{completedInvoice.cash_given?.toLocaleString('vi-VN')} ₫</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold">
                    <span>Tiền thừa:</span>
                    <span>{completedInvoice.change_given?.toLocaleString('vi-VN')} ₫</span>
                  </div>
                </>
              )}
            </div>

            <div className="text-center pt-4 border-t border-black mt-3 text-[10px]">
              <p>Cảm ơn quý khách. Hẹn gặp lại!</p>
              <p className="text-[9px] text-gray-600 mt-1">Đổi/trả vui lòng xuất trình hóa đơn trong ngày</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
