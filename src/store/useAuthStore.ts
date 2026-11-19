// src/store/useAuthStore.ts
import { create } from 'zustand';
import { api } from '../utils/api';

export type UserRole = 'admin' | 'user' | 'guest';
export type ThemeMode = 'dark' | 'light' | 'eyecare';

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  password?: string;
  mustChangePassword?: boolean;
  allowedProjects: string[];
  theme?: ThemeMode;
  createdAt?: string;
}

interface AuthStore {
  users: UserAccount[];
  currentUser: UserAccount | null;
  theme: ThemeMode;
  fetchUsers: () => Promise<void>;
  syncCurrentUser: () => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string; mustChange?: boolean }>;
  logout: () => void;
  guestLogin: () => void;
  createUser: (username: string, name: string, allowedProjects: string[]) => Promise<{ user: UserAccount; initialPass: string }>;
  deleteUser: (id: string) => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
}

const VALID_THEMES: ThemeMode[] = ['dark', 'light', 'eyecare'];

export function sanitizeTheme(val: unknown): ThemeMode {
  if (typeof val === 'string' && (VALID_THEMES as string[]).includes(val)) {
    return val as ThemeMode;
  }
  return 'dark';
}

export function applyThemeToDom(theme: ThemeMode) {
  const safe = sanitizeTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', safe);
  }
  try {
    localStorage.setItem('app_active_theme', safe);
  } catch {
    // ignore
  }
}

const getUserThemeStorageKey = (user: UserAccount | null): string => {
  if (!user) return 'app_theme_default';
  if (user.role === 'guest') return 'app_theme_guest';
  return `app_theme_${user.id}`;
};

const getStoredCurrentUser = (): UserAccount | null => {
  const token = localStorage.getItem('access_token');
  const data = localStorage.getItem('app_current_user');
  if (!data) return null;
  try {
    const user = JSON.parse(data) as UserAccount;
    if (user.role !== 'guest' && !token) return null;
    return {
      ...user,
      allowedProjects: Array.isArray(user.allowedProjects) ? user.allowedProjects : ['通用公用库'],
      theme: sanitizeTheme(user.theme)
    };
  } catch {
    return null;
  }
};

const resolveInitialTheme = (user: UserAccount | null): ThemeMode => {
  if (user) {
    const cachedUserTheme = localStorage.getItem(getUserThemeStorageKey(user));
    const resolved = sanitizeTheme(user.theme || cachedUserTheme || 'dark');
    applyThemeToDom(resolved);
    return resolved;
  }
  const fallback: ThemeMode = 'dark';
  applyThemeToDom(fallback);
  return fallback;
};

const normalizeUser = (user: UserAccount): UserAccount => ({
  ...user,
  allowedProjects: Array.isArray(user.allowedProjects) ? user.allowedProjects : ['通用公用库'],
  theme: sanitizeTheme(user.theme)
});

const initialUser = getStoredCurrentUser();
const initialTheme = resolveInitialTheme(initialUser);

export const useAuthStore = create<AuthStore>((set, get) => ({
  users: [],
  currentUser: initialUser,
  theme: initialTheme,

  fetchUsers: async () => {
    try {
      const data = await api.auth.getUsers();
      set({ users: (data || []).map((u: UserAccount) => normalizeUser(u)) });
    } catch (err) {
      console.error('获取用户列表失败', err);
    }
  },

  // 页面加载时向后端拉取该账号最新配置（含跨设备保存的主题偏好）
  syncCurrentUser: async () => {
    const curr = get().currentUser;
    if (!curr || curr.role === 'guest') return;
    try {
      const me = await api.auth.getMe();
      const user = normalizeUser(me);
      const serverTheme = sanitizeTheme(user.theme);
      applyThemeToDom(serverTheme);
      localStorage.setItem(getUserThemeStorageKey(user), serverTheme);
      localStorage.setItem('app_current_user', JSON.stringify(user));
      set({ currentUser: user, theme: serverTheme });
    } catch (err) {
      console.error('同步用户配置失败', err);
    }
  },

  // 切换界面风格（立即生效并绑定当前用户持久化到云端数据库）
  setTheme: async (nextTheme) => {
    const safeTheme = sanitizeTheme(nextTheme);
    const curr = get().currentUser;

    applyThemeToDom(safeTheme);
    set({ theme: safeTheme });

    if (curr) {
      localStorage.setItem(getUserThemeStorageKey(curr), safeTheme);
      const updatedUser: UserAccount = { ...curr, theme: safeTheme };
      localStorage.setItem('app_current_user', JSON.stringify(updatedUser));
      set({ currentUser: updatedUser });

      if (curr.role !== 'guest') {
        try {
          await api.auth.updateTheme(safeTheme);
        } catch (err) {
          console.error('保存主题至云端失败:', err);
        }
      }
    }
  },

  login: async (username, password) => {
    try {
      const res = await api.auth.login(username, password);
      const user = normalizeUser(res.user);
      const userTheme = sanitizeTheme(user.theme || localStorage.getItem(getUserThemeStorageKey(user)) || 'dark');
      const finalUser = { ...user, theme: userTheme };

      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('app_current_user', JSON.stringify(finalUser));
      localStorage.setItem(getUserThemeStorageKey(finalUser), userTheme);
      applyThemeToDom(userTheme);

      set({ currentUser: finalUser, theme: userTheme });
      return { success: true, mustChange: finalUser.mustChangePassword };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '登录异常' };
    }
  },

  guestLogin: () => {
    const savedGuestTheme = sanitizeTheme(localStorage.getItem('app_theme_guest') || 'dark');
    const guest: UserAccount = {
      id: `u_guest_${Date.now()}`,
      username: 'guest',
      name: '访客模式',
      role: 'guest',
      allowedProjects: [],
      theme: savedGuestTheme,
      createdAt: new Date().toLocaleDateString('zh-CN')
    };
    applyThemeToDom(savedGuestTheme);
    set({ currentUser: guest, theme: savedGuestTheme });
    localStorage.setItem('app_current_user', JSON.stringify(guest));
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('app_current_user');
    applyThemeToDom('dark');
    set({ currentUser: null, theme: 'dark' });
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
