import React from 'react';
import { AlertCircle, X, Check } from 'lucide-react';

interface ConfirmModalProps {
    /** 控制模態框是否顯示 */
    isOpen: boolean;
    /** 模態框標題 */
    title: string;
    /** 模態框主要訊息內容 */
    message: string;
    /** 確認按鈕文字 (預設：確認) */
    confirmText?: string;
    /** 取消按鈕文字 (預設：取消) */
    cancelText?: string;
    /** 確認按鈕點擊事件 */
    onConfirm: () => void;
    /** 取消按鈕點擊事件 */
    onCancel: () => void;
    /** 是否為破壞性操作 (如刪除)，若為 true 則顯示紅色樣式 */
    isDestructive?: boolean;
}

/**
 * 通用確認對話框組件
 * 
 * 用於取代瀏覽器原生的 window.confirm，提供更一致且美觀的 UI。
 * 支援一般確認與破壞性操作 (紅色警示) 兩種樣式。
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    confirmText = '確認',
    cancelText = '取消',
    onConfirm,
    onCancel,
    isDestructive = false
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className={`p-6 border-b border-gray-100 flex items-center justify-between ${isDestructive ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <h3 className={`text-lg font-black flex items-center gap-2 ${isDestructive ? 'text-red-700' : 'text-gray-900'}`}>
                        <AlertCircle className={`w-5 h-5 ${isDestructive ? 'text-red-600' : 'text-gray-600'}`} />
                        {title}
                    </h3>
                    <button 
                        onClick={onCancel}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6">
                    <p className="text-gray-600 font-bold leading-relaxed">{message}</p>
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 py-3 px-4 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2
                            ${isDestructive 
                                ? 'bg-red-600 shadow-red-200 hover:bg-red-700' 
                                : 'bg-blue-600 shadow-blue-200 hover:bg-blue-700'}
                        `}
                    >
                        <Check className="w-4 h-4" />
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
