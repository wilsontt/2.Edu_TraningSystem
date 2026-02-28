import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, PenTool, BarChart3, Settings, LogOut, ChevronDown, Menu, X } from 'lucide-react';
import api from './api';
import LoginPage from './components/LoginPage';
import LandingPage from './components/LandingPage';
import DepartmentManager from './components/admin/DepartmentManager';
import CategoryManager from './components/admin/CategoryManager';
import TrainingPlanManager from './components/admin/TrainingPlanManager';
import UserManager from './components/admin/UserManager';
import RoleManager from './components/admin/RoleManager';
import PermissionManager from './components/admin/PermissionManager';
import SystemFunctionManager from './components/admin/SystemFunctionManager';
import ReportDashboard from './components/admin/ReportDashboard';
import ExamStudio from './components/admin/ExamStudio';
import QRCodeManager from './components/admin/QRCodeManager';
import ExamDashboard from './components/exam/ExamDashboard';
import ExamRunner from './components/exam/ExamRunner';
import PersonalScorePage from './components/personal/PersonalScorePage';
import QRCodeLoginPage from './components/QRCodeLoginPage';
import CheckInPage from './components/exam/CheckInPage';
import type { User } from './types';
import { useRef } from 'react';
import logoUrl from './assets/CROWN_logo.png';



const CalendarIcon = () => {
  const [date, setDate] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  // 格式化月份、日期、時間字串 (使用本地時間)
  // 返回 JSX（日曆圖示 + 日期時間文字）
  const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();
  const day = date.getDate();
  
  // yyyy-MM-dd (本地時間)
  const dateString = date.getFullYear() + '-' + 
                    String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(date.getDate()).padStart(2, '0');
  
  // HH:MM:SS
  const timeString = String(date.getHours()).padStart(2, '0') + ':' + 
                    String(date.getMinutes()).padStart(2, '0') + ':' + 
                    String(date.getSeconds()).padStart(2, '0');

  return (
    <div className="flex items-center gap-2 pr-1">
      <div className="flex flex-col items-center w-10 h-11 border-2 border-gray-800 rounded-xl overflow-hidden bg-white shadow-sm scale-90 shrink-0">
        <div className="bg-red-500 w-full text-[9px] font-black text-center text-white py-0.5 border-b-2 border-gray-800">
          {month}
        </div>
        <div className="bg-white w-full grow flex items-center justify-center text-sm font-black text-gray-800 leading-none">
          {day}
        </div>
      </div>
      <div className="flex flex-col justify-center leading-none">
        <div className="text-sm font-black text-blue-400 tracking-tight mb-0.5">
          {dateString}
        </div>
        <div className="text-sm font-black text-gray-800 font-mono">
          {timeString}
        </div>
      </div>
    </div>
  );
};

