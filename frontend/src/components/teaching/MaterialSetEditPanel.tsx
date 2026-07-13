import { useState } from 'react';
import { Loader2, FileText, AlertCircle, X, Trash2 } from 'lucide-react';
import { type AxiosError, type AxiosProgressEvent } from 'axios';
import { updateSet, updateSetPlans, removeSetFile, addSetFiles } from '../../api/teachingMaterials';
import { mergeSelectedFiles } from './transfer';
import SelectedFilesList from './SelectedFilesList';
import type { MaterialType, MaterialSet, PlanOption } from '../../types/materials';

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

interface MaterialSetEditPanelProps {
    set: MaterialSet;
    types: MaterialType[];
    allowedExts: string[];
    materialAccept: string;
    planOptions?: PlanOption[];
    lockedPlanId?: number;
    onUpdated: (updated: MaterialSet) => void;
    onClose: () => void;
    requireNas: (purpose: string, action: (token: string) => void) => void;
    beginTransfer: (title: string) => AbortSignal;
    onUploadProgress: (e: AxiosProgressEvent) => void;
    endTransferSuccess: () => void;
    endTransferError: (message: string) => void;
    /** 無錯誤關閉傳輸進度窗（例如進入同名覆蓋確認前）。 */
    closeTransfer: () => void;
    isCancel: (err: unknown) => boolean;
}

