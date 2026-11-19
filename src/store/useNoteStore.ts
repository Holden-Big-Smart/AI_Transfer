// src/store/useNoteStore.ts
import { create } from 'zustand';
import { api } from '../utils/api';
import type { CodePage, NoteFolder, NoteItem, NoteSubBlock } from '../types/note';

export type { CodePage, NoteFolder, NoteItem, NoteSubBlock };

export function formatDefaultNoteTitle(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Note_${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日_${pad(now.getHours())}点${pad(now.getMinutes())}分${pad(now.getSeconds())}秒`;
}

function parseLegacyTextToBlocks(rawText: string): NoteSubBlock[] {
  if (!rawText || !rawText.trim()) {
    return [{ id: `blk_${Date.now()}_0`, type: 'text', content: '', language: 'python', collapsed: false, title: '' }];
  }
  const parts = rawText.split(/```(\w*)\n([\s\S]*?)```/g);
  const blocks: NoteSubBlock[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const textSeg = parts[i];
    const langSeg = parts[i + 1];
    const codeSeg = parts[i + 2];

    blocks.push({
      id: `blk_${Date.now()}_${i}`,
      type: 'text',
      content: textSeg || '',
      language: 'python',
      collapsed: false,
      title: ''
    });

    if (codeSeg !== undefined) {
      blocks.push({
        id: `blk_${Date.now()}_${i + 1}`,
        type: 'code',
        content: codeSeg,
        language: langSeg || 'python',
        collapsed: false,
        title: '代码片段'
      });
    }
  }
  return blocks.length > 0
    ? blocks
    : [{ id: `blk_${Date.now()}_0`, type: 'text', content: rawText, language: 'python', collapsed: false, title: '' }];
}

export function normalizeNoteItem(raw: any): NoteItem {
  const rawPages: any[] = Array.isArray(raw.codePages) ? raw.codePages : [];
  const normalizedPages: CodePage[] = [];

  const hasNotePageAlready = rawPages.some((p) => p.pageType === 'note');
  if (raw.content && raw.content.trim() && !hasNotePageAlready) {
    normalizedPages.push({
      id: `np_legacy_${raw.id}`,
      title: '笔记正文',
      pageType: 'note',
      language: 'markdown',
      code: '',
      blocks: parseLegacyTextToBlocks(raw.content)
    });
  }

  for (let idx = 0; idx < rawPages.length; idx++) {
    const p = rawPages[idx];
    const pType: 'note' | 'code' = p.pageType === 'note' ? 'note' : 'code';
    const blocks: NoteSubBlock[] =
      pType === 'note'
        ? Array.isArray(p.blocks) && p.blocks.length > 0
          ? p.blocks
          : parseLegacyTextToBlocks(p.code || '')
        : [];

    normalizedPages.push({
      id: p.id || `pg_${Date.now()}_${idx}`,
      title: p.title || (pType === 'note' ? `笔记_${idx + 1}` : `片段_${idx + 1}.py`),
      pageType: pType,
      language: p.language || 'python',
      code: p.code || '',
      blocks
    });
  }

  if (normalizedPages.length === 0) {
    normalizedPages.push({
      id: `pg_default_${Date.now()}`,
      title: '笔记_1',
      pageType: 'note',
      language: 'python',
      code: '',
      blocks: [{ id: `blk_init_${Date.now()}`, type: 'text', content: '', language: 'python', collapsed: false, title: '' }]
    });
  }

  return {
    id: raw.id,
    folderId: raw.folderId ?? null,
    title: raw.title || '未命名笔记',
    content: '',
    codePages: normalizedPages,
    isPublic: Boolean(raw.isPublic),
    isOwner: raw.isOwner !== undefined ? Boolean(raw.isOwner) : true,
    authorName: raw.authorName || '',
    updatedAt: raw.updatedAt || '',
    version: raw.version
  };
}

interface NoteStore {
  folders: NoteFolder[];
  notes: NoteItem[];
  selectedFolderId: string | null;
  activeNoteId: string | null;
  isLoading: boolean;
  serverVersion: string;

  loadNotesData: (silent?: boolean) => Promise<void>;
  checkRemoteVersion: () => Promise<boolean>;
  setSelectedFolderId: (id: string | null) => void;
  setActiveNoteId: (id: string | null) => void;
  createFolder: (name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  saveNote: (payload: {
    id?: string | null;
    folderId: string | null;
    title: string;
    content?: string;
    codePages: CodePage[];
    isPublic?: boolean;
  }) => Promise<NoteItem | null>;
  toggleNotePublic: (noteId: string, isPublic: boolean) => Promise<boolean>;
  deleteNote: (id: string) => Promise<void>;
  importNotesBackup: (backupData: { folders?: Array<{ name: string }>; notes?: any[] }) => Promise<number>;
  saveNoteFromAI: (title: string, textContent: string, codeSnippets?: string[]) => Promise<NoteItem | null>;
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  folders: [],
  notes: [],
  selectedFolderId: null,
  activeNoteId: null,
  isLoading: false,
  serverVersion: '',

  loadNotesData: async (silent = false) => {
    if (!silent) set({ isLoading: true });
    try {
      const data = await api.notes.getAll();
      const normalized = (data.notes || []).map(normalizeNoteItem);
      set((state) => {
        const keepActive = normalized.some((n) => n.id === state.activeNoteId);
        return {
          folders: data.folders || [],
          notes: normalized,
          activeNoteId: keepActive ? state.activeNoteId : (normalized[0]?.id ?? null),
          serverVersion: data.version || state.serverVersion
        };
      });
    } catch (err) {
      console.error('加载云端笔记失败:', err);
    } finally {
      if (!silent) set({ isLoading: false });
    }
  },

  checkRemoteVersion: async () => {
    try {
      const res = await api.notes.getVersion();
      const currentVer = get().serverVersion;
      if (currentVer && res.version && res.version !== currentVer) {
        return true;
      }
      if (!currentVer && res.version) {
        set({ serverVersion: res.version });
      }
      return false;
    } catch {
      return false;
    }
  },

  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  setActiveNoteId: (id) => set({ activeNoteId: id }),

  createFolder: async (name) => {
    const created = await api.notes.createFolder(name);
    set((state) => ({ folders: [...state.folders, created], selectedFolderId: created.id }));
  },

  deleteFolder: async (id) => {
    await api.notes.deleteFolder(id);
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      notes: state.notes.filter((n) => n.folderId !== id),
      selectedFolderId: state.selectedFolderId === id ? null : state.selectedFolderId
    }));
  },

  saveNote: async ({ id, folderId, title, codePages, isPublic }) => {
    const finalTitle = title.trim() || formatDefaultNoteTitle();
    try {
      const res = await api.notes.save({
        id: id || undefined,
        folder_id: folderId,
        title: finalTitle,
        content: '',
        code_pages: codePages,
        is_public: isPublic
      });
      const saved = normalizeNoteItem(res);
      const nextVersion = typeof res?.version === 'string' ? res.version : '';

      set((state) => {
        const exists = state.notes.some((n) => n.id === saved.id);
        const nextNotes = exists
          ? state.notes.map((n) => (n.id === saved.id ? saved : n))
          : [saved, ...state.notes];
        return {
          notes: nextNotes,
          activeNoteId: saved.id,
          serverVersion: nextVersion || state.serverVersion
        };
      });
      return saved;
    } catch (err) {
      console.error('保存笔记失败:', err);
      return null;
    }
  },

  toggleNotePublic: async (noteId, isPublic) => {
    try {
      const res = await api.notes.togglePublic(noteId, isPublic);
      set((state) => ({
        notes: state.notes.map((n) => (n.id === noteId ? { ...n, isPublic: res.isPublic } : n)),
        serverVersion: res.version || state.serverVersion
      }));
      return true;
    } catch (err) {
      console.error('切换笔记公开状态失败:', err);
      return false;
    }
  },

  deleteNote: async (id) => {
    await api.notes.deleteNote(id);
    set((state) => {
      const remaining = state.notes.filter((n) => n.id !== id);
      return {
        notes: remaining,
        activeNoteId: state.activeNoteId === id ? (remaining[0]?.id ?? null) : state.activeNoteId
      };
    });
  },

  saveNoteFromAI: async (title, textContent, codeSnippets = []) => {
    const pages: CodePage[] = [];
    if (textContent.trim()) {
      pages.push({
        id: `np_ai_${Date.now()}`,
        title: 'AI说明笔记',
        pageType: 'note',
        language: 'python',
        code: '',
        blocks: [{ id: `blk_${Date.now()}`, type: 'text', content: textContent, language: 'python', collapsed: false, title: '' }]
      });
    }
    codeSnippets.forEach((code, idx) => {
      pages.push({
        id: `cp_ai_${Date.now()}_${idx}`,
        title: `AI代码_${idx + 1}.py`,
        pageType: 'code',
        language: 'python',
        code,
        blocks: []
      });
    });
    return get().saveNote({
      folderId: null,
      title: title || formatDefaultNoteTitle(),
      codePages: pages
    });
  },

  // 批量导入还原 .note.json 备份数据
  importNotesBackup: async (backupData) => {
    const state = get();
    const folderNameMap = new Map<string, string>();
    state.folders.forEach((f) => folderNameMap.set(f.name, f.id));

    if (Array.isArray(backupData.folders)) {
      for (const f of backupData.folders) {
        if (f.name && !folderNameMap.has(f.name)) {
          const created = await api.notes.createFolder(f.name);
          folderNameMap.set(created.name, created.id);
        }
      }
    }

    let importedCount = 0;
    if (Array.isArray(backupData.notes)) {
      for (const rawNote of backupData.notes) {
        const normalized = normalizeNoteItem(rawNote);
        let targetFolderId = state.selectedFolderId;
        if (rawNote.folderName && folderNameMap.has(rawNote.folderName)) {
          targetFolderId = folderNameMap.get(rawNote.folderName) || null;
        }
        await api.notes.save({
          folder_id: targetFolderId,
          title: normalized.title || formatDefaultNoteTitle(),
          content: '',
          code_pages: normalized.codePages,
          is_public: Boolean(normalized.isPublic)
        });
        importedCount++;
      }
    }

    await get().loadNotesData();
    return importedCount;
  }
}));
