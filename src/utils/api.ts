// src/utils/api.ts
import type { CodePage, NoteFolder, NoteItem, NoteSnapshotItem } from '../types/note';

// 所有接口一律使用以 /api 开头的相对路径：
// - 开发环境由 vite.config.ts 的 server.proxy 转发到远程服务器
// - 生产环境由 Nginx 自动转发到后端
export const API_BASE_URL = '';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function getBearerHeader(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 携带 HTTP 状态码、后端 detail 文本与结构化 payload 的请求异常
export class ApiError extends Error {
  status: number;
  detail?: string;
  payload?: unknown;

  constructor(message: string, status: number, detail?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.payload = payload;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const rawDetail = errorData?.detail;
    if (typeof rawDetail === 'string') {
      throw new ApiError(rawDetail || `请求失败: HTTP ${res.status}`, res.status, rawDetail);
    }
    if (rawDetail && typeof rawDetail === 'object') {
      const msg =
        typeof rawDetail.message === 'string'
          ? rawDetail.message
          : `请求失败: HTTP ${res.status}`;
      throw new ApiError(msg, res.status, msg, rawDetail);
    }
    throw new ApiError(`请求失败: HTTP ${res.status}`, res.status);
  }
  return res.json();
}

function parseFilenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const plainMatch = disposition.match(/filename="?([^";\n]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }
  return fallback;
}

async function handleBlobDownload(
  res: Response,
  fallbackFilename: string
): Promise<{ blob: Blob; filename: string }> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const detail = typeof errorData?.detail === 'string' ? errorData.detail : undefined;
    throw new ApiError(detail || `下载失败: HTTP ${res.status}`, res.status, detail);
  }
  const blob = await res.blob();
  const filename = parseFilenameFromDisposition(
    res.headers.get('content-disposition'),
    fallbackFilename
  );
  return { blob, filename };
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

    createUser: (
      username: string,
      name: string,
      allowed_projects: string[],
      role: 'user' | 'sub_admin' = 'user'
    ) =>
      fetch(`${API_BASE_URL}/api/auth/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ username, name, allowed_projects, role })
      }).then(handleResponse<{ user: Record<string, unknown>; initialPassword: string }>),

    updateUserRole: (userId: string, role: 'user' | 'sub_admin') =>
      fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(userId)}/role`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ role })
      }).then(handleResponse<{ ok: boolean; user_id: string; role: 'user' | 'sub_admin'; message: string }>),

    deleteUser: (userId: string) =>
      fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>)
  },

  // === 文件与目录操作接口 ===
  files: {
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

    batchDelete: (virtual_paths: string[], is_public: boolean) =>
      fetch(`${API_BASE_URL}/api/files/batch-delete`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ virtual_paths, is_public })
      }).then(handleResponse<{ message: string; deleted_count?: number }>),

    batchDownload: async (virtual_paths: string[], is_public: boolean) => {
      const res = await fetch(`${API_BASE_URL}/api/files/batch-download`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ virtual_paths, is_public })
      });
      return handleBlobDownload(res, `批量下载_${virtual_paths.length}项.zip`);
    },

    getShareableUsers: () =>
      fetch(`${API_BASE_URL}/api/files/shareable-users`, {
        headers: getAuthHeaders()
      }).then(handleResponse<Array<{ id: string; username: string; name: string; role: string }>>),

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

    uploadFileWithChunks: async (
      file: File,
      parentPath: string,
      isPublic: boolean,
      onProgress: (percent: number) => void,
      relativePath?: string
    ) => {
      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
      const uploadId = `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

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
          headers: getBearerHeader(),
          body: formData
        });
        if (!res.ok) throw new Error(`分片 ${i} 上传失败`);

        const percent = Math.round(((i + 1) / totalChunks) * 100);
        onProgress(percent);
      }

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
      base_revision?: number;
      force?: boolean;
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
      base_revision?: number;
      force?: boolean;
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

    moveFolder: (note_id: string, folder_id: string | null) =>
      fetch(`${API_BASE_URL}/api/notes/move-folder`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ note_id, folder_id })
      }).then(handleResponse<{ message: string; note: NoteItem; version?: string }>),

    movePage: (data: {
      source_note_id: string;
      target_note_id: string;
      page_id: string;
      page_payload?: CodePage;
      delete_empty_source?: boolean;
    }) =>
      fetch(`${API_BASE_URL}/api/notes/move-page`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      }).then(
        handleResponse<{
          message: string;
          sourceDeleted: boolean;
          sourceNote: NoteItem | null;
          targetNote: NoteItem;
          movedPageId: string;
          version?: string;
        }>
      ),

    exportNoteZip: async (noteId: string, fallbackTitle = 'note') => {
      const res = await fetch(`${API_BASE_URL}/api/notes/export/${encodeURIComponent(noteId)}`, {
        method: 'GET',
        headers: getBearerHeader()
      });
      const safeFallback = `${fallbackTitle.replace(/[\\/:*?"<>|]/g, '_') || 'note'}.zip`;
      return handleBlobDownload(res, safeFallback);
    },

    listSnapshots: (noteId: string) =>
      fetch(`${API_BASE_URL}/api/notes/${encodeURIComponent(noteId)}/snapshots`, {
        headers: getAuthHeaders()
      }).then(handleResponse<{ snapshots: NoteSnapshotItem[] }>),

    createSnapshot: (
      noteId: string,
      data: { message?: string; title?: string; code_pages?: CodePage[] }
    ) =>
      fetch(`${API_BASE_URL}/api/notes/${encodeURIComponent(noteId)}/snapshots`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      }).then(handleResponse<{ message: string; snapshot: NoteSnapshotItem }>),

    restoreSnapshot: (noteId: string, snapshotId: string) =>
      fetch(
        `${API_BASE_URL}/api/notes/${encodeURIComponent(noteId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
        {
          method: 'POST',
          headers: getAuthHeaders()
        }
      ).then(handleResponse<{ message: string; note: NoteItem; version?: string }>),

    deleteSnapshot: (noteId: string, snapshotId: string) =>
      fetch(
        `${API_BASE_URL}/api/notes/${encodeURIComponent(noteId)}/snapshots/${encodeURIComponent(snapshotId)}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders()
        }
      ).then(handleResponse<{ message: string }>),

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

    uploadImage: async (file: File | Blob, filename = 'paste.png') => {
      const formData = new FormData();
      formData.append('file', file, filename);
      const res = await fetch(`${API_BASE_URL}/api/notes/upload-image`, {
        method: 'POST',
        headers: getBearerHeader(),
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
