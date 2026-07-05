import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import api from '../api';
import axios from 'axios';
import {
  LogIn, UserPlus, RefreshCw, Smartphone, Building2,
  User as UserIcon, ShieldCheck, CheckCircle, X, KeyRound,
  Mail, Eye, EyeOff, Send,
} from 'lucide-react';
import type { User, CaptchaData, LoginResponse, Department, MustChangePasswordResponse } from '../types';

/**
 * AD 帳號支援三種格式（前端僅基本格式檢查，後端統一標準化）：
 *   username              → tzou.wilson_admin
 *   UPN                   → tzou.wilson_admin@crownvantw.com
 *   NetBIOS domain\user   → CROWNVANTW\tzou.wilson_admin
 */
const AD_USERNAME_REGEX = /^[a-zA-Z0-9][\w._@\\-]{0,127}$/;

type LoginTab = 'employee' | 'admin' | 'local';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<LoginTab>('employee');
  const [isRegister, setIsRegister] = useState(false);

  // ── 員工登入 tab ──────────────────────────────────────────
  const [empId, setEmpId] = useState('');
  const [name, setName] = useState('');
  const [deptId, setDeptId] = useState<number | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [captchaText, setCaptchaText] = useState('');
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState('');
  const [empSuccess, setEmpSuccess] = useState('');

  // ── AD 管理 tab ───────────────────────────────────────────
  const [adUsername, setAdUsername] = useState('');
  const [adPassword, setAdPassword] = useState('');
  const [showAdPw, setShowAdPw] = useState(false);
  const [showEmailOtpFlow, setShowEmailOtpFlow] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [adLoading, setAdLoading] = useState(false);
  const [adError, setAdError] = useState('');
  const [adInfo, setAdInfo] = useState('');

  // ── 本地緊急登入 tab ──────────────────────────────────────
  const [localEmpId, setLocalEmpId] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [showLocalPw, setShowLocalPw] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  // ── 初始化 ────────────────────────────────────────────────
  const fetchCaptcha = async () => {
    try {
      const res = await api.get('/auth/captcha');
      setCaptchaData(res.data);
      setCaptchaText('');
    } catch {
      setEmpError('無法取得驗證碼，請檢查伺服器狀態');
    }
  };

  useEffect(() => {
    fetchCaptcha();
    api.get('/auth/departments').then((res) => setDepartments(res.data)).catch(() => {});

    const pendingEmpId = localStorage.getItem('pendingRegistrationEmpId');
    if (pendingEmpId) {
      setEmpId(pendingEmpId);
      setIsRegister(true);
      localStorage.removeItem('pendingRegistrationEmpId');
    }
  }, []);

  const handleLoginSuccess = (token: string, user: User) => {
    localStorage.setItem('token', token);
    onLoginSuccess(user);
    navigate('/', { replace: true });
  };

  const switchTab = (tab: LoginTab) => {
    setActiveTab(tab);
    setEmpError('');
    setAdError('');
    setAdInfo('');
    setLocalError('');
  };

  // ── 員工登入 ──────────────────────────────────────────────
  const handleEmpLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!empId || !captchaText) { setEmpError('請輸入員工編號與驗證碼'); return; }
    if (empId.toLowerCase() !== 'admin' && !/^[0-9]{1,6}$/.test(empId)) {
      setEmpError('員工編號必須是 1–6 碼的數字');
      return;
    }
    if (!captchaData?.captcha_id) {
      setEmpError('驗證碼尚未載入，請稍候');
      await fetchCaptcha();
      return;
    }
    setEmpLoading(true);
    setEmpError('');
    try {
      const res = await api.post<LoginResponse>('/auth/login', {
        emp_id: empId,
        captcha_id: captchaData.captcha_id,
        answer: captchaText,
      });
      handleLoginSuccess(res.data.access_token, res.data.user);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setEmpError(err.response?.data?.detail || '登入失敗，請檢查員編與驗證碼');
      } else {
        setEmpError('系統發生錯誤，請稍後再試');
      }
      fetchCaptcha();
    } finally {
      setEmpLoading(false);
    }
  };

  const handleEmpRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!empId || !name || !deptId) { setEmpError('請填寫所有欄位'); return; }
    if (!/^[0-9]{1,10}$/.test(empId)) { setEmpError('員工編號必須是 1–10 碼的數字'); return; }
    if (name.length > 20) { setEmpError('姓名最長 20 個字符'); return; }
    if (!name.trim()) { setEmpError('請輸入有效的姓名'); return; }
    setEmpLoading(true);
    setEmpError('');
    try {
      await api.post('/auth/register', { emp_id: empId, name, dept_id: deptId });
      setIsRegister(false);
      setEmpError('');
      setEmpSuccess('註冊成功，請開始登入');
      setTimeout(() => setEmpSuccess(''), 3000);
      fetchCaptcha();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setEmpError(err.response?.data?.detail || '註冊失敗');
      } else {
        setEmpError('註冊時發生錯誤');
      }
    } finally {
      setEmpLoading(false);
    }
  };

  // ── AD 管理登入 ───────────────────────────────────────────
  const handleAdLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!adUsername || !adPassword) { setAdError('請輸入帳號與密碼'); return; }
    if (!AD_USERNAME_REGEX.test(adUsername)) {
      setAdError('帳號格式不符（支援 username、user@domain.com 或 DOMAIN\\username）');
      return;
    }
    setAdLoading(true);
    setAdError('');
    setAdInfo('');
    setShowEmailOtpFlow(false);
    try {
      const res = await api.post<LoginResponse>('/auth/login/admin', {
        username: adUsername,
        password: adPassword,
      });
      handleLoginSuccess(res.data.access_token, res.data.user);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 503) {
        const body = err.response.data as { detail?: string; fallback?: string };
        if (body?.fallback === 'email') {
          // AD 斷線且有 Email OTP 備援 → 展開 OTP 流程
          setShowEmailOtpFlow(true);
          setAdInfo('AD 目前無法連線，請改用信箱 OTP 驗證');
        } else {
          // AD 未啟用或其他 503 → 僅顯示錯誤，不展開 OTP
          setAdError(body?.detail ?? '服務暫時無法使用');
        }
      } else if (axios.isAxiosError(err)) {
        setAdError(err.response?.data?.detail || '登入失敗');
      } else {
        setAdError('系統發生錯誤，請稍後再試');
      }
    } finally {
      setAdLoading(false);
    }
  };

  const handleOtpRequest = async () => {
    setAdLoading(true);
    setAdError('');
    try {
      await api.post('/auth/login/admin/email/request', { username: adUsername });
      setOtpSent(true);
      setAdInfo('OTP 已發送，請查看您的信箱，並在下方輸入驗證碼');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const detail = err.response?.data?.detail || 'OTP 發送失敗';
        if (status === 403) {
          // 帳號未曾透過 AD 登入，系統中無 Email 紀錄
          setAdError(`${detail}。首次登入須先在 AD 可連線時完成登入；若 AD 持續無法使用，請改用「緊急登入」分頁。`);
          setShowEmailOtpFlow(false);
        } else {
          setAdError(detail);
        }
      } else {
        setAdError('系統發生錯誤，請稍後再試');
      }
    } finally {
      setAdLoading(false);
    }
  };

  const handleOtpVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpCode) { setAdError('請輸入信箱驗證碼'); return; }
    setAdLoading(true);
    setAdError('');
    try {
      const res = await api.post<LoginResponse>('/auth/login/admin/email/verify', {
        username: adUsername,
        otp_code: otpCode,
      });
      handleLoginSuccess(res.data.access_token, res.data.user);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setAdError(err.response?.data?.detail || 'OTP 驗證失敗');
      } else {
        setAdError('系統發生錯誤，請稍後再試');
      }
    } finally {
      setAdLoading(false);
    }
  };

  // ── 本地緊急登入 ──────────────────────────────────────────
  const handleLocalLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!localEmpId || !localPassword) { setLocalError('請輸入帳號與密碼'); return; }
    setLocalLoading(true);
    setLocalError('');
    try {
      const res = await api.post<LoginResponse | MustChangePasswordResponse>('/auth/login/local', {
        emp_id: localEmpId,
        password: localPassword,
      });
      if ('must_change_password' in res.data && res.data.must_change_password) {
        navigate('/login/change-password', { state: { change_token: res.data.change_token } });
        return;
      }
      const loginData = res.data as LoginResponse;
      handleLoginSuccess(loginData.access_token, loginData.user);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 423) {
          setLocalError('帳號已暫時鎖定，請稍後再試');
        } else {
          setLocalError(err.response?.data?.detail || '登入失敗');
        }
      } else {
        setLocalError('系統發生錯誤，請稍後再試');
      }
    } finally {
      setLocalLoading(false);
    }
  };

  // ── Tab 設定 ──────────────────────────────────────────────
  const tabs: { id: LoginTab; label: string }[] = [
    { id: 'employee', label: '員工登入' },
    { id: 'admin', label: 'AD 管理' },
    { id: 'local', label: '緊急登入' },
  ];

  const headerIcon =
    activeTab === 'admin' ? <ShieldCheck className="w-10 h-10" /> :
    activeTab === 'local' ? <KeyRound className="w-10 h-10" /> :
    isRegister ? <UserPlus className="w-10 h-10" /> : <LogIn className="w-10 h-10" />;

  const headerTitle =
    activeTab === 'admin' ? 'AD 管理登入' :
    activeTab === 'local' ? '本地緊急登入' :
    isRegister ? '加入系統' : '歡迎回來';

  const headerSubtitle =
    activeTab === 'admin' ? '使用 Active Directory 帳號登入' :
    activeTab === 'local' ? '僅限 break-glass 帳號使用' :
    isRegister ? '只需三步即可完成註冊' : '請輸入您的員工編號進行驗證';

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
        {/* ── 藍色 Header ── */}
        <div className="bg-blue-600 p-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-32 h-32 bg-blue-400/20 rounded-full blur-2xl" />
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md border border-white/30">
              {headerIcon}
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">{headerTitle}</h2>
            <p className="text-blue-100 mt-2 text-sm font-medium opacity-90">{headerSubtitle}</p>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex border-b border-gray-100 bg-gray-50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { switchTab(tab.id); if (tab.id !== 'employee') setIsRegister(false); }}
              className={`flex-1 py-3 text-sm font-bold transition-all duration-200 ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-500 hover:text-blue-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── 員工登入 Tab ── */}
        {activeTab === 'employee' && (
          <form onSubmit={isRegister ? handleEmpRegister : handleEmpLogin} className="p-10 space-y-7 bg-white">
            {empError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded-r-lg">
                <span className="font-bold">提示：</span>{empError}
              </div>
            )}
            {empSuccess && (
              <div className="bg-green-50 border-l-4 border-green-500 p-4 text-green-700 text-sm rounded-r-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{empSuccess}</span>
                  </div>
                  <button type="button" onClick={() => setEmpSuccess('')} className="text-green-600 hover:text-green-800">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-5">
              {/* 員工編號 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">員工編號</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <Smartphone size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder={isRegister ? '請輸入 10 碼以內的數字' : '請輸入 6 碼員工編號'}
                    className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                    value={empId}
                    onChange={(e) => {
                      let value = e.target.value;
                      if (isRegister) {
                        value = value.replace(/[^0-9]/g, '').slice(0, 10);
                      } else {
                        const lowerValue = value.toLowerCase();
                        if (lowerValue === 'admin' || lowerValue.startsWith('admin')) {
                          value = 'admin';
                        } else if (/^[0-9]*$/.test(value)) {
                          value = value.slice(0, 6);
                        } else if (/^[a-zA-Z]*$/.test(value)) {
                          const lower = value.toLowerCase();
                          if (lower.startsWith('admin')) {
                            value = 'admin';
                          } else if (!'admin'.startsWith(lower)) {
                            value = '';
                          }
                        } else {
                          value = value.replace(/[^0-9]/g, '').slice(0, 6);
                        }
                      }
                      setEmpId(value);
                    }}
                    maxLength={isRegister ? 10 : 6}
                    inputMode={isRegister ? 'numeric' : 'text'}
                  />
                </div>
              </div>

              {/* 姓名 & 部門（僅註冊） */}
              {isRegister && (
                <>
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-left-4 duration-300">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">真實姓名</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                        <UserIcon size={18} />
                      </div>
                      <input
                        type="text"
                        placeholder="請輸入您的姓名（最長 20 個字符）"
                        className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, 20))}
                        maxLength={20}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-left-4 duration-500">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">所屬部門</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                        <Building2 size={18} />
                      </div>
                      <select
                        className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium appearance-none"
                        value={deptId || ''}
                        onChange={(e) => setDeptId(Number(e.target.value))}
                      >
                        <option value="" disabled>請選擇部門</option>
                        {departments.map((dept) => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 驗證碼（僅登入） */}
              {!isRegister && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">驗證碼</label>
                  <div className="flex gap-3">
                    <div className="flex-1 relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                        <ShieldCheck size={18} />
                      </div>
                      <input
                        type="text"
                        placeholder="請輸入 4 碼數字驗證碼"
                        className="block w-full pl-11 pr-3 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-bold tracking-widest"
                        value={captchaText}
                        onChange={(e) => setCaptchaText(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                        maxLength={4}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="relative flex items-center bg-gray-50 rounded-2xl border border-gray-200 p-1 group">
                      <div className="h-11 w-28 rounded-xl overflow-hidden shadow-inner flex items-center justify-center bg-white cursor-pointer px-1" onClick={fetchCaptcha}>
                        {captchaData ? (
                          <img src={captchaData.image} alt="captcha" className="w-full h-full object-contain select-none" />
                        ) : (
                          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={fetchCaptcha}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                        title="刷新驗證碼"
                      >
                        <RefreshCw size={18} className={empLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={empLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-4 rounded-2xl shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:bg-blue-300 disabled:shadow-none disabled:translate-y-0"
            >
              {empLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  <span>處理中...</span>
                </div>
              ) : (
                isRegister ? <><UserPlus size={20} /> 立即創建帳號</> : <><LogIn size={20} /> 驗證並登入系統</>
              )}
            </button>

            <div className="pt-4 text-center border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setIsRegister(!isRegister); setEmpError(''); }}
                className="group text-gray-500 hover:text-blue-600 text-sm font-semibold transition-colors flex items-center justify-center mx-auto gap-1"
              >
                {isRegister ? (
                  <>已經有帳號了？ <span className="text-blue-600 group-hover:underline">返回登入介面</span></>
                ) : (
                  <>還沒有帳號嗎？ <span className="text-blue-600 group-hover:underline">點此註冊您的工號</span></>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ── AD 管理登入 Tab ── */}
        {activeTab === 'admin' && (
          <div className="p-10 space-y-6 bg-white">
            {adError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded-r-lg">
                <span className="font-bold">提示：</span>{adError}
              </div>
            )}

            {/* AD 表單 */}
            <form onSubmit={handleAdLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">AD 帳號</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <UserIcon size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder="請輸入 AD 帳號（如 it01）"
                    className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                    value={adUsername}
                    onChange={(e) => setAdUsername(e.target.value)}
                    maxLength={128}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">密碼</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <ShieldCheck size={18} />
                  </div>
                  <input
                    type={showAdPw ? 'text' : 'password'}
                    placeholder="請輸入 AD 密碼"
                    className="block w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                    value={adPassword}
                    onChange={(e) => setAdPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdPw(!showAdPw)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    {showAdPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={adLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-4 rounded-2xl shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:bg-blue-300 disabled:shadow-none disabled:translate-y-0"
              >
                {adLoading && !showEmailOtpFlow ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    <span>驗證中...</span>
                  </div>
                ) : (
                  <><ShieldCheck size={20} /> AD 登入</>
                )}
              </button>
            </form>

            {/* OTP 備援區塊（503 + fallback:email 時展開） */}
            {showEmailOtpFlow && (
              <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-amber-800 text-sm">
                      {adInfo || 'AD 目前無法連線'}
                    </p>
                    <p className="text-amber-700 text-xs mt-1">
                      帳號：<span className="font-mono font-bold">{adUsername}</span>
                    </p>
                  </div>
                </div>

                {!otpSent ? (
                  <button
                    type="button"
                    onClick={handleOtpRequest}
                    disabled={adLoading}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {adLoading ? (
                      <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    發送 OTP 至我的信箱
                  </button>
                ) : (
                  <form onSubmit={handleOtpVerify} className="space-y-3">
                    <p className="text-xs text-amber-700 font-medium">
                      ✉️ OTP 已發送，請查看信箱並於時效內輸入
                    </p>
                    <input
                      type="text"
                      placeholder="請輸入信箱收到的驗證碼"
                      className="block w-full px-4 py-3 bg-white border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none text-gray-700 font-mono font-bold tracking-widest"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.slice(0, 8))}
                      maxLength={8}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={adLoading}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {adLoading ? (
                          <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        ) : (
                          <LogIn size={16} />
                        )}
                        驗證並登入
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtpCode(''); }}
                        className="px-4 py-3 text-amber-700 hover:bg-amber-100 rounded-xl text-sm font-semibold transition-colors"
                      >
                        重新發送
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 本地緊急登入 Tab ── */}
        {activeTab === 'local' && (
          <form onSubmit={handleLocalLogin} className="p-10 space-y-6 bg-white">
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-xs text-yellow-800 space-y-1">
              <p className="font-bold">⚠️ 僅限緊急使用</p>
              <p>此登入方式僅供 break-glass 本地帳號使用，日常請改用 AD 管理登入。</p>
            </div>

            {localError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded-r-lg">
                <span className="font-bold">提示：</span>{localError}
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">帳號</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <UserIcon size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder="本地帳號（如 admin）"
                    className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                    value={localEmpId}
                    onChange={(e) => setLocalEmpId(e.target.value)}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">密碼</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <KeyRound size={18} />
                  </div>
                  <input
                    type={showLocalPw ? 'text' : 'password'}
                    placeholder="請輸入本地密碼"
                    className="block w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                    value={localPassword}
                    onChange={(e) => setLocalPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLocalPw(!showLocalPw)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    {showLocalPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={localLoading}
              className="w-full bg-gray-700 hover:bg-gray-800 text-white font-extrabold py-4 rounded-2xl shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:bg-gray-400 disabled:shadow-none disabled:translate-y-0"
            >
              {localLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  <span>驗證中...</span>
                </div>
              ) : (
                <><KeyRound size={20} /> 緊急登入</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
