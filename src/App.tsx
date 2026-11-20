// src/App.tsx
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import FileCenter from './pages/FileCenter';
import AICopilot from './pages/AICopilot';
import Notes from './pages/Notes';
import UserManagement from './pages/UserManagement';
import Login from './pages/Login';
import { useAuthStore, applyThemeToDom } from './store/useAuthStore';
import { useNoteStore } from './store/useNoteStore';
import { resolveDocumentTitle } from './config/siteConfig';
import { KeyRound, X, AlertCircle, Save } from 'lucide-react';

// 路由标题动态同步组件（根据 siteConfig.ts 自动更新浏览器标签名为 DCM-用途）
function RouteTitleSync() {
  const location = useLocation();
  useEffect(() => {
    document.title = resolveDocumentTitle(location.pathname, true);
  }, [location.pathname]);
  return null;
}

function App() {
  const { currentUser, theme, changePassword, syncCurrentUser } = useAuthStore();
  const { unsavedGuardOpen, isSavingBeforeLeave, resolveUnsavedGuard } = useNoteStore();

  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [isBannerIgnored, setIsBannerIgnored] = useState(false);

  // 确保 DOM 主题属性与 store 始终一致
  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  // 登录后拉取一次最新用户信息，确保跨端主题设置同步
  useEffect(() => {
    if (currentUser && currentUser.role !== 'guest') {
      syncCurrentUser();
    }
    if (!currentUser) {
      document.title = resolveDocumentTitle('/login', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 监听侧边栏派发的修改密码事件
  useEffect(() => {
    const handleOpen = () => setIsPwdModalOpen(true);
    window.addEventListener('open_change_pwd_modal', handleOpen);
    return () => window.removeEventListener('open_change_pwd_modal', handleOpen);
  }, []);

  if (!currentUser) {
    return <Login />;
  }

  const handleSavePassword = async () => {
    if (newPwd.length < 6) {
      setPwdError('密码不能少于 6 位');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入密码不一致');
      return;
    }
    try {
      await changePassword(newPwd);
      setIsPwdModalOpen(false);
      setNewPwd('');
      setConfirmPwd('');
      setPwdError('');
      alert('密码修改成功！');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : '密码修改失败');
    }
  };

  return (
    <Router>
      <RouteTitleSync />
      <div className="flex h-screen w-full font-sans text-gray-200 bg-[#1e2128] overflow-hidden relative">
        <Sidebar />

        <main className="flex-1 relative overflow-hidden h-full">
          <Routes>
            <Route path="/" element={<Navigate to="/file-center" replace />} />
            <Route path="/file-center/*" element={<FileCenter />} />
            <Route path="/ai-copilot/*" element={<AICopilot />} />
            <Route path="/notes/*" element={<Notes />} />
            {currentUser.role === 'admin' && (
              <Route path="/users/*" element={<UserManagement />} />
            )}
            <Route path="*" element={<Navigate to="/file-center" replace />} />
          </Routes>
        </main>

        {/* 首次登录右下角悬浮提示卡片 */}
        {currentUser.mustChangePassword && !isBannerIgnored && (
          <div className="absolute bottom-6 right-6 bg-[#252830] border border-yellow-500/50 rounded-2xl p-4 w-80 shadow-2xl z-40 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-yellow-400 font-bold text-xs">
                <AlertCircle size={16} />
                <span>账号安全提醒</span>
              </div>
              <button onClick={() => setIsBannerIgnored(true)} className="text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <p className="text-[11px] text-gray-300 mt-2 mb-3 leading-relaxed">
              您当前使用的是系统分配的初始随机密码，为了保证数据安全，请尽快修改。
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsBannerIgnored(true)}
                className="text-[11px] text-gray-400 hover:text-gray-200 px-2 py-1"
              >
                稍后提醒
              </button>
              <button
                onClick={() => setIsPwdModalOpen(true)}
                className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium text-[11px] px-3 py-1 rounded-lg transition-colors"
              >
                立即修改
              </button>
            </div>
          </div>
        )}

        {/* 全局修改密码弹窗 */}
        {isPwdModalOpen && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#252830] border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-100 flex items-center gap-1.5">
                  <KeyRound size={16} className="text-yellow-400" />
                  修改账号密码
                </h3>
                <button onClick={() => setIsPwdModalOpen(false)} className="text-gray-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              {pwdError && (
                <div className="bg-red-950/40 border border-red-800 text-red-400 text-xs p-2 rounded-lg mb-3">
                  {pwdError}
                </div>
              )}

              <div className="space-y-3 mb-4">
                <input
                  type="password"
                  placeholder="请输入新密码 (不少于6位)"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="w-full bg-[#1e2128] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  placeholder="请再次确认新密码"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  className="w-full bg-[#1e2128] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsPwdModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-[#1e2128]"
                >
                  取消
                </button>
                <button
                  onClick={handleSavePassword}
                  className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-xs font-medium"
                >
                  确认保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 全局笔记未保存提醒弹窗（切笔记 / 切模块 / 退出登录统一拦截） */}
        {unsavedGuardOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#252830] border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                  <AlertCircle size={17} className="text-amber-400" />
                  <span>当前笔记有未保存的更改</span>
                </h3>
                <button
                  disabled={isSavingBeforeLeave}
                  onClick={() => resolveUnsavedGuard('cancel')}
                  className="text-gray-400 hover:text-white disabled:opacity-40"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-5">
                离开当前页面将丢失尚未保存的内容，是否先将改动保存到云端？（可在笔记右上角开启“自动保存”免去每次提醒）
              </p>
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                  disabled={isSavingBeforeLeave}
                  onClick={() => resolveUnsavedGuard('cancel')}
                  className="px-3 py-1.5 rounded-xl text-xs text-gray-400 hover:bg-[#1e2128] transition-colors"
                >
                  取消
                </button>
                <button
                  disabled={isSavingBeforeLeave}
                  onClick={() => resolveUnsavedGuard('discard')}
                  className="px-3 py-1.5 rounded-xl text-xs bg-red-950/40 hover:bg-red-900/50 text-red-400 border border-red-800/50 transition-colors"
                >
                  不保存，直接离开
                </button>
                <button
                  disabled={isSavingBeforeLeave}
                  onClick={() => resolveUnsavedGuard('save')}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-medium shadow transition-colors"
                >
                  <Save size={13} />
                  <span>{isSavingBeforeLeave ? '保存中...' : '保存并离开'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;
