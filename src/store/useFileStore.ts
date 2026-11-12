// src/store/useFileStore.ts
import { create } from 'zustand';
import { api, ApiError } from '../utils/api';

export interface FileNode {
  id: string;
  name: string;
  size: number | null; 
  isFolder: boolean;
  uploadTime: string;
  parentId: string | null; 
  ownerId: string;            // 归属者用户ID（'system' 为系统内置）
  isPublicFolder?: boolean;   // 是否属于公共空间分支
  sharedWith?: string[];      // 定向共享列表（用户ID数组，为空则公共内全员可见）
  virtualPath?: string;       // 服务端真实虚拟路径
}

// 新增：操作审计日志接口
export interface OperationLog {
  id: string;
  time: string;
  operatorName: string;
  operatorUsername: string;
  action: '上传' | '删除' | '重命名' | '移动' | '创建文件夹';
  targetName: string;
  details?: string;
}

export interface PathNode {
  id: string;
  name: string;
}

export interface UploadTask {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  userId?: string; // 新增：标记任务的发起用户 ID
}

export interface FileStore {
  files: FileNode[];
  currentPath: PathNode[];
  tasks: UploadTask[];
  clipboard: { id: string; action: 'cut' | 'copy' } | null;
  operationLogs: OperationLog[]; // 新增：日志队列

  enterFolder: (id: string, name: string) => void;
  goToBreadcrumb: (index: number) => void;
  deleteFile: (id: string, operator?: { name: string; username: string }) => void;
  createFolder: (name: string, parentId: string | null, ownerId: string, isPublic?: boolean, operator?: { name: string; username: string }) => void;
  addFile: (file: FileNode, operator?: { name: string; username: string }) => void;
  renameNode: (id: string, newName: string, operator?: { name: string; username: string }) => void;
  moveNode: (id: string, targetParentId: string | null, operator?: { name: string; username: string }) => Promise<void>;
  updateFileShare: (id: string, sharedWithUserIds: string[]) => Promise<void>; // 新增：更新指定共享
  loadServerFiles: (isPublic: boolean, subPath?: string) => Promise<void>;
  loadAuditLogs: () => Promise<void>;
  setClipboard: (item: { id: string; action: 'cut' | 'copy' } | null) => void;
  addTask: (task: UploadTask) => void;
  updateTaskProgress: (id: string, progress: number, status?: UploadTask['status']) => void;
  removeTask: (id: string) => void;
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: [
    {
      id: 'folder_public_root',
      name: '📂 公共共享空间',
      size: null,
      isFolder: true,
      uploadTime: '系统内置',
      parentId: null,
      ownerId: 'system',
      isPublicFolder: true
    }
  ],
  currentPath: [],
  tasks: [],
  clipboard: null,
  operationLogs: [],

  enterFolder: (id, name) => 
    set((state) => ({ currentPath: [...state.currentPath, { id, name }] })),

  goToBreadcrumb: (index) =>
    set((state) => ({ currentPath: index === -1 ? [] : state.currentPath.slice(0, index + 1) })),

  loadServerFiles: async (isPublic, subPath = '') => {
    try {
      const serverNodes = await api.files.list(isPublic, subPath);
      set((state) => {
        // 保留公共根节点，把服务端获取的真实节点并入
        const filtered = state.files.filter(f => f.id === 'folder_public_root' || f.parentId !== (subPath ? (isPublic ? `pub_${subPath}` : `pri_${subPath}`) : (isPublic ? 'folder_public_root' : null)));
        return { files: [...filtered, ...serverNodes] };
      });
    } catch (err) {
      console.error('同步服务器文件失败', err);
    }
  },

  loadAuditLogs: async () => {
    try {
      const logs = await api.audit.getLogs();
      const mapped = logs.map((l: Record<string, never> & {
        id: string; timestamp: string; operator_name: string;
        operator_username: string; action: OperationLog['action'];
        target_name: string; details?: string;
      }) => ({
        id: l.id,
        time: l.timestamp,
        operatorName: l.operator_name,
        operatorUsername: l.operator_username,
        action: l.action,
        targetName: l.target_name,
        details: l.details
      }));
      set({ operationLogs: mapped });
    } catch (err) {
      console.error('获取审计日志失败', err);
    }
  },

  createFolder: (name, parentId, _ownerId, isPublic) => {
    // 乐观更新并在后台请求服务器
    const virtualParent = parentId && parentId !== 'folder_public_root' ? parentId.replace(/^(pub_|pri_)/, '') : '';
    api.files.createFolder(name, virtualParent, !!isPublic).then(() => {
      get().loadServerFiles(!!isPublic, virtualParent);
    });
  },

  addFile: (file) => {
    set((state) => ({ files: [...state.files, file] }));
  },

  deleteFile: (id) => {
    const target = get().files.find(f => f.id === id);
    if (!target || target.id === 'folder_public_root') return;

    const virtualPath = target.virtualPath || target.name;
    const isPublic = !!target.isPublicFolder;

    api.files.delete(virtualPath, isPublic).then(() => {
      set((state) => ({ files: state.files.filter((f) => f.id !== id) }));
    });
  },

  renameNode: (id, newName) => {
    const target = get().files.find(f => f.id === id);
    if (!target) return;

    const virtualPath = target.virtualPath || target.name;
    const isPublic = !!target.isPublicFolder;

    api.files.rename(virtualPath, newName, isPublic).then(() => {
      set((state) => ({
        files: state.files.map((f) => (f.id === id ? { ...f, name: newName } : f))
      }));
    });
  },

