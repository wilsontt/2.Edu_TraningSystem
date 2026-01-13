import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QrCode, Loader2, AlertCircle, CheckCircle, LogIn, RefreshCw } from 'lucide-react';
import api from '../api';
import { AxiosError } from 'axios';

interface QRCodeLoginPageProps {
  onLoginSuccess: (user: any) => void;
}

const QRCodeLoginPage: React.FC<QRCodeLoginPageProps> = ({ onLoginSuccess }) => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [empId, setEmpId] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [captchaData, setCaptchaData] = useState<{ captcha_id: string; image: string } | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{ expires_at?: string } | null>(null);

  // 格式化時間（明確處理 UTC 時間轉換為台灣時區）
  const formatDateTime = (dateString: string) => {
    // 如果字串沒有時區資訊，加上 'Z' 表示 UTC
    const utcString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
    const date = new Date(utcString);
    
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Taipei' // 明確指定台灣時區
    });
  };

  // 載入驗證碼
  const fetchCaptcha = async () => {
    try {
      const res = await api.get('/auth/captcha');
      setCaptchaData(res.data);
      setCaptchaText('');
    } catch (err) {
      console.error('Failed to fetch captcha', err);
    }
  };

  // 驗證 token 並載入驗證碼
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError('無效的 QRcode 連結');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await api.get(`/auth/login/qrcode/${token}`);
        
        if (res.data.valid) {
          setIsValid(true);
          setTokenInfo({ expires_at: res.data.expires_at });
          setError(null);
          // Token 有效後載入驗證碼
          await fetchCaptcha();
        } else {
          setIsValid(false);
          setError(res.data.reason || 'QRcode 無效或已過期');
        }
      } catch (err) {
        console.error('Token validation failed', err);
        const error = err as AxiosError<{ detail: string }>;
        setIsValid(false);
        setError(error.response?.data?.detail || '驗證 QRcode 失敗');
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  // 執行登入
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!empId.trim()) {
      setError('請輸入員工編號');
      return;
    }

    if (!captchaText.trim()) {
      setError('請輸入驗證碼');
      return;
    }

    if (!token) {
      setError('無效的 QRcode 連結');
      return;
    }

    if (!captchaData?.captcha_id) {
      setError('驗證碼未載入，請重新整理頁面');
      return;
    }

    try {
      setValidating(true);
      setError(null);
      
      const res = await api.post(`/auth/login/qrcode/${token}`, {
        emp_id: empId,
        captcha_id: captchaData.captcha_id,
        answer: captchaText
      });

      // 儲存 token 並觸發登入成功
      localStorage.setItem('token', res.data.access_token);
      onLoginSuccess(res.data.user);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('QRcode login failed', err);
      const error = err as AxiosError<{ detail: string }>;
      setError(error.response?.data?.detail || '登入失敗，請檢查員工編號與驗證碼');
      // 登入失敗後重新載入驗證碼
      fetchCaptcha();
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">驗證 QRcode</h2>
          <p className="text-gray-500">正在驗證 QRcode 有效性...</p>
        </div>
      </div>
    );
  }

  if (!isValid || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">QRcode 無效</h2>
          <p className="text-gray-500 mb-6">{error || '此 QRcode 已過期'}</p>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors"
          >
            返回首頁
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="bg-blue-600 p-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-32 h-32 bg-blue-400/20 rounded-full blur-2xl"></div>
          
          <div className="relative z-10">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md border border-white/30">
              <QrCode className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">QRcode 快速登入</h2>
            <p className="text-blue-100 mt-3 text-sm font-medium opacity-90">
              請輸入您的員工編號與驗證碼進行登入
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="p-10 space-y-7 bg-white">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded-r-lg">
              <div className="flex items-center gap-2">
                <span className="font-bold shrink-0">提示：</span>
                {error}
              </div>
            </div>
          )}

          {tokenInfo?.expires_at && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 text-blue-700 text-sm rounded-r-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>QRcode 有效，將於 {formatDateTime(tokenInfo.expires_at)} 過期</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">員工編號</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                <LogIn size={18} />
              </div>
              <input
                type="text"
                placeholder="例如: E123456"
                className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">驗證碼</label>
            <div className="flex items-center gap-3">
              <div className="relative group flex-1">
                <input
                  type="text"
                  placeholder="請輸入驗證碼"
                  className="block w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                  value={captchaText}
                  onChange={(e) => setCaptchaText(e.target.value)}
                  maxLength={4}
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                {captchaData?.image && (
                  <img 
                    src={captchaData.image} 
                    alt="驗證碼" 
                    className="h-12 w-auto border border-gray-200 rounded-lg"
                  />
                )}
                <button
                  type="button"
                  onClick={fetchCaptcha}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="重新載入驗證碼"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={validating || !empId.trim() || !captchaText.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-4 rounded-2xl shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:bg-blue-300 disabled:shadow-none disabled:translate-y-0"
          >
            {validating ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                <span>登入中...</span>
              </div>
            ) : (
              <>
                <LogIn size={20} /> 確認登入
              </>
            )}
          </button>

          <div className="pt-6 text-center border-t border-gray-100">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-gray-500 hover:text-blue-600 text-sm font-semibold transition-colors"
            >
              返回一般登入頁面
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QRCodeLoginPage;