const Navbar = ({ user, onLogout }: { user: User; onLogout: () => void }) => {
  const location = useLocation();
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const functions = user.functions || [];

  // 點擊外部區域時關閉下拉選單
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

  const navItems = [
    { name: '考試中心', path: '/', icon: <LayoutDashboard className="w-4 h-4" />, code: 'menu:home' },
    { name: '訓練計畫', path: '/plans', icon: <BookOpen className="w-4 h-4" />, code: 'menu:plan' },
    { name: '考卷工坊', path: '/exams', icon: <PenTool className="w-4 h-4" />, code: 'menu:exam' },
    { name: '成績中心', path: '/reports', icon: <BarChart3 className="w-4 h-4" />, code: 'menu:report' },
  ].filter(item => user.role === 'Admin' || functions.includes(item.code));

  const adminSubItems = [
    { name: '單位管理', path: '/admin/departments', code: 'menu:admin:dept' },
    { name: '分類管理', path: '/admin/categories', code: 'menu:admin' },
    { name: '人員管理', path: '/admin/users', code: 'menu:admin:user' },
    { name: '角色管理', path: '/admin/roles', code: 'menu:admin:role' },
    { name: '權限管理', path: '/admin/permissions', code: 'menu:admin:perm' },
    { name: '功能清單管理', path: '/admin/functions', code: 'menu:admin:func' },
    { name: 'QRcode 管理', path: '/admin/qrcode', code: 'menu:admin' },
  ].filter(item => functions.includes(item.code));

  // 只有擁有 menu:admin 權限的用戶才顯示系統管理選單
  const hasAdminAccess = functions.includes('menu:admin');


  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <Link to="/">
          <div className="w-12 h-12 flex items-center justify-center overflow-hidden rounded-xl shadow-lg shadow-blue-100 bg-white">
            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-xl text-gray-800 leading-tight tracking-tight">CROWNVAN 海灣國際</span>
            <span className="text-[10px] font-bold text-blue-600 tracking-widest uppercase opacity-70">Education System</span>
          </div>
        </Link>
      </div>

      <div className="hidden lg:flex items-center gap-2">


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
              <div className="absolute top-full left-0 mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-2xl py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
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

      {/* Mobile Hamburger Menu Button */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-3 pr-2 sm:pr-4 border-r border-gray-200">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-500 font-medium leading-none">{user.role === 'Admin' ? 'IT管理員' : user.dept_name}</p>
            <p className="text-sm font-bold text-gray-800">{user.name} <span className="text-gray-400 font-normal">({user.emp_id})</span></p>
          </div>
          <CalendarIcon />
        </div>
        <button 
          onClick={onLogout}
          className="hidden sm:block text-gray-500 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 rounded-full"
        >
          <LogOut className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="lg:hidden text-gray-500 hover:text-blue-600 transition-colors p-2 hover:bg-gray-50 rounded-xl"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div 
          ref={mobileMenuRef}
          className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg lg:hidden animate-in fade-in slide-in-from-top-2 duration-200"
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
                onClick={() => { setIsMobileMenuOpen(false); onLogout(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl font-bold transition-all"
              >
                <LogOut className="w-5 h-5" />
                <span>登出</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
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
          <Route path="/auth/login/qrcode/:token" element={<QRCodeLoginPage onLoginSuccess={(u: User) => setUser(u)} />} />
          <Route path="/login" element={
            !user ? (
              <LoginPage onLoginSuccess={(u: User) => setUser(u)} />
            ) : (
              <Navigate to="/" />
            )
          } />
          <Route path="*" element={
            !user ? (
              <LandingPage />
            ) : (
              <>
                <Navbar user={user} onLogout={handleLogout} />
                <main className="max-w-7xl mx-auto px-4 md:px-6">
                  <Routes>
                    <Route path="/checkin" element={<CheckInPage />} />
                    <Route path="/" element={<ExamDashboard />} />
                    <Route path="/exam/run/:planId" element={<ExamRunner />} />
                    <Route path="/plans" element={user.functions?.includes('menu:plan') || user.role === 'Admin' ? <TrainingPlanManager /> : <Navigate to="/" />} />
                    <Route path="/exams" element={user.functions?.includes('menu:exam') || user.role === 'Admin' ? <ExamStudio /> : <Navigate to="/" />} />
                    <Route path="/reports" element={user.role === 'Admin' ? <ReportDashboard /> : <PersonalScorePage />} />
                    <Route path="/reports/personal" element={<PersonalScorePage />} />
                    <Route path="/admin/departments" element={user.role === 'Admin' ? <DepartmentManager /> : <Navigate to="/" />} />
                    <Route path="/admin/categories" element={user.role === 'Admin' ? <CategoryManager /> : <Navigate to="/" />} />
                    <Route path="/admin/users" element={user.role === 'Admin' ? <UserManager /> : <Navigate to="/" />} />
                    <Route path="/admin/roles" element={user.role === 'Admin' ? <RoleManager /> : <Navigate to="/" />} />
                    <Route path="/admin/permissions" element={user.role === 'Admin' ? <PermissionManager /> : <Navigate to="/" />} />
                    <Route path="/admin/functions" element={user.role === 'Admin' ? <SystemFunctionManager /> : <Navigate to="/" />} />
                    <Route path="/admin/qrcode" element={user.role === 'Admin' ? <QRCodeManager /> : <Navigate to="/" />} />
                    <Route path="/admin/reports" element={user.role === 'Admin' ? <ReportDashboard /> : <Navigate to="/" />} />
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
