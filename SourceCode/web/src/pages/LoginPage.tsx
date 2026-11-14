import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, User, Lock, Eye, EyeOff, ShieldCheck, CheckCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { showSuccess } = useToast();

  React.useEffect(() => {
    const expiredMsg = sessionStorage.getItem('th_hang_session_expired');
    if (expiredMsg) {
      setErrorMsg(expiredMsg);
      sessionStorage.removeItem('th_hang_session_expired');
    }
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Vui lòng nhập tên đăng nhập.');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);
    try {
      const user = await login(username, password);
      showSuccess(`Đăng nhập thành công! Chào mừng ${user.full_name}`);
      if (user.role === 'owner') {
        navigate('/');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (role: 'owner' | 'staff') => {
    if (role === 'owner') {
      setUsername('chu@taphoahang.local');
      setPassword('123456');
      login('chu@taphoahang.local', '123456').then(() => {
        showSuccess('Đăng nhập thành công với vai trò Chủ!');
        navigate('/');
      });
    } else {
      setUsername('nhanvien@taphoahang.local');
      setPassword('123456');
      login('nhanvien@taphoahang.local', '123456').then(() => {
        showSuccess('Đăng nhập thành công với vai trò Nhân viên!');
        navigate('/');
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--color-bg)]">
      <div className="w-full md:w-[39%] bg-[var(--color-primary)] px-7 py-7 md:px-12 md:py-11 flex flex-col text-white relative overflow-hidden min-h-[360px] md:min-h-screen">
        {/* Logo trên cùng */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">Tạp hóa Hằng</span>
        </div>

        <div className="mt-12 md:mt-24 space-y-3 max-w-lg">
          <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tight leading-[1.12]">
            Hệ thống quản lý bán hàng
          </h1>
          <p className="text-white/80 text-sm md:text-base">
            Đơn giản, tiện lợi và tiết kiệm thời gian.
          </p>
        </div>

        <div className="relative mx-auto mt-10 md:mt-auto md:pt-12 w-full max-w-[390px] hidden sm:block">
          <svg viewBox="0 0 400 290" role="img" aria-label="Minh họa cửa hàng tạp hóa" className="w-full h-auto">
            <circle cx="200" cy="145" r="132" fill="var(--color-primary-hover)" />
            <rect x="55" y="249" width="290" height="8" rx="4" fill="var(--color-primary-hover)" />
            <rect x="80" y="92" width="240" height="166" rx="9" fill="var(--color-primary-soft)" />
            <path d="M66 98 82 66h236l16 32v19H66V98Z" fill="var(--surface)" />
            <rect x="66" y="98" width="34" height="21" rx="2" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
            <rect x="134" y="98" width="34" height="21" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
            <rect x="202" y="98" width="34" height="21" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
            <rect x="270" y="98" width="34" height="21" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
            <rect x="100" y="98" width="34" height="21" fill="var(--surface)" />
            <rect x="168" y="98" width="34" height="21" fill="var(--surface)" />
            <rect x="236" y="98" width="34" height="21" fill="var(--surface)" />
            <rect x="84" y="119" width="232" height="139" fill="var(--surface)" />
            <rect x="102" y="133" width="132" height="73" rx="3" fill="var(--surface)" stroke="color-mix(in srgb, var(--color-primary) 28%, white)" strokeWidth="4" />
            <path d="M105 170h126M105 195h126" stroke="color-mix(in srgb, var(--color-primary) 28%, white)" strokeWidth="4" />
            <rect x="111" y="145" width="13" height="17" rx="3" fill="var(--color-primary)" />
            <rect x="131" y="139" width="13" height="23" rx="3" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
            <rect x="152" y="146" width="14" height="16" rx="3" fill="var(--color-primary)" />
            <rect x="177" y="140" width="13" height="22" rx="3" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
            <rect x="198" y="145" width="14" height="17" rx="3" fill="var(--color-primary)" />
            <rect x="111" y="178" width="14" height="17" rx="3" fill="var(--color-primary)" />
            <rect x="132" y="173" width="13" height="22" rx="3" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
            <rect x="153" y="179" width="14" height="16" rx="3" fill="var(--color-primary)" />
            <rect x="177" y="173" width="13" height="22" rx="3" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
            <rect x="199" y="178" width="13" height="17" rx="3" fill="var(--color-primary)" />
            <rect x="250" y="135" width="62" height="123" rx="3" fill="color-mix(in srgb, var(--color-primary) 28%, white)" stroke="var(--surface)" strokeWidth="5" />
            <rect x="258" y="143" width="46" height="38" rx="3" fill="var(--color-primary-soft)" />
            <rect x="258" y="188" width="5" height="17" rx="2" fill="var(--color-primary)" />
            <rect x="125" y="75" width="150" height="27" rx="4" fill="var(--color-primary-soft)" />
            <text x="200" y="94" textAnchor="middle" fill="var(--color-primary)" fontSize="18" fontWeight="700" letterSpacing="1.5">TẠP HÓA HẰNG</text>
            <g transform="rotate(8 333 75)">
              <rect x="307" y="48" width="57" height="58" rx="14" fill="color-mix(in srgb, var(--color-primary) 28%, white)" />
              <path d="M325 64h21v28h-21zM330 70h11m-11 6h11m-11 6h8" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" />
            </g>
            <g transform="rotate(-8 52 207)">
              <rect x="29" y="180" width="68" height="66" rx="18" fill="var(--surface)" />
              <path d="M49 198h28v29H49zM49 198l5-7h18l5 7m-17 8a5 5 0 0 0 10 0" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" />
            </g>
          </svg>
        </div>
      </div>

      <div className="w-full md:flex-1 flex items-center justify-center px-5 py-10 md:px-12 md:py-12">
        <div className="w-full max-w-[520px] bg-white rounded-2xl border border-[var(--border)] p-7 sm:p-9 md:p-10 space-y-8">
          <div>
            <h2 className="text-2xl md:text-[30px] leading-tight font-bold text-slate-900 tracking-tight">
              Đăng nhập hệ thống
            </h2>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {errorMsg && (
              <div className="p-3.5 bg-danger-soft border border-danger/25 rounded-lg text-danger text-xs font-semibold flex items-center gap-2" role="alert">
                <span className="w-4 h-4 rounded-full border border-danger flex items-center justify-center shrink-0 text-[10px]">!</span>
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tên đăng nhập"
                  aria-label="Tên đăng nhập"
                  aria-invalid={Boolean(errorMsg && !username.trim())}
                  className={`ui-input w-full pl-12 pr-4 h-[54px] text-sm font-medium placeholder:text-slate-500 ${
                    errorMsg && !username.trim() ? 'border-danger focus:border-danger' : 'focus:border-[var(--color-primary)]'
                  }`}
                />
              </div>
              {errorMsg && !username.trim() && (
                <p className="mt-2 text-xs text-danger">Không được để trống!</p>
              )}
            </div>

            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu"
                  aria-label="Mật khẩu"
                  className="ui-input w-full pl-12 pr-12 h-[54px] text-sm font-medium placeholder:text-slate-500 focus:border-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute inset-y-0 right-0 px-4 flex items-center text-slate-500 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="ui-button ui-button-primary w-full min-h-[54px] px-4 text-sm rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              <span>{isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
            </button>

            {/* Phím tắt đăng nhập nhanh để kiểm tra phân quyền */}
            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs text-center text-slate-400 font-medium mb-2.5">
                ⚡ Chọn nhanh vai trò để kiểm tra phân quyền:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('owner')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-primary-soft hover:bg-primary-soft text-[var(--color-primary)] border border-primary-soft rounded-xl text-xs font-bold transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  Vào vai Chủ
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('staff')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                  Vào vai Nhân viên
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
