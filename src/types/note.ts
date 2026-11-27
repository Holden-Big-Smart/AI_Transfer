// src/types/note.ts
// 笔记相关公共类型：api 层与 store 层共用，避免循环引用

export interface NoteSubBlock {
  id: string;
  type: 'text' | 'code' | 'image';
  content: string;
  language: string;
  collapsed: boolean;
  title: string;
  imageUrl?: string;
  imageWidth?: number; // 百分比宽度：25 | 50 | 75 | 100
}

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

export interface NoteShareItem {
  userId: string;
  username?: string;
  name?: string;
  permission: 'read' | 'edit';
}

export interface NoteItem {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  codePages: CodePage[];
  isPublic?: boolean;
  isOwner?: boolean;
  canEdit?: boolean;
  sharePermission?: 'owner' | 'edit' | 'read' | 'public';
  shares?: NoteShareItem[];
  authorName?: string;
  updatedAt: string;
  revision?: number;
  version?: string;
}

export interface NoteSnapshotItem {
  id: string;
  noteId: string;
  authorName: string;
  message: string;
  title: string;
  pageCount?: number;
  revision: number;
  createdAt: string;
}

export interface NoteConflictInfo {
  noteId: string;
  message: string;
  serverRevision: number;
  baseRevision: number;
  serverUpdatedAt: string;
  serverNote: NoteItem;
}
