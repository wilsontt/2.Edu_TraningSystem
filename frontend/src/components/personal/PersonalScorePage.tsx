import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { User, Search, Award } from 'lucide-react';
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
      {/* 頁面標題 */}
      <header className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
          <Award className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-1">成績中心</h1>
          <p className="text-gray-500 font-medium">查看個人學習成績與分析報表</p>
        </div>
      </header>

      {/* Admin 員工選擇器 */}
      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-indigo-100/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <User className="h-5 w-5 mr-2 text-indigo-500" />
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
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors duration-200 cursor-pointer"
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
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-200"
                />
              </div>
            </div>
            
            {showUserSelector && filteredUsers.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-indigo-100 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                {filteredUsers.map((user, uIdx) => (
                  <button
                    key={user.emp_id}
                    onClick={() => {
                      setSelectedEmpId(user.emp_id);
                      setShowUserSelector(false);
                      setUserSearchTerm(`${user.name} (${user.emp_id})`);
                      // 更新 URL 參數
                      setSearchParams({ emp_id: user.emp_id });
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-indigo-50/50 transition-all duration-200 border-b border-gray-100 last:border-b-0 cursor-pointer ${uIdx % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`}
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
            <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="text-sm text-indigo-600 font-medium">目前查看：</div>
              <div className="font-bold text-gray-900 mt-1">
                {users.find(u => u.emp_id === selectedEmpId)?.name} ({selectedEmpId})
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 切換 */}
      <div className="flex space-x-1 bg-indigo-50/50 p-1.5 rounded-xl w-fit border border-indigo-100/50">
        <button
          onClick={() => setActiveTab('overview')}
          className={clsx(
            "px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer",
            activeTab === 'overview'
              ? "bg-white text-indigo-600 shadow-md shadow-indigo-100"
              : "text-gray-500 hover:text-indigo-600 hover:bg-white/50"
          )}
        >
          總覽
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={clsx(
            "px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer",
            activeTab === 'history'
              ? "bg-white text-indigo-600 shadow-md shadow-indigo-100"
              : "text-gray-500 hover:text-indigo-600 hover:bg-white/50"
          )}
        >
          歷史記錄
        </button>
        <button
          onClick={() => setActiveTab('analysis')}
          className={clsx(
            "px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer",
            activeTab === 'analysis'
              ? "bg-white text-indigo-600 shadow-md shadow-indigo-100"
              : "text-gray-500 hover:text-indigo-600 hover:bg-white/50"
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
