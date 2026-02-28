import { useState, useEffect } from 'react';
import { X, Eye, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { API_BASE_URL } from '../../api';
import ScoreDetailModal from './ScoreDetailModal';
import type { ScoreDetail } from './types';

interface PlanHistoryModalProps {
  recordId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function PlanHistoryModal({ recordId, isOpen, onClose }: PlanHistoryModalProps) {
  const [detail, setDetail] = useState<ScoreDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && recordId) {
      fetchDetail();
    }
  }, [isOpen, recordId]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = API_BASE_URL;
      const response = await fetch(
        `${baseURL}/exam/record/${recordId}/detail`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setDetail(data);
      } else {
        console.error('Failed to fetch plan history');
      }
    } catch (error) {
      console.error('Failed to fetch plan history', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">考試歷程記錄</h3>
              {detail && <div className="text-sm text-gray-500 mt-1">{detail.basic_info.plan_title}</div>}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {loading ? (
              <div className="py-8 flex justify-center text-gray-500">載入中...</div>
            ) : !detail ? (
              <div className="py-8 text-center text-gray-500">無法載入資料</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        次數
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        考試時間
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        分數
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        狀態
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {/* 為了顯示完整歷程，我們需要結合 history 陣列與最後一次的 record 資訊嗎？
                        不，後端 API 回傳的 history 陣列已經包含了所有歷程（包含最後一次）。
                        但要注意 history item 沒有 id (history_id)，我們需要確認後端是否有回傳 id。
                        
                        檢查後端 API get_exam_record_detail:
                        history_list.append({
                            "submit_time": h.submit_time...,
                            "total_score": h.total_score,
                            "is_passed": h.is_passed
                        })
                        
                        糟糕，後端沒有回傳 history id！這樣前端無法呼叫 /exam/history/{id}。
                        我需要先去修後端 API。
                    */}
                    {detail.history && detail.history.length > 0 ? (
                      detail.history.map((h: any, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            第 {idx + 1} 次
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {h.submit_time ? new Date(h.submit_time).toLocaleString('zh-TW') : '-'}
                          </td>
                          <td className={clsx(
                            "px-6 py-4 whitespace-nowrap text-sm font-bold",
                            h.is_passed ? "text-green-600" : "text-red-600"
                          )}>
                            {h.total_score}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {h.is_passed ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle className="w-3 h-3 mr-1" /> 通過
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                <XCircle className="w-3 h-3 mr-1" /> 未通過
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {h.id ? (
                                <button
                                onClick={() => setSelectedHistoryId(h.id)}
                                className="text-blue-600 hover:text-blue-900 flex items-center justify-end gap-1 ml-auto"
                                >
                                <Eye className="w-4 h-4" />
                                查看詳情
                                </button>
                            ) : (
                                <span className="text-gray-400 text-xs">無詳情</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                          無歷史紀錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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

      {/* 成績詳情 Modal (顯示特定歷史紀錄) */}
      {selectedHistoryId && (
        <ScoreDetailModal
          recordId={recordId} // 這裡傳入 recordId 主要是為了讓 Modal 內部邏輯運作（雖然我們主要用 historyId）
          historyId={selectedHistoryId}
          isOpen={!!selectedHistoryId}
          onClose={() => setSelectedHistoryId(null)}
        />
      )}
    </>
  );
}
