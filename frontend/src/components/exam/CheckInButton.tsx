import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, Loader2, AlertCircle } from 'lucide-react';
import api from '../../api';

interface CheckInButtonProps {
    planId: number;
    onCheckInSuccess?: () => void;
}

interface AttendanceStatus {
    is_checked_in: boolean;
    checkin_time?: string;
}

const CheckInButton: React.FC<CheckInButtonProps> = ({ planId, onCheckInSuccess }) => {
    const [status, setStatus] = useState<AttendanceStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [checkingIn, setCheckingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 載入報到狀態
    const fetchStatus = async () => {
        try {
            setLoading(true);
            const res = await api.get<AttendanceStatus>(`/exam/plan/${planId}/attendance/status`);
            setStatus(res.data);
            setError(null);
        } catch (err: any) {
            console.error('Failed to fetch attendance status', err);
            setError(err.response?.data?.detail || '無法載入報到狀態');
        } finally {
            setLoading(false);
        }
    };

    // 執行報到
    const handleCheckIn = async () => {
        if (!confirm('確定要報到嗎？報到後即可開始考試。')) {
            return;
        }

        try {
            setCheckingIn(true);
            setError(null);
            const res = await api.post(`/exam/plan/${planId}/attendance/checkin`);
            
            // 更新狀態
            setStatus({
                is_checked_in: true,
                checkin_time: res.data.checkin_time
            });
            
            if (onCheckInSuccess) {
                onCheckInSuccess();
            }
        } catch (err: any) {
            console.error('Failed to check in', err);
            setError(err.response?.data?.detail || '報到失敗，請稍後再試');
        } finally {
            setCheckingIn(false);
        }
    };

    // 初始載入狀態
    useEffect(() => {
        fetchStatus();
    }, [planId]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span className="text-sm">載入中...</span>
            </div>
        );
    }

    if (status?.is_checked_in) {
        const checkinTime = status.checkin_time 
            ? new Date(status.checkin_time).toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })
            : '';
        
        return (
            <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-bold">已報到</span>
                {checkinTime && (
                    <span className="text-xs text-gray-500 font-mono">({checkinTime})</span>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}
            <button
                onClick={handleCheckIn}
                disabled={checkingIn}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all duration-200 shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-200 disabled:bg-indigo-300 disabled:cursor-not-allowed cursor-pointer"
            >
                {checkingIn ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>報到中...</span>
                    </>
                ) : (
                    <>
                        <Clock className="w-4 h-4" />
                        <span>立即報到</span>
                    </>
                )}
            </button>
        </div>
    );
};

export default CheckInButton;
