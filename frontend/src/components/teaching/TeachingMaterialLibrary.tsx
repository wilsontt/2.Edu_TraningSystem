import { useState, useEffect, useCallback, useRef } from 'react';
import { Library, Search, Download, Trash2, Loader2, CheckSquare, Square, PackageOpen, Upload, FileText, AlertCircle, X, PenTool } from 'lucide-react';
import axios, { AxiosError, type AxiosProgressEvent } from 'axios';
import { PaginatedDataTable, type DataTableColumn } from '@shared-ui/data-table';
import api from '../../api';
import NasLoginModal from './NasLoginModal';
import FileTransferModal from './FileTransferModal';
import { saveBlob, idleTransfer, type TransferState, mergeSelectedFiles, MATERIAL_ACCEPT, IN_FLIGHT_PROGRESS_CAP } from './transfer';

interface MaterialType {
    id: number;
    name: string;
    slug: string;
    is_active?: boolean;
}

interface Material {
    id: number;
    plan_id: number | null;
    title: string;
    material_type_id: number;
    description: string | null;
    original_filename: string;
    file_format: string;
    file_size_bytes: number;
    year: string;
    uploaded_at: string;
}

interface UploadResult {
    succeeded: { id: number; original_filename: string }[];
    failed: { original_filename: string; reason: string }[];
}

interface ConflictItem {
    filename: string;
    existing: { id: number; title: string; original_filename: string } | null;
}

type ConflictPolicy = 'deactivate_and_new' | 'replace_in_place';

interface MaterialList {
    items: Material[];
    total: number;
    page: number;
    size: number;
    total_pages: number;
}

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

interface TeachingMaterialLibraryProps {
    /** 提供時，於標頭顯示「返回考卷工坊」按鈕（教材庫掛載於考卷工坊頁籤內時使用）。 */
    onBack?: () => void;
}

