import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, AlertCircle, CheckCircle, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';
import ExamTimer from './ExamTimer';
import ScoreCard from './ScoreCard';
import ConfirmModal from '../ConfirmModal';
import { useExamProgress } from '../../hooks/useExamProgress';
import type { User } from '../../types';

/** 題目資料結構 */
interface Question {
    id: number;
    /** 題目內容 */
    content: string;
    /** 題目類型 (如: single_choice) */
    question_type: string;
    /** 選項 (JSON 字串) */
    options: string;
    /** 分數 */
    points: number;
}

/** 考試初始資料結構 */
interface ExamStartData {
    plan_id: number;
    /** 考試標題 */
    title: string;
    /** 時間限制 (秒) */
    limit_time: number;
    /** 題目列表 */
    questions: Question[];
}

/** 考試結果資料結構 */
interface ExamResult {
    /** 獲得分數 */
    score: number;
    /** 當次總分 */
    total_score: number;
    /** 是否通過 */
    is_passed: boolean;
}

/**
 * 考試進行組件 (ExamRunner)
 * 
 * 負責處理考試流程，包括：
 * 1. 載入題目與計時器。
 * 2. 顯示單題與選項選擇。
 * 3. 處理上一題/下一題切換動畫。
 * 4. 提交答案與顯示結果。
 */
