import { useState, useEffect, useCallback } from 'react';
import { Library, Search, Download, Trash2, Loader2, CheckSquare, Square, PackageOpen, Upload, Pencil, PenTool, LayoutGrid, FileStack } from 'lucide-react';
import { type AxiosError } from 'axios';
import { PaginatedDataTable, type DataTableColumn } from '@shared-ui/data-table';
import NasLoginModal from './NasLoginModal';
import FileTransferModal from './FileTransferModal';
import { saveBlob, buildMaterialAccept } from './transfer';
import { useMaterialFileFormats } from '../../hooks/useMaterialFileFormats';
import { useNasTransfer } from '../../hooks/useNasTransfer';
import MaterialSetUploadPanel from './MaterialSetUploadPanel';
import MaterialSetEditPanel from './MaterialSetEditPanel';
import {
    fetchMaterialTypes, fetchPlanOptions, fetchSets, fetchFiles, fetchSetDetail,
    deleteSet, downloadFile, batchDownloadFiles,
} from '../../api/teachingMaterials';
import type { MaterialType, MaterialSet, MaterialFileListItem, PlanOption } from '../../types/materials';

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

type ViewMode = 'set' | 'file';
type SelectedEntry = { original_filename: string; set_title: string };

interface TeachingMaterialLibraryProps {
    onBack?: () => void;
}

