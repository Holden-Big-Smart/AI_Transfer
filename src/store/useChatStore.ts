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

// 新增：历史会话接口
export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  project: string;
  messages: Message[];
}

interface ChatStore {
  // 新增会话相关字段与动作
  sessions: ChatSession[];
  currentSessionId: string;
  createNewSession: (project?: string) => void;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;

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

const initialMessage: Message = {
  id: 'msg_init',
  sender: 'ai',
  text: '你好！我是本地 AI 协同智能体。当前已挂载本地主机知识库，你可以向我提问特定项目资料，或让我提取大纲并写入项目的【输出文件夹】中。',
  time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
};

const initialSessionId = `session_${Date.now()}`;

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [
    {
      id: initialSessionId,
      title: '默认会话',
      updatedAt: new Date().toLocaleDateString('zh-CN'),
      project: '南方电网',
      messages: [initialMessage]
    }
  ],
  currentSessionId: initialSessionId,
  messages: [initialMessage],
  isThinking: false,
  selectedProject: '南方电网',
  syncStatus: 'synced',
  lastSyncTime: '11:30:15',
  contextTurnCount: 1,

  setThinking: (val) => set({ isThinking: val }),
  setSelectedProject: (proj) => set({ selectedProject: proj }),
  setSyncStatus: (status, time) =>
    set((state) => ({ syncStatus: status, lastSyncTime: time || state.lastSyncTime })),

  // 新增：开启新会话（自动保存旧会话，开辟新记忆空间）
  createNewSession: (project) =>
    set((state) => {
      const newId = `session_${Date.now()}`;
      const targetProj = project || state.selectedProject;
      const freshSession: ChatSession = {
        id: newId,
        title: '新会话',
        updatedAt: new Date().toLocaleDateString('zh-CN'),
        project: targetProj,
        messages: [initialMessage]
      };
      return {
        sessions: [freshSession, ...state.sessions],
        currentSessionId: newId,
        messages: freshSession.messages,
        selectedProject: targetProj,
        contextTurnCount: 1
      };
    }),

  // 新增：切换至指定历史会话
  switchSession: (sessionId) =>
    set((state) => {
      const target = state.sessions.find((s) => s.id === sessionId);
      if (!target) return state;
      const validTurns = target.messages.filter((m) => m.sender !== 'system').length;
      return {
        currentSessionId: target.id,
        messages: target.messages,
        selectedProject: target.project,
        contextTurnCount: validTurns
      };
    }),

  // 新增：删除指定历史会话
  deleteSession: (sessionId) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      if (remaining.length === 0) {
        // 如果删光了，自动重建一个空会话兜底
        const newId = `session_${Date.now()}`;
        const fallback: ChatSession = {
          id: newId,
          title: '默认会话',
          updatedAt: new Date().toLocaleDateString('zh-CN'),
          project: '南方电网',
          messages: [initialMessage]
        };
        return {
          sessions: [fallback],
          currentSessionId: newId,
          messages: fallback.messages,
          contextTurnCount: 1
        };
      }

      // 如果删除了当前正在浏览的会话，自动跳到第一个可用会话
      const nextActive = state.currentSessionId === sessionId ? remaining[0] : null;
      return {
        sessions: remaining,
        currentSessionId: nextActive ? nextActive.id : state.currentSessionId,
        messages: nextActive ? nextActive.messages : state.messages,
        selectedProject: nextActive ? nextActive.project : state.selectedProject,
        contextTurnCount: nextActive
          ? nextActive.messages.filter((m) => m.sender !== 'system').length
          : state.contextTurnCount
      };
    }),

  // 更新 addMessage：支持同步更新当前 Session，并在首条用户消息时自动提取会话标题
  addMessage: (msg) =>
    set((state) => {
      const updatedMessages = [...state.messages, msg];
      const validTurns = updatedMessages.filter((m) => m.sender !== 'system').length;

      const updatedSessions = state.sessions.map((s) => {
        if (s.id === state.currentSessionId) {
          // 如果是“新会话”且这是第一条用户提问，自动将会话重命名为提问前 16 个字
          let newTitle = s.title;
          if (s.title === '新会话' || s.title === '默认会话') {
            if (msg.sender === 'user' && msg.text) {
              newTitle = msg.text.slice(0, 16);
            }
          }
          return {
            ...s,
            title: newTitle,
            updatedAt: new Date().toLocaleDateString('zh-CN'),
            messages: updatedMessages
          };
        }
        return s;
      });

      return {
        messages: updatedMessages,
        sessions: updatedSessions,
        contextTurnCount: validTurns
      };
    }),

  deleteMessage: (id) =>
    set((state) => {
      const remaining = state.messages.filter((m) => m.id !== id);
      const validTurns = remaining.filter((m) => m.sender !== 'system').length;
      const systemNotice: Message = {
        id: `sys_${Date.now()}`,
        sender: 'system',
        text: `已删除 1 条对话。AI 上下文已重置为剩余 ${validTurns} 条消息。`,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      };
      const finalMessages = [...remaining, systemNotice];
      const updatedSessions = state.sessions.map((s) =>
        s.id === state.currentSessionId ? { ...s, messages: finalMessages } : s
      );
      return { messages: finalMessages, sessions: updatedSessions, contextTurnCount: validTurns };
    }),

  batchDeleteMessages: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      const remaining = state.messages.filter((m) => !idSet.has(m.id));
      const validTurns = remaining.filter((m) => m.sender !== 'system').length;
      const systemNotice: Message = {
        id: `sys_${Date.now()}`,
        sender: 'system',
        text: `已批量清除 ${ids.length} 条对话。当前记忆重置为剩余 ${validTurns} 条消息。`,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      };
      const finalMessages = [...remaining, systemNotice];
      const updatedSessions = state.sessions.map((s) =>
        s.id === state.currentSessionId ? { ...s, messages: finalMessages } : s
      );
      return { messages: finalMessages, sessions: updatedSessions, contextTurnCount: validTurns };
    }),

  clearAllMessages: () =>
    set((state) => {
      const resetMsg: Message = {
        id: `sys_reset_${Date.now()}`,
        sender: 'system',
        text: '已清空当前会话，AI 记忆已归零。',
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      };
      const updatedSessions = state.sessions.map((s) =>
        s.id === state.currentSessionId ? { ...s, messages: [resetMsg] } : s
      );
      return { messages: [resetMsg], sessions: updatedSessions, contextTurnCount: 0 };
    })
}));
