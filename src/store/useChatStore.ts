// src/store/useChatStore.ts
import { create } from 'zustand';

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  time: string;
  attachedFiles?: AttachedFile[];
  generatedFile?: {
    name: string;
    path: string;
    size: string;
  };
}

interface ChatStore {
  messages: Message[];
  isThinking: boolean;
  selectedProject: string;
  syncStatus: 'synced' | 'syncing';
  lastSyncTime: string;
  contextTurnCount: number; // 当前 AI 记忆上下文轮数

  // 动作
  setThinking: (val: boolean) => void;
  setSelectedProject: (proj: string) => void;
  setSyncStatus: (status: 'synced' | 'syncing', time?: string) => void;
  addMessage: (msg: Message) => void;
  
  // 删除与记忆重置核心方法
  deleteMessage: (id: string) => void;
  batchDeleteMessages: (ids: string[]) => void;
  clearAllMessages: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [
    {
      id: 'msg_init',
      sender: 'ai',
      text: '你好！我是本地 AI 协同智能体。当前已挂载本地主机知识库，你可以向我提问特定项目资料，或让我提取大纲并写入项目的【输出文件夹】中。',
      time: '11:28'
    }
  ],
  isThinking: false,
  selectedProject: '南方电网',
  syncStatus: 'synced',
  lastSyncTime: '11:30:15',
  contextTurnCount: 1,

  setThinking: (val) => set({ isThinking: val }),
  setSelectedProject: (proj) => set({ selectedProject: proj }),
  setSyncStatus: (status, time) =>
    set((state) => ({
      syncStatus: status,
      lastSyncTime: time || state.lastSyncTime
    })),

  addMessage: (msg) =>
    set((state) => {
      const updated = [...state.messages, msg];
      const validTurns = updated.filter((m) => m.sender !== 'system').length;
      return { messages: updated, contextTurnCount: validTurns };
    }),

  // 单条删除并自动重置 AI 记忆
  deleteMessage: (id) =>
    set((state) => {
      const remaining = state.messages.filter((m) => m.id !== id);
      const validTurns = remaining.filter((m) => m.sender !== 'system').length;
      const systemNotice: Message = {
        id: `sys_${Date.now()}`,
        sender: 'system',
        text: `已删除 1 条对话。AI 历史上下文已重新抓取，当前记忆库重置为剩余 ${validTurns} 条消息。`,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      };
      return {
        messages: [...remaining, systemNotice],
        contextTurnCount: validTurns
      };
    }),

  // 批量删除并自动重置 AI 记忆
  batchDeleteMessages: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      const remaining = state.messages.filter((m) => !idSet.has(m.id));
      const validTurns = remaining.filter((m) => m.sender !== 'system').length;
      const systemNotice: Message = {
        id: `sys_${Date.now()}`,
        sender: 'system',
        text: `已批量清除 ${ids.length} 条对话。AI 历史上下文已即时重构，当前记忆库重置为剩余 ${validTurns} 条消息。`,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      };
      return {
        messages: [...remaining, systemNotice],
        contextTurnCount: validTurns
      };
    }),

  clearAllMessages: () =>
    set({
      messages: [
        {
          id: `sys_reset_${Date.now()}`,
          sender: 'system',
          text: '已清空全部对话历史，AI 上下文记忆已完全归零。',
          time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
        }
      ],
      contextTurnCount: 0
    })
}));