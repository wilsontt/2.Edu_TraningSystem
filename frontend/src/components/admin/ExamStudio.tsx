import { useState, useEffect } from 'react';
import { Search, Upload, FileText, Loader2, BookOpen, ChevronRight, AlertCircle, Check, Trash2, Edit, Archive, Download, Lightbulb, ChevronUp, ChevronDown } from 'lucide-react';
import { AxiosError } from 'axios';
import api from '../../api';
import QuestionEditorModal from './QuestionEditorModal';
import QuestionBankManager from './QuestionBankManager';
import BankImportModal from './BankImportModal';

interface TrainingPlan {
  id: number;
  title: string;
  training_date: string;
  dept_id: number;
  sub_category_id: number;
  sub_category?: {
    name: string;
    main_category?: {
        name: string;
    }
  };
}

interface Material {
    filename: string;
    path: string;
    size: number;
    upload_time?: string;
}

interface Question {
    id: number;
    content: string;
    question_type: string;
    options: string; // JSON string
    answer: string;
    points: number;
    hint?: string;
}

const ExamStudio = () => {
    const [plans, setPlans] = useState<TrainingPlan[]>([]);
    const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [questions, setQuestions] = useState<Question[]>([]);
    
    const [isLoadingPlans, setIsLoadingPlans] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
    const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
    const [mode, setMode] = useState<'plan' | 'bank'>('plan');
    const [showImportModal, setShowImportModal] = useState(false);
    const [expandedHints, setExpandedHints] = useState<Record<number, boolean>>({});

    useEffect(() => {
        fetchPlans();
    }, []);

    useEffect(() => {
        if (selectedPlanId) {
            fetchMaterials(selectedPlanId);
            fetchQuestions(selectedPlanId);
        } else {
            setMaterials([]);
            setQuestions([]);
        }
    }, [selectedPlanId]);

    const fetchPlans = async () => {
        try {
            setIsLoadingPlans(true);
            const res = await api.get('/training/plans'); // 正確的 API 端點
            setPlans(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingPlans(false);
        }
    };

    const fetchMaterials = async (planId: number) => {
        try {
            setIsLoadingMaterials(true);
            const res = await api.get(`/admin/exams/materials/${planId}`);
            setMaterials(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingMaterials(false);
        }
    };

    const fetchQuestions = async (planId: number) => {
        try {
            setIsLoadingQuestions(true);
            const res = await api.get(`/admin/exams/questions/${planId}`);
            setQuestions(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingQuestions(false);
        }
    };

    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // ... 現有的 useEffects ...

    // ... 現有的 fetchPlans ...

    // ... 現有的 fetchMaterials ...
    
    // 新增: 取得並顯示預覽
    const handlePreview = async (filename: string) => {
        if (!selectedPlan) return;
        try {
            // 需要年份作為 API 參數... 計畫物件主要透過 training_date 取得年份
            // list_materials (後端) 會從 DB 判斷年份
            // 但預覽 endpoint 需要明確的 year 參數: /materials/preview/{year}/{plan_id}/{filename}
            // 這裡直接從計畫日期的第一部分取得年份
            const year = selectedPlan.training_date.split('-')[0] || "unknown";
            
            const res = await api.get(`/admin/exams/materials/preview/${year}/${selectedPlan.id}/${filename}`);
            setPreviewContent(res.data.content);
            setPreviewFileName(filename);
        } catch (err) {
            console.error(err);
            setUploadError("無法讀取檔案預覽");
        }
    };

    // 新增: 刪除檔案
    const handleDeleteFile = async (filename: string) => {
        if (!selectedPlanId || !window.confirm(`確定要刪除 "${filename}" 嗎？\n注意：相關題目需要另外清除。`)) return;

        try {
            await api.delete(`/admin/exams/materials/${selectedPlanId}/${filename}`);
            fetchMaterials(selectedPlanId);
            setUploadSuccess(`已刪除 ${filename}`);
        } catch (err) {
            console.error(err);
            setUploadError("刪除失敗");
        }
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0 || !selectedPlanId) return;
        
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.txt')) {
            setUploadError('僅支援 TXT 檔案格式');
            return;
        }

        // 檢查是否重複
        const isDuplicate = materials.some(m => m.filename.toLowerCase() === file.name.toLowerCase());
        if (isDuplicate) {
            if (!window.confirm(`檔案 "${file.name}" 已存在。確定要重新上傳並覆蓋嗎？`)) {
                return;
            }
        }

        const formData = new FormData();
        formData.append('plan_id', selectedPlanId.toString());
        formData.append('file', file);
        
        try {
            setIsUploading(true);
            setUploadError(null);
            setUploadSuccess(null);
            
            const res = await api.post('/admin/exams/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            
            const { imported, duplicate, failed } = res.data;
            let msg = `檔案上傳皆匯入成功 (共 ${imported} 題)`;
            if (duplicate > 0 || failed > 0) {
                msg = `匯入完成：成功 ${imported} 題`;
                if (duplicate > 0) msg += `，重複 ${duplicate} 題未匯入`;
                if (failed > 0) msg += `，失敗 ${failed} 題`;
            }
            setUploadSuccess(msg);
            fetchMaterials(selectedPlanId); // Refresh materials list
            fetchQuestions(selectedPlanId); // Refresh questions list
        } catch (err) {
            if (err instanceof AxiosError && err.response) {
                setUploadError(err.response.data.detail || '上傳失敗');
            } else {
                setUploadError('發生未預期錯誤');
            }
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteQuestion = async (id: number) => {
        if (!window.confirm("確定要刪除此題目嗎？")) return;
        
        try {
            await api.delete(`/admin/exams/questions/${id}`);
            if (selectedPlanId) fetchQuestions(selectedPlanId);
        } catch (err) {
            console.error(err);
            alert("刪除失敗");
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        
        if (isUploading) return; // Prevent drop if uploading

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
             handleFileUpload(e.dataTransfer.files);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };
    
    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    // Filter plans and Render
    const filteredPlans = plans.filter((p: TrainingPlan) => 
        p.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const selectedPlan = plans.find((p: TrainingPlan) => p.id === selectedPlanId);

    if (mode === 'bank') {
        return (
            <div className="max-w-7xl mx-auto p-6 space-y-6 h-[calc(100vh-100px)]">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Archive className="w-8 h-8 text-blue-600" />
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">題庫維護</h1>
                            <p className="text-gray-500 font-medium">管理與維護所有歷史題庫</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setMode('plan')}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl font-bold hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        <BookOpen className="w-4 h-4" />
                        返回考卷工坊
                    </button>
                </div>
                <QuestionBankManager />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6 h-[calc(100vh-100px)]">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <BookOpen className="w-8 h-8 text-blue-600" />
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">考卷工坊</h1>
                        <p className="text-gray-500 font-medium">上傳 TXT 考卷題目，系統將自動解析並匯入題庫</p>
                    </div>
                </div>
                <button 
                    onClick={() => setMode('bank')}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-xl font-bold hover:bg-blue-50 transition-colors shadow-sm"
                >
                    <Archive className="w-4 h-4" />
                    歷史題庫維護
                </button>
            </div>

            <div className="grid grid-cols-12 gap-6 h-full">
                {/* Left Panel: Plan Selection */}
                <div className="col-span-4 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[80vh]">
                    <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="搜尋訓練計畫..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        {isLoadingPlans ? (
                            <div className="p-8 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div>
                        ) : filteredPlans.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 font-medium">無相關計畫</div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {filteredPlans.map((plan: TrainingPlan) => (
                                    <button
                                        key={plan.id}
                                        onClick={() => setSelectedPlanId(plan.id)}
                                        className={`w-full text-left p-4 transition-colors flex items-center justify-between group border-b border-gray-50 last:border-b-0 hover:bg-blue-50/80 ${
                                            selectedPlanId === plan.id 
                                                ? 'bg-blue-50 border-l-4 border-l-blue-500' 
                                                : 'border-l-4 border-l-transparent even:bg-gray-100/60'
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <div className="font-bold text-gray-800 truncate mb-1">{plan.title}</div>
                                            <div className="text-xs text-gray-500 font-mono">{plan.training_date}</div>
                                            {plan.sub_category && (
                                                <div className="text-xs text-blue-600 mt-1 inline-block px-1.5 py-0.5 bg-blue-100 rounded">
                                                    {plan.sub_category.name}
                                                </div>
                                            )}
                                        </div>
                                        {selectedPlanId === plan.id && <ChevronRight className="w-4 h-4 text-blue-500" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Workspace */}
                <div className="col-span-8 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[80vh]">
                    {selectedPlan ? (
                        <>
                            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-800 mb-2">{selectedPlan.title}</h2>
                                    <div className="flex gap-4 text-sm text-gray-500">
                                        <span>日期: {selectedPlan.training_date}</span>
                                        <span>分類: {selectedPlan.sub_category?.name || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 flex-1 overflow-y-auto space-y-8">
                                {/* Upload Section (Drag & Drop) */}
                                <div 
                                    className={`rounded-xl p-8 border-2 border-dashed transition-all text-center ${
                                        isDragOver 
                                            ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
                                            : 'border-gray-200 bg-gray-50 hover:border-blue-300'
                                    }`}
                                    onDrop={onDrop}
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                >
                                    <input 
                                        type="file" 
                                        accept=".txt" 
                                        onChange={(e) => handleFileUpload(e.target.files)} 
                                        className="hidden" 
                                        id="file-upload" 
                                        disabled={isUploading}
                                    />
                                    <label htmlFor="file-upload" className={`cursor-pointer flex flex-col items-center gap-3 ${isUploading ? 'opacity-50' : ''}`}>
                                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
                                            {isUploading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Upload className="w-8 h-8" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-xl text-gray-700">點擊或拖放上傳考卷 (TXT)</p>
                                            <p className="text-sm text-gray-400 mt-2">系統將自動解析題目並存入資料庫</p>
                                        </div>
                                        <div className="mt-4 px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-lg text-sm font-medium shadow-sm">
                                            選擇檔案
                                        </div>
                                    </label>
                                    
                                    {uploadError && (
                                        <div className="mt-6 p-4 bg-red-50 text-red-600 text-sm font-bold rounded-lg flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2">
                                            <AlertCircle className="w-5 h-5" />
                                            {uploadError}
                                        </div>
                                    )}
                                    {uploadSuccess && (
                                        <div className="mt-6 p-4 bg-green-50 text-green-600 text-sm font-bold rounded-lg flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2">
                                            <Check className="w-5 h-5" />
                                            {uploadSuccess}
                                        </div>
                                    )}
                                </div>

                                {/* Format Help Section */}
                                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                                    <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 text-blue-500" />
                                        題目格式範例 (TXT)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-gray-500 uppercase">是非題 (True/False)</div>
                                            <div className="bg-white p-3 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 leading-relaxed">
                                                <div>Q: 資訊安全很重要，對嗎？</div>
                                                <div className="text-green-600 font-bold">ANS: Y</div>
                                                <div>SCORE: 10</div>
                                                <div className="text-yellow-600 font-bold mt-1">HINT: 資訊安全是保護資訊資產的重要措施</div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-gray-500 uppercase">單選題 (Single Choice)</div>
                                            <div className="bg-white p-3 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 leading-relaxed">
                                                <div>Q: 哪項不是資安要素？</div>
                                                <div>A: 機密性</div>
                                                <div>B: 完整性</div>
                                                <div>C: 方便性</div>
                                                <div className="text-green-600 font-bold">ANS: C</div>
                                                <div>SCORE: 10</div>
                                                <div className="text-yellow-600 font-bold mt-1">HINT: 資安三要素是 CIA：機密性、完整性、可用性</div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-gray-500 uppercase">複選題 (Multiple Choice)</div>
                                            <div className="bg-white p-3 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 leading-relaxed">
                                                <div>Q: 資安要素包含？</div>
                                                <div>A: 機密性</div>
                                                <div>B: 完整性</div>
                                                <div>C: 可用性</div>
                                                <div className="text-green-600 font-bold">ANS: ABC</div>
                                                <div>SCORE: 20</div>
                                                <div className="text-yellow-600 font-bold mt-1">HINT: 記住 CIA 三要素的英文縮寫</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                        <div className="text-xs text-blue-700 leading-relaxed">
                                            <span className="font-bold">提示欄位說明：</span>
                                            <span className="ml-1">HINT 為選填欄位，可提供給考生考試時的提示內容。格式為 <code className="bg-white px-1 py-0.5 rounded">HINT: 提示內容</code></span>
                                        </div>
                                    </div>
                                </div>

                                {/* Materials List with Preview */}
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-gray-500" />
                                        已匯入考卷檔
                                    </h3>
                                    {isLoadingMaterials ? (
                                        <div className="text-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto"/></div>
                                    ) : materials.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-gray-100 italic">
                                            尚未上傳任何考卷
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {materials.map((file: Material, idx: number) => (
                                                <div 
                                                    key={idx} 
                                                    className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all group"
                                                >
                                                    <button 
                                                        onClick={() => handlePreview(file.filename)}
                                                        className="flex-1 flex items-center gap-3 text-left"
                                                    >
                                                        <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 font-bold text-xs uppercase group-hover:bg-orange-100 transition-colors">
                                                            TXT
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">{file.filename}</div>
                                                            <div className="text-xs text-gray-400 flex items-center gap-2">
                                                                <span>{Math.round(file.size / 1024)} KB</span>
                                                                {file.upload_time && (
                                                                    <>
                                                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                                        <span>{file.upload_time}</span>
                                                                    </>
                                                                )}
                                                                <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                                <span>點擊預覽</span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                    
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteFile(file.filename);
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                                                        title="刪除檔案"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Questions List */}
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                            <Check className="w-5 h-5 text-gray-500" />
                                            已匯入題庫 ({questions.length})
                                        </h3>
                                        <button 
                                            onClick={() => setShowImportModal(true)}
                                            className="text-sm font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-blue-200"
                                        >
                                            <Download className="w-4 h-4" />
                                            從題庫匯入
                                        </button>
                                    </div>
                                    {isLoadingQuestions ? (
                                        <div className="text-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto"/></div>
                                    ) : questions.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-gray-100 italic">
                                            目前無題目
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                                            {questions.map((q: Question, idx: number) => (
                                                <div key={q.id} className="p-4 transition-colors group even:bg-gray-100/60 hover:bg-blue-50/80">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex gap-2">
                                                            <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded">
                                                                {q.question_type === 'true_false' ? '是非題' : q.question_type === 'multiple' ? '多選題' : '單選題'}
                                                            </span>
                                                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Score: {q.points}</span>
                                                            {q.hint && (
                                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                                                                    <Lightbulb className="w-3 h-3" />
                                                                    有提示
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={() => setEditingQuestion(q)}
                                                                className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                                                                title="編輯"
                                                            >
                                                                <Edit className="w-4 h-4" />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteQuestion(q.id)}
                                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                                title="刪除"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="font-bold text-gray-800 mb-2">
                                                        <span className="text-gray-400 mr-2">{idx + 1}.</span>
                                                        {q.content}
                                                    </div>
                                                    <div className="pl-6 space-y-1">
                                                        {q.question_type !== 'true_false' && (() => {
                                                            try {
                                                                const opts = JSON.parse(q.options || '{}');
                                                                return Object.entries(opts).map(([key, val]) => (
                                                                    <div key={key} className={`text-sm ${key === q.answer || (q.answer.includes(key) && q.question_type === 'multiple') ? 'text-green-600 font-bold' : 'text-gray-500'}`}>
                                                                        {key}. {val as string}
                                                                        {(key === q.answer || (q.answer?.includes(key) && q.question_type === 'multiple')) && ' ✓'}
                                                                    </div>
                                                                ));
                                                            } catch { return <div className="text-red-500 text-sm">選項解析錯誤</div>; }
                                                        })()}
                                                        {q.question_type === 'true_false' && (
                                                            <div className="text-sm font-bold text-green-600">
                                                                答案: {q.answer === 'Y' ? '是 (Yes)' : '否 (No)'}
                                                            </div>
                                                        )}
                                                        {q.hint && (
                                                            <div className="mt-3 pt-3 border-t border-gray-200">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExpandedHints(prev => ({
                                                                        ...prev,
                                                                        [q.id]: !prev[q.id]
                                                                    }))}
                                                                    className="flex items-center gap-2 text-xs font-bold text-yellow-600 hover:text-yellow-700 transition-colors"
                                                                >
                                                                    <Lightbulb className="w-4 h-4" />
                                                                    <span>提示</span>
                                                                    {expandedHints[q.id] ? (
                                                                        <ChevronUp className="w-3 h-3" />
                                                                    ) : (
                                                                        <ChevronDown className="w-3 h-3" />
                                                                    )}
                                                                </button>
                                                                {expandedHints[q.id] && (
                                                                    <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                                        <div className="flex items-start gap-2">
                                                                            <Lightbulb className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                                                                            <p className="text-xs text-gray-700 leading-relaxed">
                                                                                {q.hint}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                            <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                            <p className="font-bold text-lg">請先從左側選擇一個訓練計畫</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview Modal */}
            {previewContent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800">{previewFileName}</h3>
                            <button 
                                onClick={() => { setPreviewContent(null); setPreviewFileName(null); }}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <span className="text-xl">×</span>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-gray-50 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                            {previewContent}
                        </div>
                    </div>
                </div>
            )}

            {/* Question Editor Modal */}
            {editingQuestion && (
                <QuestionEditorModal 
                    question={editingQuestion}
                    onClose={() => setEditingQuestion(null)}
                    onSave={() => {
                        if (selectedPlanId) fetchQuestions(selectedPlanId);
                    }}
                />
            )}

            {/* Import Modal */}
            {showImportModal && selectedPlanId && (
                <BankImportModal 
                    planId={selectedPlanId}
                    onClose={() => setShowImportModal(false)}
                    onImportSuccess={() => {
                        fetchQuestions(selectedPlanId);
                    }}
                />
            )}
        </div>
    );
};

export default ExamStudio;
