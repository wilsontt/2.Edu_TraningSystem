import { useState } from 'react';
import api from '../../api';

interface AuthorizeRetakeModalProps {
  empId: string;
  planId: number;
  empName: string;
  planTitle: string;
  onSuccess: () => void;
  onClose: () => void;
}

export default function AuthorizeRetakeModal({
  empId,
  planId,
  empName,
  planTitle,
  onSuccess,
  onClose,
}: AuthorizeRetakeModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('請輸入授權原因');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await api.post('/exam/admin/authorize-retake', {
        emp_id: empId,
        plan_id: planId,
        reason: reason.trim(),
      });
      onSuccess();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { detail?: string } } };
      setError(apiErr.response?.data?.detail || '授權失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">開放重考授權</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 space-y-1">
          <div className="text-sm text-gray-600">
            員工：<span className="font-semibold text-gray-900">{empName}</span>
          </div>
          <div className="text-sm text-gray-600">
            計畫：<span className="font-semibold text-gray-900">{planTitle}</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            授權原因 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="請輸入授權原因…"
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-none"
          />
          <div className="text-right text-xs text-gray-400 mt-1">{reason.length}/500</div>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="px-4 py-2 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '授權中…' : '確認授權'}
          </button>
        </div>
      </div>
    </div>
  );
}
