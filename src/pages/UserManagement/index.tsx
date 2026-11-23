import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Users,
  FolderKanban,
  Cpu,
  ShieldCheck,
  Palette,
  Plus,
  Trash2,
  SlidersHorizontal,
  RefreshCw,
  Search,
  Archive,
  X,
  Copy,
  Check,
  Download,
  Upload,
  Pencil,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import {
  useAuthStore,
  THEME_COLOR_FIELDS,
  LOGO_ICONS,
  LOGO_ICON_LABELS,
  LOGO_ICON_COMPONENTS,
  getThemeLogo,
  isLogoIcon,
  previewThemeFromList,
  type CustomThemeItem,
  type LogoIcon,
  type ThemeLogo,
  type UserAccount,
} from '../../store/useAuthStore';
import AdminThemeModal from '../../components/AdminThemeModal';

type GovTab = 'members' | 'projects' | 'compute' | 'governance' | 'themes';

interface GovernanceOverview {
  db: {
    usersCount: number;
    notesCount: number;
    auditLogsCount: number;
    recentAudits: Array<{
      id?: number;
      username?: string;
      action?: string;
      target?: string;
      detail?: string;
      created_at?: string;
    }>;
  };
  agent: {
    online: boolean;
    agentUrl: string;
    projects: Array<string | { name?: string; chunks?: number; files?: number }>;
    detail: unknown;
  };
}

interface GovernanceFileItem {
  path: string;
  size: number;
  updatedAt?: number;
}

interface GovernanceNoteItem {
  id: number | string;
  title: string;
  owner?: string;
  updatedAt?: string;
}

interface GovernanceDetailData {
  storage: {
    root: string;
    totalFiles: number;
    totalBytes: number;
    topFiles: GovernanceFileItem[];
  };
  notes: GovernanceNoteItem[];
  audits: Array<{
    id?: number;
    username?: string;
    action?: string;
    target?: string;
    detail?: string;
    created_at?: string;
  }>;
}

interface MemoryUserSummary {
  userDir: string;
  memoryCount: number;
  latestUpdatedAt: string;
}

interface InspectedMemory {
  filename: string;
  title: string;
  preview: string;
  content?: string;
  updatedAt?: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function formatFriendlyMsg(raw: unknown, fallback: string): string {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  if (s.startsWith('{') && s.includes('detail')) {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj.detail === 'string') {
        return obj.detail === 'Not Found' ? fallback : obj.detail;
      }
    } catch {
      // ignore
    }
  }
  return s === 'Not Found' ? fallback : s;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const THEME_LOGO_FIELDS = [
  { key: 'fg' as const, label: '图案色' },
  { key: 'bg' as const, label: '底色' },
] as const;

function renderThemeLogo(item: CustomThemeItem | undefined, size = 12) {
  const logo = getThemeLogo(item);
  if (logo.icon === 'ring') {
    const side = Math.max(10, size - 1);
    return (
      <span
        className="rounded-full inline-block shrink-0"
        style={{
          width: `${side}px`,
          height: `${side}px`,
          border: '2px solid currentColor',
          backgroundColor: 'transparent',
        }}
      />
    );
  }
  const Icon = LOGO_ICON_COMPONENTS[logo.icon] || LOGO_ICON_COMPONENTS.sparkle;
  return <Icon size={size} />;
}

