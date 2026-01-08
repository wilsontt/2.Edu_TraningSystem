import { motion } from 'framer-motion';
import { CheckCircle, XCircle, RotateCcw, ArrowRight } from 'lucide-react';

interface ScoreCardProps {
    score: number;
    totalScore: number;
    isPassed: boolean;
    onClose: () => void;
}

const ScoreCard = ({ score, totalScore, isPassed, onClose }: ScoreCardProps) => {

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
            <motion.div 
                initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative"
            >
                {/* 裝飾性標頭 */}
                <div className={`h-32 ${isPassed ? 'bg-green-500' : 'bg-red-500'} relative overflow-hidden flex items-center justify-center`}>
                    <div className="absolute inset-0 bg-white/10 opacity-50 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white/40 to-transparent scale-150" />
                    
                    <motion.div 
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.3, type: "spring" }}
                        className="bg-white p-4 rounded-full shadow-lg relative z-10"
                    >
                        {isPassed ? (
                            <CheckCircle className="w-12 h-12 text-green-500" />
                        ) : (
                            <XCircle className="w-12 h-12 text-red-500" />
                        )}
                    </motion.div>
                </div>

                <div className="p-8 text-center">
                    <motion.h2 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-2xl font-black text-gray-800 mb-1"
                    >
                        {isPassed ? '恭喜通過測驗！' : '很遺憾，未通過測驗'}
                    </motion.h2>
                    <p className="text-gray-500 font-medium mb-6">
                        {isPassed ? '您已掌握本課程核心知識' : '建議您複習後再次挑戰'}
                    </p>

                    <div className="flex justify-center items-end gap-2 mb-8">
                        <span className={`text-6xl font-black ${isPassed ? 'text-green-600' : 'text-red-600'}`}>
                            {score}
                        </span>
                        <span className="text-xl text-gray-400 font-bold mb-2">/ {totalScore} 分</span>
                    </div>

                    {/* 印章動畫 */}
                    <motion.div 
                        initial={{ scale: 2, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.6, type: "spring", bounce: 0.5 }}
                        className={`absolute top-4 right-4 rotate-12 border-4 rounded-lg px-2 py-1 font-black text-lg uppercase tracking-widest opacity-80 select-none pointer-events-none
                            ${isPassed ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600'}
                        `}
                    >
                        {isPassed ? 'PASSED' : 'FAILED'}
                    </motion.div>

                    <div className="space-y-3">
                        <button 
                            onClick={onClose}
                            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2"
                        >
                            回考試首頁
                            <ArrowRight className="w-4 h-4" />
                        </button>
                        {!isPassed && (
                            <button 
                                onClick={() => window.location.reload()} // 簡單重試Demo，理想情況應重置狀態
                                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                            >
                                <RotateCcw className="w-4 h-4" />
                                重新挑戰
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default ScoreCard;
