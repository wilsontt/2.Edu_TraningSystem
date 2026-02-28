import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import api from '../api';
import axios from 'axios';
import { LogIn, UserPlus, RefreshCw, Smartphone, Building2, User as UserIcon, ShieldCheck, CheckCircle, X } from 'lucide-react';
import type { User, CaptchaData, LoginResponse, Department } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [empId, setEmpId] = useState('');
  const [name, setName] = useState('');
  const [deptId, setDeptId] = useState<number | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [captchaText, setCaptchaText] = useState('');
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchCaptcha = async () => {
    try {
      const response = await api.get('/auth/captcha');
      setCaptchaData(response.data);
      setCaptchaText('');
    } catch {
      setError('無法取得驗證碼，請檢查伺服器狀態');
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/auth/departments');
      setDepartments(response.data);
    } catch {
      console.error('Failed to fetch departments');
    }
  };

  useEffect(() => {
    fetchCaptcha();
    fetchDepartments();
    
    // 檢查是否有保存的員工編號（從 QRcode 登入失敗而來）
    const pendingEmpId = localStorage.getItem('pendingRegistrationEmpId');
    if (pendingEmpId) {
      console.log('Found pending registration employee ID:', pendingEmpId);
      setEmpId(pendingEmpId);
      setIsRegister(true); // 自動切換到註冊模式
      localStorage.removeItem('pendingRegistrationEmpId'); // 清除保存的值
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!empId || !captchaText) {
      setError('請輸入員工編號與驗證碼');
      return;
    }
    
    // 驗證員工編號格式：必須是1-10碼的數字，或特殊帳號 "admin"
    if (empId.toLowerCase() !== 'admin' && !/^[0-9]{1,10}$/.test(empId)) {
      setError('員工編號必須是1-10碼的數字');
      return;
    }

    if (!captchaData?.captcha_id) {
      setError('驗證碼尚未載入，請稍候');
      await fetchCaptcha();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const loginPayload = {
        emp_id: empId,
        captcha_id: captchaData.captcha_id,
        answer: captchaText
      };
      console.log('DEBUG LOGIN: Sending login request', loginPayload);
      const response = await api.post<LoginResponse>('/auth/login', loginPayload);

      const { access_token, user } = response.data;
      localStorage.setItem('token', access_token);
      onLoginSuccess(user);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || '登入失敗，請檢查員編與驗證碼');
      } else {
        setError('系統發生錯誤，請稍後再試');
      }
      fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!empId || !name || !deptId) {
      setError('請填寫所有欄位');
      return;
    }
    
    // 驗證員工編號格式：必須是1-10碼的數字
    if (!/^[0-9]{1,10}$/.test(empId)) {
      setError('員工編號必須是1-10碼的數字');
      return;
    }
    
    // 驗證姓名長度：最長20個字符
    if (name.length > 20) {
      setError('姓名最長20個字符');
      return;
    }
    
    if (name.trim().length === 0) {
      setError('請輸入有效的姓名');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/auth/register', {
        emp_id: empId,
        name: name,
        dept_id: deptId
      });
      
      setIsRegister(false);
      setError('');
      setSuccess('註冊成功，請開始登入');
      // 3秒後自動清除成功訊息
      setTimeout(() => setSuccess(''), 3000);
      fetchCaptcha();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || '註冊失敗');
      } else {
        setError('註冊時發生錯誤');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 transition-all duration-500 hover:shadow-blue-100/50">
        <div className="bg-blue-600 p-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-32 h-32 bg-blue-400/20 rounded-full blur-2xl"></div>
          
          <div className="relative z-10">
            <div className="w-11 h-24 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md border border-white/30 rotate-3 transition-transform hover:rotate-0">
              {isRegister ? <UserPlus className="w-10 h-10" /> : <LogIn className="w-10 h-10" />}
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              {isRegister ? '加入系統' : '歡迎回來'}
            </h2>
            <p className="text-blue-100 mt-3 text-sm font-medium opacity-90">
              {isRegister ? '只需三步即可完成註冊' : '請輸入您的員工編號進行驗證'}
            </p>
          </div>
        </div>

        <form onSubmit={isRegister ? handleRegister : handleLogin} className="p-10 space-y-7 bg-white">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded-r-lg animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-2">
                <span className="font-bold shrink-0">提示：</span>
                {error}
              </div>
            </div>
          )}
          
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 text-green-700 text-sm rounded-r-lg animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{success}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccess('')}
                  className="text-green-600 hover:text-green-800 transition-colors"
                  aria-label="關閉"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">員工編號</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                  <Smartphone size={18} />
                </div>
                <input
                  type="text"
                  placeholder={isRegister ? "請輸入10碼以內的數字" : "請輸入員工編號"}
                  className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                  value={empId}
                  onChange={(e) => {
                    let value = e.target.value;
                    if (isRegister) {
                      // 註冊時只允許數字，且最長10碼
                      value = value.replace(/[^0-9]/g, '').slice(0, 10);
                    } else {
                      // 登入時允許 admin 或數字
                      const lowerValue = value.toLowerCase();
                      // 如果輸入的是 admin（不區分大小寫），保留
                      if (lowerValue === 'admin' || lowerValue.startsWith('admin')) {
                        value = 'admin';
                      } else if (/^[0-9]*$/.test(value)) {
                        // 如果全是數字，保留（最多10碼）
                        value = value.slice(0, 10);
                      } else if (/^[a-zA-Z]*$/.test(value)) {
                        // 如果全是字母，檢查是否在輸入 admin
                        const lower = value.toLowerCase();
                        if (lower.startsWith('admin')) {
                          value = 'admin';
                        } else if ('admin'.startsWith(lower)) {
                          // 允許輸入 admin 的過程中（例如：a, ad, adm, admi）
                          // value 保持不變
                        } else {
                          // 不是 admin 的開頭，清空
                          value = '';
                        }
                      } else {
                        // 混合字符，只保留數字部分
                        value = value.replace(/[^0-9]/g, '').slice(0, 10);
                      }
                    }
                    setEmpId(value);
                  }}
                  maxLength={isRegister ? 10 : 10}
                  pattern={isRegister ? "[0-9]*" : undefined}
                  inputMode={isRegister ? "numeric" : "text"}
                />
              </div>
            </div>

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
                      placeholder="請輸入您的姓名（最長20個字符）"
                      className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                      value={name}
                      onChange={(e) => {
                        // 最長20個字符（中英混合）
                        const value = e.target.value.slice(0, 20);
                        setName(value);
                      }}
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
                        {departments.map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
              </>
            )}

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
                      placeholder="請輸入4碼數字驗證碼"
                      className="block w-full pl-11 pr-3 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-bold tracking-widest"
                      value={captchaText}
                      onChange={(e) => {
                        // 只允許數字，且最長4碼
                        const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                        setCaptchaText(value);
                      }}
                      maxLength={4}
                      pattern="[0-9]*"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="relative flex items-center bg-gray-50 rounded-2xl border border-gray-200 p-1 group">
                    <div className="h-11 w-24 rounded-xl overflow-hidden shadow-inner flex items-center justify-center bg-white cursor-pointer" onClick={fetchCaptcha}>
                      {captchaData ? (
                        <img src={captchaData.image} alt="captcha" className="w-full h-full object-cover select-none" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={fetchCaptcha}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      title="刷新驗證碼"
                    >
                      <RefreshCw size={18} className={loading && !isRegister ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-4 rounded-2xl shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:bg-blue-300 disabled:shadow-none disabled:translate-y-0"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                <span>處理中...</span>
              </div>
            ) : (
              <>
                {isRegister ? <><UserPlus size={20} /> 立即創建帳號</> : <><LogIn size={20} /> 驗證並登入系統</>}
              </>
            )}
          </button>

          <div className="pt-6 text-center border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
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
      </div>
    </div>
  );
};

export default LoginPage;
