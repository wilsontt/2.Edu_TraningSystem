import { useState, useEffect, useMemo } from 'react';
import { X, Eye, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { API_BASE_URL } from '../../api';
import ScoreDetailModal from './ScoreDetailModal';
import type { ExamHistoryItem, ScoreDetail } from './types';
import ScorePrintFlow, { type ScorePrintPlanOption } from '../common/ScorePrintFlow';
import type { PrintModeTriState, SignatureTriState } from './printTriState';
import { parseBackendDateTime } from '../../utils/date';

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
  /** 舊資料無 ExamHistory.id 時，改以 record 詳情 API 顯示成績 */
  const [useRecordDetailFallback, setUseRecordDetailFallback] = useState(false);

  const [selectedPrintPlanIds, setSelectedPrintPlanIds] = useState<Set<number>>(new Set());
  const [printModeTri, setPrintModeTri] = useState<PrintModeTriState>('unset');
  const [signatureTri, setSignatureTri] = useState<SignatureTriState>('unset');
  const [printLoading, setPrintLoading] = useState(false);
  /** 每次開啟 Modal 遞增，供 `ScorePrintFlow` 重設精靈步驟至第 1 步 */
  const [planHistoryWizardResetSignal, setPlanHistoryWizardResetSignal] = useState(0);

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

  useEffect(() => {
    if (isOpen && recordId) {
      fetchDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recordId]);

  useEffect(() => {
    if (isOpen) {
      setPrintModeTri('unset');
      setSignatureTri('unset');
      setPlanHistoryWizardResetSignal((n) => n + 1);
    }
  }, [isOpen]);

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

  const exportModalPrintPdf = async () => {
    if (selectedPrintPlanIds.size === 0) {
      alert('請至少選擇一個訓練計畫');
      return;
    }
    if (printModeTri === 'unset' || signatureTri === 'unset') {
      return;
    }
    if (!detail?.basic_info) {
      alert('無法取得成績資訊');
      return;
    }
    try {
      setPrintLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = API_BASE_URL;
      /**
       * T13（規格約 187–198、208–247 行）：考試歷程成績列印 API。
       * - include_exam_history：list PDF 附表格式歷程（zebra 等由 report.py 處理）
       * - document_context / plan_title：歷程專用抬頭與樣式分岔
       * - 下載檔名：{計畫}_{部門}_{員編}_{姓名}_教育訓練考試歷程成績_{yyyyMMdd_HHmm}.pdf（與 PDF 內列印時間分開）
       */
      const body: Record<string, unknown> = {
        print_mode: printModeTri,
        plan_ids: Array.from(selectedPrintPlanIds),
        include_employee_signature: signatureTri === 'yes',
        include_exam_history: true,
        document_context: 'personal_exam_history',
        plan_title: detail?.basic_info?.plan_title ?? null,
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
      const { plan_title, dept_name, emp_id, name } = detail.basic_info;
      const printTime = format(new Date(), 'yyyyMMdd_HHmm');
      a.download = `${plan_title}_${dept_name}_${emp_id}_${name}_教育訓練考試歷程成績_${printTime}.pdf`;
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
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">考試歷程記錄</h3>
              {detail && <div className="text-sm text-gray-500 mt-1 truncate">{detail.basic_info.plan_title}</div>}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center"
              aria-label="關閉"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
            {loading ? (
              <div className="py-8 flex justify-center text-gray-500">載入中...</div>
            ) : !detail ? (
              <div className="py-8 text-center text-gray-500">無法載入資料</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 -mx-1">
                {/* 手機直向：寬表需 overflow-x-auto，勿用 overflow-hidden（會裁切且無橫向捲動） */}
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        次數
                      </th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        考試時間
                      </th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        分數
                      </th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        狀態
                      </th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        授權者
                      </th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detail.history && detail.history.length > 0 ? (
                      detail.history.map((h: ExamHistoryItem, idx) => (
                        <tr
                          key={idx}
                          className={clsx(idx % 2 === 1 ? 'bg-gray-50' : 'bg-white', 'hover:bg-gray-100/80')}
                        >
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            第 {idx + 1} 次
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {h.submit_time ? parseBackendDateTime(h.submit_time)?.toLocaleString('zh-TW', { hour12: false }) : '-'}
                          </td>
                          <td className={clsx(
                            "px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-bold",
                            h.is_passed ? "text-green-600" : "text-red-600"
                          )}>
                            {h.total_score}
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm">
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
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {h.retake_authorization
                              ? `${h.retake_authorization.authorized_by_name}${h.retake_authorization.authorized_by ? ` (${h.retake_authorization.authorized_by})` : ''}`
                              : '—'}
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              type="button"
                              onClick={() => {
                                if (typeof h.id === 'number') {
                                  setUseRecordDetailFallback(false);
                                  setSelectedHistoryId(h.id);
                                } else {
                                  setUseRecordDetailFallback(true);
                                  setSelectedHistoryId(null);
                                }
                              }}
                              className="text-blue-600 hover:text-blue-900 inline-flex items-center justify-end gap-1 ml-auto min-h-11"
                            >
                              <Eye className="w-4 h-4 shrink-0" />
                              查看詳情
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 sm:px-6 py-4 text-center text-sm text-gray-500">
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
              <h4 className="text-sm font-black text-gray-800">考試歷程成績列印</h4>
              <ScorePrintFlow
                variant="planHistoryFooter"
                planOptions={printPlanOptions}
                selectedPlanIds={selectedPrintPlanIds}
                onSelectedPlanIdsChange={setSelectedPrintPlanIds}
                printMode="list"
                onPrintModeChange={() => {}}
                includeEmployeeSignature={false}
                onIncludeEmployeeSignatureChange={() => {}}
                includeExamHistory={false}
                onIncludeExamHistoryChange={() => {}}
                onLoadPreview={() => {}}
                onPrintPdf={exportModalPrintPdf}
                printLoading={printLoading}
                selectedEmployeeCount={1}
                requireEmployeeSelectionForPrint={false}
                planHistoryTri={{
                  printMode: printModeTri,
                  onPrintModeChange: setPrintModeTri,
                  signature: signatureTri,
                  onSignatureChange: setSignatureTri,
                }}
                planHistoryWizardResetSignal={planHistoryWizardResetSignal}
              />
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

      {/* 成績詳情 Modal (顯示特定歷史紀錄；無 history id 時改顯示 record 詳情) */}
      {(selectedHistoryId !== null || useRecordDetailFallback) && (
        <ScoreDetailModal
          recordId={recordId}
          historyId={useRecordDetailFallback ? undefined : selectedHistoryId ?? undefined}
          isOpen={selectedHistoryId !== null || useRecordDetailFallback}
          onClose={() => {
            setSelectedHistoryId(null);
            setUseRecordDetailFallback(false);
          }}
          printGate="requireSignatureCheckbox"
        />
      )}
    </>
  );
}
