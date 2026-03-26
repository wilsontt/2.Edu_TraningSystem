import { useState, useEffect } from 'react';
import { BookOpen, Clock, CheckCircle, AlertCircle, ChevronRight, Loader2, GraduationCap, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import CheckInButton from './CheckInButton';

interface ExamItem {
    plan_id: number;
    title: string;
    training_date: string;
    end_date: string | null;
    status: 'pending' | 'active' | 'completed' | 'expired';
    score: number | null;
    total_points: number;
    attempts: number;
}

const ExamDashboard = () => {
    const navigate = useNavigate();
    const [exams, setExams] = useState<ExamItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingStartExamId, setPendingStartExamId] = useState<number | null>(null);
    const [showNotCheckedInModal, setShowNotCheckedInModal] = useState(false);
    const [quickCheckInLoading, setQuickCheckInLoading] = useState(false);

    useEffect(() => {
        fetchExams();
    }, []);

    const fetchExams = async () => {
        try {
            const res = await api.get('/exam/my_exams');
            // 過濾掉已過期的考試 (後端狀態為 expired 或 日期已過且未完成)
            // 使用本地時間來進行比較，避免 UTC 時間差問題
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;
            
            const activeExams = res.data.filter((exam: ExamItem) => {
                // 如果後端已經標記為過期，直接過濾
                if (exam.status === 'expired') return false;
                
                // 雙重檢查日期 (防止後端時區差異或狀態更新延遲)
                // 如果有結束日期，且今天已經超過結束日期，且尚未完成，則視為過期
                if (exam.end_date && exam.end_date < today && exam.status !== 'completed') {
                    return false;
                }
                
                return true;
            });
            setExams(activeExams);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusBadge = (status: string, score: number | null) => {
        switch (status) {
            case 'completed':
                if (score !== null && score >= 60) {
                    return <span className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center gap-1.5 shadow-sm"><CheckCircle className="w-3.5 h-3.5" /> 已通過 ({score}分)</span>;
                } else {
                    return <span className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 shadow-sm"><AlertCircle className="w-3.5 h-3.5" /> 未通過 ({score}分)</span>;
                }
            case 'active':
                return <span className="px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 shadow-sm"><Clock className="w-3.5 h-3.5" /> 進行中</span>;
            case 'pending':
                return <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">尚未開始</span>;
            case 'expired':
                return <span className="px-3 py-1.5 rounded-full bg-gray-300 text-gray-500 text-xs font-bold">已過期</span>;
            default:
                return null;
        }
    };

    const handleStartExam = async (planId: number) => {
        try {
            const res = await api.get(`/exam/plan/${planId}/attendance/status`);
            if (res.data?.is_checked_in) {
                navigate(`/exam/run/${planId}`);
                return;
            }
            setPendingStartExamId(planId);
            setShowNotCheckedInModal(true);
        } catch {
            // 若檢查失敗，仍交由 ExamRunner 防呆
            navigate(`/exam/run/${planId}`);
        }
    };

    const handleQuickCheckIn = async () => {
        if (!pendingStartExamId) return;
        try {
            setQuickCheckInLoading(true);
            await api.post(`/exam/plan/${pendingStartExamId}/attendance/checkin`);
            setShowNotCheckedInModal(false);
            navigate(`/exam/run/${pendingStartExamId}`);
        } catch (err: any) {
            alert(err?.response?.data?.detail || '報到失敗，請稍後再試');
        } finally {
            setQuickCheckInLoading(false);
        }
    };

    return (
        <>
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <header className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                    <GraduationCap className="w-7 h-7 text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-1">考試中心</h1>
                    <p className="text-gray-500 font-medium">查看您的考試任務與歷史成績</p>
                </div>
            </header>

            {isLoading ? (
                <div className="py-20 flex justify-center text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            ) : exams.length === 0 ? (
                <div className="py-20 text-center bg-indigo-50/30 rounded-2xl border border-indigo-100">
                    <BookOpen className="w-16 h-16 text-indigo-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-700">目前沒有考試任務</h3>
                    <p className="text-gray-400">太棒了！您已完成所有指派的訓練。</p>
                </div>
            ) : (
                // <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {exams.map((exam) => (
                        <div 
                            key={exam.plan_id} 
                            className={`bg-white p-6 rounded-2xl shadow-sm border transition-all duration-200 group
                                ${(exam.status === 'active' || (exam.status === 'completed' && (exam.score !== null && exam.score < 60))) ? 'border-indigo-100 hover:shadow-lg hover:shadow-indigo-100/50 hover:border-indigo-200 hover:bg-indigo-50/20' : 'border-gray-100 opacity-80 grayscale-[0.3]'}
                                ${(exam.status === 'completed' && (exam.score === null || exam.score >= 60)) ? 'bg-gray-50/50' : ''}
                            `}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-start gap-4 flex-1">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition-all duration-200
                                        ${(exam.status === 'active' || (exam.status === 'completed' && exam.score !== null && exam.score < 60)) ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 
                                          exam.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}
                                    `}>
                                        {(exam.status === 'active') ? 'Go' : 
                                         (exam.status === 'completed' && exam.score !== null && exam.score < 60) ? <span className="text-xs">Retry</span> :
                                         <BookOpen className="w-6 h-6" />}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-gray-800 mb-1 group-hover:text-indigo-600 transition-colors duration-200">
                                            {exam.title}
                                        </h3>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                    {getStatusBadge(exam.status, exam.score)}
                                    {exam.status === 'active' && <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all duration-200" />}
                                </div>
                            </div>

                            {/* 開放時間 ＋ 挑戰次數 */}
                            <div className="flex items-center gap-3 text-sm text-gray-500 font-mono">
                                <span>開放時間: {exam.training_date}</span>
                                {exam.end_date && <span>~ {exam.end_date}</span>}
                                {exam.attempts > 0 && (
                                    <span className="bg-indigo-50 px-2 py-0.5 rounded text-indigo-600 font-bold ml-2">
                                        挑戰次數: {exam.attempts}
                                    </span>
                                )}
                            </div>
                            
                            {/* 報到按鈕區域 - 僅在 active 狀態時顯示 */}
                            {exam.status === 'active' && (
                                <div className="pt-4 border-t border-indigo-100/50">
                                    <CheckInButton 
                                        planId={exam.plan_id}
                                        onCheckInSuccess={() => {
                                            // 報到成功後可以選擇自動進入考試或重新載入列表
                                            // 這裡我們先不自動進入，讓用戶點擊卡片進入
                                        }}
                                    />
                                </div>
                            )}
                            
                            {/* 可點擊區域 - 點擊卡片進入考試 */}
                            {(exam.status === 'active' || (exam.status === 'completed' && (exam.score !== null && exam.score < 60))) && (
                                <div 
                                    onClick={() => {
                                        void handleStartExam(exam.plan_id);
                                    }}
                                    className="mt-4 pt-4 border-t border-indigo-100/50 cursor-pointer text-center font-bold text-sm transition-all duration-200 py-2 rounded-lg hover:bg-green-50 text-green-600 hover:text-green-700"
                                >
                                    開始考試 →
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
        {showNotCheckedInModal && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="px-5 py-4 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
                        <h3 className="font-black text-gray-900">尚未完成報到</h3>
                        <button
                            type="button"
                            onClick={() => setShowNotCheckedInModal(false)}
                            className="p-1.5 rounded-lg hover:bg-white/80 cursor-pointer"
                        >
                            <X className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                    <div className="px-5 py-4 text-sm text-gray-700 leading-relaxed">
                        此訓練尚未報到，請先完成報到再開始考試。是否立即報到？
                    </div>
                    <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setShowNotCheckedInModal(false)}
                            className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={handleQuickCheckIn}
                            disabled={quickCheckInLoading}
                            className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {quickCheckInLoading ? '報到中...' : '立即報到'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default ExamDashboard;
