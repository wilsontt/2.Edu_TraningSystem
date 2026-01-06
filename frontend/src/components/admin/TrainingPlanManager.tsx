import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Plus, Calendar, Clock, BookOpen, Building2, Search, Loader2, X, AlertCircle, PenTool } from 'lucide-react';
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
  end_date?: string | null;
  dept_id: number;
  sub_category_id: number;
  timer_enabled: boolean;
  time_limit: number;
  passing_score: number;
  target_departments: Department[];
}

const TrainingPlanManager = () => {
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 模態視窗狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 表單資料
  const [formData, setFormData] = useState({
    title: '',
    main_category_id: '',
    sub_category_id: '',
    dept_id: '',
    training_date: '',
    end_date: '',
    timer_enabled: false,
    time_limit: 60,
    passing_score: 60,
    target_dept_ids: [] as string[],
  });

  // 下拉選單資料
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  // 取得初始資料
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

  const openModal = (plan?: TrainingPlan) => {
    if (plan) {
      // 編輯模式
      setIsEditing(true);
      setEditId(plan.id);
      
      // 尋找主分類
      let mainCatId = '';
      for (const cat of categories) {
        if (cat.sub_categories.some(sub => sub.id === plan.sub_category_id)) {
          mainCatId = cat.id.toString();
          break;
        }
      }

      setFormData({
        title: plan.title,
        main_category_id: mainCatId,
        sub_category_id: plan.sub_category_id.toString(),
        dept_id: plan.dept_id.toString(),
        training_date: plan.training_date,
        end_date: plan.end_date || '',
        timer_enabled: plan.timer_enabled,
        time_limit: plan.time_limit,
        passing_score: plan.passing_score,
        target_dept_ids: plan.target_departments ? plan.target_departments.map(d => d.id.toString()) : [],
      });
    } else {
      // 新增模式
      setIsEditing(false);
      setEditId(null);
      setFormData({
        title: '',
        main_category_id: '',
        sub_category_id: '',
        dept_id: '',
        training_date: '',
        end_date: '',
        timer_enabled: false,
        time_limit: 60,
        passing_score: 60,
        target_dept_ids: [],
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.sub_category_id || !formData.dept_id || !formData.training_date) {
      setErrorMessage('請填寫所有必填欄位');
      return;
    }

    try {
      const payload = {
        title: formData.title,
        sub_category_id: parseInt(formData.sub_category_id),
        dept_id: parseInt(formData.dept_id),
        training_date: formData.training_date,
        end_date: formData.end_date || null,
        timer_enabled: formData.timer_enabled,
        time_limit: formData.timer_enabled ? formData.time_limit : 0,
        passing_score: formData.passing_score,
        target_dept_ids: formData.target_dept_ids.map(id => parseInt(id)),
      };

      if (isEditing && editId) {
        await api.put(`/training/plans/${editId}`, payload);
      } else {
        await api.post('/training/plans', payload);
      }
      
      // 更新列表
      const res = await api.get('/training/plans');
      setPlans(res.data);
      
      setIsModalOpen(false);
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setErrorMessage(err.response.data.detail);
      } else {
        setErrorMessage(isEditing ? '更新計畫失敗' : '新增計畫失敗');
      }
    }
  };

  const filteredPlans = plans.filter(plan => 
    plan.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.year.includes(searchTerm)
  );

  const today = new Date().toISOString().split('T')[0];

  // 找尋部門或分類名稱的輔助函式
  const getDeptName = (id: number) => departments.find(d => d.id === id)?.name || '未知單位';
  
  // 根據主分類過濾子分類
  const activeSubCategories = categories.find(c => c.id === parseInt(formData.main_category_id))?.sub_categories || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-500 font-bold animate-pulse">正在載入訓練計畫...</p>
      </div>
    );
  }

  // 處理開始日期變更 (自動同步結束日期)
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setFormData(prev => ({
      ...prev,
      training_date: newDate,
      // 如果結束日期為空，自動帶入開始日期
      end_date: prev.end_date ? prev.end_date : newDate
    }));
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        {/* ... (keep header) ... */}
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-blue-600" />
            訓練計畫管理
          </h1>
          <p className="text-sm text-gray-500 font-bold mt-1">管理年度訓練課程計畫與開課資訊</p>
        </div>
        <button
          type="button"
          onClick={() => openModal()}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:scale-105 active:scale-95 transition-all text-sm"
        >
          <Plus className="w-5 h-5" />
          <span>新增計畫</span>
        </button>
      </div>

      {/* 列表區塊 (省略) ... */}
      {/* List */}
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-100/50 border border-gray-100 overflow-hidden">
        {/* ... (table content) ... */}
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
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider w-16">項次</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider w-24">年份</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">計畫名稱</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">開課單位</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">開始日期</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">結束日期</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">計時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-400 font-bold italic">
                    <div className="flex flex-col items-center gap-2">
                      <BookOpen className="w-8 h-8 opacity-20" />
                      目前沒有任何訓練計畫
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPlans.map((plan, index) => {
                  const isExpired = plan.end_date && plan.end_date < today;
                  return (
                  <tr key={plan.id} className={`group border-b border-gray-50 transition-colors even:bg-gray-100/60 hover:bg-blue-50/50 ${isExpired ? 'border-l-4 border-l-orange-400 bg-orange-50/10' : ''}`}>
                    <td className="px-6 py-4 text-sm font-black text-gray-300">{index + 1}</td>
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
                        <span>{plan.training_date}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-600">
                       {plan.end_date ? (
                         <div className={`flex items-center gap-2 ${isExpired ? 'text-orange-600' : ''}`}>
                            <span>{plan.end_date}</span>
                            {isExpired && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">已過期</span>}
                         </div>
                       ) : (
                         <span className="text-gray-400">-</span>
                       )}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold">
                       <div className="flex items-center justify-between">
                           {plan.timer_enabled ? (
                             <div className="flex items-center gap-1 text-orange-600">
                               <Clock className="w-4 h-4" />
                               {plan.time_limit} 分
                             </div>
                           ) : (
                             <span className="text-gray-400">-</span>
                           )}
                           
                           <button 
                                onClick={() => openModal(plan)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                title="編輯計畫"
                           >
                                <PenTool className="w-4 h-4" />
                           </button>
                       </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-linear-to-r from-blue-50 to-indigo-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                {isEditing ? <PenTool className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
                {isEditing ? '編輯訓練計畫' : '新增訓練計畫'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/50 rounded-xl transition-all">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
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
                    onChange={e => {
                        const val = e.target.value;
                        setFormData(prev => ({...prev, main_category_id: val, sub_category_id: ''}));
                    }}
                  >
                    <option value="">請選擇</option>
                    {categories.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
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
                      <option key={sub.id} value={String(sub.id)}>{sub.name}</option>
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
                    <option key={d.id} value={String(d.id)}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">開始日期</label>
                    <input
                      required
                      type="date"
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                      value={formData.training_date}
                      onChange={handleStartDateChange}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">結束日期 (選填)</label>
                    <input
                      type="date"
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                      value={formData.end_date}
                      min={formData.training_date}
                      onChange={e => setFormData({...formData, end_date: e.target.value})}
                    />
                  </div>
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
                    <label className="text-xs font-bold text-gray-500 uppercase">考試時限</label>
                    <div className="flex gap-2">
                        <select
                           className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all bg-white"
                           value={[10, 15, 20, 30, 60].includes(formData.time_limit) ? formData.time_limit : 'custom'}
                           onChange={e => {
                               const val = e.target.value;
                               if (val !== 'custom') {
                                   setFormData({...formData, time_limit: parseInt(val)});
                               } else {
                                   setFormData({...formData, time_limit: 0});
                               }
                           }}
                        >
                            <option value="10">10 分鐘</option>
                            <option value="15">15 分鐘</option>
                            <option value="20">20 分鐘</option>
                            <option value="30">30 分鐘</option>
                            <option value="60">1 小時</option>
                            <option value="custom">自訂時間</option>
                        </select>
                        {(formData.time_limit === 0 || ![10, 15, 20, 30, 60].includes(formData.time_limit)) && (
                            <div className="relative w-24">
                                <input
                                type="number"
                                min="1"
                                placeholder="分鐘"
                                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                                value={formData.time_limit || ''}
                                onChange={e => setFormData({...formData, time_limit: parseInt(e.target.value) || 0})}
                                />
                            </div>
                        )}
                    </div>
                  </div>
                )}
              </div>

              {/* Passing Score */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">及格分數 (絕對分數)</label>
                <input
                  type="number"
                  min="0"
                  required
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                  value={formData.passing_score}
                  onChange={e => setFormData({...formData, passing_score: parseInt(e.target.value) || 0})}
                />
                <p className="text-xs text-gray-400 font-bold">例如：總分 100 分，請填寫 60。</p>
              </div>

              {/* Target Departments */}
              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 uppercase">受課對象 (可複選)</label>
                    <button
                        type="button"
                        onClick={() => {
                            // 同開課單位
                            if (formData.dept_id) {
                                setFormData(prev => {
                                    const newIds = new Set(prev.target_dept_ids);
                                    newIds.add(prev.dept_id);
                                    return {...prev, target_dept_ids: Array.from(newIds)};
                                });
                            }
                        }}
                        className="text-xs text-blue-600 font-bold hover:underline"
                    >
                        + 同開課單位
                    </button>
                 </div>
                 <div className="border-2 border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto bg-gray-50/50">
                    <div className="grid grid-cols-2 gap-2">
                        {departments.map(dept => (
                            <label key={dept.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    checked={formData.target_dept_ids.includes(dept.id.toString())}
                                    onChange={e => {
                                        const id = dept.id.toString();
                                        setFormData(prev => {
                                            if (e.target.checked) {
                                                return {...prev, target_dept_ids: [...prev.target_dept_ids, id]};
                                            } else {
                                                return {...prev, target_dept_ids: prev.target_dept_ids.filter(tid => tid !== id)};
                                            }
                                        });
                                    }}
                                />
                                <span className="text-sm font-bold text-gray-700">{dept.name}</span>
                            </label>
                        ))}
                    </div>
                 </div>
                 {formData.target_dept_ids.length === 0 && (
                     <p className="text-xs text-orange-500 font-bold flex items-center gap-1">
                         <AlertCircle className="w-3 h-3" />
                         未選擇任何對象，將預設為開課單位
                     </p>
                 )}
              </div>
              {/* ... (footer buttons) ... */}
              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
                >
                  {isEditing ? '儲存變更' : '確認新增'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