function toColorInputValue(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  if (/^#[0-9a-f]{8}$/.test(raw)) return raw.slice(0, 7);
  return '#334155';
}

function hexToHsv(value: unknown): { h: number; s: number; v: number } {
  const hex = toColorInputValue(value);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const hue = ((h % 360) + 360) % 360;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function UserManagement() {
  const {
    users,
    currentUser,
    theme,
    themes,
    createUser,
    deleteUser,
    fetchUsers,
    updateUserProjects,
    fetchThemes,
    setTheme,
    toggleThemeInMenu,
    importCustomTheme,
    updateCustomTheme,
    deleteCustomTheme,
  } = useAuthStore();

  const isAdmin = currentUser?.role === 'admin';
  const uniqueThemes = useMemo(() => {
    const seen = new Set<string>();
    return themes.filter((item) => {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [themes]);
  const [activeTab, setActiveTab] = useState<GovTab>('members');

  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{ username: string; pass: string } | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const [permTarget, setPermTarget] = useState<UserAccount | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [savingPerm, setSavingPerm] = useState(false);

  const [newProjectName, setNewProjectName] = useState('');
  const [projectBusy, setProjectBusy] = useState(false);

  const [overview, setOverview] = useState<GovernanceOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [memProject, setMemProject] = useState('通用公用库');
  const [memUserId, setMemUserId] = useState('');
  const [inspectedMemories, setInspectedMemories] = useState<InspectedMemory[]>([]);
  const [loadingMem, setLoadingMem] = useState(false);
  const [memOverview, setMemOverview] = useState<MemoryUserSummary[]>([]);
  const [selectedMemContent, setSelectedMemContent] = useState<{ title: string; content: string } | null>(null);

  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeEditTarget, setThemeEditTarget] = useState<string | null>(null);
  const [themeImportOpen, setThemeImportOpen] = useState(false);
  const [themeImportText, setThemeImportText] = useState('');
  const [themeBusy, setThemeBusy] = useState(false);
  const [logoPicker, setLogoPicker] = useState<{ id: string; top: number; left: number } | null>(null);
  const [colorPicker, setColorPicker] = useState<{
    themeId: string;
    kind: 'color' | 'logo';
    key: string;
    label: string;
    value: string;
    h: number;
    s: number;
    v: number;
    top: number;
    left: number;
  } | null>(null);
  const themeFileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState('');
  const [govKeyword, setGovKeyword] = useState('');
  const [govDetail, setGovDetail] = useState<GovernanceDetailData | null>(null);
  const [govBusy, setGovBusy] = useState(false);

  const availableProjects: string[] = Array.from(
    new Set([
      '通用公用库',
      ...(currentUser?.allowedProjects || []),
      ...users.flatMap((u) => u.allowedProjects || []),
      ...((overview?.agent?.projects || [])
        .map((p) => (typeof p === 'string' ? p : p?.name || ''))
        .filter(Boolean)),
    ])
  );

  const loadOverview = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingOverview(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/overview`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingOverview(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchUsers().catch(() => {});
    if (isAdmin) {
      void Promise.resolve().then(() => {
        void loadOverview();
      });
    }
  }, [fetchUsers, isAdmin, loadOverview]);

  useEffect(() => {
    if (activeTab === 'themes' && isAdmin) void fetchThemes().catch(() => {});
  }, [activeTab, isAdmin, fetchThemes]);

  useEffect(() => {
    if (!memUserId && users.length > 0) {
      const firstId = String(users[0].id);
      queueMicrotask(() => setMemUserId(firstId));
    }
  }, [users, memUserId]);

  const loadGovernanceDetail = useCallback(async (kw?: string) => {
    if (!isAdmin) return;
    setGovBusy(true);
    try {
      const qVal = kw !== undefined ? kw : govKeyword;
      const res = await fetch(
        `${API_BASE_URL}/api/admin/governance/detail?q=${encodeURIComponent(qVal)}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setGovDetail(data);
      }
    } catch {
      // ignore
    } finally {
      setGovBusy(false);
    }
  }, [isAdmin, govKeyword]);

  useEffect(() => {
    if (isAdmin) {
      void Promise.resolve().then(() => {
        void loadGovernanceDetail('');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleDeleteGovFile = async (relPath: string) => {
    setGovBusy(true);
    setFeedback('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/governance/files/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ path: relPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedback(`已清理存储文件：${relPath}`);
        await loadGovernanceDetail();
      } else {
        setFeedback(data.detail || '清理文件失败');
      }
    } catch {
      setFeedback('清理文件网络异常');
    } finally {
      setGovBusy(false);
    }
  };

  const handleDeleteGovNote = async (noteId: number | string, title: string) => {
    setGovBusy(true);
    setFeedback('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/governance/notes/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ id: noteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedback(`已删除笔记「${title}」`);
        await loadOverview();
        await loadGovernanceDetail();
      } else {
        setFeedback(data.detail || '删除笔记失败');
      }
    } catch {
      setFeedback('删除笔记网络异常');
    } finally {
      setGovBusy(false);
    }
  };

  const handlePruneAudits = async () => {
    setGovBusy(true);
    setFeedback('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/governance/audits/prune`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ keepLatest: 200 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedback(`已清理 ${data.removedCount ?? 0} 条历史审计日志（保留最新 200 条）`);
        await loadOverview();
        await loadGovernanceDetail();
      } else {
        setFeedback(data.detail || '清理审计日志失败');
      }
    } catch {
      setFeedback('清理审计日志网络异常');
    } finally {
      setGovBusy(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setCreating(true);
    setFeedback('');
    try {
      const result = await createUser(
        newUsername.trim(),
        newName.trim() || newUsername.trim(),
        ['通用公用库']
      );
      setGeneratedResult({ username: newUsername.trim(), pass: result.initialPass });
      setNewUsername('');
      setNewName('');
      setCreateOpen(false);
      setFeedback('已创建成员账号，请复制初始密码');
      await fetchUsers();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : '创建账号失败');
    } finally {
      setCreating(false);
    }
  };

  const copyCredentials = () => {
    if (!generatedResult) return;
    navigator.clipboard.writeText(
      `账号: ${generatedResult.username}\n初始随机密码: ${generatedResult.pass}\n请登录系统后根据提示自行修改密码。`
    );
    setHasCopied(true);
    window.setTimeout(() => setHasCopied(false), 2000);
  };

  const openPermModal = (u: UserAccount) => {
    setPermTarget(u);
    setSelectedProjects(u.allowedProjects || ['通用公用库']);
  };

  const toggleProject = (proj: string) => {
    setSelectedProjects((prev) =>
      prev.includes(proj) ? prev.filter((item) => item !== proj) : [...prev, proj]
    );
  };

  const handleSavePermissions = async () => {
    if (!permTarget) return;
    setSavingPerm(true);
    setFeedback('');
    try {
      await updateUserProjects(permTarget.id, selectedProjects);
      setPermTarget(null);
      setFeedback(`已更新「${permTarget.name || permTarget.username}」的知识库项目授权`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : '保存权限失败');
    } finally {
      setSavingPerm(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newProjectName.trim();
    if (!clean) return;
    setProjectBusy(true);
    setFeedback('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/projects/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ project_name: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(data.detail || '新建项目失败');
      } else {
        setNewProjectName('');
        setFeedback(`已新建知识库项目「${clean}」`);
        await fetchUsers();
        await loadOverview();
      }
    } catch {
      setFeedback('新建项目请求异常');
    } finally {
      setProjectBusy(false);
    }
  };

  const handleDeleteProject = async (projName: string) => {
    if (projName === '通用公用库') return;
    setProjectBusy(true);
    setFeedback('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/projects/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ project_name: projName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(data.detail || '归档删除项目失败');
      } else {
        setFeedback(`已将项目「${projName}」移入本地回收站归档`);
        await fetchUsers();
        await loadOverview();
      }
    } catch {
      setFeedback('删除项目请求异常');
    } finally {
      setProjectBusy(false);
    }
  };

  const handleLoadMemOverview = useCallback(async (targetProj?: string) => {
    const pName = targetProj || memProject;
    if (!pName || !isAdmin) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/memories/overview?project=${encodeURIComponent(pName)}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setMemOverview(Array.isArray(data.users) ? data.users : []);
      } else {
        setMemOverview([]);
      }
    } catch {
      // ignore
    }
  }, [memProject, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void Promise.resolve().then(() => {
        void handleLoadMemOverview();
      });
    }
  }, [isAdmin, handleLoadMemOverview]);

  const handleCleanupOrphans = async () => {
    setLoadingMem(true);
    setFeedback('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/memories/cleanup-orphan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ project: memProject }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const dirs = Array.isArray(data.archivedDirs) ? data.archivedDirs : [];
        setFeedback(
          dirs.length > 0
            ? `已归档孤儿记忆目录：${dirs.join(', ')}`
            : '当前项目下没有需要清理的孤儿记忆目录'
        );
        await handleLoadMemOverview(memProject);
      } else {
        setFeedback(formatFriendlyMsg(data.detail, '当前无需清理孤儿目录'));
      }
    } catch {
      setFeedback('清理孤儿目录网络异常');
    } finally {
      setLoadingMem(false);
    }
  };

  const handleInspectMemories = async (overrideUserId?: string, overrideProject?: string) => {
    const targetProject = overrideProject || memProject;
    const targetUserId = overrideUserId || memUserId;
    if (!targetProject || !targetUserId) return;
    setLoadingMem(true);
    setFeedback('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/memories/inspect?project=${encodeURIComponent(targetProject)}&user_id=${encodeURIComponent(targetUserId)}`,
        { headers: getAuthHeaders() }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(formatFriendlyMsg(data.detail, '暂未查询到该用户的记忆记录'));
        setInspectedMemories([]);
      } else {
        setInspectedMemories(Array.isArray(data.memories) ? data.memories : []);
      }
    } catch {
      setFeedback('查询记忆网络异常');
    } finally {
      setLoadingMem(false);
    }
  };

  const handleArchiveAdminMemory = async (filename: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/memories/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ project_name: memProject, filename }),
      });
      if (res.ok) {
        setFeedback(`已归档记忆文件 ${filename}`);
        await handleInspectMemories();
      } else {
        const data = await res.json().catch(() => ({}));
        setFeedback(data.detail || '归档记忆失败');
      }
    } catch {
      setFeedback('归档记忆网络异常');
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      setFeedback('已删除成员账号');
      await fetchUsers();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : '删除成员失败');
    }
  };

  const [pendingThemeEdits, setPendingThemeEdits] = useState<
    Record<string, { name: string; description: string; logo: ThemeLogo; colors: Record<string, string> }>
  >({});
  const [applyingThemeEdits, setApplyingThemeEdits] = useState(false);

  const buildMergedThemes = (
    editsMap: Record<string, { name: string; description: string; logo: ThemeLogo; colors: Record<string, string> }>
  ): CustomThemeItem[] =>
    uniqueThemes.map((t) => {
      const edit = editsMap[t.id];
      if (!edit) return t;
      return {
        ...t,
        name: edit.name,
        description: edit.description,
        logo: edit.logo,
        colors: { ...(t.colors || {}), ...edit.colors },
      };
    });

  const getEffectiveThemeItem = (item: CustomThemeItem): CustomThemeItem => {
    const edit = pendingThemeEdits[item.id];
    if (!edit) return item;
    return {
      ...item,
      name: edit.name,
      description: edit.description,
      logo: edit.logo,
      colors: { ...(item.colors || {}), ...edit.colors },
    };
  };

  const stageThemePreview = (
    item: CustomThemeItem,
    nextPatch: {
      name?: string;
      description?: string;
      logoPatch?: Partial<ThemeLogo>;
      colorPatch?: Record<string, string>;
    }
  ) => {
    if (item.readonly) return;
    const base = getEffectiveThemeItem(item);
    const nextEdit = {
      name: nextPatch.name !== undefined ? nextPatch.name : base.name,
      description: nextPatch.description !== undefined ? nextPatch.description : base.description || '',
      logo: { ...getThemeLogo(base), ...(nextPatch.logoPatch || {}) },
      colors: { ...(base.colors || {}), ...(nextPatch.colorPatch || {}) },
    };
    const nextEditsMap = { ...pendingThemeEdits, [item.id]: nextEdit };
    setPendingThemeEdits(nextEditsMap);
    previewThemeFromList(item.id, buildMergedThemes(nextEditsMap));
  };

  const handleApplyPendingThemeEdits = async () => {
    const entries = Object.entries(pendingThemeEdits);
    if (entries.length === 0) return;
    setApplyingThemeEdits(true);
    setThemeBusy(true);
    try {
      for (const [themeId, edit] of entries) {
        const origin = uniqueThemes.find((t) => t.id === themeId);
        if (!origin || origin.readonly) continue;
        await updateCustomTheme(themeId, {
          name: edit.name,
          description: edit.description,
          logo: edit.logo,
          colors: edit.colors,
        });
      }
      setPendingThemeEdits({});
      await fetchThemes();
      setFeedback(`已应用并保存 ${entries.length} 个主题的修改`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : '应用主题修改失败');
    } finally {
      setApplyingThemeEdits(false);
      setThemeBusy(false);
    }
  };

  const handleCancelPendingThemeEdits = () => {
    if (Object.keys(pendingThemeEdits).length === 0) return;
    setPendingThemeEdits({});
    previewThemeFromList(theme, uniqueThemes);
    setFeedback('已撤销未应用的主题颜色与 Logo 修改');
  };

  const handleApplyTheme = async (item: CustomThemeItem) => {
    try {
      await setTheme(item.id);
      setFeedback(`已立即应用主题「${item.name}」`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : '应用主题失败');
    }
  };

  const handleToggleThemeInMenu = (item: CustomThemeItem) => {
    toggleThemeInMenu(item.id);
    setFeedback(`已${item.activeInMenu !== false ? '取消' : '开启'}「${item.name}」在左下角主题菜单的展示`);
  };

  const handleExportTheme = (item: CustomThemeItem) => {
    const payload = {
      name: item.name,
      description: item.description || '',
      logo: getThemeLogo(item),
      colors: item.colors || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${item.name || 'theme'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleDeleteTheme = async (item: CustomThemeItem) => {
    setThemeBusy(true);
    try {
      await deleteCustomTheme(item.id);
      setFeedback(`已删除主题「${item.name}」`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : '删除主题失败');
    } finally {
      setThemeBusy(false);
    }
  };

  const handleThemeFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setThemeImportText(String(reader.result || ''));
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleImportThemeJson = async () => {
    setThemeBusy(true);
    try {
      const parsed = JSON.parse(themeImportText);
      const name = String(parsed?.name || '').trim();
      if (!name) throw new Error('主题名称不能为空');
      const colors = parsed && typeof parsed.colors === 'object' && parsed.colors ? parsed.colors : parsed;
      const logo: ThemeLogo = {
        icon: isLogoIcon(parsed?.logo?.icon)
          ? parsed.logo.icon
          : isLogoIcon(parsed?.logoShape)
            ? parsed.logoShape
            : 'ring',
        fg: String(parsed?.logo?.fg || colors?.['--logo-fg'] || '#ffffff'),
        bg: String(parsed?.logo?.bg || colors?.['--logo-bg'] || '#4f46e5'),
      };
      await importCustomTheme({
        name,
        description: String(parsed?.description || '').trim(),
        logo,
        colors,
      });
      setThemeImportOpen(false);
      setThemeImportText('');
      setFeedback(`已导入并发布主题「${name}」`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : '导入主题 JSON 失败');
    } finally {
      setThemeBusy(false);
    }
  };

  const tabs: Array<{ id: GovTab; label: string; icon: LucideIcon; adminOnly?: boolean }> = [
    { id: 'members', label: '成员与权限', icon: Users },
    { id: 'projects', label: '项目与 AI 资料库', icon: FolderKanban },
    { id: 'compute', label: '算力与记忆治理', icon: Cpu, adminOnly: true },
    { id: 'governance', label: '文件/笔记/审计', icon: ShieldCheck, adminOnly: true },
    { id: 'themes', label: '主题与风格库', icon: Palette, adminOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck size={20} className="text-blue-400" />
            <span>系统管理中心</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            统一管理成员账号、知识库项目授权、本地 AI 算力与记忆、云端治理审计及全局主题风格。
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={loadOverview}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a1d24] hover:bg-[#232731] border border-gray-700 text-xs text-gray-200"
            >
              <RefreshCw size={13} className={loadingOverview ? 'animate-spin' : ''} />
              <span>刷新状态</span>
            </button>
          )}
          {activeTab === 'members' && isAdmin && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
            >
              <Plus size={14} />
              <span>创建用户账号</span>
            </button>
          )}
          {activeTab === 'themes' && isAdmin && (
            <button
              type="button"
              onClick={() => setThemeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
            >
              <Palette size={14} />
              <span>导入 / 编辑风格 JSON</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-3">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                active
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'bg-[#1a1d24] text-gray-400 hover:text-gray-200 border border-gray-800'
              }`}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="px-4 py-2.5 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-300">
          {feedback}
        </div>
      )}

      {generatedResult && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-xs text-emerald-200">
          <div className="min-w-0">
            <div className="font-semibold">新建账号初始凭据</div>
            <div className="mt-1 break-all font-mono">
              账号：{generatedResult.username} ｜ 初始密码：{generatedResult.pass}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copyCredentials}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30"
            >
              {hasCopied ? <Check size={12} /> : <Copy size={12} />}
              <span>{hasCopied ? '已复制' : '复制凭据'}</span>
            </button>
            <button
              type="button"
              onClick={() => setGeneratedResult(null)}
              className="text-emerald-300/70 hover:text-emerald-100"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="bg-[#252830] border border-gray-700/80 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-[#1f2229] border-b border-gray-700/80 text-xs font-semibold text-gray-400">
            <div className="col-span-3">用户与登录账号</div>
            <div className="col-span-2">系统角色</div>
            <div className="col-span-3">授权知识库项目</div>
            <div className="col-span-2">密码状态</div>
            <div className="col-span-2 text-right">操作</div>
          </div>

          <div className="divide-y divide-gray-800">
            {users.map((u) => (
              <div
                key={u.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center text-xs hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="col-span-3 flex items-center gap-3 min-w-0">
                  <div
                    className={`relative w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center font-bold text-xs shrink-0 ${
                      u.role === 'admin'
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-blue-600/20 text-blue-400'
                    }`}
                  >
                    <span className="pointer-events-none select-none">
                      {(u.name || u.username || '?').slice(0, 1)}
                    </span>
                    {u.avatarUrl && (
                      <img
                        src={u.avatarUrl}
                        alt={u.name || u.username || '头像'}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  <div className="truncate">
                    <div className="font-semibold text-gray-100 truncate">{u.name || u.username}</div>
                    <div className="text-[11px] text-gray-400 truncate">@{u.username}</div>
                  </div>
                </div>

                <div className="col-span-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                      u.role === 'admin'
                        ? 'bg-green-950/60 text-green-300 border-green-500/30'
                        : 'bg-blue-950/60 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    {u.role === 'admin' ? '超级管理员' : '普通成员'}
                  </span>
                </div>

                <div className="col-span-3 flex flex-wrap gap-1.5">
                  {(u.allowedProjects || ['通用公用库']).map((proj) => (
                    <span
                      key={proj}
                      className="px-2 py-0.5 rounded-md bg-[#1a1d24] border border-gray-700 text-[11px] text-gray-300"
                    >
                      {proj}
                    </span>
                  ))}
                </div>

                <div className="col-span-2 text-green-400 font-medium">正常</div>

                <div className="col-span-2 flex items-center justify-end gap-1.5">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => openPermModal(u)}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30 text-[11px] shrink-0"
                    >
                      <SlidersHorizontal size={12} />
                      <span>项目权限</span>
                    </button>
                  )}
                  {isAdmin && u.username !== 'admin' ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(u)}
                      className="w-6 h-6 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 shrink-0"
                      title="删除账号"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <span className="w-6 h-6 inline-block shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="space-y-4">
          {isAdmin && (
            <form
              onSubmit={handleCreateProject}
              className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 flex flex-wrap items-center gap-3"
            >
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="输入新知识库项目名称（例如：南方电网 / 财务风控）"
                className="flex-1 min-w-[220px] bg-[#1a1d24] border border-gray-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                disabled={projectBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-medium text-white"
              >
                <Plus size={14} />
                <span>新建项目沙盒</span>
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableProjects.map((proj) => {
              const authUsers = users.filter(
                (u) => u.role === 'admin' || (u.allowedProjects || []).includes(proj)
              );
              return (
                <div
                  key={proj}
                  className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-white truncate">{proj}</div>
                    {isAdmin && proj !== '通用公用库' && (
                      <button
                        type="button"
                        disabled={projectBusy}
                        onClick={() => handleDeleteProject(proj)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-rose-300 hover:bg-rose-500/15 border border-rose-500/30"
                        title="移入本地回收站归档"
                      >
                        <Archive size={12} />
                        <span>归档删除</span>
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400">已授权账号（{authUsers.length}）：</div>
                  <div className="flex flex-wrap gap-1.5">
                    {authUsers.map((au) => (
                      <span
                        key={au.id}
                        className="px-2 py-0.5 rounded-md bg-[#1a1d24] border border-gray-700 text-[11px] text-gray-200"
                      >
                        {au.name || au.username}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'compute' && isAdmin && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 space-y-1.5">
              <div className="text-xs text-gray-400">本地 Agent（8001 / Ollama / Chroma）</div>
              <div className="text-base font-bold text-white">
                {overview?.agent?.online ? '在线（已连通隧道）' : '离线或未连接'}
              </div>
              <div className="text-[11px] text-gray-400 truncate">
                {overview?.agent?.agentUrl || 'http://127.0.0.1:8001'}
              </div>
            </div>
            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 space-y-1.5">
              <div className="text-xs text-gray-400">已发现知识库项目数</div>
              <div className="text-base font-bold text-white">{availableProjects.length} 个</div>
              <div className="text-[11px] text-gray-400">支持分项目独立向量切片与隔离记忆</div>
            </div>
            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 space-y-1.5">
              <div className="text-xs text-gray-400">记忆存储与归档策略</div>
              <div className="text-base font-bold text-white">按项目与用户独立隔离</div>
              <div className="text-[11px] text-gray-400">删除记忆自动归档至 _Archive</div>
            </div>
          </div>

          <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 space-y-3">
            <div className="text-xs font-semibold text-white">按「项目 + 用户」审查与归档 .md 记忆文件</div>
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={memProject}
                onChange={(e) => setMemProject(e.target.value)}
                className="bg-[#1a1d24] border border-gray-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {availableProjects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={memUserId}
                onChange={(e) => setMemUserId(e.target.value)}
                className="bg-[#1a1d24] border border-gray-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name || u.username} (ID: {u.id})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleInspectMemories()}
                disabled={loadingMem}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
              >
                <Search size={13} />
                <span>{loadingMem ? '检索中...' : '查看记忆'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoadMemOverview(memProject)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a1d24] hover:bg-[#232731] border border-gray-700 text-xs text-gray-200"
              >
                <span>扫描项目用户</span>
              </button>
              <button
                type="button"
                onClick={handleCleanupOrphans}
                disabled={loadingMem}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-xs text-rose-300"
              >
                <Archive size={13} />
                <span>清理孤儿目录</span>
              </button>
            </div>

            {memOverview.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold text-gray-400">项目记忆分布总览</div>
                <div className="flex flex-wrap gap-2">
                  {memOverview.map((item) => (
                    <button
                      key={item.userDir}
                      type="button"
                      onClick={() => {
                        setMemUserId(item.userDir);
                        handleInspectMemories(item.userDir);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#1a1d24] hover:bg-[#232731] border border-gray-800 text-left text-[11px]"
                    >
                      <span className="font-medium text-indigo-300">{item.userDir}</span>
                      <span className="text-gray-400 ml-2">{item.memoryCount} 条</span>
                      <span className="text-gray-500 ml-2">{item.latestUpdatedAt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-1">
              {inspectedMemories.length === 0 ? (
                <div className="text-xs text-gray-400 py-3">暂无已加载的记忆条目，点击“查看记忆”查询。</div>
              ) : (
                inspectedMemories.map((m) => (
                  <div
                    key={m.filename}
                    className="flex items-center justify-between gap-3 bg-[#1a1d24] border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMemContent({
                            title: m.title,
                            content: m.content || m.preview || '',
                          })
                        }
                        className="font-medium text-white hover:text-indigo-300 truncate text-left block"
                        title="查看记忆全文"
                      >
                        {m.title}
                      </button>
                      <div className="text-[11px] text-gray-400 truncate">{m.preview || m.filename}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleArchiveAdminMemory(m.filename)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-rose-300 hover:bg-rose-500/15 border border-rose-500/30 shrink-0"
                    >
                      <Archive size={12} />
                      <span>归档</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'governance' && isAdmin && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4">
              <div className="text-xs text-gray-400">注册账号总数</div>
              <div className="text-xl font-bold text-white mt-1">{overview?.db?.usersCount ?? users.length}</div>
            </div>
            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4">
              <div className="text-xs text-gray-400">云端笔记记录数</div>
              <div className="text-xl font-bold text-white mt-1">{overview?.db?.notesCount ?? '-'}</div>
            </div>
            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4">
              <div className="text-xs text-gray-400">网盘存储占用</div>
              <div className="text-xl font-bold text-white mt-1">
                {(((govDetail?.storage?.totalBytes ?? 0) / 1024 / 1024)).toFixed(2)} MB
              </div>
              <div className="text-[11px] text-gray-400">{govDetail?.storage?.totalFiles ?? 0} 个文件</div>
            </div>
            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4">
              <div className="text-xs text-gray-400">审计日志总量</div>
              <div className="text-xl font-bold text-white mt-1">{overview?.db?.auditLogsCount ?? '-'}</div>
            </div>
          </div>

          <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <input
                type="text"
                value={govKeyword}
                onChange={(e) => setGovKeyword(e.target.value)}
                placeholder="按关键词筛选文件 / 笔记 / 审计记录..."
                className="flex-1 bg-[#1a1d24] border border-gray-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                disabled={govBusy}
                onClick={() => loadGovernanceDetail(govKeyword)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
              >
                <Search size={13} />
                <span>筛选</span>
              </button>
            </div>
            <button
              type="button"
              disabled={govBusy}
              onClick={handlePruneAudits}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-xs text-rose-300"
            >
              <Archive size={13} />
              <span>清理旧审计（保留最新200条）</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 space-y-2.5">
              <div className="text-xs font-semibold text-white">大文件与存储目录治理</div>
              {(govDetail?.storage?.topFiles || []).length === 0 ? (
                <div className="text-xs text-gray-400 py-3">暂无存储文件或匹配结果。</div>
              ) : (
                <div className="divide-y divide-gray-800 text-xs max-h-64 overflow-y-auto">
                  {(govDetail?.storage?.topFiles || []).map((f) => (
                    <div key={f.path} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-gray-200 truncate">{f.path}</div>
                        <div className="text-[11px] text-gray-400">{(f.size / 1024).toFixed(1)} KB</div>
                      </div>
                      <button
                        type="button"
                        disabled={govBusy}
                        onClick={() => handleDeleteGovFile(f.path)}
                        className="px-2 py-1 rounded-lg text-[11px] text-rose-300 hover:bg-rose-500/15 border border-rose-500/30 shrink-0"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 space-y-2.5">
              <div className="text-xs font-semibold text-white">笔记条目治理</div>
              {(govDetail?.notes || []).length === 0 ? (
                <div className="text-xs text-gray-400 py-3">暂无笔记记录或匹配结果。</div>
              ) : (
                <div className="divide-y divide-gray-800 text-xs max-h-64 overflow-y-auto">
                  {(govDetail?.notes || []).map((n) => (
                    <div key={String(n.id)} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-gray-200 truncate">{n.title}</div>
                        <div className="text-[11px] text-gray-400">所属：{n.owner || '-'} · {n.updatedAt || ''}</div>
                      </div>
                      <button
                        type="button"
                        disabled={govBusy}
                        onClick={() => handleDeleteGovNote(n.id, n.title)}
                        className="px-2 py-1 rounded-lg text-[11px] text-rose-300 hover:bg-rose-500/15 border border-rose-500/30 shrink-0"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-4 space-y-2.5">
            <div className="text-xs font-semibold text-white">系统审计记录</div>
            {(govDetail?.audits || overview?.db?.recentAudits || []).length === 0 ? (
              <div className="text-xs text-gray-400 py-3">暂无审计记录。</div>
            ) : (
              <div className="divide-y divide-gray-800 text-xs max-h-64 overflow-y-auto">
                {(govDetail?.audits || overview?.db?.recentAudits || []).map((item, idx) => (
                  <div key={item.id ?? idx} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-gray-200">
                      <span className="text-blue-300 font-medium">{item.username || '系统'}</span> ·{' '}
                      <span>{item.action || '操作'}</span>{' '}
                      <span className="text-gray-400">{item.target || ''}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">{item.created_at || ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'themes' && isAdmin && (
        <div className="bg-[#252830] border border-gray-700/80 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">全局主题独立方案库</div>
              <p className="text-xs text-gray-400 mt-1">
                所有方案均为独立主题；勾选「激活」可同时纳入左下角主题菜单，「立即应用」只切换当前主题。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={themeFileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleThemeFilePick}
                className="hidden"
              />
              <button
                type="button"
                disabled={Object.keys(pendingThemeEdits).length === 0 || applyingThemeEdits}
                onClick={() => void handleApplyPendingThemeEdits()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-medium text-white transition-colors"
              >
                <Check size={13} />
                <span>
                  {applyingThemeEdits
                    ? '应用中...'
                    : Object.keys(pendingThemeEdits).length > 0
                    ? `应用修改 (${Object.keys(pendingThemeEdits).length})`
                    : '应用修改'}
                </span>
              </button>
              <button
                type="button"
                disabled={Object.keys(pendingThemeEdits).length === 0 || applyingThemeEdits}
                onClick={handleCancelPendingThemeEdits}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1d24] hover:bg-[#232731] disabled:opacity-40 disabled:cursor-not-allowed border border-gray-700 text-[11px] text-gray-200 transition-colors"
              >
                <X size={13} />
                <span>取消修改</span>
              </button>
              <button
                type="button"
                onClick={() => themeFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1d24] hover:bg-[#232731] border border-gray-700 text-[11px] text-gray-200"
              >
                <Upload size={13} />
                <span>选择 JSON 文件</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setThemeImportText('');
                  setThemeImportOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] font-medium text-white"
              >
                <Plus size={13} />
                <span>导入 JSON</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-700/60 rounded-xl">
            <table className="min-w-max w-full text-[11px] text-gray-300 border-collapse">
              <thead>
                <tr className="bg-[#1f2229] text-gray-400">
                  <th title="勾选后该主题会出现在左下角主题菜单中" className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                    激活
                  </th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">主题名</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">主题 Logo</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">主题描述</th>
                  {THEME_COLOR_FIELDS.map((field) => (
                    <th
                      key={field.key}
                      title={`${field.description}（${field.key}）`}
                      className="px-1.5 py-2 font-semibold whitespace-nowrap"
                    >
                      {field.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {uniqueThemes.map((rawItem) => {
                  const item = getEffectiveThemeItem(rawItem);
                  const isApplied = theme === item.id;
                  const isMenuActive = item.activeInMenu !== false;
                  const locked = Boolean(item.readonly);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-[var(--bg-hover)] transition-colors ${isApplied ? 'bg-blue-600/10' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <label className="flex items-center gap-1.5 cursor-pointer" title="纳入左下角主题菜单">
                          <input
                            type="checkbox"
                            checked={isMenuActive}
                            onChange={() => handleToggleThemeInMenu(item)}
                            className="rounded border-gray-600"
                          />
                          <span className={isMenuActive ? 'text-emerald-300' : 'text-gray-500'}>
                            {isMenuActive ? '菜单中' : '已隐藏'}
                          </span>
                        </label>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-gray-100">
                          {item.name}
                          {locked && (
                            <span title="锁定不可修改">
                              <Lock size={11} className="text-amber-400" />
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">{item.isBuiltin ? '内置方案' : '自定义方案'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={locked || themeBusy}
                            title={
                              locked
                                ? '该主题 Logo 已锁定'
                                : `点击更换 Logo 图标（${LOGO_ICON_LABELS[getThemeLogo(item).icon]}）`
                            }
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setColorPicker(null);
                              setLogoPicker((prev) =>
                                prev?.id === item.id
                                  ? null
                                  : { id: item.id, top: rect.bottom + 4, left: rect.left }
                              );
                            }}
                            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 disabled:cursor-default"
                            style={{
                              backgroundColor: getThemeLogo(item).bg,
                              color: getThemeLogo(item).fg,
                            }}
                          >
                            {renderThemeLogo(item, 12)}
                          </button>
                          {THEME_LOGO_FIELDS.map((field) => {
                            const hexVal = toColorInputValue(getThemeLogo(item)[field.key]);
                            return (
                              <button
                                key={field.key}
                                type="button"
                                disabled={locked}
                                title={`${field.label}（${hexVal}）`}
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setLogoPicker(null);
                                  const hsv = hexToHsv(hexVal);
                                  setColorPicker((prev) =>
                                    prev &&
                                    prev.themeId === item.id &&
                                    prev.kind === 'logo' &&
                                    prev.key === field.key
                                      ? null
                                      : {
                                          themeId: item.id,
                                          kind: 'logo',
                                          key: field.key,
                                          label: `Logo ${field.label}`,
                                          value: hexVal,
                                          ...hsv,
                                          top: rect.bottom + 6,
                                          left: rect.left,
                                        }
                                  );
                                }}
                                className="w-3.5 h-3.5 rounded-sm border border-gray-600 shrink-0 cursor-pointer disabled:cursor-default"
                                style={{ backgroundColor: hexVal }}
                              />
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={item.description || ''}>
                        {item.description || '-'}
                      </td>
                      {THEME_COLOR_FIELDS.map((field) => {
                        const hexVal = toColorInputValue(item.colors?.[field.key]);
                        return (
                          <td key={field.key} className="px-1.5 py-2 text-center">
                            <button
                              type="button"
                              disabled={locked}
                              title={`${field.description}（${field.key}：${hexVal}）`}
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setLogoPicker(null);
                                const hsv = hexToHsv(hexVal);
                                setColorPicker((prev) =>
                                  prev &&
                                  prev.themeId === item.id &&
                                  prev.kind === 'color' &&
                                  prev.key === field.key
                                    ? null
                                    : {
                                        themeId: item.id,
                                        kind: 'color',
                                        key: field.key,
                                        label: `${field.label} (${field.key})`,
                                        value: hexVal,
                                        ...hsv,
                                        top: rect.bottom + 6,
                                        left: rect.left,
                                      }
                                );
                              }}
                              className="inline-block w-6 h-6 rounded border border-gray-600 cursor-pointer disabled:cursor-default"
                              style={{ backgroundColor: hexVal }}
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title={isApplied ? '当前已应用' : '立即应用该主题'}
                            disabled={isApplied}
                            onClick={() => void handleApplyTheme(item)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] ${
                              isApplied
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                : 'border-gray-600 bg-[#1a1d24] text-gray-300 hover:text-white'
                            } disabled:cursor-default`}
                          >
                            {isApplied && <Check size={10} />}
                            {isApplied ? '使用中' : '立即应用'}
                          </button>
                          <button
                            type="button"
                            title="编辑 JSON"
                            disabled={locked}
                            onClick={() => {
                              setThemeEditTarget(item.id);
                              setThemeModalOpen(true);
                            }}
                            className="p-1 rounded-md text-gray-400 hover:text-blue-300 hover:bg-[#323640] disabled:opacity-40"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            title="导出该主题 JSON"
                            onClick={() => handleExportTheme(item)}
                            className="p-1 rounded-md text-gray-400 hover:text-emerald-300 hover:bg-[#323640]"
                          >
                            <Download size={12} />
                          </button>
                          {!item.isBuiltin && (
                            <button
                              type="button"
                              title="删除该主题"
                              disabled={themeBusy}
                              onClick={() => void handleDeleteTheme(item)}
                              className="p-1 rounded-md text-gray-400 hover:text-rose-400 hover:bg-[#323640] disabled:opacity-40"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateUser}
            className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">创建成员账号</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">登录账号（username）</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">显示昵称</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <p className="text-[11px] text-gray-400">
              初始密码由系统随机生成，创建成功后会展示并可一键复制。新账号默认仅授权「通用公用库」，可在成员列表中继续调整。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                {creating ? '创建中...' : '确认创建'}
              </button>
            </div>
          </form>
        </div>
      )}

      {permTarget && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                配置「{permTarget.name || permTarget.username}」的知识库项目权限
              </h3>
              <button type="button" onClick={() => setPermTarget(null)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availableProjects.map((proj) => {
                const checked = selectedProjects.includes(proj);
                return (
                  <label
                    key={proj}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#1a1d24] border border-gray-800 text-xs text-gray-200 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProject(proj)}
                      className="rounded border-gray-600"
                    />
                    <span>{proj}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPermTarget(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingPerm}
                onClick={handleSavePermissions}
                className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                {savingPerm ? '保存中...' : '保存授权'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white">确认删除成员账号</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              确定删除账号 <span className="text-rose-400 font-semibold">@{deleteTarget.username}</span> 吗？删除后无法恢复。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMemContent && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white truncate" title={selectedMemContent.title}>
                {selectedMemContent.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedMemContent(null)}
                className="text-gray-400 hover:text-white shrink-0"
              >
                <X size={16} />
              </button>
            </div>
            <pre className="bg-[#1a1d24] border border-gray-800 rounded-xl p-3 text-xs text-gray-200 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {selectedMemContent.content}
            </pre>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMemContent(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {logoPicker &&
        (() => {
          const target = uniqueThemes.find((item) => item.id === logoPicker.id);
          if (!target) return null;
          const effectiveTarget = getEffectiveThemeItem(target);
          const currentIcon = getThemeLogo(effectiveTarget).icon;
          return (
            <div
              className="fixed z-[60] w-64 rounded-xl border border-gray-600 bg-[#1a1d24] p-2 shadow-2xl"
              style={{
                top: Math.min(logoPicker.top, window.innerHeight - 210),
                left: Math.min(logoPicker.left, window.innerWidth - 272),
              }}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[11px] text-gray-400">Logo 图标库（12 款）</span>
                <button
                  type="button"
                  onClick={() => setLogoPicker(null)}
                  className="text-gray-500 hover:text-white"
                  title="关闭"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {LOGO_ICONS.map((icon: LogoIcon) => (
                  <button
                    key={icon}
                    type="button"
                    title={LOGO_ICON_LABELS[icon]}
                    onClick={() => {
                      stageThemePreview(target, { logoPatch: { icon } });
                      setLogoPicker(null);
                    }}
                    className={`h-9 rounded-lg flex items-center justify-center ${
                      currentIcon === icon ? 'bg-blue-600/30 text-blue-300' : 'text-gray-300 hover:bg-[#323640]'
                    }`}
                  >
                    {renderThemeLogo({ ...effectiveTarget, logo: { ...getThemeLogo(effectiveTarget), icon } }, 16)}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

      {themeImportOpen && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">导入主题 JSON</h3>
              <button
                type="button"
                onClick={() => setThemeImportOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              支持粘贴主题 JSON，或先点击上方「选择 JSON 文件」载入内容。发布后所有账号均可在主题菜单切换。
            </p>
            <textarea
              rows={12}
              value={themeImportText}
              onChange={(e) => setThemeImportText(e.target.value)}
              placeholder={'{\n  "name": "主题名称",\n  "description": "主题描述",\n  "logo": { "icon": "ring", "fg": "#ffffff", "bg": "#2563eb" },\n  "colors": { "--bg-base": "#1e2128" }\n}'}
              className="w-full bg-[#14161b] border border-gray-700 rounded-xl p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setThemeImportOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={themeBusy}
                onClick={() => void handleImportThemeJson()}
                className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium"
              >
                {themeBusy ? '导入中...' : '导入并发布'}
              </button>
            </div>
          </div>
        </div>
      )}

      {colorPicker &&
        (() => {
          const target = uniqueThemes.find((t) => t.id === colorPicker.themeId);
          if (!target) return null;
          const effectiveTarget = getEffectiveThemeItem(target);
          const currentHex =
            colorPicker.kind === 'logo'
              ? toColorInputValue(getThemeLogo(effectiveTarget)[colorPicker.key as 'fg' | 'bg'])
              : toColorInputValue(effectiveTarget.colors?.[colorPicker.key]);

          const applyHex = (nextHex: string, hsv?: { h: number; s: number; v: number }) => {
            const norm = toColorInputValue(nextHex);
            const parts = hsv || hexToHsv(norm);
            setColorPicker((prev) => (prev ? { ...prev, value: norm, ...parts } : null));
            if (colorPicker.kind === 'logo') {
              stageThemePreview(target, {
                logoPatch: { [colorPicker.key]: norm } as Partial<ThemeLogo>,
              });
            } else {
              stageThemePreview(target, { colorPatch: { [colorPicker.key]: norm } });
            }
          };

          const updateFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
            const parts = { h: colorPicker.h, s, v };
            applyHex(hsvToHex(parts.h, parts.s, parts.v), parts);
          };

          const presets = [
            '#1e2128', '#252830', '#16181d', '#ffffff', '#f3f4f6', '#ede7d9',
            '#ef4444', '#f43f5e', '#ec4899', '#a855f7', '#3b82f6', '#06b6d4',
            '#10b981', '#eab308', '#f97316', '#64748b',
          ];

          return (
            <div
              className="fixed z-[65] w-72 rounded-xl border border-gray-600 bg-[#1a1d24] p-3 shadow-2xl space-y-2.5"
              style={{
                top: Math.max(8, Math.min(colorPicker.top, window.innerHeight - 330)),
                left: Math.min(colorPicker.left, window.innerWidth - 296),
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-gray-200 truncate" title={colorPicker.label}>
                  {colorPicker.label}
                </span>
                <button
                  type="button"
                  onClick={() => setColorPicker(null)}
                  className="text-gray-400 hover:text-white shrink-0"
                  title="关闭色盘"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="w-8 h-8 rounded-lg border border-gray-600 shrink-0"
                  style={{ backgroundColor: currentHex }}
                />
                <input
                  type="text"
                  value={colorPicker.value}
                  onChange={(e) => {
                    const val = e.target.value;
                    setColorPicker((prev) => (prev ? { ...prev, value: val } : null));
                    if (/^#[0-9a-fA-F]{6}$/.test(val.trim())) applyHex(val.trim());
                  }}
                  className="flex-1 bg-[#14161b] border border-gray-700 rounded-lg px-2 py-1 text-xs font-mono text-gray-100 focus:outline-none focus:border-blue-500"
                  placeholder="#rrggbb"
                />
              </div>

              <div
                className="relative w-full h-28 rounded-lg border border-gray-700 cursor-crosshair overflow-hidden"
                style={{
                  background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${colorPicker.h}, 100%, 50%))`,
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  updateFromPointer(e);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) updateFromPointer(e);
                }}
              >
                <span
                  className="absolute w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${colorPicker.s * 100}%`, top: `${(1 - colorPicker.v) * 100}%` }}
                />
              </div>

              <input
                type="range"
                min={0}
                max={359}
                value={Math.min(359, Math.round(colorPicker.h))}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  applyHex(hsvToHex(h, colorPicker.s, colorPicker.v), { h, s: colorPicker.s, v: colorPicker.v });
                }}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
              />

              <div className="grid grid-cols-8 gap-1">
                {presets.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    onClick={() => applyHex(hex)}
                    className={`w-6 h-6 rounded border ${
                      currentHex.toLowerCase() === hex.toLowerCase()
                        ? 'border-blue-400 scale-105'
                        : 'border-gray-700'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          );
        })()}

      <AdminThemeModal
        key={themeEditTarget ?? '__new__'}
        open={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        initialThemeId={themeEditTarget}
      />
    </div>
  );
}
