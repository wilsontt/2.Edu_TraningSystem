import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, Clock, ArrowLeft } from 'lucide-react';
import api from '../../api';

const CheckInPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan_id');
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<{
    is_checked_in: boolean;
    checkin_time?: string;
  } | null>(null);
  const [planTitle, setPlanTitle] = useState<string>('');

  useEffect(() => {
    const init = async () => {
      if (!planId) {
        setError('缺少訓練計畫 ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        // 檢查報到狀態
        const statusRes = await api.get(`/exam/plan/${planId}/attendance/status`);
        setAttendanceStatus({
          is_checked_in: statusRes.data.is_checked_in,
          checkin_time: statusRes.data.checkin_time
        });

        // 獲取計畫資訊（可選）
        try {
          const plansRes = await api.get('/training/plans');
          const plan = plansRes.data.find((p: any) => p.id === parseInt(planId));
          if (plan) {
            setPlanTitle(plan.title);
          }
        } catch {
          // 如果無法獲取計畫資訊，忽略
        }
      } catch (err: any) {
        console.error('Failed to load attendance status', err);
        setError(err.response?.data?.detail || '無法載入報到狀態');
        setAttendanceStatus({
          is_checked_in: false
        });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [planId]);

  const handleCheckIn = async () => {
    if (!planId) return;

    try {
      setCheckingIn(true);
      setError(null);
      const res = await api.post(`/exam/plan/${planId}/attendance/checkin`);
      
      setAttendanceStatus({
        is_checked_in: true,
        checkin_time: res.data.checkin_time || new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Failed to check in', err);
      setError(err.response?.data?.detail || '報到失敗，請稍後再試');
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">載入中</h2>
          <p className="text-gray-500">正在檢查報到狀態...</p>
        </div>
      </div>
    );
  }

  if (attendanceStatus?.is_checked_in) {
    const checkinTime = attendanceStatus.checkin_time 
      ? new Date(attendanceStatus.checkin_time).toLocaleString('zh-TW', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">報到成功</h2>
          {planTitle && (
            <p className="text-gray-600 mb-2 font-bold">{planTitle}</p>
          )}
          <p className="text-gray-500 mb-2">您已成功報到</p>
          {checkinTime && (
            <p className="text-sm text-gray-400 mb-6">報到時間：{checkinTime}</p>
          )}
          <div className="space-y-3">
            {planId && (
              <button
                onClick={() => navigate(`/exam/run/${planId}`)}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
              >
                開始考試
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors"
            >
              返回考試中心
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">訓練課程報到</h2>
          {planTitle && (
            <p className="text-gray-600 mb-4 font-bold">{planTitle}</p>
          )}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded-r-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleCheckIn}
            disabled={checkingIn || !planId}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xl shadow-blue-200 hover:shadow-blue-300 transition-all duration-300 flex items-center justify-center gap-3 disabled:bg-blue-300 disabled:shadow-none"
          >
            {checkingIn ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>報到中...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>確認報到</span>
              </>
            )}
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回考試中心
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckInPage;
