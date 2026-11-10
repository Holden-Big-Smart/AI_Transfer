// src/store/useFileStore.ts
import { create } from 'zustand';

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
  setClipboard: (item: { id: string; action: 'cut' | 'copy' } | null) => void;
  addTask: (task: UploadTask) => void;
  updateTaskProgress: (id: string, progress: number, status?: UploadTask['status']) => void;
  removeTask: (id: string) => void;
}

// 初始数据：包含一个常驻的系统公共共享根目录
const initialFiles: FileNode[] = [
  {
    id: 'folder_public_root',
    name: '📂 公共共享空间',
    size: null,
    isFolder: true,
    uploadTime: '2026-11-10 12:00',
    parentId: null,
    ownerId: 'system',
    isPublicFolder: true,
  },
  {
    id: 'file_admin_sample',
    name: '管理员私有备忘录.docx',
    size: 15414000,
    isFolder: false,
    uploadTime: '2026-11-09 15:49',
    parentId: null,
    ownerId: 'u_admin',
    isPublicFolder: false,
  }
];

export const useFileStore = create<FileStore>((set) => ({
  files: initialFiles,
  currentPath: [],
  tasks: [],
  clipboard: null,
  operationLogs: [],

  enterFolder: (id, name) => 
    set((state) => ({ currentPath: [...state.currentPath, { id, name }] })),

  goToBreadcrumb: (index) =>
    set((state) => ({ currentPath: index === -1 ? [] : state.currentPath.slice(0, index + 1) })),

  createFolder: (name, parentId, ownerId, isPublic, operator) =>
    set((state) => {
      const newFolder: FileNode = {
        id: `folder_${Date.now()}`,
        name,
        size: null,
        isFolder: true,
        uploadTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        parentId,
        ownerId,
        isPublicFolder: isPublic,
      };

      const newLogs: OperationLog[] = isPublic && operator ? [
        {
          id: `log_${Date.now()}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          operatorName: operator.name,
          operatorUsername: operator.username,
          action: '创建文件夹',
          targetName: name,
          details: '在公共共享空间新建目录'
        },
        ...state.operationLogs
      ] : state.operationLogs;

      return { files: [...state.files, newFolder], operationLogs: newLogs };
    }),

  addFile: (file, operator) =>
    set((state) => {
      const newLogs: OperationLog[] = file.isPublicFolder && operator ? [
        {
          id: `log_${Date.now()}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          operatorName: operator.name,
          operatorUsername: operator.username,
          action: '上传',
          targetName: file.name,
          details: file.sharedWith?.length ? `定向共享给 ${file.sharedWith.length} 人` : '全员可见'
        },
        ...state.operationLogs
      ] : state.operationLogs;

      return { files: [...state.files, file], operationLogs: newLogs };
    }),

  deleteFile: (id, operator) =>
    set((state) => {
      const target = state.files.find(f => f.id === id);
      if (!target || target.id === 'folder_public_root') return state; // 系统根目录禁止删除

      const idsToDelete = new Set<string>([id]);
      let hasNewAddition = true;
      while (hasNewAddition) {
        hasNewAddition = false;
        for (const file of state.files) {
          if (file.parentId && idsToDelete.has(file.parentId) && !idsToDelete.has(file.id)) {
            idsToDelete.add(file.id);
            hasNewAddition = true;
          }
        }
      }

      const newLogs: OperationLog[] = target.isPublicFolder && operator ? [
        {
          id: `log_${Date.now()}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          operatorName: operator.name,
          operatorUsername: operator.username,
          action: '删除',
          targetName: target.name,
          details: `级联移除了 ${idsToDelete.size} 个节点`
        },
        ...state.operationLogs
      ] : state.operationLogs;

      return {
        files: state.files.filter((f) => !idsToDelete.has(f.id)),
        operationLogs: newLogs
      };
    }),

  renameNode: (id, newName, operator) =>
    set((state) => {
      const target = state.files.find(f => f.id === id);
      if (!target || target.id === 'folder_public_root') return state;

      const newLogs: OperationLog[] = target.isPublicFolder && operator ? [
        {
          id: `log_${Date.now()}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          operatorName: operator.name,
          operatorUsername: operator.username,
          action: '重命名',
          targetName: `${target.name} ➔ ${newName}`,
        },
        ...state.operationLogs
      ] : state.operationLogs;

      return {
        files: state.files.map((f) => (f.id === id ? { ...f, name: newName } : f)),
        operationLogs: newLogs
      };
    }),

  moveNode: (id, targetParentId, operator) =>
    set((state) => {
      const target = state.files.find(f => f.id === id);
      if (!target || id === targetParentId) return state;

      const targetParent = state.files.find(f => f.id === targetParentId);
      const isNowPublic = targetParent ? !!targetParent.isPublicFolder : false;

      const newLogs: OperationLog[] = (target.isPublicFolder || isNowPublic) && operator ? [
        {
          id: `log_${Date.now()}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          operatorName: operator.name,
          operatorUsername: operator.username,
          action: '移动',
          targetName: target.name,
          details: `移入目标目录 [${targetParent?.name || '根目录'}]`
        },
        ...state.operationLogs
      ] : state.operationLogs;

      return {
        files: state.files.map((f) => (f.id === id ? { ...f, parentId: targetParentId, isPublicFolder: isNowPublic } : f)),
        clipboard: null,
        operationLogs: newLogs
      };
    }),

  updateFileShare: (id, sharedWithUserIds) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, sharedWith: sharedWithUserIds } : f))
    })),

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
