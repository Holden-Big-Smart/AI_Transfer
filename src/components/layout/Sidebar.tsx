// src/components/layout/Sidebar.tsx
import { NavLink } from 'react-router-dom';
import { FolderKanban, Bot, ShieldCheck } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="w-16 bg-[#16181d] border-r border-gray-800 flex flex-col items-center py-5 select-none shrink-0 z-20">
      {/* 顶部 Logo 标识 */}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/20 mb-8">
        AI
      </div>

      {/* 导航菜单组 */}
      <nav className="flex flex-col gap-4 flex-1 w-full px-2">
        <NavLink
          to="/file-center"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-3 rounded-xl transition-all group ${
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
            `flex flex-col items-center justify-center py-3 rounded-xl transition-all group ${
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
      </nav>

      {/* 底部权限标识（展示当前设计的多租户隔离身份） */}
      <div className="flex flex-col items-center text-gray-500 text-[10px]" title="当前身份：超级管理员">
        <ShieldCheck size={18} className="text-green-500 mb-0.5" />
        <span>Admin</span>
      </div>
    </aside>
  );
}