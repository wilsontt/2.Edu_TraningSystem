/**
 * 成績中心批次列印共用 hook。
 * 封裝篩選條件狀態、預覽資料、人員勾選與三種輸出動作（PDF/ZIP 下載、individual 列印視窗）。
 * 設計為可重用：BatchPrintPage（Wave 2）與 ReportDashboard 內層「成績列印」（Wave 3）皆可共用此 hook。
 */
import { useCallback, useState } from 'react';
import api from '../api';
import {
  buildBatchPrintHtml,
  printHtmlInIframe,
  type MemberPrintItem,
} from '../components/personal/scoreCardPrintHtml';

export type PlanStatus = 'active' | 'expired' | 'archived';
export type ScoreDataMode = 'last_attempt' | 'exam_history';
export type PrintMode = 'list' | 'individual';

export interface DeptOption {
  dept_id: number;
  dept_name: string;
}

export interface PlanOption {
  plan_id: number;
  plan_title: string;
  training_date: string | null;
}

export interface BatchPrintPreviewItem {
  emp_id: string;
  name: string;
  dept_name: string;
  plan_id: number;
  plan_title: string;
  total_score: number;
  is_passed: boolean;
  submit_time: string | null;
}

/** individual 模式僅支援「最後一次考試成績」，超過此人數需二次確認 */
export const BATCH_PRINT_INDIVIDUAL_WARN_THRESHOLD = 20;

