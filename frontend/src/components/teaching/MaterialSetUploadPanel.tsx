import { useState } from 'react';
import { Upload, Loader2, FileText, AlertCircle } from 'lucide-react';
import { type AxiosError } from 'axios';
import { createSet } from '../../api/teachingMaterials';
import { mergeSelectedFiles } from './transfer';
import SelectedFilesList from './SelectedFilesList';
import PlanBindingChecklist from './PlanBindingChecklist';
import type { MaterialType, MaterialSet, PlanOption } from '../../types/materials';

interface MaterialSetUploadPanelProps {
    types: MaterialType[];
    allowedExts: string[];
    materialAccept: string;
    /** 可綁定的訓練計畫選項；不提供或為空陣列時不顯示計畫多選（例如僅通用教材情境）。 */
    planOptions?: PlanOption[];
    /** 提供時鎖定此計畫（固定勾選、無法取消），用於訓練計畫編輯頁上傳。 */
    lockedPlanId?: number;
    onCreated: (created: MaterialSet) => void;
    requireNas: (purpose: string, action: (token: string) => void) => void;
    beginTransfer: (title: string) => AbortSignal;
    onUploadProgress: (e: import('axios').AxiosProgressEvent) => void;
    endTransferSuccess: () => void;
    endTransferError: (message: string) => void;
    isCancel: (err: unknown) => boolean;
}

/** 建立教材套組面板（教材 PLAN §5.12.3：上傳前須 NAS 登入；首批檔案與套組同時建立）。 */
const MaterialSetUploadPanel = ({
    types, allowedExts, materialAccept, planOptions = [], lockedPlanId,
    onCreated, requireNas, beginTransfer, onUploadProgress, endTransferSuccess,
    endTransferError, isCancel,
}: MaterialSetUploadPanelProps) => {
    const [typeId, setTypeId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');
    const [planIds, setPlanIds] = useState<number[]>(lockedPlanId ? [lockedPlanId] : []);
    const [files, setFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [resultMsg, setResultMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const doCreate = (token: string) => {
        const fd = new FormData();
        fd.append('title', title || files[0]?.name.replace(/\.[^.]+$/, '') || '未命名教材');
        fd.append('material_type_id', typeId);
        if (description) fd.append('description', description);
        if (tags) fd.append('tags', tags);
        if (planIds.length > 0) fd.append('plan_ids', planIds.join(','));
        fd.append('nas_session_token', token);
        files.forEach(f => fd.append('files', f));

        const signal = beginTransfer('建立教材套組');
        createSet(fd, { signal, onUploadProgress })
            .then(res => {
                endTransferSuccess();
                setResultMsg(`已建立套組「${res.data.title}」（${res.data.file_count} 個檔案）`);
                setTitle('');
                setTypeId('');
                setDescription('');
                setTags('');
                setFiles([]);
                setFileInputKey(k => k + 1);
                if (!lockedPlanId) setPlanIds([]);
                onCreated(res.data);
            })
            .catch(err => {
                if (isCancel(err)) return;
                const e2 = err as AxiosError<{ detail: string }>;
                const msg = e2.response?.data?.detail
                    || (e2.response?.status === 503 ? 'NAS 無法連線' : '建立失敗');
                endTransferError(msg);
                setError(msg);
            });
    };

    const handleCreateClick = () => {
        setError(null);
        setResultMsg(null);
        if (!typeId) { setError('請選擇教材類型'); return; }
        if (files.length === 0) { setError('請選擇檔案'); return; }
        setBusy(true);
        requireNas('建立教材套組', token => { doCreate(token); setBusy(false); });
        setBusy(false);
    };

    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-indigo-100 space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase">
                新增教材套組（上傳前須 NAS 登入）
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                    value={typeId}
                    onChange={e => setTypeId(e.target.value)}
                    className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                >
                    <option value="">選擇教材類型…</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-indigo-300 bg-white rounded-lg text-sm font-bold text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer transition-colors">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{files.length > 0 ? `已選 ${files.length} 個檔案` : '選擇檔案…'}</span>
                    <input
                        key={fileInputKey}
                        type="file"
                        multiple
                        accept={materialAccept}
                        onChange={e => {
                            const picked = e.target.files ? Array.from(e.target.files) : [];
                            const { merged, rejected, overflow } = mergeSelectedFiles(files, picked, allowedExts);
                            setFiles(merged);
                            setFileInputKey(k => k + 1);
                            if (rejected.length) setError(`不允許的格式：${rejected.join('、')}`);
                            else if (overflow) setError(`單次最多 5 檔，已忽略超出的 ${overflow} 個檔案`);
                            else setError(null);
                        }}
                        className="hidden"
                    />
                </label>
                <input
                    type="text"
                    placeholder="標題（選填，預設使用第一個檔名）"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
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
                    className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 md:col-span-2"
                />
                <SelectedFilesList
                    files={files}
                    onRemove={i => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                />
                {planOptions.length > 0 && (
                    <div className="md:col-span-2">
                        <PlanBindingChecklist
                            planOptions={planOptions}
                            selectedIds={planIds}
                            lockedPlanId={lockedPlanId}
                            onChange={ids => {
                                setPlanIds(lockedPlanId ? Array.from(new Set([lockedPlanId, ...ids])) : ids);
                            }}
                        />
                    </div>
                )}
                <div className="md:col-span-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">可多選；單次≤5檔</span>
                    <button
                        type="button"
                        onClick={handleCreateClick}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 cursor-pointer"
                    >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 建立套組
                    </button>
                </div>
            </div>
            {error && (
                <p className="text-sm text-red-700 font-bold flex items-start gap-1.5 whitespace-pre-wrap wrap-break-word">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
                </p>
            )}
            {resultMsg && <p className="text-sm text-green-700 font-bold">{resultMsg}</p>}
        </div>
    );
};

export default MaterialSetUploadPanel;
