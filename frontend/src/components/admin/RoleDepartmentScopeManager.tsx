import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Building2, Save, Check, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import api from '../../api';
import ConfirmModal from '../ConfirmModal';

interface Role {
  id: number;
  name: string;
}

interface Department {
  id: number;
  name: string;
}

type ScopeType = 'all' | 'department' | 'self';

const scopeOptions: Array<{ key: ScopeType; title: string; desc: string }> = [
  { key: 'all', title: '所有部門', desc: '可查看所有部門資料' },
  { key: 'department', title: '成員所屬部門', desc: '僅可查看本人所屬部門資料' },
  { key: 'self', title: '僅本人', desc: '僅可查看自己的資料' },
];

export default function RoleDepartmentScopeManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>('self');
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<number>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; targetRoleId: number | null }>({
    isOpen: false,
    targetRoleId: null,
  });

  useEffect(() => {
    void fetchRoles();
  }, []);

  useEffect(() => {
    if (selectedRoleId) {
      void fetchScope(selectedRoleId);
    }
  }, [selectedRoleId]);

  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      const [rolesRes, deptRes] = await Promise.all([
        api.get('/admin/roles'),
        api.get('/admin/departments'),
      ]);
      setRoles(rolesRes.data);
      setDepartments(deptRes.data || []);
      if (rolesRes.data.length > 0) {
        setSelectedRoleId(rolesRes.data[0].id);
      }
    } catch (e) {
      console.error(e);
      setError('載入角色失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchScope = async (roleId: number) => {
    try {
      setError(null);
      const res = await api.get(`/admin/roles/${roleId}/department-scope`);
      const s = (res.data?.scope_type || 'self') as ScopeType;
      const deptIds = new Set<number>((res.data?.dept_ids || []) as number[]);
      setScopeType(s);
      setSelectedDeptIds(deptIds);
      setIsDirty(false);
    } catch (e) {
      console.error(e);
      setError('載入角色部門權限失敗');
    }
  };

  const handleRoleSelect = (roleId: number) => {
    if (selectedRoleId === roleId) return;
    if (isDirty) {
      setConfirmModal({ isOpen: true, targetRoleId: roleId });
      return;
    }
    setSelectedRoleId(roleId);
  };

  const saveCurrent = async (): Promise<boolean> => {
    if (!selectedRoleId) return false;
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMsg(null);
      await api.put(`/admin/roles/${selectedRoleId}/department-scope`, {
        scope_type: scopeType,
        dept_ids: scopeType === 'department' ? Array.from(selectedDeptIds) : [],
      });
      setIsDirty(false);
      setSuccessMsg('角色部門權限已儲存');
      setTimeout(() => setSuccessMsg(null), 3000);
      return true;
    } catch (e) {
      if (e instanceof AxiosError && e.response) {
        setError(e.response.data.detail || '儲存失敗');
      } else {
        setError('發生未預期錯誤');
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndSwitch = async () => {
    const target = confirmModal.targetRoleId;
    if (!target) return;
    const ok = await saveCurrent();
    if (!ok) return;
    setSelectedRoleId(target);
    setConfirmModal({ isOpen: false, targetRoleId: null });
  };

  const currentRole = roles.find((r) => r.id === selectedRoleId);
  const isRoleAdmin = currentRole?.name === 'Admin';
  const toggleDept = (deptId: number) => {
    const next = new Set(selectedDeptIds);
    if (next.has(deptId)) next.delete(deptId);
    else next.add(deptId);
    setSelectedDeptIds(next);
    setIsDirty(true);
  };
  const selectAllExtraDepts = () => {
    setSelectedDeptIds(new Set(departments.map((d) => d.id)));
    setIsDirty(true);
  };
  const clearAllExtraDepts = () => {
    setSelectedDeptIds(new Set());
    setIsDirty(true);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Building2 className="w-8 h-8 text-indigo-600" />
            角色部門權限
          </h1>
          <p className="text-gray-500 mt-2 font-medium">設定每個角色可查看的部門資料範圍</p>
        </div>
        {successMsg && (
          <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2">
            <Check className="w-5 h-5" />
            {successMsg}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-4 bg-white rounded-2xl shadow-sm border border-indigo-100/50 overflow-hidden">
          <div className="p-4 bg-linear-to-r from-indigo-50/50 to-purple-50/30 border-b border-indigo-100 font-black text-indigo-500 uppercase tracking-wider text-xs">
            選擇角色
          </div>
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {roles.map((role, index) => (
                <button
                  key={role.id}
                  onClick={() => handleRoleSelect(role.id)}
                  className={`w-full text-left p-4 flex items-center justify-between transition-all duration-200 cursor-pointer ${
                    selectedRoleId === role.id
                      ? 'bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-600'
                      : `text-gray-600 hover:bg-indigo-50/30 hover:text-gray-900 font-medium border-l-4 border-transparent ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-100'
                        }`
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-indigo-300 w-6">{(index + 1).toString().padStart(2, '0')}</span>
                    {role.name}
                  </div>
                  {selectedRoleId === role.id && <ChevronRight className="w-4 h-4" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-8 bg-white rounded-2xl shadow-sm border border-indigo-100/50 overflow-hidden flex flex-col">
          <div className="p-4 bg-linear-to-r from-indigo-50/50 to-purple-50/30 border-b border-indigo-100 flex items-center justify-between">
            <div className="font-black text-indigo-500 uppercase tracking-wider text-xs">資料可視範圍</div>
            <button
              onClick={() => void saveCurrent()}
              disabled={isSaving || !selectedRoleId || !isDirty || isRoleAdmin}
              className="bg-green-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-green-200 hover:bg-green-600 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              儲存設定
            </button>
          </div>

          <div className="p-6 min-h-[420px]">
            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl font-bold flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
            )}
            {!selectedRoleId ? (
              <div className="text-center text-gray-400 py-10">請先選擇角色</div>
            ) : (
              <div className="space-y-3">
                {scopeOptions.map((opt, idx) => {
                  const checked = scopeType === opt.key;
                  const disabled = isRoleAdmin && opt.key !== 'all';
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${
                        checked ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white'
                      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${idx % 2 === 1 ? 'bg-gray-100' : ''}`}
                    >
                      <input
                        type="radio"
                        name="scope_type"
                        value={opt.key}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => {
                          setScopeType(opt.key);
                          setIsDirty(true);
                        }}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-bold text-gray-800">{opt.title}</div>
                        <div className="text-sm text-gray-500">{opt.desc}</div>
                      </div>
                    </label>
                  );
                })}
                <p className="text-xs text-gray-500 pt-2">
                  * Admin 角色固定為「所有部門」。
                </p>
                {scopeType === 'department' && (
                  <div className="mt-3 border border-indigo-100 rounded-xl p-4 bg-indigo-50/30">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-sm font-bold text-indigo-700">額外可視部門（可多選）</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllExtraDepts}
                          className="px-2 py-1 text-xs font-bold border border-indigo-200 text-indigo-600 rounded hover:bg-indigo-50 cursor-pointer"
                        >
                          全選
                        </button>
                        <button
                          type="button"
                          onClick={clearAllExtraDepts}
                          className="px-2 py-1 text-xs font-bold border border-gray-200 text-gray-600 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          不全選
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">
                      登入者自己的部門會自動包含在可視範圍內；此處勾選的是「額外可看」的部門。
                    </p>
                    <label className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-indigo-100/70 border border-indigo-200">
                      <input type="checkbox" checked disabled />
                      <span className="text-sm font-bold text-indigo-700">
                        自己所屬部門（預設勾選，且不可取消）
                      </span>
                    </label>
                    <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-2">
                      {departments.map((dept, idx) => (
                        <label
                          key={dept.id}
                          className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDeptIds.has(dept.id)}
                            onChange={() => toggleDept(dept.id)}
                          />
                          <span className="text-sm font-medium text-gray-700">{dept.name}</span>
                        </label>
                      ))}
                      </div>
                      {departments.length === 0 && (
                        <div className="px-3 py-6 text-center text-xs text-gray-400">目前無可選部門</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="未儲存的變更"
        message="您對目前角色的部門權限尚未儲存。切換角色將會遺失這些變更。您確定要繼續嗎？"
        extraText="儲存變更"
        onExtra={handleSaveAndSwitch}
        extraShowSaveIcon
        isBusy={isSaving}
        confirmText="捨棄變更並切換"
        cancelText="取消"
        onConfirm={() => {
          if (confirmModal.targetRoleId) {
            setSelectedRoleId(confirmModal.targetRoleId);
            setIsDirty(false);
          }
          setConfirmModal({ isOpen: false, targetRoleId: null });
        }}
        onCancel={() => setConfirmModal({ isOpen: false, targetRoleId: null })}
        isDestructive
      />
    </div>
  );
}
