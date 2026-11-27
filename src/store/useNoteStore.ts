// src/store/useNoteStore.ts
import { create } from 'zustand';
import { api, ApiError } from '../utils/api';
import type {
  CodePage,
  NoteConflictInfo,
  NoteFolder,
  NoteItem,
  NoteShareItem,
  NoteSnapshotItem,
  NoteSubBlock
} from '../types/note';

export type {
  CodePage,
  NoteConflictInfo,
  NoteFolder,
  NoteItem,
  NoteShareItem,
  NoteSnapshotItem,
  NoteSubBlock
};

export interface LocalNoteDraft {
  noteId: string;
  folderId: string | null;
  title: string;
  codePages: CodePage[];
  isPublic: boolean;
  baseRevision?: number;
  savedAt: number;
}

const DRAFT_PREFIX = 'note_local_draft_v1_';

export function saveLocalNoteDraft(draft: LocalNoteDraft): void {
  if (!draft.noteId) return;
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${draft.noteId}`, JSON.stringify(draft));
  } catch {
    // 忽略容量超限异常
  }
}

export function loadLocalNoteDraft(noteId: string): LocalNoteDraft | null {
  if (!noteId) return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${noteId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalNoteDraft;
    if (parsed && Array.isArray(parsed.codePages)) return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function clearLocalNoteDraft(noteId: string): void {
  if (!noteId) return;
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${noteId}`);
  } catch {
    // ignore
  }
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

  const seenPageIds = new Set<string>();
  for (let idx = 0; idx < rawPages.length; idx++) {
    const p = rawPages[idx];
    const pType: 'note' | 'code' = p.pageType === 'note' ? 'note' : 'code';
    const blocks: NoteSubBlock[] =
      pType === 'note'
        ? Array.isArray(p.blocks) && p.blocks.length > 0
          ? (p.blocks as NoteSubBlock[])
          : parseLegacyTextToBlocks(asString(p.code))
        : [];

    const richContent =
      pType === 'note'
        ? typeof p.richContent === 'string'
          ? p.richContent
          : blocksToRichHtml(blocks)
        : undefined;

    let pageId = asString(p.id).trim();
    if (!pageId || seenPageIds.has(pageId)) {
      pageId = `pg_${pType}_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
    }
    seenPageIds.add(pageId);

    normalizedPages.push({
      id: pageId,
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

  const isOwner = src.isOwner !== undefined ? Boolean(src.isOwner) : true;
  const rawShares = Array.isArray(src.shares)
    ? (src.shares as Array<Record<string, unknown>>)
        .map((s): NoteShareItem => ({
          userId: asString(s.userId || s.user_id),
          username: asString(s.username),
          name: asString(s.name),
          permission: s.permission === 'edit' ? 'edit' : 'read'
        }))
        .filter((s) => Boolean(s.userId))
    : [];
  const rawPerm = asString(src.sharePermission);
  const sharePermission: 'owner' | 'edit' | 'read' | 'public' =
    rawPerm === 'owner' || rawPerm === 'edit' || rawPerm === 'read' || rawPerm === 'public'
      ? rawPerm
      : isOwner
        ? 'owner'
        : Boolean(src.isPublic)
          ? 'public'
          : 'read';
  const canEdit =
    src.canEdit !== undefined ? Boolean(src.canEdit) : isOwner || sharePermission === 'edit';
  const parsedRev = Number(src.revision);

  return {
    id: asString(src.id),
    folderId: typeof src.folderId === 'string' ? src.folderId : null,
    title: asString(src.title, '未命名笔记'),
    content: '',
    codePages: normalizedPages,
    isPublic: Boolean(src.isPublic),
    isOwner,
    canEdit,
    sharePermission,
    shares: rawShares,
    authorName: asString(src.authorName),
    updatedAt: asString(src.updatedAt),
    revision: Number.isFinite(parsedRev) && parsedRev > 0 ? parsedRev : 1,
    version: typeof src.version === 'string' ? src.version : undefined
  };
}

function sortNotesByUpdatedAt(list: NoteItem[]): NoteItem[] {
  return [...list].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function isSameNoteSnapshot(a: NoteItem, b: NoteItem): boolean {
  if (
    a.id !== b.id ||
    a.revision !== b.revision ||
    a.updatedAt !== b.updatedAt ||
    a.title !== b.title ||
    a.folderId !== b.folderId ||
    a.isPublic !== b.isPublic ||
    a.canEdit !== b.canEdit ||
    a.sharePermission !== b.sharePermission
  ) {
    return false;
  }
  return (
    JSON.stringify(a.shares || []) === JSON.stringify(b.shares || []) &&
    JSON.stringify(a.codePages || []) === JSON.stringify(b.codePages || [])
  );
}

interface NoteStore {
  folders: NoteFolder[];
  notes: NoteItem[];
  selectedFolderId: string | null;
  activeNoteId: string | null;
  isLoading: boolean;
  serverVersion: string;
  conflictState: NoteConflictInfo | null;

  loadNotesData: (silent?: boolean) => Promise<void>;
  checkRemoteVersion: () => Promise<boolean>;
  setSelectedFolderId: (id: string | null) => void;
  setActiveNoteId: (id: string | null) => void;
  clearConflictState: () => void;
  createFolder: (name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  saveNote: (payload: {
    id?: string | null;
    folderId: string | null;
    title: string;
    content?: string;
    codePages: CodePage[];
    isPublic?: boolean;
    baseRevision?: number;
    force?: boolean;
    keepActive?: boolean;
  }) => Promise<NoteItem | null>;
  moveNoteToFolder: (noteId: string, folderId: string | null) => Promise<boolean>;
  movePageToNote: (payload: {
    sourceNoteId: string;
    targetNoteId: string;
    pageId: string;
    pagePayload?: CodePage;
    deleteEmptySource?: boolean;
  }) => Promise<{ sourceDeleted: boolean; targetNote: NoteItem | null } | null>;
  listSnapshots: (noteId: string) => Promise<NoteSnapshotItem[]>;
  createSnapshot: (
    noteId: string,
    payload: { message?: string; title?: string; codePages?: CodePage[] }
  ) => Promise<NoteSnapshotItem | null>;
  restoreSnapshot: (noteId: string, snapshotId: string) => Promise<NoteItem | null>;
  deleteSnapshot: (noteId: string, snapshotId: string) => Promise<boolean>;
  toggleNotePublic: (noteId: string, isPublic: boolean) => Promise<boolean>;
  updateNoteShares: (
    noteId: string,
    payload: { isPublic: boolean; shares: Array<{ userId: string; permission: 'read' | 'edit' }> }
  ) => Promise<boolean>;
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
  conflictState: null,

  hasUnsavedChanges: false,
  unsavedGuardOpen: false,
  isSavingBeforeLeave: false,
  pendingNavigationAction: null,
  saveCurrentDraftHandler: null,
  discardCurrentDraftHandler: null,

  setUnsavedState: (dirty) => set({ hasUnsavedChanges: dirty }),
  clearConflictState: () => set({ conflictState: null }),

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

  // 静默同步时复用未变化笔记的对象引用，彻底杜绝 B 端更新不跳页/不丢光标
  loadNotesData: async (silent = false) => {
    if (!silent) set({ isLoading: true });
    try {
      const data = await api.notes.getAll();
      const incoming = (data.notes || []).map(normalizeNoteItem);

      set((state) => {
        const prevMap = new Map<string, NoteItem>();
        state.notes.forEach((n) => prevMap.set(n.id, n));

        const merged = sortNotesByUpdatedAt(
          incoming.map((nextItem) => {
            const prevItem = prevMap.get(nextItem.id);
            if (prevItem && isSameNoteSnapshot(prevItem, nextItem)) {
              return prevItem;
            }
            return nextItem;
          })
        );

        const keepActive = merged.some((n) => n.id === state.activeNoteId);
        return {
          folders: data.folders || [],
          notes: merged,
          activeNoteId: keepActive ? state.activeNoteId : (merged[0]?.id ?? null),
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
  setActiveNoteId: (id) => set({ activeNoteId: id, conflictState: null }),

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

  saveNote: async ({
    id,
    folderId,
    title,
    codePages,
    isPublic,
    baseRevision,
    force = false,
    keepActive = false
  }) => {
    const finalTitle = title.trim() || formatDefaultNoteTitle();
    try {
      const res = await api.notes.save({
        id: id || undefined,
        folder_id: folderId,
        title: finalTitle,
        content: '',
        code_pages: codePages,
        is_public: isPublic,
        base_revision: baseRevision,
        force
      });
      const saved = normalizeNoteItem(res);
      const nextVersion = typeof res?.version === 'string' ? res.version : '';
      clearLocalNoteDraft(saved.id);

      set((state) => {
        const exists = state.notes.some((n) => n.id === saved.id);
        const nextNotes = sortNotesByUpdatedAt(
          exists
            ? state.notes.map((n) => (n.id === saved.id ? saved : n))
            : [saved, ...state.notes]
        );
        return {
          notes: nextNotes,
          activeNoteId: keepActive && state.activeNoteId ? state.activeNoteId : saved.id,
          serverVersion: nextVersion || state.serverVersion,
          conflictState: null
        };
      });
      return saved;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.payload && typeof err.payload === 'object') {
        const p = err.payload as Record<string, unknown>;
        if (p.code === 'NOTE_CONFLICT' && p.serverNote) {
          const serverNote = normalizeNoteItem(p.serverNote);
          set({
            conflictState: {
              noteId: id || serverNote.id,
              message: String(p.message || err.message || '检测到跨端版本冲突'),
              serverRevision: Number(p.serverRevision) || serverNote.revision || 1,
              baseRevision: Number(p.baseRevision) || baseRevision || 1,
              serverUpdatedAt: String(p.serverUpdatedAt || serverNote.updatedAt || ''),
              serverNote
            }
          });
          return null;
        }
      }
      console.error('保存笔记失败:', err);
      return null;
    }
  },

  moveNoteToFolder: async (noteId, folderId) => {
    const prevNotes = get().notes;
    set((state) => ({
      notes: state.notes.map((n) => (n.id === noteId ? { ...n, folderId } : n))
    }));
    try {
      const res = await api.notes.moveFolder(noteId, folderId);
      const updated = normalizeNoteItem(res.note);
      set((state) => ({
        notes: state.notes.map((n) => (n.id === updated.id ? updated : n)),
        serverVersion: res.version || state.serverVersion
      }));
      return true;
    } catch (err) {
      console.error('移动笔记分类失败:', err);
      set({ notes: prevNotes });
      return false;
    }
  },

  movePageToNote: async ({
    sourceNoteId,
    targetNoteId,
    pageId,
    pagePayload,
    deleteEmptySource = false
  }) => {
    try {
      const res = await api.notes.movePage({
        source_note_id: sourceNoteId,
        target_note_id: targetNoteId,
        page_id: pageId,
        page_payload: pagePayload,
        delete_empty_source: deleteEmptySource
      });
      const updatedTarget = normalizeNoteItem(res.targetNote);
      const updatedSource = res.sourceNote ? normalizeNoteItem(res.sourceNote) : null;

      set((state) => {
        let nextNotes = state.notes.filter((n) =>
          res.sourceDeleted ? n.id !== sourceNoteId : true
        );
        nextNotes = nextNotes.map((n) => {
          if (n.id === updatedTarget.id) return updatedTarget;
          if (updatedSource && n.id === updatedSource.id) return updatedSource;
          return n;
        });
        nextNotes = sortNotesByUpdatedAt(nextNotes);
        const nextActive =
          res.sourceDeleted && state.activeNoteId === sourceNoteId
            ? updatedTarget.id
            : state.activeNoteId;
        return {
          notes: nextNotes,
          activeNoteId: nextActive,
          serverVersion: res.version || state.serverVersion
        };
      });

      return { sourceDeleted: res.sourceDeleted, targetNote: updatedTarget };
    } catch (err) {
      console.error('跨笔记移动页签失败:', err);
      return null;
    }
  },

  listSnapshots: async (noteId) => {
    try {
      const res = await api.notes.listSnapshots(noteId);
      return Array.isArray(res.snapshots) ? res.snapshots : [];
    } catch (err) {
      console.error('获取快照列表失败:', err);
      return [];
    }
  },

  createSnapshot: async (noteId, { message, title, codePages }) => {
    try {
      const res = await api.notes.createSnapshot(noteId, {
        message,
        title,
        code_pages: codePages
      });
      return res.snapshot;
    } catch (err) {
      console.error('创建快照失败:', err);
      return null;
    }
  },

  restoreSnapshot: async (noteId, snapshotId) => {
    try {
      const res = await api.notes.restoreSnapshot(noteId, snapshotId);
      const restored = normalizeNoteItem(res.note);
      clearLocalNoteDraft(restored.id);
      set((state) => ({
        notes: sortNotesByUpdatedAt(
          state.notes.map((n) => (n.id === restored.id ? restored : n))
        ),
        serverVersion: res.version || state.serverVersion,
        conflictState: null
      }));
      return restored;
    } catch (err) {
      console.error('回滚快照失败:', err);
      return null;
    }
  },

  deleteSnapshot: async (noteId, snapshotId) => {
    try {
      await api.notes.deleteSnapshot(noteId, snapshotId);
      return true;
    } catch (err) {
      console.error('删除快照失败:', err);
      return false;
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

  updateNoteShares: async (noteId, payload) => {
    try {
      const res = await api.notes.updateShares({
        note_id: noteId,
        is_public: payload.isPublic,
        shares: payload.shares.map((s) => ({ user_id: s.userId, permission: s.permission }))
      });
      set((state) => ({
        notes: state.notes.map((n) =>
          n.id === noteId
            ? {
                ...n,
                isPublic: res.isPublic,
                shares: Array.isArray(res.shares) ? res.shares : []
              }
            : n
        ),
        serverVersion: res.version || state.serverVersion
      }));
      return true;
    } catch (err) {
      console.error('更新笔记共享权限失败:', err);
      return false;
    }
  },

  deleteNote: async (id) => {
    await api.notes.deleteNote(id);
    clearLocalNoteDraft(id);
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
