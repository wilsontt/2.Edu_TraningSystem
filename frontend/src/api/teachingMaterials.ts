import type { AxiosProgressEvent, AxiosResponse } from 'axios';
import api from '../api';
import type {
    MaterialType, MaterialFileFormat, MaterialSet, MaterialSetList,
    MaterialFileList, SetFileUploadResult, PlanOption,
} from '../types/materials';

const BASE = '/admin/teaching-materials';

export interface TransferOpts {
    signal?: AbortSignal;
    onUploadProgress?: (e: AxiosProgressEvent) => void;
    onDownloadProgress?: (e: AxiosProgressEvent) => void;
}

export const fetchMaterialTypes = () =>
    api.get<MaterialType[]>(`${BASE}/material-types`).then(r => r.data);

export const fetchMaterialFileFormats = () =>
    api.get<MaterialFileFormat[]>(`${BASE}/material-file-formats`).then(r => r.data);

/** 訓練計畫選項（套組綁定）；含 end_date／is_archived 供進行中／已過期排序與作法 A 封存唯讀。 */
export const fetchPlanOptions = () =>
    api.get<PlanOption[]>('/training/plans', { params: { status: 'all' } }).then(r => r.data);

export interface SetListParams {
    page: number;
    size: number;
    keyword?: string;
    material_type_id?: string;
    file_format?: string;
    plan_id?: number;
}

export const fetchSets = (params: SetListParams) =>
    api.get<MaterialSetList>(`${BASE}/sets`, { params }).then(r => r.data);

export const fetchFiles = (params: SetListParams) =>
    api.get<MaterialFileList>(`${BASE}/files`, { params }).then(r => r.data);

export const fetchSetDetail = (setId: number) =>
    api.get<MaterialSet>(`${BASE}/sets/${setId}`).then(r => r.data);

export const createSet = (fd: FormData, opts: TransferOpts = {}): Promise<AxiosResponse<MaterialSet>> =>
    api.post<MaterialSet>(`${BASE}/sets`, fd, opts);

export const updateSet = (
    setId: number,
    payload: { title?: string; material_type_id?: number; description?: string | null; tags?: string[] | null },
) => api.put<MaterialSet>(`${BASE}/sets/${setId}`, payload).then(r => r.data);

export const updateSetPlans = (setId: number, planIds: number[]) =>
    api.put<MaterialSet>(`${BASE}/sets/${setId}/plans`, { plan_ids: planIds }).then(r => r.data);

export const deleteSet = (setId: number) => api.delete(`${BASE}/sets/${setId}`);

export const addSetFiles = (
    setId: number,
    fd: FormData,
    opts: TransferOpts = {},
): Promise<AxiosResponse<SetFileUploadResult>> =>
    api.post<SetFileUploadResult>(`${BASE}/sets/${setId}/files`, fd, opts);

export const removeSetFile = (setId: number, fileId: number) =>
    api.delete(`${BASE}/sets/${setId}/files/${fileId}`);

export const downloadFile = (fileId: number, token: string, opts: TransferOpts = {}) =>
    api.get(`${BASE}/files/${fileId}/download`, {
        params: { nas_session_token: token },
        responseType: 'blob',
        ...opts,
    });

export const batchDownloadFiles = (fileIds: number[], token: string, opts: TransferOpts = {}) =>
    api.post(
        `${BASE}/batch-download`,
        { file_ids: fileIds, nas_session_token: token },
        { responseType: 'blob', ...opts },
    );
