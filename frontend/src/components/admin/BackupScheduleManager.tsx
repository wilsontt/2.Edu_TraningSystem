import { useState, useEffect, useCallback } from 'react';
import { HardDriveDownload, Loader2, Save, Play, CheckCircle2, XCircle, RefreshCw, Plug, Trash2 } from 'lucide-react';
import api from '../../api';
import { AxiosError } from 'axios';
import Pagination from '../common/Pagination';
import { parseBackendDateTime } from '../../utils/date';

interface BackupScheduleConfig {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    time_of_day: string;
    weekday: number | null;
    retention_count: number;
    destination: string | null;
    backup_nas_username: string | null;
    has_password: boolean;
    updated_at: string | null;
}

interface BackupRecord {
    id: number;
    filename: string | null;
    created_at: string;
    size_bytes: number | null;
    status: 'success' | 'failed';
    message: string | null;
    duration_ms: number | null;
}

interface BackupRecordList {
    items: BackupRecord[];
    total: number;
    page: number;
    size: number;
    total_pages: number;
}

interface ConnectionTestResult {
    ok: boolean;
    message: string;
}

interface BulkDeleteResult {
    deleted_count: number;
    missing_ids: number[];
    nas_deleted_count: number;
    nas_failed: string[];
}

const WEEKDAY_LABELS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

const fmtSize = (n: number | null) => {
    if (n == null) return '-';
    return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
};

/**
 * 排程備份設定（Wave 4；NAS PLAN §5.6）。
 * 僅備份資料庫本體（一致性備份）；教材／考卷實體檔存於 NAS，已由 NAS 端 3-2-1 備援機制保障。
 */
