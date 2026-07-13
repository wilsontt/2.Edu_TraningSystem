import { X } from 'lucide-react';

const fmtSize = (n: number) =>
    (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

interface SelectedFilesListProps {
    files: File[];
    onRemove: (index: number) => void;
}

/** 已選上傳檔案清單（建立／編輯套組共用；字級與對比需清楚可讀）。 */
const SelectedFilesList = ({ files, onRemove }: SelectedFilesListProps) => {
    if (files.length === 0) return null;
    return (
        <ul className="md:col-span-2 border-2 border-gray-200 rounded-lg divide-y divide-gray-100 bg-gray-50">
            {files.map((f, i) => (
                <li key={`${f.name}_${f.size}_${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-sm font-medium text-gray-900 truncate min-w-0">
                        {i + 1}. {f.name}
                        <span className="ml-2 text-sm font-normal text-gray-600 shrink-0">
                            ({fmtSize(f.size)})
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={() => onRemove(i)}
                        className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer shrink-0"
                        title="移除"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </li>
            ))}
        </ul>
    );
};

export default SelectedFilesList;
