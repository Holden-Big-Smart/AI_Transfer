// src/store/useAuthStore.ts
import { create } from 'zustand';

export type UserRole = 'admin' | 'user' | 'guest';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  allowedProjects: string[]; // 允许访问的主机项目目录
  canUpload: boolean;
  canDelete: boolean;
}

const MOCK_PROFILES: Record<UserRole, UserProfile> = {
  admin: {
    id: 'u_admin',
    name: '管理员',
    role: 'admin',
    allowedProjects: ['南方电网', 'Cyber_EcoTank', '通用公用库'],
    canUpload: true,
    canDelete: true,
  },
  user: {
    id: 'u_ae',
    name: 'AE 业务助理',
    role: 'user',
    allowedProjects: ['南方电网'], // 仅授权特定项目
    canUpload: true,
    canDelete: false, // 禁止删除权限
  },
  guest: {
    id: 'u_guest',
    name: '访客 (只读)',
    role: 'guest',
    allowedProjects: [], // 无内部私有知识库权限
    canUpload: false,
    canDelete: false,
  },
};

interface AuthStore {
  currentUser: UserProfile;
  switchRole: (role: UserRole) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  currentUser: MOCK_PROFILES.admin, // 默认以管理员启动
  switchRole: (role) => set({ currentUser: MOCK_PROFILES[role] }),
}));