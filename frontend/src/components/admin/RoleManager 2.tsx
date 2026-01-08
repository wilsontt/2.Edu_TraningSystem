import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Search, Plus, Shield, Check, X, Loader2, AlertCircle } from 'lucide-react';
import api from '../../api';

interface Role {
  id: number;
  name: string;
  user_count: number;
  function_count: number;
}

const RoleManager = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Detail Modal State
  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    title: string;
    items: string[];
    type: 'user' | 'function';
  }>({ isOpen: false, title: '', items: [], type: 'user' });
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Create State
  const [isAdding, setIsAdding] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoles();
  }, []);

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


  const handleShowDetail = async (role: Role, type: 'user' | 'function') => {
    setLoadingDetail(true);
    setDetailModal({ isOpen: true, title: `載入中...`, items: [], type });
    
    try {
        let items: string[] = [];
        if (type === 'user') {
            // Fetch users for this role. 
            // Since we don't have a specific API for this yet, we can filter all users (inefficient but works for now)
            // OR reuse get_users and filter. 
            // Better: Add an API or just fetch all users if not too many.
            // Let's use the /admin/users endpoint and filter client side for now as per plan.
            // Wait, we don't want to fetch all users every time.
            // Let's assume we can add a query param or just simple implementation:
            const res = await api.get('/admin/users');
            items = res.data.filter((u: any) => u.role_id === role.id).map((u: any) => `${u.name} (${u.emp_id})`);
        } else {
            // Fetch permissions. We have an API for IDs, but we need names.
            // We need to fetch all functions to map IDs to names.
            const [permRes, funcRes] = await Promise.all([
                api.get(`/admin/roles/${role.id}/permissions`),
                api.get('/admin/functions')
            ]);
            
            // Flatten functions to find names
            const getAllFuncs = (funcs: any[]): any[] => {
                let all: any[] = [];
                funcs.forEach(f => {
                    all.push(f);
                    if (f.children) all = all.concat(getAllFuncs(f.children));
                });
                return all;
            };
            const allFuncs = getAllFuncs(funcRes.data);
            const permIds = new Set(permRes.data);
            items = allFuncs.filter(f => permIds.has(f.id)).map(f => f.name);
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
            {roles.map((role) => (
              <div key={role.id} className="p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-purple-200 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                    <Shield className="w-5 h-5" />
                  </div>
                  {/* <span className="text-xs font-black text-gray-300 uppercase">ID: {role.id}</span> */}
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-4">{role.name}</h3>
                
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
    </div>
  );
};

export default RoleManager;
