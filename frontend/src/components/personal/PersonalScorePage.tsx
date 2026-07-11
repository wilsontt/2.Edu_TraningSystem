import { useState, useEffect } from 'react';
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
type PlanStatusFilter = 'active' | 'expired' | 'archived' | 'all';

const URL_TAB_VALUES = ['overview', 'history', 'analysis', 'batch-print'] as const;
type UrlTab = (typeof URL_TAB_VALUES)[number];

const PLAN_STATUS_VALUES: PlanStatusFilter[] = ['active', 'expired', 'archived', 'all'];

function parseUrlTab(raw: string | null): UrlTab | null {
  return raw && URL_TAB_VALUES.includes(raw as UrlTab) ? (raw as UrlTab) : null;
}

function parsePlanStatus(raw: string | null): PlanStatusFilter {
  return raw && PLAN_STATUS_VALUES.includes(raw as PlanStatusFilter)
    ? (raw as PlanStatusFilter)
    : 'active';
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
  const [localTab, setLocalTab] = useState<TabType>('history');
  const activeTab: TabType = urlTab ?? localTab;
  const planStatus = parsePlanStatus(searchParams.get('plan_status'));

  const navigateTab = (t: TabType) => {
    setLocalTab(t);
    if (t === 'team') {
      // R10：進入部門成績時清除個人檢視
      setSelectedEmpId(null);
      setSelectedEmpName('');
      setSelectedDeptName('');
      setUserSearchTerm('');
      setShowUserSelector(false);
    }
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (t === 'team') {
          p.delete('tab');
          p.delete('emp_id');
          p.delete('emp_name');
          p.delete('dept_name');
        } else {
          p.set('tab', t);
        }
        return p;
      },
      { replace: true }
    );
  };

  const setPlanStatusFilter = (status: PlanStatusFilter) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (status === 'active') {
          p.delete('plan_status');
        } else {
          p.set('plan_status', status);
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
  const [selfDeptName, setSelfDeptName] = useState('');
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
    if (!empIdFromUrl) {
      setSelectedEmpId(null);
      setSelectedEmpName('');
      setSelectedDeptName('');
      return;
    }

    setSelectedEmpId(empIdFromUrl);
    if (empNameFromUrl) setSelectedEmpName(empNameFromUrl);
    if (deptNameFromUrl) setSelectedDeptName(deptNameFromUrl);
    const user = users.find((u) => u.emp_id === empIdFromUrl);
    if (user) {
      setSelectedEmpName(user.name || '');
      setSelectedDeptName(user.dept_name || '');
      setUserSearchTerm(`${user.name} (${user.emp_id})`);
    }
  }, [searchParams, users]);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const user = response.data as MeResponse;
        setSelfEmpId(user.emp_id || '');
        setSelfName(user.name || '');
        setSelfDeptName(user.dept_name || '');
        setIsAdmin(user.role === 'Admin');
        const hasMenuReport = Array.isArray(user.functions) && user.functions.includes('menu:report');
        const canViewTeamReport =
          user.role === 'Admin' ||
          (hasMenuReport &&
            (user.role_scope_type === 'department' || user.role_scope_type === 'all'));
        setHasReportPermission(canViewTeamReport);
        setCanAuthorizeRetake(canViewTeamReport);

        if (user.role === 'Admin') {
          const usersRes = await api.get('/admin/users');
          const usersList = (usersRes.data as AdminUserResponse[]).map((u) => ({
            emp_id: u.emp_id,
            name: u.name,
            dept_name: u.department?.name,
          }));
          setUsers(usersList);

          const empIdFromUrl = searchParams.get('emp_id');
          if (empIdFromUrl) {
            const found = usersList.find((u: UserOption) => u.emp_id === empIdFromUrl);
            if (found) {
              setSelectedEmpId(empIdFromUrl);
              setSelectedEmpName(found.name || '');
              setSelectedDeptName(found.dept_name || '');
              setUserSearchTerm(`${found.name} (${found.emp_id})`);
            }
          }
        }
      } catch (error) {
        console.error('Failed to check admin status', error);
      }
    };
    void checkAdmin();
    // 僅首次／登入狀態；勿因 searchParams 反覆打 /auth/me
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.emp_id.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.dept_name && u.dept_name.toLowerCase().includes(userSearchTerm.toLowerCase()))
  );

  const empIdFromUrl = searchParams.get('emp_id');
  const empNameFromUrl = searchParams.get('emp_name');
  const deptNameFromUrl = searchParams.get('dept_name');
  const viewEmpId = (empIdFromUrl ?? selectedEmpId ?? selfEmpId) || undefined;
  const isViewingOther = Boolean(viewEmpId && selfEmpId && viewEmpId !== selfEmpId);
  const apiEmpId = isViewingOther ? viewEmpId : undefined;

  // R14：標題一律「部門 姓名 (員工編號)」
  const titlePrefix = (() => {
    const targetId = empIdFromUrl ?? selectedEmpId ?? selfEmpId;
    if (!targetId) return '';
    const isSelf = selfEmpId && targetId === selfEmpId;
    const name = isSelf
      ? selfName
      : empNameFromUrl ||
        selectedEmpName ||
        users.find((u) => u.emp_id === targetId)?.name ||
        targetId;
    const dept = isSelf
      ? selfDeptName
      : deptNameFromUrl ||
        selectedDeptName ||
        users.find((u) => u.emp_id === targetId)?.dept_name ||
        '';
    const idPart = `(${targetId})`;
    return `${dept ? `${dept} ` : ''}${name} ${idPart}`.trim();
  })();

  const resetToSelfView = () => {
    setLocalTab('history');
    setSelectedEmpId(null);
    setSelectedEmpName('');
    setSelectedDeptName('');
    setShowUserSelector(false);
    setUserSearchTerm('');
    // R13：清除個人檢視並重置 plan_status 為 active（不帶參數）
    setSearchParams({ tab: 'history' }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showPlanStatusFilter =
    activeTab === 'overview' || activeTab === 'history' || activeTab === 'analysis';

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
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

      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-indigo-100/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <User className="h-5 w-5 mr-2 text-indigo-500" />
              查看成績
            </h3>
            {selectedEmpId && (
              <button
                onClick={resetToSelfView}
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
                      // R12：merge，保留 plan_status / tab
                      setSearchParams((prev) => {
                        const p = new URLSearchParams(prev);
                        p.set('emp_id', user.emp_id);
                        p.set('emp_name', user.name || '');
                        if (user.dept_name) p.set('dept_name', user.dept_name);
                        else p.delete('dept_name');
                        if (!p.get('tab') || p.get('tab') === 'batch-print') {
                          p.set('tab', 'history');
                        }
                        return p;
                      });
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
                {(selectedDeptName ? `${selectedDeptName} ` : '') +
                  (selectedEmpName || users.find((u) => u.emp_id === selectedEmpId)?.name || selfName)}{' '}
                ({selectedEmpId})
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex space-x-1 bg-indigo-50/50 p-1.5 rounded-xl w-fit border border-indigo-100/50">
          <button
            onClick={() => navigateTab('history')}
            className={clsx(
              'shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap',
              activeTab === 'history'
                ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100'
                : 'text-gray-500 hover:text-indigo-600 hover:bg-white/50'
            )}
          >
            歷史記錄
          </button>
          <button
            onClick={() => navigateTab('overview')}
            className={clsx(
              'shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap',
              activeTab === 'overview'
                ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100'
                : 'text-gray-500 hover:text-indigo-600 hover:bg-white/50'
            )}
          >
            總覽
          </button>
          <button
            onClick={() => navigateTab('analysis')}
            className={clsx(
              'shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap',
              activeTab === 'analysis'
                ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100'
                : 'text-gray-500 hover:text-indigo-600 hover:bg-white/50'
            )}
          >
            學習分析
          </button>
          {hasReportPermission && (
            <button
              onClick={() => navigateTab('team')}
              className={clsx(
                'shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap',
                activeTab === 'team'
                  ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100'
                  : 'text-gray-500 hover:text-indigo-600 hover:bg-white/50'
              )}
            >
              部門成績
            </button>
          )}
          {hasReportPermission && (
            <button
              onClick={() => navigateTab('batch-print')}
              className={clsx(
                'shrink-0 px-3 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap',
                activeTab === 'batch-print'
                  ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100'
                  : 'text-gray-500 hover:text-indigo-600 hover:bg-white/50'
              )}
            >
              批次列印
            </button>
          )}
        </div>
      </div>

      {showPlanStatusFilter && (
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-1">
          {(
            [
              { id: 'active' as const, label: '進行中' },
              { id: 'expired' as const, label: '已過期' },
              { id: 'archived' as const, label: '已封存' },
              { id: 'all' as const, label: '全部' },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPlanStatusFilter(tab.id)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 -mb-px transition-colors cursor-pointer ${
                planStatus === tab.id
                  ? 'border-indigo-600 text-indigo-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div>
        {activeTab === 'overview' && (
          <PersonalScoreOverview
            key={viewEmpId ?? 'self'}
            empId={apiEmpId}
            titlePrefix={titlePrefix}
            planStatus={planStatus}
            onNavigateHistory={() => navigateTab('history')}
          />
        )}
        {activeTab === 'history' && (
          <PersonalScoreHistory
            key={viewEmpId ?? 'self'}
            empId={apiEmpId}
            titlePrefix={titlePrefix}
            planStatus={planStatus}
            canAuthorizeRetake={canAuthorizeRetake}
          />
        )}
        {activeTab === 'analysis' && (
          <PersonalLearningAnalysis
            key={viewEmpId ?? 'self'}
            empId={apiEmpId}
            titlePrefix={titlePrefix}
            planStatus={planStatus}
          />
        )}
        {activeTab === 'team' && hasReportPermission && (
          <ReportDashboard canAuthorizeRetake={canAuthorizeRetake} />
        )}
        {activeTab === 'batch-print' && hasReportPermission && <BatchPrintPage />}
      </div>
    </div>
  );
}
