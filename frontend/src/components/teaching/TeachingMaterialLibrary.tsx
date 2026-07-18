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
    fetchMaterialTypes, fetchPlanOptions, fetchDepartments, fetchSets, fetchFiles, fetchSetDetail,
    deleteSet, removeSetFile, downloadFile, batchDownloadFiles,
} from '../../api/teachingMaterials';
import type { MaterialType, MaterialSet, MaterialFileListItem, PlanOption, DepartmentOption } from '../../types/materials';
import type { User } from '../../types';
import { canDeleteOwnedResource } from '../../utils/authGuards';

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
    user: User;
    onBack?: () => void;
}

const TeachingMaterialLibrary = ({ user, onBack }: TeachingMaterialLibraryProps) => {
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
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);

    const [keyword, setKeyword] = useState('');
    const [materialTypeId, setMaterialTypeId] = useState('');
    const [fileFormat, setFileFormat] = useState('');
    const [deptFilter, setDeptFilter] = useState('');
    const [loading, setLoading] = useState(false);

    const [selected, setSelected] = useState<Map<number, SelectedEntry>>(new Map());
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
    const [selectingAll, setSelectingAll] = useState(false);

    const [uploadOpen, setUploadOpen] = useState(false);
    const [editingSetId, setEditingSetId] = useState<number | null>(null);
    const [editingSet, setEditingSet] = useState<MaterialSet | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page, size, keyword: keyword || undefined,
                material_type_id: materialTypeId || undefined,
                file_format: fileFormat || undefined,
                dept_id: deptFilter || undefined,
            };
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
    }, [view, page, size, keyword, materialTypeId, fileFormat, deptFilter]);

    useEffect(() => { fetchMaterialTypes().then(setTypes).catch(() => {}); }, []);
    useEffect(() => { fetchPlanOptions().then(setPlanOptions).catch(() => {}); }, []);
    useEffect(() => { fetchDepartments().then(setDepartments).catch(() => {}); }, []);
    useEffect(() => { fetchList(); }, [fetchList]);

    useEffect(() => {
        if (editingSetId == null) { setEditingSet(null); return; }
        fetchSetDetail(editingSetId).then(setEditingSet).catch(() => setEditingSet(null));
    }, [editingSetId]);

    const onSearch = () => { setPage(1); fetchList(); };
    const switchView = (v: ViewMode) => { setView(v); setPage(1); setSelected(new Map()); };

    const isSetSelected = (s: MaterialSet): boolean => {
        const files = s.files ?? [];
        return files.length > 0 && files.every(f => selected.has(f.id));
    };

    const mergeSetDetailIntoList = (detail: MaterialSet) => {
        setSetItems(prev => prev.map(row =>
            row.id === detail.id
                ? { ...row, files: detail.files, file_count: detail.file_count ?? row.file_count }
                : row,
        ));
    };

    const toggleFile = (fileId: number, entry: SelectedEntry) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(fileId)) next.delete(fileId); else next.set(fileId, entry);
            return next;
        });
    };

    /** 套組檢視下勾選整列：需先取得該套組使用中檔案清單，並寫回列表以便勾選狀態可顯示。 */
    const toggleSet = async (s: MaterialSet) => {
        const detail = (s.files && s.files.length > 0) ? s : await fetchSetDetail(s.id);
        if (!s.files?.length) mergeSetDetailIntoList(detail);
        const fileIds = (detail.files ?? []).map(f => f.id);
        if (fileIds.length === 0) return;
        const allSelected = fileIds.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Map(prev);
            (detail.files ?? []).forEach(f => {
                if (allSelected) next.delete(f.id);
                else next.set(f.id, { original_filename: f.original_filename, set_title: detail.title });
            });
            return next;
        });
    };

    const pageFileIdsSelected = (): boolean => {
        if (view === 'file') {
            return fileItems.length > 0 && fileItems.every(f => selected.has(f.id));
        }
        return setItems.length > 0 && setItems.every(s => isSetSelected(s));
    };

    /** 全選／取消全選「目前頁」的檔案（套組檢視＝該頁各套組內全部使用中檔）。 */
    const toggleSelectAllCurrentPage = async () => {
        if (view === 'file') {
            const allOn = fileItems.length > 0 && fileItems.every(f => selected.has(f.id));
            setSelected(prev => {
                const next = new Map(prev);
                fileItems.forEach(f => {
                    if (allOn) next.delete(f.id);
                    else next.set(f.id, { original_filename: f.original_filename, set_title: f.set_title });
                });
                return next;
            });
            return;
        }

        setSelectingAll(true);
        try {
            const details = await Promise.all(
                setItems.map(s => (s.files && s.files.length > 0 ? Promise.resolve(s) : fetchSetDetail(s.id))),
            );
            setSetItems(prev => prev.map(row => {
                const d = details.find(x => x.id === row.id);
                return d?.files ? { ...row, files: d.files, file_count: d.file_count ?? row.file_count } : row;
            }));
            const allOn = details.every(d => {
                const files = d.files ?? [];
                return files.length > 0 && files.every(f => selected.has(f.id));
            });
            setSelected(prev => {
                const next = new Map(prev);
                details.forEach(d => {
                    (d.files ?? []).forEach(f => {
                        if (allOn) next.delete(f.id);
                        else next.set(f.id, { original_filename: f.original_filename, set_title: d.title });
                    });
                });
                return next;
            });
        } finally {
            setSelectingAll(false);
        }
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

    const [pendingRemoveFile, setPendingRemoveFile] = useState<{ setId: number; fileId: number; filename: string } | null>(null);
    const [removingFile, setRemovingFile] = useState(false);

    const confirmRemoveFile = async () => {
        if (!pendingRemoveFile) return;
        setRemovingFile(true);
        try {
            await removeSetFile(pendingRemoveFile.setId, pendingRemoveFile.fileId);
            setPendingRemoveFile(null);
            fetchList();
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '移除失敗');
        } finally {
            setRemovingFile(false);
        }
    };

    const refreshAfterEdit = () => {
        fetchList();
        if (editingSetId != null) fetchSetDetail(editingSetId).then(setEditingSet).catch(() => {});
    };

    /** 編輯中（或新增面板開啟）時，鎖定所有列的編輯／刪除操作；下載/預覽不受影響。取消編輯後自動恢復。 */
    const rowActionsLocked = editingSetId != null || uploadOpen;

    const setColumns: DataTableColumn<MaterialSet>[] = [
        {
            key: 'select',
            header: (
                <button
                    type="button"
                    onClick={() => void toggleSelectAllCurrentPage()}
                    disabled={selectingAll || setItems.length === 0}
                    className="text-indigo-600 cursor-pointer disabled:opacity-40"
                    title={pageFileIdsSelected() ? '取消全選本頁' : '全選本頁'}
                >
                    {pageFileIdsSelected()
                        ? <CheckSquare className="w-5 h-5" />
                        : <Square className="w-5 h-5 text-gray-300" />}
                </button>
            ),
            width: 40,
            render: s => {
                const checked = isSetSelected(s);
                return (
                    <button
                        type="button"
                        onClick={() => void toggleSet(s)}
                        className={`p-1 rounded cursor-pointer ${checked ? 'bg-indigo-100 text-indigo-700' : 'text-indigo-600'}`}
                        title={checked ? '取消勾選' : '勾選此套組全部檔案'}
                    >
                        {checked
                            ? <CheckSquare className="w-5 h-5" />
                            : <Square className="w-5 h-5 text-gray-300" />}
                    </button>
                );
            },
        },
        {
            key: 'title', header: '標題',
            render: s => {
                const checked = isSetSelected(s);
                return (
                    <div className={checked ? 'pl-2 border-l-4 border-indigo-500' : ''}>
                        <div className={`text-sm font-bold truncate max-w-[280px] ${checked ? 'text-indigo-900' : 'text-gray-800'}`}>{s.title}</div>
                        {s.description && <div className="text-xs text-gray-400 truncate max-w-[280px]">{s.description}</div>}
                        {parseTags(s.tags).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {parseTags(s.tags).map(tag => (
                                    <span key={tag} className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${tagColorClass(tag)}`}>{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>
                );
            },
        },
        { key: 'type', header: '類型', render: s => <span className="text-sm text-gray-600">{types.find(t => t.id === s.material_type_id)?.name || '-'}</span> },
        {
            key: 'plans', header: '計畫',
            render: s => s.plan_titles.length > 0
                ? <span className="text-sm text-gray-600">{s.plan_titles.join('、')}</span>
                : <span className="text-sm text-gray-400">通用</span>,
        },
        { key: 'file_count', header: '檔案數', render: s => <span className="text-sm text-gray-600">{s.file_count}</span> },
        { key: 'dept', header: '開課單位', render: s => <span className="text-sm text-gray-600">{s.dept_name || '-'}</span> },
        {
            key: 'actions', header: '操作',
            render: s => (
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => {
                            if (rowActionsLocked) return;
                            setUploadOpen(false);
                            setEditingSetId(s.id);
                        }}
                        disabled={rowActionsLocked}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={rowActionsLocked ? '請先取消目前的編輯／新增再操作' : '編輯'}
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDeleteSet(s)}
                        disabled={rowActionsLocked || !canDeleteOwnedResource(user, s.dept_id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        title={rowActionsLocked ? '請先取消目前的編輯／新增再操作' : canDeleteOwnedResource(user, s.dept_id) ? '停用' : '僅開課單位可刪除'}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    const fileColumns: DataTableColumn<MaterialFileListItem>[] = [
        {
            key: 'select',
            header: (
                <button
                    type="button"
                    onClick={() => void toggleSelectAllCurrentPage()}
                    disabled={fileItems.length === 0}
                    className="text-indigo-600 cursor-pointer disabled:opacity-40"
                    title={pageFileIdsSelected() ? '取消全選本頁' : '全選本頁'}
                >
                    {pageFileIdsSelected()
                        ? <CheckSquare className="w-5 h-5" />
                        : <Square className="w-5 h-5 text-gray-300" />}
                </button>
            ),
            width: 40,
            render: f => {
                const checked = selected.has(f.id);
                return (
                    <button
                        type="button"
                        onClick={() => toggleFile(f.id, { original_filename: f.original_filename, set_title: f.set_title })}
                        className={`p-1 rounded cursor-pointer ${checked ? 'bg-indigo-100 text-indigo-700' : 'text-indigo-600'}`}
                    >
                        {checked
                            ? <CheckSquare className="w-5 h-5" />
                            : <Square className="w-5 h-5 text-gray-300" />}
                    </button>
                );
            },
        },
        {
            key: 'filename', header: '檔名 / 所屬套組',
            render: f => {
                const checked = selected.has(f.id);
                return (
                    <div className={checked ? 'pl-2 border-l-4 border-indigo-500' : ''}>
                        <div className={`text-sm font-bold truncate max-w-[280px] ${checked ? 'text-indigo-900' : 'text-gray-800'}`}>{f.original_filename}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[280px]">{f.set_title}</div>
                    </div>
                );
            },
        },
        {
            key: 'plans', header: '計畫',
            render: f => f.plan_titles.length > 0
                ? <span className="text-sm text-gray-600">{f.plan_titles.join('、')}</span>
                : <span className="text-sm text-gray-400">通用</span>,
        },
        { key: 'size', header: '大小', render: f => <span className="text-sm text-gray-600">{fmtSize(f.file_size_bytes)}</span> },
        { key: 'dept', header: '開課單位', render: f => <span className="text-sm text-gray-600">{f.dept_name || '-'}</span> },
        {
            key: 'actions', header: '操作',
            render: f => (
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => {
                            if (rowActionsLocked) return;
                            setUploadOpen(false);
                            setEditingSetId(f.set_id);
                        }}
                        disabled={rowActionsLocked}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={rowActionsLocked ? '請先取消目前的編輯／新增再操作' : '編輯所屬套組'}
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => doSingleDownload(f.id, f.original_filename)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer" title="下載">
                        <Download className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setPendingRemoveFile({ setId: f.set_id, fileId: f.id, filename: f.original_filename })}
                        disabled={rowActionsLocked || !canDeleteOwnedResource(user, f.dept_id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        title={rowActionsLocked ? '請先取消目前的編輯／新增再操作' : canDeleteOwnedResource(user, f.dept_id) ? '刪除' : '僅開課單位可刪除'}
                    >
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
                        <button type="button" onClick={onBack} className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-50 cursor-pointer">
                            <PenTool className="w-4 h-4" /> 返回考卷工坊
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setEditingSetId(null);
                            setUploadOpen(o => !o);
                        }}
                        disabled={editingSetId != null}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed cursor-pointer"
                        title={editingSetId != null ? '請先關閉編輯面板再新增' : undefined}
                    >
                        <Upload className="w-4 h-4" /> {uploadOpen ? '關閉新增' : '新增教材套組'}
                    </button>
                </div>
            </header>

            {uploadOpen && (
                <MaterialSetUploadPanel
                    types={types} allowedExts={allowedExts} materialAccept={materialAccept}
                    departments={departments} planOptions={planOptions}
                    planLayout="grid"
                    onClose={() => setUploadOpen(false)}
                    onCreated={() => { setUploadOpen(false); setPage(1); fetchList(); }}
                    requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                    endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError} isCancel={nas.isCancel}
                />
            )}

            {editingSet && !uploadOpen && (
                <MaterialSetEditPanel
                    set={editingSet} types={types} allowedExts={allowedExts} materialAccept={materialAccept}
                    departments={departments} user={user} planOptions={planOptions}
                    planLayout="grid"
                    onUpdated={refreshAfterEdit} onClose={() => setEditingSetId(null)}
                    requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                    endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError}
                    closeTransfer={nas.closeTransfer} isCancel={nas.isCancel}
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
                <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }} className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">全部開課單位</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button type="button" onClick={onSearch} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer">搜尋</button>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-gray-500">
                    共 {total} 筆{selected.size > 0 ? `；已選 ${selected.size} 個檔案` : ''}
                    {selectingAll ? '（全選處理中…）' : ''}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={selectingAll || (view === 'set' ? setItems.length === 0 : fileItems.length === 0)}
                        onClick={() => void toggleSelectAllCurrentPage()}
                        className="px-3 py-2 text-sm font-bold rounded-lg border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {pageFileIdsSelected() ? '取消全選本頁' : '全選本頁'}
                    </button>
                    <button type="button" disabled={selected.size === 0} onClick={() => setBatchConfirmOpen(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer">
                        <PackageOpen className="w-4 h-4" /> 批次下載
                    </button>
                </div>
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

            {pendingRemoveFile && (
                <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-4 border-b border-red-100 bg-red-50">
                            <h3 className="font-black text-gray-900">確認移除檔案</h3>
                        </div>
                        <div className="px-5 py-4 text-sm text-gray-800 space-y-2">
                            <p>確定要從套組移除下列檔案嗎？</p>
                            <p className="font-bold text-gray-900 wrap-break-word">「{pendingRemoveFile.filename}」</p>
                            <p className="text-gray-600">此為軟刪除：列表不再顯示，NAS 實體檔仍保留。</p>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2">
                            <button
                                type="button"
                                disabled={removingFile}
                                onClick={() => void confirmRemoveFile()}
                                className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:bg-red-300 cursor-pointer"
                            >
                                {removingFile ? '移除中…' : '確定移除'}
                            </button>
                            <button
                                type="button"
                                disabled={removingFile}
                                onClick={() => setPendingRemoveFile(null)}
                                className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer"
                            >
                                取消
                            </button>
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
