import { useState, useEffect, useMemo } from 'react';
import { AxiosError } from 'axios';
import { Plus, Edit2, Trash2, Check, X, Building2, Search, Loader2, AlertCircle, Users } from 'lucide-react';
import api from '../../api';
import Pagination from '../common/Pagination';

interface Department {
  id: number;
  name: string;
  user_count: number;
}

interface DepartmentUser {
  emp_id: string;
  name: string;
  role: string;
  status: string;
}

interface DepartmentUsersData {
  department_id: number;
  department_name: string;
  user_count: number;
  users: DepartmentUser[];
}

const DepartmentManager = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 分頁狀態
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // 新增/編輯狀態
  const [isEditing, setIsEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');

  // 錯誤模態框狀態
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 使用者模態框狀態
  const [viewingDeptUsers, setViewingDeptUsers] = useState<DepartmentUsersData | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // 成員管理狀態
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<DepartmentUser | null>(null);
  const [removingMember, setRemovingMember] = useState<DepartmentUser | null>(null);
  const [allUsers, setAllUsers] = useState<
    Array<{
      emp_id: string;
      name: string;
      dept_id: number;
      role_id?: number | null;
      department?: { name: string };
      job_title?: { id: number; name: string };
    }>
  >([]);
  const [loadingAllUsers, setLoadingAllUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<number | ''>('');
  const [userJobTitleFilter, setUserJobTitleFilter] = useState<number | ''>('');
  const [roles, setRoles] = useState<Array<{ id: number; name: string }>>([]);
  const [jobTitles, setJobTitles] = useState<Array<{ id: number; name: string }>>([]);
  const [targetDeptId, setTargetDeptId] = useState<number | null>(null);
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/admin/departments');
      setDepartments(res.data);
    } catch (err: unknown) {
      console.error('獲取單位清單失敗', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleAdd = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.post('/admin/departments', { name: newName });
      setNewName('');
      setIsAdding(false);
      fetchDepartments();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage('新增失敗');
      }
    }
  };

  const handleUpdate = async (id: number, e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!editName.trim()) return;
    try {
      await api.put(`/admin/departments/${id}`, { name: editName });
      setIsEditing(null);
      fetchDepartments();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage('更新失敗');
      }
    }
  };

  const handleDelete = async (id: number, e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!window.confirm('確定要刪除此單位嗎？')) return;
    try {
      await api.delete(`/admin/departments/${id}`);
      fetchDepartments();
    } catch (err: unknown) {
      // 優先檢查是否為 AxiosError 並取得後端錯誤訊息
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage('刪除失敗，請檢查網路連線或是稍後再試');
      }
    }
  };

  const handleViewUsers = async (deptId: number) => {
    setLoadingUsers(true);
    try {
      const [res, roleRes, jtRes] = await Promise.all([
        api.get<DepartmentUsersData>(`/admin/departments/${deptId}/users`),
        api
          .get<Array<{ id: number; name: string }>>('/admin/roles')
          .catch(() => ({ data: [] as Array<{ id: number; name: string }> })),
        api
          .get<Array<{ id: number; name: string }>>('/admin/job-titles')
          .catch(() => ({ data: [] as Array<{ id: number; name: string }> })),
      ]);
      setViewingDeptUsers(res.data);
      setRoles(roleRes.data ?? []);
      setJobTitles(jtRes.data ?? []);
      // 預載入所有用戶列表（用於新增成員）
      await fetchAllUsers();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage('無法載入使用者清單');
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      setLoadingAllUsers(true);
      const res = await api.get('/admin/users');
      setAllUsers(res.data);
    } catch (err) {
      console.error('無法載入所有用戶', err);
    } finally {
      setLoadingAllUsers(false);
    }
  };

  const handleAddMember = async (empId: string) => {
    if (!viewingDeptUsers) return;
    
    try {
      setIsSubmittingMember(true);
      setErrorMessage(null);
      await api.put(`/admin/users/${empId}`, {
        dept_id: viewingDeptUsers.department_id
      });
      // 重新載入單位列表以更新成員數
      await fetchDepartments();
      // 重新載入成員列表
      await handleViewUsers(viewingDeptUsers.department_id);
      setIsAddingMember(false);
      setUserSearchTerm('');
      setUserRoleFilter('');
      setUserJobTitleFilter('');
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage('新增成員失敗');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleEditMember = async (newDeptId: number) => {
    if (!editingMember || !viewingDeptUsers) return;
    
    try {
      setIsSubmittingMember(true);
      setErrorMessage(null);
      await api.put(`/admin/users/${editingMember.emp_id}`, {
        dept_id: newDeptId
      });
      // 重新載入單位列表以更新成員數（A單位和B單位都需要更新）
      await fetchDepartments();
      // 重新載入成員列表
      await handleViewUsers(viewingDeptUsers.department_id);
      setEditingMember(null);
      setTargetDeptId(null);
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage('更新成員失敗');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removingMember || !viewingDeptUsers || !targetDeptId) return;
    
    try {
      setIsSubmittingMember(true);
      setErrorMessage(null);
      await api.put(`/admin/users/${removingMember.emp_id}`, {
        dept_id: targetDeptId
      });
      // 重新載入單位列表以更新成員數（A單位和B單位都需要更新）
      await fetchDepartments();
      // 重新載入成員列表
      await handleViewUsers(viewingDeptUsers.department_id);
      setRemovingMember(null);
      setTargetDeptId(null);
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage('移除成員失敗');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  // 按單位名稱排序，然後過濾
  const filteredDepts = useMemo(() => {
    const sorted = [...departments].sort((a, b) => a.name.localeCompare(b.name));
    return sorted.filter(d => 
      d.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [departments, searchTerm]);

  // 分頁計算
  const totalPages = Math.ceil(filteredDepts.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedDepts = filteredDepts.slice(startIndex, startIndex + pageSize);

  // 當搜尋條件改變時，重置到第一頁
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        <p className="text-gray-500 font-bold animate-pulse">正在載入單位資料...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500 relative">
      {/* 錯誤模態框 */}
      {errorMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-gray-900">操作失敗</h3>
                <p className="text-sm font-bold text-gray-500">{errorMessage}</p>
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all active:scale-95"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 使用者模態框 */}
      {viewingDeptUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">{viewingDeptUsers.department_name}</h3>
                  <p className="text-sm font-bold text-indigo-600/70">共 {viewingDeptUsers.user_count} 位使用者</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUserSearchTerm('');
                    setUserRoleFilter('');
                    setUserJobTitleFilter('');
                    setIsAddingMember(true);
                    fetchAllUsers();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 hover:shadow-md transition-all duration-200 text-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  新增成員
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewingDeptUsers(null);
                    setIsAddingMember(false);
                    setEditingMember(null);
                    setRemovingMember(null);
                    setUserSearchTerm('');
                    setUserRoleFilter('');
                    setUserJobTitleFilter('');
                  }}
                  className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all duration-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {loadingUsers ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-gray-500 font-bold">載入中...</p>
                </div>
              ) : viewingDeptUsers.users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
                    <Users className="w-8 h-8 text-indigo-300" />
                  </div>
                  <p className="text-gray-500 font-bold">目前無使用者</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {viewingDeptUsers.users.map((user) => (
                    <div
                      key={user.emp_id}
                      className="flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50/50 rounded-xl transition-all duration-200 group cursor-pointer"
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
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          user.role === 'Admin' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {user.role}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          user.status === 'active' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {user.status === 'active' ? '啟用' : '停用'}
                        </span>
                        {user.emp_id.toLowerCase() !== 'admin' && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button
                              type="button"
                              onClick={() => setEditingMember(user)}
                              className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all duration-200 cursor-pointer"
                              title="編輯成員"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemovingMember(user)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 cursor-pointer"
                              title="移除成員"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setViewingDeptUsers(null);
                  setIsAddingMember(false);
                  setEditingMember(null);
                  setRemovingMember(null);
                  setUserSearchTerm('');
                  setUserRoleFilter('');
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

      {/* 新增成員對話框 */}
      {isAddingMember && viewingDeptUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-green-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-green-600" />
                新增成員到 {viewingDeptUsers.department_name}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddingMember(false);
                  setUserSearchTerm('');
                  setUserRoleFilter('');
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
                    <span className="text-sm font-bold text-gray-600">角色</span>
                    <select
                      value={userRoleFilter === '' ? '' : userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value === '' ? '' : Number(e.target.value))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="">全部</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
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
                        <option key={jt.id} value={jt.id}>
                          {jt.name}
                        </option>
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
                    .filter((user) => {
                      const isInCurrentDept = viewingDeptUsers.users.some((u) => u.emp_id === user.emp_id);
                      if (isInCurrentDept) return false;
                      if (userRoleFilter !== '' && (user.role_id ?? null) !== userRoleFilter) {
                        return false;
                      }
                      if (userJobTitleFilter !== '' && (user.job_title?.id ?? null) !== userJobTitleFilter) {
                        return false;
                      }
                      if (userSearchTerm) {
                        const searchLower = userSearchTerm.toLowerCase();
                        return (
                          user.name.toLowerCase().includes(searchLower) ||
                          user.emp_id.toLowerCase().includes(searchLower)
                        );
                      }
                      return true;
                    })
                    .map((user) => (
                      <button
                        key={user.emp_id}
                        type="button"
                        onClick={() => handleAddMember(user.emp_id)}
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
                              <p className="text-xs text-gray-400 font-medium">目前部門：{user.department.name}</p>
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
                  {allUsers.filter((user) => {
                    const isInCurrentDept = viewingDeptUsers.users.some((u) => u.emp_id === user.emp_id);
                    if (isInCurrentDept) return false;
                    if (userRoleFilter !== '' && (user.role_id ?? null) !== userRoleFilter) {
                      return false;
                    }
                    if (userJobTitleFilter !== '' && (user.job_title?.id ?? null) !== userJobTitleFilter) {
                      return false;
                    }
                    if (userSearchTerm) {
                      const searchLower = userSearchTerm.toLowerCase();
                      return (
                        user.name.toLowerCase().includes(searchLower) ||
                        user.emp_id.toLowerCase().includes(searchLower)
                      );
                    }
                    return true;
                  }).length === 0 && (
                    <div className="text-center py-12 text-gray-400 font-bold">
                      {userSearchTerm || userRoleFilter !== '' || userJobTitleFilter !== ''
                        ? '找不到符合條件的用戶'
                        : '所有用戶都已在此部門中'}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setIsAddingMember(false);
                  setUserSearchTerm('');
                  setUserRoleFilter('');
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

      {/* 編輯成員對話框 */}
      {editingMember && viewingDeptUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600" />
                編輯成員部門
              </h3>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors duration-200 cursor-pointer"
                disabled={isSubmittingMember}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 font-bold">員工編號</span>
                  <span className="text-sm font-mono font-black text-gray-800">{editingMember.emp_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 font-bold">姓名</span>
                  <span className="text-sm font-black text-gray-800">{editingMember.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 font-bold">目前部門</span>
                  <span className="text-sm font-black text-gray-800">{viewingDeptUsers.department_name}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">移至部門</label>
                <select
                  value={targetDeptId || ''}
                  onChange={(e) => setTargetDeptId(Number(e.target.value))}
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200 font-medium text-gray-800 cursor-pointer"
                  disabled={isSubmittingMember}
                >
                  <option value="">請選擇部門</option>
                  {departments
                    .filter(dept => dept.id !== viewingDeptUsers.department_id)
                    .map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                </select>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {errorMessage}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all duration-200 cursor-pointer"
                disabled={isSubmittingMember}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => targetDeptId && handleEditMember(targetDeptId)}
                disabled={!targetDeptId || isSubmittingMember}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-indigo-600 shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmittingMember ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                確認變更
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移除成員確認對話框 */}
      {removingMember && viewingDeptUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-red-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                移除成員
              </h3>
              <button
                type="button"
                onClick={() => {
                  setRemovingMember(null);
                  setTargetDeptId(null);
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
                  確定要將 <span className="text-red-600 font-black">{removingMember.name}</span> 從 <span className="text-red-600 font-black">{viewingDeptUsers.department_name}</span> 移除嗎？
                </p>
                <p className="text-xs text-gray-500 font-medium">請選擇目標部門，成員將被移至該部門</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">移至部門</label>
                <select
                  value={targetDeptId || ''}
                  onChange={(e) => setTargetDeptId(Number(e.target.value))}
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-red-500 outline-none transition-all font-medium text-gray-800"
                  disabled={isSubmittingMember}
                >
                  <option value="">請選擇目標部門</option>
                  {departments
                    .filter(dept => dept.id !== viewingDeptUsers.department_id)
                    .map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                </select>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {errorMessage}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setRemovingMember(null);
                  setTargetDeptId(null);
                }}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all"
                disabled={isSubmittingMember}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleRemoveMember}
                disabled={!targetDeptId || isSubmittingMember}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-600 shadow-md shadow-red-200 hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingMember ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                確認移除
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <Building2 className="w-8 h-8 text-indigo-600" />
            單位管理
          </h1>
          <p className="text-sm text-gray-500 font-bold mt-1">管理系統內的組織部門與課別清單</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-200 hover:bg-green-600 hover:shadow-green-300 hover:scale-105 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 text-sm cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>新增單位</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/50 border border-indigo-100/50 overflow-hidden">
        <div className="p-4 border-b border-indigo-100/50 bg-indigo-50/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋單位名稱..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-200 font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-50/50 to-purple-50/30">
                <th className="px-6 py-4 text-xs font-black text-indigo-500 uppercase tracking-wider w-24 text-center">項次</th>
                <th className="px-6 py-4 text-xs font-black text-indigo-500 uppercase tracking-wider">單位名稱</th>
                <th className="px-6 py-4 text-xs font-black text-indigo-500 uppercase tracking-wider text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isAdding && (
                <tr className="bg-gradient-to-r from-green-50/50 to-emerald-50/30 animate-in fade-in slide-in-from-top-1 duration-200">
                  <td className="px-6 py-4 text-center text-sm font-bold text-green-500 italic">NEW</td>
                  <td className="px-6 py-4">
                    <input
                      autoFocus
                      type="text"
                      className="w-full sm:w-80 px-4 py-2.5 border-2 border-green-400 rounded-xl text-sm font-bold focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 shadow-sm shadow-green-50 transition-all duration-200"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                      placeholder="例如：IT 資訊部"
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={handleAdd} className="p-2.5 text-green-600 hover:bg-green-100 rounded-xl transition-all duration-200 shadow-sm bg-white hover:scale-110 hover:shadow-md cursor-pointer">
                        <Check className="w-5 h-5" />
                      </button>
                      <button type="button" onClick={() => setIsAdding(false)} className="p-2.5 text-red-600 hover:bg-red-100 rounded-xl transition-all duration-200 shadow-sm bg-white hover:scale-110 hover:shadow-md cursor-pointer">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              
              {paginatedDepts.length === 0 && !isAdding ? (
                <tr>
                  <td colSpan={3} className="px-6 py-16 text-center text-gray-400 font-bold italic">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 opacity-20" />
                      目前沒有任何單位資料
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedDepts.map((dept, index) => (
                  <tr 
                    key={dept.id} 
                    className={`transition-all duration-200 group cursor-pointer ${
                      isEditing === dept.id 
                        ? 'bg-indigo-50/50 border-l-4 border-l-indigo-500' 
                        : 'hover:bg-indigo-50/30 even:bg-gray-100'
                    }`}
                    onDoubleClick={() => {
                      setIsEditing(dept.id);
                      setEditName(dept.name);
                    }}
                  >
                    <td className="px-6 py-4 text-center text-sm font-mono text-gray-400 font-medium">{startIndex + index + 1}</td>
                    <td className="px-6 py-4">
                      {isEditing === dept.id ? (
                        <input
                          autoFocus
                          type="text"
                          className="w-full sm:w-80 px-4 py-2.5 border-2 border-indigo-400 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-sm shadow-indigo-50 transition-all duration-200"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdate(dept.id)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleViewUsers(dept.id)}
                          className="font-bold text-gray-700 hover:text-indigo-600 transition-colors duration-200 text-left flex items-center gap-2 group/name cursor-pointer"
                        >
                          <span>{dept.name}</span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full group-hover/name:bg-indigo-100 group-hover/name:text-indigo-600 transition-colors duration-200">
                            {dept.user_count} 人
                          </span>
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isEditing === dept.id ? (
                        <div className="flex justify-end gap-2">
                          <button 
                            type="button"
                            onClick={() => handleViewUsers(dept.id)}
                            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 hover:shadow-md transition-all duration-200 text-sm cursor-pointer"
                          >
                            <Users className="w-4 h-4" />
                            查看成員
                          </button>
                          <button type="button" onClick={(e) => handleUpdate(dept.id, e)} className="p-2.5 text-green-600 hover:bg-green-100 rounded-xl transition-all duration-200 shadow-sm bg-white hover:scale-110 hover:shadow-md cursor-pointer">
                            <Check className="w-5 h-5" />
                          </button>
                          <button type="button" onClick={() => setIsEditing(null)} className="p-2.5 text-red-600 hover:bg-red-100 rounded-xl transition-all duration-200 shadow-sm bg-white hover:scale-110 hover:shadow-md cursor-pointer">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleViewUsers(dept.id)}
                            className="p-2.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-xl transition-all duration-200 cursor-pointer"
                            title="查看成員"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditing(dept.id);
                              setEditName(dept.name);
                            }}
                            className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200 opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="編輯單位名稱"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(dept.id, e)}
                            className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="刪除單位"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* 分頁控制 */}
        {!loading && filteredDepts.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredDepts.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        )}
      </div>
      
      <div className="mt-6 flex items-center gap-2 text-[11px] text-indigo-400 font-bold px-2 uppercase tracking-tighter">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          全系統單位同步中 • 資料受 RBAC 保護
      </div>
    </div>
  );
};

export default DepartmentManager;
