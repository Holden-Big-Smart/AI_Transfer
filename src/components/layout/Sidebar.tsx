// src/components/layout/Sidebar.tsx
import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  FolderKanban,
  Bot,
  NotebookPen,
  ShieldCheck,
  UserCheck,
  Eye,
  Users,
  KeyRound,
  LogOut,
  Moon,
  Sun,
  Leaf,
  Check
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import type { ThemeMode } from '../../store/useAuthStore';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; desc: string }> = [
  { value: 'dark', label: '暗色风格', desc: '深邃护眼默认主题' },
  { value: 'light', label: '亮色风格', desc: '清爽高亮日间办公' },
  { value: 'eyecare', label: '护眼风格', desc: '柔和暖纸长时阅读' }
];

export default function Sidebar() {
  const { currentUser, theme, setTheme, logout } = useAuthStore();
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

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

  const renderThemeIcon = (mode: ThemeMode, size = 16) => {
    if (mode === 'light') return <Sun size={size} className="text-amber-400" />;
    if (mode === 'eyecare') return <Leaf size={size} className="text-emerald-400" />;
    return <Moon size={size} className="text-blue-400" />;
  };

  return (
    <div ref={menuContainerRef} className="contents">
      {/* 桌面端左侧竖向导航栏 (>= 768px 显示) */}
      <aside className="hidden md:flex w-16 bg-[#16181d] border-r border-gray-800 flex-col items-center py-5 select-none shrink-0 z-30 relative">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/20 mb-8">
          AI
        </div>

        <nav className="flex flex-col gap-4 flex-1 w-full px-2">
          <NavLink
            to="/file-center"
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

          <NavLink
            to="/ai-copilot"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 font-medium'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`
            }
            title="AI 智能体工作站"
          >
            <Bot size={20} className="mb-1" />
            <span className="text-[10px]">助手</span>
          </NavLink>

          <NavLink
            to="/notes"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 font-medium'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`
            }
            title="跨端代码与富文本笔记"
          >
            <NotebookPen size={20} className="mb-1" />
            <span className="text-[10px]">笔记</span>
          </NavLink>

          {currentUser?.role === 'admin' && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 font-medium'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                }`
              }
              title="用户账号管理"
            >
              <Users size={20} className="mb-1" />
              <span className="text-[10px]">成员</span>
            </NavLink>
          )}
        </nav>

        <div className="flex flex-col items-center gap-2 relative">
          <div className="flex flex-col items-center text-[10px]" title={`当前身份: ${currentUser?.name}`}>
            {currentUser?.role === 'admin' && <ShieldCheck size={18} className="text-green-500 mb-0.5" />}
            {currentUser?.role === 'user' && <UserCheck size={18} className="text-blue-400 mb-0.5" />}
            {currentUser?.role === 'guest' && <Eye size={18} className="text-gray-400 mb-0.5" />}
            <span
              className={
                currentUser?.role === 'admin'
                  ? 'text-green-400 font-bold'
                  : currentUser?.role === 'user'
                  ? 'text-blue-400'
                  : 'text-gray-400'
              }
            >
              {currentUser?.role === 'admin' ? 'Admin' : currentUser?.role === 'user' ? 'AE' : 'Guest'}
            </span>
          </div>

          {/* 主题风格切换按钮 */}
          <button
            onClick={() => setIsThemeMenuOpen((prev) => !prev)}
            className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="切换整体界面风格（暗色 / 亮色 / 护眼）"
          >
            {renderThemeIcon(theme, 16)}
          </button>

          {currentUser?.role !== 'guest' && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open_change_pwd_modal'))}
              className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-gray-800 rounded-lg transition-colors"
              title="修改当前账号密码"
            >
              <KeyRound size={16} />
            </button>
          )}

          <button
            onClick={logout}
            className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="退出登录"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* 移动端底部固定导航栏 (< 768px 显示) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#16181d]/95 backdrop-blur border-t border-gray-800 flex items-center justify-around px-1 z-40 select-none">
        <NavLink
          to="/file-center"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2.5 rounded-lg ${
              isActive ? 'text-blue-400 font-semibold' : 'text-gray-400'
            }`
          }
        >
          <FolderKanban size={18} />
          <span className="text-[10px] mt-0.5">文件</span>
        </NavLink>

        <NavLink
          to="/ai-copilot"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2.5 rounded-lg ${
              isActive ? 'text-blue-400 font-semibold' : 'text-gray-400'
            }`
          }
        >
          <Bot size={18} />
          <span className="text-[10px] mt-0.5">助手</span>
        </NavLink>

        <NavLink
          to="/notes"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2.5 rounded-lg ${
              isActive ? 'text-blue-400 font-semibold' : 'text-gray-400'
            }`
          }
        >
          <NotebookPen size={18} />
          <span className="text-[10px] mt-0.5">笔记</span>
        </NavLink>

        {currentUser?.role === 'admin' && (
          <NavLink
            to="/users"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2.5 rounded-lg ${
                isActive ? 'text-blue-400 font-semibold' : 'text-gray-400'
              }`
            }
          >
            <Users size={18} />
            <span className="text-[10px] mt-0.5">成员</span>
          </NavLink>
        )}

        <button
          onClick={() => setIsThemeMenuOpen((prev) => !prev)}
          className="flex flex-col items-center justify-center py-1 px-2 text-gray-400"
        >
          {renderThemeIcon(theme, 18)}
          <span className="text-[10px] mt-0.5">风格</span>
        </button>

        <button
          onClick={logout}
          className="flex flex-col items-center justify-center py-1 px-2 text-gray-400 hover:text-red-400"
        >
          <LogOut size={18} />
          <span className="text-[10px] mt-0.5">退出</span>
        </button>
      </nav>

      {/* 主题选择悬浮面板（桌面端停靠在左下角侧栏右侧，移动端停靠在底部栏上方） */}
      {isThemeMenuOpen && (
        <div className="fixed bottom-16 right-3 md:bottom-16 md:left-[72px] md:right-auto w-52 bg-[#252830] border border-gray-700 rounded-2xl shadow-2xl p-2 z-50 select-none">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 border-b border-gray-800 mb-1">
            选择整体界面风格
          </div>
          <div className="space-y-1">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    setTheme(opt.value);
                    setIsThemeMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-600/20 border border-blue-500/40'
                      : 'hover:bg-[#323640] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {renderThemeIcon(opt.value, 15)}
                    <div>
                      <div className="text-xs font-semibold text-gray-200">{opt.label}</div>
                      <div className="text-[10px] text-gray-400">{opt.desc}</div>
                    </div>
                  </div>
                  {isSelected && <Check size={14} className="text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
