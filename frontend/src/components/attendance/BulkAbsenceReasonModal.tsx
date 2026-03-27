import { useMemo, useState } from 'react';

type UserItem = {
  emp_id: string;
  name: string;
  dept_name: string;
};

const ABSENCE_REASON_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'sick_leave', label: '病假' },
  { code: 'business_trip', label: '出差' },
  { code: 'official_leave', label: '公假' },
  { code: 'other', label: '其他' },
  { code: 'cancel_leave', label: '取消請假' },
];

interface BulkAbsenceReasonModalProps {
  users: UserItem[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { emp_ids: string[]; reason_code: string; reason_text?: string }) => Promise<void>;
}

const BulkAbsenceReasonModal: React.FC<BulkAbsenceReasonModalProps> = ({ users, busy, onClose, onSubmit }) => {
  const [reasonCode, setReasonCode] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  const allSelected = useMemo(
    () => users.length > 0 && users.every((u) => selectedEmpIds.includes(u.emp_id)),
    [users, selectedEmpIds]
  );

  const toggleAll = () => {
    setSelectedEmpIds(allSelected ? [] : users.map((u) => u.emp_id));
  };

  const toggleOne = (empId: string) => {
    setSelectedEmpIds((prev) => (prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]));
  };

  const disabledSubmit =
    busy ||
    !reasonCode ||
    selectedEmpIds.length === 0 ||
    (reasonCode === 'other' && !reasonText.trim());

  return (
    <div className="fixed inset-0 z-65 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-4 border-b border-purple-100 bg-purple-50/60">
          <h3 className="text-lg font-black text-gray-900">批次填寫請假原因</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-bold">
              請勾選要更新的人員（可全選/不全選）
            </p>
            <button
              type="button"
              onClick={toggleAll}
              className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 cursor-pointer"
            >
              {allSelected ? '不全選' : '全選'}
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl max-h-52 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">勾選</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">員工編號</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">姓名</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">部門</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u, idx) => (
                  <tr key={u.emp_id} className={idx % 2 === 1 ? 'bg-gray-100' : ''}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedEmpIds.includes(u.emp_id)}
                        onChange={() => toggleOne(u.emp_id)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{u.emp_id}</td>
                    <td className="px-3 py-2 font-bold">{u.name}</td>
                    <td className="px-3 py-2 text-gray-600">{u.dept_name}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-gray-400 text-xs">
                      沒有可更新的人員
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">原因</label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">請選擇</option>
              {ABSENCE_REASON_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
          </div>

          {reasonCode === 'other' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">原因說明（必填）</label>
              <input
                type="text"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="請填寫未到原因"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 font-bold rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            disabled={disabledSubmit}
            onClick={async () => {
              await onSubmit({
                emp_ids: selectedEmpIds,
                reason_code: reasonCode,
                reason_text: reasonCode === 'other' ? reasonText : undefined,
              });
            }}
            className="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? '儲存中…' : '批次儲存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkAbsenceReasonModal;
