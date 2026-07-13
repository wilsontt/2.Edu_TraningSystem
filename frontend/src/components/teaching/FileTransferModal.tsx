import { useEffect } from 'react';
import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { TransferState } from './transfer';

interface FileTransferModalProps {
    transfer: TransferState;
    onCancel: () => void;   // 傳輸中取消（AbortController）
    onClose: () => void;    // 完成／失敗後關閉
}

/**
 * 檔案傳輸進度視窗（教材 PLAN §5.4a）。
 * - 顯示傳輸 %；傳輸中可「取消傳輸」（AbortController）。
 * - 僅右上角 X 或「取消傳輸」可關；**禁用點遮罩關閉**。
 * - 傳輸中以 beforeunload 警告防止誤重整。
 * - 成功後短暫顯示再自動關閉。
 */
const FileTransferModal = ({ transfer, onCancel, onClose }: FileTransferModalProps) => {
    const { open, title, progress, status, error } = transfer;
    const transferring = status === 'transferring';

    // 傳輸中防誤重整
    useEffect(() => {
        if (!open || !transferring) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [open, transferring]);

    // 成功後自動關閉
    useEffect(() => {
        if (open && status === 'success') {
            const t = setTimeout(onClose, 1200);
            return () => clearTimeout(t);
        }
    }, [open, status, onClose]);

    if (!open) return null;

    const handleX = () => (transferring ? onCancel() : onClose());

    return (
        // 遮罩無 onClick → 點遮罩無法關閉
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-black text-gray-900 truncate">{title}</h3>
                    <button type="button" onClick={handleX} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer" title={transferring ? '取消傳輸' : '關閉'}>
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="px-5 py-6 space-y-4">
                    {status === 'transferring' && (
                        <>
                            <div className="flex items-center gap-2 text-indigo-600">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-sm font-bold">傳輸中{progress !== null ? `… ${progress}%` : '…'}</span>
                            </div>
                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-200"
                                    style={{ width: `${progress ?? 30}%` }}
                                />
                            </div>
                        </>
                    )}
                    {status === 'success' && (
                        <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="w-5 h-5" />
                            <span className="text-sm font-bold">傳輸完成</span>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-start gap-2 text-red-700">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <span className="text-sm font-bold whitespace-pre-wrap wrap-break-word">{error || '傳輸失敗'}</span>
                        </div>
                    )}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                    {transferring ? (
                        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg bg-red-100 text-red-700 font-bold hover:bg-red-200 cursor-pointer">
                            取消傳輸
                        </button>
                    ) : (
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white font-bold hover:bg-black cursor-pointer">
                            關閉
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FileTransferModal;
