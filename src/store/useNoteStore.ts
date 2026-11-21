// src/store/useNoteStore.ts
import { create } from 'zustand';
import { api } from '../utils/api';

// 旧版笔记子块结构（保留以兼容存量笔记和旧备份包无损迁移）
export interface NoteSubBlock {
  id: string;
  type: 'text' | 'code' | 'image';
  content: string;
  language: string;
  collapsed: boolean;
  title: string;
  imageUrl?: string;
  imageWidth?: number;
}

// 统一页面结构：笔记页 ('note'，使用 richContent 富文本 HTML) 或代码页 ('code')
export interface CodePage {
  id: string;
  title: string;
  pageType: 'note' | 'code';
  language: string;
  code: string;
  blocks: NoteSubBlock[];
  richContent?: string;
}

export interface NoteFolder {
  id: string;
  name: string;
  created_at: string;
}

export interface NoteItem {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  codePages: CodePage[];
  isPublic?: boolean;
  isOwner?: boolean;
  authorName?: string;
  updatedAt: string;
  version?: string;
}

export function formatDefaultNoteTitle(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Note_${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日_${pad(now.getHours())}点${pad(now.getMinutes())}分${pad(now.getSeconds())}秒`;
}

function escapeHtmlText(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

function formatLegacyInline(text: string): string {
  let html = escapeHtmlText(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return html;
}

// 将旧版 blocks 数组（文本/折叠代码窗/图片）无损转换为新版 TipTap 富文本 HTML
export function blocksToRichHtml(blocks: NoteSubBlock[]): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return '<p></p>';
  const parts: string[] = [];

  for (const blk of blocks) {
    if (blk.type === 'code') {
      parts.push(
        `<div data-type="collapsible-code-block" data-code="${escapeHtmlAttr(blk.content || '')}" data-language="${escapeHtmlAttr(blk.language || 'python')}" data-title="${escapeHtmlAttr(blk.title || '代码片段.py')}" data-collapsed="${String(Boolean(blk.collapsed))}"></div>`
      );
    } else if (blk.type === 'image' && blk.imageUrl) {
      parts.push(
        `<div data-type="collapsible-image-block" data-src="${escapeHtmlAttr(blk.imageUrl)}" data-title="${escapeHtmlAttr(blk.title || 'image.png')}" data-width="${Number(blk.imageWidth) || 75}" data-collapsed="${String(Boolean(blk.collapsed))}"></div>`
      );
    } else if (blk.type === 'text') {
      const content = blk.content || '';
      if (!content) continue;
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.startsWith('### ')) {
          parts.push(`<h3>${formatLegacyInline(line.slice(4))}</h3>`);
        } else if (line.startsWith('## ')) {
          parts.push(`<h2>${formatLegacyInline(line.slice(3))}</h2>`);
        } else if (line.startsWith('# ')) {
          parts.push(`<h1>${formatLegacyInline(line.slice(2))}</h1>`);
        } else {
          parts.push(`<p>${formatLegacyInline(line)}</p>`);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join('') : '<p></p>';
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

export function normalizeNoteItem(raw: unknown): NoteItem {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const asString = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value : fallback;
  const rawPages = Array.isArray(src.codePages)
    ? (src.codePages as Array<Record<string, unknown>>)
    : [];
  const normalizedPages: CodePage[] = [];

  const content = asString(src.content);
  const hasNotePageAlready = rawPages.some((p) => p.pageType === 'note');
  if (content.trim() && !hasNotePageAlready) {
    const legacyBlocks = parseLegacyTextToBlocks(content);
    normalizedPages.push({
      id: `np_legacy_${asString(src.id)}`,
      title: '笔记正文',
      pageType: 'note',
      language: 'markdown',
      code: '',
      blocks: legacyBlocks,
      richContent: blocksToRichHtml(legacyBlocks)
    });
  }

  for (let idx = 0; idx < rawPages.length; idx++) {
    const p = rawPages[idx];
    const pType: 'note' | 'code' = p.pageType === 'note' ? 'note' : 'code';
    const blocks: NoteSubBlock[] =
      pType === 'note'
        ? Array.isArray(p.blocks) && p.blocks.length > 0
          ? (p.blocks as NoteSubBlock[])
          : parseLegacyTextToBlocks(asString(p.code))
        : [];

    // 若已存在 richContent 字段则直接使用，否则从旧版 blocks 自动无损转换
    const richContent =
      pType === 'note'
        ? typeof p.richContent === 'string'
          ? p.richContent
          : blocksToRichHtml(blocks)
        : undefined;

    normalizedPages.push({
      id: asString(p.id, `pg_${Date.now()}_${idx}`),
      title: asString(p.title, pType === 'note' ? `笔记_${idx + 1}` : `片段_${idx + 1}.py`),
      pageType: pType,
      language: asString(p.language, 'python'),
      code: asString(p.code),
      blocks,
      richContent
    });
  }

  if (normalizedPages.length === 0) {
    normalizedPages.push({
      id: `pg_default_${Date.now()}`,
      title: '笔记_1',
      pageType: 'note',
      language: 'python',
      code: '',
      blocks: [],
      richContent: '<p></p>'
    });
  }

  return {
    id: asString(src.id),
    folderId: typeof src.folderId === 'string' ? src.folderId : null,
    title: asString(src.title, '未命名笔记'),
    content: '',
    codePages: normalizedPages,
    isPublic: Boolean(src.isPublic),
    isOwner: src.isOwner !== undefined ? Boolean(src.isOwner) : true,
    authorName: asString(src.authorName),
    updatedAt: asString(src.updatedAt),
    version: typeof src.version === 'string' ? src.version : undefined
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
  importNotesBackup: (backupData: { folders?: Array<{ name: string }>; notes?: unknown[] }) => Promise<number>;
  saveNoteFromAI: (title: string, textContent: string, codeSnippets?: string[]) => Promise<NoteItem | null>;

  // 全局未保存切换拦截守卫
  hasUnsavedChanges: boolean;
  unsavedGuardOpen: boolean;
  isSavingBeforeLeave: boolean;
  pendingNavigationAction: (() => void) | null;
  saveCurrentDraftHandler: (() => Promise<boolean>) | null;
  discardCurrentDraftHandler: (() => void) | null;

  setUnsavedState: (dirty: boolean) => void;
  registerDraftHandlers: (
    saveFn: (() => Promise<boolean>) | null,
    discardFn: (() => void) | null
  ) => void;
  requestProtectedAction: (action: () => void, autoSaveEnabled: boolean) => Promise<void>;
  resolveUnsavedGuard: (choice: 'save' | 'discard' | 'cancel') => Promise<void>;
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  folders: [],
  notes: [],
  selectedFolderId: null,
  activeNoteId: null,
  isLoading: false,
  serverVersion: '',

  hasUnsavedChanges: false,
  unsavedGuardOpen: false,
  isSavingBeforeLeave: false,
  pendingNavigationAction: null,
  saveCurrentDraftHandler: null,
  discardCurrentDraftHandler: null,

  setUnsavedState: (dirty) => set({ hasUnsavedChanges: dirty }),

  registerDraftHandlers: (saveFn, discardFn) =>
    set({
      saveCurrentDraftHandler: saveFn,
      discardCurrentDraftHandler: discardFn
    }),

  requestProtectedAction: async (action, autoSaveEnabled) => {
    const state = get();
    if (!state.hasUnsavedChanges) {
      action();
      return;
    }

    // 若用户开启了“自动保存”，切页/切笔记前直接静默保存后放行
    if (autoSaveEnabled) {
      set({ isSavingBeforeLeave: true });
      try {
        const ok = state.saveCurrentDraftHandler ? await state.saveCurrentDraftHandler() : true;
        if (ok) {
          set({ hasUnsavedChanges: false });
          action();
        }
      } finally {
        set({ isSavingBeforeLeave: false });
      }
      return;
    }

    // 未开启自动保存：打开全局确认弹窗
    set({
      unsavedGuardOpen: true,
      pendingNavigationAction: action
    });
  },

  resolveUnsavedGuard: async (choice) => {
    const state = get();
    const nextAction = state.pendingNavigationAction;

    if (choice === 'cancel') {
      set({ unsavedGuardOpen: false, pendingNavigationAction: null });
      return;
    }

    if (choice === 'discard') {
      state.discardCurrentDraftHandler?.();
      set({
        hasUnsavedChanges: false,
        unsavedGuardOpen: false,
        pendingNavigationAction: null
      });
      nextAction?.();
      return;
    }

    if (choice === 'save') {
      set({ isSavingBeforeLeave: true });
      try {
        const ok = state.saveCurrentDraftHandler ? await state.saveCurrentDraftHandler() : true;
        if (ok) {
          set({
            hasUnsavedChanges: false,
            unsavedGuardOpen: false,
            pendingNavigationAction: null
          });
          nextAction?.();
        }
      } finally {
        set({ isSavingBeforeLeave: false });
      }
    }
  },

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
        const source = (rawNote && typeof rawNote === 'object' ? rawNote : {}) as Record<string, unknown>;
        const folderName = typeof source.folderName === 'string' ? source.folderName : '';
        let targetFolderId = state.selectedFolderId;
        if (folderName && folderNameMap.has(folderName)) {
          targetFolderId = folderNameMap.get(folderName) || null;
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
  },

  saveNoteFromAI: async (title, textContent, codeSnippets = []) => {
    const pages: CodePage[] = [];
    if (textContent.trim()) {
      const blocks = parseLegacyTextToBlocks(textContent);
      pages.push({
        id: `np_ai_${Date.now()}`,
        title: 'AI说明笔记',
        pageType: 'note',
        language: 'python',
        code: '',
        blocks,
        richContent: blocksToRichHtml(blocks)
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
  }
}));