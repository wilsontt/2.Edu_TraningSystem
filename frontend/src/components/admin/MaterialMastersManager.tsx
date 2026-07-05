/**
 * 教材主檔維護：教材類型 + 允許檔案格式（20260704 PLAN）。
 * 列表使用 @shared-ui/data-table（PaginatedDataTable，client 分頁）。
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AxiosError } from 'axios';
import {
    BookMarked, Check, FileType2, Loader2, Pencil, Plus, Trash2, X,
} from 'lucide-react';
import { PaginatedDataTable, type DataTableColumn } from '@shared-ui/data-table';
import api from '../../api';

interface MaterialType {
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    max_file_bytes: number | null;
    is_active: boolean;
}

interface MaterialFileFormat {
    id: number;
    ext: string;
    label: string;
    sort_order: number;
    max_file_bytes: number | null;
    is_active: boolean;
    mime_types?: string | null;
}

type TabId = 'types' | 'formats';

const bytesToMb = (n: number | null): string => {
    if (n == null) return '';
    return String(Math.round(n / 1048576 * 100) / 100);
};

const mbToBytes = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 1048576);
};

const errDetail = (err: unknown): string => {
    if (err instanceof AxiosError && err.response?.data?.detail) {
        const d = err.response.data.detail;
        return typeof d === 'string' ? d : JSON.stringify(d);
    }
    return '操作失敗';
};

const inputCls =
    'px-2 py-1.5 border-2 border-indigo-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500 w-full min-w-0';
const btnIcon =
    'p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 cursor-pointer transition-colors';
const btnDanger =
    'p-1.5 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer transition-colors';

const StatusBadge = ({ active }: { active: boolean }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
        {active ? '啟用' : '停用'}
    </span>
);

const MaterialMastersManager = () => {
    const [tab, setTab] = useState<TabId>('types');
    const [types, setTypes] = useState<MaterialType[]>([]);
    const [formats, setFormats] = useState<MaterialFileFormat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    // 類型表單
    const [addingType, setAddingType] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');
    const [newTypeSlug, setNewTypeSlug] = useState('');
    const [newTypeOrder, setNewTypeOrder] = useState('0');
    const [newTypeMb, setNewTypeMb] = useState('');
    const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
    const [editTypeName, setEditTypeName] = useState('');
    const [editTypeSlug, setEditTypeSlug] = useState('');
    const [editTypeOrder, setEditTypeOrder] = useState('');
    const [editTypeMb, setEditTypeMb] = useState('');
    const [editTypeActive, setEditTypeActive] = useState(true);

    // 格式表單
    const [addingFormat, setAddingFormat] = useState(false);
    const [newFmtExt, setNewFmtExt] = useState('');
    const [newFmtLabel, setNewFmtLabel] = useState('');
    const [newFmtOrder, setNewFmtOrder] = useState('0');
    const [newFmtMb, setNewFmtMb] = useState('');
    const [editingFormatId, setEditingFormatId] = useState<number | null>(null);
    const [editFmtExt, setEditFmtExt] = useState('');
    const [editFmtLabel, setEditFmtLabel] = useState('');
    const [editFmtOrder, setEditFmtOrder] = useState('');
    const [editFmtMb, setEditFmtMb] = useState('');
    const [editFmtActive, setEditFmtActive] = useState(true);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [tRes, fRes] = await Promise.all([
                api.get<MaterialType[]>('/admin/teaching-materials/material-types', {
                    params: { include_inactive: true },
                }),
                api.get<MaterialFileFormat[]>('/admin/teaching-materials/material-file-formats', {
                    params: { include_inactive: true },
                }),
            ]);
            setTypes(tRes.data);
            setFormats(fRes.data);
        } catch (err: unknown) {
            setError(errDetail(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const flash = (text: string) => {
        setMsg(text);
        setTimeout(() => setMsg(null), 3000);
    };

    // —— 教材類型 ——
    const resetNewType = () => {
        setAddingType(false);
        setNewTypeName('');
        setNewTypeSlug('');
        setNewTypeOrder('0');
        setNewTypeMb('');
    };

    const handleAddType = async () => {
        if (!newTypeName.trim() || !newTypeSlug.trim()) {
            setError('名稱與 slug 為必填');
            return;
        }
        try {
            await api.post('/admin/teaching-materials/material-types', {
                name: newTypeName.trim(),
                slug: newTypeSlug.trim(),
                sort_order: Number(newTypeOrder) || 0,
                max_file_bytes: mbToBytes(newTypeMb),
                is_active: true,
            });
            resetNewType();
            flash('已新增教材類型');
            await loadAll();
        } catch (err: unknown) {
            setError(errDetail(err));
        }
    };

    const startEditType = (t: MaterialType) => {
        setEditingTypeId(t.id);
        setEditTypeName(t.name);
        setEditTypeSlug(t.slug);
        setEditTypeOrder(String(t.sort_order));
        setEditTypeMb(bytesToMb(t.max_file_bytes));
        setEditTypeActive(t.is_active);
        setError(null);
    };

    const handleUpdateType = async (id: number) => {
        try {
            await api.put(`/admin/teaching-materials/material-types/${id}`, {
                name: editTypeName.trim(),
                slug: editTypeSlug.trim(),
                sort_order: Number(editTypeOrder) || 0,
                max_file_bytes: mbToBytes(editTypeMb),
                is_active: editTypeActive,
            });
            setEditingTypeId(null);
            flash('已更新教材類型');
            await loadAll();
        } catch (err: unknown) {
            setError(errDetail(err));
        }
    };

    const handleDeleteType = async (t: MaterialType) => {
        if (!window.confirm(`確定刪除類型「${t.name}」？若已有教材引用將改為停用。`)) return;
        try {
            const res = await api.delete<{ message: string; disabled?: boolean }>(
                `/admin/teaching-materials/material-types/${t.id}`,
            );
            flash(res.data.disabled ? '類型已有引用，已改為停用' : '已刪除');
            await loadAll();
        } catch (err: unknown) {
            setError(errDetail(err));
        }
    };

    // —— 允許格式 ——
    const resetNewFormat = () => {
        setAddingFormat(false);
        setNewFmtExt('');
        setNewFmtLabel('');
        setNewFmtOrder('0');
        setNewFmtMb('');
    };

    const handleAddFormat = async () => {
        if (!newFmtExt.trim() || !newFmtLabel.trim()) {
            setError('副檔名與顯示名稱為必填');
            return;
        }
        try {
            await api.post('/admin/teaching-materials/material-file-formats', {
                ext: newFmtExt.trim(),
                label: newFmtLabel.trim(),
                sort_order: Number(newFmtOrder) || 0,
                max_file_bytes: mbToBytes(newFmtMb),
                is_active: true,
            });
            resetNewFormat();
            flash('已新增允許格式');
            await loadAll();
        } catch (err: unknown) {
            setError(errDetail(err));
        }
    };

    const startEditFormat = (f: MaterialFileFormat) => {
        setEditingFormatId(f.id);
        setEditFmtExt(f.ext);
        setEditFmtLabel(f.label);
        setEditFmtOrder(String(f.sort_order));
        setEditFmtMb(bytesToMb(f.max_file_bytes));
        setEditFmtActive(f.is_active);
        setError(null);
    };

    const handleUpdateFormat = async (id: number) => {
        try {
            await api.put(`/admin/teaching-materials/material-file-formats/${id}`, {
                ext: editFmtExt.trim(),
                label: editFmtLabel.trim(),
                sort_order: Number(editFmtOrder) || 0,
                max_file_bytes: mbToBytes(editFmtMb),
                is_active: editFmtActive,
            });
            setEditingFormatId(null);
            flash('已更新允許格式');
            await loadAll();
        } catch (err: unknown) {
            setError(errDetail(err));
        }
    };

    const handleDeleteFormat = async (f: MaterialFileFormat) => {
        if (!window.confirm(`確定刪除格式「.${f.ext}」？若已有教材引用將改為停用。`)) return;
        try {
            const res = await api.delete<{ message: string; disabled?: boolean }>(
                `/admin/teaching-materials/material-file-formats/${f.id}`,
            );
            flash(res.data.disabled ? '格式已有引用，已改為停用' : '已刪除');
            await loadAll();
        } catch (err: unknown) {
            setError(errDetail(err));
        }
    };

    const typeColumns: DataTableColumn<MaterialType>[] = [
        {
            key: 'name',
            header: '名稱',
            render: t => editingTypeId === t.id ? (
                <input className={inputCls} value={editTypeName} onChange={e => setEditTypeName(e.target.value)} />
            ) : (
                <span className="text-sm font-bold text-gray-800">{t.name}</span>
            ),
        },
        {
            key: 'slug',
            header: 'slug',
            render: t => editingTypeId === t.id ? (
                <input className={inputCls} value={editTypeSlug} onChange={e => setEditTypeSlug(e.target.value)} title="已引用時不可改" />
            ) : (
                <span className="text-xs font-mono text-gray-600">{t.slug}</span>
            ),
        },
        {
            key: 'sort_order',
            header: '排序',
            width: 90,
            render: t => editingTypeId === t.id ? (
                <input className={inputCls} value={editTypeOrder} onChange={e => setEditTypeOrder(e.target.value)} />
            ) : (
                <span className="text-sm text-gray-600">{t.sort_order}</span>
            ),
        },
        {
            key: 'max_file_bytes',
            header: '上限 (MB)',
            width: 110,
            render: t => editingTypeId === t.id ? (
                <input className={inputCls} value={editTypeMb} onChange={e => setEditTypeMb(e.target.value)} placeholder="可空" />
            ) : (
                <span className="text-sm text-gray-600">{t.max_file_bytes != null ? bytesToMb(t.max_file_bytes) : '—'}</span>
            ),
        },
        {
            key: 'is_active',
            header: '狀態',
            width: 100,
            render: t => editingTypeId === t.id ? (
                <label className="flex items-center gap-1 text-xs font-bold cursor-pointer">
                    <input type="checkbox" checked={editTypeActive} onChange={e => setEditTypeActive(e.target.checked)} />
                    啟用
                </label>
            ) : (
                <StatusBadge active={t.is_active} />
            ),
        },
        {
            key: 'actions',
            header: '操作',
            width: 100,
            render: t => editingTypeId === t.id ? (
                <div className="flex gap-1">
                    <button type="button" className={btnIcon} onClick={() => void handleUpdateType(t.id)} title="儲存"><Check className="w-4 h-4" /></button>
                    <button type="button" className={btnIcon} onClick={() => setEditingTypeId(null)} title="取消"><X className="w-4 h-4" /></button>
                </div>
            ) : (
                <div className="flex gap-1">
                    <button type="button" className={btnIcon} onClick={() => startEditType(t)} title="編輯"><Pencil className="w-4 h-4" /></button>
                    <button type="button" className={btnDanger} onClick={() => void handleDeleteType(t)} title="刪除"><Trash2 className="w-4 h-4" /></button>
                </div>
            ),
        },
    ];

    const formatColumns: DataTableColumn<MaterialFileFormat>[] = [
        {
            key: 'ext',
            header: '副檔名',
            render: f => editingFormatId === f.id ? (
                <input className={inputCls} value={editFmtExt} onChange={e => setEditFmtExt(e.target.value)} title="已引用時不可改" />
            ) : (
                <span className="text-sm font-mono font-bold text-indigo-700">.{f.ext}</span>
            ),
        },
        {
            key: 'label',
            header: '顯示名稱',
            render: f => editingFormatId === f.id ? (
                <input className={inputCls} value={editFmtLabel} onChange={e => setEditFmtLabel(e.target.value)} />
            ) : (
                <span className="text-sm font-bold text-gray-800">{f.label}</span>
            ),
        },
        {
            key: 'sort_order',
            header: '排序',
            width: 90,
            render: f => editingFormatId === f.id ? (
                <input className={inputCls} value={editFmtOrder} onChange={e => setEditFmtOrder(e.target.value)} />
            ) : (
                <span className="text-sm text-gray-600">{f.sort_order}</span>
            ),
        },
        {
            key: 'max_file_bytes',
            header: '上限 (MB)',
            width: 110,
            render: f => editingFormatId === f.id ? (
                <input className={inputCls} value={editFmtMb} onChange={e => setEditFmtMb(e.target.value)} placeholder="可空" />
            ) : (
                <span className="text-sm text-gray-600">{f.max_file_bytes != null ? bytesToMb(f.max_file_bytes) : '—'}</span>
            ),
        },
        {
            key: 'is_active',
            header: '狀態',
            width: 100,
            render: f => editingFormatId === f.id ? (
                <label className="flex items-center gap-1 text-xs font-bold cursor-pointer">
                    <input type="checkbox" checked={editFmtActive} onChange={e => setEditFmtActive(e.target.checked)} />
                    啟用
                </label>
            ) : (
                <StatusBadge active={f.is_active} />
            ),
        },
        {
            key: 'actions',
            header: '操作',
            width: 100,
            render: f => editingFormatId === f.id ? (
                <div className="flex gap-1">
                    <button type="button" className={btnIcon} onClick={() => void handleUpdateFormat(f.id)} title="儲存"><Check className="w-4 h-4" /></button>
                    <button type="button" className={btnIcon} onClick={() => setEditingFormatId(null)} title="取消"><X className="w-4 h-4" /></button>
                </div>
            ) : (
                <div className="flex gap-1">
                    <button type="button" className={btnIcon} onClick={() => startEditFormat(f)} title="編輯"><Pencil className="w-4 h-4" /></button>
                    <button type="button" className={btnDanger} onClick={() => void handleDeleteFormat(f)} title="刪除"><Trash2 className="w-4 h-4" /></button>
                </div>
            ),
        },
    ];

    const tableShell = (children: ReactNode) => (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-4">
            {children}
        </div>
    );

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                    <BookMarked className="w-7 h-7 text-indigo-600" />
                    教材主檔
                </h1>
                <p className="text-sm text-gray-500 font-bold mt-1">
                    維護教材類型與允許上傳副檔名；變更後上傳區會依 API 動態載入，無需改程式。
                </p>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 font-bold">
                    已有教材引用時，不可修改類型 slug 或格式副檔名；刪除將改為停用。
                </p>
            </div>

            {error && (
                <div className="mb-4 px-4 py-3 bg-red-50 border-2 border-red-200 text-red-700 rounded-xl text-sm font-bold">
                    {error}
                    <button type="button" className="ml-2 underline cursor-pointer" onClick={() => setError(null)}>關閉</button>
                </div>
            )}
            {msg && (
                <div className="mb-4 px-4 py-3 bg-green-50 border-2 border-green-200 text-green-700 rounded-xl text-sm font-bold">
                    {msg}
                </div>
            )}

            <div className="flex gap-2 mb-6">
                <button
                    type="button"
                    onClick={() => setTab('types')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                        tab === 'types'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-white border-2 border-indigo-100 text-gray-600 hover:bg-indigo-50'
                    }`}
                >
                    <BookMarked className="w-4 h-4" />
                    教材類型
                </button>
                <button
                    type="button"
                    onClick={() => setTab('formats')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                        tab === 'formats'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-white border-2 border-indigo-100 text-gray-600 hover:bg-indigo-50'
                    }`}
                >
                    <FileType2 className="w-4 h-4" />
                    允許檔案格式
                </button>
            </div>

            {tab === 'types' ? (
                <div>
                    <div className="flex justify-end mb-4">
                        <button
                            type="button"
                            onClick={() => { setAddingType(true); setError(null); }}
                            className="px-4 py-2 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 flex items-center gap-2 cursor-pointer shadow-md"
                        >
                            <Plus className="w-4 h-4" />
                            新增類型
                        </button>
                    </div>

                    {addingType && (
                        <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 rounded-2xl grid grid-cols-1 md:grid-cols-5 gap-2">
                            <input className={inputCls} placeholder="名稱 *" value={newTypeName}
                                onChange={e => {
                                    setNewTypeName(e.target.value);
                                    if (!newTypeSlug || newTypeSlug === newTypeName) setNewTypeSlug(e.target.value);
                                }} />
                            <input className={inputCls} placeholder="slug *（NAS 目錄）" value={newTypeSlug}
                                onChange={e => setNewTypeSlug(e.target.value)} />
                            <input className={inputCls} placeholder="排序" value={newTypeOrder}
                                onChange={e => setNewTypeOrder(e.target.value)} />
                            <input className={inputCls} placeholder="單檔上限 MB（可空）" value={newTypeMb}
                                onChange={e => setNewTypeMb(e.target.value)} />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => void handleAddType()}
                                    className="px-3 py-2 bg-green-600 text-white rounded-lg cursor-pointer"><Check className="w-5 h-5" /></button>
                                <button type="button" onClick={resetNewType}
                                    className="px-3 py-2 bg-gray-400 text-white rounded-lg cursor-pointer"><X className="w-5 h-5" /></button>
                            </div>
                        </div>
                    )}

                    {tableShell(
                        <PaginatedDataTable<MaterialType>
                            adapter="tailwind"
                            columns={typeColumns}
                            data={types}
                            loading={loading}
                            loadingText={<Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />}
                            emptyState={<div className="text-gray-400 font-bold">尚無教材類型</div>}
                            getRowKey={t => t.id}
                            paginationMode="client"
                            defaultPageSize={20}
                            pageSizeOptions={[10, 20, 50]}
                        />,
                    )}
                </div>
            ) : (
                <div>
                    <div className="flex justify-end mb-4">
                        <button
                            type="button"
                            onClick={() => { setAddingFormat(true); setError(null); }}
                            className="px-4 py-2 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 flex items-center gap-2 cursor-pointer shadow-md"
                        >
                            <Plus className="w-4 h-4" />
                            新增格式
                        </button>
                    </div>

                    {addingFormat && (
                        <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 rounded-2xl grid grid-cols-1 md:grid-cols-5 gap-2">
                            <input className={inputCls} placeholder="副檔名 *（如 mov）" value={newFmtExt}
                                onChange={e => setNewFmtExt(e.target.value)} />
                            <input className={inputCls} placeholder="顯示名稱 *" value={newFmtLabel}
                                onChange={e => setNewFmtLabel(e.target.value)} />
                            <input className={inputCls} placeholder="排序" value={newFmtOrder}
                                onChange={e => setNewFmtOrder(e.target.value)} />
                            <input className={inputCls} placeholder="單檔上限 MB（可空）" value={newFmtMb}
                                onChange={e => setNewFmtMb(e.target.value)} />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => void handleAddFormat()}
                                    className="px-3 py-2 bg-green-600 text-white rounded-lg cursor-pointer"><Check className="w-5 h-5" /></button>
                                <button type="button" onClick={resetNewFormat}
                                    className="px-3 py-2 bg-gray-400 text-white rounded-lg cursor-pointer"><X className="w-5 h-5" /></button>
                            </div>
                        </div>
                    )}

                    {tableShell(
                        <PaginatedDataTable<MaterialFileFormat>
                            adapter="tailwind"
                            columns={formatColumns}
                            data={formats}
                            loading={loading}
                            loadingText={<Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />}
                            emptyState={<div className="text-gray-400 font-bold">尚無允許格式（請執行遷移腳本植入種子）</div>}
                            getRowKey={f => f.id}
                            paginationMode="client"
                            defaultPageSize={20}
                            pageSizeOptions={[10, 20, 50]}
                        />,
                    )}
                </div>
            )}
        </div>
    );
};

export default MaterialMastersManager;
