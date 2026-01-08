import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect } from 'react';
import { RotateCcw, ArrowRight } from 'lucide-react';

interface ScoreCardProps {
    score: number;
    totalScore: number;
    isPassed: boolean;
    onClose: () => void;
}

const ScoreCard = ({ score, totalScore, isPassed, onClose }: ScoreCardProps) => {
    const count = useMotionValue(0);
    const rounded = useTransform(count, latest => Math.round(latest));

    // 分數滾動動畫
    useEffect(() => {
        const controls = animate(count, score, { duration: 1, ease: "easeOut" });
        return controls.stop;
    }, [score, count]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, rotate: 2 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="bg-[#fffcf5] w-full max-w-sm rounded overflow-hidden relative shadow-[2px_2px_15px_rgba(0,0,0,0.1)] border-t border-l border-white/50"
                style={{
                    backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
                    backgroundSize: '20px 20px' 
                }}
            >
                {/* 裝飾性膠帶效果 */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-8 bg-yellow-200/80 rotate-1 shadow-sm z-10 skew-x-12 opacity-90"></div>

                <div className="p-8 text-center relative z-0">
                    
                    {/* 標題區域 */}
                    <div className="mb-6 font-['Caveat']">
                        <motion.h2 
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="text-3xl font-bold text-gray-700 -rotate-2"
                        >
                            {isPassed ? 'Excellent Work!' : 'Keep Trying!'}
                        </motion.h2>
                        <p className="text-gray-500 font-bold text-lg mt-1">
                            {isPassed ? '測驗通過' : '未通過'}
                        </p>
                    </div>

                    {/* 分數顯示區域 */}
                    <div className="relative inline-block py-6 px-10 mb-8">
                        {/* 手寫紅圈動畫 */}
                        {isPassed && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ filter: 'drop-shadow(2px 2px 2px rgba(220, 38, 38, 0.2))' }}>
                                <motion.path
                                    d="M 10 50 C 20 20, 100 10, 180 40 C 220 55, 200 100, 150 110 C 100 120, 50 110, 20 80 C 10 60, 40 40, 80 40"
                                    fill="transparent"
                                    stroke="#DC2626"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 1 }}
                                    transition={{ duration: 0.8, delay: 0.5, ease: "easeInOut" }}
                                />
                                <motion.path
                                    d="M 170 50 C 160 30, 80 20, 30 60 C 10 80, 40 120, 100 125 C 160 130, 210 100, 190 60"
                                    fill="transparent"
                                    stroke="#DC2626"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 0.7 }}
                                    transition={{ duration: 0.7, delay: 1.2, ease: "easeInOut" }}
                                />
                            </svg>
                        )}
                        
                        <div className="flex flex-col items-center relative z-10 font-['Caveat'] text-red-600 transform -rotate-3 origin-center">
                            <div className="flex items-baseline">
                                <motion.span className="text-8xl font-bold tracking-tighter loading-none">
                                    {rounded}
                                </motion.span>
                                <span className="text-4xl font-bold ml-2 opacity-80 decoration-2 decoration-red-600 underline decoration-wavy">分</span>
                            </div>
                            <div className="text-2xl font-bold text-red-500/80 border-t-2 border-red-500/50 w-full pt-1 mt-1 -rotate-2">
                                / {totalScore}
                            </div>
                        </div>
                    </div>

                    {/* 按鈕區域 */}
                    <div className="space-y-3 font-sans">
                        <button 
                            onClick={onClose}
                            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
                        >
                            回考試首頁
                            <ArrowRight className="w-4 h-4" />
                        </button>
                        {!isPassed && (
                            <button 
                                onClick={() => window.location.reload()} // 簡單重試Demo，理想情況應重置狀態
                                className="w-full py-3 bg-white text-gray-700 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-2 active:scale-95"
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
