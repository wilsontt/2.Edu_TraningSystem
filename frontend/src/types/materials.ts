/** 教材套組共用型別（Wave 2）。見教材 PLAN §5.12、§7。 */

export interface MaterialType {
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    max_file_bytes: number | null;
    is_active: boolean;
}

export interface MaterialFileFormat {
    id: number;
    ext: string;
    label: string;
    sort_order: number;
    max_file_bytes: number | null;
    is_active: boolean;
    mime_types?: string | null;
}

export interface MaterialSetFile {
    id: number;
    original_filename: string;
    file_format: string;
    file_size_bytes: number;
    uploaded_by: string;
    uploaded_at: string;
    is_active: boolean;
}

export interface MaterialSet {
    id: number;
    title: string;
    material_type_id: number;
    description: string | null;
    tags: string | null;
    year: string;
    uploaded_by: string;
    uploaded_at: string;
    is_active: boolean;
    file_count: number;
    plan_ids: number[];
    plan_titles: string[];
    files?: MaterialSetFile[];
}

export interface MaterialSetList {
    items: MaterialSet[];
    total: number;
    page: number;
    size: number;
    total_pages: number;
}

export interface MaterialFileListItem {
    id: number;
    set_id: number;
    set_title: string;
    original_filename: string;
    file_format: string;
    file_size_bytes: number;
    uploaded_by: string;
    uploaded_at: string;
    is_active: boolean;
    plan_titles: string[];
}

export interface MaterialFileList {
    items: MaterialFileListItem[];
    total: number;
    page: number;
    size: number;
    total_pages: number;
}

export interface SetFileUploadResult {
    succeeded: { id: number; original_filename: string; overwritten?: boolean }[];
    failed: { original_filename: string; reason: string }[];
}

/** 上傳套組建立回應與 SetFileUploadResult 共用此形狀的子集，故沿用 MaterialSet。 */
export interface PlanOption {
    id: number;
    title: string;
    end_date?: string | null;
    is_archived?: boolean;
}
