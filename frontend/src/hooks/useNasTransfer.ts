import { useRef, useState } from 'react';
import axios, { type AxiosProgressEvent } from 'axios';
import { idleTransfer, IN_FLIGHT_PROGRESS_CAP, type TransferState } from '../components/teaching/transfer';

/**
 * NAS 登入請求與傳輸進度狀態的共用邏輯（教材套組 Wave 2）。
 * 取代 TeachingMaterialLibrary / PlanMaterialsSection 原本各自重複的
 * requireNas / TransferState / cancelTransfer 樣板。
 */
export function useNasTransfer() {
    const [nasOpen, setNasOpen] = useState(false);
    const [nasPurpose, setNasPurpose] = useState('');
    const pendingActionRef = useRef<((token: string) => void) | null>(null);
    const [transfer, setTransfer] = useState<TransferState>(idleTransfer);
    const abortRef = useRef<AbortController | null>(null);

    const requireNas = (purpose: string, action: (token: string) => void) => {
        pendingActionRef.current = action;
        setNasPurpose(purpose);
        setNasOpen(true);
    };

    const onNasSuccess = (token: string) => {
        setNasOpen(false);
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action?.(token);
    };

    const closeNasModal = () => setNasOpen(false);
    const closeTransfer = () => setTransfer(idleTransfer);
    const cancelTransfer = () => {
        abortRef.current?.abort();
        setTransfer(idleTransfer);
    };

    const onProgress = (e: AxiosProgressEvent) =>
        setTransfer(s => (s.open
            ? { ...s, progress: e.total ? Math.min(IN_FLIGHT_PROGRESS_CAP, Math.round((e.loaded / e.total) * 100)) : s.progress }
            : s));

    const isCancel = (err: unknown) =>
        axios.isCancel(err) || (err as { code?: string })?.code === 'ERR_CANCELED';

    /** 開始一段傳輸：建立 AbortController、開啟進度視窗，回傳 signal 供呼叫端傳給 axios。 */
    const beginTransfer = (title: string): AbortSignal => {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setTransfer({ open: true, title, progress: 0, status: 'transferring', error: null });
        return ctrl.signal;
    };

    const endTransferSuccess = () => {
        setTransfer(s => ({ ...s, progress: 100, status: 'success' }));
        abortRef.current = null;
    };

    const endTransferError = (message: string) => {
        setTransfer(s => ({ ...s, status: 'error', error: message }));
        abortRef.current = null;
    };

    return {
        nasOpen, nasPurpose, transfer,
        requireNas, onNasSuccess, closeNasModal,
        closeTransfer, cancelTransfer, onProgress, isCancel,
        beginTransfer, endTransferSuccess, endTransferError,
    };
}