/** 從 Content-Disposition 解析 RFC 5987 編碼檔名（filename*=UTF-8''...） */
export function parseFilenameFromContentDisposition(
  contentDisposition: string | null | undefined,
  fallback: string,
): string {
  if (!contentDisposition) return fallback;
  const match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return fallback;
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function readDetailFromData(data: unknown): string | null {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return null;
}

/** 後端錯誤回應的 detail 文字（FastAPI HTTPException 慣例） */
async function extractErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response
  ) {
    const data = (error.response as { data?: unknown }).data;
    // responseType:'blob' 的請求即使是錯誤回應，data 也會是 Blob，需先轉文字再解析 JSON
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        const parsed = JSON.parse(text) as unknown;
        const detail = readDetailFromData(parsed);
        if (detail) return detail;
      } catch {
        /* 非 JSON 內容，忽略並 fallback */
      }
    } else {
      const detail = readDetailFromData(data);
      if (detail) return detail;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export interface UseBatchPrintResult {
  // 篩選條件 state
  selectedPlanIds: Set<number>;
  setSelectedPlanIds: (ids: Set<number>) => void;
  selectedDeptIds: Set<number>;
  setSelectedDeptIds: (ids: Set<number>) => void;
  planStatus: PlanStatus;
  setPlanStatus: (status: PlanStatus) => void;
  scoreDataMode: ScoreDataMode;
  setScoreDataMode: (mode: ScoreDataMode) => void;
  printMode: PrintMode;
  setPrintMode: (mode: PrintMode) => void;
  includeEmployeeSignature: boolean;
  setIncludeEmployeeSignature: (v: boolean) => void;

  // 人員勾選（去重 emp_id）
  selectedEmpIds: Set<string>;
  setSelectedEmpIds: (ids: Set<string>) => void;
  toggleEmpId: (empId: string) => void;

  // 預覽資料
  previewItems: BatchPrintPreviewItem[];
  previewTotal: number;

  // 選項資料
  deptOptions: DeptOption[];
  planOptions: PlanOption[];

  // loading / error
  loading: boolean;
  error: string;
  setError: (msg: string) => void;

  // actions
  fetchDeptOptions: () => Promise<DeptOption[]>;
  fetchPlanOptions: () => Promise<PlanOption[]>;
  loadPreview: () => Promise<void>;
  exportPdf: () => Promise<void>;
  exportIndividualHtml: () => Promise<void>;
}

/**
 * 成績中心批次列印共用 hook。
 * @returns 篩選條件狀態、預覽/選項資料與三種輸出動作
 */
export function useBatchPrint(): UseBatchPrintResult {
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<number>>(new Set());
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<number>>(new Set());
  const [planStatus, setPlanStatus] = useState<PlanStatus>('active');
  const [scoreDataMode, setScoreDataMode] = useState<ScoreDataMode>('last_attempt');
  const [printMode, setPrintMode] = useState<PrintMode>('list');
  const [includeEmployeeSignature, setIncludeEmployeeSignature] = useState(false);

  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());

  const [previewItems, setPreviewItems] = useState<BatchPrintPreviewItem[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);

  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([]);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleEmpId = useCallback((empId: string) => {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  }, []);

  const fetchDeptOptions = useCallback(async (): Promise<DeptOption[]> => {
    const res = await api.get<DeptOption[]>('/admin/reports/batch-print/dept-options');
    setDeptOptions(res.data);
    return res.data;
  }, []);

  const fetchPlanOptions = useCallback(async (): Promise<PlanOption[]> => {
    const res = await api.get<PlanOption[]>('/admin/reports/print/plan-options');
    setPlanOptions(res.data);
    return res.data;
  }, []);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ total: number; items: BatchPrintPreviewItem[] }>(
        '/admin/reports/batch-print/preview',
        {
          plan_ids: Array.from(selectedPlanIds),
          dept_ids: Array.from(selectedDeptIds),
          emp_ids: [],
          plan_status: planStatus,
          score_data_mode: scoreDataMode,
        },
      );
      setPreviewItems(res.data.items);
      setPreviewTotal(res.data.total);
    } catch (e) {
      setPreviewItems([]);
      setPreviewTotal(0);
      setError(await extractErrorMessage(e, '載入預覽失敗'));
    } finally {
      setLoading(false);
    }
  }, [selectedPlanIds, selectedDeptIds, planStatus, scoreDataMode]);

  const exportPdf = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post(
        '/admin/reports/batch-print/pdf',
        {
          plan_ids: Array.from(selectedPlanIds),
          dept_ids: Array.from(selectedDeptIds),
          emp_ids: Array.from(selectedEmpIds),
          plan_status: planStatus,
          score_data_mode: scoreDataMode,
          print_mode: printMode,
          include_employee_signature: includeEmployeeSignature,
        },
        { responseType: 'blob' },
      );
      const contentType = (response.headers['content-type'] as string | undefined) ?? '';
      const extension = contentType.includes('zip') ? 'zip' : 'pdf';
      const fallbackName = `批次列印_${Date.now()}.${extension}`;
      const filename = parseFilenameFromContentDisposition(
        response.headers['content-disposition'] as string | undefined,
        fallbackName,
      );
      triggerBlobDownload(response.data as Blob, filename);
    } catch (e) {
      setError(await extractErrorMessage(e, '產生 PDF 失敗'));
    } finally {
      setLoading(false);
    }
  }, [selectedPlanIds, selectedDeptIds, selectedEmpIds, planStatus, scoreDataMode, printMode, includeEmployeeSignature]);

  const exportIndividualHtml = useCallback(async () => {
    if (printMode === 'individual' && scoreDataMode === 'exam_history') {
      setError('考卷成績單（individual）僅支援「最後一次考試成績」，請改選最後一次成績或切換為成績清單');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post<MemberPrintItem[]>(
        '/admin/reports/batch-print/individual-data',
        {
          plan_ids: Array.from(selectedPlanIds),
          emp_ids: Array.from(selectedEmpIds),
          score_data_mode: scoreDataMode,
        },
      );
      const html = buildBatchPrintHtml(res.data, includeEmployeeSignature);
      printHtmlInIframe(html);
    } catch (e) {
      setError(await extractErrorMessage(e, '載入列印資料失敗'));
    } finally {
      setLoading(false);
    }
  }, [selectedPlanIds, selectedEmpIds, scoreDataMode, includeEmployeeSignature, printMode]);

  return {
    selectedPlanIds,
    setSelectedPlanIds,
    selectedDeptIds,
    setSelectedDeptIds,
    planStatus,
    setPlanStatus,
    scoreDataMode,
    setScoreDataMode,
    printMode,
    setPrintMode,
    includeEmployeeSignature,
    setIncludeEmployeeSignature,
    selectedEmpIds,
    setSelectedEmpIds,
    toggleEmpId,
    previewItems,
    previewTotal,
    deptOptions,
    planOptions,
    loading,
    error,
    setError,
    fetchDeptOptions,
    fetchPlanOptions,
    loadPreview,
    exportPdf,
    exportIndividualHtml,
  };
}
