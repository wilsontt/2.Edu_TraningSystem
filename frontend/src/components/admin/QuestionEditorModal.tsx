import { useState, useEffect } from 'react';
import { Loader2, X, Plus, Trash2, Check, AlertCircle } from 'lucide-react';
import api from '../../api';

interface Question {
    id: number;
    content: string;
    question_type: string;
    options: string; // JSON string
    answer: string;
    points: number;
    hint?: string;
}

interface QuestionEditorModalProps {
    question: Question;
    onClose: () => void;
    onSave: () => void;
    apiUrl?: string; // 選填：自訂 API 更新路徑，預設為 /admin/exams/questions/{id}
}

const QuestionEditorModal = ({ question, onClose, onSave, apiUrl }: QuestionEditorModalProps) => {
    const [formData, setFormData] = useState({
        content: '',
        question_type: 'single',
        answer: '',
        points: 10,
        options: {} as Record<string, string>,
        hint: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (question) {
            let parsedOptions = {};
            try {
                parsedOptions = JSON.parse(question.options || '{}');
            } catch (e) {
                console.error("Failed to parse options", e);
            }

            setFormData({
                content: question.content,
                question_type: question.question_type,
                answer: question.answer,
                points: question.points,
                options: parsedOptions,
                hint: question.hint || ''
            });
        }
    }, [question]);

    const handleOptionChange = (key: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            options: { ...prev.options, [key]: value }
        }));
    };

    const addOption = () => {
        const keys = Object.keys(formData.options);
        const lastKey = keys.length > 0 ? keys[keys.length - 1] : '';
        let nextKey = 'A';
        if (lastKey && lastKey.length === 1 && lastKey >= 'A' && lastKey < 'Z') {
            nextKey = String.fromCharCode(lastKey.charCodeAt(0) + 1);
        } else if (keys.length === 0) {
            nextKey = 'A';
        } else {
             // Fallback for numeric or other keys, try to find next available letter
             const allLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
             for(let char of allLetters) {
                 if(!keys.includes(char)) {
                     nextKey = char;
                     break;
                 }
             }
        }
        
        setFormData(prev => ({
            ...prev,
            options: { ...prev.options, [nextKey]: '' }
        }));
    };

    const removeOption = (key: string) => {
        const newOptions = { ...formData.options };
        delete newOptions[key];
        setFormData(prev => ({ ...prev, options: newOptions }));
    };

    const handleSubmit = async () => {
        try {
            setIsSaving(true);
            setError(null);
            
            // 驗證
            if (!formData.content.trim()) throw new Error("題目內容不能為空");
            if (formData.question_type !== 'true_false' && Object.keys(formData.options).length === 0) {
                 throw new Error("單選/多選題必須至少有一個選項");
            }
            if (!formData.answer.trim()) throw new Error("答案不能為空");

            const payload = {
                content: formData.content,
                question_type: formData.question_type,
                answer: formData.answer,
                points: formData.points,
                options: JSON.stringify(formData.options),
                hint: formData.hint || null
            };

            const url = apiUrl || `/admin/exams/questions/${question.id}`;
            await api.put(url, payload);
            onSave();
            onClose();
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || err.message || "儲存失敗");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-xl text-gray-800">編輯題目</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm font-bold">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {/* 題目類型與分數 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">題目類型</label>
                            <select 
                                value={formData.question_type}
                                onChange={(e) => setFormData({...formData, question_type: e.target.value})}
                                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                            >
                                <option value="single">單選題 (Single Choice)</option>
                                <option value="multiple">多選題 (Multiple Choice)</option>
                                <option value="true_false">是非題 (True/False)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">分數</label>
                            <input 
                                type="number" 
                                value={formData.points}
                                onChange={(e) => setFormData({...formData, points: parseInt(e.target.value) || 0})}
                                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                            />
                        </div>
                    </div>

                    {/* 題目內容 */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">題目內容</label>
                        <textarea 
                            value={formData.content}
                            onChange={(e) => setFormData({...formData, content: e.target.value})}
                            className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium min-h-[100px]"
                            placeholder="請輸入題目內容..."
                        />
                    </div>

                    {/* 提示內容 */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                            提示內容 <span className="text-gray-400 font-normal">（選填）</span>
                        </label>
                        <textarea 
                            value={formData.hint}
                            onChange={(e) => setFormData({...formData, hint: e.target.value})}
                            className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium min-h-[80px]"
                            placeholder="輸入提示內容，幫助考生思考..."
                        />
                    </div>

                    {/* 選項設定 (動態) */}
                    {formData.question_type !== 'true_false' && (
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex justify-between items-center">
                                <span>選項設定</span>
                                <button 
                                    onClick={addOption}
                                    type="button"
                                    className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 font-bold flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" /> 新增選項
                                </button>
                            </label>
                            <div className="space-y-3">
                                {Object.entries(formData.options).map(([key, val]) => (
                                    <div key={key} className="flex gap-2 items-center">
                                        <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded font-bold text-gray-600 text-sm shrink-0">{key}</span>
                                        <input 
                                            type="text" 
                                            value={val} 
                                            onChange={(e) => handleOptionChange(key, e.target.value)}
                                            className="flex-1 p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                            placeholder={`選項 ${key} 內容`}
                                        />
                                        <button 
                                            onClick={() => removeOption(key)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 正確答案 */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">正確答案</label>
                        {formData.question_type === 'true_false' ? (
                            <div className="flex gap-4">
                                <label className={`flex-1 p-3 border rounded-lg cursor-pointer text-center font-bold transition-all ${formData.answer === 'Y' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <input 
                                        type="radio" 
                                        name="tf_answer" 
                                        value="Y" 
                                        checked={formData.answer === 'Y'} 
                                        onChange={() => setFormData({...formData, answer: 'Y'})}
                                        className="hidden" 
                                    />
                                    是 (Yes)
                                </label>
                                <label className={`flex-1 p-3 border rounded-lg cursor-pointer text-center font-bold transition-all ${formData.answer === 'N' ? 'bg-red-50 border-red-500 text-red-700' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <input 
                                        type="radio" 
                                        name="tf_answer" 
                                        value="N" 
                                        checked={formData.answer === 'N'} 
                                        onChange={() => setFormData({...formData, answer: 'N'})}
                                        className="hidden" 
                                    />
                                    否 (No)
                                </label>
                            </div>
                        ) : (
                            <input 
                                type="text" 
                                value={formData.answer} 
                                onChange={(e) => setFormData({...formData, answer: e.target.value})}
                                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                placeholder={formData.question_type === 'multiple' ? "例如: A,C (多可用逗號分隔)" : "例如: A"}
                            />
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                            {formData.question_type === 'multiple' ? '多選題答案請以逗號分隔或直接連寫 (如 A,C 或 AC)' : '請輸入正確選項代號'}
                        </p>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition-colors"
                        disabled={isSaving}
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isSaving}
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        儲存變更
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuestionEditorModal;
