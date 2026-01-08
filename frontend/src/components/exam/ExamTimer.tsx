import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface ExamTimerProps {
    limitTime: number; // 允許的總秒數
    onTimeUp: () => void;
}

const ExamTimer = ({ limitTime, onTimeUp }: ExamTimerProps) => {
    // 直接從 prop 初始化 state 以避免 effect 中的同步 setState
    const [timeLeft, setTimeLeft] = useState(limitTime);

    // 僅在 limitTime 顯著變更時同步
    useEffect(() => {
        if (limitTime > 0) {
            setTimeLeft(limitTime);
        }
    }, [limitTime]);

    useEffect(() => {
        if (limitTime <= 0) return;
        if (timeLeft <= 0) {
            onTimeUp();
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, limitTime, onTimeUp]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const isUrgent = timeLeft < 60; // 少於 1 分鐘

    if (limitTime <= 0) return null;

    return (
        <div className={`flex items-center gap-1 font-mono font-bold text-sm px-3 py-1 rounded-full transition-colors duration-500
            ${isUrgent ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-600'}
        `}>
            <Clock className="w-4 h-4" />
            {formatTime(timeLeft)}
        </div>
    );
};

export default ExamTimer;
