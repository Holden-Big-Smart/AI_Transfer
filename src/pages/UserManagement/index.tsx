// src/pages/UserManagement/index.tsx
import { useState, useEffect } from 'react';
import {
  Users, UserPlus, Trash2, KeyRound, Copy, Check,
  ShieldCheck, X, CheckSquare, Square, SlidersHorizontal
} from 'lucide-react';
import { useAuthStore, type UserAccount } from '../../store/useAuthStore';

const BASE_PROJECTS = ['通用公用库', 'Cyber_EcoTank', 'RPA模块分析'];

export default function UserManagement() {
  const { users, currentUser, createUser, deleteUser, fetchUsers, updateUserProjects } = useAuthStore();

  const [availableProjects, setAvailableProjects] = useState<string[]>(BASE_PROJECTS);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>(['通用公用库']);

  const [generatedResult, setGeneratedResult] = useState<{ username: string; pass: string } | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);

  // 调整成员项目权限弹窗状态
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editingProjects, setEditingProjects] = useState<string[]>([]);
  const [isSavingProjects, setIsSavingProjects] = useState(false);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers();
      const token = localStorage.getItem('access_token');
      fetch('/api/ai/projects', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const merged = new Set<string>(['通用公用库']);
          for (const p of BASE_PROJECTS) merged.add(p);
          if (Array.isArray(data?.projects)) {
            for (const p of data.projects) merged.add(String(p));
          }
          for (const u of users || []) {
            for (const p of u.allowedProjects || []) merged.add(String(p));
          }
          setAvailableProjects(Array.from(merged));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.role, users.length]);

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
    const finalProjects = selectedProjects.length > 0 ? selectedProjects : ['通用公用库'];
    try {
      const res = await createUser(newUsername.trim(), newName.trim(), finalProjects);
      setIsAddModalOpen(false);
      setGeneratedResult({ username: newUsername.trim(), pass: res.initialPass });
      setNewUsername('');
      setNewName('');
      setSelectedProjects(['通用公用库']);
    } catch (err) {
      alert(`创建用户失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      alert(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const openProjectEditor = (u: UserAccount) => {
    setEditingUser(u);
    setEditingProjects(Array.isArray(u.allowedProjects) && u.allowedProjects.length > 0 ? [...u.allowedProjects] : ['通用公用库']);
  };

  const toggleEditingProject = (proj: string) => {
    setEditingProjects((prev) =>
      prev.includes(proj) ? prev.filter((p) => p !== proj) : [...prev, proj]
    );
  };

  const handleSaveUserProjects = async () => {
    if (!editingUser) return;
    setIsSavingProjects(true);
    try {
      const nextList = editingProjects.length > 0 ? editingProjects : ['通用公用库'];
      await updateUserProjects(editingUser.id, nextList);
      setEditingUser(null);
    } catch (err) {
      alert(`保存项目权限失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsSavingProjects(false);
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

  const toggleCreateProject = (proj: string) => {
    setSelectedProjects((prev) =>
      prev.includes(proj) ? prev.filter((p) => p !== proj) : [...prev, proj]
    );
  };

  return (
    <div className="h-full w-full bg-[#1e2128] text-gray-200 p-8 overflow-y-auto select-none">
      <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Users className="text-blue-400" size={22} />
            用户账号与项目权限管理
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            管理员可创建用户账号，并随时调整各成员可访问与管理的知识库项目权限。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3.5 py-2 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
        >
          <UserPlus size={15} />
          <span>创建用户账号</span>
        </button>
      </div>

      <div className="bg-[#252830] border border-gray-700/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-[#1f2229] border-b border-gray-700/80 text-xs font-semibold text-gray-400">
          <div className="col-span-3">用户与登录账号</div>
          <div className="col-span-2">系统角色</div>
          <div className="col-span-3">授权知识库项目</div>
          <div className="col-span-2">密码状态</div>
          <div className="col-span-2 text-right">操作</div>
        </div>

        <div className="divide-y divide-gray-700/50 text-xs">
          {(users || []).map((u) => (
            <div key={u.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-[#2b2f3a] transition-colors">
              <div className="col-span-3 flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  u.role === 'admin' ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400'
                }`}>
                  {(u.name || u.username || '?').slice(0, 1)}
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
                  {u.role === 'admin' ? '超级管理员' : '普通成员'}
                </span>
              </div>

              <div className="col-span-3">
                <div className="flex flex-wrap gap-1">
                  {(u.allowedProjects || []).map((p) => (
                    <span key={p} className="bg-[#1e2128] text-gray-300 px-2 py-0.5 rounded text-[10px] border border-gray-700">
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                {u.mustChangePassword ? (
                  <span className="text-yellow-400 text-[11px] inline-flex items-center gap-1">
                    <KeyRound size={12} /> 待首次修改
                  </span>
                ) : (
                  <span className="text-green-400 text-[11px]">正常</span>
                )}
              </div>

              <div className="col-span-2 w-28 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openProjectEditor(u)}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30 text-[11px] shrink-0"
                  title="调整该项目成员权限"
                >
                  <SlidersHorizontal size={12} />
                  <span>项目权限</span>
                </button>
                {u.username !== 'admin' ? (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(u)}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 shrink-0"
                    title="删除账号"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <span className="w-7 h-7 inline-block shrink-0 invisible" aria-hidden="true" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 调整成员项目权限弹窗 */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">
                调整「{editingUser.name || editingUser.username}」的项目权限
              </h2>
              <button type="button" onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              勾选后成员即可访问该项目知识库、对话与执行项目级删除操作。
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {availableProjects.map((proj) => {
                const checked = editingProjects.includes(proj);
                return (
                  <button
                    key={proj}
                    type="button"
                    onClick={() => toggleEditingProject(proj)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs text-left transition-colors ${
                      checked
                        ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                        : 'bg-[#1c1f26] border-gray-700/80 text-gray-300 hover:bg-[#232731]'
                    }`}
                  >
                    <span>{proj}</span>
                    {checked ? <CheckSquare size={15} className="text-blue-400" /> : <Square size={15} className="text-gray-500" />}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isSavingProjects}
                onClick={handleSaveUserProjects}
                className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                {isSavingProjects ? '保存中...' : '保存权限'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建用户弹窗 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreateSubmit} className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">创建新成员账号</h2>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">登录用户名 *</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                placeholder="例如 zhangsan"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">显示姓名</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                placeholder="例如 张三"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">授权知识库项目</label>
              <div className="flex flex-wrap gap-1.5">
                {availableProjects.map((proj) => {
                  const active = selectedProjects.includes(proj);
                  return (
                    <button
                      key={proj}
                      type="button"
                      onClick={() => toggleCreateProject(proj)}
                      className={`px-2.5 py-1 rounded-lg text-xs border ${
                        active
                          ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                          : 'bg-[#1a1d24] border-gray-700 text-gray-400'
                      }`}
                    >
                      {proj}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-3.5 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800">
                取消
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium">
                确认创建
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 初始密码弹窗 */}
      {generatedResult && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-3">
            <h3 className="text-sm font-bold text-white">账号创建成功</h3>
            <div className="bg-[#1a1d24] rounded-xl p-3 text-xs space-y-1 border border-gray-700">
              <div>账号：<span className="text-blue-300 font-mono">{generatedResult.username}</span></div>
              <div>初始密码：<span className="text-emerald-300 font-mono">{generatedResult.pass}</span></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={copyToClipboard}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-gray-700 hover:bg-gray-600 text-white"
              >
                {hasCopied ? <Check size={13} /> : <Copy size={13} />}
                <span>{hasCopied ? '已复制' : '复制信息'}</span>
              </button>
              <button
                type="button"
                onClick={() => setGeneratedResult(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除用户确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400 text-sm font-bold">
              <Trash2 size={16} />
              <span>确认删除账号「{deleteTarget.name || deleteTarget.username}」？</span>
            </div>
            <p className="text-xs text-gray-400">删除后该账号将无法继续登录系统。</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800">
                取消
              </button>
              <button type="button" onClick={handleConfirmDelete} className="px-3.5 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}