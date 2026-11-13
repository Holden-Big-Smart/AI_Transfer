// src/types/note.ts
// 笔记相关公共类型：api 层与 store 层共用，避免循环引用

// 笔记页内部的子块（支持普通文本块与可折叠代码块交替混排）
export interface NoteSubBlock {
  id: string;
  type: 'text' | 'code';
  content: string;
  language: string;
  collapsed: boolean;
  title: string;
}

// 统一页面结构：可以是笔记页 ('note') 或代码页 ('code')
export interface CodePage {
  id: string;
  title: string;
  pageType: 'note' | 'code';
  language: string;
  code: string;
  blocks: NoteSubBlock[];
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
  updatedAt: string;
  version?: string; // <-- 新增这一行：允许携带后端返回的版本指纹
}
