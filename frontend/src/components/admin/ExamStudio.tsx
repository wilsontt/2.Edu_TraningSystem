/**
 * 考卷工坊元件 (Exam Studio Component)
 * 負責處理考試題目的生命週期管理：TXT 上傳解析匯入、題目編輯、歷史題庫匯入。
 * TXT 僅為一次性匯入載體，不維護 NAS 考卷檔清單。
 */

import { useState, useEffect, useMemo } from 'react';
import { Search, Upload, Loader2, BookOpen, ChevronRight, AlertCircle, Check, Trash2, Edit, Archive, Download, Lightbulb, ChevronUp, ChevronDown, X, Library } from 'lucide-react';
import { AxiosError } from 'axios';
import api from '../../api';
import QuestionEditorModal from './QuestionEditorModal';
import QuestionBankManager from './QuestionBankManager';
import BankImportModal from './BankImportModal';
import Pagination from '../common/Pagination';
import TeachingMaterialLibrary from '../teaching/TeachingMaterialLibrary';
import type { User } from '../../types';
import { canModifyOwnedResource } from '../../utils/authGuards';

interface TrainingPlan {
  id: number;
  title: string;
  training_date: string;
  end_date?: string | null;
  is_archived?: boolean;
  dept_id?: number | null;
  sub_category_id: number;
  sub_category?: {
    name: string;
    main_category?: {
        name: string;
    }
  };
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

interface ExamStudioProps {
  user: User;
}

const ExamStudio = ({ user }: ExamStudioProps) => {
    const [plans, setPlans] = useState<TrainingPlan[]>([]);
    const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    
    const [isLoadingPlans, setIsLoadingPlans] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [planStatusFilter, setPlanStatusFilter] = useState<'active' | 'expired' | 'archived' | 'all'>('active');
    
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
    const [mode, setMode] = useState<'plan' | 'bank' | 'materials'>('plan');
    const [showImportModal, setShowImportModal] = useState(false);
    const [expandedHints, setExpandedHints] = useState<Record<number, boolean>>({});
    
    // 題目清單分頁狀態
    const [questionPage, setQuestionPage] = useState(1);
    const [questionPageSize, setQuestionPageSize] = useState(10);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        fetchPlans();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planStatusFilter]);

    useEffect(() => {
        if (selectedPlanId) {
            fetchQuestions(selectedPlanId);
        } else {
            setQuestions([]);
        }
    }, [selectedPlanId]);

    const fetchPlans = async () => {
        try {
            setIsLoadingPlans(true);
            // 考卷工坊需要自己的 plans API（menu:exam 權限即可），並支援狀態篩選
            const res = await api.get(`/admin/exams/plans?status=${planStatusFilter}`);
            setPlans(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingPlans(false);
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

    const [isDragOver, setIsDragOver] = useState(false);
    /** 上傳預覽：解析後的題目列表，使用者勾選後再匯入 */
    const [uploadPreviewQuestions, setUploadPreviewQuestions] = useState<Array<{ content: string; type?: string; answer?: string; options?: string; points?: number; hint?: string; level?: string }>>([]);
    const [uploadPreviewFileName, setUploadPreviewFileName] = useState<string | null>(null);
    const [uploadPreviewSelected, setUploadPreviewSelected] = useState<Set<number>>(new Set());
    const [uploadPreviewAddToBank, setUploadPreviewAddToBank] = useState(true);
    const [showUploadPreviewModal, setShowUploadPreviewModal] = useState(false);
    const [isImportingFromPreview, setIsImportingFromPreview] = useState(false);

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0 || !selectedPlanId) return;
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.txt')) {
            setUploadError('僅支援 TXT 檔案格式');
            return;
        }
        try {
            setIsUploading(true);
            setUploadError(null);
            setUploadSuccess(null);
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('/admin/exams/upload/preview', formData);
            setUploadPreviewQuestions(res.data.questions || []);
            setUploadPreviewFileName(res.data.filename || file.name);
            setUploadPreviewSelected(new Set((res.data.questions || []).map((_: unknown, i: number) => i)));
            setShowUploadPreviewModal(true);
        } catch (err) {
            if (err instanceof AxiosError && err.response) {
                setUploadError(String(err.response.data?.detail || '解析失敗'));
            } else {
                setUploadError('發生未預期錯誤');
            }
        } finally {
            setIsUploading(false);
        }
    };

    const handleImportFromPreview = async () => {
        if (!selectedPlanId || uploadPreviewQuestions.length === 0) return;
        const selected = Array.from(uploadPreviewSelected).sort((a, b) => a - b);
        const toImport = selected.map(i => uploadPreviewQuestions[i]).filter(q => q.content && q.answer);
        if (toImport.length === 0) {
            setUploadError('請至少勾選一題');
            return;
        }
        try {
            setIsImportingFromPreview(true);
            setUploadError(null);
            const res = await api.post('/admin/exams/import-from-preview', {
                plan_id: selectedPlanId,
                questions: toImport.map(q => ({
                    type: q.type || 'single',
                    content: q.content,
                    options: q.options || '{}',
                    answer: q.answer,
                    points: q.points ?? 10,
                    hint: q.hint ?? null,
                    level: q.level ?? null,
                })),
                add_to_bank: uploadPreviewAddToBank,
            });
            setUploadSuccess(`已匯入 ${res.data.imported} 題${res.data.duplicate > 0 ? `，${res.data.duplicate} 題重複略過` : ''}`);
            setShowUploadPreviewModal(false);
            fetchQuestions(selectedPlanId);
        } catch (err) {
            if (err instanceof AxiosError && err.response) {
                setUploadError(String(err.response.data?.detail || '匯入失敗'));
            } else {
                setUploadError('匯入失敗');
            }
        } finally {
            setIsImportingFromPreview(false);
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

    const handleBulkDeleteQuestions = async () => {
        const ids = Array.from(selectedQuestionIds);
        if (ids.length === 0) return;
        if (!window.confirm(`確定要刪除已選取的 ${ids.length} 題嗎？`)) return;
        try {
            await api.delete('/admin/exams/questions/bulk-delete', {
                data: { question_ids: ids }
            });
            setSelectedQuestionIds(new Set());
            if (selectedPlanId) fetchQuestions(selectedPlanId);
        } catch (err) {
            console.error(err);
            alert('批次刪除失敗');
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
    const filteredPlans = useMemo(() => {
        return plans.filter((p: TrainingPlan) => 
            p.title.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [plans, searchTerm]);
    const selectedPlan = plans.find((p: TrainingPlan) => p.id === selectedPlanId);

    const todayStr = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    const isSelectedPlanLocked = useMemo(() => {
        if (!selectedPlan) return false;
        const isArchived = Boolean(selectedPlan.is_archived);
        const isExpired = Boolean(selectedPlan.end_date && selectedPlan.end_date < todayStr);
        return isArchived || isExpired;
    }, [selectedPlan, todayStr]);

    /** 非開課單位僅能讀取考題，不可新增／編輯／刪除 */
    const isOwnerReadOnly = useMemo(() => {
        if (!selectedPlan) return false;
        return !canModifyOwnedResource(user, selectedPlan.dept_id);
    }, [selectedPlan, user]);

    const isWriteLocked = isSelectedPlanLocked || isOwnerReadOnly;

    const selectedPlanLockReason = useMemo(() => {
        if (!selectedPlan) return null;
        if (selectedPlan.is_archived) return '已封存';
        if (selectedPlan.end_date && selectedPlan.end_date < todayStr) return '已過期';
        return null;
    }, [selectedPlan, todayStr]);

    // 題目分頁計算
    const questionTotalPages = Math.ceil(questions.length / questionPageSize);
    const questionStartIndex = (questionPage - 1) * questionPageSize;
    const paginatedQuestions = questions.slice(questionStartIndex, questionStartIndex + questionPageSize);

    // 當選擇不同計畫時，重置題目分頁
    useEffect(() => {
        setQuestionPage(1);
        setSelectedQuestionIds(new Set());
    }, [selectedPlanId, questionPageSize]);

    if (mode === 'bank') {
        return (
            <div className="max-w-7xl mx-auto p-6 space-y-6 h-[calc(100vh-100px)]">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Archive className="w-8 h-8 text-indigo-600" />
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">題庫維護</h1>
                            <p className="text-gray-500 font-medium">管理與維護所有歷史題庫</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setMode('plan')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-600 border border-indigo-200 rounded-xl font-bold hover:bg-indigo-50 transition-all duration-200 shadow-sm cursor-pointer"
                    >
                        <BookOpen className="w-4 h-4" />
                        返回考卷工坊
                    </button>
                </div>
                <QuestionBankManager user={user} />
            </div>
        );
    }

    if (mode === 'materials') {
        return <TeachingMaterialLibrary user={user} onBack={() => setMode('plan')} />;
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6 h-[calc(100vh-100px)]">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <BookOpen className="w-8 h-8 text-indigo-600" />
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">考卷工坊</h1>
                        <p className="text-gray-500 font-medium">上傳 TXT 考卷題目，系統將自動解析並匯入題庫</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMode('materials')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600 hover:shadow-indigo-300 transition-all duration-200 shadow-lg shadow-indigo-200 cursor-pointer"
                    >
                        <Library className="w-4 h-4" />
                        教材庫
                    </button>
                    <button
                        onClick={() => setMode('bank')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 hover:shadow-green-300 transition-all duration-200 shadow-lg shadow-green-200 cursor-pointer"
                    >
                        <Archive className="w-4 h-4" />
                        歷史題庫維護
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6 h-full">
                {/* Left Panel: Plan Selection（約少 1/4 寬度，讓出給右欄） */}
                <div className="col-span-3 bg-white rounded-2xl shadow-sm border border-indigo-100/50 overflow-hidden flex flex-col h-[80vh]">
                    <div className="p-4 border-b border-indigo-100 bg-linear-to-r from-indigo-50/50 to-purple-50/30">
                        <div className="flex items-center gap-2 mb-3">
                            <select
                                value={planStatusFilter}
                                onChange={(e) => {
                                    setPlanStatusFilter(e.target.value as typeof planStatusFilter);
                                }}
                                className="flex-1 px-3 py-2 bg-white border-2 border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200 cursor-pointer"
                            >
                                <option value="active">正在進行中</option>
                                <option value="expired">已過期</option>
                                <option value="archived">已封存</option>
                                <option value="all">全部</option>
                            </select>
                            <button
                                type="button"
                                onClick={fetchPlans}
                                className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors duration-200 shadow-sm shadow-indigo-200 cursor-pointer"
                                title="重新載入"
                            >
                                更新
                            </button>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="搜尋訓練計畫..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-white border-2 border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200"
                            />
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        {isLoadingPlans ? (
                            <div className="p-8 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600"/></div>
                        ) : filteredPlans.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 font-medium">無相關計畫</div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {filteredPlans.map((plan: TrainingPlan) => (
                                    <button
                                        key={plan.id}
                                        onClick={() => setSelectedPlanId(plan.id)}
                                        className={`w-full text-left p-4 transition-all duration-200 flex items-center justify-between group border-b border-gray-50 last:border-b-0 hover:bg-indigo-50/50 cursor-pointer ${
                                            selectedPlanId === plan.id 
                                                ? 'bg-indigo-50 border-l-4 border-l-indigo-500' 
                                                : 'border-l-4 border-l-transparent even:bg-gray-100'
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <div className="font-bold text-gray-800 truncate mb-1">{plan.title}</div>
                                            <div className="text-xs text-gray-500 font-mono">{plan.training_date}</div>
                                            {plan.sub_category && (
                                                <div className="text-xs text-indigo-600 mt-1 inline-block px-1.5 py-0.5 bg-indigo-100 rounded">
                                                    {plan.sub_category.name}
                                                </div>
                                            )}
                                        </div>
                                        {selectedPlanId === plan.id && <ChevronRight className="w-4 h-4 text-indigo-500" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Workspace */}
                <div className="col-span-9 bg-white rounded-2xl shadow-sm border border-indigo-100/50 flex flex-col h-[80vh]">
                    {selectedPlan ? (
                        <>
                            <div className="p-6 border-b border-indigo-100 flex justify-between items-start bg-linear-to-r from-indigo-50/30 to-purple-50/20">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-800 mb-2">{selectedPlan.title}</h2>
                                    <div className="flex gap-4 text-sm text-gray-500">
                                        <span>日期: {selectedPlan.training_date}</span>
                                        {selectedPlan.end_date ? <span>結束: {selectedPlan.end_date}</span> : null}
                                        <span>分類: {selectedPlan.sub_category?.name || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 flex-1 overflow-y-auto space-y-8">
                                {isOwnerReadOnly && (
                                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 font-bold text-sm leading-relaxed">
                                        僅開課單位或超管可管理此訓練計畫的考題；目前為檢視模式（不可上傳、匯入、編輯或刪除）。
                                    </div>
                                )}
                                {isSelectedPlanLocked && !isOwnerReadOnly && (
                                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 font-bold text-sm leading-relaxed">
                                        此訓練計畫目前為「{selectedPlanLockReason}」，為避免歷史資料被更動，已停用「上傳考卷」與「從題庫匯入」功能。<br />
                                        若需變更，請至「訓練計劃管理」解除封存或調整訓練日期後，再回到考卷工坊調整題目。
                                    </div>
                                )}
                                {/* 上傳拖放區（左）＋題目格式範例（右）並排 */}
                                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                                    {/* Upload Section (Drag & Drop) — 縮小高度／內距 */}
                                    <div
                                        className={`xl:col-span-4 rounded-xl p-4 border-2 border-dashed transition-all duration-200 text-center flex flex-col justify-center ${
                                            isDragOver
                                                ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
                                                : 'border-indigo-200 bg-indigo-50/30 hover:border-indigo-400 hover:bg-indigo-50/50'
                                        } ${isWriteLocked ? 'opacity-50 pointer-events-none select-none' : ''}`}
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
                                            disabled={isUploading || isWriteLocked}
                                        />
                                        <label htmlFor="file-upload" className={`cursor-pointer flex flex-col items-center gap-2 ${isUploading ? 'opacity-50' : ''}`}>
                                            <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0">
                                                {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                            </div>
                                            <div className="text-center">
                                                <p className="font-bold text-sm text-gray-700">點擊或拖放上傳考卷 (TXT)</p>
                                                <p className="text-xs text-gray-400 mt-1">解析題目後勾選匯入本訓練計畫（可選同步歷史題庫）</p>
                                            </div>
                                            <div className="border-2 shrink-0 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-colors duration-200">
                                                選擇檔案
                                            </div>
                                            <p className="text-xs text-gray-500">上傳後將先預覽題目，由您勾選要匯入的題目再寫入</p>
                                        </label>

                                        {uploadError && (
                                            <div className="mt-3 p-2.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2">
                                                <AlertCircle className="w-4 h-4 shrink-0" />
                                                {uploadError}
                                            </div>
                                        )}
                                        {uploadSuccess && (
                                            <div className="mt-3 p-2.5 bg-green-50 text-green-600 text-xs font-bold rounded-lg flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2">
                                                <Check className="w-4 h-4 shrink-0" />
                                                {uploadSuccess}
                                            </div>
                                        )}
                                    </div>

                                    {/* Format Help Section */}
                                    <div className="xl:col-span-8 bg-indigo-50/30 rounded-xl p-4 border border-indigo-100">
                                        <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 text-indigo-500" />
                                            題目格式範例 (TXT)
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="space-y-1.5">
                                                <div className="text-xs font-bold text-gray-500 uppercase">是非題 (True/False)</div>
                                                <div className="bg-white p-2.5 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 leading-relaxed">
                                                    <div>Q: 資訊安全很重要，對嗎？</div>
                                                    <div className="text-green-600 font-bold">ANS: Y</div>
                                                    <div>SCORE: 10</div>
                                                    <div className="text-yellow-600 font-bold mt-1">HINT: 資訊安全是保護資訊資產的重要措施</div>
                                                    <div className="text-indigo-600 font-bold mt-1">LEVEL: E</div>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="text-xs font-bold text-gray-500 uppercase">單選題 (Single Choice)</div>
                                                <div className="bg-white p-2.5 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 leading-relaxed">
                                                    <div>Q: 哪項不是資安要素？</div>
                                                    <div>A: 機密性</div>
                                                    <div>B: 完整性</div>
                                                    <div>C: 方便性</div>
                                                    <div className="text-green-600 font-bold">ANS: C</div>
                                                    <div>SCORE: 10</div>
                                                    <div className="text-yellow-600 font-bold mt-1">HINT: 資安三要素是 CIA：機密性、完整性、可用性</div>
                                                    <div className="text-indigo-600 font-bold mt-1">LEVEL: M</div>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="text-xs font-bold text-gray-500 uppercase">複選題 (Multiple Choice)</div>
                                                <div className="bg-white p-2.5 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 leading-relaxed">
                                                    <div>Q: 資安要素包含？</div>
                                                    <div>A: 機密性</div>
                                                    <div>B: 完整性</div>
                                                    <div>C: 可用性</div>
                                                    <div className="text-green-600 font-bold">ANS: ABC</div>
                                                    <div>SCORE: 20</div>
                                                    <div className="text-yellow-600 font-bold mt-1">HINT: 記住 CIA 三要素的英文縮寫</div>
                                                    <div className="text-indigo-600 font-bold mt-1">LEVEL: H</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-3 space-y-1.5">
                                            <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-200 text-xs text-indigo-700 leading-relaxed">
                                                <span className="font-bold">提示欄位說明：</span>
                                                <span className="ml-1">HINT 為選填，格式 <code className="bg-white px-1 py-0.5 rounded">HINT: 提示內容</code></span>
                                            </div>
                                            <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-200 text-xs text-indigo-700 leading-relaxed">
                                                <span className="font-bold">難易度 LEVEL（選填）：</span>
                                                <span className="ml-1">E / M / H 或 Easy / Medium / Hard，格式 <code className="bg-white px-1 py-0.5 rounded">LEVEL: E</code></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Questions List */}
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                            <Check className="w-5 h-5 text-green-500" />
                                            本計畫題目 ({questions.length})
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedQuestionIds(new Set(questions.map(q => q.id)))}
                                                className="text-xs font-bold px-2 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                            >
                                                全選
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedQuestionIds(new Set())}
                                                className="text-xs font-bold px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer"
                                            >
                                                不全選
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleBulkDeleteQuestions}
                                                disabled={selectedQuestionIds.size === 0 || isWriteLocked}
                                                className="text-xs font-bold px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                            >
                                                批次刪除 ({selectedQuestionIds.size})
                                            </button>
                                            <button
                                                onClick={() => setShowImportModal(true)}
                                                disabled={isWriteLocked}
                                                className={`text-sm font-bold px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 border cursor-pointer ${
                                                    isWriteLocked
                                                        ? 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed'
                                                        : 'text-indigo-600 hover:bg-indigo-50 border-indigo-200'
                                                }`}
                                            >
                                                <Download className="w-4 h-4" />
                                                從題庫匯入
                                            </button>
                                        </div>
                                    </div>
                                    {isLoadingQuestions ? (
                                        <div className="text-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-600"/></div>
                                    ) : questions.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400 bg-indigo-50/30 rounded-xl border border-indigo-100 italic">
                                            目前無題目
                                        </div>
                                    ) : (
                                        <>
                                        <div className="divide-y divide-gray-50 border border-indigo-100 rounded-2xl overflow-hidden">
                                            {paginatedQuestions.map((q: Question, idx: number) => {
                                                const displayIndex = questionStartIndex + idx + 1;
                                                return (
                                                <div key={q.id} className="p-4 transition-all duration-200 group even:bg-gray-100 hover:bg-indigo-50/30 cursor-pointer">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex gap-2 items-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedQuestionIds.has(q.id)}
                                                                onChange={(e) => {
                                                                    const next = new Set(selectedQuestionIds);
                                                                    if (e.target.checked) next.add(q.id);
                                                                    else next.delete(q.id);
                                                                    setSelectedQuestionIds(next);
                                                                }}
                                                                className="w-4 h-4"
                                                            />
                                                            <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded">
                                                                {q.question_type === 'true_false' ? '是非題' : q.question_type === 'multiple' ? '多選題' : '單選題'}
                                                            </span>
                                                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Score: {q.points}</span>
                                                            {q.hint && (
                                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                                                                    <Lightbulb className="w-3 h-3" />
                                                                    有提示
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1 sm:gap-2">
                                                            <button 
                                                                onClick={() => setEditingQuestion(q)}
                                                                disabled={isWriteLocked}
                                                                className="p-1.5 min-h-10 min-w-10 flex items-center justify-center text-gray-500 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                                                title={isWriteLocked ? (isOwnerReadOnly ? '僅開課單位可編輯' : '已封存／已過期不可編輯') : '編輯'}
                                                            >
                                                                <Edit className="w-4 h-4" />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteQuestion(q.id)}
                                                                disabled={isWriteLocked}
                                                                className="p-1.5 min-h-10 min-w-10 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                                                title={isWriteLocked ? (isOwnerReadOnly ? '僅開課單位可刪除' : '已封存／已過期不可刪除') : '刪除'}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="font-bold text-gray-800 mb-2">
                                                        <span className="text-gray-400 mr-2">{displayIndex}.</span>
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
                                            );
                                            })}
                                        </div>
                                        
                                        {/* 題目分頁控制 */}
                                        {questions.length > 0 && (
                                            <Pagination
                                                currentPage={questionPage}
                                                totalPages={questionTotalPages}
                                                pageSize={questionPageSize}
                                                totalItems={questions.length}
                                                onPageChange={setQuestionPage}
                                                onPageSizeChange={(size) => {
                                                    setQuestionPageSize(size);
                                                    setQuestionPage(1);
                                                }}
                                                className="mt-4 rounded-xl border border-indigo-100"
                                            />
                                        )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                            <BookOpen className="w-16 h-16 mb-4 opacity-20 text-indigo-300" />
                            <p className="font-bold text-lg">請先從左側選擇一個訓練計畫</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 上傳預覽 Modal：勾選題目後再匯入 */}
            {showUploadPreviewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <div className="p-4 border-b border-indigo-100 flex justify-between items-center bg-linear-to-r from-indigo-50 to-purple-50">
                            <h3 className="font-bold text-lg text-gray-800">預覽題目：{uploadPreviewFileName}（共 {uploadPreviewQuestions.length} 題）</h3>
                            <button onClick={() => setShowUploadPreviewModal(false)} className="p-2 hover:bg-white/50 rounded-full cursor-pointer">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setUploadPreviewSelected(new Set(uploadPreviewQuestions.map((_, i) => i)))}
                                    className="text-sm font-bold text-indigo-600 hover:underline cursor-pointer"
                                >
                                    全選
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                    type="button"
                                    onClick={() => setUploadPreviewSelected(new Set())}
                                    className="text-sm font-bold text-indigo-600 hover:underline cursor-pointer"
                                >
                                    取消全選
                                </button>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={uploadPreviewAddToBank}
                                    onChange={(e) => setUploadPreviewAddToBank(e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 rounded"
                                />
                                <span className="text-sm font-bold text-gray-700">同時匯入題庫</span>
                            </label>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 min-h-0">
                            <ul className="space-y-2">
                                {uploadPreviewQuestions.map((q, idx) => (
                                    <li key={idx} className={`p-3 rounded-lg border text-sm ${uploadPreviewSelected.has(idx) ? 'bg-indigo-50/50 border-indigo-200' : 'bg-gray-50/50 border-gray-200'}`}>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={uploadPreviewSelected.has(idx)}
                                                onChange={(e) => {
                                                    const next = new Set(uploadPreviewSelected);
                                                    if (e.target.checked) next.add(idx); else next.delete(idx);
                                                    setUploadPreviewSelected(next);
                                                }}
                                                className="mt-1 w-4 h-4 text-indigo-600 rounded"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-gray-800">{idx + 1}. {q.content}</div>
                                                <div className="text-gray-500 mt-1">答案: {q.answer} · 配分: {q.points ?? 10}{q.level ? ` · 難度: ${q.level}` : ''}</div>
                                            </div>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowUploadPreviewModal(false)}
                                className="px-4 py-2 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 cursor-pointer"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={handleImportFromPreview}
                                disabled={uploadPreviewSelected.size === 0 || isImportingFromPreview}
                                className="px-4 py-2 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                            >
                                {isImportingFromPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                加入該訓練計畫（{uploadPreviewSelected.size} 題）
                            </button>
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
