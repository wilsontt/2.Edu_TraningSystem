import React, { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api';
import axios from 'axios';
import { KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react';

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return '密碼至少 8 個字元';
  if (!/[A-Z]/.test(pw)) return '密碼須含至少 1 個大寫字母';
  if (!/[a-z]/.test(pw)) return '密碼須含至少 1 個小寫字母';
  if (!/[0-9]/.test(pw)) return '密碼須含至少 1 個數字';
  if (!/[^A-Za-z0-9]/.test(pw)) return '密碼須含至少 1 個特殊字元';
  return null;
}

const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const changeToken = (location.state as { change_token?: string } | null)?.change_token;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!changeToken) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center border border-gray-100">
          <p className="text-red-600 font-bold mb-4">無效的密碼變更連結</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:underline font-semibold"
          >
            返回登入頁
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validatePassword(newPassword);
    if (validationError) { setError(validationError); return; }
    if (newPassword !== confirmPassword) { setError('兩次密碼輸入不一致'); return; }

    setLoading(true);
    setError('');
    try {
      await api.post('/auth/password/change', {
        change_token: changeToken,
        new_password: newPassword,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || '密碼更新失敗');
      } else {
        setError('系統發生錯誤，請稍後再試');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="bg-blue-600 p-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md border border-white/30">
              <KeyRound className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">變更密碼</h2>
            <p className="text-blue-100 mt-2 text-sm font-medium opacity-90">
              請設定新密碼以繼續使用系統
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-6 bg-white">
          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <p className="text-green-700 font-bold text-lg">密碼已成功更新</p>
              <p className="text-gray-500 text-sm">即將返回登入頁…</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded-r-lg">
                  <span className="font-bold">提示：</span>{error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">新密碼</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <KeyRound size={18} />
                  </div>
                  <input
                    type={showNew ? 'text' : 'password'}
                    placeholder="至少 8 碼，含大小寫、數字、特殊字元"
                    className="block w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">確認新密碼</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <KeyRound size={18} />
                  </div>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="再次輸入新密碼"
                    className="block w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all duration-300 text-gray-700 font-medium"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 rounded-2xl p-4 text-xs text-blue-700 space-y-1">
                <p className="font-bold">密碼規則：</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>至少 8 個字元</li>
                  <li>至少 1 個大寫字母（A-Z）</li>
                  <li>至少 1 個小寫字母（a-z）</li>
                  <li>至少 1 個數字（0-9）</li>
                  <li>至少 1 個特殊字元（如 !@#$%）</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-4 rounded-2xl shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 disabled:bg-blue-300 disabled:shadow-none disabled:translate-y-0"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    <span>更新中...</span>
                  </div>
                ) : (
                  <><KeyRound size={20} /> 確認更新密碼</>
                )}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