const TeachingMaterialLibrary = ({ onBack }: TeachingMaterialLibraryProps = {}) => {
    const { allowedExts } = useMaterialFileFormats();
    const materialAccept = buildMaterialAccept(allowedExts);
    const nas = useNasTransfer();

    const [view, setView] = useState<ViewMode>('set');
    const [setItems, setSetItems] = useState<MaterialSet[]>([]);
    const [fileItems, setFileItems] = useState<MaterialFileListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const [types, setTypes] = useState<MaterialType[]>([]);
    const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);

    const [keyword, setKeyword] = useState('');
    const [materialTypeId, setMaterialTypeId] = useState('');
    const [fileFormat, setFileFormat] = useState('');
    const [loading, setLoading] = useState(false);

    const [selected, setSelected] = useState<Map<number, SelectedEntry>>(new Map());
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

    const [uploadOpen, setUploadOpen] = useState(false);
    const [editingSetId, setEditingSetId] = useState<number | null>(null);
    const [editingSet, setEditingSet] = useState<MaterialSet | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, size, keyword: keyword || undefined, material_type_id: materialTypeId || undefined, file_format: fileFormat || undefined };
            if (view === 'set') {
                const res = await fetchSets(params);
                setSetItems(res.items);
                setTotal(res.total);
            } else {
                const res = await fetchFiles(params);
                setFileItems(res.items);
                setTotal(res.total);
            }
        } catch (err) {
            console.error('載入教材庫失敗', err);
        } finally {
            setLoading(false);
        }
    }, [view, page, size, keyword, materialTypeId, fileFormat]);

    useEffect(() => { fetchMaterialTypes().then(setTypes).catch(() => {}); }, []);
    useEffect(() => { fetchPlanOptions().then(setPlanOptions).catch(() => {}); }, []);
    useEffect(() => { fetchList(); }, [fetchList]);

    useEffect(() => {
        if (editingSetId == null) { setEditingSet(null); return; }
        fetchSetDetail(editingSetId).then(setEditingSet).catch(() => setEditingSet(null));
    }, [editingSetId]);

    const onSearch = () => { setPage(1); fetchList(); };
    const switchView = (v: ViewMode) => { setView(v); setPage(1); setSelected(new Map()); };

    const toggleFile = (fileId: number, entry: SelectedEntry) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(fileId)) next.delete(fileId); else next.set(fileId, entry);
            return next;
        });
    };

    /** 套組檢視下勾選整列：需先取得該套組使用中檔案清單（一次性抓詳情）。 */
    const toggleSet = async (s: MaterialSet) => {
        const detail = s.files ? s : await fetchSetDetail(s.id);
        const fileIds = (detail.files ?? []).map(f => f.id);
        const allSelected = fileIds.length > 0 && fileIds.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Map(prev);
            (detail.files ?? []).forEach(f => {
                if (allSelected) next.delete(f.id);
                else next.set(f.id, { original_filename: f.original_filename, set_title: detail.title });
            });
            return next;
        });
    };

    const doSingleDownload = (fileId: number, filename: string) => {
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

    const doBatchDownload = () => {
        const fileIds = Array.from(selected.keys());
        nas.requireNas('批次下載', async token => {
            const signal = nas.beginTransfer(`批次下載 ${fileIds.length} 份`);
            try {
                const res = await batchDownloadFiles(fileIds, token, { signal, onDownloadProgress: nas.onProgress });
                const ts = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
                saveBlob(res.data as Blob, `teaching_materials_${ts}.zip`);
                nas.endTransferSuccess();
                setSelected(new Map());
            } catch (err) {
                if (nas.isCancel(err)) return;
                const e2 = err as AxiosError;
                nas.endTransferError(e2.response?.status === 503 ? 'NAS 無法連線' : '批次下載失敗');
            }
        });
    };

    const handleDeleteSet = async (s: MaterialSet) => {
        if (!confirm(`確定停用套組「${s.title}」？（軟刪除，實體檔保留）`)) return;
        try {
            await deleteSet(s.id);
            fetchList();
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '刪除失敗');
        }
    };

    const refreshAfterEdit = () => {
        fetchList();
        if (editingSetId != null) fetchSetDetail(editingSetId).then(setEditingSet).catch(() => {});
    };

    const setColumns: DataTableColumn<MaterialSet>[] = [
        {
            key: 'select', header: '', width: 40,
            render: s => (
                <button type="button" onClick={() => toggleSet(s)} className="text-indigo-600 cursor-pointer">
                    {(s.files ?? []).length > 0 && (s.files ?? []).every(f => selected.has(f.id))
                        ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                </button>
            ),
        },
        {
            key: 'title', header: '標題',
            render: s => (
                <>
                    <div className="text-sm font-bold text-gray-800 truncate max-w-[280px]">{s.title}</div>
                    {s.description && <div className="text-xs text-gray-400 truncate max-w-[280px]">{s.description}</div>}
                    {parseTags(s.tags).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                            {parseTags(s.tags).map(tag => (
                                <span key={tag} className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${tagColorClass(tag)}`}>{tag}</span>
                            ))}
                        </div>
                    )}
                </>
            ),
        },
        { key: 'type', header: '類型', render: s => <span className="text-sm text-gray-600">{types.find(t => t.id === s.material_type_id)?.name || '-'}</span> },
        {
            key: 'plans', header: '計畫',
            render: s => s.plan_titles.length > 0
                ? <span className="text-sm text-gray-600">{s.plan_titles.join('、')}</span>
                : <span className="text-sm text-gray-400">通用</span>,
        },
        { key: 'file_count', header: '檔案數', render: s => <span className="text-sm text-gray-600">{s.file_count}</span> },
        {
            key: 'actions', header: '操作',
            render: s => (
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditingSetId(s.id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded cursor-pointer" title="編輯">
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleDeleteSet(s)} className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer" title="停用">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    const fileColumns: DataTableColumn<MaterialFileListItem>[] = [
        {
            key: 'select', header: '', width: 40,
            render: f => (
                <button type="button" onClick={() => toggleFile(f.id, { original_filename: f.original_filename, set_title: f.set_title })} className="text-indigo-600 cursor-pointer">
                    {selected.has(f.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                </button>
            ),
        },
        {
            key: 'filename', header: '檔名 / 所屬套組',
            render: f => (
                <>
                    <div className="text-sm font-bold text-gray-800 truncate max-w-[280px]">{f.original_filename}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[280px]">{f.set_title}</div>
                </>
            ),
        },
        {
            key: 'plans', header: '計畫',
            render: f => f.plan_titles.length > 0
                ? <span className="text-sm text-gray-600">{f.plan_titles.join('、')}</span>
                : <span className="text-sm text-gray-400">通用</span>,
        },
        { key: 'size', header: '大小', render: f => <span className="text-sm text-gray-600">{fmtSize(f.file_size_bytes)}</span> },
        {
            key: 'actions', header: '操作',
            render: f => (
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditingSetId(f.set_id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded cursor-pointer" title="編輯所屬套組">
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => doSingleDownload(f.id, f.original_filename)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer" title="下載">
                        <Download className="w-4 h-4" />
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
                        <button type="button" onClick={onBack} className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-50 cursor-pointer">
                            <PenTool className="w-4 h-4" /> 返回考卷工坊
                        </button>
                    )}
                    <button type="button" onClick={() => setUploadOpen(o => !o)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer">
                        <Upload className="w-4 h-4" /> 新增教材套組
                    </button>
                </div>
            </header>

            {uploadOpen && (
                <MaterialSetUploadPanel
                    types={types} allowedExts={allowedExts} materialAccept={materialAccept} planOptions={planOptions}
                    onCreated={() => { setUploadOpen(false); setPage(1); fetchList(); }}
                    requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                    endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError} isCancel={nas.isCancel}
                />
            )}

            {editingSet && (
                <MaterialSetEditPanel
                    set={editingSet} types={types} allowedExts={allowedExts} materialAccept={materialAccept} planOptions={planOptions}
                    onUpdated={refreshAfterEdit} onClose={() => setEditingSetId(null)}
                    requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                    endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError} isCancel={nas.isCancel}
                />
            )}

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    <button type="button" onClick={() => switchView('set')}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-bold cursor-pointer ${view === 'set' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
                        <LayoutGrid className="w-3.5 h-3.5" /> 套組檢視
                    </button>
                    <button type="button" onClick={() => switchView('file')}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-bold cursor-pointer ${view === 'file' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
                        <FileStack className="w-3.5 h-3.5" /> 檔案檢視
                    </button>
                </div>
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="搜尋標題 / 檔名 / 標籤 / 訓練計畫名稱…"
                        className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSearch()} />
                </div>
                <select value={materialTypeId} onChange={e => { setMaterialTypeId(e.target.value); setPage(1); }} className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">全部類型</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={fileFormat} onChange={e => { setFileFormat(e.target.value); setPage(1); }} className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">全部格式</option>
                    {allowedExts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <button type="button" onClick={onSearch} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer">搜尋</button>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">共 {total} 筆{selected.size > 0 ? `；已選 ${selected.size} 個檔案` : ''}</span>
                <button type="button" disabled={selected.size === 0} onClick={() => setBatchConfirmOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer">
                    <PackageOpen className="w-4 h-4" /> 批次下載
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-4">
                {view === 'set' ? (
                    <PaginatedDataTable<MaterialSet>
                        adapter="tailwind" columns={setColumns} data={setItems} loading={loading}
                        loadingText={<Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />}
                        emptyState={<div className="text-gray-400">查無教材套組</div>}
                        getRowKey={s => s.id} paginationMode="server" totalItems={total} page={page} pageSize={size}
                        pageSizeOptions={[10, 20, 50, 100]} onPaginationChange={st => { setPage(st.page); setSize(st.pageSize); }}
                    />
                ) : (
                    <PaginatedDataTable<MaterialFileListItem>
                        adapter="tailwind" columns={fileColumns} data={fileItems} loading={loading}
                        loadingText={<Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />}
                        emptyState={<div className="text-gray-400">查無教材檔案</div>}
                        getRowKey={f => f.id} paginationMode="server" totalItems={total} page={page} pageSize={size}
                        pageSizeOptions={[10, 20, 50, 100]} onPaginationChange={st => { setPage(st.page); setSize(st.pageSize); }}
                    />
                )}
            </div>

            {batchConfirmOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-black text-gray-900">批次下載確認（{selected.size} 份）</h3></div>
                        <div className="px-5 py-4 overflow-y-auto">
                            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                                {Array.from(selected.values()).map((v, i) => <li key={i} className="truncate">{v.original_filename}（{v.set_title}）</li>)}
                            </ul>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                            <button type="button" onClick={() => setBatchConfirmOpen(false)} className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer">取消</button>
                            <button type="button" onClick={() => { setBatchConfirmOpen(false); doBatchDownload(); }} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 cursor-pointer">下載 ZIP</button>
                        </div>
                    </div>
                </div>
            )}

            <NasLoginModal open={nas.nasOpen} purpose={nas.nasPurpose} onClose={nas.closeNasModal} onSuccess={nas.onNasSuccess} />
            <FileTransferModal transfer={nas.transfer} onCancel={nas.cancelTransfer} onClose={nas.closeTransfer} />
        </div>
    );
};

export default TeachingMaterialLibrary;
