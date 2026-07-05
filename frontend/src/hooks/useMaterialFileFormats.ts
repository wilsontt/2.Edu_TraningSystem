import { useCallback, useEffect, useState } from 'react';
import api from '../api';

export interface MaterialFileFormat {
    id: number;
    ext: string;
    label: string;
    sort_order: number;
    max_file_bytes: number | null;
    is_active: boolean;
    mime_types?: string | null;
}

/**
 * 載入啟用中的允許檔案格式（上傳選檔器用）。
 */
export function useMaterialFileFormats() {
    const [formats, setFormats] = useState<MaterialFileFormat[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<MaterialFileFormat[]>(
                '/admin/teaching-materials/material-file-formats',
            );
            setFormats(res.data);
        } catch {
            setFormats([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const allowedExts = formats.map(f => f.ext);

    return { formats, allowedExts, loading, reload };
}
