import { useState, useEffect, useMemo, useCallback } from 'react';
import { AxiosError } from 'axios';
import { Search, Edit2, Check, X, User as UserIcon, Shield, Building2, Loader2, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown, Trash2 } from 'lucide-react';
import api from '../../api';
import Pagination from '../common/Pagination';

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
  
  // 編輯狀態
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    role_id: 0,
    dept_id: 0,
    status: 'active'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  
  // 刪除狀態
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // 排序狀態
  const [sortConfig, setSortConfig] = useState<{
    field: 'emp_id' | 'name' | 'dept_id' | 'role_id' | 'status' | null;
    direction: 'asc' | 'desc' | null;
  }>({
    field: 'emp_id', // 預設按員工編號
    direction: 'asc'  // 預設遞增
  });
  
  // 分頁狀態
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      setIsDeleting(true);
      await api.delete(`/admin/users/${deleteTarget.emp_id}`);
      
      // 從列表中移除
      setUsers(users.filter(u => u.emp_id !== deleteTarget.emp_id));
      setDeleteTarget(null);
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        setError(err.response.data.detail || '刪除失敗');
      } else {
        setError('發生未預期錯誤');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // 排序邏輯函數（使用 useCallback 避免依賴問題）
  const getSortedUsers = useCallback((usersToSort: User[]) => {
    // 1. 分離 admin 和其他用戶
    const adminUser = usersToSort.find(u => u.emp_id.toLowerCase() === 'admin');
    const otherUsers = usersToSort.filter(u => u.emp_id.toLowerCase() !== 'admin');
    
    // 2. 對其他用戶進行排序
    const sortedOthers = [...otherUsers];
    
    // 如果沒有排序設定，使用預設排序（員工編號遞增）
    const effectiveField = sortConfig.field || 'emp_id';
    const effectiveDirection = sortConfig.direction || 'asc';
    
    sortedOthers.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;
      
      switch (effectiveField) {
        case 'emp_id':
          aValue = a.emp_id;
          bValue = b.emp_id;
          break;
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'dept_id':
          aValue = a.department?.name || '';
          bValue = b.department?.name || '';
          break;
        case 'role_id':
          aValue = a.role?.name || '';
          bValue = b.role?.name || '';
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }
      
      // 字串比較（使用 localeCompare 支援中文）
      const comparison = String(aValue).localeCompare(String(bValue), 'zh-TW');
      return effectiveDirection === 'asc' ? comparison : -comparison;
    });
    
    // 3. 合併：admin 在前，其他在後
    return adminUser ? [adminUser, ...sortedOthers] : sortedOthers;
  }, [sortConfig]);

  // 表頭點擊處理
  const handleSort = (field: 'emp_id' | 'name' | 'dept_id' | 'role_id' | 'status') => {
    setSortConfig(prev => {
      // 如果點擊的是當前欄位，切換排序方向
      if (prev.field === field) {
        if (prev.direction === 'asc') {
          // 遞增 → 遞減
          return { field, direction: 'desc' };
        } else if (prev.direction === 'desc') {
          // 遞減 → 無排序（回到預設）
          return { field: null, direction: null };
        }
      }
      // 點擊新欄位，設為遞增
      return { field, direction: 'asc' };
    });
  };

  // 整合搜尋與排序
  const processedUsers = useMemo(() => {
    // 1. 搜尋過濾
    const filtered = users.filter(user => 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      user.emp_id.includes(searchTerm)
    );
    
    // 2. 排序（包含 admin 固定第一）
    return getSortedUsers(filtered);
  }, [users, searchTerm, getSortedUsers]);

  // 分頁計算
  const totalPages = Math.ceil(processedUsers.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUsers = processedUsers.slice(startIndex, endIndex);

  // 當搜尋或每頁筆數改變時，重置到第一頁
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <UserIcon className="w-8 h-8 text-indigo-600" />
            人員管理
          </h1>
          <p className="text-gray-500 mt-2 font-medium">檢視與管理系統使用者、角色及單位分配</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100/50">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="搜尋姓名或員工編號..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl transition-all duration-200 outline-none font-bold text-gray-700 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-indigo-100/50 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-600" />
            <p className="font-bold">載入使用者資料中...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-indigo-50/50 to-purple-50/30 border-b border-indigo-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider w-16">項次</th>
                  <th 
                    onClick={() => handleSort('emp_id')}
                    className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider cursor-pointer hover:bg-indigo-50 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2">
                      <span>員工編號</span>
                      {sortConfig.field === 'emp_id' ? (
                        sortConfig.direction === 'asc' ? (
                          <ArrowUp className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-4 h-4 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('name')}
                    className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider cursor-pointer hover:bg-indigo-50 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2">
                      <span>姓名</span>
                      {sortConfig.field === 'name' ? (
                        sortConfig.direction === 'asc' ? (
                          <ArrowUp className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-4 h-4 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('dept_id')}
                    className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider cursor-pointer hover:bg-indigo-50 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2">
                      <span>部門</span>
                      {sortConfig.field === 'dept_id' ? (
                        sortConfig.direction === 'asc' ? (
                          <ArrowUp className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-4 h-4 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('role_id')}
                    className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider cursor-pointer hover:bg-indigo-50 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2">
                      <span>角色</span>
                      {sortConfig.field === 'role_id' ? (
                        sortConfig.direction === 'asc' ? (
                          <ArrowUp className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-4 h-4 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('status')}
                    className="px-6 py-4 text-left text-sm font-black text-indigo-500 uppercase tracking-wider cursor-pointer hover:bg-indigo-50 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2">
                      <span>狀態</span>
                      {sortConfig.field === 'status' ? (
                        sortConfig.direction === 'asc' ? (
                          <ArrowUp className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-4 h-4 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-black text-indigo-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedUsers.map((user, index) => {
                    const isSelected = selectedUserIds.has(user.emp_id);
                    const displayIndex = startIndex + index + 1;
                    return (
                  <tr 
                    key={user.emp_id} 
                    className={`transition-all duration-200 group cursor-pointer ${
                      isSelected 
                        ? 'bg-indigo-50 border-l-4 border-l-indigo-500' 
                        : 'hover:bg-indigo-50/30 even:bg-gray-50/50'
                    }`}
                    onClick={() => handleRowClick(user.emp_id)}
                    onDoubleClick={() => handleEdit(user)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-300">
                      {displayIndex}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 font-mono">{user.emp_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                          {user.name[0]}
                        </div>
                        <div className="text-sm font-bold text-gray-900">{user.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
                        <Building2 className="w-4 h-4 text-indigo-400" />
                        {user.department?.name || '無部門'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.role ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          user.role.name === 'Admin' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-indigo-100 text-indigo-700'
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
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(user); }}
                          className="text-gray-400 hover:text-indigo-600 transition-all duration-200 p-2 hover:bg-indigo-50 rounded-lg cursor-pointer"
                          title="編輯"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {user.emp_id.toLowerCase() !== 'admin' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(user); }}
                            className="text-gray-400 hover:text-red-500 transition-all duration-200 p-2 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="刪除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* 分頁控制 */}
        {!isLoading && processedUsers.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={processedUsers.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600" />
                編輯使用者
              </h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors duration-200 cursor-pointer"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
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
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200 font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200 font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200 font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-indigo-600 shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-red-100 bg-gradient-to-r from-red-50 to-orange-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                確認刪除
              </h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-2 bg-red-50/50 p-4 rounded-xl border border-red-100">
                <p className="text-sm font-bold text-gray-700">
                  確定要刪除以下使用者？
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-white font-bold">
                    {deleteTarget.name[0]}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{deleteTarget.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{deleteTarget.emp_id}</div>
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-red-600 font-bold flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                此操作無法復原，請確認後再進行。
              </p>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setError(null); }}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 bg-white border-2 border-gray-200 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-600 shadow-md shadow-red-200 hover:bg-red-700 hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManager;
