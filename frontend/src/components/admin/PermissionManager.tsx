import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Shield, Lock, Save, Check, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import api from '../../api';
import ConfirmModal from '../ConfirmModal'; // Imported

interface Role {
  id: number;
  name: string;
}

interface SystemFunction {
  id: number;
  name: string;
  code: string;
  parent_id: number | null;
  children: SystemFunction[];
}

const PermissionManager = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [functions, setFunctions] = useState<SystemFunction[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Set<number>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 確認模態框狀態
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; targetRoleId: number | null }>({
      isOpen: false,
      targetRoleId: null
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedRoleId) {
      fetchRolePermissions(selectedRoleId);
    }
  }, [selectedRoleId]);
  
  // 自定義角色選擇處理
  const handleRoleSelect = (roleId: number) => {
    if (selectedRoleId === roleId) return;
    if (isDirty) {
        setConfirmModal({ isOpen: true, targetRoleId: roleId });
    } else {
        setSelectedRoleId(roleId);
    }
  };

  const handleConfirmSwitch = () => {
      if (confirmModal.targetRoleId) {
          setSelectedRoleId(confirmModal.targetRoleId);
          setIsDirty(false); // Reset dirty flag as changes are discarded
      }
      setConfirmModal({ isOpen: false, targetRoleId: null });
  };

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [rolesRes, funcsRes] = await Promise.all([
        api.get('/admin/roles'),
        api.get('/admin/functions')
      ]);
      setRoles(rolesRes.data);
      setFunctions(funcsRes.data);
      if (rolesRes.data.length > 0) {
        setSelectedRoleId(rolesRes.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
      setError('載入資料失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRolePermissions = async (roleId: number) => {
    try {
      const res = await api.get(`/admin/roles/${roleId}/permissions`);
      const perms = new Set<number>(res.data);
      setRolePermissions(perms);
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to fetch permissions', err);
    }
  };

  const handleTogglePermission = (funcId: number) => {
    // 檢查 Admin 權限
    const currentRole = roles.find(r => r.id === selectedRoleId);
    if (currentRole?.name === 'Admin') return;

    const newPerms = new Set(rolePermissions);
    if (newPerms.has(funcId)) {
      newPerms.delete(funcId);
    } else {
      newPerms.add(funcId);
    }
    setRolePermissions(newPerms);
    setIsDirty(true);
  };

  const saveCurrentRolePermissions = async (): Promise<boolean> => {
    if (!selectedRoleId) return false;

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMsg(null);

      await api.put(`/admin/roles/${selectedRoleId}/permissions`, {
        function_ids: Array.from(rolePermissions)
      });

      setSuccessMsg('權限設定已儲存');
      setIsDirty(false);
      setTimeout(() => setSuccessMsg(null), 3000);
      return true;
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        setError(err.response.data.detail || '儲存失敗');
      } else {
        setError('發生未預期錯誤');
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    await saveCurrentRolePermissions();
  };

  const handleSaveAndSwitch = async () => {
    const targetRoleId = confirmModal.targetRoleId;
    if (!targetRoleId) return;

    // 先儲存當前角色的變更，成功後才切換角色，避免使用者誤丟資料
    const ok = await saveCurrentRolePermissions();
    if (!ok) return;

    setSelectedRoleId(targetRoleId);
    setConfirmModal({ isOpen: false, targetRoleId: null });
  };

  // Helper to render function tree
  const renderFunction = (func: SystemFunction, level = 0) => {
    const isChecked = rolePermissions.has(func.id);
    const isRoleAdmin = roles.find(r => r.id === selectedRoleId)?.name === 'Admin';
    const isDisabled = isRoleAdmin;

    return (
      <div key={func.id} className="mb-2">
        <label className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 border-2 ${
          isDisabled ? 'cursor-not-allowed opacity-70 bg-gray-50' : 'cursor-pointer hover:bg-indigo-50/50'
        } ${
          isChecked 
            ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
            : 'bg-white border-transparent'
        }`}
        style={{ marginLeft: `${level * 1.5}rem` }}
        >
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors duration-200 ${
            isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
          }`}>
            {isChecked && <Check className="w-3.5 h-3.5 text-white stroke-3" />}
          </div>
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => handleTogglePermission(func.id)}
            className="hidden"
            disabled={isDisabled}
          />
          <div className="flex-1">
            <div className="font-bold text-gray-800">{func.name}</div>
            <div className="text-xs text-indigo-400 font-mono">{func.code}</div>
          </div>
        </label>
        
        {func.children && func.children.length > 0 && (
          <div className="mt-1 pl-4 border-l-2 border-indigo-100 ml-5">
            {func.children.map(child => renderFunction(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Lock className="w-8 h-8 text-indigo-600" />
            權限管理
          </h1>
          <p className="text-gray-500 mt-2 font-medium">配置角色可存取的系統功能與選單</p>
        </div>
        
        {successMsg && (
          <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <Check className="w-5 h-5" />
            {successMsg}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Roles List (Left) */}
        <div className="md:col-span-4 bg-white rounded-2xl shadow-sm border border-indigo-100/50 overflow-hidden">
          <div className="p-4 bg-linear-to-r from-indigo-50/50 to-purple-50/30 border-b border-indigo-100 font-black text-indigo-500 uppercase tracking-wider text-xs">
            選擇角色
          </div>
          {isLoading ? (
             <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600"/></div>
          ) : (
             <div className="divide-y divide-gray-100">
               {roles.map((role, index) => (
                 <button
                   key={role.id}
                   onClick={() => handleRoleSelect(role.id)}
                   className={`w-full text-left p-4 flex items-center justify-between transition-all duration-200 cursor-pointer ${
                     selectedRoleId === role.id 
                       ? 'bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-600' 
                       : `text-gray-600 hover:bg-indigo-50/30 hover:text-gray-900 font-medium border-l-4 border-transparent ${index % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`
                   }`}
                 >
                   <div className="flex items-center gap-3">
                     <span className="text-xs font-black text-indigo-300 w-6">{(index + 1).toString().padStart(2, '0')}</span>
                     <div className="flex items-center gap-2">
                        <Shield className={`w-4 h-4 ${selectedRoleId === role.id ? 'fill-current' : 'text-indigo-400'}`} />
                        {role.name}
                     </div>
                   </div>
                   {selectedRoleId === role.id && <ChevronRight className="w-4 h-4" />}
                 </button>
               ))}
             </div>
          )}
        </div>

        {/* Permissions Matrix (Right) */}
        <div className="md:col-span-8 bg-white rounded-2xl shadow-sm border border-indigo-100/50 overflow-hidden flex flex-col">
          <div className="p-4 bg-linear-to-r from-indigo-50/50 to-purple-50/30 border-b border-indigo-100 flex items-center justify-between sticky top-0 z-10">
            <div className="font-black text-indigo-500 uppercase tracking-wider text-xs">
              功能存取權限
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving || !selectedRoleId || roles.find(r => r.id === selectedRoleId)?.name === 'Admin' || !isDirty}
              className="bg-green-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-green-200 hover:bg-green-600 hover:shadow-lg active:scale-95 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              儲存設定
            </button>
          </div>
          
          <div className="p-6 h-[900px] overflow-y-auto">
             {error && (
                <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl font-bold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  {error}
                </div>
              )}
             {functions.length === 0 && !isLoading ? (
               <div className="text-center text-gray-400 py-10">無系統功能資料</div>
             ) : (
               <div className="space-y-1">
                 {functions.map(func => renderFunction(func))}
               </div>
             )}
          </div>
        </div>
      </div>

      <ConfirmModal 
          isOpen={confirmModal.isOpen} 
          title="未儲存的變更"
          message="您對目前角色的權限設定尚未儲存。切換角色將會遺失這些變更。您確定要繼續嗎？"
          extraText="儲存變更"
          onExtra={handleSaveAndSwitch}
          extraShowSaveIcon={true}
          isBusy={isSaving}
          confirmText="捨棄變更並切換"
          cancelText="取消"
          onConfirm={handleConfirmSwitch} 
          onCancel={() => setConfirmModal({ isOpen: false, targetRoleId: null })}
          isDestructive={true}
      />
    </div>
  );
};

export default PermissionManager;
