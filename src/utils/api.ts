// src/utils/api.ts
import type { CodePage, NoteFolder, NoteItem } from '../types/note';

// 所有接口一律使用以 /api 开头的相对路径：
// - 开发环境由 vite.config.ts 的 server.proxy 转发到远程服务器
// - 生产环境由 Nginx 自动转发到后端
// 这里固定为空字符串，绝不允许出现 http://localhost 之类的绝对地址
export const API_BASE_URL = '';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// 携带 HTTP 状态码与后端 detail 的请求异常，便于调用方做差异化提示
export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const detail = typeof errorData?.detail === 'string' ? errorData.detail : undefined;
    throw new ApiError(detail || `请求失败: HTTP ${res.status}`, res.status, detail);
  }
  return res.json();
}

export const api = {
  // === 认证接口 ===
  auth: {
    login: (username: string, password: string) =>
      fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }).then(handleResponse<{ access_token: string; user: Record<string, unknown> }>),

    getMe: () =>
      fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: getAuthHeaders()
      }).then(handleResponse<Record<string, unknown>>),

    changePassword: (new_password: string) =>
      fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ new_password })
      }).then(handleResponse<{ message: string }>),

    updateTheme: (theme: 'dark' | 'light' | 'eyecare') =>
      fetch(`${API_BASE_URL}/api/auth/theme`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ theme })
      }).then(handleResponse<{ message: string; theme: 'dark' | 'light' | 'eyecare' }>),

    updateNoteAutoSave: (note_auto_save: boolean) =>
      fetch(`${API_BASE_URL}/api/auth/note-auto-save`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ note_auto_save })
      }).then(handleResponse<{ message: string; noteAutoSave: boolean }>),

    getUsers: () =>
      fetch(`${API_BASE_URL}/api/auth/users`, {
        headers: getAuthHeaders()
      }).then(handleResponse<Array<Record<string, unknown>>>),

    createUser: (username: string, name: string, allowed_projects: string[]) =>
      fetch(`${API_BASE_URL}/api/auth/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ username, name, allowed_projects })
      }).then(handleResponse<{ user: Record<string, unknown>; initialPassword: string }>),

    deleteUser: (userId: string) =>
      fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>)
  },

  // === 文件与目录操作接口 ===
  files: {
    // 获取真实存储空间统计（区分文件占用与笔记占用）
    getStorageStats: () =>
      fetch(`${API_BASE_URL}/api/files/storage-stats`, {
        headers: getAuthHeaders()
      }).then(
        handleResponse<{
          filesBytes: number;
          notesBytes: number;
          usedBytes: number;
          totalQuotaBytes: number;
        }>
      ),

    list: (is_public: boolean, sub_path: string = '') => {
      const params = new URLSearchParams({ is_public: String(is_public), sub_path });
      return fetch(`${API_BASE_URL}/api/files/list?${params.toString()}`, {
        headers: getAuthHeaders()
      }).then(handleResponse<Array<Record<string, unknown>>>);
    },

    createFolder: (name: string, parent_path: string, is_public: boolean) =>
      fetch(`${API_BASE_URL}/api/files/folder`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, parent_path, is_public })
      }).then(handleResponse<{ message: string }>),

    rename: (virtual_path: string, new_name: string, is_public: boolean) =>
      fetch(`${API_BASE_URL}/api/files/rename`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ virtual_path, new_name, is_public })
      }).then(handleResponse<{ message: string }>),

    // 支持单文件或批量跨区移动
    move: (req: {
      source_virtual_path?: string;
      source_virtual_paths?: string[];
      target_virtual_path: string;
      source_is_public: boolean;
      target_is_public: boolean;
    }) =>
      fetch(`${API_BASE_URL}/api/files/move`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(req)
      }).then(handleResponse<{ message: string; moved_count?: number }>),

    // 支持单文件或批量复制（同名自动追加 (1) 后缀）
    copy: (req: {
      source_virtual_paths: string[];
      target_virtual_path: string;
      source_is_public: boolean;
      target_is_public: boolean;
    }) =>
      fetch(`${API_BASE_URL}/api/files/copy`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(req)
      }).then(handleResponse<{ message: string; copied_names?: string[] }>),

    delete: (virtual_path: string, is_public: boolean) => {
      const params = new URLSearchParams({ virtual_path, is_public: String(is_public) });
      return fetch(`${API_BASE_URL}/api/files/delete?${params.toString()}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>);
    },

    // 批量删除接口
    batchDelete: (virtual_paths: string[], is_public: boolean) =>
      fetch(`${API_BASE_URL}/api/files/batch-delete`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ virtual_paths, is_public })
      }).then(handleResponse<{ message: string; deleted_count?: number }>),

    // 获取可共享的用户列表
    getShareableUsers: () =>
      fetch(`${API_BASE_URL}/api/files/shareable-users`, {
        headers: getAuthHeaders()
      }).then(handleResponse<Array<{ id: string; username: string; name: string; role: string }>>),

    // 设置单文件或批量文件定向共享名单（shared_user_ids 包含 'ALL' 代表所有人及访客可见）
    setShare: (data: { virtual_path?: string; virtual_paths?: string[]; shared_user_ids: string[] }) =>
      fetch(`${API_BASE_URL}/api/files/share`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      }).then(handleResponse<{ message: string }>),

    getDownloadUrl: (virtual_path: string, is_public: boolean) => {
      const token = localStorage.getItem('access_token') || '';
      const params = new URLSearchParams({ virtual_path, is_public: String(is_public) });
      return `${API_BASE_URL}/api/files/download?${params.toString()}&token=${token}`;
    },

    // 真实分片上传与落盘（新增 relativePath 参数以保持完整文件夹层级结构）
    uploadFileWithChunks: async (
      file: File,
      parentPath: string,
      isPublic: boolean,
      onProgress: (percent: number) => void,
      relativePath?: string
    ) => {
      const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB 一个分片
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
      const uploadId = `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const token = localStorage.getItem('access_token');

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('chunk_index', String(i));
        formData.append('file', chunkBlob, file.name);

        const res = await fetch(`${API_BASE_URL}/api/files/upload-chunk`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        });
        if (!res.ok) throw new Error(`分片 ${i} 上传失败`);

        const percent = Math.round(((i + 1) / totalChunks) * 100);
        onProgress(percent);
      }

      // 所有分片落盘后，触发合并接口
      return fetch(`${API_BASE_URL}/api/files/merge-chunks`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          upload_id: uploadId,
          filename: file.name,
          relative_path: relativePath || file.name,
          parent_path: parentPath,
          is_public: isPublic,
          total_chunks: totalChunks
        })
      }).then(handleResponse<{ message: string }>);
    }
  },

  // === 云端笔记接口 ===
  notes: {
    getVersion: () =>
      fetch(`${API_BASE_URL}/api/notes/version`, {
        headers: getAuthHeaders()
      }).then(handleResponse<{ version: string }>),

    getAll: () =>
      fetch(`${API_BASE_URL}/api/notes/all`, {
        headers: getAuthHeaders()
      }).then(handleResponse<{ folders: NoteFolder[]; notes: NoteItem[]; version?: string }>),

    createFolder: (name: string) =>
      fetch(`${API_BASE_URL}/api/notes/folder`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name })
      }).then(handleResponse<NoteFolder>),

    deleteFolder: (folderId: string) =>
      fetch(`${API_BASE_URL}/api/notes/folder/${folderId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>),

    save: (data: {
      id?: string;
      folder_id: string | null;
      title: string;
      content: string;
      code_pages: CodePage[];
      is_public?: boolean;
    }) =>
      fetch(`${API_BASE_URL}/api/notes/save`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      }).then(handleResponse<NoteItem>),

    saveKeepalive: (data: {
      id?: string;
      folder_id: string | null;
      title: string;
      content: string;
      code_pages: CodePage[];
      is_public?: boolean;
    }) => {
      try {
        fetch(`${API_BASE_URL}/api/notes/save`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(data),
          keepalive: true
        });
      } catch {
        // 忽略关闭页面时的中断异常
      }
    },

    // 切换笔记的公开/私密状态
    togglePublic: (note_id: string, is_public: boolean) =>
      fetch(`${API_BASE_URL}/api/notes/toggle-public`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ note_id, is_public })
      }).then(handleResponse<{ message: string; isPublic: boolean; version?: string }>),

    updateShares: (data: {
      note_id: string;
      is_public?: boolean;
      shares: Array<{ user_id: string; permission: 'read' | 'edit' }>;
    }) =>
      fetch(`${API_BASE_URL}/api/notes/shares`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      }).then(
        handleResponse<{
          message: string;
          isPublic: boolean;
          shares: Array<{ userId: string; username: string; name: string; permission: 'read' | 'edit' }>;
          version?: string;
        }>
      ),

    // 上传笔记内嵌图片（粘贴截图或本地图片）
    uploadImage: async (file: File | Blob, filename = 'paste.png') => {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('file', file, filename);
      const res = await fetch(`${API_BASE_URL}/api/notes/upload-image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });
      return handleResponse<{ url: string; filename: string }>(res);
    },

    deleteNote: (noteId: string) =>
      fetch(`${API_BASE_URL}/api/notes/item/${noteId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>)
  },

  // === 实时屏幕共享接口 ===
  screen: {
    getIceConfig: () =>
      fetch(`${API_BASE_URL}/api/screen/ice-config`, {
        headers: getAuthHeaders()
      }).then(handleResponse<{ iceServers: RTCIceServer[] }>),

    listRooms: () =>
      fetch(`${API_BASE_URL}/api/screen/rooms`, {
        headers: getAuthHeaders()
      }).then(
        handleResponse<
          Array<{
            roomId: string;
            hostName: string;
            hostUsername: string;
            allowMode: 'code' | 'users';
            qualityLabel: string;
            createdAt: string;
            isSelfDevice: boolean;
            viewerCount: number;
          }>
        >
      ),

    createRoom: (data: {
      allow_mode: 'code' | 'users';
      allowed_user_ids: string[];
      quality_label: string;
    }) =>
      fetch(`${API_BASE_URL}/api/screen/rooms`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      }).then(
        handleResponse<{
          roomId: string;
          clientId: string;
          wsTicket: string;
          allowMode: 'code' | 'users';
          qualityLabel: string;
          createdAt: string;
        }>
      ),

    joinRoom: (roomId: string) =>
      fetch(`${API_BASE_URL}/api/screen/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        headers: getAuthHeaders()
      }).then(
        handleResponse<{
          roomId: string;
          clientId: string;
          wsTicket: string;
          hostClientId: string;
          hostName: string;
          hostUsername: string;
          qualityLabel: string;
        }>
      ),

    closeRoom: (roomId: string) =>
      fetch(`${API_BASE_URL}/api/screen/rooms/${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>),

    getWsUrl: (roomId: string, ticket: string) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/api/screen/ws/${encodeURIComponent(roomId)}?ticket=${encodeURIComponent(ticket)}`;
    }
  },

  // === 审计接口 ===
  audit: {
    getLogs: () =>
      fetch(`${API_BASE_URL}/api/audit/logs`, {
        headers: getAuthHeaders()
      }).then(handleResponse<Array<Record<string, unknown>>>)
  }
};
