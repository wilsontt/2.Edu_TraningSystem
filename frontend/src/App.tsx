/**
 * 主應用程式元件 (Main App Component)
 * 負責全域狀態管理 (使用者資訊、登入狀態)、路由配置 (React Router) 以及響應式導覽列 (Navbar)。
 */

import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, PenTool, BarChart3, Settings, LogOut, ChevronDown, Menu, X, ClipboardList } from 'lucide-react';
import api from './api';
import LoginPage from './components/LoginPage';
import DepartmentManager from './components/admin/DepartmentManager';
import CategoryManager from './components/admin/CategoryManager';
import TrainingPlanManager from './components/admin/TrainingPlanManager';
import UserManager from './components/admin/UserManager';
import JobTitleManager from './components/admin/JobTitleManager';
import RoleManager from './components/admin/RoleManager';
import PermissionManager from './components/admin/PermissionManager';
import RoleDepartmentScopeManager from './components/admin/RoleDepartmentScopeManager';
import ReportDashboard from './components/admin/ReportDashboard';
import ExamStudio from './components/admin/ExamStudio';
import QRCodeManager from './components/admin/QRCodeManager';
import BackupScheduleManager from './components/admin/BackupScheduleManager';
import ExamDashboard from './components/exam/ExamDashboard';
import ExamRunner from './components/exam/ExamRunner';
import PersonalScorePage from './components/personal/PersonalScorePage';
import CheckInPage from './components/exam/CheckInPage';
import AttendanceOverviewPage from './components/attendance/AttendanceOverviewPage';
import type { User } from './types';
import { hasAdminMenu } from './utils/authGuards';
import ChangePasswordPage from './components/ChangePasswordPage';
import { useRef } from 'react';
import { CrownBrand } from '@shared-ui/crown-brand';
import { NavCalendarCluster, PortalTopNav } from '@shared-ui/portal-nav';
import logoUrl from '@shared-ui/crown-brand/assets/CROWN_logo.png';

/**
 * 導覽列元件 (Navbar Component)
 * 依據使用者的權限 (user.functions) 動態顯示可存取的選單項目。
 */
