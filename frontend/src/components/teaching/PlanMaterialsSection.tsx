import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Trash2, Pencil } from 'lucide-react';
import { type AxiosError } from 'axios';
import NasLoginModal from './NasLoginModal';
import FileTransferModal from './FileTransferModal';
import { saveBlob, buildMaterialAccept } from './transfer';
import { useMaterialFileFormats } from '../../hooks/useMaterialFileFormats';
import { useNasTransfer } from '../../hooks/useNasTransfer';
import MaterialSetUploadPanel from './MaterialSetUploadPanel';
import MaterialSetEditPanel from './MaterialSetEditPanel';
import {
    fetchMaterialTypes, fetchPlanOptions, fetchSets, fetchSetDetail, deleteSet, downloadFile,
} from '../../api/teachingMaterials';
import type { MaterialType, MaterialSet, PlanOption } from '../../types/materials';

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

const TAG_PALETTE = [
    'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700',
    'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700',
];
const parseTags = (raw: string | null): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
};
const tagColorClass = (tag: string): string =>
    TAG_PALETTE[tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_PALETTE.length];

interface PlanMaterialsSectionProps {
    planId: number;
    archived?: boolean;
}

/** 訓練計畫編輯頁的教材區（Wave 2）：套組列表（該計畫綁定）、建立/編輯套組（鎖定本計畫）。 */
const PlanMaterialsSection = ({ planId, archived = false }: PlanMaterialsSectionProps) => {
    const { allowedExts } = useMaterialFileFormats();
    const materialAccept = buildMaterialAccept(allowedExts);
    const nas = useNasTransfer();

    const [types, setTypes] = useState<MaterialType[]>([]);
    const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
    const [sets, setSets] = useState<MaterialSet[]>([]);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [editingSetId, setEditingSetId] = useState<number | null>(null);
    const [editingSet, setEditingSet] = useState<MaterialSet | null>(null);

    /** 列表端點不含 files（見 Task 4 的 _set_to_out 未帶 include_files）；本頁需顯示套組內檔案清單，
     * 故取得清單後對每個 set 額外補一次詳情。計畫頁通常同時掛的套組數量不多，N+1 可接受。 */
    const fetchSetsForPlan = useCallback(async () => {
        try {
            const res = await fetchSets({ page: 1, size: 100, plan_id: planId });
            const withFiles = await Promise.all(res.items.map(s => fetchSetDetail(s.id)));
            setSets(withFiles);
        } catch (err) {
            console.error('載入教材失敗', err);
        }
    }, [planId]);

    useEffect(() => { fetchMaterialTypes().then(setTypes).catch(() => {}); }, []);
    useEffect(() => { fetchPlanOptions().then(setPlanOptions).catch(() => {}); }, []);
    useEffect(() => { fetchSetsForPlan(); }, [fetchSetsForPlan]);

    useEffect(() => {
        if (editingSetId == null) { setEditingSet(null); return; }
        fetchSetDetail(editingSetId).then(setEditingSet).catch(() => setEditingSet(null));
    }, [editingSetId]);

    const refreshAfterEdit = () => {
        fetchSetsForPlan();
        if (editingSetId != null) fetchSetDetail(editingSetId).then(setEditingSet).catch(() => {});
    };

    const doDownload = (fileId: number, filename: string) => {
        nas.requireNas('下載教材', async token => {
            const signal = nas.beginTransfer(`下載 ${filename}`);
            try {
                const res = await downloadFile(fileId, token, { signal, onDownloadProgress: nas.onProgress });
                saveBlob(res.data as Blob, filename);
                nas.endTransferSuccess();
            } catch (err) {
                if (nas.isCancel(err)) return;
                const e2 = err as AxiosError;
                nas.endTransferError(e2.response?.status === 503 ? 'NAS 無法連線' : '下載失敗');
            }
        });
    };

    const handleDelete = async (s: MaterialSet) => {
        if (!confirm(`確定停用套組「${s.title}」？（軟刪除，實體檔保留）`)) return;
        try {
            await deleteSet(s.id);
            fetchSetsForPlan();
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '刪除失敗');
        }
    };

    return (
        <div className="space-y-3 pt-2">
            <label className="text-xs font-bold text-gray-500 uppercase">教材套組（上傳前須 NAS 登入）</label>

            {!archived && (
                uploadOpen ? (
                    <MaterialSetUploadPanel
                        types={types} allowedExts={allowedExts} materialAccept={materialAccept}
                        planOptions={planOptions} lockedPlanId={planId}
                        onCreated={() => { setUploadOpen(false); fetchSetsForPlan(); }}
                        requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                        endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError} isCancel={nas.isCancel}
                    />
                ) : (
                    <button type="button" onClick={() => setUploadOpen(true)}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer">
                        新增教材套組
                    </button>
                )
            )}

            {editingSet && (
                <MaterialSetEditPanel
                    set={editingSet} types={types} allowedExts={allowedExts} materialAccept={materialAccept}
                    planOptions={planOptions} lockedPlanId={planId}
                    onUpdated={refreshAfterEdit} onClose={() => setEditingSetId(null)}
                    requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                    endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError}
                    closeTransfer={nas.closeTransfer} isCancel={nas.isCancel}
                />
            )}

            <div className="border-2 border-gray-100 rounded-xl divide-y divide-gray-300 max-h-100 overflow-y-auto">
                {sets.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">尚無教材</p>
                ) : (
                    sets.map(s => (
                        <div key={s.id} className="px-3 py-2 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-sm text-gray-700 truncate flex flex-col min-w-0">
                                    <span className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                        <span className="font-bold text-gray-800 truncate">{s.title}</span>
                                        <span className="text-xs text-gray-400 shrink-0">（{s.file_count} 個檔案）</span>
                                    </span>
                                    {parseTags(s.tags).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-0.5 pl-6">
                                            {parseTags(s.tags).map(tag => (
                                                <span key={tag} className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${tagColorClass(tag)}`}>{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {!archived && (
                                        <button type="button" onClick={() => setEditingSetId(s.id)} className="p-1 text-gray-500 hover:bg-gray-100 rounded cursor-pointer" title="編輯">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                    )}
                                    {!archived && (
                                        <button type="button" onClick={() => handleDelete(s)} className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer" title="停用">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <ul className="pl-6 space-y-0.5">
                                {(s.files ?? []).map(f => (
                                    <li key={f.id} className="flex items-center justify-between gap-2 text-xs text-gray-500">
                                        <span className="truncate">{f.original_filename}（{fmtSize(f.file_size_bytes)}）</span>
                                        <button type="button" onClick={() => doDownload(f.id, f.original_filename)} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer shrink-0" title="下載">
                                            <Download className="w-3.5 h-3.5" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))
                )}
            </div>

            <NasLoginModal open={nas.nasOpen} purpose={nas.nasPurpose} onClose={nas.closeNasModal} onSuccess={nas.onNasSuccess} />
            <FileTransferModal transfer={nas.transfer} onCancel={nas.cancelTransfer} onClose={nas.closeTransfer} />
        </div>
    );
};

export default PlanMaterialsSection;
