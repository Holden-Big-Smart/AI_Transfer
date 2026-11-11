// src/utils/api.ts
// 生产环境同域代理，留空即可；开发模式仍可回退到指定地址
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `请求失败: HTTP ${res.status}`);
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

    move: (source_virtual_path: string, target_virtual_path: string, is_public: boolean) =>
      fetch(`${API_BASE_URL}/api/files/move`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ source_virtual_path, target_virtual_path, is_public })
      }).then(handleResponse<{ message: string }>),

    delete: (virtual_path: string, is_public: boolean) => {
      const params = new URLSearchParams({ virtual_path, is_public: String(is_public) });
      return fetch(`${API_BASE_URL}/api/files/delete?${params.toString()}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      }).then(handleResponse<{ message: string }>);
    },

    setShare: (virtual_path: string, shared_user_ids: string[]) =>
      fetch(`${API_BASE_URL}/api/files/share`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ virtual_path, shared_user_ids })
      }).then(handleResponse<{ message: string }>),

    getDownloadUrl: (virtual_path: string, is_public: boolean) => {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams({ virtual_path, is_public: String(is_public) });
      return `${API_BASE_URL}/api/files/download?${params.toString()}&token=${token}`;
    },

    // 真实分片上传与落盘
    uploadFileWithChunks: async (
      file: File,
      parentPath: string,
      isPublic: boolean,
      onProgress: (percent: number) => void
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
          parent_path: parentPath,
          is_public: isPublic,
          total_chunks: totalChunks
        })
      }).then(handleResponse<{ message: string }>);
    }
  },

  // === 审计接口 ===
  audit: {
    getLogs: () =>
      fetch(`${API_BASE_URL}/api/audit/logs`, {
        headers: getAuthHeaders()
      }).then(handleResponse<any[]>)
  }
};
