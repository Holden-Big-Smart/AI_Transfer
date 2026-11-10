// src/store/useAuthStore.ts
import { create } from 'zustand';

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

// 预设默认账号：管理员 admin / admin123
const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'u_admin',
    username: 'admin',
    name: '超级管理员',
    role: 'admin',
    password: 'admin123',
    mustChangePassword: false,
    allowedProjects: ['南方电网', 'Cyber_EcoTank', '通用公用库'],
    createdAt: '2026-11-10',
  }
];

interface AuthStore {
  users: UserAccount[];
  currentUser: UserAccount | null;

  // 认证与会话动作
  login: (username: string, password?: string) => { success: boolean; message?: string; mustChange?: boolean };
  logout: () => void;
  guestLogin: () => void;

  // 账户管理动作
  createUser: (username: string, name: string, allowedProjects: string[]) => { user: UserAccount; initialPass: string };
  deleteUser: (id: string) => void;
  changePassword: (userId: string, newPass: string) => void;
}

// 读取本地存储中的用户列表，保证刷新不丢数据
const getStoredUsers = (): UserAccount[] => {
  const data = localStorage.getItem('app_user_accounts');
  return data ? JSON.parse(data) : DEFAULT_USERS;
};

const getStoredCurrentUser = (): UserAccount | null => {
  const data = localStorage.getItem('app_current_user');
  return data ? JSON.parse(data) : DEFAULT_USERS[0]; // 默认以管理员免登或 null
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  users: getStoredUsers(),
  currentUser: getStoredCurrentUser(),

  login: (username, password) => {
    const user = get().users.find((u) => u.username === username);
    if (!user) {
      return { success: false, message: '账号不存在' };
    }
    if (user.password !== password) {
      return { success: false, message: '密码错误' };
    }

    set({ currentUser: user });
    localStorage.setItem('app_current_user', JSON.stringify(user));

    if (user.mustChangePassword) {
      return { success: true, mustChange: true };
    }
    return { success: true };
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
    set({ currentUser: null });
    localStorage.removeItem('app_current_user');
  },

  // 管理员创建用户，分配随机密码，标记首次改密
  createUser: (username, name, allowedProjects) => {
    // 生成 8 位包含大小写和数字的随机密码
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let initialPass = '';
    for (let i = 0; i < 8; i++) {
      initialPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const newUser: UserAccount = {
      id: `u_${Date.now()}`,
      username: username.trim(),
      name: name.trim() || username.trim(),
      role: 'user',
      password: initialPass,
      mustChangePassword: true, // 核心逻辑：初次登录必须强制改密
      allowedProjects: allowedProjects,
      createdAt: new Date().toLocaleDateString('zh-CN'),
    };

    const updatedUsers = [...get().users, newUser];
    set({ users: updatedUsers });
    localStorage.setItem('app_user_accounts', JSON.stringify(updatedUsers));

    return { user: newUser, initialPass };
  },

  deleteUser: (id) => {
    const updatedUsers = get().users.filter((u) => u.id !== id);
    set({ users: updatedUsers });
    localStorage.setItem('app_user_accounts', JSON.stringify(updatedUsers));
  },

  changePassword: (userId, newPass) => {
    const updatedUsers = get().users.map((u) =>
      u.id === userId ? { ...u, password: newPass, mustChangePassword: false } : u
    );

    // 如果当前登录的就是该用户，同步更新状态
    const updatedCurrentUser = get().currentUser?.id === userId
      ? { ...get().currentUser!, password: newPass, mustChangePassword: false }
      : get().currentUser;

    set({ users: updatedUsers, currentUser: updatedCurrentUser });
    localStorage.setItem('app_user_accounts', JSON.stringify(updatedUsers));
    if (updatedCurrentUser) {
      localStorage.setItem('app_current_user', JSON.stringify(updatedCurrentUser));
    }
  },
}));
