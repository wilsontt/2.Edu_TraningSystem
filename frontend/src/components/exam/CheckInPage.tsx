import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, Clock, ArrowLeft } from 'lucide-react';
import api from '../../api';
import { parseBackendDateTime } from '../../utils/date';

type CheckInResult = {
  checkin_time?: string;
  plan_title?: string;
  question_count?: number;
  has_exam?: boolean;
};

/** 模組級 Promise：Strict Mode 雙掛載共用同一請求，避免雙寫與第二掛載空手返回。 */
const checkinPromises = new Map<string, Promise<CheckInResult>>();

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
  const [hasExam, setHasExam] = useState(false);
  const autoStartedRef = useRef(false);

  const applyExamMeta = (data: { question_count?: number; has_exam?: boolean }) => {
    const count = typeof data.question_count === 'number' ? data.question_count : 0;
    setHasExam(data.has_exam === true || count > 0);
  };

  const handleCheckIn = useCallback(async (): Promise<boolean> => {
    if (!planId) return false;

    const run = async (): Promise<CheckInResult> => {
      const res = await api.post(`/exam/plan/${planId}/attendance/checkin`);
      return {
        checkin_time: res.data.checkin_time || new Date().toISOString(),
        plan_title: res.data.plan_title,
        question_count: res.data.question_count,
        has_exam: res.data.has_exam,
      };
    };

    let promise = checkinPromises.get(planId);
    if (!promise) {
      promise = run().finally(() => {
        checkinPromises.delete(planId);
      });
      checkinPromises.set(planId, promise);
    }

    try {
      setCheckingIn(true);
      setError(null);
      const result = await promise;
      if (result.plan_title) setPlanTitle(result.plan_title);
      applyExamMeta(result);
      setAttendanceStatus({
        is_checked_in: true,
        checkin_time: result.checkin_time,
      });
      return true;
    } catch (err: unknown) {
      console.error('Failed to check in', err);
      const apiErr = err as { response?: { data?: { detail?: string } } };
      const detail = apiErr.response?.data?.detail || '';
      if (typeof detail === 'string' && detail.includes('已經報到')) {
        try {
          const statusRes = await api.get(`/exam/plan/${planId}/attendance/status`);
          if (statusRes.data.plan_title) setPlanTitle(statusRes.data.plan_title);
          applyExamMeta(statusRes.data);
          setAttendanceStatus({
            is_checked_in: true,
            checkin_time: statusRes.data.checkin_time,
          });
          return true;
        } catch {
          /* fall through */
        }
      }
      setError((typeof detail === 'string' && detail) || '報到失敗，請稍後再試');
      return false;
    } finally {
      setCheckingIn(false);
    }
  }, [planId]);

  useEffect(() => {
    let cancelled = false;
    autoStartedRef.current = false;

    const init = async () => {
      if (!planId) {
        setError('缺少訓練計畫 ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const statusRes = await api.get(`/exam/plan/${planId}/attendance/status`);
        if (cancelled) return;

        const alreadyCheckedIn = !!statusRes.data.is_checked_in;
        if (statusRes.data.plan_title) {
          setPlanTitle(statusRes.data.plan_title);
        }
        applyExamMeta(statusRes.data);
        setAttendanceStatus({
          is_checked_in: alreadyCheckedIn,
          checkin_time: statusRes.data.checkin_time,
        });

        if (!alreadyCheckedIn && !autoStartedRef.current) {
          autoStartedRef.current = true;
          await handleCheckIn();
        }
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('Failed to load attendance status', err);
        const apiErr = err as { response?: { data?: { detail?: string } } };
        setError(apiErr.response?.data?.detail || '無法載入報到狀態');
        setAttendanceStatus({ is_checked_in: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [planId, handleCheckIn]);

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
      ? parseBackendDateTime(attendanceStatus.checkin_time)?.toLocaleString('zh-TW', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">報到成功</h2>
          <p className="text-gray-800 mb-2 font-bold text-lg">
            {planTitle || '訓練計畫'}
          </p>
          <p className="text-gray-500 mb-2">您已成功報到</p>
          {checkinTime && (
            <p className="text-sm text-gray-400 mb-6">報到時間：{checkinTime}</p>
          )}
          {!hasExam && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-6">
              本訓練無需考試，報到完成即可。
            </p>
          )}
          <div className="space-y-3">
            {planId && hasExam && (
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
              {hasExam ? '返回考試中心' : '返回首頁'}
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
            onClick={() => { void handleCheckIn(); }}
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