/** 編輯套組面板：中繼資料、計畫綁定、既有檔案移除、新增檔案（同名覆蓋 Yes/No，教材 PLAN §5.12.3）。 */
const MaterialSetEditPanel = ({
    set, types, allowedExts, materialAccept, planOptions = [], lockedPlanId,
    onUpdated, onClose, requireNas, beginTransfer, onUploadProgress,
    endTransferSuccess, endTransferError, closeTransfer, isCancel,
}: MaterialSetEditPanelProps) => {
    const [title, setTitle] = useState(set.title);
    const [typeId, setTypeId] = useState(String(set.material_type_id));
    const [description, setDescription] = useState(set.description ?? '');
    const [tags, setTags] = useState(() => {
        try { return ((JSON.parse(set.tags ?? '[]')) as string[]).join(', '); } catch { return ''; }
    });
    const [planIds, setPlanIds] = useState<number[]>(set.plan_ids);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [conflictFiles, setConflictFiles] = useState<File[]>([]);
    const [conflictOpen, setConflictOpen] = useState(false);

    const saveMetadataAndPlans = async () => {
        if (!typeId) { setError('請選擇教材類型'); return; }
        setError(null);
        setBusy(true);
        try {
            const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
            const updated = await updateSet(set.id, {
                title, material_type_id: Number(typeId),
                description: description || null,
                tags: tagsArray.length ? tagsArray : null,
            });
            const withPlans = await updateSetPlans(set.id, planIds);
            onUpdated({ ...updated, plan_ids: withPlans.plan_ids, plan_titles: withPlans.plan_titles });
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setError(e2.response?.data?.detail || '儲存失敗');
        } finally {
            setBusy(false);
        }
    };

    const handleRemoveFile = async (fileId: number) => {
        if (!confirm('確定移除此檔案？（軟刪除，NAS 實體檔保留）')) return;
        try {
            await removeSetFile(set.id, fileId);
            onUpdated({ ...set, file_count: set.file_count - 1, files: set.files?.filter(f => f.id !== fileId) });
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '移除失敗');
        }
    };

    const submitNewFiles = (files: File[], overwrite?: boolean) => {
        requireNas('新增教材檔案', async token => {
            const fd = new FormData();
            files.forEach(f => fd.append('files', f));
            if (overwrite !== undefined) fd.append('overwrite_on_duplicate', String(overwrite));
            fd.append('nas_session_token', token);

            const signal = beginTransfer('新增教材檔案');
            try {
                const res = await addSetFiles(set.id, fd, { signal, onUploadProgress });
                const conflicted = res.data.failed.filter(f => f.reason === '同名衝突，需指定是否覆蓋');
                if (conflicted.length > 0 && overwrite === undefined) {
                    // 尚未詢問覆蓋：關閉進度窗（非成功），改跳衝突確認
                    closeTransfer();
                    const names = new Set(conflicted.map(f => f.original_filename));
                    setConflictFiles(files.filter(f => names.has(f.name)));
                    setConflictOpen(true);
                    return;
                }

                const otherFailed = res.data.failed.filter(f => f.reason !== '同名衝突，需指定是否覆蓋');
                if (otherFailed.length > 0 && res.data.succeeded.length === 0) {
                    const msg = otherFailed.map(f => f.reason).join('\n');
                    endTransferError(msg);
                    setError(msg);
                    return;
                }

                if (otherFailed.length > 0) {
                    const msg = otherFailed.map(f => f.reason).join('\n');
                    setError(`部分檔案未上傳：\n${msg}`);
                } else {
                    setError(null);
                }

                endTransferSuccess();
                setNewFiles([]);
                setFileInputKey(k => k + 1);
                if (res.data.succeeded.length > 0) {
                    onUpdated({ ...set });
                }
            } catch (err) {
                if (isCancel(err)) return;
                const e2 = err as AxiosError<{ detail: string }>;
                const msg = e2.response?.data?.detail || '新增檔案失敗';
                endTransferError(msg);
                setError(msg);
            }
        });
    };

    const resolveConflict = (overwrite: boolean) => {
        setConflictOpen(false);
        submitNewFiles(conflictFiles, overwrite);
        setConflictFiles([]);
    };

    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-500 uppercase">編輯套組 — {set.title}</label>
                <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select value={typeId} onChange={e => setTypeId(e.target.value)}
                    className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm font-bold focus:outline-none focus:border-amber-500">
                    <option value="">選擇教材類型…</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input type="text" placeholder="標題" value={title} onChange={e => setTitle(e.target.value)}
                    className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-500" />
                <input type="text" placeholder="簡述（選填）" value={description} onChange={e => setDescription(e.target.value)}
                    className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-500" />
                <input type="text" placeholder="標籤（逗號分隔，選填）" value={tags} onChange={e => setTags(e.target.value)}
                    className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-500" />

                {planOptions.length > 0 && (
                    <div className="md:col-span-2 space-y-1">
                        <p className="text-xs text-gray-500">綁定訓練計畫（不選＝通用教材；Ctrl/Cmd+點擊可複選）</p>
                        <select
                            multiple
                            value={planIds.map(String)}
                            onChange={e => {
                                const chosen = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                                setPlanIds(lockedPlanId ? Array.from(new Set([lockedPlanId, ...chosen])) : chosen);
                            }}
                            className="w-full px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 h-28"
                        >
                            {planOptions.filter(p => !p.is_archived).map(p => (
                                <option key={p.id} value={p.id} disabled={p.id === lockedPlanId}>
                                    {p.title}{p.id === lockedPlanId ? '（本計畫，已鎖定）' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">套組內檔案（{set.files?.length ?? 0} 個）</p>
                    <ul className="border-2 border-gray-100 rounded-lg divide-y divide-gray-200 max-h-48 overflow-y-auto">
                        {(set.files ?? []).map(f => (
                            <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                                <span className="text-sm text-gray-700 truncate flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    {f.original_filename}
                                    <span className="text-xs text-gray-400 shrink-0">({fmtSize(f.file_size_bytes)})</span>
                                </span>
                                <button type="button" onClick={() => handleRemoveFile(f.id)}
                                    className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer shrink-0" title="移除">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="md:col-span-2 space-y-2">
                    <p className="text-xs text-gray-500">新增檔案（選填，同名檔會詢問是否覆蓋）</p>
                    <label className="inline-flex items-center gap-2 px-3 py-2 border-2 border-dashed border-amber-300 bg-white rounded-lg text-sm font-bold text-amber-700 hover:border-amber-500 hover:bg-amber-50 cursor-pointer transition-colors">
                        <FileText className="w-4 h-4 shrink-0" />
                        <span>{newFiles.length > 0 ? `已選 ${newFiles.length} 個檔案` : '選擇檔案…'}</span>
                        <input
                            key={fileInputKey}
                            type="file"
                            multiple
                            accept={materialAccept}
                            className="hidden"
                            onChange={e => {
                                const picked = e.target.files ? Array.from(e.target.files) : [];
                                const { merged, rejected, overflow } = mergeSelectedFiles(newFiles, picked, allowedExts);
                                setNewFiles(merged);
                                setFileInputKey(k => k + 1);
                                if (rejected.length) setError(`不允許的格式：${rejected.join('、')}`);
                                else if (overflow) setError(`單次最多 5 檔，已忽略超出的 ${overflow} 個檔案`);
                                else setError(null);
                            }}
                        />
                    </label>
                    <SelectedFilesList
                        files={newFiles}
                        onRemove={i => setNewFiles(prev => prev.filter((_, idx) => idx !== i))}
                    />
                    {newFiles.length > 0 && (
                        <button type="button" onClick={() => submitNewFiles(newFiles)}
                            className="px-3 py-2 text-sm rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer">
                            上傳新檔案
                        </button>
                    )}
                </div>

                <div className="md:col-span-2 flex items-center justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 cursor-pointer">取消</button>
                    <button type="button" onClick={saveMetadataAndPlans} disabled={busy}
                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 disabled:bg-amber-300 cursor-pointer">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 儲存
                    </button>
                </div>
            </div>
            {error && (
                <p className="text-sm text-red-700 font-bold flex items-start gap-1.5 whitespace-pre-wrap wrap-break-word">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
                </p>
            )}

            {conflictOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
                            <h3 className="font-black text-gray-900">套組內同名檔案</h3>
                        </div>
                        <div className="px-5 py-4 text-sm text-gray-700 space-y-2">
                            <p>下列檔案在此套組已存在同名使用中檔案，是否覆蓋？</p>
                            <ul className="list-disc pl-5 text-sm text-gray-800 font-medium">
                                {conflictFiles.map(f => <li key={f.name}>{f.name}</li>)}
                            </ul>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2">
                            <button type="button" onClick={() => resolveConflict(true)} className="px-3 py-2 text-sm rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer">
                                覆蓋（Yes）
                            </button>
                            <button type="button" onClick={() => resolveConflict(false)} className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer">
                                跳過（No）
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MaterialSetEditPanel;
