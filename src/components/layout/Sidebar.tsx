// src/components/layout/Sidebar.tsx
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
  LogOut
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

export default function Sidebar() {
  const { currentUser, logout } = useAuthStore();

  return (
    <>
      {/* 桌面端左侧竖向导航栏 (>= 768px 显示) */}
      <aside className="hidden md:flex w-16 bg-[#16181d] border-r border-gray-800 flex-col items-center py-5 select-none shrink-0 z-20">
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

          {/* 跨端笔记入口（全体成员及访客均可访问，访客仅可见公开笔记） */}
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

        <div className="flex flex-col items-center gap-2.5">
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#16181d]/95 backdrop-blur border-t border-gray-800 flex items-center justify-around px-2 z-40 select-none">
        <NavLink
          to="/file-center"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-3 rounded-lg ${
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
            `flex flex-col items-center justify-center py-1 px-3 rounded-lg ${
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
            `flex flex-col items-center justify-center py-1 px-3 rounded-lg ${
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
              `flex flex-col items-center justify-center py-1 px-3 rounded-lg ${
                isActive ? 'text-blue-400 font-semibold' : 'text-gray-400'
              }`
            }
          >
            <Users size={18} />
            <span className="text-[10px] mt-0.5">成员</span>
          </NavLink>
        )}

        {currentUser?.role !== 'guest' && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_change_pwd_modal'))}
            className="flex flex-col items-center justify-center py-1 px-2 text-gray-400 hover:text-yellow-400"
          >
            <KeyRound size={18} />
            <span className="text-[10px] mt-0.5">改密</span>
          </button>
        )}

        <button
          onClick={logout}
          className="flex flex-col items-center justify-center py-1 px-2 text-gray-400 hover:text-red-400"
        >
          <LogOut size={18} />
          <span className="text-[10px] mt-0.5">退出</span>
        </button>
      </nav>
    </>
  );
}
