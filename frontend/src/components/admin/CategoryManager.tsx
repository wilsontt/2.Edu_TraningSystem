import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Plus, Edit2, Check, X, FolderTree, Search, Loader2, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
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

const CategoryManager = () => {
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Expand/Collapse state
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  
  // Create / Edit state for Main Categories
  const [isAddingMain, setIsAddingMain] = useState(false);
  const [newMainName, setNewMainName] = useState('');
  const [editingMainId, setEditingMainId] = useState<number | null>(null);
  const [editMainName, setEditMainName] = useState('');
  
  // Create / Edit state for Sub Categories
  const [addingSubToMainId, setAddingSubToMainId] = useState<number | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [editingSubId, setEditingSubId] = useState<number | null>(null);
  const [editSubName, setEditSubName] = useState('');

  const fetchCategories = async () => {
    try {
      const res = await api.get<MainCategory[]>('/admin/categories/main');
      setCategories(res.data);
    } catch (err: unknown) {
      console.error('獲取分類清單失敗', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const toggleCategory = (id: number) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  // Main Category handlers
  const handleAddMain = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!newMainName.trim()) return;
    try {
      await api.post('/admin/categories/main', { name: newMainName });
      setNewMainName('');
      setIsAddingMain(false);
      fetchCategories();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        alert(err.response.data.detail);
      } else {
        alert('新增失敗');
      }
    }
  };

  const handleUpdateMain = async (id: number, e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!editMainName.trim()) return;
    try {
      await api.put(`/admin/categories/main/${id}`, { name: editMainName });
      setEditingMainId(null);
      fetchCategories();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        alert(err.response.data.detail);
      } else {
        alert('更新失敗');
      }
    }
  };

  // Sub Category handlers
  const handleAddSub = async (mainId: number, e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!newSubName.trim()) return;
    try {
      await api.post('/admin/categories/sub', { name: newSubName, main_id: mainId });
      setNewSubName('');
      setAddingSubToMainId(null);
      fetchCategories();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        alert(err.response.data.detail);
      } else {
        alert('新增失敗');
      }
    }
  };

  const handleUpdateSub = async (subId: number, mainId: number, e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!editSubName.trim()) return;
    try {
      await api.put(`/admin/categories/sub/${subId}`, { name: editSubName, main_id: mainId });
      setEditingSubId(null);
      fetchCategories();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        alert(err.response.data.detail);
      } else {
        alert('更新失敗');
      }
    }
  };

  const handleDeleteMain = async (id: number, e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!window.confirm('確定要刪除此大項目嗎？(其下必須無細項目)')) return;
    try {
        await api.delete(`/admin/categories/main/${id}`);
        fetchCategories();
    } catch (err) {
        if (err instanceof AxiosError && err.response?.data?.detail) {
            alert(err.response.data.detail);
        } else {
            alert('刪除失敗');
        }
    }
  };

  const handleDeleteSub = async (id: number, e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!window.confirm('確定要刪除此細項目嗎？(必須無被引用的計畫)')) return;
    try {
        await api.delete(`/admin/categories/sub/${id}`);
        fetchCategories();
    } catch (err) {
        if (err instanceof AxiosError && err.response?.data?.detail) {
            alert(err.response.data.detail);
        } else {
            alert('刪除失敗');
        }
    }
  };

  // Filter logic
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cat.sub_categories.some(sub => sub.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Auto-expand on search
  useEffect(() => {
    if (searchTerm.trim()) {
      const idsToExpand = new Set<number>();
      categories.forEach(cat => {
        if (
          cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cat.sub_categories.some(sub => sub.name.toLowerCase().includes(searchTerm.toLowerCase()))
        ) {
          idsToExpand.add(cat.id);
        }
      });
      setExpandedCategories(idsToExpand);
    }
  }, [searchTerm, categories]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-500 font-bold animate-pulse">正在載入分類資料...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <FolderTree className="w-8 h-8 text-blue-600" />
            分類管理
          </h1>
          <p className="text-sm text-gray-500 font-bold mt-1">管理訓練課程的大項目與細項目分類</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddingMain(true)}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100 hover:scale-105"
        >
          <Plus className="w-5 h-5" />
          新增大項目
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="搜尋分類名稱..."
          className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-400 focus:outline-none font-bold text-sm transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Add Main Category Form */}
      {isAddingMain && (
        <div className="mb-6 p-6 bg-linear-to-r from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-200 animate-in slide-in-from-top duration-200">
          <h3 className="text-sm font-black text-gray-700 mb-3">新增大項目</h3>
          <div className="flex gap-3">
            <input
              autoFocus
              type="text"
              className="flex-1 px-4 py-2.5 border-2 border-blue-400 rounded-xl text-sm font-bold focus:outline-none shadow-sm"
              placeholder="輸入大項目名稱..."
              value={newMainName}
              onChange={(e) => setNewMainName(e.target.value)}
              onKeyDown={(e) => {
                const target = e.nativeEvent as unknown as { isComposing: boolean };
                if (e.key === 'Enter' && !target.isComposing) {
                  handleAddMain();
                }
              }}
            />
            <button type="button" onClick={handleAddMain} className="px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all">
              <Check className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => setIsAddingMain(false)} className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Categories List */}
      <div className="space-y-4">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-16 text-gray-400 font-bold">
            <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-20" />
            目前沒有任何分類資料
          </div>
        ) : (
          filteredCategories.map((mainCat) => (
            <div key={mainCat.id} className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100 transition-all hover:shadow-lg">
              {/* Main Category Header */}
              <div className="p-4 bg-linear-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleCategory(mainCat.id)}
                      className="p-1 hover:bg-white/50 rounded-lg transition-all"
                    >
                      {expandedCategories.has(mainCat.id) ? (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      )}
                    </button>
                    {editingMainId === mainCat.id ? (
                      <input
                        autoFocus
                        type="text"
                        className="flex-1 px-3 py-1.5 border-2 border-blue-400 rounded-lg text-sm font-bold focus:outline-none"
                        value={editMainName}
                        onChange={(e) => setEditMainName(e.target.value)}
                        onKeyDown={(e) => {
                          const target = e.nativeEvent as unknown as { isComposing: boolean };
                        if (e.key === 'Enter' && !target.isComposing) {
                            handleUpdateMain(mainCat.id);
                          }
                        }}
                      />
                    ) : (
                      <h3 className="text-lg font-black text-gray-800">{mainCat.name}</h3>
                    )}
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                      {mainCat.sub_categories.length} 項
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {editingMainId === mainCat.id ? (
                      <>
                        <button type="button" onClick={(e) => handleUpdateMain(mainCat.id, e)} className="p-2 text-green-600 hover:bg-green-100 rounded-xl transition-all">
                          <Check className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => setEditingMainId(null)} className="p-2 text-red-600 hover:bg-red-100 rounded-xl transition-all">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMainId(mainCat.id);
                            setEditMainName(mainCat.name);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteMain(mainCat.id, e)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Sub Categories (Collapsible) */}
              {expandedCategories.has(mainCat.id) && (
                <div className="p-4 space-y-2 animate-in slide-in-from-top duration-200">
                  {/* Add Sub Button */}
                  {addingSubToMainId !== mainCat.id && (
                    <button
                      type="button"
                      onClick={() => setAddingSubToMainId(mainCat.id)}
                      className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-bold text-sm flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      新增細項目
                    </button>
                  )}

                  {/* Add Sub Form */}
                  {addingSubToMainId === mainCat.id && (
                    <div className="p-3 bg-blue-50 rounded-xl border-2 border-blue-200 flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        className="flex-1 px-3 py-2 border-2 border-blue-400 rounded-lg text-sm font-bold focus:outline-none"
                        placeholder="輸入細項目名稱..."
                        value={newSubName}
                        onChange={(e) => setNewSubName(e.target.value)}
                        onKeyDown={(e) => {
                          const target = e.nativeEvent as unknown as { isComposing: boolean };
                          if (e.key === 'Enter' && !target.isComposing) {
                            handleAddSub(mainCat.id);
                          }
                        }}
                      />
                      <button type="button" onClick={(e) => handleAddSub(mainCat.id, e)} className="px-3 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-all">
                        <Check className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setAddingSubToMainId(null)} className="px-3 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Sub Categories List */}
                  {mainCat.sub_categories
                    .filter(sub => !searchTerm || sub.name.toLowerCase().includes(searchTerm.toLowerCase()) || mainCat.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((subCat) => (
                    <div key={subCat.id} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all group">
                      {editingSubId === subCat.id ? (
                        <input
                          autoFocus
                          type="text"
                          className="flex-1 px-3 py-1.5 border-2 border-blue-400 rounded-lg text-sm font-bold focus:outline-none"
                          value={editSubName}
                          onChange={(e) => setEditSubName(e.target.value)}
                          onKeyDown={(e) => {
                            const target = e.nativeEvent as unknown as { isComposing: boolean };
                          if (e.key === 'Enter' && !target.isComposing) {
                            handleUpdateSub(subCat.id, mainCat.id);
                          }
                          }}
                        />
                      ) : (
                        <span className="font-bold text-gray-700 text-sm">• {subCat.name}</span>
                      )}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingSubId === subCat.id ? (
                          <>
                            <button type="button" onClick={(e) => handleUpdateSub(subCat.id, mainCat.id, e)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-all">
                              <Check className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setEditingSubId(null)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-all">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSubId(subCat.id);
                                setEditSubName(subCat.name);
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSub(subCat.id, e)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {mainCat.sub_categories.length === 0 && addingSubToMainId !== mainCat.id && !searchTerm && (
                    <p className="text-center text-gray-400 text-sm font-bold py-4">目前無細項目</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CategoryManager;
