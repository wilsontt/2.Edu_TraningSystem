/**
 * 教材傳輸共用工具（Wave 3）。
 */

/** 觸發瀏覽器下載一個 Blob。 */
export function saveBlob(data: Blob, filename: string): void {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export interface TransferState {
    open: boolean;
    title: string;
    progress: number | null;   // null = 不確定進度
    status: 'transferring' | 'success' | 'error';
    error: string | null;
}

export const idleTransfer: TransferState = {
    open: false,
    title: '',
    progress: null,
    status: 'transferring',
    error: null,
};
