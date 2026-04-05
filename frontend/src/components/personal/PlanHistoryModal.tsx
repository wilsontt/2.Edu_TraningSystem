import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Eye, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { API_BASE_URL } from '../../api';
import ScoreDetailModal from './ScoreDetailModal';
import type { ExamHistoryItem, ScoreDetail } from './types';
import ScorePrintFlow, { type ScorePrintPlanOption } from '../common/ScorePrintFlow';

interface PlanHistoryModalProps {
  recordId: number;
  isOpen: boolean;
  onClose: () => void;
  /** Admin 檢視他人成績時傳入，列印 API 會帶此 emp_id */
  targetEmpId?: string;
}

export default function PlanHistoryModal({ recordId, isOpen, onClose, targetEmpId }: PlanHistoryModalProps) {
  const [detail, setDetail] = useState<ScoreDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

  const [selectedPrintPlanIds, setSelectedPrintPlanIds] = useState<Set<number>>(new Set());
  const [printMode, setPrintMode] = useState<'list' | 'individual'>('list');
  const [includeEmployeeSignature, setIncludeEmployeeSignature] = useState(false);
  const [includeExamHistory, setIncludeExamHistory] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [printPreview, setPrintPreview] = useState<
    Array<{
      emp_id: string;
      name: string;
      dept_name: string;
      plan_id: number;
      plan_title: string;
      total_score: number;
      is_passed: boolean;
      submit_time: string | null;
    }>
  >([]);

  const printPlanOptions: ScorePrintPlanOption[] = useMemo(() => {
    if (!detail?.basic_info) return [];
    return [
      {
        plan_id: detail.basic_info.plan_id,
        plan_title: detail.basic_info.plan_title,
        training_date: detail.basic_info.training_date,
      },
    ];
  }, [detail]);

  useEffect(() => {
    if (detail?.basic_info?.plan_id) {
      setSelectedPrintPlanIds(new Set([detail.basic_info.plan_id]));
    }
  }, [detail?.basic_info?.plan_id]);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = API_BASE_URL;
      const response = await fetch(`${baseURL}/exam/record/${recordId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = (await response.json()) as ScoreDetail;
        setDetail(data);
      } else {
        console.error('Failed to fetch plan history');
      }
    } catch (error) {
      console.error('Failed to fetch plan history', error);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    if (isOpen && recordId) {
      void fetchDetail();
    }
  }, [isOpen, recordId, fetchDetail]);

  const loadModalPrintPreview = async () => {
    if (selectedPrintPlanIds.size === 0) {
      alert('請至少選擇一個訓練計畫');
      return;
    }
    try {
      setPrintLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = API_BASE_URL;
      const body: Record<string, unknown> = {
        print_mode: printMode,
        plan_ids: Array.from(selectedPrintPlanIds),
        include_employee_signature: includeEmployeeSignature,
        include_exam_history: includeExamHistory,
      };
      if (targetEmpId) body.emp_id = targetEmpId;
      const res = await fetch(`${baseURL}/exam/personal/print/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('preview');
      const data = await res.json();
      setPrintPreview(data.items || []);
    } catch (e) {
      console.error(e);
      alert('載入列印預覽失敗');
    } finally {
      setPrintLoading(false);
    }
  };

  const exportModalPrintPdf = async () => {
    if (selectedPrintPlanIds.size === 0) {
      alert('請至少選擇一個訓練計畫');
      return;
    }
    try {
      setPrintLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = API_BASE_URL;
      const body: Record<string, unknown> = {
        print_mode: printMode,
        plan_ids: Array.from(selectedPrintPlanIds),
        include_employee_signature: includeEmployeeSignature,
        include_exam_history: includeExamHistory,
      };
      if (targetEmpId) body.emp_id = targetEmpId;
      const response = await fetch(`${baseURL}/exam/personal/print/pdf`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('pdf');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-score-print-${format(new Date(), 'yyyyMMdd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert('成績列印失敗');
    } finally {
      setPrintLoading(false);
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
                    {detail.history && detail.history.length > 0 ? (
                      detail.history.map((h: ExamHistoryItem, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            第 {idx + 1} 次
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {h.submit_time ? new Date(h.submit_time).toLocaleString('zh-TW', { hour12: false }) : '-'}
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
                            {typeof h.id === 'number' ? (
                                <button
                                type="button"
                                onClick={() => {
                                  const hid = h.id;
                                  if (typeof hid === 'number') setSelectedHistoryId(hid);
                                }}
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

          {detail && printPlanOptions.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100 space-y-3 bg-gray-50/80">
              <h4 className="text-sm font-black text-gray-800">成績列印（與成績中心相同流程）</h4>
              <ScorePrintFlow
                planOptions={printPlanOptions}
                selectedPlanIds={selectedPrintPlanIds}
                onSelectedPlanIdsChange={setSelectedPrintPlanIds}
                printMode={printMode}
                onPrintModeChange={setPrintMode}
                includeEmployeeSignature={includeEmployeeSignature}
                onIncludeEmployeeSignatureChange={setIncludeEmployeeSignature}
                includeExamHistory={includeExamHistory}
                onIncludeExamHistoryChange={setIncludeExamHistory}
                onLoadPreview={loadModalPrintPreview}
                onPrintPdf={exportModalPrintPdf}
                printLoading={printLoading}
                selectedEmployeeCount={1}
                requireEmployeeSelectionForPrint={false}
              />
              {printPreview.length > 0 && (
                <div className="overflow-x-auto border border-gray-200 rounded-lg text-xs bg-white">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-1 text-left">序號</th>
                        <th className="px-2 py-1 text-left">員編</th>
                        <th className="px-2 py-1 text-left">姓名</th>
                        <th className="px-2 py-1 text-left">部門</th>
                        <th className="px-2 py-1 text-left">計畫</th>
                        <th className="px-2 py-1 text-right">分數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printPreview.map((row, idx) => (
                        <tr key={`${row.plan_id}-${idx}`} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                          <td className="px-2 py-1">{idx + 1}</td>
                          <td className="px-2 py-1">{row.emp_id}</td>
                          <td className="px-2 py-1">{row.name}</td>
                          <td className="px-2 py-1">{row.dept_name}</td>
                          <td className="px-2 py-1">{row.plan_title}</td>
                          <td className="px-2 py-1 text-right font-bold">{row.total_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

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
