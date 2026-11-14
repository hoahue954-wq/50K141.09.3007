import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Search, Package, AlertTriangle, Ban, ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';

const PAGE_SIZE = 10;

type StockStatus = 'out' | 'low' | 'ok';

function getStockStatus(qty: number, min: number): StockStatus {
  if (qty <= 0) return 'out';
  if (qty <= min) return 'low';
  return 'ok';
}

function formatUnit(unit?: string): string {
  if (!unit) return '';
  const trimmed = unit.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const statusConfig: Record<StockStatus, { label: string; dotClass: string; badgeClass: string; qtyClass: string }> = {
  out: {
    label: 'Hết hàng',
    dotClass: 'bg-red-600',
    badgeClass: 'bg-red-50 text-red-700',
    qtyClass: 'text-red-600 font-bold',
  },
  low: {
    label: 'Sắp hết hàng',
    dotClass: 'bg-amber-600',
    badgeClass: 'bg-amber-50 text-amber-800',
    qtyClass: 'text-amber-700 font-bold',
  },
  ok: {
    label: 'Còn hàng',
    dotClass: 'bg-emerald-600',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    qtyClass: 'text-slate-800 font-bold',
  },
};

export const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'out' | 'low' | 'ok'>('all');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'stats' | 'alerts'>('stats');

  const { data: inventoryData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['inventory-stats'],
    queryFn: () => api.inventory.getStats(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const products = inventoryData?.products || [];

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search.trim());
    const matchCat = !categoryFilter || p.category_id === categoryFilter;
    const status = getStockStatus(p.stock_quantity, p.min_stock);
    
    if (viewMode === 'alerts') {
      const isAlert = status === 'out' || status === 'low';
      if (!isAlert) return false;
      const matchStock = stockFilter === 'all' || status === stockFilter;
      return matchSearch && matchCat && matchStock;
    }

    const matchStock = stockFilter === 'all' || status === stockFilter;
    return matchSearch && matchCat && matchStock;
  });

  const totalCount = products.length;
  const lowCount = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock).length;
  const outCount = products.filter((p) => p.stock_quantity <= 0).length;
  const alertCount = lowCount + outCount;

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paged = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const now = new Date();
  const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header chuẩn Figma */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-primary)]">
            {viewMode === 'alerts' ? 'Cảnh báo tồn kho' : 'Thống kê kho'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {viewMode === 'alerts'
              ? 'Ưu tiên bổ sung sản phẩm hết hàng và sản phẩm dưới ngưỡng cảnh báo.'
              : 'Theo dõi số lượng tồn kho của từng sản phẩm tại thời điểm hiện tại.'}
          </p>
        </div>

        {/* Nút Thông báo / Thống kê kho */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setViewMode('stats');
              setStockFilter('all');
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-colors ${
              viewMode === 'stats'
                ? 'bg-[var(--color-primary)] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Thống kê kho
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('alerts');
              setStockFilter('all');
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-colors flex items-center gap-2 ${
              viewMode === 'alerts'
                ? 'bg-[var(--color-primary)] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Cảnh báo tồn kho</span>
            {alertCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                viewMode === 'alerts' ? 'bg-white text-[var(--color-primary)]' : 'bg-red-500 text-white'
              }`}>
                {alertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải dữ liệu kho..." />}
      {isError && (
        <ErrorState
          title="Không tải được dữ liệu tồn kho"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && (
        <>
          {/* Thẻ thống kê chuẩn Figma */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {viewMode === 'stats' ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex items-center gap-4 shadow-2xs">
                <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                  <Package className="w-6 h-6 text-sky-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Tổng số mặt hàng</p>
                  <p className="text-3xl font-black text-slate-900 mt-1">{totalCount}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex items-center gap-4 shadow-2xs">
                <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-sky-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Tổng sản phẩm cần cảnh báo</p>
                  <p className="text-3xl font-black text-slate-900 mt-1">{alertCount}</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex items-center gap-4 shadow-2xs">
              <div className="w-12 h-12 rounded-xl bg-[#FEF3C7] border border-amber-200/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-[#B45309]" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Số mặt hàng sắp hết</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{lowCount}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex items-center gap-4 shadow-2xs">
              <div className="w-12 h-12 rounded-xl bg-[#FEF2F2] border border-red-200/60 flex items-center justify-center shrink-0">
                <Ban className="w-6 h-6 text-[#DC2626]" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Số mặt hàng hết hàng</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{outCount}</p>
              </div>
            </div>
          </div>

          {/* Bảng danh sách & Bộ lọc */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            {/* Bộ lọc chuẩn Figma */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative min-w-[260px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên sản phẩm hoặc mã vạch..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-11 pr-4 h-11 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] placeholder:text-slate-400"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full md:w-64 h-11 px-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] bg-white text-slate-700"
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                value={stockFilter}
                onChange={(e) => {
                  setStockFilter(e.target.value as any);
                  setPage(1);
                }}
                className="w-full md:w-64 h-11 px-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] bg-white text-slate-700"
              >
                <option value="all">
                  {viewMode === 'alerts' ? 'Tất cả cảnh báo' : 'Tất cả trạng thái tồn kho'}
                </option>
                {viewMode === 'stats' && <option value="ok">Còn hàng</option>}
                <option value="low">Sắp hết hàng</option>
                <option value="out">Hết hàng</option>
              </select>
            </div>

            {/* Bảng dữ liệu hoặc Màn hình trống */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#f0f4f9] text-slate-600 text-xs font-semibold">
                  <tr>
                    <th className="py-3 px-6">Mã vạch</th>
                    <th className="py-3 px-6">Tên sản phẩm</th>
                    <th className="py-3 px-6">Danh mục</th>
                    <th className="py-3 px-6">Đơn vị tính</th>
                    <th className="py-3 px-6 text-center">Số lượng tồn</th>
                    <th className="py-3 px-6 text-center">Trạng thái tồn kho</th>
                    <th className="py-3 px-6 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <div className="py-16 px-4 text-center">
                          <Search className="w-12 h-12 text-[var(--color-primary)] mx-auto stroke-[1.5]" />
                          <h3 className="text-base md:text-lg font-bold text-slate-900 mt-4">
                            Không tìm thấy sản phẩm phù hợp
                          </h3>
                          <p className="text-xs md:text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
                            {search.trim()
                              ? `Không có kết quả cho “${search.trim()}”. Thử từ khóa khác hoặc xóa tìm kiếm.`
                              : 'Không có sản phẩm nào phù hợp với bộ lọc hiện tại.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSearch('');
                              setCategoryFilter('');
                              setStockFilter('all');
                              setPage(1);
                            }}
                            className="mt-5 px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs md:text-sm font-semibold rounded-xl shadow-xs transition-colors"
                          >
                            Xóa tìm kiếm
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paged.map((p) => {
                      const status = getStockStatus(p.stock_quantity, p.min_stock);
                      const cfg = statusConfig[status];
                      return (
                        <tr key={p.barcode} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-4 px-6 text-slate-500 text-xs font-mono">{p.barcode}</td>
                          <td className="py-4 px-6 font-semibold text-slate-900">{p.name}</td>
                          <td className="py-4 px-6 text-slate-600 text-xs">{p.category_name}</td>
                          <td className="py-4 px-6 text-slate-600 text-xs">{formatUnit(p.unit)}</td>
                          <td className={`py-4 px-6 text-center text-sm ${cfg.qtyClass}`}>
                            {p.stock_quantity}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${cfg.badgeClass}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <button
                              onClick={() => navigate(`/products?mode=detail&barcode=${p.barcode}`)}
                              className="text-[var(--color-primary)] hover:underline text-xs font-medium cursor-pointer"
                            >
                              Xem chi tiết
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer phân trang chuẩn Figma */}
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
              <span className="text-xs text-slate-500 font-medium">
                {filteredProducts.length === 0 ? (
                  '0 sản phẩm phù hợp · Bộ lọc đang áp dụng'
                ) : (
                  `Hiển thị ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredProducts.length)} trong ${filteredProducts.length} sản phẩm`
                )}
              </span>

              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-400 font-medium hidden md:inline">
                  Cập nhật: {dateFormatted} · {timeFormatted}
                </span>

                {filteredProducts.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 text-xs"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => {
                      const pg = i + 1;
                      return (
                        <button
                          key={pg}
                          onClick={() => setPage(pg)}
                          className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                            page === pg
                              ? 'bg-[var(--color-primary)] text-white shadow-xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {pg}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 text-xs"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lưu ý dưới chân bảng chuẩn Figma */}
          <div className="flex items-start gap-2.5 p-4 bg-sky-50 rounded-2xl border border-sky-100 text-xs md:text-sm text-slate-600">
            <span className="text-sky-600 font-bold shrink-0">ⓘ</span>
            <span>
              Tồn kho = Nhập − Bán + Khách trả − Hủy. Chỉ tính phiếu nhập hoàn thành và phiếu hủy đã được phê duyệt.
            </span>
          </div>
        </>
      )}
    </div>
  );
};
