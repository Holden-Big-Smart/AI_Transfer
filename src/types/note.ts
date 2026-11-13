// src/types/note.ts
// 笔记相关公共类型：api 层与 store 层共用，避免循环引用

export interface CodePage {
  id: string;
  title: string;
  language: string;
  code: string;
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
}
