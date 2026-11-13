// src/store/useNoteStore.ts
import { create } from 'zustand';
import { api } from '../utils/api';
import type { CodePage, NoteFolder, NoteItem } from '../types/note';

export type { CodePage, NoteFolder, NoteItem };

// 生成中文日期时间默认标题：Note_2026年11月12日_14点30分00秒
export function formatDefaultNoteTitle(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `Note_${y}年${m}月${d}日_${hh}点${mm}分${ss}秒`;
}

interface NoteStore {
  folders: NoteFolder[];
  notes: NoteItem[];
  selectedFolderId: string | null;
  activeNoteId: string | null;
  isLoading: boolean;

  loadNotesData: () => Promise<void>;
  setSelectedFolderId: (id: string | null) => void;
  setActiveNoteId: (id: string | null) => void;
  createFolder: (name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  saveNote: (payload: {
    id?: string | null;
    folderId: string | null;
    title: string;
    content: string;
    codePages: CodePage[];
  }) => Promise<NoteItem | null>;
  deleteNote: (id: string) => Promise<void>;

  // 预留接口：供后续 AI 助手一键将生成的代码或回答转存为云端笔记
  saveNoteFromAI: (title: string, textContent: string, codeSnippets?: string[]) => Promise<NoteItem | null>;
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  folders: [],
  notes: [],
  selectedFolderId: null,
  activeNoteId: null,
  isLoading: false,

  loadNotesData: async () => {
    set({ isLoading: true });
    try {
      const data = await api.notes.getAll();
      set((state) => ({
        folders: data.folders || [],
        notes: data.notes || [],
        activeNoteId: state.activeNoteId || data.notes?.[0]?.id || null
      }));
    } catch (err) {
      console.error('加载云端笔记失败:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  setActiveNoteId: (id) => set({ activeNoteId: id }),

  createFolder: async (name) => {
    try {
      const created = await api.notes.createFolder(name);
      set((state) => ({
        folders: [...state.folders, created],
        selectedFolderId: created.id
      }));
    } catch (err) {
      console.error('创建笔记文件夹失败:', err);
    }
  },

  deleteFolder: async (id) => {
    try {
      await api.notes.deleteFolder(id);
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== id),
        notes: state.notes.filter((n) => n.folderId !== id),
        selectedFolderId: state.selectedFolderId === id ? null : state.selectedFolderId
      }));
    } catch (err) {
      console.error('删除笔记文件夹失败:', err);
    }
  },

  saveNote: async ({ id, folderId, title, content, codePages }) => {
    const finalTitle = title.trim() || formatDefaultNoteTitle();
    try {
      const saved = await api.notes.save({
        id: id || undefined,
        folder_id: folderId,
        title: finalTitle,
        content,
        code_pages: codePages
      });

      set((state) => {
        const exists = state.notes.some((n) => n.id === saved.id);
        const nextNotes = exists
          ? state.notes.map((n) => (n.id === saved.id ? saved : n))
          : [saved, ...state.notes];
        return { notes: nextNotes, activeNoteId: saved.id };
      });

      return saved;
    } catch (err) {
      console.error('保存笔记失败:', err);
      return null;
    }
  },

  deleteNote: async (id) => {
    try {
      await api.notes.deleteNote(id);
      set((state) => {
        const remaining = state.notes.filter((n) => n.id !== id);
        return {
          notes: remaining,
          activeNoteId: state.activeNoteId === id ? (remaining[0]?.id ?? null) : state.activeNoteId
        };
      });
    } catch (err) {
      console.error('删除笔记失败:', err);
    }
  },

  // 预留给 AI 助手调用的快捷保存接口
  saveNoteFromAI: async (title, textContent, codeSnippets = []) => {
    const pages: CodePage[] = codeSnippets.map((code, idx) => ({
      id: `cp_${Date.now()}_${idx}`,
      title: `AI代码页_${idx + 1}.py`,
      language: 'python',
      code
    }));

    return get().saveNote({
      folderId: null,
      title: title || formatDefaultNoteTitle(),
      content: textContent,
      codePages: pages
    });
  }
}));
