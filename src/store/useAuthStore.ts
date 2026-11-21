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
  noteAutoSave?: boolean;
  createdAt?: string;
}

interface AuthStore {
  users: UserAccount[];
  currentUser: UserAccount | null;
  theme: ThemeMode;
  noteAutoSave: boolean;
  fetchUsers: () => Promise<void>;
  syncCurrentUser: () => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setNoteAutoSave: (enabled: boolean) => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string; mustChange?: boolean }>;
  logout: () => void;
  guestLogin: () => void;
  createUser: (username: string, name: string, allowedProjects: string[]) => Promise<{ user: UserAccount; initialPass: string }>;
  deleteUser: (id: string) => Promise<void>;
  updateUserProjects: (userId: string, allowedProjects: string[]) => Promise<void>;
  setAllowedProjects: (projects: string[]) => void;
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

const getUserAutoSaveStorageKey = (user: UserAccount | null): string => {
  if (!user || user.role === 'guest') return 'app_note_autosave_guest';
  return `app_note_autosave_${user.id}`;
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
      theme: sanitizeTheme(user.theme),
      noteAutoSave: Boolean(user.noteAutoSave)
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

const resolveInitialAutoSave = (user: UserAccount | null): boolean => {
  if (!user || user.role === 'guest') return false;
  if (typeof user.noteAutoSave === 'boolean') return user.noteAutoSave;
  return localStorage.getItem(getUserAutoSaveStorageKey(user)) === 'true';
};

const normalizeUser = (user: UserAccount): UserAccount => ({
  ...user,
  allowedProjects: Array.isArray(user.allowedProjects) ? user.allowedProjects : ['通用公用库'],
  theme: sanitizeTheme(user.theme),
  noteAutoSave: Boolean(user.noteAutoSave)
});

const initialUser = getStoredCurrentUser();
const initialTheme = resolveInitialTheme(initialUser);
const initialAutoSave = resolveInitialAutoSave(initialUser);

export const useAuthStore = create<AuthStore>((set, get) => ({
  users: [],
  currentUser: initialUser,
  theme: initialTheme,
  noteAutoSave: initialAutoSave,

  fetchUsers: async () => {
    const list = await api.auth.getUsers();
    set({ users: (list || []).map(normalizeUser) });
  },

  syncCurrentUser: async () => {
    const state = get();
    if (!state.currentUser || state.currentUser.role === 'guest') return;
    try {
      const me = await api.auth.getMe();
      const normalized = normalizeUser(me);
      localStorage.setItem('app_current_user', JSON.stringify(normalized));
      const nextTheme = sanitizeTheme(normalized.theme || state.theme);
      applyThemeToDom(nextTheme);
      set({
        currentUser: normalized,
        theme: nextTheme,
        noteAutoSave: Boolean(normalized.noteAutoSave)
      });
    } catch {
      // ignore
    }
  },

  setTheme: async (nextTheme: ThemeMode) => {
    const safe = sanitizeTheme(nextTheme);
    const current = get().currentUser;
    applyThemeToDom(safe);
    set({ theme: safe });
    if (current) {
      localStorage.setItem(getUserThemeStorageKey(current), safe);
      if (current.role !== 'guest') {
        const updated = { ...current, theme: safe };
        localStorage.setItem('app_current_user', JSON.stringify(updated));
        set({ currentUser: updated });
        try {
          await api.auth.updateTheme(safe);
        } catch {
          // ignore
        }
      }
    }
  },

  setNoteAutoSave: async (enabled: boolean) => {
    const current = get().currentUser;
    set({ noteAutoSave: enabled });
    if (current) {
      localStorage.setItem(getUserAutoSaveStorageKey(current), String(enabled));
      if (current.role !== 'guest') {
        const updated = { ...current, noteAutoSave: enabled };
        localStorage.setItem('app_current_user', JSON.stringify(updated));
        set({ currentUser: updated });
        try {
          await api.auth.updateNoteAutoSave(enabled);
        } catch {
          // ignore
        }
      }
    }
  },

  login: async (username: string, password: string) => {
    try {
      const res = await api.auth.login(username, password);
      localStorage.setItem('access_token', res.access_token);
      const normalized = normalizeUser(res.user);
      localStorage.setItem('app_current_user', JSON.stringify(normalized));
      const nextTheme = sanitizeTheme(normalized.theme || 'dark');
      applyThemeToDom(nextTheme);
      set({
        currentUser: normalized,
        theme: nextTheme,
        noteAutoSave: Boolean(normalized.noteAutoSave)
      });
      return { success: true, mustChange: Boolean(normalized.mustChangePassword) };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : '登录失败'
      };
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('app_current_user');
    set({ currentUser: null, users: [] });
  },

  guestLogin: () => {
    const guestUser: UserAccount = {
      id: 'guest',
      username: 'guest',
      name: '访客用户',
      role: 'guest',
      allowedProjects: ['通用公用库'],
      theme: 'dark',
      noteAutoSave: false
    };
    localStorage.setItem('app_current_user', JSON.stringify(guestUser));
    applyThemeToDom('dark');
    set({ currentUser: guestUser, theme: 'dark', noteAutoSave: false });
  },

  createUser: async (username: string, name: string, allowedProjects: string[]) => {
    const created = await api.auth.createUser(username, name, allowedProjects) as any;
    const normalized = normalizeUser(created.user || created);
    const initialPass = created.initialPass || created.initial_pass || created.initialPassword || '';
    set((state) => ({ users: [...state.users, normalized] }));
    return { user: normalized, initialPass };
  },

  deleteUser: async (id: string) => {
    await api.auth.deleteUser(id);
    set((state) => ({ users: state.users.filter((u) => u.id !== id) }));
  },

  updateUserProjects: async (userId: string, allowedProjects: string[]) => {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`/api/auth/users/${encodeURIComponent(userId)}/projects`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ allowed_projects: allowedProjects })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '更新成员项目权限失败');
    }
    const data = await res.json();
    const nextList = Array.isArray(data.allowedProjects) ? data.allowedProjects : allowedProjects;
    set((state) => {
      const nextUsers = state.users.map((u) =>
        u.id === userId ? { ...u, allowedProjects: nextList } : u
      );
      const nextCurrent =
        state.currentUser && state.currentUser.id === userId
          ? { ...state.currentUser, allowedProjects: nextList }
          : state.currentUser;
      if (nextCurrent) {
        localStorage.setItem('app_current_user', JSON.stringify(nextCurrent));
      }
      return { users: nextUsers, currentUser: nextCurrent };
    });
  },

  setAllowedProjects: (projects: string[]) => {
    set((state) => {
      if (!state.currentUser) return state;
      const nextCurrent = { ...state.currentUser, allowedProjects: projects };
      localStorage.setItem('app_current_user', JSON.stringify(nextCurrent));
      return { currentUser: nextCurrent };
    });
  },

  changePassword: async (newPass: string) => {
    await api.auth.changePassword(newPass);
    const current = get().currentUser;
    if (current) {
      const updated = { ...current, mustChangePassword: false };
      localStorage.setItem('app_current_user', JSON.stringify(updated));
      set({ currentUser: updated });
    }
  }
}));
