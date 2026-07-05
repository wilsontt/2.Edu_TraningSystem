/**
 * 教材傳輸共用工具（Wave 3；20260704 允許格式改由 API 動態載入）。
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

/**
 * 傳輸中進度條上限。axios 的 onUploadProgress／onDownloadProgress 僅反映「網路傳輸」進度，
 * 小檔案常瞬間衝到 100%，但伺服器端（NAS 寫入、衝突處理、稽核紀錄）仍需時間，造成「100% 後還在轉」
 * 的錯覺。傳輸中先封頂於此值，實際完成（收到回應）時才跳到 100% 並切換為成功狀態。
 */
export const IN_FLIGHT_PROGRESS_CAP = 90;

export const idleTransfer: TransferState = {
    open: false,
    title: '',
    progress: null,
    status: 'transferring',
    error: null,
};

export const MAX_MATERIAL_FILES = 5;

/** 由允許副檔名清單組出 input[type=file] 的 accept 屬性。 */
export function buildMaterialAccept(allowedExts: string[]): string {
    return allowedExts.map(e => `.${e}`).join(',');
}

export interface MergeFilesResult {
    merged: File[];
    rejected: string[];   // 副檔名不允許而被擋下的檔名
    overflow: number;     // 超過上限而被捨棄的數量
}

/** 將新選取的檔案累加進既有清單（去重、擋副檔名、上限 5 檔），而非覆蓋前次選取。 */
export function mergeSelectedFiles(
    existing: File[],
    picked: File[],
    allowedExts: string[],
): MergeFilesResult {
    const allowed = new Set(allowedExts.map(e => e.toLowerCase()));
    const rejected: string[] = [];
    const valid = picked.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        const ok = !!ext && allowed.has(ext);
        if (!ok) rejected.push(f.name);
        return ok;
    });
    const seen = new Set(existing.map(f => `${f.name}_${f.size}`));
    const deduped = valid.filter(f => {
        const key = `${f.name}_${f.size}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    let merged = [...existing, ...deduped];
    let overflow = 0;
    if (merged.length > MAX_MATERIAL_FILES) {
        overflow = merged.length - MAX_MATERIAL_FILES;
        merged = merged.slice(0, MAX_MATERIAL_FILES);
    }
    return { merged, rejected, overflow };
}
