/**
 * LandingPage.tsx
 * 
 * 企業教育訓練系統 Landing Page
 * 基於 UI UX Pro Max 設計系統：
 * - Pattern: Enterprise Gateway
 * - Style: Trust & Authority
 * - Colors: Primary #4F46E5, CTA #22C55E
 * - Typography: Poppins (Heading) + Open Sans (Body)
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  BarChart3, 
  Shield, 
  Users, 
  Clock, 
  CheckCircle2,
  ArrowRight,
  Smartphone,
  QrCode,
  FileText,
  GraduationCap
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  
  const handleNavigateToLogin = () => {
    navigate('/login');
  };

  const features = [
    {
      icon: <Smartphone className="w-8 h-8" />,
      title: '行動優先設計',
      description: '支援 iOS/Android 響應式介面，隨時隨地完成訓練與測驗'
    },
    {
      icon: <QrCode className="w-8 h-8" />,
      title: 'QRcode 快速登入',
      description: '掃碼即可登入系統，支援多人同時報到，簡化操作流程'
    },
    {
      icon: <BookOpen className="w-8 h-8" />,
      title: '智慧題庫管理',
      description: '支援多種題型匯入，AI 輔助出題，題庫分類管理便捷'
    },
    {
      icon: <BarChart3 className="w-8 h-8" />,
      title: '即時成績追蹤',
      description: '個人成績總覽、學習分析、歷史紀錄一目瞭然'
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: 'RBAC 權限控管',
      description: '功能導向的權限控制，依角色自定義選單與功能'
    },
    {
      icon: <FileText className="w-8 h-8" />,
      title: 'PDF 報表匯出',
      description: '產出符合官方樣張格式的成績單，紅字手寫批改質感'
    }
  ];

  const stats = [
    { value: '100%', label: '系統可用性', icon: <CheckCircle2 className="w-5 h-5" /> },
    { value: '< 3s', label: '平均響應時間', icon: <Clock className="w-5 h-5" /> },
    { value: '免密碼', label: '安全登入', icon: <Shield className="w-5 h-5" /> },
    { value: '多平台', label: '跨裝置支援', icon: <Smartphone className="w-5 h-5" /> }
  ];

  const testimonials = [
    {
      quote: '大幅簡化了我們的訓練流程，員工可以隨時隨地完成測驗。',
      author: '人資部主管',
      role: '訓練計畫管理者'
    },
    {
      quote: '成績追蹤功能非常實用，讓我們能即時掌握員工學習狀況。',
      author: '教育訓練專員',
      role: '系統管理員'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-background)] via-white to-indigo-50">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center overflow-hidden rounded-xl shadow-lg shadow-indigo-100 bg-white">
                <img src="/CROWN-Logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div className="hidden sm:block">
                <span className="font-heading font-bold text-lg text-[var(--color-text)]">CROWNVAN</span>
                <span className="text-xs text-[var(--color-primary)] font-semibold ml-2">Education System</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleNavigateToLogin}
                className="px-4 py-2 text-[var(--color-primary)] font-semibold hover:bg-indigo-50 rounded-xl transition-all duration-200 cursor-pointer"
              >
                登入
              </button>
              <button
                onClick={handleNavigateToLogin}
                className="px-5 py-2.5 bg-[var(--color-cta)] text-white font-bold rounded-xl shadow-lg shadow-green-200 hover:shadow-green-300 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                開始使用
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 rounded-full">
                <GraduationCap className="w-4 h-4 text-[var(--color-primary)]" />
                <span className="text-sm font-semibold text-[var(--color-primary)]">企業級教育訓練平台</span>
              </div>
              
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--color-text)] leading-tight">
                智慧化
                <span className="text-[var(--color-primary)]">教育訓練</span>
                <br />
                與線上測驗系統
              </h1>
              
              <p className="text-lg text-gray-600 leading-relaxed max-w-xl">
                專為企業設計的教育訓練管理平台，整合訓練計畫、線上考試、成績追蹤與報表產出，
                讓員工培訓更有效率，管理更輕鬆。
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleNavigateToLogin}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[var(--color-cta)] text-white font-bold text-lg rounded-2xl shadow-xl shadow-green-200 hover:shadow-green-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                >
                  立即開始使用
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-[var(--color-primary)] text-[var(--color-primary)] font-bold text-lg rounded-2xl hover:bg-indigo-50 transition-all duration-200 cursor-pointer"
                >
                  了解更多功能
                </button>
              </div>
            </div>
            
            {/* Hero Visual */}
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/20 to-[var(--color-secondary)]/20 rounded-3xl blur-3xl"></div>
              <div className="relative bg-white rounded-3xl shadow-2xl shadow-indigo-200 p-8 border border-indigo-100">
                <div className="space-y-6">
                  {/* Mock Dashboard Preview */}
                  <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                    <div className="w-10 h-10 bg-[var(--color-primary)] rounded-xl flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-heading font-bold text-gray-800">成績中心</div>
                      <div className="text-xs text-gray-500">個人成績總覽</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] rounded-2xl p-4 text-white">
                      <div className="text-3xl font-bold">95</div>
                      <div className="text-sm opacity-80">最高分數</div>
                    </div>
                    <div className="bg-gradient-to-br from-[var(--color-cta)] to-emerald-400 rounded-2xl p-4 text-white">
                      <div className="text-3xl font-bold">12</div>
                      <div className="text-sm opacity-80">已完成課程</div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </div>
                        <span className="font-medium text-gray-700">資訊安全訓練</span>
                      </div>
                      <span className="text-sm font-bold text-green-600">92 分</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </div>
                        <span className="font-medium text-gray-700">新進員工訓練</span>
                      </div>
                      <span className="text-sm font-bold text-green-600">88 分</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white border-y border-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-xl mb-3 text-[var(--color-primary)]">
                  {stat.icon}
                </div>
                <div className="font-heading text-3xl font-bold text-[var(--color-text)]">{stat.value}</div>
                <div className="text-sm text-gray-500 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--color-text)] mb-4">
              強大功能，全方位支援
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              從訓練計畫建立到成績追蹤，一站式解決企業教育訓練需求
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group bg-white rounded-2xl p-6 shadow-lg shadow-indigo-100 hover:shadow-xl hover:shadow-indigo-200 border border-indigo-50 hover:border-indigo-200 transition-all duration-300 hover:-translate-y-1 cursor-pointer"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] rounded-2xl flex items-center justify-center text-white mb-5 group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="font-heading text-xl font-bold text-[var(--color-text)] mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white mb-4">
              用戶好評
            </h2>
            <p className="text-lg text-indigo-200 max-w-2xl mx-auto">
              來自各部門的真實回饋
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-white text-lg leading-relaxed mb-4">
                      "{testimonial.quote}"
                    </p>
                    <div>
                      <div className="font-bold text-white">{testimonial.author}</div>
                      <div className="text-sm text-indigo-200">{testimonial.role}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[var(--color-text)] mb-6">
            準備好開始了嗎？
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            立即登入系統，體驗智慧化的教育訓練管理平台
          </p>
          <button
            onClick={handleNavigateToLogin}
            className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-[var(--color-cta)] text-white font-bold text-xl rounded-2xl shadow-xl shadow-green-200 hover:shadow-green-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
          >
            立即登入系統
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 bg-[var(--color-text)]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <img src="/CROWN-Logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-white font-semibold">CROWNVAN 海灣國際</span>
            </div>
            <div className="text-indigo-300 text-sm">
              © {new Date().getFullYear()} Education Training System. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
