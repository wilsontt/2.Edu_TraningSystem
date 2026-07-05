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
  type AnswerDetailLayout,
} from '../components/personal/scoreCardPrintHtml';

export type PlanStatus = 'active' | 'expired' | 'archived';
export type ScoreDataMode = 'last_attempt' | 'exam_history';
export type PrintMode = 'list' | 'individual';
/** 最後一次成績：成績單預覽樣式（HTML）或成績清單表格（PDF/ZIP） */
export type OutputStyle = 'score_card' | 'summary_list';

export interface DeptOption {
  dept_id: number;
  dept_name: string;
}

export interface PlanOption {
  plan_id: number;
  plan_title: string;
  training_date: string | null;
  year?: string | null;
  dept_name?: string | null;
  display_index?: number;
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
  outputStyle: OutputStyle;
  setOutputStyle: (style: OutputStyle) => void;
  includeEmployeeSignature: boolean;
  setIncludeEmployeeSignature: (v: boolean) => void;

  selectedEmpIds: Set<string>;
  setSelectedEmpIds: (ids: Set<string>) => void;
  toggleEmpId: (empId: string) => void;

  previewItems: BatchPrintPreviewItem[];
  previewTotal: number;

  deptOptions: DeptOption[];
  planOptions: PlanOption[];

  loading: boolean;
  error: string;
  setError: (msg: string) => void;

  fetchDeptOptions: () => Promise<DeptOption[]>;
  fetchPlanOptions: (status?: PlanStatus) => Promise<PlanOption[]>;
  loadPreview: () => Promise<void>;
  exportPdf: () => Promise<void>;
  exportIndividualHtml: (answerDetailLayout?: AnswerDetailLayout) => Promise<void>;
  /** 依 outputStyle / printMode 自動選擇 PDF 或成績單 HTML 列印 */
  exportByOutputStyle: () => Promise<void>;
}

/**
 * 成績中心批次列印共用 hook。
 */
export function useBatchPrint(): UseBatchPrintResult {
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<number>>(new Set());
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<number>>(new Set());
  const [planStatus, setPlanStatus] = useState<PlanStatus>('active');
  const [scoreDataMode, setScoreDataMode] = useState<ScoreDataMode>('last_attempt');
  const [printMode, setPrintMode] = useState<PrintMode>('list');
  const [outputStyle, setOutputStyle] = useState<OutputStyle>('summary_list');
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

  const fetchPlanOptions = useCallback(async (status?: PlanStatus): Promise<PlanOption[]> => {
    const effectiveStatus = status ?? planStatus;
    const res = await api.get<PlanOption[]>('/admin/reports/batch-print/plan-options', {
      params: { plan_status: effectiveStatus },
    });
    setPlanOptions(res.data);
    return res.data;
  }, [planStatus]);

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
          output_style: outputStyle,
        },
      );
      setPreviewItems(res.data.items);
      setPreviewTotal(res.data.total);
      setSelectedEmpIds(new Set(res.data.items.map((i) => i.emp_id)));
    } catch (e) {
      setPreviewItems([]);
      setPreviewTotal(0);
      setError(await extractErrorMessage(e, '載入預覽失敗'));
    } finally {
      setLoading(false);
    }
  }, [selectedPlanIds, selectedDeptIds, planStatus, scoreDataMode, outputStyle]);

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
          print_mode: 'list',
          output_style: 'summary_list',
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
  }, [selectedPlanIds, selectedDeptIds, selectedEmpIds, planStatus, scoreDataMode, includeEmployeeSignature]);

  const exportIndividualHtml = useCallback(async (answerDetailLayout: AnswerDetailLayout = 'exam_card') => {
    if (scoreDataMode === 'exam_history') {
      setError('考卷成績單僅支援「最後一次考試成績」，請改選最後一次成績');
      return;
    }
    if (selectedPlanIds.size === 0) {
      setError('請至少選擇一項訓練計畫');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const selectedPreviewRows = previewItems.filter((item) => selectedEmpIds.has(item.emp_id));
      const planIdsForExport =
        selectedPreviewRows.length > 0
          ? [...new Set(selectedPreviewRows.map((item) => item.plan_id))]
          : Array.from(selectedPlanIds);

      const res = await api.post<MemberPrintItem[]>(
        '/admin/reports/batch-print/individual-data',
        {
          plan_ids: planIdsForExport,
          emp_ids: Array.from(selectedEmpIds),
          score_data_mode: 'last_attempt',
        },
      );
      const html = buildBatchPrintHtml(res.data, includeEmployeeSignature, {
        answerDetailLayout,
      });
      printHtmlInIframe(html);
    } catch (e) {
      setError(await extractErrorMessage(e, '載入列印資料失敗'));
    } finally {
      setLoading(false);
    }
  }, [selectedPlanIds, selectedEmpIds, previewItems, scoreDataMode, includeEmployeeSignature]);

  const exportByOutputStyle = useCallback(async () => {
    if (scoreDataMode !== 'last_attempt') {
      await exportPdf();
      return;
    }
    if (outputStyle === 'score_card') {
      await exportIndividualHtml('preview_table');
      return;
    }
    if (printMode === 'individual') {
      await exportIndividualHtml('exam_card');
      return;
    }
    await exportPdf();
  }, [scoreDataMode, outputStyle, printMode, exportIndividualHtml, exportPdf]);

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
    outputStyle,
    setOutputStyle,
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
    exportByOutputStyle,
  };
}
