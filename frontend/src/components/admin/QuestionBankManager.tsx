import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Loader2, Lightbulb, ChevronUp, ChevronDown, Edit } from 'lucide-react';
import api from '../../api';
import QuestionEditorModal from './QuestionEditorModal';
import Pagination from '../common/Pagination';

interface QuestionBankItem {
    id: number;
    content: string;
    question_type: string;
    options: string;
    answer: string;
    tags: string; // JSON string
    hint?: string; // 提示內容（可選）
    created_at: string;
}

const QuestionBankManager = () => {
    const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
    const [loading, setLoading] = useState(false);
    
    // 分頁
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // 篩選
    const [keyword, setKeyword] = useState('');
    const [questionType, setQuestionType] = useState('all');
    const [tagFilter, setTagFilter] = useState('');
    
    // 提示展開狀態
    const [expandedHints, setExpandedHints] = useState<Record<number, boolean>>({});
    
    // 編輯狀態
    const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const fetchQuestions = useCallback(async () => {
        try {
            setLoading(true);
            setFetchError(null);
            const params = new URLSearchParams();
            params.append('page', page.toString());
            params.append('size', pageSize.toString());
            if (keyword) params.append('keyword', keyword);
            if (questionType && questionType !== 'all') params.append('question_type', questionType);
            if (tagFilter) params.append('tags', tagFilter);

            const res = await api.get(`/admin/question-bank/?${params.toString()}`);
            setQuestions(res.data.items);
            setTotal(res.data.total);
            setTotalPages(res.data.total_pages);
        } catch (err: unknown) {
            console.error(err);
            const msg = err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { data?: { detail?: string }; status?: number } }).response?.data?.detail
                    || `HTTP ${(err as { response?: { status?: number } }).response?.status}`
                : '載入題庫失敗';
            setFetchError(String(msg));
            setQuestions([]);
            setTotal(0);
            setTotalPages(0);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, keyword, questionType, tagFilter]);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1); // 重置為第一頁
        fetchQuestions();
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("確定要從題庫中刪除嗎？(不會影響已匯入考卷的題目)")) return;
        try {
            await api.delete(`/admin/question-bank/${id}`);
            fetchQuestions();
        } catch {
            alert("刪除失敗");
        }
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (!window.confirm(`確定要批次刪除 ${ids.length} 題嗎？`)) return;
        try {
            await api.delete('/admin/question-bank/bulk-delete', {
                data: { question_ids: ids }
            });
            setSelectedIds(new Set());
            fetchQuestions();
        } catch {
            alert('批次刪除失敗');
        }
    };

    const renderTags = (tagsJson: string) => {
        try {
            const tags = JSON.parse(tagsJson || '[]');
            if (!Array.isArray(tags)) return null;
            return (
                <div className="flex flex-wrap gap-1">
                    {tags.map((t: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full border border-indigo-100 font-medium">
                            {t}
                        </span>
                    ))}
                </div>
            );
        } catch {
            return null;
        }
    };

    return (
        <div className="h-full flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* 工具列 */}
            <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white flex flex-wrap gap-4 items-center justify-between">
                <form onSubmit={handleSearch} className="flex gap-2 items-center flex-1 min-w-[300px]">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="搜尋題目內容..." 
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                        />
                    </div>
                    <select 
                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer transition-all"
                        value={questionType}
                        onChange={(e) => { setQuestionType(e.target.value); setPage(1); }}
                    >
                        <option value="all">所有題型</option>
                        <option value="single">單選題</option>
                        <option value="multiple">多選題</option>
                        <option value="true_false">是非題</option>
                    </select>
                    <input 
                        type="text"
                        placeholder="標籤篩選"
                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none w-32 transition-all"
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                    />
                    <button type="submit" className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 hover:shadow-md hover:shadow-indigo-200 active:scale-95 transition-all cursor-pointer">
                        <Search className="w-4 h-4" />
                    </button>
                </form>
                
                <div className="text-sm text-indigo-600 font-bold bg-indigo-50 px-3 py-1.5 rounded-full">
                    共 {total} 筆題目
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setSelectedIds(new Set(questions.map((q) => q.id)))}
                        className="px-2 py-1 text-xs font-bold rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                    >
                        全選
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="px-2 py-1 text-xs font-bold rounded border border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer"
                    >
                        不全選
                    </button>
                    <button
                        type="button"
                        onClick={handleBulkDelete}
                        disabled={selectedIds.size === 0}
                        className="px-2 py-1 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        批次刪除 ({selectedIds.size})
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                    <thead className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                            <th className="px-6 py-3 text-xs font-black text-indigo-600 uppercase w-12"></th>
                            <th className="px-6 py-3 text-xs font-black text-indigo-600 uppercase w-16">No.</th>
                            <th className="px-6 py-3 text-xs font-black text-indigo-600 uppercase w-24">題型</th>
                            <th className="px-6 py-3 text-xs font-black text-indigo-600 uppercase">題目內容</th>
                            <th className="px-6 py-3 text-xs font-black text-indigo-600 uppercase w-48">標籤</th>
                            <th className="px-6 py-3 text-xs font-black text-indigo-600 uppercase w-24 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600"/></td></tr>
                        ) : fetchError ? (
                            <tr><td colSpan={6} className="p-8 text-center"><span className="text-red-600 font-bold">{fetchError}</span></td></tr>
                        ) : questions.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-400 italic font-bold">查無資料</td></tr>
                        ) : (
                            questions.map((q, idx) => (
                                <tr key={q.id} className="group transition-all duration-200 border-b border-gray-50 last:border-0 even:bg-gray-100 hover:bg-indigo-50/80">
                                    <td className="px-6 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(q.id)}
                                            onChange={(e) => {
                                                const next = new Set(selectedIds);
                                                if (e.target.checked) next.add(q.id);
                                                else next.delete(q.id);
                                                setSelectedIds(next);
                                            }}
                                            className="w-4 h-4"
                                        />
                                    </td>
                                    <td className="px-6 py-3 text-xs font-mono text-gray-400">
                                        {(page - 1) * pageSize + idx + 1}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                            q.question_type === 'true_false' ? 'bg-amber-100 text-amber-700' : 
                                            q.question_type === 'multiple' ? 'bg-purple-100 text-purple-700' : 
                                            'bg-indigo-100 text-indigo-700'
                                        }`}>
                                            {q.question_type === 'true_false' ? '是非' : q.question_type === 'multiple' ? '多選' : '單選'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="font-bold text-gray-800 line-clamp-2">{q.content}</div>
                                        {/* Show answer preview on hover */}
                                        <div className="text-xs text-green-600 mt-1 opacity-0 group-hover:opacity-100 transition-all font-semibold flex items-center gap-1">
                                            <span className="text-green-500">✓</span> Ans: {q.answer}
                                        </div>
                                        {q.hint && (
                                            <div className="mt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedHints(prev => ({
                                                        ...prev,
                                                        [q.id]: !prev[q.id]
                                                    }))}
                                                    className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition-all cursor-pointer"
                                                >
                                                    <Lightbulb className="w-3 h-3" />
                                                    <span>提示</span>
                                                    {expandedHints[q.id] ? (
                                                        <ChevronUp className="w-3 h-3" />
                                                    ) : (
                                                        <ChevronDown className="w-3 h-3" />
                                                    )}
                                                </button>
                                                {expandedHints[q.id] && (
                                                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-gray-700 leading-relaxed">
                                                        {q.hint}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-3">
                                        {renderTags(q.tags)}
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button 
                                                onClick={() => setEditingQuestion(q)}
                                                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all hover:scale-110 cursor-pointer"
                                                title="編輯題目"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(q.id)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all hover:scale-110 cursor-pointer"
                                                title="刪除題目"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer Pagination */}
            <Pagination
                currentPage={page}
                totalPages={Math.max(1, totalPages)}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
                showTotalItems={false}
            />

            {/* 編輯題目 Modal */}
            {editingQuestion && (
                <QuestionEditorModal
                    question={{
                        ...editingQuestion,
                        points: 10 // 題庫中無分數欄位，給予預設值以符合編輯器介面
                    }}
                    onClose={() => setEditingQuestion(null)}
                    onSave={() => {
                        fetchQuestions();
                        setEditingQuestion(null);
                    }}
                    apiUrl={`/admin/question-bank/${editingQuestion.id}`}
                />
            )}
        </div>
    );
};

export default QuestionBankManager;
