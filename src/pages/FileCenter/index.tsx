// src/pages/FileCenter/index.tsx
import { useState, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { 
  LogOut, UploadCloud, FolderPlus, Download, Trash2, Home, 
  ChevronRight, X, CheckCircle2, Clock, HardDrive, FileUp, FolderUp,
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
  const { currentUser } = useAuthStore();
  const { 
    files = [], 
    currentPath = [], 
    tasks = [], 
    enterFolder, 
    goToBreadcrumb, 
    deleteFile, 
    createFolder, 
    addFile, 
    addTask, 
    updateTaskProgress, 
    removeTask 
  } = useFileStore();
  
  const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
  const displayFiles = (files || []).filter(f => f.parentId === currentFolderId);

  // 模态弹窗与输入引用
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
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
  const handleStartUpload = () => {
    if (stagedFiles.length === 0) return;

    stagedFiles.forEach((file) => {
      const taskId = `task_${Date.now()}_${Math.random()}`;
      
      if (addTask) {
        addTask({
          id: taskId,
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'uploading'
        });
      }

      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += Math.floor(Math.random() * 20) + 15;
        if (currentProgress >= 100) {
          currentProgress = 100;
          clearInterval(interval);
          
          if (updateTaskProgress) {
            updateTaskProgress(taskId, 100, 'success');
          }
          
          if (addFile) {
            addFile({
              id: `file_${Date.now()}_${Math.random()}`,
              name: file.name,
              size: file.size,
              isFolder: false,
              uploadTime: new Date().toLocaleString('zh-CN', { hour12: false }),
              parentId: currentFolderId,
            });
          }
        } else {
          if (updateTaskProgress) {
            updateTaskProgress(taskId, currentProgress);
          }
        }
      }, 400);
    });

    // 提交上传后清空暂存区
    setStagedFiles([]);
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim() && createFolder) {
      createFolder(newFolderName.trim(), currentFolderId);
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
        <button className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm transition-colors">
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
                  disabled={!currentUser.canUpload}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 rounded text-xs transition-colors shadow-md"
                >
                  {currentUser.canUpload ? `确认开始传送 (${stagedFiles.length} 个项目)` : '只读访客无上传权限'}
                </button>
              </div>
            )}
          </div>

          {/* 实时传输队列看板 */}
          {(tasks || []).length > 0 && (
            <div className="bg-[#2a2d35] p-5 rounded-lg shadow-lg flex-1 overflow-y-auto">
              <div className="flex justify-between items-center mb-3 border-b border-gray-600 pb-2">
                <h2 className="text-base font-semibold">传输队列</h2>
                <span className="text-xs text-blue-400">{(tasks || []).filter(t => t.status === 'uploading').length} 个进行中</span>
              </div>
              <div className="flex flex-col gap-3">
                {(tasks || []).map(task => (
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
              <button 
                onClick={() => goToBreadcrumb && goToBreadcrumb(-1)} 
                className={`flex items-center gap-1 hover:text-blue-400 ${currentPath.length === 0 ? 'text-blue-400' : ''}`}
              >
                <Home size={16} /> 根目录
              </button>
              {(currentPath || []).map((node, index) => (
                <div key={node.id} className="flex items-center">
                  <ChevronRight size={16} className="mx-1 text-gray-500" />
                  <button 
                    onClick={() => goToBreadcrumb && goToBreadcrumb(index)} 
                    className={`hover:text-blue-400 ${index === currentPath.length - 1 ? 'text-blue-400' : ''}`}
                  >
                    {node.name}
                  </button>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs bg-[#323640] px-3 py-1.5 rounded transition-colors"
            >
              <FolderPlus size={14} /> 新建文件夹
            </button>
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
              displayFiles.map((file) => (
                <div key={file.id} className="grid grid-cols-12 gap-4 items-center text-xs py-3 border-b border-gray-700/60 hover:bg-[#323640] transition-colors group">
                  <div className="col-span-6 flex items-center gap-2 text-gray-300 truncate pr-2">
                    {file.isFolder ? <span className="text-yellow-500">📁</span> : <span className="text-blue-400">📄</span>}
                    <span 
                      className={`truncate ${file.isFolder ? 'cursor-pointer hover:text-blue-400 hover:underline font-medium' : ''}`} 
                      onClick={() => file.isFolder && enterFolder && enterFolder(file.id, file.name)}
                    >
                      {file.name}
                    </span>
                  </div>
                  <div className="col-span-2 text-gray-400">{formatBytes(file.size)}</div>
                  <div className="col-span-2 text-gray-500">{file.uploadTime}</div>
                  <div className="col-span-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="text-blue-400 hover:text-blue-300 mr-3" title="下载"><Download size={14} className="inline" /></button>
                    {currentUser.canDelete && (
                      <button onClick={() => deleteFile && deleteFile(file.id)} className="text-red-400 hover:text-red-300" title="删除"><Trash2 size={14} className="inline" /></button>
                    )}
                  </div>
                </div>
              ))
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
    </div>
  );
}