const Navbar = ({ user, onLogout }: { user: User; onLogout: () => void }) => {
  const location = useLocation();
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const functions = user.functions || [];

  // 點擊外部區域時自動關閉下拉選單
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target as Node)) {
        setIsAdminOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isAdminOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAdminOpen, isMobileMenuOpen]);

  // 主選單項目：定義名稱、路徑、圖示及對應的權限代碼 (code)
  const navItems = [
    { name: '考試中心', path: '/', icon: <LayoutDashboard className="w-4 h-4" />, code: 'menu:home' },
    { name: '訓練計畫', path: '/plans', icon: <BookOpen className="w-4 h-4" />, code: 'menu:plan' },
    { name: '報到總覽', path: '/attendance-overview', icon: <ClipboardList className="w-4 h-4" />, code: 'menu:attendance-overview' },
    { name: '考卷工坊', path: '/exams', icon: <PenTool className="w-4 h-4" />, code: 'menu:exam' },
    { name: '成績中心', path: '/reports', icon: <BarChart3 className="w-4 h-4" />, code: 'menu:report' },
  ].filter(item => user.role === 'Admin' || functions.includes(item.code));

  // 系統管理子選單 (Admin Sub-items)
  const adminSubItems = [
    { name: '單位管理', path: '/admin/departments', code: 'menu:admin:dept' },
    { name: '分類管理', path: '/admin/categories', code: 'menu:admin' },
    { name: '人員管理', path: '/admin/users', code: 'menu:admin:user' },
    { name: '職務管理', path: '/admin/job-titles', code: 'menu:admin:jobtitle' },
    { name: '角色管理', path: '/admin/roles', code: 'menu:admin:role' },
    { name: '權限管理', path: '/admin/permissions', code: 'menu:admin:perm' },
    { name: '角色部門權限', path: '/admin/role-scopes', code: 'menu:admin:perm' },
    { name: 'QRcode 管理', path: '/admin/qrcode', code: 'menu:admin' },
    { name: '排程備份', path: '/admin/backup', code: 'menu:admin:backup' },
  ].filter(item => functions.includes(item.code));

  // 判斷是否具備進入管理後台的權限
  const hasAdminAccess = functions.includes('menu:admin');


  return (
    <div className="relative">
      <PortalTopNav
        left={
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden text-gray-500 hover:text-blue-600 transition-colors p-2 hover:bg-gray-50 rounded-xl shrink-0"
              aria-label={isMobileMenuOpen ? '關閉選單' : '開啟選單'}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <Link to="/" className="flex min-w-0">
              <CrownBrand logoSrc={logoUrl} subtitle="Education System" compact />
            </Link>
          </div>
        }
        center={
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all duration-300 ${
                  location.pathname === item.path
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100 scale-105'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                }`}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            ))}
            {hasAdminAccess && (
              <div ref={adminDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsAdminOpen(!isAdminOpen)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all duration-300 ${
                    location.pathname.startsWith('/admin')
                      ? 'bg-gray-100 text-gray-800'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>系統管理</span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isAdminOpen ? 'rotate-180' : ''}`} />
                </button>
                {isAdminOpen && (
                  <div className="absolute top-full left-0 mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-2xl py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[60]">
                    {adminSubItems.map((sub) => (
                      <Link
                        key={sub.path}
                        to={sub.path}
                        onClick={() => setIsAdminOpen(false)}
                        className={`block px-5 py-2.5 text-sm font-bold transition-colors ${
                          location.pathname === sub.path
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                        }`}
                      >
                        {sub.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        }
        right={
          <>
            <div className="flex items-center gap-1.5 sm:gap-3 pr-1 sm:pr-4 sm:border-r sm:border-gray-200 min-w-0">
              <div className="text-right min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs text-gray-500 font-medium leading-tight sm:truncate">
                  {user.role === 'Admin' ? 'IT管理員' : user.dept_name}
                </p>
                <p className="text-xs sm:text-sm font-bold text-gray-800 leading-tight sm:truncate">
                  {user.name}
                  <span className="text-gray-400 font-normal hidden sm:inline"> ({user.emp_id})</span>
                </p>
              </div>
              <NavCalendarCluster className="shrink-0 [&>div:last-child]:hidden sm:[&>div:last-child]:flex" />
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="hidden sm:block text-gray-500 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 rounded-full shrink-0"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </>
        }
      />
      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg lg:hidden animate-in fade-in slide-in-from-top-2 duration-200 z-40"
        >
          <div className="p-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                  location.pathname === item.path
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'
                }`}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            ))}
            {hasAdminAccess && (
              <div className="pt-2 border-t border-gray-100">
                <div className="px-4 py-2 text-xs font-black text-gray-400 uppercase tracking-wider">系統管理</div>
                {adminSubItems.map((sub) => (
                  <Link
                    key={sub.path}
                    to={sub.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                      location.pathname === sub.path
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    <span>{sub.name}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl font-bold transition-all"
              >
                <LogOut className="w-5 h-5" />
                <span>登出</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// PagePlaceholder removed as it is no longer used
// const PagePlaceholder = ({ title }: { title: string }) => (
//   <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
//     <h1 className="text-3xl font-bold text-gray-800 mb-4">{title}</h1>
//     <p className="text-gray-500">此功能正在開發中...</p>
//   </div>
// );

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);
        } catch {
          localStorage.removeItem('token');
          setUser(null);
        }
      }
      setInitializing(false);
    };

    initSession();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Router basename="/training">
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <Routes>
          {/* 方案 A：廢止 QRcode 一次性 token 流程；舊 QR（含 UUID）掃碼後一律導向登入頁。 */}
          <Route path="/auth/login/qrcode/:token" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={
            !user ? (
              <LoginPage onLoginSuccess={(u: User) => setUser(u)} />
            ) : (
              <Navigate to="/" />
            )
          } />
          <Route path="/login/change-password" element={
            !user ? <ChangePasswordPage /> : <Navigate to="/" />
          } />
          <Route path="*" element={
            !user ? (
              <Navigate to="/login" replace />
            ) : (
              <>
                <Navbar user={user} onLogout={handleLogout} />
                <main className="max-w-7xl mx-auto px-4 md:px-6">
                  <Routes>
                    <Route path="/checkin" element={<CheckInPage />} />
                    <Route path="/" element={<ExamDashboard />} />
                    <Route path="/exam/run/:planId" element={<ExamRunner />} />
                    <Route path="/plans" element={user.functions?.includes('menu:plan') || user.role === 'Admin' ? <TrainingPlanManager /> : <Navigate to="/" />} />
                    <Route path="/attendance-overview" element={user.functions?.includes('menu:attendance-overview') || user.role === 'Admin' ? <AttendanceOverviewPage /> : <Navigate to="/" />} />
                    <Route path="/exams" element={user.functions?.includes('menu:exam') || user.role === 'Admin' ? <ExamStudio /> : <Navigate to="/" />} />
                    {/* 教材庫已移入考卷工坊頁籤內，舊路徑導回考卷工坊 */}
                    <Route path="/teaching-materials" element={<Navigate to="/exams" replace />} />
                    <Route path="/reports" element={<PersonalScorePage />} />
                    <Route path="/reports/personal" element={<PersonalScorePage />} />
                    <Route path="/admin/departments" element={hasAdminMenu(user) ? <DepartmentManager /> : <Navigate to="/" />} />
                    <Route path="/admin/categories" element={hasAdminMenu(user) ? <CategoryManager /> : <Navigate to="/" />} />
                    <Route path="/admin/users" element={hasAdminMenu(user) ? <UserManager /> : <Navigate to="/" />} />
                    <Route path="/admin/job-titles" element={hasAdminMenu(user) ? <JobTitleManager /> : <Navigate to="/" />} />
                    <Route path="/admin/roles" element={hasAdminMenu(user) ? <RoleManager /> : <Navigate to="/" />} />
                    <Route path="/admin/permissions" element={hasAdminMenu(user) ? <PermissionManager /> : <Navigate to="/" />} />
                    <Route path="/admin/role-scopes" element={hasAdminMenu(user) ? <RoleDepartmentScopeManager /> : <Navigate to="/" />} />
                    <Route path="/admin/qrcode" element={hasAdminMenu(user) ? <QRCodeManager /> : <Navigate to="/" />} />
                    <Route path="/admin/backup" element={hasAdminMenu(user) || user.functions?.includes('menu:admin:backup') ? <BackupScheduleManager /> : <Navigate to="/" />} />
                    <Route path="/admin/reports" element={hasAdminMenu(user) ? <ReportDashboard /> : <Navigate to="/" />} />
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </main>
              </>
            )
          } />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
