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
  ownerId: string;
  isPublicFolder?: boolean;
  sharedWith?: string[];
  virtualPath?: string;
}

export interface OperationLog {
  id: string;
  time: string;
  operatorName: string;
  operatorUsername: string;
  action: '上传' | '删除' | '重命名' | '移动' | '创建文件夹' | '权限变更';
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
  userId?: string;
}

// 剪贴板快照节点（避免跨目录切换后原节点在当前视图被卸载导致无法粘贴）
export interface ClipboardItemNode {
  id: string;
  name: string;
  virtualPath: string;
  isPublicFolder: boolean;
  isFolder: boolean;
}

export interface ClipboardState {
  items: ClipboardItemNode[];
  action: 'cut' | 'copy';
}

export interface FileStore {
  files: FileNode[];
  currentPath: PathNode[];
  tasks: UploadTask[];
  clipboard: ClipboardState | null;
  operationLogs: OperationLog[];

  enterFolder: (id: string, name: string) => void;
  goToBreadcrumb: (index: number) => void;
  deleteFile: (id: string, operator?: { name: string; username: string }) => void;
  batchDeleteFiles: (ids: string[]) => Promise<void>;
  createFolder: (
    name: string,
    parentId: string | null,
    ownerId: string,
    isPublic?: boolean,
    operator?: { name: string; username: string }
  ) => void;
  addFile: (file: FileNode, operator?: { name: string; username: string }) => void;
  renameNode: (id: string, newName: string, operator?: { name: string; username: string }) => void;
  moveNode: (
    ids: string | string[],
    targetParentId: string | null,
    operator?: { name: string; username: string }
  ) => Promise<void>;
  pasteClipboard: (targetParentId: string | null) => Promise<void>;
  updateFileShare: (ids: string | string[], sharedWithUserIds: string[]) => Promise<void>;
  loadServerFiles: (isPublic: boolean, subPath?: string) => Promise<void>;
  loadAuditLogs: () => Promise<void>;
  setClipboard: (item: ClipboardState | null) => void;
  addTask: (task: UploadTask) => void;
  updateTaskProgress: (id: string, progress: number, status?: UploadTask['status']) => void;
  removeTask: (id: string) => void;
}

// 辅助函数：根据目标父节点 ID 解析出后端所需的 target_virtual_path 与 target_is_public
function resolveTargetDestination(
  state: { files: FileNode[]; currentPath: PathNode[] },
  targetParentId: string | null
): { targetVirtualPath: string; isTargetPublic: boolean } {
  const currentPathNames = state.currentPath
    .filter((p) => p.id !== 'folder_public_root')
    .map((p) => p.name);
  const baseVirtualPath = currentPathNames.join('/');

  if (targetParentId === 'folder_public_root') {
    return { targetVirtualPath: '', isTargetPublic: true };
  }
  if (targetParentId === null) {
    // 关键修复：targetParentId 为 null 代表个人空间根目录，强制重置 isTargetPublic 为 false
    return { targetVirtualPath: '', isTargetPublic: false };
  }

  const breadcrumbIndex = state.currentPath.findIndex((p) => p.id === targetParentId);
  if (breadcrumbIndex !== -1) {
    const targetPathNames = state.currentPath
      .slice(0, breadcrumbIndex + 1)
      .filter((p) => p.id !== 'folder_public_root')
      .map((p) => p.name);
    return {
      targetVirtualPath: targetPathNames.join('/'),
      isTargetPublic: state.currentPath[0]?.id === 'folder_public_root'
    };
  }

  const targetNode = state.files.find((f) => f.id === targetParentId);
  if (targetNode) {
    const targetVirtualPath =
      targetNode.virtualPath ||
      (baseVirtualPath ? `${baseVirtualPath}/${targetNode.name}` : targetNode.name);
    return {
      targetVirtualPath,
      isTargetPublic: !!targetNode.isPublicFolder
    };
  }

  return {
    targetVirtualPath: baseVirtualPath,
    isTargetPublic: state.currentPath[0]?.id === 'folder_public_root'
  };
}

