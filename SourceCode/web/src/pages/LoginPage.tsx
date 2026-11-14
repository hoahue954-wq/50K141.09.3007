import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    const expiredMsg = sessionStorage.getItem('th_hang_session_expired');
    if (expiredMsg) {
      setErrorMsg(expiredMsg);
      sessionStorage.removeItem('th_hang_session_expired');
    }
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setHasSubmitted(true);
    setErrorMsg('');

    const isUserEmpty = !username.trim();
    const isPassEmpty = !password;

    if (isUserEmpty || isPassEmpty) {
      return;
    }

    setIsLoading(true);
    try {
      await login(username, password);
      sessionStorage.setItem('show_login_success', 'true');
      navigate('/');
    } catch {
      setErrorMsg('Đăng nhập không thành công!');
    } finally {
      setIsLoading(false);
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
        <div className="w-full max-w-[520px] bg-white rounded-2xl border border-[var(--border)] p-7 sm:p-9 md:p-10 space-y-8 shadow-xs">
          <div>
            <h2 className="text-2xl md:text-[30px] leading-tight font-bold text-slate-900 tracking-tight">
              Đăng nhập hệ thống
            </h2>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            {errorMsg && (
              <div className="p-3.5 bg-[#FEF2F2] border border-[#FEE2E2] rounded-xl text-danger text-sm font-medium flex items-center gap-2.5" role="alert">
                <AlertCircle className="w-5 h-5 text-danger shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Tên đăng nhập"
                  aria-label="Tên đăng nhập"
                  aria-invalid={hasSubmitted && !username.trim()}
                  className={`w-full pl-12 pr-11 h-[54px] rounded-xl text-sm font-medium border transition-colors outline-none placeholder:text-slate-400 ${
                    hasSubmitted && !username.trim()
                      ? 'border-danger focus:border-danger'
                      : 'border-[var(--border)] focus:border-[var(--color-primary)]'
                  }`}
                />
                {hasSubmitted && !username.trim() && (
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-danger">
                    <AlertCircle className="w-5 h-5 text-danger" />
                  </div>
                )}
              </div>
              {hasSubmitted && !username.trim() && (
                <p className="mt-1.5 text-xs text-danger font-medium">Không được để trống!</p>
              )}
            </div>

            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Mật khẩu"
                  aria-label="Mật khẩu"
                  aria-invalid={hasSubmitted && !password}
                  className={`w-full pl-12 pr-12 h-[54px] rounded-xl text-sm font-medium border transition-colors outline-none placeholder:text-slate-400 ${
                    hasSubmitted && !password
                      ? 'border-danger focus:border-danger'
                      : 'border-[var(--border)] focus:border-[var(--color-primary)]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute inset-y-0 right-0 px-4 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
              {hasSubmitted && !password && (
                <p className="mt-1.5 text-xs text-danger font-medium">Không được để trống!</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="ui-button ui-button-primary w-full min-h-[52px] px-4 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              <span>{isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
