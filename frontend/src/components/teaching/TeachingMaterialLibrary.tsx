import { useState, useEffect, useCallback, useRef } from 'react';
import { Library, Search, Download, Trash2, Loader2, CheckSquare, Square, ChevronLeft, ChevronRight, PackageOpen } from 'lucide-react';
import axios, { AxiosError, type AxiosProgressEvent } from 'axios';
import api from '../../api';
import NasLoginModal from './NasLoginModal';
import FileTransferModal from './FileTransferModal';
import { saveBlob, idleTransfer, type TransferState } from './transfer';

interface MaterialType {
    id: number;
    name: string;
    slug: string;
}

interface Material {
    id: number;
    plan_id: number;
    title: string;
    material_type_id: number;
    original_filename: string;
    file_format: string;
    file_size_bytes: number;
    year: string;
    uploaded_at: string;
}

interface MaterialList {
    items: Material[];
    total: number;
    page: number;
    size: number;
    total_pages: number;
}

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

const TeachingMaterialLibrary = () => {
    const [items, setItems] = useState<Material[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const size = 20;
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
            setTotalPages(res.data.total_pages || 1);
        } catch (err) {
            console.error('載入教材庫失敗', err);
        } finally {
            setLoading(false);
        }
    }, [page, keyword, materialTypeId, fileFormat]);

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
        setTransfer(s => (s.open ? { ...s, progress: e.total ? Math.round((e.loaded / e.total) * 100) : s.progress } : s));
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
        } catch (err) {
            if (isCancel(err)) return;
            const e2 = err as AxiosError;
            setTransfer(s => ({ ...s, status: 'error', error: e2.response?.status === 503 ? 'NAS 無法連線' : '批次下載失敗' }));
        } finally { abortRef.current = null; }
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

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <header className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Library className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-gray-900">教材庫</h1>
                    <p className="text-gray-500 font-medium text-sm">跨計畫搜尋、勾選與批次下載教材（下載前須 NAS 登入）</p>
                </div>
            </header>

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

            {/* 列表 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="py-16 flex justify-center text-gray-400"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
                ) : items.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">查無教材</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-200 text-left text-xs font-bold text-gray-600">
                                <th className="py-3 px-3 w-10"></th>
                                <th className="py-3 px-3">標題 / 原檔名</th>
                                <th className="py-3 px-3">類型</th>
                                <th className="py-3 px-3">計畫</th>
                                <th className="py-3 px-3">大小</th>
                                <th className="py-3 px-3">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(m => (
                                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-2.5 px-3">
                                        <button type="button" onClick={() => toggle(m)} className="text-indigo-600 cursor-pointer">
                                            {selected.has(m.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                                        </button>
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <div className="text-sm font-bold text-gray-800 truncate max-w-[280px]">{m.title}</div>
                                        <div className="text-xs text-gray-400 truncate max-w-[280px]">{m.original_filename}</div>
                                    </td>
                                    <td className="py-2.5 px-3 text-sm text-gray-600">{types.find(t => t.id === m.material_type_id)?.name || '-'}</td>
                                    <td className="py-2.5 px-3 text-sm text-gray-600">#{m.plan_id}</td>
                                    <td className="py-2.5 px-3 text-sm text-gray-600">{fmtSize(m.file_size_bytes)}</td>
                                    <td className="py-2.5 px-3">
                                        <div className="flex items-center gap-1">
                                            <button type="button" onClick={() => requireNas('下載教材', token => doSingleDownload(token, m))} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer" title="下載">
                                                <Download className="w-4 h-4" />
                                            </button>
                                            <button type="button" onClick={() => handleDelete(m)} className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer" title="停用">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 分頁 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                    <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="text-sm text-gray-600">第 {page} / {totalPages} 頁</span>
                    <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
                </div>
            )}

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

            <NasLoginModal open={nasOpen} purpose={nasPurpose} onClose={() => setNasOpen(false)} onSuccess={onNasSuccess} />
            <FileTransferModal transfer={transfer} onCancel={cancelTransfer} onClose={closeTransfer} />
        </div>
    );
};

export default TeachingMaterialLibrary;