const ExamRunner = () => {
    const { planId } = useParams();
    const navigate = useNavigate();
    
    // 用戶狀態
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // 考試資料與狀態
    const [examData, setExamData] = useState<ExamStartData | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0); // 當前題目索引
    const [direction, setDirection] = useState(0); // 動畫方向 (1: 下一題, -1: 上一題)
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ExamResult | null>(null);

    // 離開確認模態框狀態
    const [exitModal, setExitModal] = useState(false);

    // 客製化 Hook 處理作答進度
    const { answers, saveAnswer, clearProgress } = useExamProgress(planId, user?.emp_id);

    // 初始化：載入用戶與考試資料
    useEffect(() => {
        const init = async () => {
            try {
                // 1. 取得用戶資訊
                const userRes = await api.get('/auth/me');
                setUser(userRes.data);

                // 2. 取得考試內容
                const res = await api.get(`/exam/start/${planId}`);
                setExamData(res.data);
            } catch (err: unknown) {
                console.error(err);
                if (err && typeof err === 'object' && 'response' in err) {
                     const apiError = err as { response: { data: { detail: string } } };
                     setError(apiError.response?.data?.detail || "無法載入考試，請稍後再試");
                } else {
                     setError("無法載入考試，請稍後再試");
                }
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [planId]);

    /** 處理選項選擇 */
    const handleOptionSelect = (qId: number, value: string) => {
        saveAnswer(qId, value);
    };

    /** 切換至下一題 */
    const handleNext = () => {
        if (!examData) return;
        if (currentIndex < examData.questions.length - 1) {
            setDirection(1);
            setCurrentIndex(prev => prev + 1);
        }
    };

    /** 切換至上一題 */
    const handlePrev = () => {
        if (currentIndex > 0) {
            setDirection(-1);
            setCurrentIndex(prev => prev - 1);
        }
    };

    /** 時間到自動交卷 */
    const handleTimeUp = () => {
        alert("時間到！系統將自動交卷。");
        handleSubmit(true);
    };

    /** 提交試卷 */
    const handleSubmit = async (force = false) => {
        if (!force && !window.confirm("確定要交卷嗎？交卷後無法修改。")) return;
        
        try {
            setSubmitting(true);
            const res = await api.post(`/exam/submit/${planId}`, {
                answers: answers, // Key 是問題 ID (數字), Value 是選項 Key (字串)
                time_spent: 0 // TODO: 如果需要，可記錄實際花費時間
            });
            
            clearProgress();
            setResult(res.data);
            
        } catch (err: unknown) {
            console.error(err);
            alert("交卷失敗，請檢查網路連線後重試");
        } finally {
            setSubmitting(false);
        }
    };

    /** 處理離開考試 */
    const handleExit = () => {
        // 如果有作答紀錄 (Object.keys(answers).length > 0)，則顯示確認框
        // 否則直接離開
        if (Object.keys(answers).length > 0) {
            setExitModal(true);
        } else {
            navigate('/');
        }
    };

    /** 確認離開 */
    const confirmExit = () => {
        setExitModal(false);
        navigate('/');
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        </div>
    );

    if (error || !examData) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">無法開始考試</h2>
                <p className="text-gray-500 mb-6">{error}</p>
                <button 
                    onClick={() => navigate('/')}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors"
                >
                    回首頁
                </button>
            </div>
        </div>
    );

    const totalQuestions = examData.questions?.length || 0;
    
    // 安全檢查：確認題目是否為空
    if (totalQuestions === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                 <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">試卷無題目</h2>
                    <p className="text-gray-500 mb-6">此試卷似乎尚未設定題目，請聯絡管理員。</p>
                    <button 
                        onClick={() => navigate('/')}
                        className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors"
                    >
                        回首頁
                    </button>
                </div>
            </div>
        );
    }
    
    // 確保索引在範圍內 (雖然邏輯應已處理，但雙重檢查)
    const validIndex = Math.min(currentIndex, totalQuestions - 1);
    const currentQuestion = examData.questions[validIndex];
    if (!currentQuestion) return null; // 上述檢查後不應發生

    const progress = Math.round(((validIndex + 1) / totalQuestions) * 100);
    
    // 安全解析選項
    let optionsMap: Record<string, string> = {};
    try {
        optionsMap = JSON.parse(currentQuestion.options || '{}');
    } catch (e) {
        console.error("Failed to parse options", e);
    }

    // 動畫變體 (Variants)
    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? '100%' : '-100%',
            opacity: 0,
            position: 'absolute' as const, // 修正過場時重疊問題
        }),
        center: {
            x: 0,
            opacity: 1,
            position: 'relative' as const,
        },
        exit: (direction: number) => ({
            x: direction < 0 ? '100%' : '-100%',
            opacity: 0,
            position: 'absolute' as const,
        })
    };

    return (
        <div className="fixed inset-0 bg-gray-50 flex flex-col mx-auto shadow-2xl overflow-hidden max-w-lg md:max-w-2xl lg:max-w-3xl border-x border-gray-100 z-50">
            {/* 成績卡 (Score Card) 疊加層 */}
            {result && (
                <ScoreCard 
                    score={result.score} 
                    totalScore={result.total_score} 
                    isPassed={result.is_passed} 
                    onClose={() => navigate('/')} 
                />
            )}

            {/* 頁首 - 固定 */}
            <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100 shadow-sm shrink-0 z-20">
                <button 
                    onClick={handleExit} 
                    className="p-2 -ml-2 text-red-400 hover:text-red-600 active:scale-95 transition-transform"
                    title="離開考試"
                >
                    <AlertCircle className="w-5 h-5" />
                </button>
                <div className="font-bold text-blue-800 text-sm truncate max-w-[150px] md:max-w-xs">
                    {examData.title}
                </div>
                {!result && <ExamTimer limitTime={examData.limit_time} onTimeUp={handleTimeUp} />}
            </div>

            {/* 進度條 - 固定 */}
            <div className="h-1.5 bg-gray-100 w-full shrink-0">
                <div 
                    className="h-full bg-blue-600 transition-all duration-300 ease-out rounded-r-full"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* 題目區域容器 - 可捲動 */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative bg-white w-full scroll-smooth">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.div
                        key={currentIndex}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="w-full min-h-full p-6 pb-24"
                    >
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">
                                    第 {currentIndex + 1} 題
                                </span>
                                <span className="text-xs font-medium text-gray-400">
                                    共 {totalQuestions} 題
                                </span>
                            </div>
                            
                            <h2 className="text-xl md:text-2xl font-bold text-gray-900 leading-relaxed tracking-tight">
                                {currentQuestion.content}
                            </h2>
                        </div>

                        <div className="space-y-3">
                            {Object.entries(optionsMap).map(([key, value]) => {
                                const isSelected = answers[currentQuestion.id] === key;
                                return (
                                    <button
                                        type="button"
                                        key={key}
                                        onClick={() => handleOptionSelect(currentQuestion.id, key)}
                                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 group active:scale-[0.99]
                                            ${isSelected
                                                ? 'border-blue-600 bg-blue-50/50 shadow-blue-100 shadow-inner' 
                                                : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50'}
                                        `}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors duration-200
                                                ${isSelected 
                                                    ? 'border-blue-600 bg-blue-600 text-white' 
                                                    : 'border-gray-300 text-transparent group-hover:border-blue-300'}
                                            `}>
                                                <CheckCircle className="w-4 h-4" />
                                            </div>
                                            <span className={`font-medium text-lg transition-colors ${isSelected ? 'text-blue-900' : 'text-gray-600'}`}>
                                                {value}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* 導航頁尾 - 固定 */}
            <div className="bg-white/90 backdrop-blur-md border-t border-gray-100 p-4 shrink-0 z-20 w-full">
                <div className="flex items-center gap-3 w-full max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto">
                    <button 
                        type="button"
                        onClick={handlePrev}
                        disabled={currentIndex === 0 || submitting}
                        className="flex-1 py-3.5 px-4 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        上一題
                    </button>

                    {currentIndex === totalQuestions - 1 ? (
                        <button 
                            type="button"
                            onClick={() => handleSubmit(false)}
                            disabled={submitting}
                            className="flex-[2] py-3.5 px-4 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70"
                        >
                            {submitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                            交卷
                        </button>
                    ) : (
                        <button 
                            onClick={handleNext}
                            disabled={submitting}
                            className="flex-[2] py-3.5 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            下一題
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* 離開確認對話框 */}
            <ConfirmModal 
                isOpen={exitModal}
                title="確定要離開嗎？"
                message="您已開始作答，直接離開將不會保存目前的進度。建議您完成考試後再離開。"
                confirmText="確定離開"
                cancelText="繼續作答"
                onConfirm={confirmExit}
                onCancel={() => setExitModal(false)}
                isDestructive={true}
            />
        </div>
    );
};

export default ExamRunner;
