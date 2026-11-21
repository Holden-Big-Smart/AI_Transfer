// src/store/useAuthStore.ts
import { create } from 'zustand';
import { api } from '../utils/api';

export type UserRole = 'admin' | 'user' | 'guest';
export type ThemeMode = 'dark' | 'light' | 'eyecare' | (string & {});

export interface CustomThemeItem {
  id: string;
  name: string;
  description?: string;
  baseMode: 'dark' | 'light' | 'eyecare';
  colors: Record<string, string>;
  updatedAt?: string;
  isBuiltin?: boolean;
}

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
  avatarUrl?: string | null;
  createdAt?: string;
}

interface AuthStore {
  users: UserAccount[];
  currentUser: UserAccount | null;
  theme: ThemeMode;
  customThemes: CustomThemeItem[];
  noteAutoSave: boolean;
  fetchUsers: () => Promise<void>;
  syncCurrentUser: () => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  fetchThemes: () => Promise<void>;
  importCustomTheme: (payload: {
    id?: string;
    name: string;
    description?: string;
    baseMode: 'dark' | 'light' | 'eyecare';
    colors: Record<string, string>;
  }) => Promise<void>;
  updateCustomTheme: (
    themeId: string,
    payload: {
      name: string;
      description?: string;
      baseMode: 'dark' | 'light' | 'eyecare';
      colors: Record<string, string>;
    }
  ) => Promise<void>;
  deleteCustomTheme: (themeId: string) => Promise<void>;
  setNoteAutoSave: (enabled: boolean) => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string; mustChange?: boolean }>;
  logout: () => void;
  guestLogin: () => void;
  createUser: (username: string, name: string, allowedProjects: string[]) => Promise<{ user: UserAccount; initialPass: string }>;
  deleteUser: (id: string) => Promise<void>;
  updateUserProjects: (userId: string, allowedProjects: string[]) => Promise<void>;
  setAllowedProjects: (projects: string[]) => void;
  uploadAvatar: (file: File) => Promise<string>;
  resetAvatar: () => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
}

const VALID_THEMES = ['dark', 'light', 'eyecare'] as const;
type BuiltinTheme = (typeof VALID_THEMES)[number];

const isBuiltinTheme = (val: string): val is BuiltinTheme =>
  (VALID_THEMES as readonly string[]).includes(val);

let runtimeCustomThemes: CustomThemeItem[] = [];

export function sanitizeTheme(val: unknown): ThemeMode {
  if (typeof val !== 'string') return 'dark';
  const trimmed = val.trim();
  return trimmed || 'dark';
}

const CUSTOM_THEME_VAR_KEYS = [
  '--bg-base',
  '--bg-surface',
  '--bg-surface-alt',
  '--bg-sidebar',
  '--bg-panel',
  '--bg-input',
  '--bg-hover',
  '--bg-hover-strong',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-subtle',
  '--border-main',
  '--border-subtle',
];

export function applyThemeToDom(
  theme: ThemeMode,
  customThemes: CustomThemeItem[] = runtimeCustomThemes
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const key of CUSTOM_THEME_VAR_KEYS) {
    root.style.removeProperty(key);
  }
  const found = customThemes.find((item) => item.id === theme);
  if (found) {
    root.setAttribute('data-theme', found.baseMode || 'dark');
    for (const [key, value] of Object.entries(found.colors || {})) {
      if (CUSTOM_THEME_VAR_KEYS.includes(key) && typeof value === 'string' && value.trim()) {
        root.style.setProperty(key, value.trim());
      }
    }
  } else {
    root.setAttribute('data-theme', isBuiltinTheme(theme) ? theme : 'dark');
  }
  try {
    localStorage.setItem('app_active_theme', theme);
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
  customThemes: [],
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
      applyThemeToDom(nextTheme, get().customThemes);
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
    const customThemes = get().customThemes;
    const isCustom = customThemes.some((item) => item.id === safe);
    applyThemeToDom(safe, customThemes);
    set({ theme: safe });
    const current = get().currentUser;
    if (current) {
      localStorage.setItem(getUserThemeStorageKey(current), safe);
      if (current.role !== 'guest') {
        const updated = { ...current, theme: safe };
        localStorage.setItem('app_current_user', JSON.stringify(updated));
        set({ currentUser: updated });
        if (!isCustom && isBuiltinTheme(safe)) {
          try {
            await api.auth.updateTheme(safe);
          } catch {
            // ignore
          }
        }
      }
    }
  },

  fetchThemes: async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const res = await fetch('/api/themes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const list: CustomThemeItem[] = Array.isArray(data.themes) ? data.themes : [];
      runtimeCustomThemes = list;
      set({ customThemes: list });
      applyThemeToDom(get().theme, list);
    } catch {
      // ignore
    }
  },

  importCustomTheme: async (payload) => {
    const token = localStorage.getItem('access_token');
    const res = await fetch('/api/themes/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || '导入风格失败');
    await get().fetchThemes();
  },

  updateCustomTheme: async (themeId, payload) => {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`/api/themes/${encodeURIComponent(themeId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || '更新风格失败');
    await get().fetchThemes();
  },

  deleteCustomTheme: async (themeId) => {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`/api/themes/${encodeURIComponent(themeId)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || '删除风格失败');
    const nextList = get().customThemes.filter((item) => item.id !== themeId);
    const current = get().currentUser;
    const currentWasCustom = get().theme === themeId;
    const nextTheme: ThemeMode = currentWasCustom ? 'dark' : get().theme;
    runtimeCustomThemes = nextList;
    if (current && current.theme === themeId) {
      const updated = { ...current, theme: 'dark' as ThemeMode };
      localStorage.setItem('app_current_user', JSON.stringify(updated));
      localStorage.setItem(getUserThemeStorageKey(current), 'dark');
      set({ currentUser: updated });
    }
    set({ customThemes: nextList, theme: nextTheme });
    applyThemeToDom(nextTheme, nextList);
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
      applyThemeToDom(nextTheme, get().customThemes);
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
    applyThemeToDom('dark', get().customThemes);
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

  uploadAvatar: async (file: File) => {
    const token = localStorage.getItem('access_token');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/auth/avatar', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '上传头像失败');
    }
    const data = await res.json();
    const nextUrl = String(data.avatarUrl || '');
    set((state) => {
      if (!state.currentUser) return state;
      const uid = state.currentUser.id;
      const nextUsers = state.users.map((u) =>
        u.id === uid ? { ...u, avatarUrl: nextUrl } : u
      );
      const nextCurrent = { ...state.currentUser, avatarUrl: nextUrl };
      localStorage.setItem('app_current_user', JSON.stringify(nextCurrent));
      return { users: nextUsers, currentUser: nextCurrent };
    });
    return nextUrl;
  },

  resetAvatar: async () => {
    const token = localStorage.getItem('access_token');
    const res = await fetch('/api/auth/avatar', {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '重置头像失败');
    }
    set((state) => {
      if (!state.currentUser) return state;
      const uid = state.currentUser.id;
      const nextUsers = state.users.map((u) =>
        u.id === uid ? { ...u, avatarUrl: null } : u
      );
      const nextCurrent = { ...state.currentUser, avatarUrl: null };
      localStorage.setItem('app_current_user', JSON.stringify(nextCurrent));
      return { users: nextUsers, currentUser: nextCurrent };
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
