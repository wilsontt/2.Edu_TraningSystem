import { useState, useEffect } from 'react';
import { BookOpen, Clock, CheckCircle, AlertCircle, ChevronRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

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

    useEffect(() => {
        fetchExams();
    }, []);

    const fetchExams = async () => {
        try {
            const res = await api.get('/exam/my_exams');
            setExams(res.data);
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
                    return <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 已通過 ({score}分)</span>;
                } else {
                    return <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> 未通過 ({score}分)</span>;
                }
            case 'active':
                return <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1"><Clock className="w-3 h-3" /> 進行中</span>;
            case 'pending':
                return <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">尚未開始</span>;
            case 'expired':
                return <span className="px-3 py-1 rounded-full bg-gray-300 text-gray-500 text-xs font-bold">已過期</span>;
            default:
                return null;
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <header>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">考試中心</h1>
                <p className="text-gray-500 font-medium">查看您的考試任務與歷史成績</p>
            </header>

            {isLoading ? (
                <div className="py-20 flex justify-center text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : exams.length === 0 ? (
                <div className="py-20 text-center bg-gray-50 rounded-2xl border border-gray-100">
                    <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-700">目前沒有考試任務</h3>
                    <p className="text-gray-400">太棒了！您已完成所有指派的訓練。</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {exams.map((exam) => (
                        <div 
                            key={exam.plan_id} 
                            onClick={() => {
                                const isRetakable = exam.status === 'completed' && (exam.score !== null && exam.score < 60);
                                if (exam.status === 'active' || isRetakable) {
                                    navigate(`/exam/run/${exam.plan_id}`);
                                }
                            }}
                            className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all group flex items-center justify-between
                                ${(exam.status === 'active' || (exam.status === 'completed' && (exam.score !== null && exam.score < 60))) ? 'cursor-pointer ring-2 ring-transparent hover:ring-blue-100' : 'opacity-80 grayscale-[0.3]'}
                                ${(exam.status === 'completed' && (exam.score === null || exam.score >= 60)) ? 'bg-gray-50/50' : ''}
                            `}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg
                                    ${(exam.status === 'active' || (exam.status === 'completed' && exam.score !== null && exam.score < 60)) ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 
                                      exam.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}
                                `}>
                                    {(exam.status === 'active') ? 'Go' : 
                                     (exam.status === 'completed' && exam.score !== null && exam.score < 60) ? <span className="text-xs">Retry</span> :
                                     <BookOpen className="w-6 h-6" />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800 mb-1 group-hover:text-blue-600 transition-colors">
                                        {exam.title}
                                    </h3>
                                    <div className="flex items-center gap-3 text-sm text-gray-500 font-mono">
                                        <span>開放時間: {exam.training_date}</span>
                                        {exam.end_date && <span>~ {exam.end_date}</span>}
                                        {exam.attempts > 0 && (
                                            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-bold ml-2">
                                                挑戰次數: {exam.attempts}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                {getStatusBadge(exam.status, exam.score)}
                                {exam.status === 'active' && <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ExamDashboard;
