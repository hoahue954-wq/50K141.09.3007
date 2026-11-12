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
      }
    } else {
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
  };

  // Tính tổng tiền
  const totalAmount = cart.reduce(
    (sum, item) => sum + item.quantity * item.product.selling_price,
    0
  );

  const parsedCashGiven = Number(cashGivenStr) || 0;
  const changeAmount = Math.max(0, parsedCashGiven - totalAmount);

  // NumPad click handler
  const handleNumpadClick = (val: string) => {
    if (val === 'backspace') {
      setCashGivenStr((prev) => prev.slice(0, -1));
    } else {
      setCashGivenStr((prev) => prev + val);
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
              <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setBarcodeInput(e.target.value);
                    }}
                    placeholder="Tên sản phẩm hoặc quét mã vạch..."
                    className="ui-input w-full pl-10 pr-4 py-2.5 text-sm focus:border-[var(--color-primary)]"
                  />
                </div>
                <button
                  type="submit"
                  className="ui-button ui-button-primary w-11 h-11 min-h-11 p-0 rounded-lg flex items-center justify-center shrink-0"
                  title="Nhận mã quét"
                >
                  <Barcode className="w-5 h-5" />
                </button>
              </form>

              {/* Bộ lọc Pills danh mục chuẩn Figma */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedCatId('all')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    selectedCatId === 'all'
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-primary-soft text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white'
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
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* Section: Hàng bán thường xuyên (Figma UC 2) */}
              <div className="flex items-center justify-between pt-1">
                <h3 className="text-sm font-bold text-slate-900">Hàng bán thường xuyên</h3>
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
                    className="w-full min-h-[148px] text-left bg-primary-soft p-4 rounded-xl border border-[var(--border)] hover:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer transition-colors flex flex-col justify-between"
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
                      <span className="text-base font-black text-[var(--color-primary)]">
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
                <h2 className="text-lg font-bold text-[var(--color-primary)]">Giỏ hàng</h2>
              </div>

              {/* Bảng dòng hàng trong giỏ */}
              <div className="overflow-x-auto min-h-[220px] max-h-[min(52vh,460px)] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary-soft text-slate-500 font-semibold">
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
                            className="text-danger hover:bg-danger-soft p-1 rounded"
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

              {/* Tổng tiền dùng màu nhấn theo quy ước giao diện */}
              <div className="p-4 bg-highlight m-4 rounded-xl flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Tổng tiền</span>
                <span className="text-2xl font-black text-slate-900">{formatVND(totalAmount)}</span>
              </div>

              {/* 2 Nút Hủy đơn & Hoàn thành đơn chuẩn Figma */}
              <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
                <button
                  type="button"
                  onClick={handleResetOrder}
                  disabled={cart.length === 0}
                  className="ui-button py-3 px-4 border border-danger text-danger hover:bg-danger-soft rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                  Hủy đơn
                </button>

                <button
                  type="button"
                  onClick={() => setStep('checkout')}
                  disabled={cart.length === 0}
                  className="ui-button py-3 px-4 bg-success bg-success-hover text-white rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-40"
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
              <h1 className="text-2xl font-bold text-[var(--color-primary)] tracking-tight">Thanh toán đơn hàng</h1>
              <p className="mt-0.5 text-sm text-slate-500">Chọn phương thức thanh toán cho đơn hàng.</p>
            </div>
            <button
              onClick={() => setStep('cart')}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
            >
              ← Quay lại giỏ hàng
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 xl:gap-6 items-start">
            {/* CỘT TRÁI (5 CỘT): TÓM TẮT GIỎ HÀNG FIGMA */}
            <div className="xl:col-span-5 bg-white p-5 rounded-xl border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Giỏ hàng</h2>

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

              {/* Ô Tổng tiền */}
              <div className="p-4 bg-highlight rounded-xl flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Tổng tiền</span>
                <span className="text-2xl font-black text-slate-900">{formatVND(totalAmount)}</span>
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
                      ? 'border-[var(--color-primary)] bg-primary-soft text-[var(--color-primary)] font-bold ring-2 ring-[var(--color-primary)]/20'
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
                      ? 'border-[var(--color-primary)] bg-primary-soft text-[var(--color-primary)] font-bold ring-2 ring-[var(--color-primary)]/20'
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
                      ? 'border-[var(--color-primary)] bg-primary-soft text-[var(--color-primary)] font-bold ring-2 ring-[var(--color-primary)]/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
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
                        value={cashGivenStr}
                        onChange={(e) => setCashGivenStr(e.target.value)}
                        placeholder={totalAmount.toString()}
                        className="w-full text-2xl font-black text-slate-900 px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[var(--color-primary)]"
                      />
                      <span className="absolute right-4 top-4 font-bold text-slate-400">₫</span>
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
                      className="py-3 bg-[var(--color-primary)] text-white rounded-xl font-bold text-xs"
                    >
                      Đủ tiền
                    </button>
                  </div>

                  <div className="pt-2 flex justify-between text-xs text-slate-500">
                    <span>Khách cần trả:</span>
                    <span className="font-bold text-slate-900">{formatVND(totalAmount)}</span>
                  </div>

                  {/* Khối Tiền thừa màu hồng/đỏ nhạt chuẩn Figma UC 6 */}
                  <div className="p-4 bg-danger-soft rounded-xl flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Tiền thừa</span>
                    <span className="text-2xl font-black text-danger">
                      {formatVND(changeAmount)}
                    </span>
                  </div>

                  {/* Nút Thanh toán hoàn tất màu xanh lá Figma */}
                  <button
                    type="button"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full py-4 bg-success bg-success-hover text-white font-bold rounded-lg text-base flex items-center justify-center gap-2 shadow-xs"
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
                      <span className="font-mono font-bold text-[var(--color-primary)]">
                        BH{Date.now().toString().slice(-6)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full py-4 bg-success bg-success-hover text-white font-bold rounded-lg text-base flex items-center justify-center gap-2 shadow-xs"
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
                      Khách hàng (Bắt buộc khách quen)
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-[var(--color-primary)] bg-white"
                    >
                      <option value="">-- Chọn khách quen ghi nợ --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''} — Nợ cũ: {formatVND(c.total_debt)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedCustomer && (
                    <div className="p-4 rounded-xl border border-[var(--color-primary)]/30 bg-primary-soft flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white font-bold flex items-center justify-center text-sm shrink-0">
                        {selectedCustomer.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{selectedCustomer.name}</p>
                        <span className="inline-block text-[10px] font-bold bg-white text-[var(--color-primary)] px-2 py-0.5 rounded-full border border-primary-soft">
                          Khách quen
                        </span>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {selectedCustomer.code} · {selectedCustomer.phone || 'Không có SĐT'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-highlight rounded-xl flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Ghi nợ mới</span>
                    <span className="text-2xl font-black text-slate-900">{formatVND(totalAmount)}</span>
                  </div>

                  {/* Nút Lưu đơn nợ & in hóa đơn màu xanh dương Figma UC 4 */}
                  <button
                    type="button"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={!selectedCustomerId || checkoutMutation.isPending}
                    className="w-full py-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl text-base flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                  >
                    <FileText className="w-5 h-5" />
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
              <h1 className="text-2xl font-bold text-[var(--color-primary)] tracking-tight">
                {completedInvoice.status === 'unpaid' ? 'Đã lưu hóa đơn nợ' : 'Hoàn tất đơn hàng'}
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Mã hóa đơn: <span className="font-mono font-semibold">{completedInvoice.code}</span>
                {completedInvoice.status === 'unpaid' && ' · Chưa thanh toán'}
              </p>
            </div>
            <button
              onClick={handleResetOrder}
              className="px-4 py-2 bg-[var(--color-primary)] text-white text-xs font-bold rounded-xl hover:bg-[var(--color-primary-hover)]"
            >
              + Tạo đơn hàng tiếp theo
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* CỘT TRÁI (4 CỘT): THÔNG BÁO HOÀN TẤT */}
            <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div
                className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full ${
                  completedInvoice.status === 'unpaid'
                    ? 'bg-primary-soft text-primary'
                    : 'bg-primary-soft text-primary'
                }`}
              >
                {completedInvoice.status === 'unpaid' ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <Check className="h-6 w-6 stroke-[3]" />
                )}
              </div>

              <h2
                className={`text-2xl font-black ${
                  completedInvoice.status === 'unpaid' ? 'text-primary' : 'text-primary'
                }`}
              >
                {completedInvoice.status === 'unpaid'
                  ? 'Đơn hàng đang ghi nợ'
                  : 'Đơn hàng đã thanh toán!'}
              </h2>
              {completedInvoice.status === 'unpaid' && (
                <p className="text-sm text-primary">
                  Hóa đơn này chưa được thanh toán và sẽ được ghi nhận trong sổ nợ.
                </p>
              )}

              {completedInvoice.payment_method === 'cash' && (
                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tiền khách đưa:</span>
                    <span className="font-bold">{formatVND(completedInvoice.cash_given)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Đã trả lại khách:</span>
                    <span className="font-bold text-danger">
                      {formatVND(completedInvoice.change_given)}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={() => window.print()}
                className="w-full mt-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                In lại hóa đơn
              </button>
            </div>

            {/* CỘT PHẢI (8 CỘT): PHIẾU HÓA ĐƠN BÁN HÀNG FIGMA UC 3 */}
            <div className="lg:col-span-8 bg-white p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6">
              <div className="text-center pb-4 border-b border-slate-100 space-y-1">
                <div className="w-10 h-10 rounded-xl bg-primary-soft text-[var(--color-primary)] mx-auto flex items-center justify-center mb-2">
                  <Store className="w-5 h-5" />
                </div>
                <h3 className="font-black text-lg text-slate-900 uppercase">
                  {storeName}
                </h3>
                <h4 className="text-base font-bold text-slate-800 pt-2 uppercase tracking-wide">
                  HÓA ĐƠN BÁN HÀNG
                </h4>
                <p className="font-mono text-xs font-bold text-[var(--color-primary)]">{completedInvoice.code}</p>
              </div>

              <div className="flex justify-between text-xs text-slate-600">
                <span>Thời gian: {formatDateTime(completedInvoice.created_at)}</span>
                <span className="font-medium">
                  Khách hàng: {completedInvoice.customer_name || 'Khách lẻ'}
                </span>
              </div>

              {/* Bảng dòng hàng hóa đơn */}
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--surface-muted)] text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2 px-3">Mã SP / Tên sản phẩm</th>
                    <th className="py-2 px-2 text-center">ĐVT</th>
                    <th className="py-2 px-2 text-center">SL</th>
                    <th className="py-2 px-2 text-right">Đơn giá</th>
                    <th className="py-2 px-3 text-right">Thành tiền</th>
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
                      <td className="py-2.5 px-2 text-right text-slate-600">{formatVND(i.unit_price)}</td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        {formatVND(i.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Ô Tổng tiền */}
              <div className="p-4 bg-highlight rounded-xl flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Tổng tiền</span>
                <span className="text-2xl font-black text-slate-900">
                  {formatVND(completedInvoice.total_amount)}
                </span>
              </div>

              <div className="text-center pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-800">Cảm ơn quý khách. Hẹn gặp lại!</p>
                <p className="text-[11px] text-slate-400">Vui lòng giữ hóa đơn để đổi chiếu.</p>
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
