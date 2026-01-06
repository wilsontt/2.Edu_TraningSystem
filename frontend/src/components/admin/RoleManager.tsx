import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Plus, Shield, Check, X, Loader2, AlertCircle, PenTool, Trash2 } from 'lucide-react';
import api from '../../api';
import ConfirmModal from '../ConfirmModal';

/** 角色資料結構 */
interface Role {
  /** 角色 ID */
  id: number;
  /** 角色名稱 (如: Admin, User) */
  name: string;
  /** 該角色下的使用者數量 */
  user_count: number;
  /** 該角色擁有的權限功能數量 */
  function_count: number;
}

/**
 * 角色管理組件
 * 
 * 提供角色的列表顯示、新增、編輯與刪除功能。
 * 包含查看角色成員與權限詳情的模態框。
 */
const RoleManager = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 詳情模態框狀態 (顯示成員或權限列表)
  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    title: string;
    items: string[];
    type: 'user' | 'function';
  }>({ isOpen: false, title: '', items: [], type: 'user' });
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // 新增/編輯狀態
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // 刪除確認模態框狀態
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; roleId: number | null }>({ isOpen: false, roleId: null });

  useEffect(() => {
    fetchRoles();
  }, []);

  /** 取得角色列表 */
  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/admin/roles');
      setRoles(res.data);
    } catch (err) {
      console.error('Failed to fetch roles', err);
    } finally {
      setIsLoading(false);
    }
  };

  /** 處理新增角色 */
  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    
    try {
      setIsSubmitting(true);
      setError(null);
      
      const res = await api.post('/admin/roles', { name: newRoleName });
      setRoles([...roles, res.data]);
      setIsAdding(false);
      setNewRoleName('');
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        setError(err.response.data.detail || '新增失敗');
      } else {
        setError('發生未預期錯誤');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 開啟編輯模態框 */
  const openEditModal = (role: Role) => {
    setEditingRole(role);
    setNewRoleName(role.name);
    setError(null);
    setIsEditing(true);
  };

  /** 處理編輯角色保存 */
  const handleEditRole = async () => {
    if (!newRoleName.trim() || !editingRole) return;
    
    try {
      setIsSubmitting(true);
      setError(null);
      
      const res = await api.put(`/admin/roles/${editingRole.id}`, { name: newRoleName });
      
      setRoles(roles.map(r => r.id === editingRole.id ? { ...r, name: res.data.name } : r));
      setIsEditing(false);
      setEditingRole(null);
      setNewRoleName('');
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        setError(err.response.data.detail || '更新失敗');
      } else {
        setError('發生未預期錯誤');
      }
    } finally {
      setIsSubmitting(false);
    }

  };

  /** 點擊刪除按鈕 (開啟確認框) */
  const handleDeleteClick = (role: Role) => {
      setDeleteModal({ isOpen: true, roleId: role.id });
  };

  /** 確認刪除角色 */
  const handleConfirmDelete = async () => {
      if (!deleteModal.roleId) return;
      
      try {
          // 呼叫 API 進行刪除
          await api.delete(`/admin/roles/${deleteModal.roleId}`);
          
          // 更新本地列表
          setRoles(roles.filter(r => r.id !== deleteModal.roleId));
          setDeleteModal({ isOpen: false, roleId: null });
      } catch (err) {
          if (err instanceof AxiosError && err.response) {
            alert(err.response.data.detail || '刪除失敗');
          } else {
            alert('發生未預期錯誤');
          }
           setDeleteModal({ isOpen: false, roleId: null });
      }
  };


  /** 顯示詳情 (成員或權限) */
  const handleShowDetail = async (role: Role, type: 'user' | 'function') => {
    setLoadingDetail(true);
    setDetailModal({ isOpen: true, title: `載入中...`, items: [], type });
    
    try {
        let items: string[] = [];
        if (type === 'user') {
            // 取得該角色的使用者列表 (目前改用前端過濾，未來可改為後端API)
            const res = await api.get('/admin/users');
            items = res.data.filter((u: { role_id: number; name: string; emp_id: string }) => u.role_id === role.id).map((u: { name: string; emp_id: string }) => `${u.name} (${u.emp_id})`);
        } else {
            // 取得權限列表，需將 ID 轉換為功能名稱
            const [permRes, funcRes] = await Promise.all([
                api.get(`/admin/roles/${role.id}/permissions`),
                api.get('/admin/functions')
            ]);
            
            // 遞迴攤平功能樹以取得完整路徑名稱
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const getAllFuncs = (funcs: any[], parentPath: string = ''): any[] => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let all: any[] = [];
                funcs.forEach(f => {
                    const currentPath = parentPath ? `${parentPath} \\ ${f.name}` : f.name;
                    // Add current item with full path name
                    all.push({ ...f, name: currentPath });
                    
                    if (f.children) {
                        all = all.concat(getAllFuncs(f.children, currentPath));
                    }
                });
                return all;
            };
            const allFuncs = getAllFuncs(funcRes.data);
            const permIds = new Set(permRes.data);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            items = allFuncs.filter((f: any) => permIds.has(f.id)).map((f: any) => f.name);
        }
        
        setDetailModal({
            isOpen: true,
            title: `${role.name} 的${type === 'user' ? '成員' : '權限'}清單`,
            items: items.length > 0 ? items : ['(無資料)'],
            type
        });
    } catch (err) {
        console.error(err);
        setDetailModal({ isOpen: false, title: '', items: [], type: 'user' });
    } finally {
        setLoadingDetail(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-600" />
            角色管理
          </h1>
          <p className="text-gray-500 mt-2 font-medium">管理系統角色與權限群組</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-gray-900 text-white px-5 py-3 rounded-xl font-bold hover:bg-black transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          新增角色
        </button>
      </div>

      {/* Role List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-purple-500" />
            <p className="font-bold">載入角色資料中...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {roles.map((role, index) => (
              <div key={role.id} className="p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-purple-200 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                    <Shield className="w-5 h-5" />
                  </div>
                  {/* <span className="text-xs font-black text-gray-300 uppercase">ID: {role.id}</span> */}
                  <span className="text-xs font-black text-gray-300 uppercase tracking-widest">NO. {index + 1}</span>
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center justify-between group/title">
                    {role.name}
                    {role.name !== 'Admin' && (
                        <div className="flex gap-1">
                            <button 
                                onClick={() => openEditModal(role)}
                                className="text-gray-400 hover:text-blue-500 transition-all p-1"
                                title="編輯角色名稱"
                            >
                                <PenTool className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => handleDeleteClick(role)}
                                className="text-gray-400 hover:text-red-500 transition-all p-1"
                                title="刪除角色"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </h3>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => handleShowDetail(role, 'user')}
                        className="flex-1 bg-gray-50 hover:bg-purple-50 p-2 rounded-xl text-center transition-colors group/btn"
                    >
                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1 group-hover/btn:text-purple-600">成員</div>
                        <div className="text-xl font-black text-gray-800 group-hover/btn:text-purple-700">{role.user_count} <span className="text-xs text-gray-400 font-medium">人</span></div>
                    </button>
                    <button 
                        onClick={() => handleShowDetail(role, 'function')}
                        className="flex-1 bg-gray-50 hover:bg-purple-50 p-2 rounded-xl text-center transition-colors group/btn"
                    >
                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1 group-hover/btn:text-purple-600">權限</div>
                        <div className="text-xl font-black text-gray-800 group-hover/btn:text-purple-700">{role.function_count} <span className="text-xs text-gray-400 font-medium">個</span></div>
                    </button>
                </div>
              </div>
            ))}
            
            {roles.length === 0 && (
              <div className="col-span-full p-12 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>尚無角色設定</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Role Modal */}
      {detailModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="text-base font-black text-gray-900">
                {detailModal.title}
              </h3>
              <button 
                onClick={() => setDetailModal({ ...detailModal, isOpen: false })}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-0 max-h-[60vh] overflow-y-auto">
                {loadingDetail ? (
                    <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300"/></div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {detailModal.items.map((item, idx) => (
                            <div key={idx} className="p-4 text-sm font-bold text-gray-700 hover:bg-gray-50">
                                {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </div>
        </div>
      )}
      
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-purple-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-600" />
                新增角色
              </h3>
              <button 
                onClick={() => setIsAdding(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">角色名稱</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="例如：IT 管理員"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-purple-500 outline-none transition-all font-bold text-gray-800 placeholder:font-normal"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                onClick={() => setIsAdding(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleAddRole}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-purple-600 shadow-md shadow-purple-200 hover:bg-purple-700 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                確認新增
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Role Modal */}
      {isEditing && editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-purple-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <PenTool className="w-5 h-5 text-purple-600" />
                編輯角色
              </h3>
              <button 
                onClick={() => setIsEditing(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">角色名稱</label>
                <input
                  autoFocus
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-purple-500 outline-none transition-all font-bold text-gray-800 placeholder:font-normal"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleEditRole}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-purple-600 shadow-md shadow-purple-200 hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}


      <ConfirmModal 
          isOpen={deleteModal.isOpen} 
          title="刪除角色"
          message="確定要刪除此角色嗎？此動作無法復原。請確保該角色已無任何成員與權限設定。"
          confirmText="確認刪除"
          cancelText="取消"
          onConfirm={handleConfirmDelete} 
          onCancel={() => setDeleteModal({ isOpen: false, roleId: null })}
          isDestructive={true}
      />
    </div>
  );
};

export default RoleManager;
