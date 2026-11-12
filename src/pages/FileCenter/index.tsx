// src/pages/FileCenter/index.tsx
import { useState, useRef, useEffect } from 'react';
import { api } from '../../utils/api';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { 
  LogOut, UploadCloud, FolderPlus, Download, Trash2, Home, 
  ChevronRight, X, CheckCircle2, Clock, HardDrive, FileUp, FolderUp,
  Edit2, Scissors, ClipboardPaste, Share2, ClipboardList,
  PieChart as PieChartIcon
} from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { useAuthStore } from '../../store/useAuthStore';

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
  const { currentUser, users, logout } = useAuthStore();
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

  // 传输队列隔离：仅筛选当前登录用户的传输任务
  const myTasks = (tasks || []).filter(t => t.userId === currentUser?.id);

  // 定向共享设置弹窗状态
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; fileId: string; fileName: string; sharedWith: string[] }>({
    isOpen: false,
    fileId: '',
    fileName: '',
    sharedWith: []
  });

  // 获取当前所在层级
  const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
  const currentParentNode = files.find(f => f.id === currentFolderId);
  const isInPublicSpace = currentFolderId === 'folder_public_root' || !!currentParentNode?.isPublicFolder;

  // === 核心逻辑：数据隔离与可见性过滤 ===
  const displayFiles = files.filter((file) => {
    // 1. 必须处于当前层级
    if (file.parentId !== currentFolderId) return false;

    // 2. 如果在公共空间下：
    if (isInPublicSpace || file.id === 'folder_public_root') {
      if (file.id === 'folder_public_root') return true; // 公共根目录所有人可见
      if (currentUser?.role === 'admin') return true;    // 管理员在公共空间穿透可见
      if (file.ownerId === currentUser?.id) return true; // 上传者本人可见
      // 如果未配置定向共享，则所有人可见；否则仅列表内的用户可见
      if (!file.sharedWith || file.sharedWith.length === 0) return true;
      return file.sharedWith.includes(currentUser?.id || '');
    }

    // 3. 如果在私有个人空间下：实现严格隔离（管理员也只能看到自己的私有文件）
    return file.ownerId === currentUser?.id;
  });

  // 当路径切换或组件初次挂载时，从云端拉取真实文件与审计日志
  useEffect(() => {
    if (currentUser && currentUser.role !== 'guest') {
      const virtualSubPath = currentFolderId && currentFolderId !== 'folder_public_root'
        ? currentFolderId.replace(/^(pub_|pri_)/, '')
        : '';
      loadServerFiles(isInPublicSpace, virtualSubPath);
      if (currentUser.role === 'admin') loadAuditLogs();
    }
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
  
  // 待上传文件暂存队列
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 计算暂存队列指标
  const totalStagedBytes = stagedFiles.reduce((acc, f) => acc + f.size, 0);

  // 递归解析拖入的文件夹或文件
  const scanEntry = async (entry: any): Promise<File[]> => {
    if (!entry) return [];
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file: File) => resolve([file]));
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      return new Promise((resolve) => {
        dirReader.readEntries(async (entries: any[]) => {
          const results = await Promise.all(entries.map((e) => scanEntry(e)));
          resolve(results.flat());
        });
      });
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
      const filesArray = await Promise.all(entries.map(scanEntry));
      const flatFiles = filesArray.flat();
      setStagedFiles((prev) => [...prev, ...flatFiles]);
    }
  };

  // 文件/文件夹选择监听
  const handleNativeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setStagedFiles((prev) => [...prev, ...selected]);
    }
  };

  // 触发真实/模拟上传
  const handleStartUpload = async () => {
    if (stagedFiles.length === 0 || !currentUser) return;

    const virtualParent = currentFolderId && currentFolderId !== 'folder_public_root'
      ? currentFolderId.replace(/^(pub_|pri_)/, '')
      : '';

    // 遍历待上传文件列表执行真实切片上传
    stagedFiles.forEach(async (file) => {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      addTask({
        id: taskId,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading',
        userId: currentUser.id
      });

      try {
        await api.files.uploadFileWithChunks(
          file,
          virtualParent,
          isInPublicSpace,
          (percent) => updateTaskProgress(taskId, percent)
        );
        updateTaskProgress(taskId, 100, 'success');
        // 成功后重新拉取当前目录，获取服务器落盘后的真实节点
        loadServerFiles(isInPublicSpace, virtualParent);
      } catch (err) {
        console.error('上传失败', err);
        updateTaskProgress(taskId, 0, 'error');
        alert(`文件 [${file.name}] 上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    });

    setStagedFiles([]);
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

      {/* 顶部导航 */}
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-blue-400">文件管理中心</h1>
        <button
          onClick={logout}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm transition-colors"
        >
          <LogOut size={16} /> 退出登录
        </button>
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

            {/* 待上传暂存信息看板 */}
            {stagedFiles.length > 0 && (
              <div className="bg-[#1e2128] border border-blue-500/30 rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-blue-400">待上传队列 ({stagedFiles.length} 项)</span>
                  <button 
                    onClick={() => setStagedFiles([])}
                    className="text-xs text-gray-400 hover:text-red-400"
                  >
                    清空
                  </button>
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
                  {currentUser?.role !== 'guest' ? `确认开始传送 (${stagedFiles.length} 个项目)` : '只读访客无上传权限'}
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

          <div className="grid grid-cols-12 gap-4 text-xs text-gray-400 font-semibold border-b border-gray-700 pb-2 mb-2">
            <div className="col-span-6">文件名</div>
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
                    {file.isFolder ? <span className="text-yellow-500 text-sm">📁</span> : <span className="text-blue-400 text-sm">📄</span>}
                    <span 
                      className={`truncate ${file.isFolder ? 'cursor-pointer hover:text-blue-400 hover:underline font-medium' : ''}`} 
                      onClick={() => file.isFolder && enterFolder && enterFolder(file.id, file.name)}
                    >
                      {file.name}
                    </span>
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

                    {/* 在公共空间下，允许作者或管理员配置指定共享 */}
                    {isInPublicSpace && file.id !== 'folder_public_root' && (file.ownerId === currentUser?.id || currentUser?.role === 'admin') && (
                      <button
                        onClick={() => setShareModal({
                          isOpen: true,
                          fileId: file.id,
                          fileName: file.name,
                          sharedWith: file.sharedWith || []
                        })}
                        className={`hover:text-blue-400 ${file.sharedWith && file.sharedWith.length > 0 ? 'text-blue-400' : 'text-gray-400'}`}
                        title={file.sharedWith && file.sharedWith.length > 0 ? `已指定 ${file.sharedWith.length} 人可见` : '全员可见 (点击指定共享)'}
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

      {/* 定向共享人员勾选弹窗 */}
      {shareModal.isOpen && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-1.5">
                <Share2 size={16} className="text-blue-400" />
                指定共享对象
              </h3>
              <button onClick={() => setShareModal(prev => ({ ...prev, isOpen: false }))} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3 truncate">
              文件: <span className="text-gray-200 font-medium">{shareModal.fileName}</span>
            </p>
            <p className="text-[11px] text-gray-500 mb-3">
              勾选指定用户后，非目标用户将无法在公共空间看到此文件（管理员及创建者始终可见）。若全不勾选则全员可见。
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto mb-4 p-2 bg-[#1e2128] rounded-xl border border-gray-700/80">
              {(users || []).filter(u => u.id !== currentUser?.id).map((u) => {
                const isSelected = shareModal.sharedWith.includes(u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      setShareModal(prev => ({
                        ...prev,
                        sharedWith: isSelected ? prev.sharedWith.filter(id => id !== u.id) : [...prev.sharedWith, u.id]
                      }));
                    }}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-[#2b2f3a] cursor-pointer text-xs"
                  >
                    <div>
                      <div className="font-medium text-gray-200">{u.name}</div>
                      <div className="text-[10px] text-gray-500">@{u.username}</div>
                    </div>
                    <span className={`text-xs ${isSelected ? 'text-blue-400 font-bold' : 'text-gray-600'}`}>
                      {isSelected ? '✓ 已共享' : '+ 共享'}
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
                onClick={() => {
                  updateFileShare(shareModal.fileId, shareModal.sharedWith);
                  setShareModal(prev => ({ ...prev, isOpen: false }));
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium"
              >
                确认权限变更
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