const TeachingMaterialLibrary = ({ onBack }: TeachingMaterialLibraryProps = {}) => {
    const [items, setItems] = useState<Material[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const [types, setTypes] = useState<MaterialType[]>([]);

    const [keyword, setKeyword] = useState('');
    const [materialTypeId, setMaterialTypeId] = useState('');
    const [fileFormat, setFileFormat] = useState('');
    const [loading, setLoading] = useState(false);

    // 跨頁勾選：id -> 顯示資訊
    const [selected, setSelected] = useState<Map<number, { original_filename: string; title: string }>>(new Map());

    const [nasOpen, setNasOpen] = useState(false);
    const [nasPurpose, setNasPurpose] = useState('');
    const [transfer, setTransfer] = useState<TransferState>(idleTransfer);
    const abortRef = useRef<AbortController | null>(null);
    const pendingActionRef = useRef<((token: string) => void) | null>(null);
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

    // 通用上傳（不綁定訓練計畫）
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploadTypeId, setUploadTypeId] = useState('');
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadDesc, setUploadDesc] = useState('');
    const [uploadTags, setUploadTags] = useState('');
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploadFileKey, setUploadFileKey] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadResultMsg, setUploadResultMsg] = useState<string | null>(null);
    const [uploadBusy, setUploadBusy] = useState(false);
    const [uploadConflicts, setUploadConflicts] = useState<ConflictItem[]>([]);
    const [uploadConflictOpen, setUploadConflictOpen] = useState(false);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { page, size };
            if (keyword) params.keyword = keyword;
            if (materialTypeId) params.material_type_id = materialTypeId;
            if (fileFormat) params.file_format = fileFormat;
            const res = await api.get<MaterialList>('/admin/teaching-materials/', { params });
            setItems(res.data.items);
            setTotal(res.data.total);
        } catch (err) {
            console.error('載入教材庫失敗', err);
        } finally {
            setLoading(false);
        }
    }, [page, size, keyword, materialTypeId, fileFormat]);

    useEffect(() => {
        api.get<MaterialType[]>('/admin/teaching-materials/material-types').then(r => setTypes(r.data)).catch(() => {});
    }, []);
    useEffect(() => { fetchList(); }, [fetchList]);

    const toggle = (m: Material) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(m.id)) next.delete(m.id);
            else next.set(m.id, { original_filename: m.original_filename, title: m.title });
            return next;
        });
    };

    const allOnPageSelected = items.length > 0 && items.every(m => selected.has(m.id));
    const toggleSelectAllOnPage = () => {
        setSelected(prev => {
            const next = new Map(prev);
            if (allOnPageSelected) {
                items.forEach(m => next.delete(m.id));
            } else {
                items.forEach(m => next.set(m.id, { original_filename: m.original_filename, title: m.title }));
            }
            return next;
        });
    };

    const requireNas = (purpose: string, action: (token: string) => void) => {
        pendingActionRef.current = action;
        setNasPurpose(purpose);
        setNasOpen(true);
    };
    const onNasSuccess = (token: string) => {
        setNasOpen(false);
        const a = pendingActionRef.current;
        pendingActionRef.current = null;
        a?.(token);
    };

    const closeTransfer = () => setTransfer(idleTransfer);
    const cancelTransfer = () => { abortRef.current?.abort(); setTransfer(idleTransfer); };
    const onProgress = (e: AxiosProgressEvent) =>
        setTransfer(s => (s.open ? { ...s, progress: e.total ? Math.min(IN_FLIGHT_PROGRESS_CAP, Math.round((e.loaded / e.total) * 100)) : s.progress } : s));
    const isCancel = (err: unknown) => axios.isCancel(err) || (err as { code?: string })?.code === 'ERR_CANCELED';

    const doSingleDownload = async (token: string, m: Material) => {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setTransfer({ open: true, title: `下載 ${m.original_filename}`, progress: 0, status: 'transferring', error: null });
        try {
            const res = await api.get(`/admin/teaching-materials/${m.id}/download`, {
                params: { nas_session_token: token }, responseType: 'blob', signal: ctrl.signal, onDownloadProgress: onProgress,
            });
            saveBlob(res.data as Blob, m.original_filename);
            setTransfer(s => ({ ...s, progress: 100, status: 'success' }));
        } catch (err) {
            if (isCancel(err)) return;
            const e2 = err as AxiosError;
            setTransfer(s => ({ ...s, status: 'error', error: e2.response?.status === 503 ? 'NAS 無法連線' : '下載失敗' }));
        } finally { abortRef.current = null; }
    };

    const doBatchDownload = async (token: string) => {
        const ids = Array.from(selected.keys());
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setTransfer({ open: true, title: `批次下載 ${ids.length} 份`, progress: 0, status: 'transferring', error: null });
        try {
            const res = await api.post('/admin/teaching-materials/batch-download',
                { ids, nas_session_token: token },
                { responseType: 'blob', signal: ctrl.signal, onDownloadProgress: onProgress },
            );
            const ts = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
            saveBlob(res.data as Blob, `teaching_materials_${ts}.zip`);
            setTransfer(s => ({ ...s, progress: 100, status: 'success' }));
            setSelected(new Map());
        } catch (err) {
            if (isCancel(err)) return;
            const e2 = err as AxiosError;
            setTransfer(s => ({ ...s, status: 'error', error: e2.response?.status === 503 ? 'NAS 無法連線' : '批次下載失敗' }));
        } finally { abortRef.current = null; }
    };

    const doUpload = async (token: string, onConflict?: ConflictPolicy) => {
        const fd = new FormData();
        fd.append('material_type_id', uploadTypeId);
        // 標題為單筆欄位，多檔批次上傳時套用同一標題沒有意義，僅單檔時套用
        if (uploadTitle && uploadFiles.length === 1) fd.append('title', uploadTitle);
        if (uploadDesc) fd.append('description', uploadDesc);
        if (uploadTags) fd.append('tags', uploadTags);
        if (onConflict) fd.append('on_conflict', onConflict);
        fd.append('nas_session_token', token);
        uploadFiles.forEach(f => fd.append('files', f));

        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setTransfer({ open: true, title: '上傳教材', progress: 0, status: 'transferring', error: null });
        try {
            const res = await api.post<UploadResult>('/admin/teaching-materials/upload', fd, {
                signal: ctrl.signal, onUploadProgress: onProgress,
            });
            setTransfer(s => ({ ...s, progress: 100, status: 'success' }));
            const r = res.data;
            const failMsg = r.failed.length
                ? `，失敗 ${r.failed.length} 筆：${r.failed.map(f => `${f.original_filename}（${f.reason}）`).join('、')}`
                : '';
            setUploadResultMsg(`成功上傳 ${r.succeeded.length} 筆${failMsg}`);
            setUploadFiles([]);
            setUploadFileKey(k => k + 1);
            setUploadTypeId('');
            setUploadTitle('');
            setUploadDesc('');
            setUploadTags('');
            setPage(1);
            fetchList();
        } catch (err) {
            if (isCancel(err)) return;
            const e2 = err as AxiosError<{ detail: string }>;
            setTransfer(s => ({ ...s, status: 'error', error: e2.response?.data?.detail || (e2.response?.status === 503 ? 'NAS 無法連線' : '上傳失敗') }));
        } finally { abortRef.current = null; }
    };

    const handleUploadClick = async () => {
        setUploadError(null);
        setUploadResultMsg(null);
        if (!uploadTypeId) { setUploadError('請選擇教材類型'); return; }
        if (uploadFiles.length === 0) { setUploadError('請選擇檔案'); return; }
        setUploadBusy(true);
        try {
            const found: ConflictItem[] = [];
            for (const f of uploadFiles) {
                const res = await api.get<{ has_conflict: boolean; existing: ConflictItem['existing'] }>(
                    '/admin/teaching-materials/conflict-check',
                    { params: { original_filename: f.name } },
                );
                if (res.data.has_conflict) found.push({ filename: f.name, existing: res.data.existing });
            }
            if (found.length > 0) {
                setUploadConflicts(found);
                setUploadConflictOpen(true);
                return;
            }
            requireNas('上傳教材', token => doUpload(token));
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setUploadError(e2.response?.data?.detail || '衝突檢查失敗');
        } finally { setUploadBusy(false); }
    };

    const resolveUploadConflict = (policy: ConflictPolicy) => {
        setUploadConflictOpen(false);
        requireNas('上傳教材', token => doUpload(token, policy));
    };

    const handleDelete = async (m: Material) => {
        if (!confirm(`確定停用教材「${m.original_filename}」？（軟刪除）`)) return;
        try {
            await api.delete(`/admin/teaching-materials/${m.id}`);
            setSelected(prev => { const n = new Map(prev); n.delete(m.id); return n; });
            fetchList();
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '刪除失敗');
        }
    };

    const onSearch = () => { setPage(1); fetchList(); };

    const columns: DataTableColumn<Material>[] = [
        {
            key: 'select',
            header: (
                <button type="button" onClick={toggleSelectAllOnPage} className="text-indigo-600 cursor-pointer" title="全選／取消全選（本頁）">
                    {allOnPageSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                </button>
            ),
            width: 40,
            render: m => (
                <button type="button" onClick={() => toggle(m)} className="text-indigo-600 cursor-pointer">
                    {selected.has(m.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                </button>
            ),
        },
        {
            key: 'title',
            header: '標題 / 原檔名',
            render: m => (
                <>
                    <div className="text-sm font-bold text-gray-800 truncate max-w-[280px]">{m.title}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[280px]">{m.original_filename}</div>
                    {m.description && <div className="text-xs text-gray-400 truncate max-w-[280px]">{m.description}</div>}
                </>
            ),
        },
        {
            key: 'type',
            header: '類型',
            render: m => <span className="text-sm text-gray-600">{types.find(t => t.id === m.material_type_id)?.name || '-'}</span>,
        },
        {
            key: 'plan',
            header: '計畫',
            render: m => <span className="text-sm text-gray-600">{m.plan_id != null ? `#${m.plan_id}` : <span className="text-gray-400">通用</span>}</span>,
        },
        {
            key: 'size',
            header: '大小',
            render: m => <span className="text-sm text-gray-600">{fmtSize(m.file_size_bytes)}</span>,
        },
        {
            key: 'actions',
            header: '操作',
            render: m => (
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => requireNas('下載教材', token => doSingleDownload(token, m))} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer" title="下載">
                        <Download className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleDelete(m)} className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer" title="停用">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <Library className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">教材庫</h1>
                        <p className="text-gray-500 font-medium text-sm">跨計畫搜尋、勾選與批次下載教材（下載前須 NAS 登入）</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-50 cursor-pointer"
                        >
                            <PenTool className="w-4 h-4" /> 返回考卷工坊
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setUploadOpen(o => !o)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer"
                    >
                        <Upload className="w-4 h-4" /> 上傳教材
                    </button>
                </div>
            </header>

            {/* 通用上傳（不綁定訓練計畫） */}
            {uploadOpen && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-indigo-100 space-y-3">
                    <label className="text-xs font-bold text-gray-500 uppercase">上傳教材（通用，不綁定任何訓練計畫；上傳前須 NAS 登入）</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <select
                            value={uploadTypeId}
                            onChange={e => setUploadTypeId(e.target.value)}
                            className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                        >
                            <option value="">選擇教材類型…</option>
                            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <div className="flex items-start gap-2">
                            <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-indigo-300 bg-white rounded-lg text-sm font-bold text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer transition-colors shrink-0">
                                <FileText className="w-4 h-4 shrink-0" />
                                <span className="truncate">{uploadFiles.length > 0 ? `已選 ${uploadFiles.length} 個檔案` : '選擇檔案…'}</span>
                                <input
                                    key={uploadFileKey}
                                    type="file"
                                    multiple
                                    accept={MATERIAL_ACCEPT}
                                    onChange={e => {
                                        const picked = e.target.files ? Array.from(e.target.files) : [];
                                        const { merged, rejected, overflow } = mergeSelectedFiles(uploadFiles, picked);
                                        setUploadFiles(merged);
                                        setUploadFileKey(k => k + 1);
                                        if (rejected.length) setUploadError(`不允許的格式：${rejected.join('、')}`);
                                        else if (overflow) setUploadError(`單次最多 5 檔，已忽略超出的 ${overflow} 個檔案`);
                                        else setUploadError(null);
                                    }}
                                    className="hidden"
                                />
                            </label>
                            {uploadFiles.length > 0 && (
                                <ul className="flex-1 min-w-0 text-xs text-gray-600 space-y-0.5 py-1">
                                    {uploadFiles.map((f, i) => (
                                        <li key={i} className="flex items-center justify-between gap-1 truncate">
                                            <span className="truncate">{i + 1}. {f.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setUploadFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer shrink-0"
                                                title="移除"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <input
                            type="text"
                            placeholder={uploadFiles.length > 1 ? '標題（多檔上傳時不套用，一律使用檔名）' : '標題（選填，預設使用檔名）'}
                            value={uploadTitle}
                            onChange={e => setUploadTitle(e.target.value)}
                            disabled={uploadFiles.length > 1}
                            className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                        />
                        <input
                            type="text"
                            placeholder="簡述（選填）"
                            value={uploadDesc}
                            onChange={e => setUploadDesc(e.target.value)}
                            className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                        <input
                            type="text"
                            placeholder="標籤（逗號分隔，選填）"
                            value={uploadTags}
                            onChange={e => setUploadTags(e.target.value)}
                            className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                        <div className="md:col-span-2 flex items-center justify-between">
                            <span className="text-xs text-gray-500">可多選；單次≤5檔/100MB</span>
                            <button
                                type="button"
                                onClick={handleUploadClick}
                                disabled={uploadBusy}
                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 cursor-pointer"
                            >
                                {uploadBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 上傳
                            </button>
                        </div>
                    </div>
                    {uploadError && (
                        <p className="text-xs text-red-600 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" />{uploadError}</p>
                    )}
                    {uploadResultMsg && <p className="text-xs text-green-600 font-bold">{uploadResultMsg}</p>}
                </div>
            )}

            {/* 篩選列 */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="搜尋標題 / 原檔名 / 標籤…"
                        className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && onSearch()}
                    />
                </div>
                <select value={materialTypeId} onChange={e => { setMaterialTypeId(e.target.value); setPage(1); }} className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">全部類型</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={fileFormat} onChange={e => { setFileFormat(e.target.value); setPage(1); }} className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">全部格式</option>
                    {['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'txt'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <button type="button" onClick={onSearch} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer">搜尋</button>
            </div>

            {/* 工具列 */}
            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">共 {total} 筆{selected.size > 0 ? `；已選 ${selected.size} 項` : ''}</span>
                <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={() => setBatchConfirmOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
                >
                    <PackageOpen className="w-4 h-4" /> 批次下載
                </button>
            </div>

            {/* 列表（共用 @shared-ui/data-table） */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-4">
                <PaginatedDataTable<Material>
                    adapter="tailwind"
                    columns={columns}
                    data={items}
                    loading={loading}
                    loadingText={<Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />}
                    emptyState={<div className="text-gray-400">查無教材</div>}
                    getRowKey={m => m.id}
                    paginationMode="server"
                    totalItems={total}
                    page={page}
                    pageSize={size}
                    pageSizeOptions={[10, 20, 50, 100]}
                    onPaginationChange={state => { setPage(state.page); setSize(state.pageSize); }}
                />
            </div>

            {/* 批次下載確認 */}
            {batchConfirmOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-black text-gray-900">批次下載確認（{selected.size} 份）</h3></div>
                        <div className="px-5 py-4 overflow-y-auto">
                            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                                {Array.from(selected.values()).map((v, i) => <li key={i} className="truncate">{v.original_filename}</li>)}
                            </ul>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                            <button type="button" onClick={() => setBatchConfirmOpen(false)} className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer">取消</button>
                            <button type="button" onClick={() => { setBatchConfirmOpen(false); requireNas('批次下載', token => doBatchDownload(token)); }} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 cursor-pointer">下載 ZIP</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 通用上傳同名衝突對話框 */}
            {uploadConflictOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
                            <h3 className="font-black text-gray-900">同名教材衝突</h3>
                        </div>
                        <div className="px-5 py-4 text-sm text-gray-700 space-y-2">
                            <p>下列檔案在通用教材中已有使用中的同名教材，請選擇處理方式：</p>
                            <ul className="list-disc pl-5 text-xs text-gray-600">
                                {uploadConflicts.map(c => <li key={c.filename}>{c.filename}</li>)}
                            </ul>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2">
                            <button type="button" onClick={() => resolveUploadConflict('deactivate_and_new')} className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 cursor-pointer">
                                停用舊版 ＋ 上傳新版
                            </button>
                            <button type="button" onClick={() => resolveUploadConflict('replace_in_place')} className="px-3 py-2 text-sm rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer">
                                以新檔取代舊檔
                            </button>
                            <button type="button" onClick={() => setUploadConflictOpen(false)} className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer">
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <NasLoginModal open={nasOpen} purpose={nasPurpose} onClose={() => setNasOpen(false)} onSuccess={onNasSuccess} />
            <FileTransferModal transfer={transfer} onCancel={cancelTransfer} onClose={closeTransfer} />
        </div>
    );
};

export default TeachingMaterialLibrary;
