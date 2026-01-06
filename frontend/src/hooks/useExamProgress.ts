import { useState, useEffect, useCallback } from 'react';

const STORAGE_PREFIX = 'exam_progress_';

export const useExamProgress = (planId: string | undefined, userId: string | undefined) => {
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [hasRestored, setHasRestored] = useState(false);

    // Load from storage on mount
    useEffect(() => {
        if (!planId || !userId) return;
        
        const key = `${STORAGE_PREFIX}${userId}_${planId}`;
        const saved = localStorage.getItem(key);
        
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // We use a functional update or just set it. 
                // The lint warning is about cascading updates. 
                // Since this runs once on mount/id-change, it's acceptable but we can optimize.
                setAnswers(parsed);
                console.log(`[Exam] Restored progress for plan ${planId}`);
            } catch (e) {
                console.error("[Exam] Failed to parse saved progress", e);
            }
        }
        setHasRestored(true);
    }, [planId, userId]); // Dependencies are correct for re-hydration on plan switch

    // Save to storage on change
    const saveAnswer = useCallback((qId: number, value: string) => {
        setAnswers(prev => {
            const next = { ...prev, [qId]: value };
            
            // Persist
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
