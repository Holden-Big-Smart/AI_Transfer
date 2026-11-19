// src/types/note.ts
// 笔记相关公共类型：api 层与 store 层共用，避免循环引用

// 笔记页内部的子块（支持普通文本块、可折叠代码块、内嵌图片块混排）
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

// 统一页面结构：可以是笔记页 ('note'，使用 richContent 富文本 HTML) 或代码页 ('code')
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
