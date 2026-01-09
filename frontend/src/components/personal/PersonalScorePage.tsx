import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { User, Search } from 'lucide-react';
import api from '../../api';
import PersonalScoreOverview from './PersonalScoreOverview';
import PersonalScoreHistory from './PersonalScoreHistory';
import PersonalLearningAnalysis from './PersonalLearningAnalysis';

type TabType = 'overview' | 'history' | 'analysis';

interface UserOption {
  emp_id: string;
  name: string;
  dept_name?: string;
}

export default function PersonalScorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [showUserSelector, setShowUserSelector] = useState(false);

  useEffect(() => {
    // 從 URL 參數讀取 emp_id
    const empIdFromUrl = searchParams.get('emp_id');
    if (empIdFromUrl) {
      setSelectedEmpId(empIdFromUrl);
      // 找到對應的使用者名稱
      const user = users.find(u => u.emp_id === empIdFromUrl);
      if (user) {
        setUserSearchTerm(`${user.name} (${user.emp_id})`);
      }
    }
  }, [searchParams, users]);

  useEffect(() => {
    // 檢查是否為 Admin
    const checkAdmin = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get('/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = response.data;
        setIsAdmin(user.role === 'Admin');
        
        // 如果是 Admin，載入使用者列表
        if (user.role === 'Admin') {
          const usersRes = await api.get('/admin/users');
          const usersList = usersRes.data.map((u: any) => ({
            emp_id: u.emp_id,
            name: u.name,
            dept_name: u.department?.name
          }));
          setUsers(usersList);
          
          // 如果 URL 有 emp_id，設定選中的使用者
          const empIdFromUrl = searchParams.get('emp_id');
          if (empIdFromUrl) {
            const user = usersList.find((u: UserOption) => u.emp_id === empIdFromUrl);
            if (user) {
              setSelectedEmpId(empIdFromUrl);
              setUserSearchTerm(`${user.name} (${user.emp_id})`);
            }
          }
        }
      } catch (error) {
        console.error('Failed to check admin status', error);
      }
    };
    checkAdmin();
  }, [searchParams]);

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    u.emp_id.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    (u.dept_name && u.dept_name.toLowerCase().includes(userSearchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Admin 員工選擇器 */}
      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <User className="h-5 w-5 mr-2 text-blue-500" />
              查看成績
            </h3>
            {selectedEmpId && (
              <button
                onClick={() => {
                  setSelectedEmpId(null);
                  setShowUserSelector(false);
                  setUserSearchTerm('');
                  setSearchParams({});
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                查看自己的成績
              </button>
            )}
          </div>
          
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜尋員工姓名、編號或部門..."
                  value={userSearchTerm}
                  onChange={(e) => {
                    setUserSearchTerm(e.target.value);
                    setShowUserSelector(true);
                  }}
                  onFocus={() => setShowUserSelector(true)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            {showUserSelector && filteredUsers.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredUsers.map((user) => (
                  <button
                    key={user.emp_id}
                    onClick={() => {
                      setSelectedEmpId(user.emp_id);
                      setShowUserSelector(false);
                      setUserSearchTerm(`${user.name} (${user.emp_id})`);
                      // 更新 URL 參數
                      setSearchParams({ emp_id: user.emp_id });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-medium text-gray-900">{user.name}</div>
                    <div className="text-sm text-gray-500">
                      {user.emp_id} {user.dept_name && `• ${user.dept_name}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {selectedEmpId && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-gray-600">目前查看：</div>
              <div className="font-medium text-gray-900">
                {users.find(u => u.emp_id === selectedEmpId)?.name} ({selectedEmpId})
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 切換 */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={clsx(
            "px-4 py-2 text-sm font-medium rounded-md transition-all",
            activeTab === 'overview'
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          總覽
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={clsx(
            "px-4 py-2 text-sm font-medium rounded-md transition-all",
            activeTab === 'history'
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          歷史記錄
        </button>
        <button
          onClick={() => setActiveTab('analysis')}
          className={clsx(
            "px-4 py-2 text-sm font-medium rounded-md transition-all",
            activeTab === 'analysis'
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          )}
        >
          學習分析
        </button>
      </div>

      {/* Tab 內容 */}
      <div>
        {activeTab === 'overview' && <PersonalScoreOverview empId={selectedEmpId || undefined} />}
        {activeTab === 'history' && <PersonalScoreHistory empId={selectedEmpId || undefined} />}
        {activeTab === 'analysis' && <PersonalLearningAnalysis empId={selectedEmpId || undefined} />}
      </div>
    </div>
  );
}
