// src/store/useAuthStore.ts
import { create } from 'zustand';
import {
  Sparkles,
  Box,
  Shield,
  Activity,
  Hexagon,
  Layers,
  Zap,
  Star,
  Flame,
  Compass,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../utils/api';

export type UserRole = 'admin' | 'user' | 'guest';
export type ThemeMode = 'dark' | 'light' | 'eyecare' | (string & {});

export const LOGO_ICONS = [
  'ring',
  'sparkle',
  'cube',
  'shield',
  'pulse',
  'hexagon',
  'layers',
  'zap',
  'star',
  'flame',
  'compass',
  'target',
] as const;
export type LogoIcon = (typeof LOGO_ICONS)[number];

export const LOGO_ICON_LABELS: Record<LogoIcon, string> = {
  ring: '空心圆环',
  sparkle: '星芒',
  cube: '立方',
  shield: '盾牌',
  pulse: '脉冲',
  hexagon: '六边形',
  layers: '层叠',
  zap: '闪电',
  star: '星形',
  flame: '火焰',
  compass: '罗盘',
  target: '靶心',
};

export const LOGO_ICON_COMPONENTS: Record<Exclude<LogoIcon, 'ring'>, LucideIcon> = {
  sparkle: Sparkles,
  cube: Box,
  shield: Shield,
  pulse: Activity,
  hexagon: Hexagon,
  layers: Layers,
  zap: Zap,
  star: Star,
  flame: Flame,
  compass: Compass,
  target: Target,
};

export const isLogoIcon = (value: unknown): value is LogoIcon =>
  typeof value === 'string' && (LOGO_ICONS as readonly string[]).includes(value);

export interface ThemeLogo {
  icon: LogoIcon;
  fg: string;
  bg: string;
}

export interface CustomThemeItem {
  id: string;
  name: string;
  description?: string;
  colors: Record<string, string>;
  updatedAt?: string;
  isBuiltin?: boolean;
  logo?: ThemeLogo;
  activeInMenu?: boolean;
  readonly?: boolean;
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
  themes: CustomThemeItem[];
  noteAutoSave: boolean;
  fetchUsers: () => Promise<void>;
  syncCurrentUser: () => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  fetchThemes: () => Promise<void>;
  toggleThemeInMenu: (themeId: string) => void;
  importCustomTheme: (payload: {
    id?: string;
    name: string;
    description?: string;
    logo?: ThemeLogo;
    activeInMenu?: boolean;
    colors: Record<string, string>;
  }) => Promise<void>;
  updateCustomTheme: (
    themeId: string,
    payload: {
      name: string;
      description?: string;
      logo?: ThemeLogo;
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

export const THEME_COLOR_FIELDS = [
  { key: '--bg-base', label: '主背景', description: '页面整体背景色' },
  { key: '--bg-surface', label: '卡片面', description: '主要卡片与面板表面色' },
  { key: '--bg-surface-alt', label: '次卡片', description: '次级卡片与列表项背景色' },
  { key: '--bg-sidebar', label: '侧边栏', description: '左侧导航栏背景色' },
  { key: '--bg-panel', label: '面板区', description: '独立面板区域背景色' },
  { key: '--bg-input', label: '输入框', description: '输入框与文本域背景色' },
  { key: '--bg-hover', label: '悬浮底', description: '鼠标悬浮时的背景色' },
  { key: '--bg-hover-strong', label: '强悬浮', description: '强调悬浮与按钮背景色' },
  { key: '--text-primary', label: '主文字', description: '标题与正文主文字色' },
  { key: '--text-secondary', label: '次文字', description: '次要说明文字色' },
  { key: '--text-muted', label: '弱文字', description: '弱化提示文字色' },
  { key: '--text-subtle', label: '极弱字', description: '占位与极弱提示文字色' },
  { key: '--border-main', label: '主边框', description: '主要分隔线与边框色' },
  { key: '--border-subtle', label: '弱边框', description: '浅色分隔线与边框色' },
  { key: '--chart-free', label: '空闲轨', description: '存储环形图空闲轨道色' },
] as const;

const CUSTOM_THEME_VAR_KEYS = [
  ...THEME_COLOR_FIELDS.map((field) => field.key),
  '--logo-bg',
  '--logo-fg',
];

export const DEFAULT_THEME_COLORS: Record<string, string> = {
  '--bg-base': '#1e2128',
  '--bg-surface': '#2a2d35',
  '--bg-surface-alt': '#252830',
  '--bg-sidebar': '#16181d',
  '--bg-panel': '#191b22',
  '--bg-input': '#1a1c23',
  '--bg-hover': '#323640',
  '--bg-hover-strong': '#374151',
  '--text-primary': '#f3f4f6',
  '--text-secondary': '#d1d5db',
  '--text-muted': '#9ca3af',
  '--text-subtle': '#6b7280',
  '--border-main': '#374151',
  '--border-subtle': '#1f2937',
  '--chart-free': '#374151',
  '--logo-bg': '#2563eb',
  '--logo-fg': '#ffffff',
};

const BUILTIN_THEME_DEFS: CustomThemeItem[] = [
  {
    id: 'dark',
    name: '暗色',
    description: '深邃护眼默认主题',
    colors: { ...DEFAULT_THEME_COLORS },
    isBuiltin: true,
    readonly: true,
    activeInMenu: true,
    logo: { icon: 'ring', fg: '#ffffff', bg: '#2563eb' },
  },
  {
    id: 'light',
    name: '亮色',
    description: '清爽高亮日间办公',
    colors: {
      '--bg-base': '#f3f4f6',
      '--bg-surface': '#ffffff',
      '--bg-surface-alt': '#ffffff',
      '--bg-sidebar': '#ffffff',
      '--bg-panel': '#f8fafc',
      '--bg-input': '#f9fafb',
      '--bg-hover': '#e5e7eb',
      '--bg-hover-strong': '#d1d5db',
      '--text-primary': '#111827',
      '--text-secondary': '#1f2937',
      '--text-muted': '#4b5563',
      '--text-subtle': '#6b7280',
      '--border-main': '#d1d5db',
      '--border-subtle': '#e5e7eb',
      '--chart-free': '#e5e7eb',
      '--logo-bg': '#2563eb',
      '--logo-fg': '#ffffff',
    },
    isBuiltin: true,
    readonly: false,
    activeInMenu: true,
    logo: { icon: 'sparkle', fg: '#ffffff', bg: '#2563eb' },
  },
  {
    id: 'eyecare',
    name: '护眼',
    description: '柔和暖纸长时阅读',
    colors: {
      '--bg-base': '#ede7d9',
      '--bg-surface': '#f7f3e8',
      '--bg-surface-alt': '#f5f0e3',
      '--bg-sidebar': '#e6dfd0',
      '--bg-panel': '#efe9dc',
      '--bg-input': '#faf7ef',
      '--bg-hover': '#dfd7c5',
      '--bg-hover-strong': '#d3c9b4',
      '--text-primary': '#2c2820',
      '--text-secondary': '#3f3a30',
      '--text-muted': '#655e50',
      '--text-subtle': '#7e7666',
      '--border-main': '#cfc6b2',
      '--border-subtle': '#dcd4c2',
      '--chart-free': '#dcd4c2',
      '--logo-bg': '#b45309',
      '--logo-fg': '#fffbeb',
    },
    isBuiltin: true,
    readonly: false,
    activeInMenu: true,
    logo: { icon: 'layers', fg: '#fffbeb', bg: '#b45309' },
  },
];

const MENU_ACTIVE_KEY = 'app_theme_menu_active';
const BUILTIN_OVERRIDE_KEY = 'app_theme_builtin_overrides';

function readStorageRecord<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorageRecord<T>(key: string, value: Record<string, T>) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function getThemeLogo(item: CustomThemeItem | null | undefined): ThemeLogo {
  const legacy = item as (CustomThemeItem & { logoShape?: unknown }) | null | undefined;
  const raw = item?.logo;
  const rawIconValue: unknown = raw?.icon;
  const rawIcon = rawIconValue === 'ai' ? 'ring' : rawIconValue;
  const legacyIcon = legacy?.logoShape === 'ai' ? 'ring' : legacy?.logoShape;
  return {
    icon: isLogoIcon(rawIcon)
      ? rawIcon
      : isLogoIcon(legacyIcon)
        ? legacyIcon
        : 'ring',
    fg: raw?.fg || item?.colors?.['--logo-fg'] || '#ffffff',
    bg: raw?.bg || item?.colors?.['--logo-bg'] || '#2563eb',
  };
}

function stripLegacyLogoColors(colors: Record<string, string>): Record<string, string> {
  const next = { ...(colors || {}) };
  delete next['--logo-border'];
  return next;
}

export function getAllThemes(customThemes: CustomThemeItem[]): CustomThemeItem[] {
  const menuFlags = readStorageRecord<boolean>(MENU_ACTIVE_KEY);
  const overrides = readStorageRecord<Partial<CustomThemeItem>>(BUILTIN_OVERRIDE_KEY);
  const builtins = BUILTIN_THEME_DEFS.map((item) => {
    const override = overrides[item.id];
    const merged: CustomThemeItem = {
      ...item,
      name: override?.name || item.name,
      description: override?.description ?? item.description,
      logo: override?.logo || item.logo,
      colors: stripLegacyLogoColors({ ...item.colors, ...(override?.colors || {}) }),
      activeInMenu: menuFlags[item.id] !== false,
    };
    return { ...merged, logo: getThemeLogo(merged) };
  });

  const seen = new Set<string>(builtins.map((item) => item.id));
  const customs = customThemes
    .filter((item) => Boolean(item && typeof item.id === 'string' && item.id.trim() && !seen.has(item.id)))
    .map((item) => {
      seen.add(item.id);
      const merged: CustomThemeItem = {
        ...item,
        colors: stripLegacyLogoColors(item.colors),
        activeInMenu: menuFlags[item.id] !== false,
      };
      return { ...merged, logo: getThemeLogo(merged) };
    });

  return [...builtins, ...customs];
}

let runtimeAllThemes: CustomThemeItem[] = getAllThemes([]);

export function sanitizeTheme(val: unknown): ThemeMode {
  if (typeof val !== 'string') return 'dark';
  const trimmed = val.trim();
  return trimmed || 'dark';
}

function isLightColor(value: unknown): boolean {
  const hex = String(value || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 180;
}

export function applyThemeToDom(
  theme: ThemeMode,
  allThemes: CustomThemeItem[] = runtimeAllThemes
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const key of CUSTOM_THEME_VAR_KEYS) {
    root.style.removeProperty(key);
  }
  const found = allThemes.find((item) => item.id === theme);
  const appearance: BuiltinTheme = found
    ? found.id === 'light'
      ? 'light'
      : found.id === 'eyecare'
        ? 'eyecare'
        : isLightColor(found.colors?.['--bg-base'])
          ? 'light'
          : 'dark'
    : isBuiltinTheme(theme)
      ? theme
      : 'dark';
  root.setAttribute('data-theme', appearance);
  if (found) {
    for (const [key, value] of Object.entries(found.colors || {})) {
      if ((CUSTOM_THEME_VAR_KEYS as readonly string[]).includes(key) && typeof value === 'string' && value.trim()) {
        root.style.setProperty(key, value.trim());
      }
    }
    const logo = getThemeLogo(found);
    root.style.setProperty('--logo-fg', logo.fg);
    root.style.setProperty('--logo-bg', logo.bg);
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
  themes: getAllThemes([]),
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
      applyThemeToDom(nextTheme, get().themes);
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
    const allThemes = get().themes;
    const isCustom = allThemes.some((item) => item.id === safe && !item.isBuiltin);
    applyThemeToDom(safe, allThemes);
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
      const list = (Array.isArray(data.themes) ? data.themes : []) as CustomThemeItem[];
      const all = getAllThemes(list);
      runtimeAllThemes = all;
      set({ customThemes: list, themes: all });
      applyThemeToDom(get().theme, all);
    } catch {
      // ignore
    }
  },

  toggleThemeInMenu: (themeId) => {
    const flags = readStorageRecord<boolean>(MENU_ACTIVE_KEY);
    flags[themeId] = flags[themeId] === false;
    writeStorageRecord(MENU_ACTIVE_KEY, flags);
    const all = getAllThemes(get().customThemes);
    runtimeAllThemes = all;
    set({ themes: all });
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
    if (isBuiltinTheme(themeId)) {
      const def = runtimeAllThemes.find((item) => item.id === themeId);
      if (!def || def.readonly) throw new Error('该内置主题方案为只读，无法修改');
      const overrides = readStorageRecord<Partial<CustomThemeItem>>(BUILTIN_OVERRIDE_KEY);
      overrides[themeId] = {
        name: payload.name,
        description: payload.description,
        colors: payload.colors,
        logo: payload.logo,
      };
      writeStorageRecord(BUILTIN_OVERRIDE_KEY, overrides);
      const all = getAllThemes(get().customThemes);
      runtimeAllThemes = all;
      set({ themes: all });
      applyThemeToDom(get().theme, all);
      return;
    }
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
    runtimeAllThemes = getAllThemes(nextList);
    if (current && current.theme === themeId) {
      const updated = { ...current, theme: 'dark' as ThemeMode };
      localStorage.setItem('app_current_user', JSON.stringify(updated));
      localStorage.setItem(getUserThemeStorageKey(current), 'dark');
      set({ currentUser: updated });
    }
    set({ customThemes: nextList, themes: runtimeAllThemes, theme: nextTheme });
    applyThemeToDom(nextTheme, runtimeAllThemes);
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
      applyThemeToDom(nextTheme, get().themes);
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
    applyThemeToDom('dark', get().themes);
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
