// src/pages/UserManagement/index.tsx
import { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Trash2, KeyRound, Copy, Check, 
  ShieldCheck, AlertTriangle, X, CheckSquare, Square 
} from 'lucide-react';
import { useAuthStore, type UserAccount } from '../../store/useAuthStore';

const ALL_PROJECTS = ['南方电网', 'Cyber_EcoTank', '通用公用库'];

export default function UserManagement() {
  const { users, currentUser, createUser, deleteUser, fetchUsers } = useAuthStore();

  // 进入页面时从后端拉取真实用户列表
  useEffect(() => {
    if (currentUser?.role === 'admin') fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.role]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>(['南方电网']);

  // 新生成密码展示与复制弹窗
  const [generatedResult, setGeneratedResult] = useState<{ username: string; pass: string } | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);

  // 仅超级管理员有权操作
  if (currentUser?.role !== 'admin') {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        无权访问用户管理中心
      </div>
    );
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    try {
      const res = await createUser(newUsername, newName, selectedProjects);
      setIsAddModalOpen(false);
      setGeneratedResult({ username: newUsername, pass: res.initialPass });
      setNewUsername('');
      setNewName('');
      setSelectedProjects(['南方电网']);
    } catch (err) {
      alert(`创建用户失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // 删除账号确认
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      alert(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const copyToClipboard = () => {
    if (generatedResult) {
      navigator.clipboard.writeText(
        `账号: ${generatedResult.username}\n初始随机密码: ${generatedResult.pass}\n请登录系统后根据提示自行修改密码。`
      );
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  const toggleProject = (proj: string) => {
    setSelectedProjects((prev) =>
      prev.includes(proj) ? prev.filter((p) => p !== proj) : [...prev, proj]
    );
  };

  return (
    <div className="h-full w-full bg-[#1e2128] text-gray-200 p-8 overflow-y-auto select-none">

      {/* 头部导航栏 */}
      <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Users className="text-blue-400" size={22} />
            用户账号与权限管理
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            管理员可创建用户并分配知识库权限；出于隐私安全，管理员无法查看或修改用户密码。
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3.5 py-2 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
        >
          <UserPlus size={15} />
          <span>创建用户账号</span>
        </button>
      </div>

      {/* 账号列表表格 */}
      <div className="bg-[#252830] border border-gray-700/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-[#1f2229] border-b border-gray-700/80 text-xs font-semibold text-gray-400">
          <div className="col-span-3">用户与登录账号</div>
          <div className="col-span-2">系统角色</div>
          <div className="col-span-3">授权知识库项目</div>
          <div className="col-span-2">账号密码状态</div>
          <div className="col-span-2 text-right">操作</div>
        </div>

        <div className="divide-y divide-gray-700/50 text-xs">
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-[#2b2f3a] transition-colors">
              <div className="col-span-3 flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  u.role === 'admin' ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400'
                }`}>
                  {u.name.slice(0, 1)}
                </div>
                <div>
                  <div className="font-semibold text-gray-200">{u.name}</div>
                  <div className="text-[11px] text-gray-400">@{u.username}</div>
                </div>
              </div>

              <div className="col-span-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                  u.role === 'admin'
                    ? 'bg-green-950/40 text-green-400 border-green-700/50'
                    : 'bg-blue-950/40 text-blue-400 border-blue-700/50'
                }`}>
                  {u.role === 'admin' && <ShieldCheck size={12} />}
                  {u.role === 'admin' ? '超级管理员' : '普通 AE 成员'}
                </span>
              </div>

              <div className="col-span-3">
                <div className="flex flex-wrap gap-1">
                  {u.allowedProjects.map((p) => (
                    <span key={p} className="bg-[#1e2128] text-gray-300 px-2 py-0.5 rounded text-[10px] border border-gray-700">
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                {u.mustChangePassword ? (
                  <span className="text-yellow-400 text-[11px] flex items-center gap-1">
                    <KeyRound size={12} /> 待初次登录修改
                  </span>
                ) : (
                  <span className="text-green-400 text-[11px]">正常 (密码已自设)</span>
                )}
              </div>

              <div className="col-span-2 text-right">
                {u.role !== 'admin' && (
                  <button
                    onClick={() => setDeleteTarget(u)}
                    className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/30 transition-colors"
                    title="删除账号"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 创建账号弹窗 */}
      {isAddModalOpen && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-1.5">
                <UserPlus size={16} className="text-blue-400" />
                创建新用户并生成随机密码
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-gray-300 block mb-1">登录账号 (唯一用户名)</label>
                <input
                  type="text"
                  required
                  placeholder="例如: ae_holden"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-[#1e2128] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-300 block mb-1">展示名称 / 姓名</label>
                <input
                  type="text"
                  placeholder="例如: 客户助理"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#1e2128] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-300 block mb-2">授权知识库项目 (可多选)</label>
                <div className="space-y-2">
                  {ALL_PROJECTS.map((proj) => {
                    const isChecked = selectedProjects.includes(proj);
                    return (
                      <div
                        key={proj}
                        onClick={() => toggleProject(proj)}
                        className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer bg-[#1e2128] p-2 rounded-lg border border-gray-700 hover:border-gray-500"
                      >
                        {isChecked ? <CheckSquare size={14} className="text-blue-400" /> : <Square size={14} />}
                        <span>{proj}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-blue-950/20 border border-blue-800/40 rounded-xl text-[11px] text-blue-300">
                ℹ️ 系统将在提交后自动分配随机初始密码供您复制给该用户，初次登录时系统将强制其自行更改。
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-[#1e2128]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium"
                >
                  创建并分配密码
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 密码生成与复制弹窗 */}
      {generatedResult && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-green-500/50 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-2 text-green-400 mb-2">
              <KeyRound size={20} />
              <h3 className="text-sm font-bold">账号已创建，请保存初始密码</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              该密码仅展示一次。请立即复制并转交给用户，提醒其在初次登录后自行重设。
            </p>

            <div className="bg-[#1e2128] border border-gray-700 p-3 rounded-xl mb-4 text-xs font-mono">
              <div className="text-gray-400 mb-1">账号: <span className="text-gray-200">{generatedResult.username}</span></div>
              <div className="text-gray-400">初始密码: <span className="text-green-400 font-bold text-sm tracking-wider">{generatedResult.pass}</span></div>
            </div>

            <button
              onClick={copyToClipboard}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 mb-2"
            >
              {hasCopied ? <Check size={14} /> : <Copy size={14} />}
              <span>{hasCopied ? '已复制到剪贴板！' : '一键复制账号与密码'}</span>
            </button>

            <button
              onClick={() => setGeneratedResult(null)}
              className="w-full text-xs text-gray-400 hover:text-white py-1.5"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 删除账号确认弹窗 */}
      {deleteTarget && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-red-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertTriangle size={20} />
              <h3 className="text-sm font-bold">确认删除用户账号？</h3>
            </div>
            <p className="text-xs text-gray-300 mb-5 leading-relaxed bg-[#1e2128] p-3 rounded-lg border border-gray-800">
              确定要删除账号【{deleteTarget.name} (@{deleteTarget.username})】吗？该操作不可撤销，此用户将无法继续访问系统。
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-[#1e2128]"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
