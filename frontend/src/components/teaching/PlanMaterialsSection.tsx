import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Download, Trash2, Loader2, FileText, AlertCircle, X } from 'lucide-react';
import axios, { AxiosError, type AxiosProgressEvent } from 'axios';
import api from '../../api';
import NasLoginModal from './NasLoginModal';
import FileTransferModal from './FileTransferModal';
import { saveBlob, idleTransfer, type TransferState, mergeSelectedFiles, MATERIAL_ACCEPT, IN_FLIGHT_PROGRESS_CAP } from './transfer';

interface MaterialType {
    id: number;
    name: string;
    slug: string;
    is_active: boolean;
    max_file_bytes: number | null;
}

interface Material {
    id: number;
    title: string;
    original_filename: string;
    material_type_id: number;
    description: string | null;
    file_format: string;
    file_size_bytes: number;
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

interface PlanMaterialsSectionProps {
    planId: number;
    archived?: boolean;
}

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/**
 * 訓練計畫編輯頁的教材區（Wave 3）：上傳（含同名衝突二選一）、列表、下載、軟刪。
 * 每次傳輸前先 NAS 登入；以 FileTransferModal 顯示進度。
 */
const PlanMaterialsSection = ({ planId, archived = false }: PlanMaterialsSectionProps) => {
    const [types, setTypes] = useState<MaterialType[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [materialTypeId, setMaterialTypeId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [resultMsg, setResultMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [nasOpen, setNasOpen] = useState(false);
    const [nasPurpose, setNasPurpose] = useState('');
    const pendingRef = useRef<((token: string) => void) | null>(null);
    const [transfer, setTransfer] = useState<TransferState>(idleTransfer);
    const abortRef = useRef<AbortController | null>(null);

    const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
    const [conflictOpen, setConflictOpen] = useState(false);

    const fetchMaterials = useCallback(async () => {
        try {
            const res = await api.get<Material[]>(`/admin/teaching-materials/by-plan/${planId}`);
            setMaterials(res.data);
        } catch (err) {
            console.error('載入教材失敗', err);
        }
    }, [planId]);

    useEffect(() => {
        api.get<MaterialType[]>('/admin/teaching-materials/material-types').then(r => setTypes(r.data)).catch(() => {});
        fetchMaterials();
    }, [fetchMaterials]);

    const requireNas = (purpose: string, action: (token: string) => void) => {
        pendingRef.current = action;
        setNasPurpose(purpose);
        setNasOpen(true);
    };
    const onNasSuccess = (token: string) => {
        setNasOpen(false);
        const a = pendingRef.current;
        pendingRef.current = null;
        a?.(token);
    };

    const closeTransfer = () => setTransfer(idleTransfer);
    const cancelTransfer = () => {
        abortRef.current?.abort();
        setTransfer(idleTransfer);
    };

    const onProgress = (e: AxiosProgressEvent) =>
        setTransfer(s => (s.open ? { ...s, progress: e.total ? Math.min(IN_FLIGHT_PROGRESS_CAP, Math.round((e.loaded / e.total) * 100)) : s.progress } : s));

    const isCancel = (err: unknown) => axios.isCancel(err) || (err as { code?: string })?.code === 'ERR_CANCELED';

    const doUpload = async (token: string, onConflict?: ConflictPolicy) => {
        const fd = new FormData();
        fd.append('plan_id', String(planId));
        fd.append('material_type_id', materialTypeId);
        // 標題為單筆欄位，多檔批次上傳時套用同一標題沒有意義，僅單檔時套用
        if (title && files.length === 1) fd.append('title', title);
        if (description) fd.append('description', description);
        if (tags) fd.append('tags', tags);
        if (onConflict) fd.append('on_conflict', onConflict);
        fd.append('nas_session_token', token);
        files.forEach(f => fd.append('files', f));

        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setTransfer({ open: true, title: '上傳教材', progress: 0, status: 'transferring', error: null });
        try {
            const res = await api.post<UploadResult>('/admin/teaching-materials/upload', fd, {
                signal: ctrl.signal,
                onUploadProgress: onProgress,
            });
            setTransfer(s => ({ ...s, progress: 100, status: 'success' }));
            const r = res.data;
            const failMsg = r.failed.length
                ? `，失敗 ${r.failed.length} 筆：${r.failed.map(f => `${f.original_filename}（${f.reason}）`).join('、')}`
                : '';
            setResultMsg(`成功上傳 ${r.succeeded.length} 筆${failMsg}`);
            setFiles([]);
            setFileInputKey(k => k + 1);
            setMaterialTypeId('');
            setTitle('');
            setDescription('');
            setTags('');
            fetchMaterials();
        } catch (err) {
            if (isCancel(err)) return;
            const e2 = err as AxiosError<{ detail: string }>;
            setTransfer(s => ({ ...s, status: 'error', error: e2.response?.data?.detail || (e2.response?.status === 503 ? 'NAS 無法連線' : '上傳失敗') }));
        } finally {
            abortRef.current = null;
        }
    };

    const handleUploadClick = async () => {
        setError(null);
        setResultMsg(null);
        if (!materialTypeId) {
            setError('請選擇教材類型');
            return;
        }
        if (files.length === 0) {
            setError('請選擇檔案');
            return;
        }
        setBusy(true);
        try {
            const found: ConflictItem[] = [];
            for (const f of files) {
                const res = await api.get<{ has_conflict: boolean; existing: ConflictItem['existing'] }>(
                    '/admin/teaching-materials/conflict-check',
                    { params: { plan_id: planId, original_filename: f.name } },
                );
                if (res.data.has_conflict) found.push({ filename: f.name, existing: res.data.existing });
            }
            if (found.length > 0) {
                setConflicts(found);
                setConflictOpen(true);
                return;
            }
            requireNas('上傳教材', token => doUpload(token));
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setError(e2.response?.data?.detail || '衝突檢查失敗');
        } finally {
            setBusy(false);
        }
    };

    const resolveConflict = (policy: ConflictPolicy) => {
        setConflictOpen(false);
        requireNas('上傳教材', token => doUpload(token, policy));
    };

    const doDownload = async (token: string, m: Material) => {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setTransfer({ open: true, title: `下載 ${m.original_filename}`, progress: 0, status: 'transferring', error: null });
        try {
            const res = await api.get(`/admin/teaching-materials/${m.id}/download`, {
                params: { nas_session_token: token },
                responseType: 'blob',
                signal: ctrl.signal,
                onDownloadProgress: onProgress,
            });
            saveBlob(res.data as Blob, m.original_filename);
            setTransfer(s => ({ ...s, progress: 100, status: 'success' }));
        } catch (err) {
            if (isCancel(err)) return;
            const e2 = err as AxiosError;
            setTransfer(s => ({ ...s, status: 'error', error: e2.response?.status === 503 ? 'NAS 無法連線' : '下載失敗' }));
        } finally {
            abortRef.current = null;
        }
    };

    const handleDelete = async (m: Material) => {
        if (!confirm(`確定停用教材「${m.original_filename}」？（軟刪除，實體檔保留）`)) return;
        try {
            await api.delete(`/admin/teaching-materials/${m.id}`);
            fetchMaterials();
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '刪除失敗');
        }
    };

    return (
        <div className="space-y-3 pt-2 border-t border-gray-100">
            <label className="text-xs font-bold text-gray-500 uppercase">教材（上傳前須 NAS 登入）</label>

            {!archived && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-indigo-50/30 border-2 border-indigo-100 rounded-xl p-3">
                    <select
                        value={materialTypeId}
                        onChange={e => setMaterialTypeId(e.target.value)}
                        className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                    >
                        <option value="">選擇教材類型…</option>
                        {types.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    <div className="flex items-start gap-2">
                        <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-indigo-300 bg-white rounded-lg text-sm font-bold text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer transition-colors shrink-0">
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="truncate">{files.length > 0 ? `已選 ${files.length} 個檔案` : '選擇檔案…'}</span>
                            <input
                                key={fileInputKey}
                                type="file"
                                multiple
                                accept={MATERIAL_ACCEPT}
                                onChange={e => {
                                    const picked = e.target.files ? Array.from(e.target.files) : [];
                                    const { merged, rejected, overflow } = mergeSelectedFiles(files, picked);
                                    setFiles(merged);
                                    setFileInputKey(k => k + 1);
                                    if (rejected.length) setError(`不允許的格式：${rejected.join('、')}`);
                                    else if (overflow) setError(`單次最多 5 檔，已忽略超出的 ${overflow} 個檔案`);
                                    else setError(null);
                                }}
                                className="hidden"
                            />
                        </label>
                        {files.length > 0 && (
                            <ul className="flex-1 min-w-0 text-xs text-gray-600 space-y-0.5 py-1">
                                {files.map((f, i) => (
                                    <li key={i} className="flex items-center justify-between gap-1 truncate">
                                        <span className="truncate">{i + 1}. {f.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
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
                        placeholder={files.length > 1 ? '標題（多檔上傳時不套用，一律使用檔名）' : '標題（選填，預設使用檔名）'}
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        disabled={files.length > 1}
                        className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <input
                        type="text"
                        placeholder="簡述（選填）"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <input
                        type="text"
                        placeholder="標籤（逗號分隔，選填）"
                        value={tags}
                        onChange={e => setTags(e.target.value)}
                        className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <div className="md:col-span-2 flex items-center justify-between">
                        <span className="text-xs text-gray-500">可多選；單次≤5檔/100MB</span>
                        <button
                            type="button"
                            onClick={handleUploadClick}
                            disabled={busy}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 cursor-pointer"
                        >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 上傳
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <p className="text-xs text-red-600 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>
            )}
            {resultMsg && <p className="text-xs text-green-600 font-bold">{resultMsg}</p>}

            <div className="border-2 border-gray-100 rounded-xl divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {materials.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">尚無教材</p>
                ) : (
                    materials.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="text-sm text-gray-700 truncate flex flex-col">
                                <span className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                    {m.original_filename}
                                    <span className="text-xs text-gray-400">({fmtSize(m.file_size_bytes)})</span>
                                </span>
                                {m.description && <span className="text-xs text-gray-400 truncate pl-6">{m.description}</span>}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                                <button type="button" onClick={() => requireNas('下載教材', token => doDownload(token, m))} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer" title="下載">
                                    <Download className="w-4 h-4" />
                                </button>
                                {!archived && (
                                    <button type="button" onClick={() => handleDelete(m)} className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer" title="停用">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 同名衝突對話框 */}
            {conflictOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
                            <h3 className="font-black text-gray-900">同名教材衝突</h3>
                        </div>
                        <div className="px-5 py-4 text-sm text-gray-700 space-y-2">
                            <p>下列檔案在本計畫已有使用中的同名教材，請選擇處理方式：</p>
                            <ul className="list-disc pl-5 text-xs text-gray-600">
                                {conflicts.map(c => <li key={c.filename}>{c.filename}</li>)}
                            </ul>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2">
                            <button type="button" onClick={() => resolveConflict('deactivate_and_new')} className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 cursor-pointer">
                                停用舊版 ＋ 上傳新版
                            </button>
                            <button type="button" onClick={() => resolveConflict('replace_in_place')} className="px-3 py-2 text-sm rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer">
                                以新檔取代舊檔
                            </button>
                            <button type="button" onClick={() => setConflictOpen(false)} className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer">
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

export default PlanMaterialsSection;
