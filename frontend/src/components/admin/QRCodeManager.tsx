import { useState } from 'react';
import { QrCode, Loader2, Copy, Check } from 'lucide-react';
import api from '../../api';
import { AxiosError } from 'axios';

/**
 * 取得前端對外的基礎 URL（含部署子路徑，例如 /training/）。
 * 前端部署在 Vite base（import.meta.env.BASE_URL）之下，QRcode 連結必須包含此前綴，
 * 否則手機掃碼後會打到網站根目錄而出現 404。
 */
const getFrontendBaseUrl = (): string => {
    const base = import.meta.env.BASE_URL || '/';
    return `${window.location.origin}${base}`.replace(/\/$/, '');
};

interface QRCodeGenerateResponse {
    qrcode_url: string;  // Base64 圖片
    login_url: string;   // 登入頁完整 URL
}

/**
 * QRcode 登入管理（方案 A）。
 * 產生的 QRcode 內容為登入頁固定 URL（不含一次性 token/UUID），掃碼後進入一般登入頁。
 * 不再有 token 有效時間與歷史清單。
 */
const QRCodeManager = () => {
    const [currentQRCode, setCurrentQRCode] = useState<QRCodeGenerateResponse | null>(null);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    // 產生 QRcode
    const handleGenerate = async () => {
        try {
            setGenerating(true);
            const res = await api.post<QRCodeGenerateResponse>('/admin/qrcode/login/generate', {}, {
                headers: {
                    // 明確傳遞前端 URL（含 /training 等部署子路徑），供後端組合登入頁連結
                    'X-Frontend-URL': getFrontendBaseUrl(),
                },
            });
            setCurrentQRCode(res.data);
        } catch (err) {
            console.error('Failed to generate QRcode', err);
            const error = err as AxiosError<{ detail: string }>;
            alert(error.response?.data?.detail || '產生 QRcode 失敗');
        } finally {
            setGenerating(false);
        }
    };

    // 複製登入連結
    const handleCopyLoginUrl = async (url: string) => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                // 備用方案：使用傳統方法
                const textArea = document.createElement('textarea');
                textArea.value = url;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (!successful) {
                    alert('複製失敗，請手動複製連結');
                    return;
                }
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy URL:', err);
            alert('複製失敗，請手動複製連結');
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <header>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">QRcode 登入管理</h1>
                <p className="text-gray-500 font-medium">產生登入 QRcode，供手機用戶掃描後開啟登入頁（員工編號 + 驗證碼）</p>
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

                {currentQRCode ? (
                    <div className="mt-6 space-y-4">
                        <div className="flex flex-col items-center gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-gray-800 mb-2">掃描此 QRcode 進行登入</h3>
                                <p className="text-sm text-gray-500">掃碼後將開啟登入頁，輸入員工編號與驗證碼即可登入</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                                <img
                                    src={currentQRCode.qrcode_url}
                                    alt="Login QRcode"
                                    className="w-64 h-64"
                                />
                            </div>
                            <div className="w-full max-w-md px-3 py-2 bg-white rounded-lg border border-gray-200">
                                <p className="text-xs text-gray-500 mb-1">登入連結：</p>
                                <code className="text-xs font-mono text-gray-700 break-all">{currentQRCode.login_url}</code>
                            </div>
                            <button
                                onClick={() => handleCopyLoginUrl(currentQRCode.login_url)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors text-sm font-bold"
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
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-400">
                        <QrCode className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">點擊上方按鈕產生登入 QRcode</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QRCodeManager;
