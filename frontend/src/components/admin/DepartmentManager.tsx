import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Plus, Edit2, Trash2, Check, X, Building2, Search, Loader2, AlertCircle, Users } from 'lucide-react';
import api from '../../api';

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
  
  // Create / Edit state
  const [isEditing, setIsEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');

  // Error Modal State
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Users Modal State
  const [viewingDeptUsers, setViewingDeptUsers] = useState<DepartmentUsersData | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

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
      const res = await api.get<DepartmentUsersData>(`/admin/departments/${deptId}/users`);
      setViewingDeptUsers(res.data);
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

  const filteredDepts = departments.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-500 font-bold animate-pulse">正在載入單位資料...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500 relative">
      {/* Error Modal */}
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

      {/* Users Modal */}
      {viewingDeptUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">{viewingDeptUsers.department_name}</h3>
                  <p className="text-sm font-bold text-gray-500">共 {viewingDeptUsers.user_count} 位使用者</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingDeptUsers(null)}
                className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-blue-600" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {loadingUsers ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-gray-500 font-bold">載入中...</p>
                </div>
              ) : viewingDeptUsers.users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                    <Users className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 font-bold">目前無使用者</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {viewingDeptUsers.users.map((user) => (
                    <div
                      key={user.emp_id}
                      className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm">
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
                            : 'bg-blue-100 text-blue-700'
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setViewingDeptUsers(null)}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all active:scale-95"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <Building2 className="w-8 h-8 text-blue-600" />
            單位管理
          </h1>
          <p className="text-sm text-gray-500 font-bold mt-1">管理系統內的組織部門與課別清單</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:scale-105 active:scale-95 transition-all text-sm"
        >
          <Plus className="w-5 h-5" />
          <span>新增單位</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-gray-100/50 border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋單位名稱..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/30">
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider w-24 text-center">ID</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">單位名稱</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isAdding && (
                <tr className="bg-blue-50/20 animate-in fade-in slide-in-from-top-1 duration-200">
                  <td className="px-6 py-4 text-center text-sm font-bold text-blue-400 italic">NEW</td>
                  <td className="px-6 py-4">
                    <input
                      autoFocus
                      type="text"
                      className="w-full sm:w-80 px-4 py-2 border-2 border-blue-400 rounded-xl text-sm font-bold focus:outline-none shadow-sm shadow-blue-50 transition-all"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                      placeholder="例如：IT 資訊部"
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={handleAdd} className="p-2.5 text-green-600 hover:bg-green-100 rounded-xl transition-all shadow-sm bg-white hover:scale-110">
                        <Check className="w-5 h-5" />
                      </button>
                      <button type="button" onClick={() => setIsAdding(false)} className="p-2.5 text-red-600 hover:bg-red-100 rounded-xl transition-all shadow-sm bg-white hover:scale-110">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              
              {filteredDepts.length === 0 && !isAdding ? (
                <tr>
                  <td colSpan={3} className="px-6 py-16 text-center text-gray-400 font-bold italic">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 opacity-20" />
                      目前沒有任何單位資料
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDepts.map((dept) => (
                  <tr key={dept.id} className="table-row-zebra table-row-hover transition-colors group">
                    <td className="px-6 py-4 text-center text-sm font-mono text-gray-400 font-medium">#{dept.id}</td>
                    <td className="px-6 py-4">
                      {isEditing === dept.id ? (
                        <input
                          autoFocus
                          type="text"
                          className="w-full sm:w-80 px-4 py-2 border-2 border-blue-400 rounded-xl text-sm font-bold focus:outline-none shadow-sm shadow-blue-50 transition-all"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdate(dept.id)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleViewUsers(dept.id)}
                          className="font-bold text-gray-700 hover:text-blue-600 hover:underline transition-colors text-left flex items-center gap-2 group/name"
                        >
                          <span>{dept.name}</span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full group-hover/name:bg-blue-100 group-hover/name:text-blue-600 transition-colors">
                            {dept.user_count} 人
                          </span>
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isEditing === dept.id ? (
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={(e) => handleUpdate(dept.id, e)} className="p-2.5 text-green-600 hover:bg-green-100 rounded-xl transition-all shadow-sm bg-white">
                            <Check className="w-5 h-5" />
                          </button>
                          <button type="button" onClick={() => setIsEditing(null)} className="p-2.5 text-red-600 hover:bg-red-100 rounded-xl transition-all shadow-sm bg-white">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-1 group-hover:translate-x-0">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditing(dept.id);
                              setEditName(dept.name);
                            }}
                            className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(dept.id, e)}
                            className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
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
      </div>
      
      <div className="mt-6 flex items-center gap-2 text-[11px] text-gray-400 font-bold px-2 uppercase tracking-tighter">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          全系統單位同步中 • 資料受 RBAC 保護
      </div>
    </div>
  );
};

export default DepartmentManager;
