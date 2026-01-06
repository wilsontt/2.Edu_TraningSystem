import { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Settings, Plus, Edit2, Trash2, X, ChevronRight, ChevronDown, Check, FolderTree, AlertCircle } from 'lucide-react';
import api from '../../api';

interface SystemFunction {
  id: number;
  name: string;
  code: string;
  path: string | null;
  parent_id: number | null;
  children: SystemFunction[];
}

const SystemFunctionManager = () => {
  const [functions, setFunctions] = useState<SystemFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  
  // Adding state
  const [isAdding, setIsAdding] = useState(false);
  const [addingParentId, setAddingParentId] = useState<number | null>(null);
  const [newFunc, setNewFunc] = useState({ name: '', code: '', path: '' });
  
  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFunc, setEditFunc] = useState({ name: '', code: '', path: '' });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFunctions();
  }, []);

  const fetchFunctions = async () => {
    try {
      setLoading(true);
      // Using existing /admin/functions but we need a recursive structure or client-side assembly
      // The backend /admin/functions only returns root nodes (parent_id == None). 
      // Models has `children` relationship, so Schema should handle it recursive if configured right.
      const res = await api.get('/admin/functions'); 
      setFunctions(res.data);
    } catch (err) {
      console.error('Failed to fetch functions', err);
      setError('載入功能列表失敗');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
    const newSet = new Set(expandedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedIds(newSet);
  };

  const handleAddStart = (parentId: number | null) => {
    setIsAdding(true);
    setAddingParentId(parentId);
    setNewFunc({ name: '', code: '', path: '' });
    setEditingId(null);
    setError(null);
    
    // Auto expand parent if adding child
    if (parentId) {
        const newSet = new Set(expandedIds);
        newSet.add(parentId);
        setExpandedIds(newSet);
    }
  };

  const handleCreate = async () => {
    if (!newFunc.name || !newFunc.code) {
        setError('名稱與代碼為必填');
        return;
    }
    
    try {
      await api.post('/admin/functions', {
        ...newFunc,
        parent_id: addingParentId,
        path: newFunc.path || null
      });
      setIsAdding(false);
      fetchFunctions();
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        setError(err.response.data.detail);
      } else {
        setError('新增失敗');
      }
    }
  };

  const handleEditStart = (func: SystemFunction) => {
    setEditingId(func.id);
    setEditFunc({ name: func.name, code: func.code, path: func.path || '' });
    setIsAdding(false);
    setError(null);
  };

  const handleUpdate = async (id: number) => {
    if (!editFunc.name || !editFunc.code) return;
    try {
        await api.put(`/admin/functions/${id}`, {
            ...editFunc,
            path: editFunc.path || null,
            parent_id: null // We don't support moving parent yet for simplicity in this UI
        });
        setEditingId(null);
        fetchFunctions();
    } catch (err) {
        if (err instanceof AxiosError && err.response) {
            setError(err.response.data.detail);
        } else {
            setError('更新失敗');
        }
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('確定要刪除此功能嗎？\n注意：必須先刪除所有子節點，且確認無角色使用中。')) return;
    try {
        await api.delete(`/admin/functions/${id}`);
        fetchFunctions();
    } catch (err) {
        if (err instanceof AxiosError && err.response) {
            alert(err.response.data.detail); // Alert is better for delete error here
        } else {
            alert('刪除失敗');
        }
    }
  };

  const renderNode = (func: SystemFunction, level: number = 0) => {
    const isEditing = editingId === func.id;
    const isExpanded = expandedIds.has(func.id);
    const hasChildren = func.children && func.children.length > 0;

    return (
      <div key={func.id} className="relative">
        <div 
            className={`flex items-center gap-2 p-3 rounded-xl border-b border-gray-50 hover:bg-gray-50 transition-colors ${level === 0 ? 'bg-white' : ''}`}
            style={{ paddingLeft: `${level * 1.5 + 1}rem` }}
        >
            {hasChildren ? (
                <button 
                  onClick={() => toggleExpand(func.id)} 
                  className="p-1 hover:bg-gray-200 rounded-md transition-colors text-gray-500"
                >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
            ) : (
                <span className="w-6" /> // spacer
            )}

            {isEditing ? (
                <div className="flex-1 flex gap-2 items-center animate-in fade-in zoom-in-95">
                    <input 
                        className="p-1.5 border border-blue-300 rounded font-bold text-sm w-32 focus:ring-2 ring-blue-100 outline-none" 
                        value={editFunc.name} 
                        onChange={e => setEditFunc({...editFunc, name: e.target.value})} 
                        placeholder="功能名稱"
                        autoFocus
                    />
                    <input 
                        className="p-1.5 border border-gray-300 rounded text-sm text-gray-600 font-mono w-32 focus:ring-2 ring-gray-100 outline-none" 
                        value={editFunc.code} 
                        onChange={e => setEditFunc({...editFunc, code: e.target.value})} 
                        placeholder="代碼 (menu:xxx)"
                    />
                    <input 
                        className="p-1.5 border border-gray-300 rounded text-sm text-gray-600 w-48 focus:ring-2 ring-gray-100 outline-none" 
                        value={editFunc.path} 
                        onChange={e => setEditFunc({...editFunc, path: e.target.value})} 
                        placeholder="路徑 (/admin/...)"
                    />
                    <button onClick={() => handleUpdate(func.id)} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
                        <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex-1 flex items-center gap-3">
                        <span className="font-bold text-gray-700">{func.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md font-mono">{func.code}</span>
                        {func.path && <span className="text-xs text-blue-500 font-mono hidden md:inline-block">{func.path}</span>}
                    </div>
                    
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                        <button 
                            onClick={() => handleAddStart(func.id)} 
                            title="新增子項目"
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => handleEditStart(func)} 
                            title="編輯"
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => handleDelete(func.id)} 
                            title="刪除"
                            className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </>
            )}
        </div>

        {/* Child creation form */}
        {isAdding && addingParentId === func.id && (
             <div 
                className="flex items-center gap-2 p-3 bg-blue-50/50 border-b border-blue-100 animate-in slide-in-from-top-2"
                style={{ paddingLeft: `${(level + 1) * 1.5 + 2.5}rem` }}
            >
                <input 
                    className="p-1.5 border border-blue-300 rounded font-bold text-sm w-32 focus:ring-2 ring-blue-200 outline-none" 
                    value={newFunc.name} 
                    onChange={e => setNewFunc({...newFunc, name: e.target.value})} 
                    placeholder="子功能名稱"
                    autoFocus
                />
                <input 
                    className="p-1.5 border border-gray-300 rounded text-sm text-gray-600 font-mono w-32 focus:ring-2 ring-gray-200 outline-none" 
                    value={newFunc.code} 
                    onChange={e => setNewFunc({...newFunc, code: e.target.value})} 
                    placeholder="代碼"
                />
                <input 
                    className="p-1.5 border border-gray-300 rounded text-sm text-gray-600 w-48 focus:ring-2 ring-gray-200 outline-none" 
                    value={newFunc.path} 
                    onChange={e => setNewFunc({...newFunc, path: e.target.value})} 
                    placeholder="路徑"
                />
                <button onClick={handleCreate} className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm">
                    <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setIsAdding(false)} className="p-1.5 bg-white text-gray-500 rounded-lg hover:bg-gray-100 border border-gray-200">
                    <X className="w-4 h-4" />
                </button>
            </div>
        )}

        {/* Children Recursion */}
        {isExpanded && func.children && (
            <div className="border-l-2 border-gray-100 ml-4">
                {func.children.map(child => renderNode(child, level + 1))}
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Settings className="w-8 h-8 text-gray-700" />
            功能選單管理
          </h1>
          <p className="text-gray-500 mt-2 font-medium">配置系統功能節點與路由結構</p>
        </div>
        <button
          onClick={() => handleAddStart(null)}
          className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-black transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          新增根節點
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {error && (
            <div className="p-4 bg-red-50 text-red-600 border-b border-red-100 flex items-center gap-2 font-bold animate-in slide-in-from-top">
                <AlertCircle className="w-5 h-5" />
                {error}
            </div>
        )}

        {/* Add Root Form */}
        {isAdding && addingParentId === null && (
             <div className="p-4 bg-gray-50 border-b border-gray-200 flex gap-2 animate-in slide-in-from-top">
                <div className="font-bold text-gray-400 self-center mr-2">New Root:</div>
                <input 
                    className="p-2 border border-blue-300 rounded-lg font-bold text-sm w-40 focus:ring-2 ring-blue-100 outline-none" 
                    value={newFunc.name} 
                    onChange={e => setNewFunc({...newFunc, name: e.target.value})} 
                    placeholder="功能名稱"
                    autoFocus
                />
                <input 
                    className="p-2 border border-gray-300 rounded-lg text-sm text-gray-600 font-mono w-40 focus:ring-2 ring-gray-100 outline-none" 
                    value={newFunc.code} 
                    onChange={e => setNewFunc({...newFunc, code: e.target.value})} 
                    placeholder="代碼 (menu:xxx)"
                />
                <input 
                    className="p-2 border border-gray-300 rounded-lg text-sm text-gray-600 w-64 focus:ring-2 ring-gray-100 outline-none" 
                    value={newFunc.path} 
                    onChange={e => setNewFunc({...newFunc, path: e.target.value})} 
                    placeholder="路徑 (/admin/...)"
                />
                <button onClick={handleCreate} className="px-4 bg-gray-900 text-white rounded-lg hover:bg-black font-bold text-sm">
                    確認新增
                </button>
                <button onClick={() => setIsAdding(false)} className="px-4 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-bold text-sm">
                    取消
                </button>
            </div>
        )}
        
        <div className="divide-y divide-gray-100">
            {functions.length === 0 && !loading ? (
                 <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                    <FolderTree className="w-12 h-12 mb-3 opacity-20" />
                    無功能資料
                 </div>
            ) : (
                functions.map(f => renderNode(f))
            )}
        </div>
      </div>
    </div>
  );
};

export default SystemFunctionManager;
