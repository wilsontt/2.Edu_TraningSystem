import { useRef, useState } from 'react';
import { Loader2, FileText, AlertCircle, X, Trash2 } from 'lucide-react';
import { type AxiosError, type AxiosProgressEvent } from 'axios';
import { updateSet, updateSetPlans, removeSetFile, addSetFiles } from '../../api/teachingMaterials';
import { mergeSelectedFiles } from './transfer';
import SelectedFilesList from './SelectedFilesList';
import PlanBindingChecklist from './PlanBindingChecklist';
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

type UploadOutcome = 'ok' | 'conflict' | 'fail';

/** 編輯套組面板：中繼資料、計畫綁定、既有檔案移除、新增檔案（同名覆蓋 Yes/No，教材 PLAN §5.12.3）。
 * 「儲存」會一併寫入中繼資料與已選未上傳檔案，不可在尚有選檔時假裝只存標題成功。 */
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
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [conflictFiles, setConflictFiles] = useState<File[]>([]);
    const [conflictOpen, setConflictOpen] = useState(false);
    const [pendingRemove, setPendingRemove] = useState<{ id: number; name: string } | null>(null);
    const [removing, setRemoving] = useState(false);
    /** 同名覆蓋確認後是否繼續完成「儲存」（含中繼資料）。 */
    const continueSaveRef = useRef(false);

    const persistMetadata = async (): Promise<boolean> => {
        const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
        const updated = await updateSet(set.id, {
            title, material_type_id: Number(typeId),
            description: description || null,
            tags: tagsArray.length ? tagsArray : null,
        });
        const withPlans = await updateSetPlans(set.id, planIds);
        onUpdated({ ...updated, plan_ids: withPlans.plan_ids, plan_titles: withPlans.plan_titles });
        return true;
    };

    const uploadPendingFiles = async (
        token: string,
        files: File[],
        overwrite?: boolean,
    ): Promise<UploadOutcome> => {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f));
        if (overwrite !== undefined) fd.append('overwrite_on_duplicate', String(overwrite));
        fd.append('nas_session_token', token);

        const signal = beginTransfer(files.length > 1 ? `上傳 ${files.length} 個檔案` : '上傳教材檔案');
        try {
            const res = await addSetFiles(set.id, fd, { signal, onUploadProgress });
            const conflicted = res.data.failed.filter(f => f.reason === '同名衝突，需指定是否覆蓋');
            if (conflicted.length > 0 && overwrite === undefined) {
                closeTransfer();
                const names = new Set(conflicted.map(f => f.original_filename));
                setConflictFiles(files.filter(f => names.has(f.name)));
                setConflictOpen(true);
                return 'conflict';
            }

            const otherFailed = res.data.failed.filter(f => f.reason !== '同名衝突，需指定是否覆蓋');
            if (otherFailed.length > 0 && res.data.succeeded.length === 0) {
                const msg = otherFailed.map(f => f.reason).join('\n');
                endTransferError(msg);
                setError(msg);
                return 'fail';
            }

            if (otherFailed.length > 0) {
                const msg = otherFailed.map(f => f.reason).join('\n');
                setError(`部分檔案未上傳：\n${msg}`);
                endTransferError(msg);
                // 部分成功仍清掉已上傳者：保留失敗檔於選單較複雜，改為清空並要求重選失敗檔
                setNewFiles([]);
                setFileInputKey(k => k + 1);
                onUpdated({ ...set });
                return 'fail';
            }

            endTransferSuccess();
            setNewFiles([]);
            setFileInputKey(k => k + 1);
            onUpdated({ ...set });
            return 'ok';
        } catch (err) {
            if (isCancel(err)) return 'fail';
            const e2 = err as AxiosError<{ detail: string }>;
            const msg = e2.response?.data?.detail || '新增檔案失敗';
            endTransferError(msg);
            setError(msg);
            return 'fail';
        }
    };

    const finishSaveSuccess = (uploadedCount: number) => {
        const base = '套組已儲存（標題／類型／簡述／標籤／綁定計畫';
        setSuccessMsg(
            uploadedCount > 0
                ? `${base}；並上傳 ${uploadedCount} 個檔案）`
                : `${base}）`,
        );
        window.setTimeout(() => onClose(), 800);
    };

    const handleSave = () => {
        if (!typeId) { setError('請選擇教材類型'); return; }
        setError(null);
        setSuccessMsg(null);

        const pending = [...newFiles];
        if (pending.length > 0) {
            continueSaveRef.current = true;
            requireNas('儲存套組（含上傳檔案）', async token => {
                setBusy(true);
                try {
                    const outcome = await uploadPendingFiles(token, pending);
                    if (outcome === 'conflict') return; // 等待覆蓋確認後繼續；busy 於 finally 解除
                    if (outcome === 'fail') {
                        continueSaveRef.current = false;
                        return;
                    }
                    await persistMetadata();
                    finishSaveSuccess(pending.length);
                    continueSaveRef.current = false;
                } catch (err) {
                    continueSaveRef.current = false;
                    const e2 = err as AxiosError<{ detail: string }>;
                    setError(e2.response?.data?.detail || '儲存失敗');
                } finally {
                    setBusy(false);
                }
            });
            return;
        }

        setBusy(true);
        void (async () => {
            try {
                await persistMetadata();
                finishSaveSuccess(0);
            } catch (err) {
                const e2 = err as AxiosError<{ detail: string }>;
                setError(e2.response?.data?.detail || '儲存失敗');
            } finally {
                setBusy(false);
            }
        })();
    };

    const resolveConflict = (overwrite: boolean) => {
        setConflictOpen(false);
        const files = conflictFiles;
        setConflictFiles([]);
        setBusy(true);
        requireNas('儲存套組（含上傳檔案）', async token => {
            try {
                const outcome = await uploadPendingFiles(token, files, overwrite);
                if (outcome !== 'ok') {
                    continueSaveRef.current = false;
                    return;
                }
                if (continueSaveRef.current) {
                    await persistMetadata();
                    finishSaveSuccess(files.length);
                    continueSaveRef.current = false;
                }
            } catch (err) {
                continueSaveRef.current = false;
                const e2 = err as AxiosError<{ detail: string }>;
                setError(e2.response?.data?.detail || '儲存失敗');
            } finally {
                setBusy(false);
            }
        });
    };

    const confirmRemoveFile = async () => {
        if (!pendingRemove) return;
        const { id, name } = pendingRemove;
        setRemoving(true);
        setError(null);
        try {
            await removeSetFile(set.id, id);
            setPendingRemove(null);
            setSuccessMsg(`已移除「${name}」`);
            onUpdated({
                ...set,
                file_count: Math.max(0, set.file_count - 1),
                files: set.files?.filter(f => f.id !== id),
            });
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setError(e2.response?.data?.detail || '移除失敗');
        } finally {
            setRemoving(false);
        }
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
                    <div className="md:col-span-2">
                        <PlanBindingChecklist
                            planOptions={planOptions}
                            selectedIds={planIds}
                            lockedPlanId={lockedPlanId}
                            archivedTitleById={Object.fromEntries(
                                set.plan_ids.map((id, i) => [id, set.plan_titles[i] ?? `計畫 #${id}`]),
                            )}
                            onChange={ids => {
                                // 作法 A：勾選變更不得丢掉既有封存綁定 id
                                const archivedKeep = planIds.filter(id => {
                                    const p = planOptions.find(o => o.id === id);
                                    return p?.is_archived || (!p && set.plan_ids.includes(id));
                                });
                                const merged = Array.from(new Set([...ids, ...archivedKeep]));
                                setPlanIds(lockedPlanId ? Array.from(new Set([lockedPlanId, ...merged])) : merged);
                            }}
                        />
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
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSuccessMsg(null);
                                        setPendingRemove({ id: f.id, name: f.original_filename });
                                    }}
                                    className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer shrink-0"
                                    title="移除"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="md:col-span-2 space-y-2">
                    <p className="text-xs text-gray-500">新增檔案（選填；按「儲存」時一併上傳，同名檔會詢問是否覆蓋）</p>
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
                                setSuccessMsg(null);
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
                </div>

                <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm text-gray-700">
                        {newFiles.length > 0
                            ? `將一併上傳 ${newFiles.length} 個已選檔案`
                            : '未另選檔案時，僅更新套組中繼資料'}
                    </p>
                    <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 cursor-pointer">取消</button>
                        <button type="button" onClick={handleSave} disabled={busy}
                            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 disabled:bg-amber-300 cursor-pointer">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 儲存
                        </button>
                    </div>
                </div>
            </div>
            {error && (
                <p className="text-sm text-red-700 font-bold flex items-start gap-1.5 whitespace-pre-wrap wrap-break-word">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
                </p>
            )}
            {successMsg && (
                <p className="text-sm text-green-700 font-bold whitespace-pre-wrap wrap-break-word">{successMsg}</p>
            )}

            {pendingRemove && (
                <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-4 border-b border-red-100 bg-red-50">
                            <h3 className="font-black text-gray-900">確認移除檔案</h3>
                        </div>
                        <div className="px-5 py-4 text-sm text-gray-800 space-y-2">
                            <p>確定要從套組移除下列檔案嗎？</p>
                            <p className="font-bold text-gray-900 wrap-break-word">「{pendingRemove.name}」</p>
                            <p className="text-gray-600">此為軟刪除：列表不再顯示，NAS 實體檔仍保留。</p>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2">
                            <button
                                type="button"
                                disabled={removing}
                                onClick={() => void confirmRemoveFile()}
                                className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:bg-red-300 cursor-pointer"
                            >
                                {removing ? '移除中…' : '確定移除'}
                            </button>
                            <button
                                type="button"
                                disabled={removing}
                                onClick={() => setPendingRemove(null)}
                                className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {conflictOpen && (
                <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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