const BackupScheduleManager = () => {
    const [config, setConfig] = useState<BackupScheduleConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [runningNow, setRunningNow] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

    // 表單欄位（與 config 分離，避免每次輸入都打 API）
    const [enabled, setEnabled] = useState(false);
    const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
    const [timeOfDay, setTimeOfDay] = useState('02:00');
    const [weekday, setWeekday] = useState(0);
    const [retentionCount, setRetentionCount] = useState(7);
    const [destination, setDestination] = useState('');
    const [nasUsername, setNasUsername] = useState('');
    const [nasPassword, setNasPassword] = useState('');

    const [records, setRecords] = useState<BackupRecord[]>([]);
    const [recordsTotal, setRecordsTotal] = useState(0);
    const [recordsPage, setRecordsPage] = useState(1);
    const [recordsPageSize, setRecordsPageSize] = useState(10);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [deleteNasFiles, setDeleteNasFiles] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<BackupScheduleConfig>('/admin/backup/config');
            const c = res.data;
            setConfig(c);
            setEnabled(c.enabled);
            setFrequency(c.frequency);
            setTimeOfDay(c.time_of_day);
            setWeekday(c.weekday ?? 0);
            setRetentionCount(c.retention_count);
            setDestination(c.destination || '');
            setNasUsername(c.backup_nas_username || '');
            setNasPassword('');
        } catch (err) {
            console.error('載入排程設定失敗', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchRecords = useCallback(async () => {
        setRecordsLoading(true);
        try {
            const res = await api.get<BackupRecordList>('/admin/backup/records', {
                params: { page: recordsPage, size: recordsPageSize },
            });
            setRecords(res.data.items);
            setRecordsTotal(res.data.total);
            setSelectedIds(new Set());
        } catch (err) {
            console.error('載入備份紀錄失敗', err);
        } finally {
            setRecordsLoading(false);
        }
    }, [recordsPage, recordsPageSize]);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);
    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    const handleSave = async () => {
        setError(null);
        setSavedMsg(null);
        setTestMsg(null);
        setSaving(true);
        try {
            const res = await api.put<BackupScheduleConfig>('/admin/backup/config', {
                enabled,
                frequency,
                time_of_day: timeOfDay,
                weekday: frequency === 'weekly' ? weekday : null,
                retention_count: retentionCount,
                destination: destination || null,
                backup_nas_username: nasUsername || null,
                // 留空代表不更動既有密碼；輸入空字串無法表達「清除」，故僅在有輸入時才送出
                backup_nas_password: nasPassword ? nasPassword : undefined,
            });
            setConfig(res.data);
            setNasPassword('');
            setSavedMsg('設定已儲存');
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setError(e2.response?.data?.detail || '儲存失敗');
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        setError(null);
        setSavedMsg(null);
        setTestMsg(null);
        setTesting(true);
        try {
            const res = await api.post<ConnectionTestResult>('/admin/backup/test-connection', {
                destination,
                backup_nas_username: nasUsername || null,
                // 密碼留空則後端使用已存密碼
                backup_nas_password: nasPassword || null,
            });
            setTestMsg({ ok: res.data.ok, text: res.data.message });
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setTestMsg({ ok: false, text: e2.response?.data?.detail || '連線測試失敗' });
        } finally {
            setTesting(false);
        }
    };

    const handleRunNow = async () => {
        setError(null);
        setRunningNow(true);
        try {
            const res = await api.post<BackupRecord>('/admin/backup/run-now');
            if (res.data.status === 'failed') {
                setError(res.data.message || '備份失敗');
            }
            fetchRecords();
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setError(e2.response?.data?.detail || '立即備份失敗');
        } finally {
            setRunningNow(false);
        }
    };

    const toggleSelect = (id: number, checked: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const handleSelectAllOnPage = () => {
        setSelectedIds(new Set(records.map(r => r.id)));
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const nasHint = deleteNasFiles ? '，並嘗試刪除 NAS 上對應的 ZIP 檔' : '（僅刪除紀錄，不刪 NAS 檔）';
        if (!window.confirm(`確定要刪除 ${ids.length} 筆備份紀錄${nasHint}？`)) return;

        setDeleting(true);
        setError(null);
        try {
            const res = await api.delete<BulkDeleteResult>('/admin/backup/records/bulk-delete', {
                data: { record_ids: ids, delete_nas_files: deleteNasFiles },
            });
            const { deleted_count, nas_deleted_count, nas_failed, missing_ids } = res.data;
            let msg = `已刪除 ${deleted_count} 筆紀錄`;
            if (deleteNasFiles) {
                msg += `；NAS 刪除 ${nas_deleted_count} 個檔案`;
                if (nas_failed.length > 0) {
                    msg += `（失敗：${nas_failed.join(', ')}）`;
                }
            }
            if (missing_ids.length > 0) {
                msg += `；${missing_ids.length} 筆找不到`;
            }
            setSavedMsg(msg);
            setSelectedIds(new Set());
            // 若本頁刪光且非第一頁，退回上一頁
            if (records.length <= ids.length && recordsPage > 1 && deleted_count >= records.length) {
                setRecordsPage(p => Math.max(1, p - 1));
            } else {
                fetchRecords();
            }
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setError(e2.response?.data?.detail || '批次刪除失敗');
        } finally {
            setDeleting(false);
        }
    };

    const recordsTotalPages = Math.max(1, Math.ceil(recordsTotal / recordsPageSize));

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto p-6 flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <header>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2 flex items-center gap-3">
                    <HardDriveDownload className="w-8 h-8 text-indigo-600" />
                    排程備份設定
                </h1>
                <p className="text-gray-500 font-medium">
                    依排程自動備份資料庫至 NAS；教材與考卷實體檔已存於 NAS，由 NAS 端 3-2-1 備援機制保障，不在此重複備份。
                </p>
            </header>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e => setEnabled(e.target.checked)}
                        className="w-5 h-5 accent-indigo-600 cursor-pointer"
                    />
                    <span className="font-bold text-gray-800">啟用排程備份</span>
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">頻率</label>
                        <select
                            value={frequency}
                            onChange={e => setFrequency(e.target.value as 'daily' | 'weekly')}
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                        >
                            <option value="daily">每日</option>
                            <option value="weekly">每週</option>
                        </select>
                    </div>

                    {frequency === 'weekly' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase">星期</label>
                            <select
                                value={weekday}
                                onChange={e => setWeekday(Number(e.target.value))}
                                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                            >
                                {WEEKDAY_LABELS.map((label, idx) => (
                                    <option key={idx} value={idx}>{label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">時間（24 小時制）</label>
                        <input
                            type="time"
                            value={timeOfDay}
                            onChange={e => setTimeOfDay(e.target.value)}
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">保留份數</label>
                        <input
                            type="number"
                            min={1}
                            value={retentionCount}
                            onChange={e => setRetentionCount(Math.max(1, Number(e.target.value)))}
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">NAS 備份目的地（選填，留空用系統預設 BACKUP_ROOT）</label>
                        <input
                            type="text"
                            placeholder="例：backups/training"
                            value={destination}
                            onChange={e => setDestination(e.target.value)}
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">排程備份專用 NAS 帳號</label>
                        <input
                            type="text"
                            placeholder="NAS 本地帳號 或 DOMAIN\\user"
                            value={nasUsername}
                            onChange={e => setNasUsername(e.target.value)}
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">
                            NAS 密碼{config?.has_password ? '（留空表示不變更）' : ''}
                        </label>
                        <input
                            type="password"
                            placeholder={config?.has_password ? '••••••••' : 'NAS 密碼'}
                            value={nasPassword}
                            onChange={e => setNasPassword(e.target.value)}
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                {error && <p className="text-sm text-red-600 font-bold">{error}</p>}
                {savedMsg && <p className="text-sm text-green-600 font-bold">{savedMsg}</p>}
                {testMsg && (
                    <p className={`text-sm font-bold ${testMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                        {testMsg.text}
                    </p>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 border-2 border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                    >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                        連線測試
                    </button>
                    <button
                        type="button"
                        onClick={handleRunNow}
                        disabled={runningNow}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-600 border-2 border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-50 disabled:opacity-50 cursor-pointer"
                    >
                        {runningNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        立即備份
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:bg-indigo-300 cursor-pointer"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        儲存設定
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-indigo-100/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-gray-800">備份紀錄</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={deleteNasFiles}
                                onChange={e => setDeleteNasFiles(e.target.checked)}
                                className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            />
                            同時刪除 NAS 檔案
                        </label>
                        <button
                            type="button"
                            onClick={() => setSelectedIds(new Set())}
                            disabled={selectedIds.size === 0}
                            className="px-2 py-1 text-xs font-bold rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
                        >
                            取消選取
                        </button>
                        <button
                            type="button"
                            onClick={handleBulkDelete}
                            disabled={selectedIds.size === 0 || deleting}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            批次刪除 ({selectedIds.size})
                        </button>
                        <button
                            type="button"
                            onClick={fetchRecords}
                            disabled={recordsLoading}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 cursor-pointer"
                            title="重新整理"
                        >
                            <RefreshCw className={`w-4 h-4 ${recordsLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {recordsLoading ? (
                    <div className="p-12 flex flex-col items-center justify-center text-gray-400">
                        <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-600" />
                        <p className="font-bold">載入備份紀錄中...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gradient-to-r from-indigo-50/50 to-purple-50/30 border-b border-indigo-100">
                                <tr>
                                    <th className="px-4 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider w-12">
                                        <input
                                            type="checkbox"
                                            checked={records.length > 0 && records.every(r => selectedIds.has(r.id))}
                                            onChange={e => {
                                                if (e.target.checked) handleSelectAllOnPage();
                                                else setSelectedIds(new Set());
                                            }}
                                            className="w-4 h-4 accent-indigo-600 cursor-pointer"
                                            title="全選本頁"
                                            aria-label="全選本頁"
                                        />
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider w-16">項次</th>
                                    <th className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider">檔名</th>
                                    <th className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider">時間</th>
                                    <th className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider">大小</th>
                                    <th className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider">耗時</th>
                                    <th className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider">狀態</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {records.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-400 font-bold">尚無備份紀錄</td>
                                    </tr>
                                ) : (
                                    records.map((r, idx) => {
                                        const d = parseBackendDateTime(r.created_at);
                                        return (
                                            <tr key={r.id} className="even:bg-gray-50/50 hover:bg-indigo-50/50 transition-colors">
                                                <td className="px-4 py-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(r.id)}
                                                        onChange={e => toggleSelect(r.id, e.target.checked)}
                                                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                                                        aria-label={`選取紀錄 ${r.id}`}
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-400 font-medium">
                                                    {(recordsPage - 1) * recordsPageSize + idx + 1}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 font-mono">{r.filename || '-'}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                                                    {d ? d.toLocaleString('zh-TW') : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{fmtSize(r.size_bytes)}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {r.duration_ms != null ? `${r.duration_ms} ms` : '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {r.status === 'success' ? (
                                                        <span className="flex items-center gap-1 text-green-600 text-sm font-bold">
                                                            <CheckCircle2 className="w-4 h-4" /> 成功
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-red-600 text-sm font-bold" title={r.message || ''}>
                                                            <XCircle className="w-4 h-4" /> 失敗
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {!recordsLoading && recordsTotal > 0 && (
                    <Pagination
                        currentPage={recordsPage}
                        totalPages={recordsTotalPages}
                        pageSize={recordsPageSize}
                        totalItems={recordsTotal}
                        pageSizeOptions={[5, 10, 20, 50]}
                        onPageChange={setRecordsPage}
                        onPageSizeChange={(size) => {
                            setRecordsPageSize(size);
                            setRecordsPage(1);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default BackupScheduleManager;
