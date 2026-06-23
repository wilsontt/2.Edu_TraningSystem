import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, KeyRound, Server } from 'lucide-react';
import api from '../../api';
import { AxiosError } from 'axios';

interface NasLoginModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (token: string) => void;
    /** 視窗用途說明（如「上傳教材」「下載教材」）。 */
    purpose?: string;
}

interface VerifyResponse {
    nas_session_token: string;
    expires_in: number;
}

/**
 * NAS 登入視窗（教材傳輸前）。驗證 NAS 本地或 AD 帳密，取得短時 token 供當次傳輸使用。
 * 密碼僅用於當次驗證，不存於前端狀態之外、不寫入 DB。
 */
const NasLoginModal = ({ open, onClose, onSuccess, purpose }: NasLoginModalProps) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // 每次開啟都清空帳密，避免殘留上次輸入的帳號（元件因重複使用未被卸載）
    useEffect(() => {
        if (open) {
            setUsername('');
            setPassword('');
            setError(null);
        }
    }, [open]);

    if (!open) return null;

    const handleClose = () => {
        if (loading) return;
        onClose();
    };

    const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            passwordRef.current?.focus();
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        // React 合成事件即使透過 createPortal 渲染到 document.body，仍會沿著 React 元件樹（而非 DOM 樹）
        // 向上冒泡；若不阻止，Enter 觸發的送出會被外層「編輯訓練計畫」表單的 onSubmit 接收到，誤關整頁。
        e.stopPropagation();
        if (!username.trim() || !password) {
            setError('請輸入 NAS 帳號與密碼');
            return;
        }
        try {
            setLoading(true);
            setError(null);
            const started = Date.now();
            const res = await api.post<VerifyResponse>('/admin/teaching-materials/nas-session/verify', {
                nas_username: username.trim(),
                nas_password: password,
            });
            const elapsed = Date.now() - started;
            const MIN_VISIBLE_MS = 400;
            if (elapsed < MIN_VISIBLE_MS) {
                await new Promise(resolve => setTimeout(resolve, MIN_VISIBLE_MS - elapsed));
            }
            setPassword('');
            onSuccess(res.data.nas_session_token);
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setError(e2.response?.data?.detail || 'NAS 登入失敗，請確認帳號密碼');
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        // 遮罩無 onClick → 點遮罩無法關閉；僅右上 X 或「取消」可關（教材 PLAN 規範）
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="px-5 py-4 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
                    <h3 className="font-black text-gray-900 flex items-center gap-2">
                        <Server className="w-5 h-5 text-indigo-600" /> NAS 登入{purpose ? `（${purpose}）` : ''}
                    </h3>
                    <button type="button" onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/80 cursor-pointer">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <form onSubmit={submit} className="px-5 py-4 space-y-4">
                    <p className="text-xs text-gray-500">教材上傳／下載前須以 NAS 本地或網域（AD）帳號登入；密碼僅用於本次傳輸。</p>
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-3 text-red-700 text-sm rounded-r-lg">{error}</div>
                    )}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">NAS 帳號</label>
                        <input
                            type="text"
                            autoFocus
                            placeholder="NAS 本地帳號 或 DOMAIN\\user"
                            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={handleUsernameKeyDown}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">密碼</label>
                        <input
                            ref={passwordRef}
                            type="password"
                            placeholder="NAS 密碼"
                            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={handleClose} className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer">
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:bg-indigo-300 cursor-pointer flex items-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                            {loading ? '驗證中...' : '登入並繼續'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
};

export default NasLoginModal;