function getCurrentFolderContext(state: { files: FileNode[]; currentPath: PathNode[] }) {
  const currentFolderId =
    state.currentPath.length > 0 ? state.currentPath[state.currentPath.length - 1].id : null;
  const isInPublicSpace =
    currentFolderId === 'folder_public_root' ||
    state.currentPath[0]?.id === 'folder_public_root' ||
    !!state.files.find((f) => f.id === currentFolderId)?.isPublicFolder;
  const virtualSubPath =
    currentFolderId && currentFolderId !== 'folder_public_root'
      ? currentFolderId.replace(/^(pub_|pri_)/, '')
      : '';
  return { currentFolderId, isInPublicSpace, virtualSubPath };
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
    set((state) => ({
      currentPath: index === -1 ? [] : state.currentPath.slice(0, index + 1)
    })),

  loadServerFiles: async (isPublic, subPath = '') => {
    try {
      const serverNodes = await api.files.list(isPublic, subPath);
      set((state) => {
        const targetParentId = subPath
          ? isPublic
            ? `pub_${subPath}`
            : `pri_${subPath}`
          : isPublic
          ? 'folder_public_root'
          : null;
        const filtered = state.files.filter(
          (f) => f.id === 'folder_public_root' || f.parentId !== targetParentId
        );
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
    const virtualParent =
      parentId && parentId !== 'folder_public_root'
        ? parentId.replace(/^(pub_|pri_)/, '')
        : '';
    api.files.createFolder(name, virtualParent, !!isPublic).then(() => {
      get().loadServerFiles(!!isPublic, virtualParent);
    });
  },

  addFile: (file) => {
    set((state) => ({ files: [...state.files, file] }));
  },

  deleteFile: (id) => {
    const target = get().files.find((f) => f.id === id);
    if (!target || target.id === 'folder_public_root') return;

    const virtualPath = target.virtualPath || target.name;
    const isPublic = !!target.isPublicFolder;

    api.files.delete(virtualPath, isPublic).then(() => {
      set((state) => ({ files: state.files.filter((f) => f.id !== id) }));
    });
  },

  batchDeleteFiles: async (ids) => {
    const state = get();
    const targets = state.files.filter(
      (f) => ids.includes(f.id) && f.id !== 'folder_public_root'
    );
    if (targets.length === 0) return;

    const isPublic = !!targets[0].isPublicFolder;
    const virtualPaths = targets.map((f) => f.virtualPath || f.name);

    try {
      await api.files.batchDelete(virtualPaths, isPublic);
      const idSet = new Set(ids);
      set((s) => ({
        files: s.files.filter((f) => !idSet.has(f.id))
      }));
      if (isPublic) state.loadAuditLogs();
    } catch (err) {
      alert(`批量删除失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  },

  renameNode: (id, newName) => {
    const target = get().files.find((f) => f.id === id);
    if (!target) return;

    const virtualPath = target.virtualPath || target.name;
    const isPublic = !!target.isPublicFolder;

    api.files
      .rename(virtualPath, newName, isPublic)
      .then(() => {
        const { isInPublicSpace, virtualSubPath } = getCurrentFolderContext(get());
        get().loadServerFiles(isInPublicSpace, virtualSubPath);
      })
      .catch((err) => {
        alert(`重命名失败: ${err instanceof Error ? err.message : '未知错误'}`);
      });
  },

  // 支持单个或批量拖拽移动（含从公共空间拖回根目录）
  moveNode: async (ids, targetParentId) => {
    const state = get();
    const idList = Array.isArray(ids) ? ids : [ids];
    const sourceNodes = state.files.filter(
      (f) => idList.includes(f.id) && f.id !== 'folder_public_root' && f.id !== targetParentId
    );
    if (sourceNodes.length === 0) return;

    const currentPathNames = state.currentPath
      .filter((p) => p.id !== 'folder_public_root')
      .map((p) => p.name);
    const baseVirtualPath = currentPathNames.join('/');

    const sourceVirtualPaths = sourceNodes.map(
      (n) => n.virtualPath || (baseVirtualPath ? `${baseVirtualPath}/${n.name}` : n.name)
    );
    const sourceIsPublic = !!sourceNodes[0].isPublicFolder;

    const { targetVirtualPath, isTargetPublic } = resolveTargetDestination(
      state,
      targetParentId
    );

    const movedIdSet = new Set(sourceNodes.map((n) => n.id));
    set((s) => ({
      files: s.files.map((f) =>
        movedIdSet.has(f.id)
          ? { ...f, parentId: targetParentId, isPublicFolder: isTargetPublic }
          : f
      )
    }));

    const { isInPublicSpace, virtualSubPath } = getCurrentFolderContext(state);

    try {
      await api.files.move({
        source_virtual_paths: sourceVirtualPaths,
        target_virtual_path: targetVirtualPath,
        source_is_public: sourceIsPublic,
        target_is_public: isTargetPublic
      });
      await get().loadServerFiles(isInPublicSpace, virtualSubPath);
      if (sourceIsPublic || isTargetPublic) get().loadAuditLogs();
    } catch (err) {
      await get().loadServerFiles(isInPublicSpace, virtualSubPath);
      const detail =
        err instanceof ApiError
          ? err.detail || err.message
          : err instanceof Error
          ? err.message
          : String(err);
      alert(`移动失败: ${detail}`);
    }
  },

  // 粘贴剪贴板中的项目（自动识别剪切或复制，复制支持同目录自动生成 (1) 副本）
  pasteClipboard: async (targetParentId) => {
    const state = get();
    const clip = state.clipboard;
    if (!clip || clip.items.length === 0) return;

    const { targetVirtualPath, isTargetPublic } = resolveTargetDestination(
      state,
      targetParentId
    );
    const sourceIsPublic = clip.items[0].isPublicFolder;
    const sourceVirtualPaths = clip.items.map((item) => item.virtualPath);
    const { isInPublicSpace, virtualSubPath } = getCurrentFolderContext(state);

    try {
      if (clip.action === 'cut') {
        await api.files.move({
          source_virtual_paths: sourceVirtualPaths,
          target_virtual_path: targetVirtualPath,
          source_is_public: sourceIsPublic,
          target_is_public: isTargetPublic
        });
      } else {
        await api.files.copy({
          source_virtual_paths: sourceVirtualPaths,
          target_virtual_path: targetVirtualPath,
          source_is_public: sourceIsPublic,
          target_is_public: isTargetPublic
        });
      }
      set({ clipboard: null });
      await get().loadServerFiles(isInPublicSpace, virtualSubPath);
      if (sourceIsPublic || isTargetPublic) get().loadAuditLogs();
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.detail || err.message
          : err instanceof Error
          ? err.message
          : String(err);
      alert(`${clip.action === 'cut' ? '剪切移动' : '复制'}失败: ${detail}`);
    }
  },

  updateFileShare: async (ids, sharedWithUserIds) => {
    const state = get();
    const targetIds = Array.isArray(ids) ? ids : [ids];
    const targetFiles = state.files.filter((f) => targetIds.includes(f.id));
    if (targetFiles.length === 0) return;

    const virtualPaths = targetFiles.map((f) => f.virtualPath || f.name);

    try {
      await api.files.setShare({
        virtual_paths: virtualPaths,
        shared_user_ids: sharedWithUserIds
      });

      const idSet = new Set(targetIds);
      set((s) => ({
        files: s.files.map((f) =>
          idSet.has(f.id) ? { ...f, sharedWith: sharedWithUserIds } : f
        )
      }));

      state.loadAuditLogs();
    } catch (err) {
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
  removeTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }))
}));
