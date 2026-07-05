import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Briefcase, Plus, Loader2, Trash2, AlertCircle, Edit2, Eye, X, Users, Search, Check } from 'lucide-react';
import api from '../../api';

interface JobTitle {
  id: number;
  name: string;
  sort_order: number;
}

interface JobTitleUser {
  emp_id: string;
  name: string;
  department: string | null;
  role: string | null;
  status: string;
}

interface UserForAdd {
  emp_id: string;
  name: string;
  dept_id?: number | null;
  role_id?: number | null;
  department?: { name: string };
  job_title?: { id: number; name: string };
}

const JobTitleManager = () => {
  const [list, setList] = useState<JobTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobTitle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState<JobTitle | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [viewTarget, setViewTarget] = useState<JobTitle | null>(null);
  const [viewUsers, setViewUsers] = useState<JobTitleUser[]>([]);
  const [loadingView, setLoadingView] = useState(false);

  const [isAddingMember, setIsAddingMember] = useState(false);
  const [allUsers, setAllUsers] = useState<UserForAdd[]>([]);
  const [loadingAllUsers, setLoadingAllUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userDepartmentFilter, setUserDepartmentFilter] = useState<number | ''>('');
  const [userRoleFilter, setUserRoleFilter] = useState<number | ''>('');
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([]);
  const [roles, setRoles] = useState<Array<{ id: number; name: string }>>([]);
  const [editingMember, setEditingMember] = useState<JobTitleUser | null>(null);
  const [editingMemberNewJobTitleId, setEditingMemberNewJobTitleId] = useState<number | ''>('');
  const [removingMember, setRemovingMember] = useState<JobTitleUser | null>(null);
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);

  const fetchList = async () => {
    try {
      setLoading(true);
      const res = await api.get<JobTitle[]>('/admin/job-titles');
      setList(res.data || []);
    } catch (err) {
      console.error(err);
      setError('無法載入職務清單');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    setAdding(true);
    try {
      await api.post('/admin/job-titles', { name });
      setNewName('');
      await fetchList();
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setError(String(err.response.data.detail));
      } else {
        setError('新增失敗');
      }
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (item: JobTitle) => {
    setEditTarget(item);
    setEditName(item.name);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setSavingEdit(true);
    setError(null);
    try {
      await api.put(`/admin/job-titles/${editTarget.id}`, { name: editName.trim() });
      setEditTarget(null);
      await fetchList();
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setError(String(err.response.data.detail));
      } else {
        setError('更新失敗');
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const refetchViewUsers = async () => {
    if (!viewTarget) return;
    try {
      const res = await api.get<{ users: JobTitleUser[] }>(`/admin/job-titles/${viewTarget.id}/users`);
      setViewUsers(res.data?.users ?? []);
    } catch {
      setViewUsers([]);
    }
  };

  const openView = async (item: JobTitle) => {
    setViewTarget(item);
    setViewUsers([]);
    setLoadingView(true);
    try {
      const res = await api.get<{ users: JobTitleUser[] }>(`/admin/job-titles/${item.id}/users`);
      setViewUsers(res.data?.users ?? []);
    } catch (err) {
      console.error(err);
      setViewUsers([]);
    } finally {
      setLoadingView(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      setLoadingAllUsers(true);
      const res = await api.get<UserForAdd[]>('/admin/users');
      setAllUsers(res.data || []);
    } catch {
      setAllUsers([]);
    } finally {
      setLoadingAllUsers(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const [deptRes, roleRes] = await Promise.all([
        api
          .get<Array<{ id: number; name: string }>>('/admin/departments')
          .catch(() => ({ data: [] as Array<{ id: number; name: string }> })),
        api
          .get<Array<{ id: number; name: string }>>('/admin/roles')
          .catch(() => ({ data: [] as Array<{ id: number; name: string }> })),
      ]);
      setDepartments(deptRes.data ?? []);
      setRoles(roleRes.data ?? []);
    } catch {
      setDepartments([]);
      setRoles([]);
    }
  };

  const handleAddMemberToJobTitle = async (empId: string) => {
    if (!viewTarget) return;
    try {
      setIsSubmittingMember(true);
      setError(null);
      await api.put(`/admin/users/${empId}`, { job_title_id: viewTarget.id });
      await refetchViewUsers();
      await fetchList();
      setIsAddingMember(false);
      setUserSearchTerm('');
      setUserDepartmentFilter('');
      setUserRoleFilter('');
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setError(String(err.response.data.detail));
      } else {
        setError('新增成員失敗');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleEditMemberJobTitle = async () => {
    if (!editingMember || !viewTarget) return;
    try {
      setIsSubmittingMember(true);
      setError(null);
      await api.put(`/admin/users/${editingMember.emp_id}`, {
        job_title_id: editingMemberNewJobTitleId === '' ? null : editingMemberNewJobTitleId,
      });
      await refetchViewUsers();
      await fetchList();
      setEditingMember(null);
      setEditingMemberNewJobTitleId('');
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setError(String(err.response.data.detail));
      } else {
        setError('更新失敗');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleRemoveMemberFromJobTitle = async () => {
    if (!removingMember || !viewTarget) return;
    try {
      setIsSubmittingMember(true);
      setError(null);
      await api.put(`/admin/users/${removingMember.emp_id}`, { job_title_id: null });
      await refetchViewUsers();
      await fetchList();
      setRemovingMember(null);
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setError(String(err.response.data.detail));
      } else {
        setError('移除失敗');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/admin/job-titles/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchList();
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setError(String(err.response.data.detail));
      } else {
        setError('刪除失敗');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
          <Briefcase className="w-7 h-7 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">職務管理</h1>
          <p className="text-gray-500 text-sm">新增、編輯、查看、刪除職務，供人員管理中的「職務」欄位使用</p>
        </div>
      </header>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="輸入職務名稱（如：工程師）"
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            新增職務
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {list.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">尚無職務，請上方新增</div>
            ) : (
              list.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 even:bg-gray-50/50"
                >
                  <span className="font-bold text-gray-800">{item.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                      title="編輯"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openView(item)}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg cursor-pointer"
                      title="查看（此職務有哪些人）"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      title="刪除（需無人員綁定）"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 編輯 Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-black text-gray-900 mb-4">編輯職務名稱</h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              placeholder="職務名稱"
            />
            {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold">{error}</div>}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setEditTarget(null); setError(null); }} className="px-4 py-2 rounded-lg font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 cursor-pointer" disabled={savingEdit}>取消</button>
              <button type="button" onClick={handleSaveEdit} disabled={savingEdit || !editName.trim()} className="px-4 py-2 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer disabled:opacity-50 flex items-center gap-2">
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : null}儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 查看 Modal（與單位管理相同：標題、共 N 位、新增成員、每列編輯/移除） */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">職務「{viewTarget.name}」的人員</h3>
                  <p className="text-sm font-bold text-indigo-600/70">共 {viewUsers.length} 位使用者</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setUserSearchTerm('');
                    setUserDepartmentFilter('');
                    setUserRoleFilter('');
                    setIsAddingMember(true);
                    await Promise.all([fetchAllUsers(), fetchFilterOptions()]);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 text-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  新增成員
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewTarget(null);
                    setIsAddingMember(false);
                    setEditingMember(null);
                    setRemovingMember(null);
                    setUserSearchTerm('');
                    setUserDepartmentFilter('');
                    setUserRoleFilter('');
                  }}
                  className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {loadingView ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-gray-500 font-bold">載入中...</p>
                </div>
              ) : viewUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
                    <Users className="w-8 h-8 text-indigo-300" />
                  </div>
                  <p className="text-gray-500 font-bold">此職務尚無人員</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {viewUsers.map((user) => (
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
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{user.role ?? '—'}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                          {user.status === 'active' ? '啟用' : '停用'}
                        </span>
                        {user.emp_id.toLowerCase() !== 'admin' && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button type="button" onClick={() => { setEditingMember(user); setEditingMemberNewJobTitleId(viewTarget.id); }} className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg cursor-pointer" title="編輯成員職務">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setRemovingMember(user)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer" title="移出此職務">
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
                  setViewTarget(null);
                  setIsAddingMember(false);
                  setEditingMember(null);
                  setRemovingMember(null);
                  setUserSearchTerm('');
                  setUserDepartmentFilter('');
                  setUserRoleFilter('');
                }}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 cursor-pointer"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增成員到職務 */}
      {isAddingMember && viewTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-green-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-green-600" />
                新增成員到 職務「{viewTarget.name}」
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddingMember(false);
                  setUserSearchTerm('');
                  setUserDepartmentFilter('');
                  setUserRoleFilter('');
                }}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
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
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-indigo-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-bold"
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
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
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
                </div>
              </div>
              {loadingAllUsers ? (
                <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {allUsers
                    .filter((u) => {
                      const alreadyIn = viewUsers.some((v) => v.emp_id === u.emp_id);
                      if (alreadyIn) return false;
                      if (userDepartmentFilter !== '' && (u.dept_id ?? null) !== userDepartmentFilter) {
                        return false;
                      }
                      if (userRoleFilter !== '' && (u.role_id ?? null) !== userRoleFilter) {
                        return false;
                      }
                      if (userSearchTerm) {
                        const q = userSearchTerm.toLowerCase();
                        return u.name.toLowerCase().includes(q) || u.emp_id.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .map((user) => (
                      <button
                        key={user.emp_id}
                        type="button"
                        onClick={() => handleAddMemberToJobTitle(user.emp_id)}
                        disabled={isSubmittingMember}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-green-50 rounded-xl text-left group cursor-pointer disabled:opacity-50 transition-all duration-200"
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
                  {allUsers.filter((u) => {
                    const alreadyIn = viewUsers.some((v) => v.emp_id === u.emp_id);
                    if (alreadyIn) return false;
                    if (userDepartmentFilter !== '' && (u.dept_id ?? null) !== userDepartmentFilter) {
                      return false;
                    }
                    if (userRoleFilter !== '' && (u.role_id ?? null) !== userRoleFilter) {
                      return false;
                    }
                    if (userSearchTerm) {
                      const q = userSearchTerm.toLowerCase();
                      return u.name.toLowerCase().includes(q) || u.emp_id.toLowerCase().includes(q);
                    }
                    return true;
                  }).length === 0 && (
                    <div className="text-center py-12 text-gray-400 font-bold">
                      {userSearchTerm || userDepartmentFilter !== '' || userRoleFilter !== ''
                        ? '找不到符合條件的用戶'
                        : '所有用戶都已在此職務中'}
                    </div>
                  )}
                </div>
              )}
              {error && <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
            </div>
            <div className="p-4 bg-gray-50 border-t">
              <button
                type="button"
                onClick={() => {
                  setIsAddingMember(false);
                  setUserSearchTerm('');
                  setUserDepartmentFilter('');
                  setUserRoleFilter('');
                }}
                className="w-full py-2.5 bg-gray-600 text-white rounded-xl font-bold hover:bg-gray-700 cursor-pointer"
                disabled={isSubmittingMember}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯成員職務 */}
      {editingMember && viewTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2"><Edit2 className="w-5 h-5 text-indigo-600" />編輯成員職務</h3>
              <button type="button" onClick={() => { setEditingMember(null); setEditingMemberNewJobTitleId(''); }} className="text-gray-400 hover:text-gray-600 cursor-pointer" disabled={isSubmittingMember}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                <div className="flex justify-between"><span className="text-sm text-gray-500 font-bold">員工編號</span><span className="text-sm font-mono font-black text-gray-800">{editingMember.emp_id}</span></div>
                <div className="flex justify-between"><span className="text-sm text-gray-500 font-bold">姓名</span><span className="text-sm font-black text-gray-800">{editingMember.name}</span></div>
                <div className="flex justify-between"><span className="text-sm text-gray-500 font-bold">目前職務</span><span className="text-sm font-black text-gray-800">{viewTarget.name}</span></div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">職務</label>
                <select value={editingMemberNewJobTitleId === '' ? '' : editingMemberNewJobTitleId} onChange={(e) => setEditingMemberNewJobTitleId(e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 font-medium cursor-pointer" disabled={isSubmittingMember}>
                  <option value="">未設定</option>
                  {list.map((jt) => (<option key={jt.id} value={jt.id}>{jt.name}</option>))}
                </select>
              </div>
              {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3">
              <button type="button" onClick={() => { setEditingMember(null); setEditingMemberNewJobTitleId(''); }} className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 cursor-pointer" disabled={isSubmittingMember}>取消</button>
              <button type="button" onClick={handleEditMemberJobTitle} disabled={isSubmittingMember} className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50">
                {isSubmittingMember ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}確認變更
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移除成員（移出此職務） */}
      {removingMember && viewTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-red-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" />移除成員</h3>
              <button type="button" onClick={() => setRemovingMember(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer" disabled={isSubmittingMember}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2 bg-red-50/50 p-4 rounded-xl border border-red-100">
                <p className="text-sm font-bold text-gray-700">確定要將 <span className="text-red-600 font-black">{removingMember.name}</span> 從職務「<span className="text-red-600 font-black">{viewTarget.name}</span>」移除嗎？</p>
                <p className="text-xs text-gray-500">移除後該員職務將為未設定。</p>
              </div>
              {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
            </div>
            <div className="p-6 border-t bg-gray-50 flex gap-3">
              <button type="button" onClick={() => setRemovingMember(null)} className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 cursor-pointer" disabled={isSubmittingMember}>取消</button>
              <button type="button" onClick={handleRemoveMemberFromJobTitle} disabled={isSubmittingMember} className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50">
                {isSubmittingMember ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}確認移除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-black text-gray-900 mb-2">確認刪除職務</h3>
            <p className="text-gray-600 text-sm mb-4">
              確定要刪除「{deleteTarget.name}」？若尚有使用者綁定此職務，將無法刪除。
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold">{error}</div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setError(null); }}
                className="px-4 py-2 rounded-lg font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 cursor-pointer"
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobTitleManager;
