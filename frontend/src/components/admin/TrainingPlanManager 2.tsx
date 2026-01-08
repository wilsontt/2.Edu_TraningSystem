import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Plus, Calendar, Clock, BookOpen, Building2, Search, Loader2, X, AlertCircle } from 'lucide-react';
import api from '../../api';

interface SubCategory {
  id: number;
  name: string;
  main_id: number;
}

interface MainCategory {
  id: number;
  name: string;
  sub_categories: SubCategory[];
}

interface Department {
  id: number;
  name: string;
}

interface TrainingPlan {
  id: number;
  title: string;
  year: string;
  training_date: string;
  dept_id: number;
  sub_category_id: number;
  timer_enabled: boolean;
  time_limit: number;
}

const TrainingPlanManager = () => {
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Data
  const [formData, setFormData] = useState({
    title: '',
    main_category_id: '',
    sub_category_id: '',
    dept_id: '',
    training_date: '',
    timer_enabled: false,
    time_limit: 60,
  });

  // Dropdown Data
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  // Fetch Initial Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plansRes, catsRes, deptsRes] = await Promise.all([
          api.get('/training/plans'),
          api.get('/admin/categories/main'),
          api.get('/admin/departments')
        ]);
        setPlans(plansRes.data);
        setCategories(catsRes.data);
        setDepartments(deptsRes.data);
      } catch (err: unknown) {
        console.error('載入資料失敗', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.sub_category_id || !formData.dept_id || !formData.training_date) {
      setErrorMessage('請填寫所有必填欄位');
      return;
    }

    try {
      await api.post('/training/plans', {
        title: formData.title,
        sub_category_id: parseInt(formData.sub_category_id),
        dept_id: parseInt(formData.dept_id),
        training_date: formData.training_date,
        timer_enabled: formData.timer_enabled,
        time_limit: formData.timer_enabled ? formData.time_limit : 0,
      });
      
      // Refresh plans
      const res = await api.get('/training/plans');
      setPlans(res.data);
      
      setIsAdding(false);
      setFormData({
        title: '',
        main_category_id: '',
        sub_category_id: '',
        dept_id: '',
        training_date: '',
        timer_enabled: false,
        time_limit: 60,
      });
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage('新增計畫失敗');
      }
    }
  };

  const filteredPlans = plans.filter(plan => 
    plan.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.year.includes(searchTerm)
  );

  // Helper to find category/department names
  const getDeptName = (id: number) => departments.find(d => d.id === id)?.name || '未知單位';
  
  // Filter sub-categories based on selected main category
  const activeSubCategories = categories.find(c => c.id === parseInt(formData.main_category_id))?.sub_categories || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-500 font-bold animate-pulse">正在載入訓練計畫...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-blue-600" />
            訓練計畫管理
          </h1>
          <p className="text-sm text-gray-500 font-bold mt-1">管理年度訓練課程計畫與開課資訊</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:scale-105 active:scale-95 transition-all text-sm"
        >
          <Plus className="w-5 h-5" />
          <span>新增計畫</span>
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-100/50 border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋計畫名稱或年份..."
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
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider w-24">年份</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">計畫名稱</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">開課單位</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">日期</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">計時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-gray-400 font-bold italic">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen className="w-8 h-8 opacity-20" />
                      目前沒有任何訓練計畫
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 text-sm font-black text-blue-600">{plan.year}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-800">{plan.title}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-600">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        {getDeptName(plan.dept_id)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {plan.training_date}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold">
                       {plan.timer_enabled ? (
                         <div className="flex items-center gap-1 text-orange-600">
                           <Clock className="w-4 h-4" />
                           {plan.time_limit} 分
                         </div>
                       ) : (
                         <span className="text-gray-400">-</span>
                       )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-linear-to-r from-blue-50 to-indigo-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                新增訓練計畫
              </h3>
              <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white/50 rounded-xl transition-all">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleAdd} className="p-6 overflow-y-auto space-y-4">
              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">計畫名稱</label>
                <input
                  autoFocus
                  required
                  type="text"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                  placeholder="例如：新人入職教育訓練"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              {/* Categories */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">訓練大類</label>
                  <select
                    required
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all bg-white"
                    value={formData.main_category_id}
                    onChange={e => setFormData({...formData, main_category_id: e.target.value, sub_category_id: ''})}
                  >
                    <option value="">請選擇</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">子類別</label>
                  <select
                    required
                    disabled={!formData.main_category_id}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all bg-white disabled:bg-gray-50 disabled:text-gray-400"
                    value={formData.sub_category_id}
                    onChange={e => setFormData({...formData, sub_category_id: e.target.value})}
                  >
                    <option value="">請選擇</option>
                    {activeSubCategories.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Department */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">開課單位</label>
                <select
                  required
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all bg-white"
                  value={formData.dept_id}
                  onChange={e => setFormData({...formData, dept_id: e.target.value})}
                >
                  <option value="">請選擇單位</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">訓練日期</label>
                <input
                  required
                  type="date"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                  value={formData.training_date}
                  onChange={e => setFormData({...formData, training_date: e.target.value})}
                />
              </div>

              {/* Timer Settings */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-bold text-gray-700">啟用考試計時器</label>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, timer_enabled: !formData.timer_enabled})}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${formData.timer_enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out mt-0.5 ml-0.5 ${formData.timer_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
                
                {formData.timer_enabled && (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="text-xs font-bold text-gray-500 uppercase">考試時限（分鐘）</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                      value={formData.time_limit}
                      onChange={e => setFormData({...formData, time_limit: parseInt(e.target.value) || 0})}
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
                >
                  確認新增
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorMessage && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
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
    </div>
  );
};

export default TrainingPlanManager;
