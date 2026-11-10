// src/store/useFileStore.ts
import { create } from 'zustand';
import { api } from '../utils/api';

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
  moveNode: (id: string, targetParentId: string | null, operator?: { name: string; username: string }) => void;
  updateFileShare: (id: string, sharedWithUserIds: string[]) => void; // 新增：更新指定共享
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

  moveNode: (id, targetParentId) => {
    const target = get().files.find(f => f.id === id);
    if (!target) return;

    const sourcePath = target.virtualPath || target.name;
    const targetPath = targetParentId && targetParentId !== 'folder_public_root'
      ? targetParentId.replace(/^(pub_|pri_)/, '')
      : '';
    const isPublic = !!target.isPublicFolder;

    api.files.move(sourcePath, targetPath, isPublic).then(() => {
      set((state) => ({
        files: state.files.map((f) => (f.id === id ? { ...f, parentId: targetParentId } : f)),
        clipboard: null
      }));
    });
  },

  updateFileShare: (id, sharedWithUserIds) => {
    const target = get().files.find(f => f.id === id);
    if (!target) return;
    const virtualPath = target.virtualPath || target.name;

    api.files.setShare(virtualPath, sharedWithUserIds).then(() => {
      set((state) => ({
        files: state.files.map((f) => (f.id === id ? { ...f, sharedWith: sharedWithUserIds } : f))
      }));
    });
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
