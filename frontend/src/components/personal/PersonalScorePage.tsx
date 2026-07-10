import { useState, useEffect, startTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { User, Search, Award } from 'lucide-react';
import api from '../../api';
import PersonalScoreOverview from './PersonalScoreOverview';
import PersonalScoreHistory from './PersonalScoreHistory';
import PersonalLearningAnalysis from './PersonalLearningAnalysis';
import ReportDashboard from '../admin/ReportDashboard';
import BatchPrintPage from '../admin/BatchPrintPage';

type TabType = 'overview' | 'history' | 'analysis' | 'team' | 'batch-print';

const URL_TAB_VALUES = ['overview', 'history', 'analysis', 'batch-print'] as const;
type UrlTab = (typeof URL_TAB_VALUES)[number];

function parseUrlTab(raw: string | null): UrlTab | null {
  return raw && URL_TAB_VALUES.includes(raw as UrlTab) ? (raw as UrlTab) : null;
}

interface UserOption {
  emp_id: string;
  name: string;
  dept_name?: string;
}

interface MeResponse {
  emp_id?: string;
  name?: string;
  dept_name?: string;
  role: string;
  functions?: string[];
  role_scope_type?: 'all' | 'department' | 'self';
  role_scope_dept_ids?: number[];
}

interface AdminUserResponse {
  emp_id: string;
  name: string;
  department?: {
    name?: string;
  };
}

export default function PersonalScorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = parseUrlTab(searchParams.get('tab'));
  const [localTab, setLocalTab] = useState<TabType>('history'); //預設頁籤改為 history
  const activeTab: TabType = urlTab ?? localTab;

  const navigateTab = (t: TabType) => {
    setLocalTab(t);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (t === 'team') {
          p.delete('tab');
        } else {
          p.set('tab', t);
        }
        return p;
      },
      { replace: true }
    );
  };
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasReportPermission, setHasReportPermission] = useState(false);
  const [canAuthorizeRetake, setCanAuthorizeRetake] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [selectedEmpName, setSelectedEmpName] = useState('');
  const [selectedDeptName, setSelectedDeptName] = useState('');
  const [selfEmpId, setSelfEmpId] = useState('');
  const [selfName, setSelfName] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [showUserSelector, setShowUserSelector] = useState(false);

  useEffect(() => {
    if (urlTab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [urlTab]);

  useEffect(() => {
    const empIdFromUrl = searchParams.get('emp_id');
    const empNameFromUrl = searchParams.get('emp_name');
    const deptNameFromUrl = searchParams.get('dept_name');
    if (!empIdFromUrl) return;

    startTransition(() => {
      setSelectedEmpId(empIdFromUrl);
      if (empNameFromUrl) setSelectedEmpName(empNameFromUrl);
      if (deptNameFromUrl) setSelectedDeptName(deptNameFromUrl);
      const user = users.find((u) => u.emp_id === empIdFromUrl);
      if (user) {
        setSelectedEmpName(user.name || '');
        setSelectedDeptName(user.dept_name || '');
        setUserSearchTerm(`${user.name} (${user.emp_id})`);
      }
    });
  }, [searchParams, users]);

  useEffect(() => {
    // 檢查是否為 Admin
    const checkAdmin = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get('/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = response.data as MeResponse;
        setSelfEmpId(user.emp_id || '');
        setSelfName(user.name || '');
        setIsAdmin(user.role === 'Admin');
        const hasMenuReport = Array.isArray(user.functions) && user.functions.includes('menu:report');
        // 顯示「部門成績」規則：
        // Admin，或具 menu:report 且角色資料可視範圍為部門（department）或跨部門（all）。
        const canViewTeamReport =
          user.role === 'Admin' ||
          (hasMenuReport &&
            (user.role_scope_type === 'department' || user.role_scope_type === 'all'));
        setHasReportPermission(canViewTeamReport);
        setCanAuthorizeRetake(canViewTeamReport);
        
        // 如果是 Admin，載入使用者列表
        if (user.role === 'Admin') {
          const usersRes = await api.get('/admin/users');
          const usersList = (usersRes.data as AdminUserResponse[]).map((u) => ({
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
              setSelectedEmpName(user.name || '');
              setSelectedDeptName(user.dept_name || '');
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

  const titlePrefix = (() => {
    if (!selectedEmpId || (selfEmpId && selectedEmpId === selfEmpId)) return '';
    const name = selectedEmpName || users.find((u) => u.emp_id === selectedEmpId)?.name || selectedEmpId;
    const dept = selectedDeptName || users.find((u) => u.emp_id === selectedEmpId)?.dept_name || '';
    return `${dept ? `${dept} ` : ''}${name}`.trim();
  })();

  const resetToSelfView = () => {
    setLocalTab('history'); //預設頁籤改為 history
    setSelectedEmpId(null);
    setSelectedEmpName('');
    setSelectedDeptName('');
    setShowUserSelector(false);
    setUserSearchTerm('');
    setSearchParams({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* 頁面標題 */}
      <header className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={resetToSelfView}
          title="回到登入者的個人成績中心"
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200 cursor-pointer shrink-0"
        >
          <Award className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mb-1">成績中心</h1>
          <p className="text-sm sm:text-base text-gray-500 font-medium">查看個人學習成績與分析報表</p>
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
                  setLocalTab('history'); //預設頁籤改為 history
                  setSelectedEmpId(null);
                  setSelectedEmpName('');
                  setSelectedDeptName('');
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
                      setSelectedEmpName(user.name || '');
                      setSelectedDeptName(user.dept_name || '');
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
                {(selectedEmpName || users.find(u => u.emp_id === selectedEmpId)?.name || selfName)} ({selectedEmpId || selfEmpId})
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 切換：手機螢幕較窄時 4 個頁籤可能超出版面寬度，改為可橫向滑動而非擠壓換行/溢出 */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex space-x-1 bg-indigo-50/50 p-1.5 rounded-xl w-fit border border-indigo-100/50">
          <button
            onClick={() => navigateTab('history')} //預設頁籤改為 history
            className={clsx(
              "shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap",
              activeTab === 'history'
                ? "bg-white text-indigo-600 shadow-md shadow-indigo-100"
                : "text-gray-500 hover:text-indigo-600 hover:bg-white/50"
            )}
          >
            歷史記錄
          </button>
          <button
            onClick={() => navigateTab('overview')}
            className={clsx(
              "shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap",
              activeTab === 'overview'
                ? "bg-white text-indigo-600 shadow-md shadow-indigo-100"
                : "text-gray-500 hover:text-indigo-600 hover:bg-white/50"
            )}
          >
            總覽
          </button>
          <button
            onClick={() => navigateTab('analysis')}
            className={clsx(
              "shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap",
              activeTab === 'analysis'
                ? "bg-white text-indigo-600 shadow-md shadow-indigo-100"
                : "text-gray-500 hover:text-indigo-600 hover:bg-white/50"
            )}
          >
            學習分析
          </button>
          {hasReportPermission && (
            <button
              onClick={() => navigateTab('team')}
              className={clsx(
                "shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap",
                activeTab === 'team'
                  ? "bg-white text-indigo-600 shadow-md shadow-indigo-100"
                  : "text-gray-500 hover:text-indigo-600 hover:bg-white/50"
              )}
            >
              部門成績
            </button>
          )}
          {hasReportPermission && (
            <button
              onClick={() => navigateTab('batch-print')}
              className={clsx(
                "shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap",
                activeTab === 'batch-print'
                  ? "bg-white text-indigo-600 shadow-md shadow-indigo-100"
                  : "text-gray-500 hover:text-indigo-600 hover:bg-white/50"
              )}
            >
              批次列印
            </button>
          )}
        </div>
      </div>

      {/* Tab 內容 */}
      <div>
        {activeTab === 'overview' && (
          <PersonalScoreOverview
            empId={selectedEmpId || undefined}
            titlePrefix={titlePrefix}
            onNavigateHistory={() => navigateTab('history')}
          />
        )}
        {activeTab === 'history' && <PersonalScoreHistory empId={selectedEmpId || undefined} titlePrefix={titlePrefix} canAuthorizeRetake={canAuthorizeRetake} />}
        {activeTab === 'analysis' && <PersonalLearningAnalysis empId={selectedEmpId || undefined} titlePrefix={titlePrefix} />}
        {activeTab === 'team' && hasReportPermission && <ReportDashboard canAuthorizeRetake={canAuthorizeRetake} />}
        {activeTab === 'batch-print' && hasReportPermission && <BatchPrintPage />}
      </div>
    </div>
  );
}
