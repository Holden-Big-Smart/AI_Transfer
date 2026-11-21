// src/components/layout/Sidebar.tsx
import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Bot,
  NotebookPen,
  MonitorPlay,
  Users,
  KeyRound,
  LogOut,
  Moon,
  Sun,
  Leaf,
  Check
} from 'lucide-react';
import { useAuthStore, type ThemeMode } from '../../store/useAuthStore';
import { useNoteStore } from '../../store/useNoteStore';
import AvatarModal from '../AvatarModal';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; desc: string }> = [
  { value: 'dark', label: '暗色风格', desc: '深邃护眼默认主题' },
  { value: 'light', label: '亮色风格', desc: '清爽高亮日间办公' },
  { value: 'eyecare', label: '护眼风格', desc: '柔和暖纸长时阅读' }
];

export default function Sidebar() {
  const { currentUser, theme, noteAutoSave, setTheme, logout } = useAuthStore();
  const { hasUnsavedChanges, requestProtectedAction } = useNoteStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const canUseAi = Boolean(currentUser && currentUser.role !== 'guest');

  useEffect(() => {
    if (!isThemeMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isThemeMenuOpen]);

  const handleGuardedNav = (e: React.MouseEvent, targetPath: string) => {
    if (location.pathname.startsWith(targetPath)) return;
    if (hasUnsavedChanges) {
      e.preventDefault();
      requestProtectedAction(() => navigate(targetPath), noteAutoSave);
    }
  };

  const handleGuardedLogout = () => {
    if (hasUnsavedChanges) {
      requestProtectedAction(() => logout(), noteAutoSave);
    } else {
      logout();
    }
  };

  const renderThemeIcon = (mode: ThemeMode, size = 16) => {
    if (mode === 'light') return <Sun size={size} className="text-amber-400" />;
    if (mode === 'eyecare') return <Leaf size={size} className="text-emerald-400" />;
    return <Moon size={size} className="text-blue-400" />;
  };

  return (
    <div ref={menuContainerRef} className="contents">
      {/* 桌面端左侧纵向导航栏 */}
      <aside className="hidden md:flex w-16 bg-[#16181d] border-r border-gray-800 flex-col items-center py-5 select-none shrink-0 z-30 relative">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/20 mb-8">
          AI
        </div>

        <nav className="flex flex-col gap-4 flex-1 w-full px-2">
          <NavLink
            to="/file-center"
            onClick={(e) => handleGuardedNav(e, '/file-center')}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 font-medium'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`
            }
            title="文件管理中心"
          >
            <FolderKanban size={20} className="mb-1" />
            <span className="text-[10px]">文件</span>
          </NavLink>

          {canUseAi && (
            <NavLink
              to="/ai-copilot"
              onClick={(e) => handleGuardedNav(e, '/ai-copilot')}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 font-medium'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                }`
              }
              title="DCM-助手"
            >
              <Bot size={20} className="mb-1" />
              <span className="text-[10px]">助手</span>
            </NavLink>
          )}

          <NavLink
            to="/notes"
            onClick={(e) => handleGuardedNav(e, '/notes')}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-3 rounded-xl transition-all relative ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 font-medium'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`
            }
            title="在线笔记"
          >
            <NotebookPen size={20} className="mb-1" />
            <span className="text-[10px]">笔记</span>
            {hasUnsavedChanges && (
              <span
                className="w-2 h-2 rounded-full bg-amber-400 absolute top-2 right-2.5 animate-pulse"
                title="有未保存的笔记修改"
              />
            )}
          </NavLink>

          <NavLink
            to="/screen-share"
            onClick={(e) => handleGuardedNav(e, '/screen-share')}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 font-medium'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`
            }
            title="远程屏幕共享"
          >
            <MonitorPlay size={20} className="mb-1" />
            <span className="text-[10px]">投屏</span>
          </NavLink>

          {currentUser?.role === 'admin' && (
            <NavLink
              to="/users"
              onClick={(e) => handleGuardedNav(e, '/users')}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 font-medium'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                }`
              }
              title="成员与权限管理"
            >
              <Users size={20} className="mb-1" />
              <span className="text-[10px]">成员</span>
            </NavLink>
          )}
        </nav>

        {/* 底部主题与账号操作区 */}
        <div className="flex flex-col items-center gap-3 mt-auto pt-4 border-t border-gray-800/80 w-full px-2">
          <button
            type="button"
            onClick={() => setIsThemeMenuOpen((prev) => !prev)}
            style={{ backgroundColor: "var(--bg-hover)", borderColor: "var(--border-main)" }} className="w-10 h-10 rounded-xl border hover:opacity-85 flex items-center justify-center transition-colors"
            title="界面主题"
          >
            {renderThemeIcon(theme, 17)}
          </button>

          {currentUser?.role !== 'guest' && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('open_change_pwd_modal'))}
              className="w-10 h-10 rounded-xl text-gray-400 hover:bg-gray-800/70 hover:text-gray-200 flex items-center justify-center transition-colors"
              title="修改密码"
            >
              <KeyRound size={17} />
            </button>
          )}

          <button
            type="button"
            onClick={handleGuardedLogout}
            className="w-10 h-10 rounded-xl text-gray-400 hover:bg-rose-500/15 hover:text-rose-400 flex items-center justify-center transition-colors"
            title={currentUser?.role === 'guest' ? '退出访客模式' : '退出登录'}
          >
            <LogOut size={17} />
          </button>

          <button
            type="button"
            disabled={!currentUser || currentUser.role === 'guest'}
            onClick={() => {
              if (currentUser && currentUser.role !== 'guest') {
                setAvatarModalOpen(true);
              }
            }}
            title={currentUser && currentUser.role !== 'guest' ? '点击设置个人头像' : undefined}
            className="relative w-8 h-8 rounded-lg overflow-hidden bg-blue-600/20 border border-gray-700 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0 disabled:cursor-default"
          >
            <span className="pointer-events-none select-none">
              {(currentUser?.name || currentUser?.username || '访').slice(0, 1)}
            </span>
            {currentUser?.avatarUrl && (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name || currentUser.username || '头像'}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </button>
        </div>

        {/* 主题选择弹出面板 */}
        {isThemeMenuOpen && (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-main)',
              color: 'var(--text-primary)',
            }}
            className="absolute left-16 bottom-16 w-56 border rounded-xl shadow-2xl p-2 z-50"
          >
            <div
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              className="px-2.5 py-1.5 text-[11px] font-semibold border-b mb-1"
            >
              界面外观主题
            </div>
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setTheme(opt.value);
                    setIsThemeMenuOpen(false);
                  }}
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--bg-hover)',
                          color: 'var(--text-primary)',
                        }
                      : {
                          color: 'var(--text-secondary)',
                        }
                  }
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors hover:opacity-90"
                >
                  <div className="flex items-center gap-2.5">
                    {renderThemeIcon(opt.value, 15)}
                    <div>
                      <div className="text-xs font-medium">{opt.label}</div>
                      <div style={{ color: 'var(--text-muted)' }} className="text-[10px]">
                        {opt.desc}
                      </div>
                    </div>
                  </div>
                  {active && <Check size={14} className="text-blue-500" />}
                </button>
              );
            })}
          </div>
        )}
      </aside>

      {/* 移动端底部导航栏 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 h-14 bg-[#16181d] border-t border-gray-800 flex items-center justify-around px-2 z-30">
        <NavLink
          to="/file-center"
          onClick={(e) => handleGuardedNav(e, '/file-center')}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center px-3 py-1 rounded-lg text-[11px] ${
              isActive ? 'text-blue-400 font-medium' : 'text-gray-400'
            }`
          }
        >
          <FolderKanban size={18} />
          <span>文件</span>
        </NavLink>

        {canUseAi && (
          <NavLink
            to="/ai-copilot"
            onClick={(e) => handleGuardedNav(e, '/ai-copilot')}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center px-3 py-1 rounded-lg text-[11px] ${
                isActive ? 'text-blue-400 font-medium' : 'text-gray-400'
              }`
            }
          >
            <Bot size={18} />
            <span>助手</span>
          </NavLink>
        )}

        <NavLink
          to="/notes"
          onClick={(e) => handleGuardedNav(e, '/notes')}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center px-3 py-1 rounded-lg text-[11px] ${
              isActive ? 'text-blue-400 font-medium' : 'text-gray-400'
            }`
          }
        >
          <NotebookPen size={18} />
          <span>笔记</span>
        </NavLink>

        <NavLink
          to="/screen-share"
          onClick={(e) => handleGuardedNav(e, '/screen-share')}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center px-3 py-1 rounded-lg text-[11px] ${
              isActive ? 'text-blue-400 font-medium' : 'text-gray-400'
            }`
          }
        >
          <MonitorPlay size={18} />
          <span>投屏</span>
        </NavLink>
      </nav>

      <AvatarModal open={avatarModalOpen} onClose={() => setAvatarModalOpen(false)} />
    </div>
  );
}
