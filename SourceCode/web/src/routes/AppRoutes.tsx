import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AppLayout } from '../components/layout/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { POSPage } from '../pages/POSPage';
import { InvoicesPage } from '../pages/InvoicesPage';
import { ProductsPage } from '../pages/ProductsPage';
import { CategoriesPage } from '../pages/CategoriesPage';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';
import { InventoryPage } from '../pages/InventoryPage';
import { DisposalsPage } from '../pages/DisposalsPage';
import { ReturnsPage } from '../pages/ReturnsPage';
import { ReportsPage } from '../pages/ReportsPage';
import { ExpensesPage } from '../pages/ExpensesPage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

// Route bảo vệ yêu cầu đăng nhập
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner message="Đang kiểm tra phiên đăng nhập..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Route bảo vệ yêu cầu vai trò Chủ (SPEC Mục 8)
const OwnerOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOwner, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner message="Đang xác thực quyền hạn..." />
      </div>
    );
  }

  if (!isOwner) {
    // Nhân viên không có quyền truy cập màn hình này -> điều hướng về POS
    return <Navigate to="/pos" replace />;
  }

  return <>{children}</>;
};

// Trang chủ điều hướng theo vai trò (Chủ vào Dashboard, Nhân viên vào POS)
const HomeIndexRoute: React.FC = () => {
  const { isOwner } = useAuth();
  return isOwner ? <DashboardPage /> : <Navigate to="/pos" replace />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Các route yêu cầu đăng nhập */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeIndexRoute />} />
        <Route path="pos" element={<POSPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
        <Route
          path="inventory"
          element={
            <OwnerOnlyRoute>
              <InventoryPage />
            </OwnerOnlyRoute>
          }
        />
        <Route path="disposals" element={<DisposalsPage />} />
        <Route path="returns" element={<ReturnsPage />} />

        {/* CÁC ROUTE CHỈ CHỦ MỚI ĐƯỢC TRUY CẬP (SPEC MỤC 8) */}
        <Route
          path="reports"
          element={
            <OwnerOnlyRoute>
              <ReportsPage />
            </OwnerOnlyRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <OwnerOnlyRoute>
              <ExpensesPage />
            </OwnerOnlyRoute>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
