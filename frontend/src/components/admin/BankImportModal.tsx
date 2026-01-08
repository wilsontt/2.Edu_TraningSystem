import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import api from '../../api';

interface QuestionBankItem {
    id: number;
    content: string;
    question_type: string;
    created_at: string;
    tags: string;
}

interface BankImportModalProps {
    planId: number;
    onClose: () => void;
    onImportSuccess: () => void;
}

const BankImportModal = ({ planId, onClose, onImportSuccess }: BankImportModalProps) => {
    const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10); // 模態框使用較小的分頁大小
    const [/* total */, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const [keyword, setKeyword] = useState('');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const fetchQuestions = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.append('page', page.toString());
            params.append('size', pageSize.toString());
            if (keyword) params.append('keyword', keyword);
            
            const res = await api.get(`/admin/question-bank?${params.toString()}`);
            setQuestions(res.data.items);
            setTotal(res.data.total);
            setTotalPages(res.data.total_pages);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, keyword]);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchQuestions();
    };

    const toggleSelection = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
        );
    };

    const handleImport = async () => {
        if (selectedIds.length === 0) return;
        
        try {
            setImporting(true);
            const res = await api.post('/admin/question-bank/import', {
                plan_id: planId,
                question_ids: selectedIds
            });
            const { imported, duplicate } = (res as any).data;
            let msg = `匯入成功 ${imported} 題`;
            if (duplicate > 0) msg += `\n(另有 ${duplicate} 題因重複而未匯入)`;
            
            alert(msg);
            onImportSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            alert("匯入失敗");
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900">從題庫匯入題目</h3>
                        <p className="text-xs text-gray-500 font-bold">已選擇 {selectedIds.length} 題</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                        ×
                    </button>
                </div>

                <div className="p-4 border-b border-gray-100">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <input 
                            type="text" 
                            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none"
                            placeholder="搜尋題目..."
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                        />
                        <button type="submit" className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold hover:bg-gray-200">
                            搜尋
                        </button>
                    </form>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/30">
                    {loading ? (
                        <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div>
                    ) : questions.length === 0 ? (
                        <div className="py-8 text-center text-gray-400 font-bold">查無題目</div>
                    ) : (
                        questions.map(q => (
                            <label key={q.id} className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:bg-blue-50 cursor-pointer transition-colors">
                                <input 
                                    type="checkbox"
                                    className="mt-1 w-4 h-4 text-blue-600 rounded"
                                    checked={selectedIds.includes(q.id)}
                                    onChange={() => toggleSelection(q.id)}
                                />
                                <div className="flex-1">
                                    <div className="flex gap-2 mb-1">
                                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                            {q.question_type === 'multiple' ? '多選' : q.question_type === 'true_false' ? '是非' : '單選'}
                                        </span>
                                    </div>
                                    <div className="text-sm font-bold text-gray-800 line-clamp-2">{q.content}</div>
                                </div>
                            </label>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-white flex justify-between items-center">
                    <div className="flex gap-2">
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="w-4 h-4"/></button>
                        <span className="self-center text-sm font-bold text-gray-500">{page} / {Math.max(1, totalPages)}</span>
                        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="w-4 h-4"/></button>
                    </div>
                    
                    <button 
                        onClick={handleImport}
                        disabled={selectedIds.length === 0 || importing}
                        className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        確認匯入
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BankImportModal;
