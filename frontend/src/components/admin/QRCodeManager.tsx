import { useState, useEffect } from 'react';
import { QrCode, RefreshCw, Loader2, Clock, X, Copy, Check, Eye, Trash2 } from 'lucide-react';
import api from '../../api';
import { AxiosError } from 'axios';

interface QRCodeGenerateResponse {
    token: string;
    qrcode_url: string;  // Base64 圖片
    login_url?: string;  // 完整的登入 URL（用於複製，可選）
    expires_at: string;
}

interface LoginToken {
    id: number;
    token: string;
    created_by: string;
    created_at: string;
    expires_at: string;
    is_used: boolean;
}

const QRCodeManager = () => {
    const [currentQRCode, setCurrentQRCode] = useState<QRCodeGenerateResponse | null>(null);
    const [tokens, setTokens] = useState<LoginToken[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const [viewingTokenId, setViewingTokenId] = useState<number | null>(null);
    const [viewingQRCode, setViewingQRCode] = useState<string | null>(null);
    const [viewingLoginUrl, setViewingLoginUrl] = useState<string | null>(null);
    const [deletingTokenId, setDeletingTokenId] = useState<number | null>(null);

    // 載入 token 列表
    const fetchTokens = async () => {
        try {
            setLoading(true);
            const res = await api.get<LoginToken[]>('/admin/qrcode/login/tokens');
            
            // 分離未過期和已過期的 token
            const validTokens = res.data.filter(token => !isExpired(token.expires_at));
            const expiredTokens = res.data.filter(token => isExpired(token.expires_at));
            
            // 已過期的 token 按過期時間排序（最新的在前），只取前 5 筆
            const recentExpiredTokens = expiredTokens
                .sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())
                .slice(0, 5);
            
            // 合併：未過期的全部 + 最近 5 筆已過期的
            setTokens([...validTokens, ...recentExpiredTokens]);
        } catch (err) {
            console.error('Failed to fetch tokens', err);
        } finally {
            setLoading(false);
        }
    };

    // 產生 QRcode
    const handleGenerate = async () => {
        try {
            setGenerating(true);
            // 在請求 header 中包含前端 URL（通過 Referer，瀏覽器會自動設置）
            // 或者可以通過自定義 header 傳遞
            const res = await api.post<QRCodeGenerateResponse>('/admin/qrcode/login/generate', {}, {
                headers: {
                    // 明確傳遞前端 URL（如果需要的話）
                    'X-Frontend-URL': `${window.location.protocol}//${window.location.host}`
                }
            });
            setCurrentQRCode(res.data);
            // 如果後端返回了 login_url，也保存它（用於複製功能）
            // 重新載入 token 列表
            fetchTokens();
        } catch (err) {
            console.error('Failed to generate QRcode', err);
            const error = err as AxiosError<{ detail: string }>;
            alert(error.response?.data?.detail || '產生 QRcode 失敗');
        } finally {
            setGenerating(false);
        }
    };

    // 複製登入連結（使用傳入的 URL 或根據 token 構建）
    const handleCopyLoginUrl = async (urlOrToken: string, isToken: boolean = false) => {
        const urlToCopy = isToken 
            ? `${window.location.protocol}//${window.location.host}/auth/login/qrcode/${urlOrToken}`
            : urlOrToken;
        
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(urlToCopy);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } else {
                // 備用方案：使用傳統方法
                const textArea = document.createElement('textarea');
                textArea.value = urlToCopy;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    const successful = document.execCommand('copy');
                    if (successful) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    } else {
                        alert('複製失敗，請手動複製連結');
                    }
                } catch (err) {
                    console.error('Failed to copy:', err);
                    alert('複製失敗，請手動複製連結');
                }
                document.body.removeChild(textArea);
            }
        } catch (err) {
            console.error('Failed to copy URL:', err);
            alert('複製失敗，請手動複製連結');
        }
    };

    // 格式化時間（明確處理 UTC 時間轉換為台灣時區）
    const formatDateTime = (dateString: string) => {
        // 如果字串沒有時區資訊，加上 'Z' 表示 UTC
        const utcString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
        const date = new Date(utcString);
        
        return date.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Taipei' // 明確指定台灣時區
        });
    };

    // 檢查是否過期
    const isExpired = (expiresAt: string) => {
        return new Date(expiresAt) < new Date();
    };

    // 顯示指定 token 的 QRcode
    const handleShowQRCode = async (tokenId: number) => {
        try {
            setViewingTokenId(tokenId);
            const res = await api.post<{ token: string; qrcode_url: string; login_url: string; expires_at: string }>(
                `/admin/qrcode/login/tokens/${tokenId}/regenerate-qrcode`, 
                {}, 
                {
                    headers: {
                        'X-Frontend-URL': `${window.location.protocol}//${window.location.host}`
                    }
                }
            );
            setViewingQRCode(res.data.qrcode_url);
            setViewingLoginUrl(res.data.login_url);
        } catch (err) {
            console.error('Failed to show QRcode', err);
            const error = err as AxiosError<{ detail: string }>;
            alert(error.response?.data?.detail || '顯示 QRcode 失敗');
            setViewingTokenId(null);
            setViewingQRCode(null);
            setViewingLoginUrl(null);
        }
    };

    // 刪除 token
    const handleDeleteToken = async (tokenId: number) => {
        if (!confirm('確定要刪除此 Token 嗎？')) {
            return;
        }

        try {
            setDeletingTokenId(tokenId);
            await api.delete(`/admin/qrcode/login/tokens/${tokenId}`);
            // 重新載入 token 列表
            await fetchTokens();
            // 如果刪除的是當前顯示的 QRcode，清除顯示
            if (currentQRCode && tokens.find(t => t.token === currentQRCode.token)?.id === tokenId) {
                setCurrentQRCode(null);
            }
        } catch (err) {
            console.error('Failed to delete token', err);
            const error = err as AxiosError<{ detail: string }>;
            alert(error.response?.data?.detail || '刪除 Token 失敗');
        } finally {
            setDeletingTokenId(null);
        }
    };

    // 初始載入 token 列表
    useEffect(() => {
        fetchTokens();
    }, []);

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <header>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">QRcode 登入管理</h1>
                <p className="text-gray-500 font-medium">產生登入 QRcode，供手機用戶掃描後快速登入系統</p>
            </header>

            {/* 產生 QRcode 區域 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800">產生登入 QRcode</h2>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
                    >
                        {generating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>產生中...</span>
                            </>
                        ) : (
                            <>
                                <QrCode className="w-4 h-4" />
                                <span>產生 QRcode</span>
                            </>
                        )}
                    </button>
                </div>

                {currentQRCode && (
                    <div className="mt-6 space-y-4">
                        <div className="flex flex-col items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-gray-800 mb-2">掃描此 QRcode 進行登入</h3>
                                <p className="text-sm text-gray-500">QRcode 將於 {formatDateTime(currentQRCode.expires_at)} 過期</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                                <img 
                                    src={currentQRCode.qrcode_url} 
                                    alt="Login QRcode" 
                                    className="w-64 h-64"
                                />
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <span className="font-mono text-xs bg-gray-200 px-2 py-1 rounded">
                                    Token: {currentQRCode.token.substring(0, 8)}...
                                </span>
                                <button
                                    onClick={() => {
                                        const urlToCopy = currentQRCode.login_url || `${window.location.protocol}//${window.location.host}/auth/login/qrcode/${currentQRCode.token}`;
                                        handleCopyLoginUrl(urlToCopy, false);
                                    }}
                                    className="flex items-center gap-1 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-3 h-3" />
                                            <span>已複製</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3" />
                                            <span>複製連結</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!currentQRCode && (
                    <div className="text-center py-12 text-gray-400">
                        <QrCode className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">點擊上方按鈕產生登入 QRcode</p>
                    </div>
                )}
            </div>

            {/* Token 歷史記錄 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Token 歷史記錄</h2>
                    <button
                        onClick={fetchTokens}
                        disabled={loading}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                        title="重新整理"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {loading ? (
                    <div className="py-12 flex justify-center">
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                    </div>
                ) : tokens.length === 0 ? (
                    <div className="py-12 text-center text-gray-400">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">尚無產生的 Token</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 text-sm font-bold text-gray-700">Token</th>
                                    <th className="text-left py-3 px-4 text-sm font-bold text-gray-700">建立時間</th>
                                    <th className="text-left py-3 px-4 text-sm font-bold text-gray-700">過期時間</th>
                                    <th className="text-left py-3 px-4 text-sm font-bold text-gray-700">狀態</th>
                                    <th className="text-left py-3 px-4 text-sm font-bold text-gray-700">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tokens.map((token) => (
                                    <tr 
                                        key={token.id} 
                                        className="border-b border-gray-100 even:bg-gray-100 hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="py-3 px-4">
                                            <code className="text-xs font-mono text-gray-600">
                                                {token.token.substring(0, 12)}...
                                            </code>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-600">
                                            {formatDateTime(token.created_at)}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-600">
                                            {formatDateTime(token.expires_at)}
                                        </td>
                                        <td className="py-3 px-4">
                                            {isExpired(token.expires_at) ? (
                                                <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1 w-fit">
                                                    <X className="w-3 h-3" />
                                                    已過期
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1 w-fit">
                                                    <Clock className="w-3 h-3" />
                                                    有效中（可多人使用）
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                {!isExpired(token.expires_at) && (
                                                    <button
                                                        onClick={() => handleShowQRCode(token.id)}
                                                        disabled={viewingTokenId === token.id}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="顯示 QRcode"
                                                    >
                                                        {viewingTokenId === token.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Eye className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteToken(token.id)}
                                                    disabled={deletingTokenId === token.id}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="刪除 Token"
                                                >
                                                    {deletingTokenId === token.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 顯示 QRcode 模態框 */}
            {viewingQRCode && viewingTokenId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <QrCode className="w-5 h-5 text-blue-600" />
                                登入 QRcode
                            </h3>
                            <button 
                                onClick={() => {
                                    setViewingQRCode(null);
                                    setViewingTokenId(null);
                                    setViewingLoginUrl(null);
                                    setCopied(false);
                                }} 
                                className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col items-center gap-4">
                            <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                                <img 
                                    src={viewingQRCode} 
                                    alt="Login QRcode" 
                                    className="w-64 h-64"
                                />
                            </div>
                            <p className="text-sm text-gray-500 text-center">
                                掃描此 QRcode 進行登入
                            </p>
                            <button
                                onClick={() => {
                                    if (!viewingLoginUrl) {
                                        alert('無法獲取登入連結');
                                        return;
                                    }
                                    handleCopyLoginUrl(viewingLoginUrl, false);
                                }}
                                disabled={!viewingLoginUrl}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        <span>已複製</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        <span>複製連結</span>
                                    </>
                                )}
                            </button>
                            {viewingLoginUrl && (
                                <div className="w-full px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                                    <p className="text-xs text-gray-500 mb-1">登入連結：</p>
                                    <code className="text-xs font-mono text-gray-700 break-all">{viewingLoginUrl}</code>
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-100">
                            <button
                                onClick={() => {
                                    setViewingQRCode(null);
                                    setViewingTokenId(null);
                                    setViewingLoginUrl(null);
                                    setCopied(false);
                                }}
                                className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all active:scale-95"
                            >
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QRCodeManager;
