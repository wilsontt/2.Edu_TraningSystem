import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../api';

interface QuestionBankItem {
    id: number;
    content: string;
    question_type: string;
    options: string;
    answer: string;
    tags: string; // JSON string
    created_at: string;
}

const QuestionBankManager = () => {
    const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
    const [loading, setLoading] = useState(false);
    
    // 分頁
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // 篩選
    const [keyword, setKeyword] = useState('');
    const [questionType, setQuestionType] = useState('all');
    const [tagFilter, setTagFilter] = useState('');

    const fetchQuestions = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.append('page', page.toString());
            params.append('size', pageSize.toString());
            if (keyword) params.append('keyword', keyword);
            if (questionType && questionType !== 'all') params.append('question_type', questionType);
            if (tagFilter) params.append('tags', tagFilter);

            const res = await api.get(`/admin/question-bank?${params.toString()}`);
            setQuestions(res.data.items);
            setTotal(res.data.total);
            setTotalPages(res.data.total_pages);
        } catch (err) {
            console.error(err);
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
        } catch (err) {
            alert("刪除失敗");
        }
    };

    const renderTags = (tagsJson: string) => {
        try {
            const tags = JSON.parse(tagsJson || '[]');
            if (!Array.isArray(tags)) return null;
            return (
                <div className="flex flex-wrap gap-1">
                    {tags.map((t: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded border border-gray-200">
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
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
                <form onSubmit={handleSearch} className="flex gap-2 items-center flex-1 min-w-[300px]">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="搜尋題目內容..." 
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                        />
                    </div>
                    <select 
                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none"
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
                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none w-32"
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                    />
                    <button type="submit" className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        <Search className="w-4 h-4" />
                    </button>
                </form>
                
                <div className="text-sm text-gray-500 font-bold">
                    共 {total} 筆題目
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                            <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase w-16">No.</th>
                            <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase w-24">題型</th>
                            <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase">題目內容</th>
                            <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase w-48">標籤</th>
                            <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase w-24 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr><td colSpan={5} className="p-8 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></td></tr>
                        ) : questions.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-gray-400 italic font-bold">查無資料</td></tr>
                        ) : (
                            questions.map((q, idx) => (
                                <tr key={q.id} className="group transition-colors border-b border-gray-50 last:border-0 even:bg-gray-100/60 hover:bg-blue-50/80">
                                    <td className="px-6 py-3 text-xs font-mono text-gray-400">
                                        {(page - 1) * pageSize + idx + 1}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                            q.question_type === 'true_false' ? 'bg-orange-100 text-orange-600' : 
                                            q.question_type === 'multiple' ? 'bg-purple-100 text-purple-600' : 
                                            'bg-blue-100 text-blue-600'
                                        }`}>
                                            {q.question_type === 'true_false' ? '是非' : q.question_type === 'multiple' ? '多選' : '單選'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="font-bold text-gray-800 line-clamp-2">{q.content}</div>
                                        {/* Optional: Show answer preview on hover? */}
                                        <div className="text-xs text-green-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            Ans: {q.answer}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        {renderTags(q.tags)}
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button 
                                            onClick={() => handleDelete(q.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer Pagination */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <button 
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-4 h-4" /> 上一頁
                </button>
                <div className="text-sm font-bold text-gray-600">
                    第 {page} / {Math.max(1, totalPages)} 頁
                </div>
                <button 
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    下一頁 <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default QuestionBankManager;
