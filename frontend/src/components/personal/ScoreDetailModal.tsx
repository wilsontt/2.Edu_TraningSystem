import { useState, useEffect, lazy, Suspense } from 'react';
import { X, CheckCircle, XCircle, Clock, User, FileText, Award, Printer } from 'lucide-react';
import clsx from 'clsx';
import type { ScoreDetail } from './types';

// 動態導入以避免循環依賴
const ScoreCardPreview = lazy(() => import('./ScoreCardPreview'));

interface ScoreDetailModalProps {
  recordId: number;
  historyId?: number; // 新增：支援顯示特定歷史紀錄
  isOpen: boolean;
  onClose: () => void;
}

export default function ScoreDetailModal({ recordId, historyId, isOpen, onClose }: ScoreDetailModalProps) {
  const [detail, setDetail] = useState<ScoreDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (isOpen && (recordId || historyId)) {
      fetchDetail();
    }
  }, [isOpen, recordId, historyId]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = `http://${window.location.hostname}:8000/api`;
      
      let url = `${baseURL}/exam/record/${recordId}/detail`;
      if (historyId) {
        url = `${baseURL}/exam/history/${historyId}`;
      }

      const response = await fetch(
        url,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setDetail(data);
      } else {
        console.error('Failed to fetch score detail');
      }
    } catch (error) {
      console.error('Failed to fetch score detail', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-';
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (minutes < 60) return `${minutes}分${secs}秒`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小時${mins}分`;
  };

  const parseOptions = (optionsStr: string | null): Record<string, string> | null => {
    if (!optionsStr) return null;
    try {
      return JSON.parse(optionsStr);
    } catch {
      return null;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">成績詳情</h3>
            <div className="flex items-center gap-2">
              {detail && (
                <button
                  onClick={() => setShowPreview(true)}
                  className="flex items-center px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Printer className="h-4 w-4 mr-1" />
                  預覽成績單
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {loading ? (
              <div className="py-8 flex justify-center text-gray-500">載入中...</div>
            ) : !detail ? (
              <div className="py-8 text-center text-gray-500">無法載入資料</div>
            ) : (
              <>
                {/* 基本資訊 */}
                <div className="bg-gray-50 rounded-lg p-6 mb-6">
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-blue-500" />
                    基本資訊
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-500 mb-1">考生姓名</div>
                      <div className="font-medium text-gray-900 flex items-center">
                        <User className="h-4 w-4 mr-1" />
                        {detail.basic_info.name}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">員工編號</div>
                      <div className="font-medium text-gray-900">{detail.basic_info.emp_id}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">部門</div>
                      <div className="font-medium text-gray-900">{detail.basic_info.dept_name}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">訓練計畫</div>
                      <div className="font-medium text-gray-900">{detail.basic_info.plan_title}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">考試分數</div>
                      <div className={clsx(
                        "text-2xl font-bold",
                        detail.basic_info.is_passed ? "text-green-600" : "text-red-600"
                      )}>
                        {detail.basic_info.total_score} / {detail.basic_info.passing_score}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">通過狀態</div>
                      <div>
                        {detail.basic_info.is_passed ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            通過
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                            <XCircle className="h-4 w-4 mr-1" />
                            未通過
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">作答時間</div>
                      <div className="font-medium text-gray-900 flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        {formatDuration(detail.basic_info.duration)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">提交時間</div>
                      <div className="font-medium text-gray-900">
                        {detail.basic_info.submit_time ? new Date(detail.basic_info.submit_time).toLocaleString() : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">重考次數</div>
                      <div className="font-medium text-gray-900">{detail.basic_info.attempts}</div>
                    </div>
                  </div>
                </div>

                {/* 答題詳情 */}
                <div>
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <Award className="h-5 w-5 mr-2 text-blue-500" />
                    答題詳情
                  </h4>
                  <div className="space-y-4">
                    {detail.question_details.map((q, idx) => {
                      const options = parseOptions(q.options);
                      const isWrong = !q.is_correct;
                      
                      return (
                        <div
                          key={q.question_id}
                          className={clsx(
                            "border-2 rounded-lg p-4 transition-all",
                            isWrong
                              ? "border-red-300 bg-red-50"
                              : "border-green-300 bg-green-50"
                          )}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-700">第 {q.question_number} 題</span>
                              <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
                                {q.question_type}
                              </span>
                              {q.is_correct ? (
                                <CheckCircle className="h-5 w-5 text-green-600" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-600" />
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-500">配分</div>
                              <div className={clsx(
                                "font-bold",
                                q.is_correct ? "text-green-600" : "text-red-600"
                              )}>
                                {q.earned_points} / {q.points}
                              </div>
                            </div>
                          </div>

                          <div className="mb-3">
                            <div className="font-medium text-gray-900 mb-2">{q.content}</div>
                            {options && (
                              <div className="text-sm text-gray-600 space-y-1 ml-4">
                                {Object.entries(options).map(([key, value]) => (
                                  <div key={key}>
                                    {key}: {value}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                            <div>
                              <div className="text-sm text-gray-500 mb-1">您的答案</div>
                              <div className={clsx(
                                "font-medium",
                                q.is_correct ? "text-green-700" : "text-red-700"
                              )}>
                                {q.user_answer || '未作答'}
                                {options && q.user_answer && options[q.user_answer] && (
                                  <span className="ml-2 text-gray-600 text-sm">
                                    ({options[q.user_answer]})
                                  </span>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500 mb-1">正確答案</div>
                              <div className="font-medium text-green-700">
                                {q.correct_answer}
                                {options && q.correct_answer && options[q.correct_answer] && (
                                  <span className="ml-2 text-gray-600 text-sm">
                                    ({options[q.correct_answer]})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
            >
              關閉
            </button>
          </div>
        </div>
      </div>

      {/* 成績單預覽 Modal */}
      {showPreview && detail && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4">載入中...</div>
        </div>}>
          <ScoreCardPreview
            detail={detail}
            isOpen={showPreview}
            onClose={() => setShowPreview(false)}
          />
        </Suspense>
      )}
    </>
  );
}
