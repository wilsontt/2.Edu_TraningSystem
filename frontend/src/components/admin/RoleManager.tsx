import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Plus, Shield, Check, X, Loader2, AlertCircle, PenTool, Trash2, Search } from 'lucide-react';
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
    roleId?: number;
    roleName?: string;
  }>({ isOpen: false, title: '', items: [], type: 'user' });
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // 成員管理狀態
  const [isAddingMemberToRole, setIsAddingMemberToRole] = useState(false);
  const [removingMemberFromRole, setRemovingMemberFromRole] = useState<{emp_id: string; name: string} | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{emp_id: string; name: string; role_id: number | null; dept_id?: number | null; department?: {name: string}; job_title?: {id: number; name: string}}>>([]);
  const [loadingAllUsers, _setLoadingAllUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userDepartmentFilter, setUserDepartmentFilter] = useState<number | ''>('');
  const [userJobTitleFilter, setUserJobTitleFilter] = useState<number | ''>('');
  const [departments, setDepartments] = useState<Array<{id: number; name: string}>>([]);
  const [jobTitles, setJobTitles] = useState<Array<{id: number; name: string}>>([]);
  const [targetRoleId, setTargetRoleId] = useState<number | null>(null);
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);
  const [roleUsers, setRoleUsers] = useState<Array<{emp_id: string; name: string; role_id: number}>>([]);
  
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
      return res.data; // 返回角色列表
    } catch (err) {
      console.error('Failed to fetch roles', err);
      return [];
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
    setDetailModal({ isOpen: true, title: `載入中...`, items: [], type, roleId: role.id, roleName: role.name });
    
    try {
        let items: string[] = [];
        if (type === 'user') {
            // 取得該角色的使用者列表 (目前改用前端過濾，未來可改為後端API)
            const res = await api.get('/admin/users');
            const users = res.data.filter((u: { role_id: number; name: string; emp_id: string }) => u.role_id === role.id);
            items = users.map((u: { name: string; emp_id: string }) => `${u.name} (${u.emp_id})`);
            setRoleUsers(users);
            // 預載入所有用戶列表（用於新增成員）
            setAllUsers(res.data);
            // 一併載入部門/職務清單（用於新增成員時篩選）
            const [deptRes, jtRes] = await Promise.all([
              api
                .get<Array<{id: number; name: string}>>('/admin/departments')
                .catch(() => ({ data: [] as Array<{id: number; name: string}> })),
              api
                .get<Array<{id: number; name: string}>>('/admin/job-titles')
                .catch(() => ({ data: [] as Array<{id: number; name: string}> })),
            ]);
            setDepartments(deptRes.data || []);
            setJobTitles(jtRes.data || []);
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
            type,
            roleId: role.id,
            roleName: role.name
        });
    } catch (err) {
        console.error(err);
        setDetailModal({ isOpen: false, title: '', items: [], type: 'user' });
    } finally {
        setLoadingDetail(false);
    }
  };

  const handleAddMemberToRole = async (empId: string) => {
    if (!detailModal.roleId) return;
    
    try {
      setIsSubmittingMember(true);
      setError(null);
      await api.put(`/admin/users/${empId}`, {
        role_id: detailModal.roleId
      });
      // 重新載入角色列表以更新成員數
      const updatedRoles = await fetchRoles();
      // 重新載入成員列表
      const role = updatedRoles.find((r: Role) => r.id === detailModal.roleId);
      if (role) {
        await handleShowDetail(role, 'user');
      }
      setIsAddingMemberToRole(false);
      setUserSearchTerm('');
      setUserDepartmentFilter('');
      setUserJobTitleFilter('');
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        setError(err.response.data.detail || '新增成員失敗');
      } else {
        setError('發生未預期錯誤');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleRemoveMemberFromRole = async () => {
    if (!removingMemberFromRole || !detailModal.roleId || !targetRoleId) return;
    
    try {
      setIsSubmittingMember(true);
      setError(null);
      await api.put(`/admin/users/${removingMemberFromRole.emp_id}`, {
        role_id: targetRoleId
      });
      // 重新載入角色列表以更新成員數
      const updatedRoles = await fetchRoles();
      // 重新載入成員列表
      const role = updatedRoles.find((r: Role) => r.id === detailModal.roleId);
      if (role) {
        await handleShowDetail(role, 'user');
      }
      setRemovingMemberFromRole(null);
      setTargetRoleId(null);
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        setError(err.response.data.detail || '移除成員失敗');
      } else {
        setError('發生未預期錯誤');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Shield className="w-8 h-8 text-indigo-600" />
            角色管理
          </h1>
          <p className="text-gray-500 mt-2 font-medium">管理系統角色與權限群組</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-green-500 text-white px-5 py-3 rounded-xl font-bold hover:bg-green-600 hover:shadow-green-300 transition-all duration-200 shadow-lg shadow-green-200 hover:shadow-xl hover:scale-105 hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          新增角色
        </button>
      </div>

      {/* Role List */}
      <div className="bg-white rounded-2xl shadow-sm border border-indigo-100/50 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-600" />
            <p className="font-bold">載入角色資料中...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {roles.map((role, index) => (
              <div 
                key={role.id} 
                className={`p-6 border-2 border-gray-100 rounded-2xl hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/50 transition-all duration-200 group cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`}
                onDoubleClick={() => {
                  if (role.name !== 'Admin') {
                    openEditModal(role);
                  }
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                    <Shield className="w-5 h-5" />
                  </div>
                  {/* <span className="text-xs font-black text-gray-300 uppercase">ID: {role.id}</span> */}
                  <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">NO. {index + 1}</span>
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center justify-between group/title">
                    {role.name}
                    {role.name !== 'Admin' && (
                        <div className="flex gap-1">
                            <button 
                                onClick={() => openEditModal(role)}
                                className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200 p-1.5 rounded-lg cursor-pointer"
                                title="編輯角色名稱"
                            >
                                <PenTool className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => handleDeleteClick(role)}
                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200 p-1.5 rounded-lg cursor-pointer"
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
                        className="flex-1 bg-gray-50 hover:bg-indigo-50 p-2.5 rounded-xl text-center transition-all duration-200 group/btn cursor-pointer"
                    >
                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1 group-hover/btn:text-indigo-600">成員</div>
                        <div className="text-xl font-black text-gray-800 group-hover/btn:text-indigo-700">{role.user_count} <span className="text-xs text-gray-400 font-medium">人</span></div>
                    </button>
                    <button 
                        onClick={() => handleShowDetail(role, 'function')}
                        className="flex-1 bg-gray-50 hover:bg-indigo-50 p-2.5 rounded-xl text-center transition-all duration-200 group/btn cursor-pointer"
                    >
                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1 group-hover/btn:text-indigo-600">權限</div>
                        <div className="text-xl font-black text-gray-800 group-hover/btn:text-indigo-700">{role.function_count} <span className="text-xs text-gray-400 font-medium">個</span></div>
                    </button>
                </div>
              </div>
            ))}
            
            {roles.length === 0 && (
              <div className="col-span-full p-12 text-center text-gray-400 border-2 border-dashed border-indigo-200 rounded-2xl">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>尚無角色設定</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal (Members or Permissions) */}
      {detailModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <h3 className="text-lg font-black text-gray-900">
                {detailModal.title}
              </h3>
              <div className="flex items-center gap-2">
                {detailModal.type === 'user' && detailModal.roleId && (
                  <button
                    onClick={() => {
                      setUserSearchTerm('');
                      setUserDepartmentFilter('');
                      setUserJobTitleFilter('');
                      setIsAddingMemberToRole(true);
                      if (allUsers.length === 0) {
                        api.get('/admin/users').then(res => setAllUsers(res.data));
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 hover:shadow-md transition-all duration-200 text-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    新增成員
                  </button>
                )}
                <button 
                  onClick={() => {
                    setDetailModal({ ...detailModal, isOpen: false });
                    setIsAddingMemberToRole(false);
                    setRemovingMemberFromRole(null);
                    setUserSearchTerm('');
                    setUserDepartmentFilter('');
                    setUserJobTitleFilter('');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
                {loadingDetail ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                      <p className="text-gray-500 font-bold">載入中...</p>
                    </div>
                ) : detailModal.type === 'user' ? (
                    <div className="space-y-3">
                        {roleUsers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                              <Shield className="w-8 h-8 text-indigo-400" />
                            </div>
                            <p className="text-gray-500 font-bold">目前無成員</p>
                          </div>
                        ) : (
                          roleUsers.map((user: {emp_id: string; name: string; role_id: number}, uIdx: number) => (
                            <div
                              key={user.emp_id}
                              className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 group cursor-pointer hover:bg-indigo-50/50 ${uIdx % 2 === 0 ? 'bg-gray-100' : 'bg-white'}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm">
                                  {user.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">{user.name}</p>
                                  <p className="text-xs text-gray-500 font-medium">員工編號：{user.emp_id}</p>
                                </div>
                              </div>
                              {user.emp_id.toLowerCase() !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => setRemovingMemberFromRole({emp_id: user.emp_id, name: user.name})}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 cursor-pointer"
                                  title="移除成員"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {detailModal.items.map((item, idx) => (
                            <div key={idx} className={`p-4 text-sm font-bold text-gray-700 hover:bg-indigo-50/50 transition-colors duration-200 ${idx % 2 === 0 ? 'bg-gray-100' : 'bg-white'}`}>
                                {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setDetailModal({ ...detailModal, isOpen: false });
                  setIsAddingMemberToRole(false);
                  setRemovingMemberFromRole(null);
                  setUserSearchTerm('');
                  setUserDepartmentFilter('');
                  setUserJobTitleFilter('');
                }}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增成員到角色對話框 */}
      {isAddingMemberToRole && detailModal.roleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-green-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-green-600" />
                新增成員到 {detailModal.roleName}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddingMemberToRole(false);
                  setUserSearchTerm('');
                  setUserDepartmentFilter('');
                  setUserJobTitleFilter('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors duration-200 cursor-pointer"
                disabled={isSubmittingMember}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="搜尋用戶姓名或員工編號..."
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-indigo-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-200 font-bold"
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-600">單位</span>
                    <select
                      value={userDepartmentFilter === '' ? '' : userDepartmentFilter}
                      onChange={(e) => setUserDepartmentFilter(e.target.value === '' ? '' : Number(e.target.value))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="">全部</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-600">職務</span>
                    <select
                      value={userJobTitleFilter === '' ? '' : userJobTitleFilter}
                      onChange={(e) => setUserJobTitleFilter(e.target.value === '' ? '' : Number(e.target.value))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="">全部</option>
                      {jobTitles.map((jt) => (
                        <option key={jt.id} value={jt.id}>{jt.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {loadingAllUsers ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-gray-500 font-bold">載入用戶列表中...</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {allUsers
                    .filter(user => {
                      if (user.role_id === detailModal.roleId) return false;
                      if (userDepartmentFilter !== '' && (user.dept_id ?? null) !== userDepartmentFilter) return false;
                      if (userJobTitleFilter !== '' && (user.job_title?.id ?? null) !== userJobTitleFilter) return false;
                      if (userSearchTerm) {
                        const searchLower = userSearchTerm.toLowerCase();
                        return user.name.toLowerCase().includes(searchLower) || 
                               user.emp_id.toLowerCase().includes(searchLower);
                      }
                      return true;
                    })
                    .map((user) => (
                      <button
                        key={user.emp_id}
                        type="button"
                        onClick={() => handleAddMemberToRole(user.emp_id)}
                        disabled={isSubmittingMember}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-green-50 rounded-xl transition-all duration-200 text-left group disabled:opacity-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{user.name}</p>
                            <p className="text-xs text-gray-500 font-medium">員工編號：{user.emp_id}</p>
                            {user.department && (
                              <p className="text-xs text-gray-400 font-medium">部門：{user.department.name}</p>
                            )}
                            {user.job_title && (
                              <p className="text-xs text-indigo-600 font-medium">職務：{user.job_title.name}</p>
                            )}
                          </div>
                        </div>
                        {isSubmittingMember ? (
                          <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                        ) : (
                          <Plus className="w-5 h-5 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                        )}
                      </button>
                    ))}
                  {allUsers.filter(user => {
                    if (user.role_id === detailModal.roleId) return false;
                    if (userDepartmentFilter !== '' && (user.dept_id ?? null) !== userDepartmentFilter) return false;
                    if (userJobTitleFilter !== '' && (user.job_title?.id ?? null) !== userJobTitleFilter) return false;
                    if (userSearchTerm) {
                      const searchLower = userSearchTerm.toLowerCase();
                      return user.name.toLowerCase().includes(searchLower) || 
                             user.emp_id.toLowerCase().includes(searchLower);
                    }
                    return true;
                  }).length === 0 && (
                    <div className="text-center py-12 text-gray-400 font-bold">
                      {userSearchTerm || userDepartmentFilter !== '' || userJobTitleFilter !== ''
                        ? '找不到符合條件的用戶'
                        : '所有用戶都已擁有此角色'}
                    </div>
                  )}
                </div>
              )}
              
              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setIsAddingMemberToRole(false);
                  setError(null);
                  setUserSearchTerm('');
                  setUserDepartmentFilter('');
                  setUserJobTitleFilter('');
                }}
                className="w-full py-2.5 bg-gray-600 text-white rounded-xl font-bold hover:bg-gray-700 transition-all duration-200 active:scale-95 cursor-pointer"
                disabled={isSubmittingMember}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移除成員確認對話框 */}
      {removingMemberFromRole && detailModal.roleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-red-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                移除成員角色
              </h3>
              <button
                type="button"
                onClick={() => {
                  setRemovingMemberFromRole(null);
                  setTargetRoleId(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isSubmittingMember}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-2 bg-red-50/50 p-4 rounded-xl border border-red-100">
                <p className="text-sm font-bold text-gray-700">
                  確定要將 <span className="text-red-600 font-black">{removingMemberFromRole.name}</span> 從 <span className="text-red-600 font-black">{detailModal.roleName}</span> 角色移除嗎？
                </p>
                <p className="text-xs text-gray-500 font-medium">每個帳號都必須至少有一個角色，請選擇目標角色</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">移至角色 <span className="text-red-500">*</span></label>
                <select
                  value={targetRoleId || ''}
                  onChange={(e) => setTargetRoleId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-red-500 outline-none transition-all font-medium text-gray-800"
                  disabled={isSubmittingMember}
                  required
                >
                  <option value="">請選擇目標角色</option>
                  {roles
                    .filter(role => role.id !== detailModal.roleId)
                    .map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                </select>
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setRemovingMemberFromRole(null);
                  setTargetRoleId(null);
                  setError(null);
                }}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all"
                disabled={isSubmittingMember}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleRemoveMemberFromRole}
                disabled={isSubmittingMember || !targetRoleId}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-600 shadow-md shadow-red-200 hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingMember ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                確認移除
              </button>
            </div>
          </div>
        </div>
      )}
      
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-green-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-green-600" />
                新增角色
              </h3>
              <button 
                onClick={() => setIsAdding(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors duration-200 cursor-pointer"
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
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none transition-all duration-200 font-bold text-gray-800 placeholder:font-normal"
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
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleAddRole}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-green-500 shadow-md shadow-green-200 hover:bg-green-600 hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
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
            <div className="p-6 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <PenTool className="w-5 h-5 text-indigo-600" />
                編輯角色
              </h3>
              <button 
                onClick={() => setIsEditing(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors duration-200 cursor-pointer"
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
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200 font-bold text-gray-800 placeholder:font-normal"
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
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all duration-200 cursor-pointer"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleEditRole}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-indigo-600 shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
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
