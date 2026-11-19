// src/pages/FileCenter/index.tsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { api } from '../../utils/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import {
  UploadCloud, FolderPlus, Download, Trash2, Home,
  ChevronRight, X, CheckCircle2, Clock, HardDrive, FileUp, FolderUp,
  Edit2, Scissors, Copy, ClipboardPaste, Share2, ClipboardList,
  PieChart as PieChartIcon, Globe, Lock, CheckSquare, Square,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import type { FileNode, ClipboardItemNode } from '../../store/useFileStore';
import { useAuthStore } from '../../store/useAuthStore';

interface StagedItem {
  file: File;
  relativePath: string;
}

type SortField = 'name' | 'type' | 'size' | 'uploadTime';
type SortOrder = 'asc' | 'desc';

interface ColumnWidths {
  name: number;
  type: number;
  size: number;
  uploadTime: number;
}

const DEFAULT_COL_WIDTHS: ColumnWidths = {
  name: 340,
  type: 95,
  size: 105,
  uploadTime: 160
};

const formatBytes = (bytes: number | null) => {
  if (bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatETA = (bytes: number) => {
  if (bytes === 0) return '< 1 秒';
  const speed = 5 * 1024 * 1024;
  const seconds = Math.ceil(bytes / speed);
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return `约 ${minutes} 分 ${remSec} 秒`;
};

const formatQuotaPercent = (bytes: number, totalQuota = 50 * 1024 * 1024 * 1024) => {
  if (!totalQuota) return '0%';
  const percent = (bytes / totalQuota) * 100;
  if (percent === 0) return '0%';
  if (percent < 0.01) return '< 0.01%';
  return `${percent.toFixed(2)}%`;
};

// 解析文件类型展示文本
const getFileTypeLabel = (file: FileNode): string => {
  if (file.id === 'folder_public_root') return '系统目录';
  if (file.isFolder) return '文件夹';
  const parts = file.name.split('.');
  if (parts.length > 1) {
    const ext = parts[parts.length - 1].trim().toUpperCase();
    return ext ? `${ext}` : '文件';
  }
  return '文件';
};

export default function FileCenter() {
  const { currentUser, theme } = useAuthStore();
  const {
    files = [],
    currentPath = [],
    tasks = [],
    clipboard, setClipboard, renameNode, moveNode, pasteClipboard,
    enterFolder, goToBreadcrumb, deleteFile, batchDeleteFiles, createFolder,
    addTask, updateTaskProgress, removeTask,
    operationLogs = [], updateFileShare,
    loadServerFiles, loadAuditLogs
  } = useFileStore();

  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 真实存储空间统计状态（区分文件与笔记占用）
  const [storageStats, setStorageStats] = useState({
    filesBytes: 0,
    notesBytes: 0,
    usedBytes: 0,
    totalQuotaBytes: 50 * 1024 * 1024 * 1024
  });

  const loadStorageStats = async () => {
    try {
      const stats = await api.files.getStorageStats();
      setStorageStats(stats);
    } catch (err) {
      console.error('获取存储空间统计失败', err);
    }
  };

  // 登录用户变化或文件列表增删时，自动刷新存储空间统计
  useEffect(() => {
    if (!currentUser) return;
    loadStorageStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, files.length]);

  // 移动端折叠“存储与上传面板”开关
  const [showMobileUploadPanel, setShowMobileUploadPanel] = useState(false);

  // 支持单文件及多选批量拖拽移动
  const [draggedNodeIds, setDraggedNodeIds] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // 全空间多选勾选状态与可共享用户列表
  const [shareableUsers, setShareableUsers] = useState<Array<{ id: string; username: string; name: string; role: string }>>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  // 排序状态（默认按文件名升序，且文件夹始终置顶）
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // 列宽鼠标拖拽调整状态（持久化至 localStorage）
  const [colWidths, setColWidths] = useState<ColumnWidths>(() => {
    try {
      const saved = localStorage.getItem('fc_column_widths_v1');
      if (saved) return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_COL_WIDTHS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('fc_column_widths_v1', JSON.stringify(colWidths));
    } catch {
      // ignore
    }
  }, [colWidths]);

  // 触发列宽鼠标拖拽
  const startResizeColumn = (colKey: keyof ColumnWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colKey];
    const minW = colKey === 'name' ? 180 : 75;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setColWidths((prev) => ({
        ...prev,
        [colKey]: Math.max(minW, startWidth + delta)
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const myTasks = (tasks || []).filter((t) => t.userId === currentUser?.id);

  const [shareModal, setShareModal] = useState<{
    isOpen: boolean;
    targetIds: string[];
    titleText: string;
    sharedWith: string[];
  }>({
    isOpen: false,
    targetIds: [],
    titleText: '',
    sharedWith: []
  });

  const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
  const currentParentNode = files.find((f) => f.id === currentFolderId);
  const isInPublicSpace =
    currentFolderId === 'folder_public_root' ||
    currentPath[0]?.id === 'folder_public_root' ||
    !!currentParentNode?.isPublicFolder;

  // 过滤并执行 Windows 资源管理器风格排序（系统目录第一 -> 文件夹始终在普通文件上方 -> 组内按选定字段排序）
  const sortedDisplayFiles = useMemo(() => {
    const rawList = files.filter((file) => {
      if (file.parentId !== currentFolderId) return false;
      if (!isInPublicSpace && currentUser?.role === 'guest') {
        return file.id === 'folder_public_root';
      }
      return true;
    });

    return [...rawList].sort((a, b) => {
      // 1. 公共共享空间入口永远固定在根目录第一行
      if (a.id === 'folder_public_root') return -1;
      if (b.id === 'folder_public_root') return 1;

      // 2. Windows 资源管理器逻辑：文件夹始终排在普通文件上方
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1;
      }

      // 3. 组内按用户选定的列排序
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
      } else if (sortField === 'type') {
        cmp =
          getFileTypeLabel(a).localeCompare(getFileTypeLabel(b), 'zh-CN', { numeric: true }) ||
          a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
      } else if (sortField === 'size') {
        cmp = (a.size ?? 0) - (b.size ?? 0);
      } else if (sortField === 'uploadTime') {
        cmp = (a.uploadTime || '').localeCompare(b.uploadTime || '');
      }

      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [files, currentFolderId, isInPublicSpace, currentUser, sortField, sortOrder]);

  // 当前目录下所有可勾选的节点 ID（排除系统公共空间根节点）
  const selectableIds = useMemo(
    () => sortedDisplayFiles.filter((f) => f.id !== 'folder_public_root').map((f) => f.id),
    [sortedDisplayFiles]
  );

  // 点击表头切换排序字段与方向
  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  useEffect(() => {
    setSelectedFileIds([]);
    if (!currentUser) return;

    if (currentUser.role !== 'guest') {
      api.files.getShareableUsers().then(setShareableUsers).catch(() => {});
    }

    // 访客若因会话路径被持久化而停留在私有子目录，自动切回根目录
    if (currentUser.role === 'guest' && !isInPublicSpace) {
      if (currentPath.length > 0 && goToBreadcrumb) goToBreadcrumb(-1);
      return;
    }

    const virtualSubPath =
      currentFolderId && currentFolderId !== 'folder_public_root'
        ? currentFolderId.replace(/^(pub_|pri_)/, '')
        : '';
    loadServerFiles(isInPublicSpace, virtualSubPath);
    if (currentUser.role === 'admin') loadAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, isInPublicSpace, currentUser]);

  // 页内手动刷新当前所在目录（同时刷新存储空间统计）
  const handleManualRefresh = async () => {
    if (!currentUser) return;
    if (currentUser.role === 'guest' && !isInPublicSpace) return;
    setIsRefreshing(true);
    const virtualSubPath =
      currentFolderId && currentFolderId !== 'folder_public_root'
        ? currentFolderId.replace(/^(pub_|pri_)/, '')
        : '';
    try {
      await loadServerFiles(isInPublicSpace, virtualSubPath);
      await loadStorageStats();
      if (currentUser.role === 'admin') {
        await loadAuditLogs();
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // 将指定文件 ID 列表写入剪贴板（支持复制或剪切）
  const handlePutToClipboard = (ids: string[], action: 'copy' | 'cut') => {
    const currentPathNames = currentPath
      .filter((p) => p.id !== 'folder_public_root')
      .map((p) => p.name);
    const baseVirtualPath = currentPathNames.join('/');

    const targetNodes = files.filter(
      (f) => ids.includes(f.id) && f.id !== 'folder_public_root'
    );
    if (targetNodes.length === 0) return;

    const items: ClipboardItemNode[] = targetNodes.map((n) => ({
      id: n.id,
      name: n.name,
      virtualPath: n.virtualPath || (baseVirtualPath ? `${baseVirtualPath}/${n.name}` : n.name),
      isPublicFolder: !!n.isPublicFolder,
      isFolder: n.isFolder
    }));

    setClipboard({ items, action });
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; id: string; oldName: string }>({
    isOpen: false,
    id: '',
    oldName: ''
  });
  const [renamedName, setRenamedName] = useState('');

  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const totalStagedBytes = stagedItems.reduce((acc, item) => acc + item.file.size, 0);

  const stagedSummaryGroups = (() => {
    const groups = new Map<string, { isFolder: boolean; count: number; size: number }>();
    for (const item of stagedItems) {
      const parts = item.relativePath.split('/');
      const topName = parts[0];
      const isFolder = parts.length > 1;
      const prev = groups.get(topName) || { isFolder, count: 0, size: 0 };
      groups.set(topName, {
        isFolder: prev.isFolder || isFolder,
        count: prev.count + 1,
        size: prev.size + item.file.size
      });
    }
    return Array.from(groups.entries());
  })();

  const scanEntry = async (entry: FileSystemEntry, prefix = ''): Promise<StagedItem[]> => {
    if (!entry) return [];
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file((file: File) =>
          resolve([{ file, relativePath: `${prefix}${file.name}` }])
        );
      });
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      const readAllEntries = async (): Promise<FileSystemEntry[]> => {
        const batch = await new Promise<FileSystemEntry[]>((res) => dirReader.readEntries(res));
        if (batch.length === 0) return [];
        const rest = await readAllEntries();
        return [...batch, ...rest];
      };
      const entries = await readAllEntries();
      const results = await Promise.all(entries.map((e) => scanEntry(e, `${prefix}${entry.name}/`)));
      return results.flat();
    }
    return [];
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const items = e.dataTransfer.items;
    if (items) {
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      const scanned = await Promise.all(entries.map((ent) => scanEntry(ent, '')));
      setStagedItems((prev) => [...prev, ...scanned.flat()]);
    }
  };

  const handleNativeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected: StagedItem[] = Array.from(e.target.files).map((file) => ({
        file,
        relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      }));
      setStagedItems((prev) => [...prev, ...selected]);
    }
    e.target.value = '';
  };

  const handleStartUpload = async () => {
    if (stagedItems.length === 0 || !currentUser) return;

    const virtualParent =
      currentFolderId && currentFolderId !== 'folder_public_root'
        ? currentFolderId.replace(/^(pub_|pri_)/, '')
        : '';

    const taskGroups = new Map<string, StagedItem[]>();
    for (const item of stagedItems) {
      const topName = item.relativePath.split('/')[0];
      const list = taskGroups.get(topName) || [];
      list.push(item);
      taskGroups.set(topName, list);
    }

    setStagedItems([]);

    for (const [topName, groupItems] of taskGroups.entries()) {
      const isFolderGroup = groupItems.length > 1 || groupItems[0].relativePath.includes('/');
      const totalGroupSize = groupItems.reduce((acc, cur) => acc + cur.file.size, 0);
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      addTask({
        id: taskId,
        name: isFolderGroup ? `📁 ${topName} (共 ${groupItems.length} 个文件)` : topName,
        size: totalGroupSize,
        progress: 0,
        status: 'uploading',
        userId: currentUser.id
      });

      try {
        for (let i = 0; i < groupItems.length; i++) {
          const { file, relativePath } = groupItems[i];
          await api.files.uploadFileWithChunks(
            file,
            virtualParent,
            isInPublicSpace,
            (filePercent) => {
              const overallPercent = Math.round(((i + filePercent / 100) / groupItems.length) * 100);
              updateTaskProgress(taskId, overallPercent);
            },
            relativePath
          );
        }
        updateTaskProgress(taskId, 100, 'success');
        loadServerFiles(isInPublicSpace, virtualParent);
        if (isInPublicSpace && currentUser.role === 'admin') loadAuditLogs();
      } catch (err) {
        console.error('上传失败', err);
        updateTaskProgress(taskId, 0, 'error');
        alert(`[${topName}] 上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim() && createFolder && currentUser) {
      createFolder(
        newFolderName.trim(),
        currentFolderId,
        currentUser.id,
        isInPublicSpace,
        { name: currentUser.name, username: currentUser.username }
      );
      setNewFolderName('');
      setIsModalOpen(false);
    }
  };

  // 渲染排序图标
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="text-gray-600" />;
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} className="text-blue-400" />
    ) : (
      <ArrowDown size={12} className="text-blue-400" />
    );
  };

  const gridTemplateStyle = {
    gridTemplateColumns: `${colWidths.name}px ${colWidths.type}px ${colWidths.size}px ${colWidths.uploadTime}px minmax(145px, 1fr)`
  };

  const freeBytes = Math.max(0, storageStats.totalQuotaBytes - storageStats.usedBytes);
  const freeSliceColor =
    theme === 'light' ? '#e5e7eb' : theme === 'eyecare' ? '#dcd4c2' : '#374151';

  const storageChartData = [
    ...(storageStats.filesBytes > 0
      ? [{ name: '文件占用', value: storageStats.filesBytes, color: '#3b82f6' }]
      : []),
    ...(storageStats.notesBytes > 0
      ? [{ name: '笔记占用', value: storageStats.notesBytes, color: '#10b981' }]
      : []),
    ...(freeBytes > 0 || storageStats.usedBytes === 0
      ? [{ name: '剩余空间', value: freeBytes > 0 ? freeBytes : storageStats.totalQuotaBytes, color: freeSliceColor }]
      : [])
  ];

  return (
    <div className="h-full w-full bg-[#1e2128] text-gray-200 p-3 md:p-6 pb-16 md:pb-6 flex flex-col relative select-none overflow-hidden">
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={handleNativeFileSelect}
      />
      <input
        type="file"
        ref={folderInputRef}
        multiple
        className="hidden"
        onChange={handleNativeFileSelect}
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />

      {/* 顶部标题与移动端折叠面板开关 */}
      <header className="flex justify-between items-center mb-3 md:mb-5 shrink-0">
        <h1 className="text-lg md:text-2xl font-bold text-blue-400">文件管理中心</h1>
        <button
          onClick={() => setShowMobileUploadPanel(!showMobileUploadPanel)}
          className="lg:hidden flex items-center gap-1.5 text-xs bg-[#2a2d35] border border-gray-700 px-3 py-1.5 rounded-lg text-gray-200"
        >
          <UploadCloud size={14} className="text-blue-400" />
          <span>{showMobileUploadPanel ? '收起上传/配额面板' : '展开上传/配额面板'}</span>
          {showMobileUploadPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 flex-1 overflow-hidden">
        {/* 左侧控制区（移动端默认收起，点击可展开；桌面端常驻显示） */}
        <div
          className={`${
            showMobileUploadPanel ? 'flex max-h-96 lg:max-h-none' : 'hidden lg:flex'
          } flex-col gap-4 md:gap-5 overflow-y-auto pr-1 shrink-0`}
        >
          {/* 存储空间仪表盘（区分文件蓝 / 笔记绿 / 剩余空间） */}
          <div className="bg-[#2a2d35] p-4 md:p-5 rounded-lg shadow-lg shrink-0">
            <h2 className="text-sm md:text-base font-semibold mb-3 border-b border-gray-600 pb-2">
              存储空间使用情况
            </h2>
            <div className="h-36 md:h-40 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={storageChartData}
                    innerRadius="68%"
                    outerRadius="90%"
                    dataKey="value"
                    stroke="none"
                    minAngle={storageStats.usedBytes > 0 ? 4 : 0}
                    paddingAngle={storageStats.filesBytes > 0 && storageStats.notesBytes > 0 ? 1 : 0}
                  >
                    {storageChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      `${formatBytes(Number(value) || 0)} (${formatQuotaPercent(Number(value) || 0, storageStats.totalQuotaBytes)})`,
                      String(name ?? '')
                    ]}
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface-alt)',
                      borderColor: 'var(--border-main)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: 'var(--text-primary)'
                    }}
                    itemStyle={{ color: 'var(--text-secondary)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base md:text-lg font-bold text-gray-100">
                  {formatBytes(storageStats.usedBytes)}
                </span>
                <span className="text-[11px] text-gray-400">
                  / {formatBytes(storageStats.totalQuotaBytes)} (
                  {formatQuotaPercent(storageStats.usedBytes, storageStats.totalQuotaBytes)})
                </span>
              </div>
            </div>

            {/* 文件与笔记占用分项图例 */}
            <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-gray-700/60 text-[11px]">
              <div className="flex items-center justify-between bg-[#1e2128] px-2.5 py-1.5 rounded-lg">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span>文件</span>
                </span>
                <span className="font-semibold text-gray-200 truncate ml-1">
                  {formatBytes(storageStats.filesBytes)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#1e2128] px-2.5 py-1.5 rounded-lg">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>笔记</span>
                </span>
                <span className="font-semibold text-gray-200 truncate ml-1">
                  {formatBytes(storageStats.notesBytes)}
                </span>
              </div>
            </div>
          </div>

          {/* 上传面板与暂存预检区 */}
          <div className="bg-[#2a2d35] p-4 md:p-5 rounded-lg shadow-lg shrink-0">
            <h2 className="text-sm md:text-base font-semibold mb-3 border-b border-gray-600 pb-2">
              上传文件 / 文件夹
            </h2>

            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-gray-500 rounded-lg p-4 md:p-5 flex flex-col items-center justify-center text-gray-400 hover:bg-[#323640] hover:border-blue-400 transition-all cursor-pointer mb-3"
            >
              <UploadCloud size={26} className="mb-2 text-blue-400" />
              <p className="text-xs md:text-sm font-medium text-center">将文件或整个文件夹拖拽至此</p>
              <p className="text-[11px] text-gray-500 mt-1">支持多级子目录自动遍历</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 bg-[#374151] hover:bg-[#4b5563] text-gray-200 text-xs py-2 px-3 rounded transition-colors"
              >
                <FileUp size={14} /> 选择文件
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 bg-[#374151] hover:bg-[#4b5563] text-gray-200 text-xs py-2 px-3 rounded transition-colors"
              >
                <FolderUp size={14} /> 选择文件夹
              </button>
            </div>

            {stagedItems.length > 0 && (
              <div className="bg-[#1e2128] border border-blue-500/30 rounded-lg p-3 mb-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-blue-400">
                    待上传 ({stagedSummaryGroups.length} 项 / 共 {stagedItems.length} 个文件)
                  </span>
                  <button
                    onClick={() => setStagedItems([])}
                    className="text-xs text-gray-400 hover:text-red-400"
                  >
                    清空
                  </button>
                </div>

                <div className="max-h-24 overflow-y-auto mb-2 space-y-1 pr-1">
                  {stagedSummaryGroups.map(([name, info]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between text-[11px] text-gray-300 bg-[#252830] px-2 py-1 rounded"
                    >
                      <span className="truncate">
                        {info.isFolder ? `📁 ${name} (${info.count}个文件)` : `📄 ${name}`}
                      </span>
                      <span className="text-gray-500 shrink-0 ml-2">{formatBytes(info.size)}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-400 border-t border-gray-700/60 pt-2 mb-3">
                  <div>
                    <div className="flex items-center gap-1 text-gray-500 mb-0.5">
                      <HardDrive size={11} /> 总大小
                    </div>
                    <div className="font-semibold text-gray-200">{formatBytes(totalStagedBytes)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-gray-500 mb-0.5">
                      <PieChartIcon size={11} /> 占分配空间
                    </div>
                    <div className="font-semibold text-yellow-400">{formatQuotaPercent(totalStagedBytes)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-gray-500 mb-0.5">
                      <Clock size={11} /> 预估耗时
                    </div>
                    <div className="font-semibold text-green-400">{formatETA(totalStagedBytes)}</div>
                  </div>
                </div>

                <button
                  onClick={handleStartUpload}
                  disabled={currentUser?.role === 'guest'}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 rounded text-xs transition-colors shadow-md"
                >
                  {currentUser?.role !== 'guest'
                    ? `确认开始传送 (${stagedSummaryGroups.length} 项)`
                    : '只读访客无上传权限'}
                </button>
              </div>
            )}
          </div>

          {/* 实时传输队列看板 */}
          {myTasks.length > 0 && (
            <div className="bg-[#2a2d35] p-4 md:p-5 rounded-lg shadow-lg flex-1 overflow-y-auto">
              <div className="flex justify-between items-center mb-3 border-b border-gray-600 pb-2">
                <h2 className="text-sm md:text-base font-semibold">传输队列</h2>
                <span className="text-xs text-blue-400">
                  {myTasks.filter((t) => t.status === 'uploading').length} 个进行中
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {myTasks.map((task) => (
                  <div key={task.id} className="bg-[#1e2128] p-3 rounded border border-gray-700">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs truncate pr-3 text-gray-300" title={task.name}>
                        {task.name}
                      </span>
                      {task.status === 'uploading' && removeTask && (
                        <button onClick={() => removeTask(task.id)} className="text-gray-500 hover:text-red-400">
                          <X size={12} />
                        </button>
                      )}
                      {task.status === 'success' && <CheckCircle2 size={14} className="text-green-500 shrink-0" />}
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5 mb-1 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          task.status === 'success' ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${task.progress}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>{formatBytes(task.size)}</span>
                      <span>{task.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧文件列表主区 */}
        <div className="lg:col-span-2 bg-[#2a2d35] p-3 md:p-5 rounded-lg shadow-lg flex flex-col overflow-hidden">
          {/* 顶部面包屑与批量操作工具栏 */}
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3 border-b border-gray-600 pb-2.5">
            {/* 面包屑路径导航（支持将单文件或批量选中文件拖拽至任意层级或根目录） */}
            <div className="flex items-center flex-wrap text-xs md:text-sm font-semibold text-gray-300">
              <button
                onClick={() => goToBreadcrumb && goToBreadcrumb(-1)}
                onDragOver={(e) => {
                  if (draggedNodeIds.length > 0 && currentPath.length > 0) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  if (draggedNodeIds.length > 0 && currentPath.length > 0) {
                    e.preventDefault();
                    moveNode(draggedNodeIds, null);
                    setDraggedNodeIds([]);
                    setSelectedFileIds([]);
                  }
                }}
                className={`flex items-center gap-1 hover:text-blue-400 p-1 rounded transition-colors ${
                  currentPath.length === 0 ? 'text-blue-400' : ''
                }`}
                title="可将文件（含公共文件夹内的文件）拖拽至此移回个人根目录"
              >
                <Home size={15} /> 根目录
              </button>

              {(currentPath || []).map((node, index) => (
                <div key={node.id} className="flex items-center">
                  <ChevronRight size={15} className="mx-0.5 text-gray-500" />
                  <button
                    onClick={() => goToBreadcrumb && goToBreadcrumb(index)}
                    onDragOver={(e) => {
                      if (
                        draggedNodeIds.length > 0 &&
                        !draggedNodeIds.includes(node.id) &&
                        index !== currentPath.length - 1
                      ) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }
                    }}
                    onDrop={(e) => {
                      if (
                        draggedNodeIds.length > 0 &&
                        !draggedNodeIds.includes(node.id) &&
                        index !== currentPath.length - 1
                      ) {
                        e.preventDefault();
                        moveNode(draggedNodeIds, node.id);
                        setDraggedNodeIds([]);
                        setSelectedFileIds([]);
                      }
                    }}
                    className={`hover:text-blue-400 p-1 rounded transition-colors ${
                      index === currentPath.length - 1 ? 'text-blue-400 font-semibold' : ''
                    }`}
                  >
                    {node.name}
                  </button>
                </div>
              ))}
            </div>

            {/* 右侧功能与批量操作按钮组 */}
            <div className="flex items-center flex-wrap gap-1.5">
              {/* 批量选中操作栏（全空间支持批量复制 / 批量剪切 / 批量删除 / 公共空间批量共享） */}
              {selectedFileIds.length > 0 && currentUser?.role !== 'guest' && (
                <div className="flex items-center gap-1.5 bg-[#1e2128] border border-blue-500/40 px-2 py-1 rounded-lg">
                  <span className="text-[11px] text-blue-400 font-medium px-1">
                    已选 {selectedFileIds.length} 项
                  </span>
                  <button
                    onClick={() => handlePutToClipboard(selectedFileIds, 'copy')}
                    className="text-gray-200 hover:text-blue-400 flex items-center gap-1 text-xs bg-[#2a2d35] px-2 py-1 rounded transition-colors"
                    title="批量复制选中项"
                  >
                    <Copy size={12} />
                    <span>复制</span>
                  </button>
                  <button
                    onClick={() => handlePutToClipboard(selectedFileIds, 'cut')}
                    className="text-gray-200 hover:text-yellow-400 flex items-center gap-1 text-xs bg-[#2a2d35] px-2 py-1 rounded transition-colors"
                    title="批量剪切选中项"
                  >
                    <Scissors size={12} />
                    <span>剪切</span>
                  </button>
                  {isInPublicSpace && (
                    <button
                      onClick={() =>
                        setShareModal({
                          isOpen: true,
                          targetIds: selectedFileIds,
                          titleText: `已选中的 ${selectedFileIds.length} 个项目`,
                          sharedWith: []
                        })
                      }
                      className="text-blue-300 hover:text-white flex items-center gap-1 text-xs bg-blue-600/30 border border-blue-500/40 px-2 py-1 rounded transition-colors"
                    >
                      <Share2 size={12} />
                      <span>共享</span>
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (confirm(`确认将选中的 ${selectedFileIds.length} 个项目移入回收站吗？`)) {
                        await batchDeleteFiles(selectedFileIds);
                        setSelectedFileIds([]);
                      }
                    }}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs bg-red-950/30 border border-red-800/40 px-2 py-1 rounded transition-colors"
                  >
                    <Trash2 size={12} />
                    <span>删除</span>
                  </button>
                </div>
              )}

              {/* 剪贴板粘贴状态栏（支持复制粘贴与剪切粘贴，同目录复制自动追加 (1)） */}
              {clipboard && clipboard.items.length > 0 && currentUser?.role !== 'guest' && (
                <div className="flex items-center gap-1 bg-yellow-950/40 border border-yellow-600/50 px-2.5 py-1 rounded-lg">
                  <button
                    onClick={async () => {
                      await pasteClipboard(currentFolderId);
                      setSelectedFileIds([]);
                    }}
                    className="text-yellow-300 hover:text-yellow-200 flex items-center gap-1 text-xs font-medium"
                    title="将剪贴板中的项目粘贴到当前目录（若同名自动添加 (1) 后缀）"
                  >
                    <ClipboardPaste size={13} />
                    <span>
                      粘贴到此处 ({clipboard.action === 'copy' ? '复制' : '剪切'} {clipboard.items.length} 项)
                    </span>
                  </button>
                  <button
                    onClick={() => setClipboard(null)}
                    className="text-gray-400 hover:text-white ml-1"
                    title="清空剪贴板"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* 页内刷新按钮：重新拉取当前目录文件，不重置当前所在层级 */}
              {!(currentUser?.role === 'guest' && !isInPublicSpace) && (
                <button
                  onClick={handleManualRefresh}
                  className="text-gray-300 hover:text-white flex items-center gap-1 text-xs bg-[#323640] hover:bg-[#3d424e] px-2.5 py-1.5 rounded transition-colors"
                  title="刷新当前文件夹内容"
                >
                  <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-blue-400' : 'text-blue-400'} />
                  <span>刷新</span>
                </button>
              )}

              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => setIsLogOpen(true)}
                  className="text-gray-300 hover:text-white flex items-center gap-1 text-xs bg-[#323640] px-2.5 py-1.5 rounded transition-colors"
                  title="查看公共空间操作日志"
                >
                  <ClipboardList size={14} className="text-blue-400" />
                  <span>审计日志 ({operationLogs.length})</span>
                </button>
              )}

              {currentUser?.role !== 'guest' && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs bg-[#323640] px-3 py-1.5 rounded transition-colors"
                >
                  <FolderPlus size={14} /> 新建文件夹
                </button>
              )}
            </div>
          </div>

          {/* 表格横向滚动与可拖拽列宽容器 */}
          <div className="flex-1 overflow-auto">
            <div className="min-w-max">
              {/* 表头（支持点击排序 + 右侧边缘鼠标拖拽调整列宽） */}
              <div
                style={gridTemplateStyle}
                className="grid items-center text-xs text-gray-400 font-semibold border-b border-gray-700 pb-2 mb-1 sticky top-0 bg-[#2a2d35] z-10"
              >
                {/* 列 1：全选框 + 文件名 */}
                <div className="relative flex items-center gap-2 pr-3 overflow-hidden">
                  {currentUser?.role !== 'guest' && selectableIds.length > 0 && (
                    <button
                      onClick={() =>
                        setSelectedFileIds(
                          selectedFileIds.length === selectableIds.length ? [] : selectableIds
                        )
                      }
                      className="text-gray-400 hover:text-white shrink-0"
                      title="全选 / 取消全选"
                    >
                      {selectedFileIds.length > 0 && selectedFileIds.length === selectableIds.length ? (
                        <CheckSquare size={14} className="text-blue-400" />
                      ) : (
                        <Square size={14} />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleSort('name')}
                    className="flex items-center gap-1 hover:text-gray-200 truncate"
                  >
                    <span>文件名</span>
                    {renderSortIcon('name')}
                  </button>
                  <div
                    onMouseDown={(e) => startResizeColumn('name', e)}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/60 transition-colors"
                    title="按住左右拖动调整【文件名】列宽"
                  />
                </div>

                {/* 列 2：类型 */}
                <div className="relative flex items-center px-2 overflow-hidden">
                  <button
                    onClick={() => handleToggleSort('type')}
                    className="flex items-center gap-1 hover:text-gray-200 truncate"
                  >
                    <span>类型</span>
                    {renderSortIcon('type')}
                  </button>
                  <div
                    onMouseDown={(e) => startResizeColumn('type', e)}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/60 transition-colors"
                    title="按住左右拖动调整【类型】列宽"
                  />
                </div>

                {/* 列 3：大小 */}
                <div className="relative flex items-center px-2 overflow-hidden">
                  <button
                    onClick={() => handleToggleSort('size')}
                    className="flex items-center gap-1 hover:text-gray-200 truncate"
                  >
                    <span>大小</span>
                    {renderSortIcon('size')}
                  </button>
                  <div
                    onMouseDown={(e) => startResizeColumn('size', e)}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/60 transition-colors"
                    title="按住左右拖动调整【大小】列宽"
                  />
                </div>

                {/* 列 4：上传时间 */}
                <div className="relative flex items-center px-2 overflow-hidden">
                  <button
                    onClick={() => handleToggleSort('uploadTime')}
                    className="flex items-center gap-1 hover:text-gray-200 truncate"
                  >
                    <span>上传时间</span>
                    {renderSortIcon('uploadTime')}
                  </button>
                  <div
                    onMouseDown={(e) => startResizeColumn('uploadTime', e)}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/60 transition-colors"
                    title="按住左右拖动调整【上传时间】列宽"
                  />
                </div>

                {/* 列 5：操作 */}
                <div className="text-right pr-2">操作</div>
              </div>

              {/* 文件行列表 */}
              {sortedDisplayFiles.length === 0 ? (
                <div className="text-center text-gray-500 py-12 text-sm">当前文件夹为空</div>
              ) : (
                sortedDisplayFiles.map((file) => {
                  const isItemDraggable =
                    currentUser?.role !== 'guest' && file.id !== 'folder_public_root';
                  const isDropTarget =
                    file.isFolder && dropTargetId === file.id && !draggedNodeIds.includes(file.id);
                  const isBeingDragged = draggedNodeIds.includes(file.id);
                  const isSelected = selectedFileIds.includes(file.id);
                  const isInClipboard = clipboard?.items.some((i) => i.id === file.id);

                  return (
                    <div
                      key={file.id}
                      style={gridTemplateStyle}
                      draggable={isItemDraggable}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        // 如果拖动的是已勾选的项目之一，则自动触发批量拖动全部已勾选项
                        const batchIds = isSelected ? selectedFileIds : [file.id];
                        e.dataTransfer.setData('text/plain', JSON.stringify(batchIds));
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggedNodeIds(batchIds);
                      }}
                      onDragEnd={() => {
                        setDraggedNodeIds([]);
                        setDropTargetId(null);
                      }}
                      onDragOver={(e) => {
                        if (
                          file.isFolder &&
                          draggedNodeIds.length > 0 &&
                          !draggedNodeIds.includes(file.id)
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                          if (dropTargetId !== file.id) {
                            setDropTargetId(file.id);
                          }
                        }
                      }}
                      onDragLeave={(e) => {
                        if (file.isFolder && dropTargetId === file.id) {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setDropTargetId(null);
                          }
                        }
                      }}
                      onDrop={(e) => {
                        if (
                          file.isFolder &&
                          draggedNodeIds.length > 0 &&
                          !draggedNodeIds.includes(file.id)
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          moveNode(draggedNodeIds, file.id);
                          setDraggedNodeIds([]);
                          setDropTargetId(null);
                          setSelectedFileIds([]);
                        }
                      }}
                      className={`grid items-center text-xs py-2.5 border-b transition-all group select-none ${
                        isDropTarget
                          ? 'bg-blue-900/40 border-blue-400 shadow-md pl-2'
                          : isSelected
                          ? 'bg-blue-950/30 border-gray-700/60 hover:bg-[#323640]'
                          : 'border-gray-700/60 hover:bg-[#323640]'
                      } ${isBeingDragged ? 'opacity-35 border-dashed border-gray-500' : ''} ${
                        isItemDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                      }`}
                    >
                      {/* 列 1：复选框 + 图标 + 文件名 + 权限角标 */}
                      <div className="flex items-center gap-2 text-gray-300 truncate pr-3">
                        {currentUser?.role !== 'guest' && file.id !== 'folder_public_root' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFileIds((prev) =>
                                prev.includes(file.id)
                                  ? prev.filter((id) => id !== file.id)
                                  : [...prev, file.id]
                              );
                            }}
                            className="text-gray-400 hover:text-blue-400 shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare size={14} className="text-blue-400" />
                            ) : (
                              <Square size={14} />
                            )}
                          </button>
                        )}

                        {file.isFolder ? (
                          <span className="text-yellow-500 text-sm shrink-0">📁</span>
                        ) : (
                          <span className="text-blue-400 text-sm shrink-0">📄</span>
                        )}
                        <span
                          className={`truncate ${
                            file.isFolder
                              ? 'cursor-pointer hover:text-blue-400 hover:underline font-medium'
                              : ''
                          }`}
                          onClick={() =>
                            file.isFolder && enterFolder && enterFolder(file.id, file.name)
                          }
                          title={file.name}
                        >
                          {file.name}
                        </span>

                        {isInPublicSpace && file.id !== 'folder_public_root' && (
                          file.sharedWith?.includes('ALL') ? (
                            <span className="text-[10px] bg-green-950/60 text-green-400 border border-green-700/50 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5">
                              <Globe size={10} /> 所有人可见
                            </span>
                          ) : file.sharedWith && file.sharedWith.length > 0 ? (
                            <span className="text-[10px] bg-blue-950/60 text-blue-400 border border-blue-700/50 px-1.5 py-0.5 rounded shrink-0">
                              指定 {file.sharedWith.length} 人
                            </span>
                          ) : (
                            <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5">
                              <Lock size={10} /> 仅自己可见
                            </span>
                          )
                        )}
                      </div>

                      {/* 列 2：类型 */}
                      <div className="px-2 text-gray-400 truncate">{getFileTypeLabel(file)}</div>

                      {/* 列 3：大小 */}
                      <div className="px-2 text-gray-400 truncate">{formatBytes(file.size)}</div>

                      {/* 列 4：上传时间 */}
                      <div className="px-2 text-gray-500 truncate">{file.uploadTime}</div>

                      {/* 列 5：操作按钮（移动端常驻可见，桌面端悬停可见） */}
                      <div className="pr-2 text-right opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-end gap-2">
                        {!file.isFolder && (
                          <button
                            onClick={() => {
                              const virtualPath = file.virtualPath || file.name;
                              window.open(
                                api.files.getDownloadUrl(virtualPath, isInPublicSpace),
                                '_blank'
                              );
                            }}
                            className="text-blue-400 hover:text-blue-300"
                            title="下载文件"
                          >
                            <Download size={14} />
                          </button>
                        )}

                        {isInPublicSpace &&
                          file.id !== 'folder_public_root' &&
                          (file.ownerId === currentUser?.id || currentUser?.role === 'admin') && (
                            <button
                              onClick={() =>
                                setShareModal({
                                  isOpen: true,
                                  targetIds: [file.id],
                                  titleText: file.name,
                                  sharedWith: file.sharedWith || []
                                })
                              }
                              className={`hover:text-blue-400 ${
                                file.sharedWith && file.sharedWith.length > 0
                                  ? 'text-blue-400'
                                  : 'text-gray-400'
                              }`}
                              title="设置共享权限"
                            >
                              <Share2 size={13} />
                            </button>
                          )}

                        {currentUser?.role !== 'guest' && file.id !== 'folder_public_root' && (
                          <>
                            <button
                              onClick={() => {
                                setRenamedName(file.name);
                                setRenameModal({ isOpen: true, id: file.id, oldName: file.name });
                              }}
                              className="text-gray-400 hover:text-yellow-400"
                              title="重命名"
                            >
                              <Edit2 size={13} />
                            </button>

                            <button
                              onClick={() => handlePutToClipboard([file.id], 'copy')}
                              className={`hover:text-blue-400 ${
                                isInClipboard && clipboard?.action === 'copy'
                                  ? 'text-blue-400 animate-pulse'
                                  : 'text-gray-400'
                              }`}
                              title="复制"
                            >
                              <Copy size={13} />
                            </button>

                            <button
                              onClick={() => handlePutToClipboard([file.id], 'cut')}
                              className={`hover:text-yellow-400 ${
                                isInClipboard && clipboard?.action === 'cut'
                                  ? 'text-yellow-400 animate-pulse'
                                  : 'text-gray-400'
                              }`}
                              title="剪切"
                            >
                              <Scissors size={13} />
                            </button>

                            <button
                              onClick={() =>
                                deleteFile &&
                                deleteFile(file.id, {
                                  name: currentUser!.name,
                                  username: currentUser!.username
                                })
                              }
                              className="text-red-400 hover:text-red-300"
                              title="删除"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 新建文件夹模态弹窗 */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2a2d35] rounded-lg p-5 w-88 shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-gray-200">新建文件夹</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="请输入文件夹名称"
              className="w-full bg-[#1e2128] border border-gray-600 rounded px-3 py-2 mb-4 text-xs text-gray-200 focus:outline-none focus:border-blue-400"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs text-gray-400 hover:bg-[#323640] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-xs transition-colors"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renameModal.isOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2a2d35] rounded-lg p-5 w-88 shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-gray-200">重命名项目</h3>
              <button
                onClick={() => setRenameModal({ isOpen: false, id: '', oldName: '' })}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={renamedName}
              onChange={(e) => setRenamedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renamedName.trim()) {
                  renameNode(renameModal.id, renamedName.trim(), {
                    name: currentUser!.name,
                    username: currentUser!.username
                  });
                  setRenameModal({ isOpen: false, id: '', oldName: '' });
                }
              }}
              className="w-full bg-[#1e2128] border border-gray-600 rounded px-3 py-2 mb-4 text-xs text-gray-200 focus:outline-none focus:border-blue-400"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameModal({ isOpen: false, id: '', oldName: '' })}
                className="px-3 py-1.5 rounded text-xs text-gray-400 hover:bg-[#323640] transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (renamedName.trim()) {
                    renameNode(renameModal.id, renamedName.trim(), {
                      name: currentUser!.name,
                      username: currentUser!.username
                    });
                    setRenameModal({ isOpen: false, id: '', oldName: '' });
                  }
                }}
                disabled={!renamedName.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-xs transition-colors"
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 定向共享 / 批量共享权限设置弹窗 */}
      {shareModal.isOpen && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-1.5">
                <Share2 size={16} className="text-blue-400" />
                设置公共空间访问权限
              </h3>
              <button
                onClick={() => setShareModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3 truncate">
              目标: <span className="text-gray-200 font-medium">{shareModal.titleText}</span>
            </p>

            <div
              onClick={() => {
                const isAll = shareModal.sharedWith.includes('ALL');
                setShareModal((prev) => ({
                  ...prev,
                  sharedWith: isAll ? [] : ['ALL']
                }));
              }}
              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer mb-3 transition-colors ${
                shareModal.sharedWith.includes('ALL')
                  ? 'bg-green-950/30 border-green-500/50 text-green-300'
                  : 'bg-[#1e2128] border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe
                  size={16}
                  className={shareModal.sharedWith.includes('ALL') ? 'text-green-400' : 'text-gray-500'}
                />
                <div>
                  <div className="text-xs font-semibold">所有人可见 (含公共访客)</div>
                  <div className="text-[10px] text-gray-400">开启后访客及全体成员均可查看与下载</div>
                </div>
              </div>
              <span className="text-xs font-bold">
                {shareModal.sharedWith.includes('ALL') ? '✓ 已开启' : '未开启'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
              <span>或指定特定成员可见 (全不选则仅自己可见):</span>
              {shareModal.sharedWith.length > 0 && (
                <button
                  onClick={() => setShareModal((prev) => ({ ...prev, sharedWith: [] }))}
                  className="text-red-400 hover:underline"
                >
                  设为仅自己可见
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto mb-4 p-2 bg-[#1e2128] rounded-xl border border-gray-700/80">
              {shareableUsers
                .filter((u) => u.id !== currentUser?.id)
                .map((u) => {
                  const isAll = shareModal.sharedWith.includes('ALL');
                  const isSelected = isAll || shareModal.sharedWith.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        setShareModal((prev) => {
                          const withoutAll = prev.sharedWith.filter((id) => id !== 'ALL');
                          const next = withoutAll.includes(u.id)
                            ? withoutAll.filter((id) => id !== u.id)
                            : [...withoutAll, u.id];
                          return { ...prev, sharedWith: next };
                        });
                      }}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-[#2b2f3a] cursor-pointer text-xs"
                    >
                      <div>
                        <div className="font-medium text-gray-200">{u.name}</div>
                        <div className="text-[10px] text-gray-500">@{u.username}</div>
                      </div>
                      <span className={`text-xs ${isSelected ? 'text-blue-400 font-bold' : 'text-gray-600'}`}>
                        {isSelected ? '✓ 可见' : '+ 授权'}
                      </span>
                    </div>
                  );
                })}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShareModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-[#1e2128]"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await updateFileShare(shareModal.targetIds, shareModal.sharedWith);
                  setSelectedFileIds([]);
                  setShareModal((prev) => ({ ...prev, isOpen: false }));
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium"
              >
                确认保存权限
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 管理员操作审计日志抽屉 */}
      {isLogOpen && (
        <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-[#1a1c23] border-l border-gray-800 shadow-2xl z-50 flex flex-col">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
              <ClipboardList size={16} className="text-blue-400" />
              公共空间操作审计日志
            </h3>
            <button onClick={() => setIsLogOpen(false)} className="text-gray-500 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {operationLogs.length === 0 ? (
              <div className="text-center text-gray-500 text-xs py-16">暂无任何公共空间操作记录</div>
            ) : (
              operationLogs.map((log) => (
                <div key={log.id} className="p-3 bg-[#21242c] border border-gray-800 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-200">
                      {log.operatorName} (@{log.operatorUsername})
                    </span>
                    <span className="text-[10px] text-gray-500">{log.time}</span>
                  </div>
                  <div className="text-gray-300 flex items-center gap-1.5">
                    <span className="text-blue-400 font-medium">[{log.action}]</span>
                    <span className="truncate">{log.targetName}</span>
                  </div>
                  {log.details && <div className="text-[11px] text-gray-500">{log.details}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
