// src/store/useFileStore.ts
import { create } from 'zustand';

export interface FileNode {
  id: string;
  name: string;
  size: number | null; 
  isFolder: boolean;
  uploadTime: string;
  parentId: string | null; 
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
  
  enterFolder: (id: string, name: string) => void;
  goToBreadcrumb: (index: number) => void;
  deleteFile: (id: string) => void;
  createFolder: (name: string, parentId: string | null) => void; 
  addFile: (file: FileNode) => void;
  addTask: (task: UploadTask) => void;
  updateTaskProgress: (id: string, progress: number, status?: UploadTask['status']) => void;
  removeTask: (id: string) => void;

  // 新增：剪切/移动与重命名接口
  clipboard: { id: string; action: 'cut' | 'copy' } | null;
  setClipboard: (item: { id: string; action: 'cut' | 'copy' } | null) => void;
  renameNode: (id: string, newName: string) => void;
  moveNode: (id: string, targetParentId: string | null) => void;
}

const initialFiles: FileNode[] = [
  { id: '1', name: '南方电网', size: null, isFolder: true, uploadTime: '2026-11-10 09:00', parentId: null },
  { id: '2', name: 'APAConsole_2026.1.0.docx', size: 15414000, isFolder: false, uploadTime: '2026-11-09 15:49', parentId: null }
];

export const useFileStore = create<FileStore>((set) => ({
  files: initialFiles,
  currentPath: [],
  tasks: [],

  enterFolder: (id, name) => 
    set((state) => ({ currentPath: [...state.currentPath, { id, name }] })),

  goToBreadcrumb: (index) =>
    set((state) => ({ currentPath: index === -1 ? [] : state.currentPath.slice(0, index + 1) })),

  deleteFile: (id) =>
    set((state) => {
      // 级联收集当前节点及其所有深层子节点 ID
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

      return { files: state.files.filter((f) => !idsToDelete.has(f.id)) };
    }),

  createFolder: (name, parentId) =>
    set((state) => {
      const newFolder: FileNode = {
        id: Date.now().toString(),
        name: name,
        size: null,
        isFolder: true,
        uploadTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        parentId: parentId,
      };
      return { files: [...state.files, newFolder] };
    }),

  addFile: (file) => set((state) => ({ files: [...state.files, file] })),
  
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  
  updateTaskProgress: (id, progress, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => 
        t.id === id ? { ...t, progress, status: status || t.status } : t
      )
    })),
    
  removeTask: (id) => set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) })),

  // 新增：剪贴板与移动/重命名实现
  clipboard: null,
  setClipboard: (item) => set({ clipboard: item }),

  renameNode: (id, newName) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, name: newName } : f))
    })),

  moveNode: (id, targetParentId) =>
    set((state) => {
      // 防呆校验：禁止把文件夹移动到自身层级
      if (id === targetParentId) return state;
      return {
        files: state.files.map((f) => (f.id === id ? { ...f, parentId: targetParentId } : f)),
        clipboard: null // 粘贴移动完成后清空剪贴板
      };
    })
}));