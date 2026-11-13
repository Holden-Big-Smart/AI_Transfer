// src/pages/FileCenter/index.tsx
import { useState, useRef, useEffect } from 'react';
import { api } from '../../utils/api';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { 
  UploadCloud, FolderPlus, Download, Trash2, Home, 
  ChevronRight, X, CheckCircle2, Clock, HardDrive, FileUp, FolderUp,
  Edit2, Scissors, ClipboardPaste, Share2, ClipboardList,
  PieChart as PieChartIcon, Globe, Lock, CheckSquare, Square
} from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { useAuthStore } from '../../store/useAuthStore';

// 新增：携带相对路径的待传文件项接口（用于保持整个文件夹层级结构）
interface StagedItem {
  file: File;
  relativePath: string;
}

// 字节单位格式化
const formatBytes = (bytes: number | null) => {
  if (bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 预估上传耗时计算（以 5 MB/s 估算网络基准速度）
const formatETA = (bytes: number) => {
  if (bytes === 0) return '< 1 秒';
  const speed = 5 * 1024 * 1024; // 5 MB/s
  const seconds = Math.ceil(bytes / speed);
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return `约 ${minutes} 分 ${remSec} 秒`;
};

// 占总空间（50GB）的配额百分比计算
const formatQuotaPercent = (bytes: number) => {
  const totalQuota = 50 * 1024 * 1024 * 1024; // 50 GB 字节数
  const percent = (bytes / totalQuota) * 100;
  if (percent === 0) return '0%';
  if (percent < 0.01) return '< 0.01%';
  return `${percent.toFixed(2)}%`;
};

export default function FileCenter() {
  const { currentUser } = useAuthStore();
  const { 
    files = [], 
    currentPath = [], 
    tasks = [], 
    clipboard, setClipboard, renameNode, moveNode,
    enterFolder, goToBreadcrumb, deleteFile, createFolder,
    addTask, updateTaskProgress, removeTask,
    operationLogs = [], updateFileShare,
    loadServerFiles, loadAuditLogs
  } = useFileStore();

  // 审计日志抽屉状态 (仅 Admin 可见)
  const [isLogOpen, setIsLogOpen] = useState(false);

  // 新增：拖拽移动文件/文件夹的相关状态
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // 可共享用户列表与多选批量共享状态
  const [shareableUsers, setShareableUsers] = useState<Array<{ id: string; username: string; name: string; role: string }>>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  // 传输队列隔离：仅筛选当前登录用户的传输任务
  const myTasks = (tasks || []).filter(t => t.userId === currentUser?.id);

  // 定向共享 / 批量共享弹窗状态（targetIds 支持单选或多选）
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; targetIds: string[]; titleText: string; sharedWith: string[] }>({
    isOpen: false,
    targetIds: [],
    titleText: '',
    sharedWith: []
  });

  // 获取当前所在层级
  const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
  const currentParentNode = files.find(f => f.id === currentFolderId);
  const isInPublicSpace = currentFolderId === 'folder_public_root' || !!currentParentNode?.isPublicFolder;

  // 后端已完成严密的权限过滤，前端直接展示当前目录层级下的节点（访客在根目录仅展示公共空间入口）
  const displayFiles = files.filter((file) => {
    if (file.parentId !== currentFolderId) return false;
    if (!isInPublicSpace && currentUser?.role === 'guest') {
      return file.id === 'folder_public_root';
    }
    return true;
  });

  // 切换目录时清空多选勾选并拉取服务器最新文件
  useEffect(() => {
    setSelectedFileIds([]);
    if (!currentUser) return;

    if (currentUser.role !== 'guest') {
      api.files.getShareableUsers().then(setShareableUsers).catch(() => {});
    }

    // 访客仅在进入公共空间时拉取数据
    if (currentUser.role === 'guest' && !isInPublicSpace) return;

    const virtualSubPath = currentFolderId && currentFolderId !== 'folder_public_root'
      ? currentFolderId.replace(/^(pub_|pri_)/, '')
      : '';
    loadServerFiles(isInPublicSpace, virtualSubPath);
    if (currentUser.role === 'admin') loadAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, isInPublicSpace, currentUser]);

  // 模态弹窗与输入引用
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // 控制重命名弹窗
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; id: string; oldName: string }>({
    isOpen: false,
    id: '',
    oldName: ''
  });
  const [renamedName, setRenamedName] = useState('');
  
  // 待上传队列（保留完整文件夹相对路径）
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const totalStagedBytes = stagedItems.reduce((acc, item) => acc + item.file.size, 0);

  // 统计待上传队列中的顶层项目（将同一文件夹聚合成一项展示）
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

  // 递归解析拖入的文件夹并保留相对层级路径
  const scanEntry = async (entry: any, prefix = ''): Promise<StagedItem[]> => {
    if (!entry) return [];
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file: File) => resolve([{ file, relativePath: `${prefix}${file.name}` }]));
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readAllEntries = async (): Promise<any[]> => {
        const batch: any[] = await new Promise((res) => dirReader.readEntries(res));
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
      const entries: any[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      const scanned = await Promise.all(entries.map((ent) => scanEntry(ent, '')));
      setStagedItems((prev) => [...prev, ...scanned.flat()]);
    }
  };

  // 选择文件或选择整个文件夹监听（保留 webkitRelativePath）
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

  // 按顶层文件夹/单文件聚合上传（整个文件夹合并为一个任务并在后端还原完整目录树）
  const handleStartUpload = async () => {
    if (stagedItems.length === 0 || !currentUser) return;

    const virtualParent = currentFolderId && currentFolderId !== 'folder_public_root'
      ? currentFolderId.replace(/^(pub_|pri_)/, '')
      : '';

    // 将待传列表按顶层名称分组（同一文件夹作为单个整体任务上传）
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

  const storageData = [{ name: 'Used', value: 42.64 }, { name: 'Free', value: 50 * 1024 - 42.64 }];
  const COLORS = ['#3b82f6', '#374151'];

  return (
    <div className="h-full w-full bg-[#1e2128] text-gray-200 p-6 flex flex-col relative select-none">
      
      {/* 隐藏的本地文件/文件夹读取输入控件 */}
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
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      {/* 顶部导航（已移除右上角退出登录，统一由左下角 Sidebar 退出） */}
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-blue-400">文件管理中心</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
        
        {/* 左侧控制区 */}
        <div className="flex flex-col gap-5 overflow-y-auto pr-2">
          
          {/* 存储空间仪表盘 */}
          <div className="bg-[#2a2d35] p-5 rounded-lg shadow-lg shrink-0">
            <h2 className="text-base font-semibold mb-3 border-b border-gray-600 pb-2">存储空间使用情况</h2>
            <div className="h-40 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={storageData} innerRadius="70%" outerRadius="90%" dataKey="value" stroke="none">
                    {storageData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold">42.64 MB</span>
                <span className="text-xs text-gray-400">/ 50 GB (0.08%)</span>
              </div>
            </div>
          </div>

          {/* 上传面板与暂存预检区 */}
          <div className="bg-[#2a2d35] p-5 rounded-lg shadow-lg shrink-0">
            <h2 className="text-base font-semibold mb-3 border-b border-gray-600 pb-2">上传文件 / 文件夹</h2>
            
            {/* 拖拽释放区 */}
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-gray-500 rounded-lg p-5 flex flex-col items-center justify-center text-gray-400 hover:bg-[#323640] hover:border-blue-400 transition-all cursor-pointer mb-3"
            >
              <UploadCloud size={28} className="mb-2 text-blue-400" />
              <p className="text-sm font-medium text-center">将文件或整个文件夹拖拽至此</p>
              <p className="text-xs text-gray-500 mt-1">支持多级子目录自动遍历</p>
            </div>

            {/* 文件/文件夹选择按钮组 */}
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

            {/* 待上传暂存信息看板（支持整包文件夹聚合预览） */}
            {stagedItems.length > 0 && (
              <div className="bg-[#1e2128] border border-blue-500/30 rounded-lg p-3 mb-3">
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
                    <div key={name} className="flex items-center justify-between text-[11px] text-gray-300 bg-[#252830] px-2 py-1 rounded">
                      <span className="truncate">{info.isFolder ? `📁 ${name} (${info.count}个文件)` : `📄 ${name}`}</span>
                      <span className="text-gray-500 shrink-0 ml-2">{formatBytes(info.size)}</span>
                    </div>
                  ))}
                </div>
                
                {/* 传输总大小、配额占比、耗时指标 */}
                <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-400 border-t border-gray-700/60 pt-2 mb-3">
                  <div>
                    <div className="flex items-center gap-1 text-gray-500 mb-0.5"><HardDrive size={11} /> 总大小</div>
                    <div className="font-semibold text-gray-200">{formatBytes(totalStagedBytes)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-gray-500 mb-0.5"><PieChartIcon size={11} /> 占分配空间</div>
                    <div className="font-semibold text-yellow-400">{formatQuotaPercent(totalStagedBytes)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-gray-500 mb-0.5"><Clock size={11} /> 预估耗时</div>
                    <div className="font-semibold text-green-400">{formatETA(totalStagedBytes)}</div>
                  </div>
                </div>

                {/* 确认上传按钮 */}
                <button 
                  onClick={handleStartUpload}
                  disabled={currentUser?.role === 'guest'}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 rounded text-xs transition-colors shadow-md"
                >
                  {currentUser?.role !== 'guest' ? `确认开始传送 (${stagedSummaryGroups.length} 项)` : '只读访客无上传权限'}
                </button>
              </div>
            )}
          </div>

          {/* 实时传输队列看板（仅展示当前用户的传输记录） */}
          {myTasks.length > 0 && (
            <div className="bg-[#2a2d35] p-5 rounded-lg shadow-lg flex-1 overflow-y-auto">
              <div className="flex justify-between items-center mb-3 border-b border-gray-600 pb-2">
                <h2 className="text-base font-semibold">传输队列</h2>
                <span className="text-xs text-blue-400">{myTasks.filter(t => t.status === 'uploading').length} 个进行中</span>
              </div>
              <div className="flex flex-col gap-3">
                {myTasks.map(task => (
                  <div key={task.id} className="bg-[#1e2128] p-3 rounded border border-gray-700">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs truncate pr-3 text-gray-300" title={task.name}>{task.name}</span>
                      {task.status === 'uploading' && removeTask && (
                        <button onClick={() => removeTask(task.id)} className="text-gray-500 hover:text-red-400"><X size={12}/></button>
                      )}
                      {task.status === 'success' && <CheckCircle2 size={14} className="text-green-500 shrink-0" />}
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5 mb-1 overflow-hidden">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-300 ${task.status === 'success' ? 'bg-green-500' : 'bg-blue-500'}`} 
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

        {/* 右侧列表区 */}
        <div className="lg:col-span-2 bg-[#2a2d35] p-5 rounded-lg shadow-lg flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-2">
            <div className="flex items-center text-sm font-semibold text-gray-300">
              {/* 根目录支持作为拖拽释放目标 */}
              <button 
                onClick={() => goToBreadcrumb && goToBreadcrumb(-1)} 
                onDragOver={(e) => {
                  if (draggedNodeId && currentPath.length > 0) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  if (draggedNodeId && currentPath.length > 0) {
                    e.preventDefault();
                    moveNode(draggedNodeId, null, { name: currentUser!.name, username: currentUser!.username });
                    setDraggedNodeId(null);
                  }
                }}
                className={`flex items-center gap-1 hover:text-blue-400 p-1 rounded transition-colors ${currentPath.length === 0 ? 'text-blue-400' : ''}`}
                title="可将下方文件拖拽至此直接移到根目录"
              >
                <Home size={16} /> 根目录
              </button>

              {/* 各级面包屑支持作为拖拽目标 */}
              {(currentPath || []).map((node, index) => (
                <div key={node.id} className="flex items-center">
                  <ChevronRight size={16} className="mx-1 text-gray-500" />
                  <button 
                    onClick={() => goToBreadcrumb && goToBreadcrumb(index)} 
                    onDragOver={(e) => {
                      if (draggedNodeId && draggedNodeId !== node.id && index !== currentPath.length - 1) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }
                    }}
                    onDrop={(e) => {
                      if (draggedNodeId && draggedNodeId !== node.id && index !== currentPath.length - 1) {
                        e.preventDefault();
                        moveNode(draggedNodeId, node.id, { name: currentUser!.name, username: currentUser!.username });
                        setDraggedNodeId(null);
                      }
                    }}
                    className={`hover:text-blue-400 p-1 rounded transition-colors ${index === currentPath.length - 1 ? 'text-blue-400 font-semibold' : ''}`}
                  >
                    {node.name}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
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

              {/* 公共空间下勾选了文件时，显示批量共享按钮 */}
              {isInPublicSpace && selectedFileIds.length > 0 && currentUser?.role !== 'guest' && (
                <button
                  onClick={() =>
                    setShareModal({
                      isOpen: true,
                      targetIds: selectedFileIds,
                      titleText: `已选中的 ${selectedFileIds.length} 个项目`,
                      sharedWith: []
                    })
                  }
                  className="text-blue-300 hover:text-white flex items-center gap-1 text-xs bg-blue-600/30 border border-blue-500/50 px-2.5 py-1.5 rounded transition-colors"
                >
                  <Share2 size={14} />
                  <span>批量共享 ({selectedFileIds.length})</span>
                </button>
              )}

              {clipboard && (
                <button
                  onClick={() => moveNode(clipboard.id, currentFolderId, { name: currentUser!.name, username: currentUser!.username })}
                  className="text-yellow-400 hover:text-yellow-300 flex items-center gap-1 text-xs bg-yellow-950/40 border border-yellow-700/50 px-2.5 py-1.5 rounded transition-colors"
                  title="将已剪切的项移动到当前打开的目录"
                >
                  <ClipboardPaste size={14} /> 粘贴到此处
                </button>
              )}

              <button 
                onClick={() => setIsModalOpen(true)} 
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs bg-[#323640] px-3 py-1.5 rounded transition-colors"
              >
                <FolderPlus size={14} /> 新建文件夹
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 text-xs text-gray-400 font-semibold border-b border-gray-700 pb-2 mb-2 items-center">
            <div className="col-span-6 flex items-center gap-2">
              {isInPublicSpace && currentUser?.role !== 'guest' && displayFiles.length > 0 && (
                <button
                  onClick={() => {
                    const selectableIds = displayFiles
                      .filter(f => f.id !== 'folder_public_root' && (f.ownerId === currentUser?.id || currentUser?.role === 'admin'))
                      .map(f => f.id);
                    setSelectedFileIds(selectedFileIds.length === selectableIds.length ? [] : selectableIds);
                  }}
                  className="text-gray-400 hover:text-white"
                  title="全选/取消全选可管理的公共文件"
                >
                  {selectedFileIds.length > 0 && selectedFileIds.length === displayFiles.filter(f => f.id !== 'folder_public_root' && (f.ownerId === currentUser?.id || currentUser?.role === 'admin')).length
                    ? <CheckSquare size={14} className="text-blue-400" />
                    : <Square size={14} />}
                </button>
              )}
              <span>文件名</span>
            </div>
            <div className="col-span-2">大小</div>
            <div className="col-span-2">上传时间</div>
            <div className="col-span-2 text-right">操作</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {displayFiles.length === 0 ? (
              <div className="text-center text-gray-500 py-12 text-sm">当前文件夹为空</div>
            ) : (
              displayFiles.map((file) => {
                const isItemDraggable = currentUser?.role !== 'guest' && file.id !== 'folder_public_root';
                const isDropTarget = file.isFolder && dropTargetId === file.id;
                const isBeingDragged = draggedNodeId === file.id;

                return (
                <div 
                  key={file.id} 
                  draggable={isItemDraggable}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('text/plain', file.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggedNodeId(file.id);
                  }}
                  onDragEnd={() => {
                    setDraggedNodeId(null);
                    setDropTargetId(null);
                  }}
                  onDragOver={(e) => {
                    // 仅文件夹允许作为释放目标，且不能拖入自身
                    if (file.isFolder && draggedNodeId && draggedNodeId !== file.id) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      // 【关键修复1】：通过条件判断阻断无限 Re-render，解决卡顿
                      if (dropTargetId !== file.id) {
                        setDropTargetId(file.id);
                      }
                    }
                  }}
                  onDragEnter={(e) => {
                    // 【关键修复2】：废弃此处的 setDropTargetId 状态更新，交由 onDragOver 节流处理
                    if (file.isFolder && draggedNodeId && draggedNodeId !== file.id) {
                      e.preventDefault();
                    }
                  }}
                  onDragLeave={(e) => {
                    if (file.isFolder && dropTargetId === file.id) {
                      // 【关键修复3】：校验鼠标是否真正离开了当前行，排除经过子元素时的误触发
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDropTargetId(null);
                      }
                    }
                  }}
                  onDrop={(e) => {
                    if (file.isFolder && draggedNodeId && draggedNodeId !== file.id) {
                      e.preventDefault();
                      e.stopPropagation();
                      moveNode(draggedNodeId, file.id, { name: currentUser!.name, username: currentUser!.username });
                      setDraggedNodeId(null);
                      setDropTargetId(null);
                    }
                  }}
                  className={`grid grid-cols-12 gap-4 items-center text-xs py-3 border-b transition-all group select-none ${
                    isDropTarget 
                      ? 'bg-blue-900/40 border-blue-400 shadow-md scale-[1.008] pl-2' 
                      : 'border-gray-700/60 hover:bg-[#323640]'
                  } ${isBeingDragged ? 'opacity-35 border-dashed border-gray-500' : ''} ${
                    isItemDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                  }`}
                >
                  <div className="col-span-6 flex items-center gap-2 text-gray-300 truncate pr-2">
                    {/* 公共空间下支持勾选文件进行批量共享 */}
                    {isInPublicSpace && file.id !== 'folder_public_root' && (file.ownerId === currentUser?.id || currentUser?.role === 'admin') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFileIds((prev) =>
                            prev.includes(file.id) ? prev.filter((id) => id !== file.id) : [...prev, file.id]
                          );
                        }}
                        className="text-gray-400 hover:text-blue-400 shrink-0"
                      >
                        {selectedFileIds.includes(file.id) ? (
                          <CheckSquare size={14} className="text-blue-400" />
                        ) : (
                          <Square size={14} />
                        )}
                      </button>
                    )}

                    {file.isFolder ? <span className="text-yellow-500 text-sm">📁</span> : <span className="text-blue-400 text-sm">📄</span>}
                    <span 
                      className={`truncate ${file.isFolder ? 'cursor-pointer hover:text-blue-400 hover:underline font-medium' : ''}`} 
                      onClick={() => file.isFolder && enterFolder && enterFolder(file.id, file.name)}
                    >
                      {file.name}
                    </span>

                    {/* 公共空间内显示当前文件的可见性权限角标 */}
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
                  <div className="col-span-2 text-gray-400">{formatBytes(file.size)}</div>
                  <div className="col-span-2 text-gray-500">{file.uploadTime}</div>
                  <div className="col-span-2 text-right opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-2">
                    <button 
                      onClick={() => {
                        const virtualPath = file.virtualPath || file.name;
                        window.open(api.files.getDownloadUrl(virtualPath, isInPublicSpace), '_blank');
                      }} 
                      className="text-blue-400 hover:text-blue-300" 
                      title="下载文件"
                    >
                      <Download size={14} />
                    </button>

                    {/* 在公共空间下，允许作者或管理员配置共享权限 */}
                    {isInPublicSpace && file.id !== 'folder_public_root' && (file.ownerId === currentUser?.id || currentUser?.role === 'admin') && (
                      <button
                        onClick={() => setShareModal({
                          isOpen: true,
                          targetIds: [file.id],
                          titleText: file.name,
                          sharedWith: file.sharedWith || []
                        })}
                        className={`hover:text-blue-400 ${file.sharedWith && file.sharedWith.length > 0 ? 'text-blue-400' : 'text-gray-400'}`}
                        title="设置共享权限（仅自己 / 指定用户 / 所有人及访客可见）"
                      >
                        <Share2 size={13} />
                      </button>
                    )}

                    {/* 非系统根目录允许重命名与剪切 */}
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
                          onClick={() => setClipboard({ id: file.id, action: 'cut' })}
                          className={`hover:text-blue-400 ${clipboard?.id === file.id ? 'text-blue-400 animate-pulse' : 'text-gray-400'}`}
                          title="剪切"
                        >
                          <Scissors size={13} />
                        </button>
                      </>
                    )}

                    {/* 删除按钮：管理员与普通用户均开放（系统根目录禁止删除） */}
                    {currentUser?.role !== 'guest' && file.id !== 'folder_public_root' && (
                      <button
                        onClick={() => deleteFile && deleteFile(file.id, { name: currentUser!.name, username: currentUser!.username })}
                        className="text-red-400 hover:text-red-300"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 新建文件夹模态弹窗 */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#2a2d35] rounded-lg p-5 w-88 shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-gray-200">新建文件夹</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <input 
              type="text" autoFocus value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="请输入文件夹名称"
              className="w-full bg-[#1e2128] border border-gray-600 rounded px-3 py-2 mb-4 text-xs text-gray-200 focus:outline-none focus:border-blue-400"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 rounded text-xs text-gray-400 hover:bg-[#323640] transition-colors">取消</button>
              <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-xs transition-colors">
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renameModal.isOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#2a2d35] rounded-lg p-5 w-88 shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-gray-200">重命名项目</h3>
              <button onClick={() => setRenameModal({ isOpen: false, id: '', oldName: '' })} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <input 
              type="text" autoFocus value={renamedName}
              onChange={(e) => setRenamedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renamedName.trim()) {
                  renameNode(renameModal.id, renamedName.trim(), { name: currentUser!.name, username: currentUser!.username });
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
                    renameNode(renameModal.id, renamedName.trim(), { name: currentUser!.name, username: currentUser!.username });
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
              <button onClick={() => setShareModal(prev => ({ ...prev, isOpen: false }))} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3 truncate">
              目标: <span className="text-gray-200 font-medium">{shareModal.titleText}</span>
            </p>

            {/* 开关 1：所有人可见（开启后公共访客与所有用户均可见） */}
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
                <Globe size={16} className={shareModal.sharedWith.includes('ALL') ? 'text-green-400' : 'text-gray-500'} />
                <div>
                  <div className="text-xs font-semibold">所有人可见 (含公共访客)</div>
                  <div className="text-[10px] text-gray-400">开启后访客及全体成员均可查看与下载</div>
                </div>
              </div>
              <span className="text-xs font-bold">
                {shareModal.sharedWith.includes('ALL') ? '✓ 已开启' : '未开启'}
              </span>
            </div>

            {/* 列表 2：指定内部用户可见 */}
            <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
              <span>或指定特定成员可见 (全不选则仅自己可见):</span>
              {shareModal.sharedWith.length > 0 && (
                <button
                  onClick={() => setShareModal(prev => ({ ...prev, sharedWith: [] }))}
                  className="text-red-400 hover:underline"
                >
                  设为仅自己可见
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto mb-4 p-2 bg-[#1e2128] rounded-xl border border-gray-700/80">
              {shareableUsers.filter(u => u.id !== currentUser?.id).map((u) => {
                const isAll = shareModal.sharedWith.includes('ALL');
                const isSelected = isAll || shareModal.sharedWith.includes(u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      setShareModal(prev => {
                        const withoutAll = prev.sharedWith.filter(id => id !== 'ALL');
                        const next = withoutAll.includes(u.id)
                          ? withoutAll.filter(id => id !== u.id)
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
                onClick={() => setShareModal(prev => ({ ...prev, isOpen: false }))}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-[#1e2128]"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await updateFileShare(shareModal.targetIds, shareModal.sharedWith);
                  setSelectedFileIds([]);
                  setShareModal(prev => ({ ...prev, isOpen: false }));
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
        <div className="absolute inset-y-0 right-0 w-96 bg-[#1a1c23] border-l border-gray-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
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
                    <span className="font-semibold text-gray-200">{log.operatorName} (@{log.operatorUsername})</span>
                    <span className="text-[10px] text-gray-500">{log.time}</span>
                  </div>
                  <div className="text-gray-300 flex items-center gap-1.5">
                    <span className="text-blue-400 font-medium">[{log.action}]</span>
                    <span className="truncate">{log.targetName}</span>
                  </div>
                  {log.details && (
                    <div className="text-[11px] text-gray-500">{log.details}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}