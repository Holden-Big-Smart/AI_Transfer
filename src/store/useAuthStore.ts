// src/store/useAuthStore.ts
import { create } from 'zustand';
import { api } from '../utils/api';

export type UserRole = 'admin' | 'user' | 'guest';

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  password?: string; // 存储密码（生产环境建议由服务端哈希加盐）
  mustChangePassword?: boolean; // 是否必须在首次登录修改密码
  allowedProjects: string[]; // 允许访问的项目知识库
  createdAt: string;
}

interface AuthStore {
  users: UserAccount[];
  currentUser: UserAccount | null;
  fetchUsers: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string; mustChange?: boolean }>;
  logout: () => void;
  guestLogin: () => void;
  createUser: (username: string, name: string, allowedProjects: string[]) => Promise<{ user: UserAccount; initialPass: string }>;
  deleteUser: (id: string) => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
}

const getStoredCurrentUser = (): UserAccount | null => {
  const token = localStorage.getItem('access_token');
  const data = localStorage.getItem('app_current_user');
  if (!token || !data) return null;
  try {
    const user = JSON.parse(data);
    return {
      ...user,
      // 核心防御：若后端未返回 allowedProjects，保底赋值为安全数组
      allowedProjects: Array.isArray(user.allowedProjects) ? user.allowedProjects : ['通用公用库'],
    };
  } catch {
    return null;
  }
};

// 统一兜底：确保后端返回的用户对象始终包含 allowedProjects 数组
const normalizeUser = (user: UserAccount): UserAccount => ({
  ...user,
  allowedProjects: Array.isArray(user.allowedProjects) ? user.allowedProjects : ['通用公用库'],
});

export const useAuthStore = create<AuthStore>((set, get) => ({
  users: [],
  currentUser: getStoredCurrentUser(),

  fetchUsers: async () => {
    try {
      const data = await api.auth.getUsers();
      set({ users: (data || []).map((u: UserAccount) => normalizeUser(u)) });
    } catch (err) {
      console.error('获取用户列表失败', err);
    }
  },

  login: async (username, password) => {
    try {
      const res = await api.auth.login(username, password);
      const user = normalizeUser(res.user);
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('app_current_user', JSON.stringify(user));
      set({ currentUser: user });
      return { success: true, mustChange: user.mustChangePassword };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '登录异常' };
    }
  },

  guestLogin: () => {
    const guest: UserAccount = {
      id: `u_guest_${Date.now()}`,
      username: 'guest',
      name: '访客模式',
      role: 'guest',
      allowedProjects: [],
      createdAt: new Date().toLocaleDateString('zh-CN'),
    };
    set({ currentUser: guest });
    localStorage.setItem('app_current_user', JSON.stringify(guest));
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('app_current_user');
    set({ currentUser: null });
  },

  createUser: async (username, name, allowedProjects) => {
    const res = await api.auth.createUser(username, name, allowedProjects);
    const user = normalizeUser(res.user);
    set((state) => ({ users: [...state.users, user] }));
    return { user, initialPass: res.initialPassword };
  },

  deleteUser: async (id) => {
    await api.auth.deleteUser(id);
    set((state) => ({ users: state.users.filter((u) => u.id !== id) }));
  },

  changePassword: async (newPass) => {
    await api.auth.changePassword(newPass);
    const curr = get().currentUser;
    if (curr) {
      const updated = { ...curr, mustChangePassword: false };
      set({ currentUser: updated });
      localStorage.setItem('app_current_user', JSON.stringify(updated));
    }
  }
}));
