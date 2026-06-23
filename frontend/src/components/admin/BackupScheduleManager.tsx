import { useState, useEffect, useCallback } from 'react';
import { HardDriveDownload, Loader2, Save, Play, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import api from '../../api';
import { AxiosError } from 'axios';
import { PaginatedDataTable, type DataTableColumn } from '@shared-ui/data-table';
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
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);

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
    const [recordsPageSize, setRecordsPageSize] = useState(20);
    const [recordsLoading, setRecordsLoading] = useState(false);

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

    const recordColumns: DataTableColumn<BackupRecord>[] = [
        {
            key: 'filename',
            header: '檔名',
            render: r => <span className="text-sm text-gray-700 font-mono">{r.filename || '-'}</span>,
        },
        {
            key: 'created_at',
            header: '時間',
            render: r => {
                const d = parseBackendDateTime(r.created_at);
                return <span className="text-sm text-gray-600">{d ? d.toLocaleString('zh-TW') : '-'}</span>;
            },
        },
        {
            key: 'size',
            header: '大小',
            render: r => <span className="text-sm text-gray-600">{fmtSize(r.size_bytes)}</span>,
        },
        {
            key: 'duration',
            header: '耗時',
            render: r => <span className="text-sm text-gray-600">{r.duration_ms != null ? `${r.duration_ms} ms` : '-'}</span>,
        },
        {
            key: 'status',
            header: '狀態',
            render: r => (
                r.status === 'success' ? (
                    <span className="flex items-center gap-1 text-green-600 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" /> 成功
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-red-600 text-sm font-bold" title={r.message || ''}>
                        <XCircle className="w-4 h-4" /> 失敗
                    </span>
                )
            ),
        },
    ];

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto p-6 flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
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

                <div className="flex items-center justify-end gap-2 pt-2">
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

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-800">備份紀錄</h2>
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
                <div className="px-2 pb-2">
                    <PaginatedDataTable<BackupRecord>
                        adapter="tailwind"
                        columns={recordColumns}
                        data={records}
                        loading={recordsLoading}
                        loadingText={<Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />}
                        emptyState={<div className="text-gray-400">尚無備份紀錄</div>}
                        getRowKey={r => r.id}
                        paginationMode="server"
                        totalItems={recordsTotal}
                        page={recordsPage}
                        pageSize={recordsPageSize}
                        pageSizeOptions={[10, 20, 50]}
                        onPaginationChange={state => { setRecordsPage(state.page); setRecordsPageSize(state.pageSize); }}
                    />
                </div>
            </div>
        </div>
    );
};

export default BackupScheduleManager;