  moveNode: async (id, targetParentId) => {
    console.log('\n========== [DEBUG: 前端移动逻辑开始] ==========');
    console.log('1. 传入参数:', { id, targetParentId });

    const state = get();
    const sourceNode = state.files.find(f => f.id === id);
    if (!sourceNode) {
      console.error('-> 错误: 找不到源节点数据');
      return;
    }

    // 1. 防呆检测：禁止将文件夹移入其自身层级
    if (targetParentId) {
      let currentAncestor: FileNode | undefined = state.files.find(f => f.id === targetParentId);
      while (currentAncestor) {
        if (currentAncestor.id === id) {
          alert('操作无效：不能将文件夹移动到其自身的子文件夹中！');
          return;
        }
        currentAncestor = state.files.find(f => f.id === currentAncestor?.parentId);
      }
    }

    // 2. 利用面包屑动态计算当前所处目录的基础路径 (Base Path)
    const currentPathNames = state.currentPath
      .filter(p => p.id !== 'folder_public_root')
      .map(p => p.name);
    const baseVirtualPath = currentPathNames.join('/');

    // 准确的源文件虚拟路径
    const sourceVirtualPath = baseVirtualPath
      ? `${baseVirtualPath}/${sourceNode.name}`
      : sourceNode.name;

    // 3. 计算目标虚拟路径
    let targetVirtualPath = '';
    let isTargetPublic = sourceNode.isPublicFolder || false;

    if (targetParentId === 'folder_public_root') {
      targetVirtualPath = '';
      isTargetPublic = true;
    } else if (targetParentId === null) {
      // 拖到了面包屑的“根目录”
      targetVirtualPath = '';
    } else {
      // 目标可能是：A) 面包屑上的祖先目录，B) 当前列表里的子目录
      const breadcrumbIndex = state.currentPath.findIndex(p => p.id === targetParentId);
      if (breadcrumbIndex !== -1) {
        // 拖拽到了面包屑的某一层
        const targetPathNames = state.currentPath
          .slice(0, breadcrumbIndex + 1)
          .filter(p => p.id !== 'folder_public_root')
          .map(p => p.name);
        targetVirtualPath = targetPathNames.join('/');
        isTargetPublic = state.currentPath[0]?.id === 'folder_public_root';
      } else {
        // 拖拽到了当前列表里的某个文件夹
        const targetNode = state.files.find(f => f.id === targetParentId);
        if (targetNode) {
          targetVirtualPath = baseVirtualPath
            ? `${baseVirtualPath}/${targetNode.name}`
            : targetNode.name;
          isTargetPublic = !!targetNode.isPublicFolder;
        }
      }
    }

    const requestPayload = {
      source_virtual_path: sourceVirtualPath,
      target_virtual_path: targetVirtualPath,
      source_is_public: !!sourceNode.isPublicFolder,
      target_is_public: isTargetPublic
    };

    console.log('2. 组装好的 Frontend Payload:', requestPayload);

    // ==== 核心修复：【乐观更新】瞬间修改前端画面，彻底消灭视觉延迟 ====
    set(state => ({
      files: state.files.map(f => f.id === id ? { ...f, parentId: targetParentId, isPublicFolder: isTargetPublic } : f),
      clipboard: null
    }));

    const currentFolderId = state.currentPath.length > 0
      ? state.currentPath[state.currentPath.length - 1].id
      : null;
    const isInPublicSpace = currentFolderId === 'folder_public_root' || !!state.files.find(f => f.id === currentFolderId)?.isPublicFolder;
    const virtualSubPath = currentFolderId && currentFolderId !== 'folder_public_root'
      ? currentFolderId.replace(/^(pub_|pri_)/, '')
      : '';

    try {
      console.log('3. 正在调用 API...');
      await api.files.move(requestPayload);
      console.log('4. API 调用成功！');

      // 移动成功后，后端已落盘，前端静默拉取对齐数据
      await state.loadServerFiles(isInPublicSpace, virtualSubPath);
      console.log('========== [DEBUG: 前端逻辑结束] ==========\n');
    } catch (err) {
      console.error('========== [DEBUG: 捕获到后端报错] ==========');

      // 悲观回滚画面
      await state.loadServerFiles(isInPublicSpace, virtualSubPath);

      // 提取核心数据用于暴力弹窗
      const backendError = err instanceof ApiError ? (err.detail || err.message) : (err instanceof Error ? err.message : String(err));
      const payloadStr = JSON.stringify(requestPayload, null, 2);

      // 直接用系统原生 alert 把数据贴在屏幕正中间
      alert(`🚨 【移动失败拦截】\n\n【后端物理路径返回】:\n${backendError}\n\n====================\n\n【前端实际发送的参数】:\n${payloadStr}`);
    }
  },

  updateFileShare: async (id, sharedWithUserIds) => {
    const state = get();
    const targetFile = state.files.find(f => f.id === id);
    if (!targetFile) return;

    // 虚拟路径解析
    const virtualPath = targetFile.virtualPath || targetFile.name;

    try {
      // 1. 发送真实请求给后端
      await api.files.setShare({
        virtual_path: virtualPath,
        shared_user_ids: sharedWithUserIds
      });

      // 2. 后端成功后，更新前端状态树画面
      set((state) => ({
        files: state.files.map((f) => (f.id === id ? { ...f, sharedWith: sharedWithUserIds } : f))
      }));

      alert('共享权限已更新生效！');
    } catch (err) {
      console.error('更新共享失败:', err);
      const detail = err instanceof ApiError ? err.detail : undefined;
      alert(`更新共享权限失败: ${detail || (err instanceof Error ? err.message : '未知错误')}`);
    }
  },

  setClipboard: (item) => set({ clipboard: item }),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  updateTaskProgress: (id, progress, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, progress, status: status || t.status } : t
      )
    })),
  removeTask: (id) => set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) }))
}));
