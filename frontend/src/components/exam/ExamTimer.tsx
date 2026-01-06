import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface ExamTimerProps {
    limitTime: number; // total seconds allowed
    onTimeUp: () => void;
}

const ExamTimer = ({ limitTime, onTimeUp }: ExamTimerProps) => {
    // Initialize state directly from prop to avoid sync setState in effect
    const [timeLeft, setTimeLeft] = useState(limitTime);

    // Sync only if limitTime prop changes significantly (e.g. new exam loaded)
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

    const isUrgent = timeLeft < 60; // Less than 1 minute

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
