import { useState, useEffect, useCallback } from 'react';

const STORAGE_PREFIX = 'exam_progress_';

export const useExamProgress = (planId: string | undefined, userId: string | undefined) => {
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [hasRestored, setHasRestored] = useState(false);

    // 載入暫存進度
    useEffect(() => {
        if (!planId || !userId) return;
        
        const key = `${STORAGE_PREFIX}${userId}_${planId}`;
        const saved = localStorage.getItem(key);
        
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // 使用 functional update 避免依賴問題
                setAnswers(parsed);
                console.log(`[Exam] Restored progress for plan ${planId}`);
            } catch (e) {
                console.error("[Exam] Failed to parse saved progress", e);
            }
        }
        setHasRestored(true);
    }, [planId, userId]); // 確保在切換計畫時重新載入

    // 變更時儲存進度
    const saveAnswer = useCallback((qId: number, value: string) => {
        setAnswers(prev => {
            const next = { ...prev, [qId]: value };
            
            // 持久化存儲
            if (planId && userId) {
                const key = `${STORAGE_PREFIX}${userId}_${planId}`;
                localStorage.setItem(key, JSON.stringify(next));
            }
            
            return next;
        });
    }, [planId, userId]);

    const clearProgress = useCallback(() => {
        if (planId && userId) {
            const key = `${STORAGE_PREFIX}${userId}_${planId}`;
            localStorage.removeItem(key);
            setAnswers({});
        }
    }, [planId, userId]);

    return {
        answers,
        saveAnswer,
        clearProgress,
        hasRestored
    };
};
