import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatVND, formatDateTime } from '../utils/format';
import { Search, Package, AlertTriangle, XCircle, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';

const PAGE_SIZE = 10;

type StockStatus = 'out' | 'low' | 'ok';

function getStockStatus(qty: number, min: number): StockStatus {
  if (qty <= 0) return 'out';
  if (qty <= min) return 'low';
  return 'ok';
}

const statusConfig: Record<StockStatus, { label: string; dotColor: string; badgeClass: string; textClass: string }> = {
  out: {
    label: 'Hết hàng',
    dotColor: 'bg-primary',
    badgeClass: 'bg-primary-soft text-primary border border-[var(--border)]',
    textClass: 'text-primary',
  },
  low: {
    label: 'Sắp hết hàng',
    dotColor: 'bg-primary',
    badgeClass: 'bg-primary-soft text-primary border border-[var(--border)]',
    textClass: 'text-primary',
  },
  ok: {
    label: 'Còn hàng',
    dotColor: 'bg-primary',
    badgeClass: 'bg-primary-soft text-primary border border-[var(--border)]',
    textClass: 'text-slate-700',
  },
};

export const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'out' | 'low' | 'ok'>('all');
  const [page, setPage] = useState(1);

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
    const matchStock = stockFilter === 'all' || status === stockFilter;
    return matchSearch && matchCat && matchStock;
  });

  const totalCount = products.length;
  const lowCount = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock).length;
  const outCount = products.filter((p) => p.stock_quantity <= 0).length;

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const paged = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const updatedAt = new Date();

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Thống kê kho</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Theo dõi số lượng tồn kho của từng sản phẩm tại thời điểm hiện tại.
        </p>
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
          {/* Thẻ thống kê */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center">
                <Package className="w-5 h-5 text-[var(--color-primary)]" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Tổng số mặt hàng</p>
                <p className="text-2xl font-bold text-slate-800 mt-0.5">{totalCount}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Số mặt hàng sắp hết</p>
                <p className="text-2xl font-bold text-primary mt-0.5">{lowCount}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center">
                <XCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Số mặt hàng hết hàng</p>
                <p className="text-2xl font-bold text-primary mt-0.5">{outCount}</p>
              </div>
            </div>
          </div>

          {/* Bảng danh sách */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Bộ lọc */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên sản phẩm hoặc mã vạch..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] min-w-40"
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={stockFilter}
                onChange={(e) => { setStockFilter(e.target.value as any); setPage(1); }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] min-w-44"
              >
                <option value="all">Tất cả trạng thái tồn kho</option>
                <option value="out">Hết hàng</option>
                <option value="low">Sắp hết hàng</option>
                <option value="ok">Còn hàng</option>
              </select>
            </div>

            {filteredProducts.length === 0 ? (
              <EmptyState
                title="Không tìm thấy sản phẩm phù hợp"
                description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm"
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="ui-table w-full text-sm text-left">
                    <thead className="bg-[var(--color-primary-soft)] text-slate-500 text-xs">
                      <tr>
                        <th className="py-3 px-4 font-medium">Mã vạch</th>
                        <th className="py-3 px-4 font-medium">Tên sản phẩm</th>
                        <th className="py-3 px-4 font-medium">Danh mục</th>
                        <th className="py-3 px-4 font-medium">Đơn vị tính</th>
                        <th className="py-3 px-4 font-medium text-center">Số lượng tồn</th>
                        <th className="py-3 px-4 font-medium text-center">Trạng thái tồn kho</th>
                        <th className="py-3 px-4 font-medium text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paged.map((p) => {
                        const status = getStockStatus(p.stock_quantity, p.min_stock);
                        const cfg = statusConfig[status];
                        return (
                          <tr key={p.barcode} className="hover:bg-slate-50/60">
                            <td className="py-3.5 px-4 text-slate-500 text-xs font-mono">{p.barcode}</td>
                            <td className="py-3.5 px-4 font-medium text-slate-800">{p.name}</td>
                            <td className="py-3.5 px-4 text-slate-500 text-xs">{p.category_name}</td>
                            <td className="py-3.5 px-4 text-slate-500 text-xs">{p.unit}</td>
                            <td className={`py-3.5 px-4 text-center font-bold ${cfg.textClass}`}>
                              {p.stock_quantity}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badgeClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                onClick={() => navigate(`/products?mode=detail&barcode=${p.barcode}`)}
                                className="text-[var(--color-primary)] hover:underline text-xs font-medium cursor-pointer"
                              >
                                Xem chi tiết
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer: phân trang */}
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <span className="text-xs text-slate-500">
                    Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredProducts.length)} trong {filteredProducts.length} sản phẩm
                    &nbsp;·&nbsp;Cập nhật: {formatDateTime(updatedAt.toISOString())}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pg = i + 1;
                      return (
                        <button
                          key={pg}
                          onClick={() => setPage(pg)}
                          className={`w-7 h-7 rounded-lg text-xs font-medium ${
                            page === pg
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'hover:bg-slate-200 text-slate-600'
                          }`}
                        >
                          {pg}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Lưu ý */}
          <div className="flex items-start gap-2 p-3 bg-primary-soft rounded-xl border border-primary-soft text-sm text-primary">
            <span>ⓘ</span>
            <span>
              Tồn kho = Nhập − Bán + Khách trả − Hủy. Chỉ tính phiếu nhập hoàn thành và phiếu hủy đã được phê duyệt.
            </span>
          </div>
        </>
      )}
    </div>
  );
};
