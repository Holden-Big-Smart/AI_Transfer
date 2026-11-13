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
      }).then(handleResponse<{ access_token: string; user: any }>),

    getMe: () =>
      fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: getAuthHeaders()
      }).then(handleResponse<any>),

    changePassword: (new_password: string) =>
      fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ new_password })
      }).then(handleResponse<{ message: string }>),

    getUsers: () =>
      fetch(`${API_BASE_URL}/api/auth/users`, {
        headers: getAuthHeaders()
      }).then(handleResponse<any[]>),

    createUser: (username: string, name: string, allowed_projects: string[]) =>
      fetch(`${API_BASE_URL}/api/auth/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ username, name, allowed_projects })
      }).then(handleResponse<{ user: any; initialPassword: string }>),

    deleteUser: (userId: string) =>
      fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>)
  },

  // === 文件与目录操作接口 ===
  files: {
    list: (is_public: boolean, sub_path: string = '') => {
      const params = new URLSearchParams({ is_public: String(is_public), sub_path });
      return fetch(`${API_BASE_URL}/api/files/list?${params.toString()}`, {
        headers: getAuthHeaders()
      }).then(handleResponse<any[]>);
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

    // 参数结构与后端 MoveReq 保持一致（源/目标区域分离，支持跨公共与私有区移动）
    move: (req: { source_virtual_path: string; target_virtual_path: string; source_is_public: boolean; target_is_public: boolean }) => {
      console.log('--> [API 拦截] 准备发往后端的真实数据:', req);
      return fetch(`${API_BASE_URL}/api/files/move`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          source_virtual_path: req.source_virtual_path,
          target_virtual_path: req.target_virtual_path,
          source_is_public: req.source_is_public,
          target_is_public: req.target_is_public
        })
      }).then(handleResponse<{ message: string }>);
    },

    delete: (virtual_path: string, is_public: boolean) => {
      const params = new URLSearchParams({ virtual_path, is_public: String(is_public) });
      return fetch(`${API_BASE_URL}/api/files/delete?${params.toString()}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>);
    },

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
    getAll: () =>
      fetch(`${API_BASE_URL}/api/notes/all`, {
        headers: getAuthHeaders()
      }).then(handleResponse<{ folders: NoteFolder[]; notes: NoteItem[] }>),

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
    }) =>
      fetch(`${API_BASE_URL}/api/notes/save`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      }).then(handleResponse<NoteItem>),

    deleteNote: (noteId: string) =>
      fetch(`${API_BASE_URL}/api/notes/item/${noteId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>)
  },

  // === 审计接口 ===
  audit: {
    getLogs: () =>
      fetch(`${API_BASE_URL}/api/audit/logs`, {
        headers: getAuthHeaders()
      }).then(handleResponse<any[]>)
  }
};
