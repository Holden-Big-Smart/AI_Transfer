// src/pages/Login/index.tsx
import { useState } from 'react';
import { Lock, User, KeyRound, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

export default function Login() {
  const { login, guestLogin, changePassword, currentUser } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 首次登录强制修改密码模态框状态
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passError, setPassError] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const res = await login(username, password);
    if (!res.success) {
      setErrorMsg(res.message || '登录失败');
    } else if (res.mustChange) {
      setIsChangingPass(true);
    }
  };

  const handleSaveNewPassword = async () => {
    if (newPassword.length < 6) {
      setPassError('新密码长度不能少于 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('两次输入的密码不一致');
      return;
    }
    if (newPassword === password) {
      setPassError('新密码不能与初始随机密码相同');
      return;
    }

    if (currentUser) {
      try {
        await changePassword(newPassword);
        setIsChangingPass(false);
      } catch (err) {
        setPassError(err instanceof Error ? err.message : '密码修改失败');
      }
    }
  };

  return (
    <div className="h-screen w-full bg-[#16181d] flex items-center justify-center p-4 select-none">
      <div className="bg-[#1e2128] border border-gray-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative">
        {/* 顶部 Logo 标识 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-blue-500/20 mb-3">
            AI
          </div>
          <h2 className="text-xl font-bold text-gray-100">AI 自动化工作站</h2>
          <p className="text-xs text-gray-400 mt-1">请输入账号凭据以同步知识库及操作云盘</p>
        </div>

        {/* 错误提示 */}
        {errorMsg && (
          <div className="bg-red-950/40 border border-red-800/50 text-red-400 text-xs py-2 px-3 rounded-lg mb-4 text-center">
            {errorMsg}
          </div>
        )}

        {/* 登录表单 */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5 font-medium">账号名称</label>
            <div className="flex items-center bg-[#16181d] border border-gray-700/80 rounded-xl px-3 py-2.5 focus-within:border-blue-500">
              <User size={16} className="text-gray-500 mr-2.5 shrink-0" />
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="管理员或 AE 账号"
                className="w-full bg-transparent text-xs text-gray-200 focus:outline-none placeholder-gray-600"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1.5 font-medium">登录密码</label>
            <div className="flex items-center bg-[#16181d] border border-gray-700/80 rounded-xl px-3 py-2.5 focus-within:border-blue-500">
              <Lock size={16} className="text-gray-500 mr-2.5 shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入分配的密码"
                className="w-full bg-transparent text-xs text-gray-200 focus:outline-none placeholder-gray-600"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-1.5 mt-2"
          >
            <span>验证身份进入</span>
            <ArrowRight size={14} />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
          <span>暂无内部账号？</span>
          <button
            onClick={guestLogin}
            className="text-blue-400 hover:underline flex items-center gap-1"
          >
            以访客身份快速体验
          </button>
        </div>
      </div>

      {/* 强制首次修改密码模态弹窗 */}
      {isChangingPass && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e2128] border border-yellow-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-2 text-yellow-400 mb-3">
              <KeyRound size={20} />
              <h3 className="text-sm font-bold">初次登录：请修改初始密码</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              为了您的数据安全，管理员分配的随机密码仅供首次验证。请自行设置一个全新的专属密码。
            </p>

            {passError && (
              <div className="bg-red-950/40 border border-red-800/50 text-red-400 text-xs py-1.5 px-3 rounded-lg mb-3">
                {passError}
              </div>
            )}

            <div className="space-y-3 mb-5">
              <input
                type="password"
                placeholder="设置新密码 (不少于6位)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-[#16181d] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
              <input
                type="password"
                placeholder="再次输入确认新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#16181d] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleSaveNewPassword}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 rounded-xl text-xs transition-colors shadow"
            >
              保存新密码并进入系统
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
