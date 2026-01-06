import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Search, Edit2, Check, X, User as UserIcon, Shield, Building2, Loader2, AlertCircle } from 'lucide-react';
import api from '../../api';

interface User {
  emp_id: string;
  name: string;
  dept_id: number;
  role_id: number | null;
  status: string;
  department?: {
    id: number;
    name: string;
  };
  role?: {
    id: number;
    name: string;
  };
}

interface Role {
  id: number;
  name: string;
}

interface Department {
  id: number;
  name: string;
}

const UserManager = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    role_id: 0,
    dept_id: 0,
    status: 'active'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [usersRes, rolesRes, deptsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/roles'),
        api.get('/admin/departments')
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
      setDepartments(deptsRes.data);
    } catch (err) {
      console.error('Failed to fetch data', err);
      setError('無法載入資料');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({
      role_id: user.role_id || 0,
      dept_id: user.dept_id,
      status: user.status
    });
  };

  const handleRowClick = (empId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(empId)) {
        newSelected.delete(empId);
    } else {
        newSelected.add(empId);
    }
    setSelectedUserIds(newSelected);
  }

  const handleSave = async () => {
    if (!editingUser) return;
    
    try {
      setIsSubmitting(true);
      setError(null);
      
      const payload = {
        role_id: editForm.role_id === 0 ? null : editForm.role_id,
        dept_id: editForm.dept_id,
        status: editForm.status
      };

      await api.put(`/admin/users/${editingUser.emp_id}`, payload);
      
      // Update local state
      setUsers(users.map(u => 
        u.emp_id === editingUser.emp_id 
          ? { 
              ...u, 
              ...payload, 
              role: roles.find(r => r.id === payload.role_id),
              department: departments.find(d => d.id === payload.dept_id)
            } 
          : u
      ));
      
      setEditingUser(null);
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

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.emp_id.includes(searchTerm)
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <UserIcon className="w-8 h-8 text-blue-600" />
            人員管理
          </h1>
          <p className="text-gray-500 mt-2 font-medium">檢視與管理系統使用者、角色及單位分配</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="搜尋姓名或員工編號..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl transition-all outline-none font-bold text-gray-700 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
            <p className="font-bold">載入使用者資料中...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-black text-gray-400 uppercase tracking-wider w-16">項次</th>
                  <th className="px-6 py-4 text-left text-sm font-black text-gray-400 uppercase tracking-wider">員工編號</th>
                  <th className="px-6 py-4 text-left text-sm font-black text-gray-400 uppercase tracking-wider">姓名</th>
                  <th className="px-6 py-4 text-left text-sm font-black text-gray-400 uppercase tracking-wider">部門</th>
                  <th className="px-6 py-4 text-left text-sm font-black text-gray-400 uppercase tracking-wider">角色</th>
                  <th className="px-6 py-4 text-left text-sm font-black text-gray-400 uppercase tracking-wider">狀態</th>
                  <th className="px-6 py-4 text-right text-sm font-black text-gray-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user, index) => {
                    const isSelected = selectedUserIds.has(user.emp_id);
                    return (
                  <tr 
                    key={user.emp_id} 
                    className={`table-row-zebra table-row-hover transition-colors group ${isSelected ? 'table-row-active' : ''}`}
                    onClick={() => handleRowClick(user.emp_id)}
                    onDoubleClick={() => handleEdit(user)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap border-l-4 border-transparent text-sm font-black text-gray-300">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-l-4 border-transparent">
                      <div className="text-sm font-bold text-gray-900 font-mono">{user.emp_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                          {user.name[0]}
                        </div>
                        <div className="text-sm font-bold text-gray-900">{user.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        {user.department?.name || '無部門'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.role ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          user.role.name === 'Admin' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          <Shield className="w-3 h-3 mr-1" />
                          {user.role.name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 italic">未分配</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        user.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {user.status === 'active' ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(user); }}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                編輯使用者
              </h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                 <div className="flex justify-between">
                    <span className="text-sm text-gray-500 font-bold">員工編號</span>
                    <span className="text-sm font-mono font-black text-gray-800">{editingUser.emp_id}</span>
                 </div>
                 <div className="flex justify-between">
                    <span className="text-sm text-gray-500 font-bold">姓名</span>
                    <span className="text-sm font-black text-gray-800">{editingUser.name}</span>
                 </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">部門</label>
                <select
                  value={editForm.dept_id}
                  disabled={editingUser.emp_id.toLowerCase() === 'admin'}
                  onChange={(e) => setEditForm({ ...editForm, dept_id: Number(e.target.value) })}
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition-all font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">角色</label>
                <select
                  value={editForm.role_id || 0}
                  disabled={editingUser.emp_id.toLowerCase() === 'admin'}
                  onChange={(e) => setEditForm({ ...editForm, role_id: Number(e.target.value) })}
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition-all font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value={0}>未分配</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">狀態</label>
                <select
                  value={editForm.status}
                  disabled={editingUser.emp_id.toLowerCase() === 'admin'}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition-all font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="active">啟用 (Active)</option>
                  <option value="inactive">停用 (Inactive)</option>
                </select>
                {editingUser.emp_id.toLowerCase() === 'admin' && (
                    <p className="text-xs text-red-500 mt-1 font-bold">預設管理員不可停用</p>
                )}
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
                onClick={() => setEditingUser(null)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-blue-600 shadow-md shadow-blue-200 hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManager;
