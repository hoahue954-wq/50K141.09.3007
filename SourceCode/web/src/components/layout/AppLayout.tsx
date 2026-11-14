import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { POSDraftProvider } from '../../context/POSDraftContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  FolderTree,
  Truck,
  Warehouse,
  ArrowLeftRight,
  RotateCcw,
  BarChart3,
  TrendingUp,
  DollarSign,
  LogOut,
  Menu,
  X,
  Store,
  ChevronRight,
  ChevronDown,
  User,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { isOwner, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isReportSubmenuOpen, setIsReportSubmenuOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Tra cứu tiêu đề trang cho thanh Breadcrumb
  const pageTitleMap: Record<string, string> = {
    '/': 'Tổng quan',
    '/pos': 'Bán hàng',
    '/products': 'Sản phẩm',
    '/categories': 'Danh mục sản phẩm',
    '/purchase-orders': 'Nhập hàng',
    '/inventory': 'Kho',
    '/invoices': 'Hóa đơn',
    '/disposals': 'Hủy hàng',
    '/returns': 'Đổi/trả hàng',
    '/reports': 'Báo cáo',
    '/expenses': 'Chi phí phát sinh',
  };

  const currentBreadcrumb = pageTitleMap[location.pathname] || 'Tổng quan';
  const searchParams = new URLSearchParams(location.search);
  const reportTab = searchParams.get('tab') || 'revenue';
  const isReportsPage = location.pathname === '/reports';

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col md:flex-row">
      {/* SIDEBAR DESKTOP THEO CHUẨN FIGMA (Màu xanh dương var(--color-primary)) */}
      <aside className="app-sidebar no-print hidden md:flex flex-col w-[var(--sidebar-width)] bg-primary text-white shrink-0 shadow-lg">
        {/* Brand Logo Figma */}
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight leading-tight">Tạp hóa Hằng</span>
            <span className="text-xs text-white/70">Quản lý bán hàng</span>
          </div>
        </div>

        {/* Section Header Figma */}
        <div className="px-5 pt-3 pb-2 text-[11px] font-bold text-white/60 tracking-wider uppercase">
          Không gian làm việc
        </div>

        {/* Menu Navigation Figma */}
        <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto">
          {/* Tổng quan (Chủ xem Dashboard, NV xem Tổng quan của NV) */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <LayoutDashboard className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                <span>Tổng quan</span>
              </>
            )}
          </NavLink>

          {/* Bán hàng */}
          <NavLink
            to="/pos"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <ShoppingCart className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                <span>Bán hàng</span>
              </>
            )}
          </NavLink>

          {/* Sản phẩm */}
          <NavLink
            to="/products"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Package className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                <span>Sản phẩm</span>
              </>
            )}
          </NavLink>

          {/* Danh mục sản phẩm */}
          <NavLink
            to="/categories"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <FolderTree className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                <span>Danh mục sản phẩm</span>
              </>
            )}
          </NavLink>

          {/* Nhập hàng */}
          <NavLink
            to="/purchase-orders"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Truck className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                <span>Nhập hàng</span>
              </>
            )}
          </NavLink>

          {/* Kho (Chỉ Chủ - Theo chuẩn Figma) */}
          {isOwner && (
            <NavLink
              to="/inventory"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Warehouse className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                  <span>Kho</span>
                </>
              )}
            </NavLink>
          )}

          {/* Hóa đơn */}
          <NavLink
            to="/invoices"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Receipt className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                <span>Hóa đơn</span>
              </>
            )}
          </NavLink>

          {/* Hủy hàng */}
          <NavLink
            to="/disposals"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <ArrowLeftRight className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                <span>Hủy hàng</span>
              </>
            )}
          </NavLink>

          {/* Đổi/trả hàng */}
          <NavLink
            to="/returns"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <RotateCcw className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : 'text-white'}`} />
                <span>Đổi/trả hàng</span>
              </>
            )}
          </NavLink>

          {/* Báo cáo (Chỉ Chủ - Theo chuẩn Figma) */}
          {isOwner && (
            <div>
              <button
                type="button"
                onClick={() => setIsReportSubmenuOpen(!isReportSubmenuOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors text-white/85 hover:bg-white/10 hover:text-white"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-white" />
                  <span>Báo cáo</span>
                </div>
                {isReportSubmenuOpen ? (
                  <ChevronDown className="w-4 h-4 opacity-70" />
                ) : (
                  <ChevronRight className="w-4 h-4 opacity-70" />
                )}
              </button>

              {isReportSubmenuOpen && (
                <div className="ml-6 mt-1 space-y-1">
                  <NavLink
                    to="/reports?tab=revenue"
                    className={() => {
                      const isActive = isReportsPage && reportTab !== 'profit';
                      return `flex items-center px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                          : 'text-white/85 hover:bg-white/10 hover:text-white'
                      }`;
                    }}
                  >
                    Doanh thu
                  </NavLink>
                  <NavLink
                    to="/reports?tab=profit"
                    className={() => {
                      const isActive = isReportsPage && reportTab === 'profit';
                      return `flex items-center px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-white text-[var(--color-primary)] font-bold shadow-xs'
                          : 'text-white/85 hover:bg-white/10 hover:text-white'
                      }`;
                    }}
                  >
                    Lợi nhuận
                  </NavLink>
                </div>
              )}
            </div>
          )}

        </nav>

        {/* Đăng xuất dưới chân sidebar */}
        <div className="p-3 border-t border-white/15">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* KHU VỰC CHÍNH BÊN PHẢI */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP BAR THEO CHUẨN FIGMA */}
        <header className="no-print h-[var(--header-height)] bg-white border-b border-[var(--border)] px-4 md:px-8 flex items-center justify-between sticky top-0 z-30">
          {/* Breadcrumbs chuẩn Figma */}
          <div className="flex items-center gap-2 text-xs md:text-sm text-slate-500">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 mr-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Store className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-600">Tạp hóa Hằng</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            {location.pathname === '/inventory' ? (
              <>
                <span className="font-medium text-slate-500">Kho</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-900">Thống kê kho</span>
              </>
            ) : location.pathname === '/invoices' && new URLSearchParams(location.search).has('settle') ? (
              <>
                <span className="font-medium text-slate-500">Hóa đơn</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-900">Cập nhật trạng thái hóa đơn</span>
              </>
            ) : location.pathname === '/invoices' && (new URLSearchParams(location.search).has('detail') || new URLSearchParams(location.search).has('id')) ? (
              <>
                <span className="font-medium text-slate-500">Hóa đơn</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-900">Chi tiết hóa đơn</span>
              </>
            ) : isReportsPage ? (
              <>
                <span className="font-medium text-slate-500">Báo cáo</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-900">
                  {reportTab === 'profit' ? 'Lợi nhuận' : 'Doanh thu'}
                </span>
              </>
            ) : (
              <span className="font-semibold text-slate-900">{currentBreadcrumb}</span>
            )}
          </div>

          {/* User Badge chuẩn Figma: Circle User icon + Chủ cửa hàng / Nhân viên */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[var(--color-primary-soft)] border border-primary-soft flex items-center justify-center text-primary">
                <User className="w-4 h-4" />
              </div>
              <span className="text-xs md:text-sm font-semibold text-slate-800">
                {isOwner ? 'Chủ cửa hàng' : 'Nhân viên'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
        </header>

        {/* MOBILE DRAWER */}
        {isMobileMenuOpen && (
          <div className="no-print md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end">
            <div className="app-sidebar bg-primary text-white rounded-t-3xl max-h-[85vh] overflow-y-auto p-5 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-white/20">
                <div className="flex items-center gap-2">
                  <Store className="w-6 h-6 text-white" />
                  <span className="font-bold text-base">Tạp hóa Hằng</span>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                    {isOwner ? 'Chủ' : 'Nhân viên'}
                  </span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-white/70 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Links */}
              <nav className="py-2 space-y-1">
                {[
                  { to: '/', label: 'Tổng quan', icon: <LayoutDashboard className="w-5 h-5" /> },
                  { to: '/pos', label: 'Bán hàng', icon: <ShoppingCart className="w-5 h-5" /> },
                  { to: '/products', label: 'Sản phẩm', icon: <Package className="w-5 h-5" /> },
                  { to: '/categories', label: 'Danh mục sản phẩm', icon: <FolderTree className="w-5 h-5" /> },
                  { to: '/purchase-orders', label: 'Nhập hàng', icon: <Truck className="w-5 h-5" /> },
                  ...(isOwner
                    ? [{ to: '/inventory', label: 'Kho', icon: <Warehouse className="w-5 h-5" /> }]
                    : []),
                  { to: '/invoices', label: 'Hóa đơn', icon: <Receipt className="w-5 h-5" /> },
                  { to: '/disposals', label: 'Hủy hàng', icon: <ArrowLeftRight className="w-5 h-5" /> },
                  { to: '/returns', label: 'Đổi/trả hàng', icon: <RotateCcw className="w-5 h-5" /> },
                  ...(isOwner
                    ? [
                        { to: '/reports?tab=revenue', label: 'Báo cáo doanh thu', icon: <BarChart3 className="w-5 h-5" /> },
                        { to: '/reports?tab=profit', label: 'Báo cáo lợi nhuận', icon: <TrendingUp className="w-5 h-5" /> },
                        { to: '/expenses', label: 'Chi phí phát sinh', icon: <DollarSign className="w-5 h-5" /> },
                      ]
                    : []),
                ].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                        isActive ? 'bg-white text-[var(--color-primary)] font-bold' : 'text-white/80 hover:bg-white/10'
                      }`
                    }
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                className="mt-3 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-primary rounded-xl"
              >
                <LogOut className="w-4 h-4" />
                Đăng xuất
              </button>
            </div>
          </div>
        )}

        {/* NỘI DUNG TRANG */}
        <main className="flex-1 min-w-0 pb-16 md:pb-0">
          <POSDraftProvider>
            <Outlet />
          </POSDraftProvider>
        </main>
      </div>

      {/* BOTTOM NAV BAR MOBILE (Bán hàng, Sản phẩm, Hóa đơn, Menu) */}
      <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-slate-200 flex items-center justify-around z-30 shadow-lg">
        <NavLink
          to="/pos"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--color-primary)] font-bold' : 'text-slate-500'
            }`
          }
        >
          <ShoppingCart className="w-5 h-5 mb-0.5" />
          <span>Bán hàng</span>
        </NavLink>
        <NavLink
          to="/products"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--color-primary)] font-bold' : 'text-slate-500'
            }`
          }
        >
          <Package className="w-5 h-5 mb-0.5" />
          <span>Sản phẩm</span>
        </NavLink>
        <NavLink
          to="/invoices"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--color-primary)] font-bold' : 'text-slate-500'
            }`
          }
        >
          <Receipt className="w-5 h-5 mb-0.5" />
          <span>Hóa đơn</span>
        </NavLink>
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>Thêm</span>
        </button>
      </nav>
    </div>
  );
};
