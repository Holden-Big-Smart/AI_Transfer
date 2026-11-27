// src/pages/Notes/index.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  FolderPlus, Plus, Trash2, Save, Copy, Check, Code2, FileText,
  ChevronLeft, ChevronRight, Folder, Sparkles, RefreshCw, GripVertical,
  PanelLeftClose, PanelLeftOpen, WrapText, Globe, Lock, Download, Upload, X,
  Users, Eye, Pencil, Search, History, RotateCcw, AlertTriangle, FileArchive,
  BookmarkPlus
} from 'lucide-react';
import {
  useNoteStore,
  type CodePage,
  type NoteItem,
  type NoteSnapshotItem,
  type LocalNoteDraft,
  blocksToRichHtml,
  formatDefaultNoteTitle,
  saveLocalNoteDraft,
  loadLocalNoteDraft,
  clearLocalNoteDraft
} from '../../store/useNoteStore';
import { useAuthStore } from '../../store/useAuthStore';
import { api } from '../../utils/api';
import { SyntaxHighlightEditor } from '../../components/notes/SyntaxHighlightEditor';
import RichTextNoteEditor from '../../components/notes/RichTextNoteEditor';

// ============================================================================
// 富文本 HTML <-> Markdown 双向转换 & 检索工具
// ============================================================================
const PRIORITY_MD_TAG: Record<string, string> = {
  high: '[紧急] ',
  medium: '[重要] ',
  normal: '',
  low: '[低] '
};

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

function serializeInlineToMarkdown(node: globalThis.Node): string {
  if (node.nodeType === 3) return node.textContent || '';
  if (node.nodeType !== 1) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = Array.from(el.childNodes).map(serializeInlineToMarkdown).join('');

  if (tag === 'strong' || tag === 'b') return inner ? `**${inner}**` : '';
  if (tag === 'em' || tag === 'i') return inner ? `*${inner}*` : '';
  if (tag === 's' || tag === 'del' || tag === 'strike') return inner ? `~~${inner}~~` : '';
  if (tag === 'code') return inner ? `\`${inner}\`` : '';
  if (tag === 'u') return inner ? `<u>${inner}</u>` : '';
  if (tag === 'a') {
    const href = el.getAttribute('href') || '';
    return href ? `[${inner || href}](${href})` : inner;
  }
  if (tag === 'br') return '\n';
  return inner;
}

function serializeBlockToMarkdown(node: globalThis.Node, depth = 0): string {
  if (node.nodeType === 3) return (node.textContent || '').trim();
  if (node.nodeType !== 1) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const dataType = el.getAttribute('data-type');

  if (dataType === 'collapsible-code-block') {
    const lang = el.getAttribute('data-language') || 'python';
    const code = el.getAttribute('data-code') || '';
    return `\`\`\`${lang}\n${code}\n\`\`\`\n`;
  }

  if (dataType === 'collapsible-image-block') {
    const src = el.getAttribute('data-src') || '';
    const title = el.getAttribute('data-title') || '图片';
    const fullUrl = src.startsWith('http') ? src : `${window.location.origin}${src}`;
    return `![${title}](${fullUrl})\n`;
  }

  if (tag === 'h1') return `# ${serializeInlineToMarkdown(el)}\n`;
  if (tag === 'h2') return `## ${serializeInlineToMarkdown(el)}\n`;
  if (tag === 'h3') return `### ${serializeInlineToMarkdown(el)}\n`;
  if (tag === 'p') return `${serializeInlineToMarkdown(el)}\n`;
  if (tag === 'hr') return `---\n`;

  if (tag === 'blockquote') {
    const inner = Array.from(el.childNodes)
      .map((c) => serializeBlockToMarkdown(c, depth))
      .join('')
      .trim();
    return inner
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n') + '\n';
  }

  if (tag === 'ul' && dataType === 'taskList') {
    const items: string[] = [];
    Array.from(el.children).forEach((child) => {
      if (child.tagName.toLowerCase() !== 'li') return;
      const li = child as HTMLElement;
      const checked = li.getAttribute('data-checked') === 'true';
      const prio = li.getAttribute('data-priority') || 'normal';
      const prioTag = PRIORITY_MD_TAG[prio] ?? '';
      const indent = '  '.repeat(depth);

      const textParts: string[] = [];
      const subParts: string[] = [];
      Array.from(li.children).forEach((sub) => {
        const subTag = sub.tagName.toLowerCase();
        if (subTag === 'ul' || subTag === 'ol') {
          subParts.push(serializeBlockToMarkdown(sub, depth + 1).replace(/\n$/, ''));
        } else if (subTag === 'div') {
          Array.from(sub.children).forEach((innerChild) => {
            const icTag = innerChild.tagName.toLowerCase();
            if (icTag === 'ul' || icTag === 'ol') {
              subParts.push(serializeBlockToMarkdown(innerChild, depth + 1).replace(/\n$/, ''));
            } else {
              textParts.push(serializeInlineToMarkdown(innerChild));
            }
          });
        } else {
          textParts.push(serializeInlineToMarkdown(sub));
        }
      });

      const line = `${indent}- [${checked ? 'x' : ' '}] ${prioTag}${textParts.join(' ').trim()}`;
      items.push(subParts.length > 0 ? `${line}\n${subParts.join('\n')}` : line);
    });
    return items.join('\n') + '\n';
  }

  if (tag === 'ul' || tag === 'ol') {
    const items: string[] = [];
    Array.from(el.children).forEach((child, idx) => {
      if (child.tagName.toLowerCase() !== 'li') return;
      const indent = '  '.repeat(depth);
      const bullet = tag === 'ol' ? `${idx + 1}. ` : '- ';
      const textParts: string[] = [];
      const subParts: string[] = [];
      Array.from(child.children).forEach((sub) => {
        const subTag = sub.tagName.toLowerCase();
        if (subTag === 'ul' || subTag === 'ol') {
          subParts.push(serializeBlockToMarkdown(sub, depth + 1).replace(/\n$/, ''));
        } else {
          textParts.push(serializeInlineToMarkdown(sub));
        }
      });
      const line = `${indent}${bullet}${textParts.join(' ').trim()}`;
      items.push(subParts.length > 0 ? `${line}\n${subParts.join('\n')}` : line);
    });
    return items.join('\n') + '\n';
  }

  if (tag === 'table') {
    const rows = Array.from(el.querySelectorAll('tr'));
    if (rows.length === 0) return '';
    const mdRows = rows.map((tr) => {
      const cells = Array.from(tr.children).map((c) =>
        serializeInlineToMarkdown(c).replace(/\|/g, '\\|').trim()
      );
      return `| ${cells.join(' | ')} |`;
    });
    const colCount = rows[0].children.length;
    const sep = `| ${Array(colCount).fill('---').join(' | ')} |`;
    mdRows.splice(1, 0, sep);
    return mdRows.join('\n') + '\n';
  }

  return Array.from(el.childNodes)
    .map((c) => serializeBlockToMarkdown(c, depth))
    .join('');
}

function richHtmlToMarkdown(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes)
    .map((n) => serializeBlockToMarkdown(n, 0))
    .filter((s) => s !== '')
    .join('\n')
    .trim();
}

function convertNoteToMarkdown(title: string, pages: CodePage[]): string {
  const lines: string[] = [`# ${title}\n`];
  pages.forEach((p, idx) => {
    lines.push(`## 第 ${idx + 1} 页: ${p.title} (${p.pageType === 'note' ? '笔记页' : '代码页'})\n`);
    if (p.pageType === 'code') {
      lines.push(`\`\`\`${p.language || 'python'}\n${p.code || ''}\n\`\`\`\n`);
    } else {
      const html = typeof p.richContent === 'string' ? p.richContent : blocksToRichHtml(p.blocks || []);
      lines.push(richHtmlToMarkdown(html) + '\n');
    }
  });
  return lines.join('\n');
}

function formatMdInlineToHtml(text: string): string {
  let html = escapeHtmlText(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return html;
}

function parseMarkdownToRichHtml(mdText: string): string {
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  interface ParsedTaskNode {
    checked: boolean;
    priority: string;
    text: string;
    indent: number;
    children: ParsedTaskNode[];
  }

  const renderTaskTree = (nodes: ParsedTaskNode[]): string => {
    if (nodes.length === 0) return '';
    return `<ul data-type="taskList">${nodes
      .map(
        (n) =>
          `<li data-type="taskItem" data-checked="${n.checked}" data-priority="${n.priority}"><p>${formatMdInlineToHtml(n.text)}</p>${renderTaskTree(n.children)}</li>`
      )
      .join('')}</ul>`;
  };

  while (i < lines.length) {
    const line = lines[i];

    const codeMatch = line.match(/^```(\w*)\s*$/);
    if (codeMatch) {
      const lang = codeMatch[1] || 'python';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        `<div data-type="collapsible-code-block" data-code="${escapeHtmlAttr(codeLines.join('\n'))}" data-language="${escapeHtmlAttr(lang)}" data-title="导入代码片段" data-collapsed="false"></div>`
      );
      continue;
    }

    if (line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/)) {
      const roots: ParsedTaskNode[] = [];
      const stack: ParsedTaskNode[] = [];

      while (i < lines.length) {
        const tm = lines[i].match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (!tm) break;
        const indent = tm[1].replace(/\t/g, '  ').length;
        const checked = tm[2].toLowerCase() === 'x';
        let body = tm[3].trim();
        let priority = 'normal';

        if (body.startsWith('[紧急]')) {
          priority = 'high';
          body = body.slice(4).trim();
        } else if (body.startsWith('[重要]')) {
          priority = 'medium';
          body = body.slice(4).trim();
        } else if (body.startsWith('[普通]')) {
          priority = 'normal';
          body = body.slice(4).trim();
        } else if (body.startsWith('[低]')) {
          priority = 'low';
          body = body.slice(3).trim();
        }

        const taskNode: ParsedTaskNode = { checked, priority, text: body, indent, children: [] };
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        if (stack.length === 0) {
          roots.push(taskNode);
        } else {
          stack[stack.length - 1].children.push(taskNode);
        }
        stack.push(taskNode);
        i++;
      }

      out.push(renderTaskTree(roots));
      continue;
    }

    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgMatch) {
      out.push(
        `<div data-type="collapsible-image-block" data-src="${escapeHtmlAttr(imgMatch[2])}" data-title="${escapeHtmlAttr(imgMatch[1] || 'image.png')}" data-width="75" data-collapsed="false"></div>`
      );
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      out.push(`<h3>${formatMdInlineToHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      out.push(`<h2>${formatMdInlineToHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      out.push(`<h1>${formatMdInlineToHtml(line.slice(2))}</h1>`);
    } else if (line.match(/^---+\s*$/)) {
      out.push('<hr>');
    } else if (line.startsWith('> ')) {
      out.push(`<blockquote><p>${formatMdInlineToHtml(line.slice(2))}</p></blockquote>`);
    } else if (line.match(/^[-*]\s+/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/) && !lines[i].match(/^[-*]\s+\[[ xX]\]/)) {
        listItems.push(`<li><p>${formatMdInlineToHtml(lines[i].replace(/^[-*]\s+/, ''))}</p></li>`);
        i++;
      }
      out.push(`<ul>${listItems.join('')}</ul>`);
      continue;
    } else if (line.trim() === '') {
      // 跳过冗余连续空行
    } else {
      out.push(`<p>${formatMdInlineToHtml(line)}</p>`);
    }
    i++;
  }

  return out.length > 0 ? out.join('') : '<p></p>';
}

function triggerBrowserDownload(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  triggerBlobDownload(filename, blob);
}

function triggerBlobDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function createUniquePageId(pageType: 'note' | 'code'): string {
  return `pg_${pageType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function extractNoteSearchableText(note: NoteItem): string {
  const parts: string[] = [note.title || '', note.authorName || ''];
  for (const page of note.codePages || []) {
    parts.push(page.title || '');
    if (page.pageType === 'code') {
      parts.push(page.code || '');
    } else {
      const html = page.richContent || '';
      if (html) {
        // 同时提取折叠代码块中的 data-code / data-title，避免检索不到嵌套代码
        const attrMatches = html.match(/data-(?:code|title)="([^"]*)"/g) || [];
        for (const m of attrMatches) {
          parts.push(
            m
              .replace(/^data-(?:code|title)="/, '')
              .replace(/"$/, '')
              .replace(/&quot;/g, '"')
              .replace(/&#10;/g, ' ')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&')
          );
        }
        parts.push(html.replace(/<[^>]+>/g, ' '));
      }
      for (const blk of page.blocks || []) {
        if (blk.title) parts.push(blk.title);
        if (blk.content) parts.push(blk.content);
      }
    }
  }
  return parts.join(' ').toLowerCase();
}

// ============================================================================
// 笔记主页面组件
// ============================================================================
export default function Notes() {
  const { currentUser, noteAutoSave, setNoteAutoSave } = useAuthStore();
  const {
    folders, notes, selectedFolderId, activeNoteId, conflictState,
    clearConflictState, loadNotesData, checkRemoteVersion,
    setSelectedFolderId, setActiveNoteId,
    createFolder, deleteFolder, saveNote, moveNoteToFolder, movePageToNote,
    listSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot,
    updateNoteShares, deleteNote, importNotesBackup,
    setUnsavedState, registerDraftHandlers, requestProtectedAction
  } = useNoteStore();

  const isGuest = currentUser?.role === 'guest';

  const [title, setTitle] = useState('');
  const [codePages, setCodePages] = useState<CodePage[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [baseRevision, setBaseRevision] = useState<number>(1);
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // 搜索过滤关键词
  const [searchKeyword, setSearchKeyword] = useState('');

  // 共享设置弹窗
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareableUsers, setShareableUsers] = useState<
    Array<{ id: string; username: string; name: string; role: string }>
  >([]);
  const [shareSearch, setShareSearch] = useState('');
  const [draftPublic, setDraftPublic] = useState(false);
  const [draftUserPerms, setDraftUserPerms] = useState<Record<string, 'none' | 'read' | 'edit'>>({});
  const [savingShares, setSavingShares] = useState(false);

  // 侧边栏与代码折行
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('notes_sidebar_collapsed') === 'true';
  });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    return localStorage.getItem('notes_code_word_wrap') === 'true';
  });

  useEffect(() => {
    const syncWrap = () => {
      setWordWrap(localStorage.getItem('notes_code_word_wrap') === 'true');
    };
    window.addEventListener('notes_word_wrap_change', syncWrap);
    return () => window.removeEventListener('notes_word_wrap_change', syncWrap);
  }, []);

  // 导入 / 导出
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [importModal, setImportModal] = useState<{
    isOpen: boolean;
    files: File[];
    targetMode: 'new_note' | 'append_current';
  }>({
    isOpen: false,
    files: [],
    targetMode: 'new_note'
  });

  // 同步、草稿恢复与 Git 式快照抽屉状态
  const [isDirty, setIsDirty] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recoverableDraft, setRecoverableDraft] = useState<LocalNoteDraft | null>(null);

  const [snapshotDrawerOpen, setSnapshotDrawerOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<NoteSnapshotItem[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState('');
  const [committingSnapshot, setCommittingSnapshot] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState(false);

  // 拖拽状态：同笔记页签排序 / 页签跨笔记迁移 / 笔记拖至分类文件夹
  const [dragTabIdx, setDragTabIdx] = useState<number | null>(null);
  const [dragOverTabIdx, setDragOverTabIdx] = useState<number | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null); // '__ALL__' 表示根目录
  const [dragOverNoteIdForPage, setDragOverNoteIdForPage] = useState<string | null>(null);
  const [lastPageMoveConfirm, setLastPageMoveConfirm] = useState<{
    sourceNoteId: string;
    targetNoteId: string;
    targetNoteTitle: string;
    page: CodePage;
  } | null>(null);

  const importFileInputRef = useRef<HTMLInputElement>(null);

  // 版本防回弹 & 不跳页追踪
  const draftRevisionRef = useRef<number>(0);
  const skipNextActiveNoteHydrateRef = useRef<boolean>(false);
  const keepaliveSentRevisionRef = useRef<number>(-1);
  const hydratedMetaRef = useRef<{ id: string | null; rev: number; updatedAt: string }>({
    id: null,
    rev: 0,
    updatedAt: ''
  });
  const activeTabPageIdRef = useRef<string | null>(null);

  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const showToast = (msg: string, ms = 2200) => {
    setSyncNotice(msg);
    setTimeout(() => setSyncNotice(null), ms);
  };

  useEffect(() => {
    loadNotesData();
  }, [loadNotesData]);

  // 目录筛选 + 实时全文搜索
  const filteredNotes = useMemo(() => {
    const byFolder = selectedFolderId
      ? notes.filter((n) => n.folderId === selectedFolderId)
      : notes;
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return byFolder;
    return byFolder.filter((n) => extractNoteSearchableText(n).includes(kw));
  }, [notes, selectedFolderId, searchKeyword]);

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;
  const canManageShare = !isGuest && Boolean(activeNote && activeNote.isOwner !== false);
  const canEditActiveNote =
    !isGuest && (activeNote ? Boolean(activeNote.canEdit ?? activeNote.isOwner !== false) : true);

  // 同步当前激活页签 ID，供远端刷新时保持页签位置不跳页
  useEffect(() => {
    activeTabPageIdRef.current = codePages[activeTabIdx]?.id || null;
  }, [codePages, activeTabIdx]);

  // 同步本地 isDirty 状态至全局 store（供侧边栏跨模块跳转拦截）
  useEffect(() => {
    setUnsavedState(isDirty && canEditActiveNote);
  }, [isDirty, canEditActiveNote, setUnsavedState]);

  useEffect(() => {
    return () => {
      setUnsavedState(false);
      registerDraftHandlers(null, null);
    };
  }, [setUnsavedState, registerDraftHandlers]);

  // 保留最新草稿快照供快捷键、离页守卫、轮询与自动保存读取
  const latestDraftRef = useRef({
    activeNoteId,
    folderId: activeNote ? activeNote.folderId : selectedFolderId,
    title,
    codePages,
    isPublic,
    baseRevision,
    isDirty,
    canEditActiveNote,
    noteAutoSave
  });

  useEffect(() => {
    latestDraftRef.current = {
      activeNoteId,
      folderId: activeNote ? activeNote.folderId : selectedFolderId,
      title,
      codePages,
      isPublic,
      baseRevision,
      isDirty,
      canEditActiveNote,
      noteAutoSave
    };
  });

  // 切换笔记或远端刷新时回填工作区：
  // 1) A 端改其他笔记时，B 端 activeNote 引用与版本号未变 -> 完全不触发重绘、不跳页、不丢光标
  // 2) A 端改当前笔记时：若 B 端未编辑则无感同步并保持当前页签；若 B 端正在编辑则不覆盖，仅提示远端已更新
  useEffect(() => {
    if (skipNextActiveNoteHydrateRef.current) {
      skipNextActiveNoteHydrateRef.current = false;
      if (activeNote) {
        hydratedMetaRef.current = {
          id: activeNote.id,
          rev: activeNote.revision || 1,
          updatedAt: activeNote.updatedAt
        };
      }
      return;
    }

    queueMicrotask(() => {
      if (!activeNote) {
        if (hydratedMetaRef.current.id !== null) {
          hydratedMetaRef.current = { id: null, rev: 0, updatedAt: '' };
          setTitle('');
          setCodePages([]);
          setIsPublic(false);
          setBaseRevision(1);
          setActiveTabIdx(0);
          setIsDirty(false);
          setHasRemoteUpdate(false);
          setRecoverableDraft(null);
        }
        return;
      }

      const nextRev = activeNote.revision || 1;
      const isDifferentNote = activeNote.id !== hydratedMetaRef.current.id;
      const isRemoteChangedOnCurrent =
        !isDifferentNote &&
        (nextRev !== hydratedMetaRef.current.rev ||
          activeNote.updatedAt !== hydratedMetaRef.current.updatedAt);

      if (!isDifferentNote && !isRemoteChangedOnCurrent) {
        return;
      }

      if (isRemoteChangedOnCurrent && latestDraftRef.current.isDirty) {
        setHasRemoteUpdate(true);
        return;
      }

      hydratedMetaRef.current = {
        id: activeNote.id,
        rev: nextRev,
        updatedAt: activeNote.updatedAt
      };
      setTitle(activeNote.title);
      const nextPages = activeNote.codePages || [];
      setCodePages(nextPages);
      setIsPublic(Boolean(activeNote.isPublic));
      setBaseRevision(nextRev);
      setIsDirty(false);
      setHasRemoteUpdate(false);

      if (isDifferentNote) {
        setActiveTabIdx(0);
        // 检查是否存在因断网/意外关闭残留的本地草稿
        const localDraft = loadLocalNoteDraft(activeNote.id);
        if (
          localDraft &&
          (localDraft.title !== activeNote.title ||
            JSON.stringify(localDraft.codePages) !== JSON.stringify(nextPages))
        ) {
          setRecoverableDraft(localDraft);
        } else {
          setRecoverableDraft(null);
        }
      } else {
        const prevPageId = activeTabPageIdRef.current;
        const keptIdx = prevPageId ? nextPages.findIndex((p) => p.id === prevPageId) : -1;
        setActiveTabIdx((prev) =>
          keptIdx !== -1 ? keptIdx : Math.min(prev, Math.max(0, nextPages.length - 1))
        );
      }
    });
  }, [activeNote]);

  // 本地断网防丢草稿缓存（输入停顿 500ms 写入 localStorage，保存成功后自动清除）
  useEffect(() => {
    if (!isDirty || !activeNoteId || !canEditActiveNote) return;
    const timer = setTimeout(() => {
      saveLocalNoteDraft({
        noteId: activeNoteId,
        folderId: activeNote ? activeNote.folderId : selectedFolderId,
        title,
        codePages,
        isPublic,
        baseRevision,
        savedAt: Date.now()
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [isDirty, activeNoteId, canEditActiveNote, activeNote, selectedFolderId, title, codePages, isPublic, baseRevision]);

  // 核心保存函数（携带乐观锁 baseRevision，冲突时拦截不覆盖）
  const saveCurrentDraft = async (silent = false, force = false): Promise<boolean> => {
    const snap = latestDraftRef.current;
    if (!snap.canEditActiveNote) return true;
    const revAtStart = draftRevisionRef.current;

    if (silent) setIsAutoSaving(true);
    skipNextActiveNoteHydrateRef.current = true;

    const saved = await saveNote({
      id: snap.activeNoteId,
      folderId: snap.folderId,
      title: snap.title.trim() || formatDefaultNoteTitle(),
      codePages: snap.codePages,
      isPublic: snap.isPublic,
      baseRevision: snap.activeNoteId ? snap.baseRevision : undefined,
      force,
      keepActive: true
    });

    if (silent) setIsAutoSaving(false);

    if (saved) {
      const nextRev = saved.revision || 1;
      setBaseRevision(nextRev);
      hydratedMetaRef.current = {
        id: saved.id,
        rev: nextRev,
        updatedAt: saved.updatedAt
      };
      setRecoverableDraft(null);
      if (!snap.title.trim()) {
        setTitle(saved.title);
      }
      if (draftRevisionRef.current === revAtStart) {
        setIsDirty(false);
        setUnsavedState(false);
      }
      setHasRemoteUpdate(false);
      if (silent) {
        showToast(`⚡ 已自动保存 (r${nextRev})`, 1500);
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 1800);
      }
      return true;
    }

    skipNextActiveNoteHydrateRef.current = false;
    // 若非 409 冲突（例如网络中断），把草稿保底写入本地并给出明确提示
    if (!useNoteStore.getState().conflictState) {
      if (snap.activeNoteId) {
        saveLocalNoteDraft({
          noteId: snap.activeNoteId,
          folderId: snap.folderId,
          title: snap.title,
          codePages: snap.codePages,
          isPublic: snap.isPublic,
          baseRevision: snap.baseRevision,
          savedAt: Date.now()
        });
      }
      showToast('⚠️ 保存失败，内容已保底存入本地草稿，网络恢复后可重试', 3200);
    }
    return false;
  };

  const saveFnRef = useRef(saveCurrentDraft);
  useEffect(() => {
    saveFnRef.current = saveCurrentDraft;
  });

  useEffect(() => {
    registerDraftHandlers(
      () => saveFnRef.current(false, false),
      () => {
        if (latestDraftRef.current.activeNoteId) {
          clearLocalNoteDraft(latestDraftRef.current.activeNoteId);
        }
        setIsDirty(false);
        setUnsavedState(false);
      }
    );
  }, [registerDraftHandlers, setUnsavedState]);

  // 自动保存防抖定时器（遇到冲突时暂停自动保存，等待用户决策）
  useEffect(() => {
    if (!noteAutoSave || !isDirty || !canEditActiveNote || conflictState) return;
    const timer = setTimeout(() => {
      saveFnRef.current(true, false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [noteAutoSave, isDirty, canEditActiveNote, conflictState, title, codePages, isPublic]);

  // 全局 Ctrl + S / Cmd + S 快捷保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (latestDraftRef.current.canEditActiveNote) {
          saveFnRef.current(false, false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 关闭标签页/刷新保底落盘与本地草稿保护
  useEffect(() => {
    const flushAutoSaveOnExit = () => {
      const snap = latestDraftRef.current;
      if (!snap.isDirty || !snap.canEditActiveNote) return;

      if (snap.activeNoteId) {
        saveLocalNoteDraft({
          noteId: snap.activeNoteId,
          folderId: snap.folderId,
          title: snap.title,
          codePages: snap.codePages,
          isPublic: snap.isPublic,
          baseRevision: snap.baseRevision,
          savedAt: Date.now()
        });
      }

      if (!snap.noteAutoSave) return;
      if (keepaliveSentRevisionRef.current === draftRevisionRef.current) return;
      keepaliveSentRevisionRef.current = draftRevisionRef.current;

      api.notes.saveKeepalive({
        id: snap.activeNoteId || undefined,
        folder_id: snap.folderId,
        title: snap.title.trim() || formatDefaultNoteTitle(),
        content: '',
        code_pages: snap.codePages,
        is_public: snap.isPublic,
        base_revision: snap.activeNoteId ? snap.baseRevision : undefined,
        force: false
      });
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const snap = latestDraftRef.current;
      if (!snap.isDirty || !snap.canEditActiveNote) return;

      if (snap.noteAutoSave) {
        flushAutoSaveOnExit();
        return;
      }

      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', flushAutoSaveOnExit);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', flushAutoSaveOnExit);
    };
  }, []);

  // 跨端版本轮询同步：始终同步左侧笔记列表（最新置顶），绝不强制跳转当前页
  useEffect(() => {
    const checkAndSync = async () => {
      const changed = await checkRemoteVersion();
      if (changed) {
        await loadNotesData(true);
      }
    };

    const timer = setInterval(checkAndSync, 3000);
    const handleFocus = () => checkAndSync();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkRemoteVersion, loadNotesData]);

  const markDirty = () => {
    draftRevisionRef.current += 1;
    setIsDirty(true);
  };

  const currentPage = codePages[activeTabIdx] || codePages[0];

  const updateCurrentPage = (updater: (page: CodePage) => CodePage) => {
    if (!canEditActiveNote) return;
    setCodePages((prev) => prev.map((p, idx) => (idx === activeTabIdx ? updater(p) : p)));
    markDirty();
  };

  const handleToggleSidebar = () => {
    if (window.innerWidth < 768) {
      setMobileDrawerOpen((prev) => !prev);
    } else {
      setIsSidebarCollapsed((prev) => {
        const next = !prev;
        localStorage.setItem('notes_sidebar_collapsed', String(next));
        return next;
      });
    }
  };

  const handleToggleWordWrap = () => {
    setWordWrap((prev) => {
      const next = !prev;
      localStorage.setItem('notes_code_word_wrap', String(next));
      window.dispatchEvent(new CustomEvent('notes_word_wrap_change'));
      return next;
    });
  };

  const handleToggleAutoSave = async () => {
    if (isGuest) return;
    const next = !noteAutoSave;
    await setNoteAutoSave(next);
    showToast(
      next
        ? '✅ 已开启自动保存（自动防丢 + 冲突保护）'
        : '已切换为手动保存 / 提交模式（切页将弹窗提醒）',
      2200
    );
  };

  // 手动拉取远端最新状态（Git Pull）
  const handleManualPull = async () => {
    if (isDirty && !confirm('当前有未保存修改，拉取云端最新内容将覆盖本地未保存草稿，是否继续？')) {
      return;
    }
    setIsRefreshing(true);
    if (activeNoteId) clearLocalNoteDraft(activeNoteId);
    setRecoverableDraft(null);
    clearConflictState();
    skipNextActiveNoteHydrateRef.current = false;
    hydratedMetaRef.current = { id: null, rev: 0, updatedAt: '' };
    latestDraftRef.current.isDirty = false;
    setIsDirty(false);
    await loadNotesData(true);
    setHasRemoteUpdate(false);
    showToast('已拉取云端最新状态', 1500);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // 本地草稿恢复 / 丢弃
  const handleRestoreLocalDraft = () => {
    if (!recoverableDraft) return;
    setTitle(recoverableDraft.title);
    setCodePages(recoverableDraft.codePages);
    setIsPublic(recoverableDraft.isPublic);
    setActiveTabIdx(0);
    markDirty();
    setRecoverableDraft(null);
    showToast('已恢复本地草稿，请确认后点击保存', 2400);
  };

  const handleDiscardLocalDraft = () => {
    if (recoverableDraft) {
      clearLocalNoteDraft(recoverableDraft.noteId);
    }
    setRecoverableDraft(null);
  };

  // 冲突解决：1) 强制覆盖（后端自动留存云端快照） 2) 另存冲突副本 3) 放弃本地拉取云端
  const handleConflictOverwrite = async () => {
    setResolvingConflict(true);
    try {
      const ok = await saveCurrentDraft(false, true);
      if (ok) {
        clearConflictState();
        showToast('已覆盖云端（原云端版本已自动存入历史快照）', 2600);
      }
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleConflictSaveCopy = async () => {
    if (!conflictState) return;
    setResolvingConflict(true);
    try {
      const snap = latestDraftRef.current;
      const copyTitle = `${snap.title.trim() || formatDefaultNoteTitle()} (冲突副本)`;
      await saveNote({
        id: null,
        folderId: snap.folderId,
        title: copyTitle,
        codePages: snap.codePages,
        isPublic: false,
        keepActive: true
      });
      if (snap.activeNoteId) clearLocalNoteDraft(snap.activeNoteId);
      clearConflictState();
      hydratedMetaRef.current = { id: null, rev: 0, updatedAt: '' };
      latestDraftRef.current.isDirty = false;
      setIsDirty(false);
      await loadNotesData(true);
      showToast(`已另存本地修改为【${copyTitle}】，原笔记已拉取云端最新`, 3200);
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleConflictAcceptServer = async () => {
    if (!conflictState) return;
    setResolvingConflict(true);
    try {
      clearLocalNoteDraft(conflictState.noteId);
      clearConflictState();
      hydratedMetaRef.current = { id: null, rev: 0, updatedAt: '' };
      latestDraftRef.current.isDirty = false;
      setIsDirty(false);
      setHasRemoteUpdate(false);
      await loadNotesData(true);
      showToast('已拉取云端最新版本', 2000);
    } finally {
      setResolvingConflict(false);
    }
  };

  // Git 式快照抽屉操作
  const openSnapshotDrawer = async () => {
    if (!activeNote) return;
    setSnapshotDrawerOpen(true);
    setLoadingSnapshots(true);
    try {
      const list = await listSnapshots(activeNote.id);
      setSnapshots(list);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const handleCommitSnapshot = async () => {
    if (!activeNote || !canEditActiveNote) return;
    setCommittingSnapshot(true);
    try {
      // 提交快照前，若有未保存修改先尝试落盘保证版本号最新
      if (isDirty) {
        const savedOk = await saveCurrentDraft(true, false);
        if (!savedOk) {
          setCommittingSnapshot(false);
          return;
        }
      }
      const created = await createSnapshot(activeNote.id, {
        message: snapshotMessage.trim() || undefined,
        title: title.trim() || activeNote.title,
        codePages
      });
      if (created) {
        setSnapshotMessage('');
        const list = await listSnapshots(activeNote.id);
        setSnapshots(list);
        showToast('✅ 已提交版本快照', 2000);
      } else {
        showToast('提交快照失败，请重试', 2200);
      }
    } finally {
      setCommittingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (snap: NoteSnapshotItem) => {
    if (!activeNote || !canEditActiveNote) return;
    if (!confirm(`确定回滚到快照【${snap.message}】(${snap.createdAt}) 吗？\n系统会自动先备份当前版本，可随时撤销。`)) {
      return;
    }
    skipNextActiveNoteHydrateRef.current = false;
    hydratedMetaRef.current = { id: null, rev: 0, updatedAt: '' };
    latestDraftRef.current.isDirty = false;
    setIsDirty(false);
    const restored = await restoreSnapshot(activeNote.id, snap.id);
    if (restored) {
      const list = await listSnapshots(activeNote.id);
      setSnapshots(list);
      showToast(`已回滚至快照 (r${restored.revision || 1})`, 2200);
    } else {
      showToast('回滚快照失败，请重试', 2200);
    }
  };

  const handleDeleteSnapshot = async (snapId: string) => {
    if (!activeNote) return;
    if (!confirm('确定删除这条历史快照吗？')) return;
    const ok = await deleteSnapshot(activeNote.id, snapId);
    if (ok) {
      setSnapshots((prev) => prev.filter((s) => s.id !== snapId));
      showToast('快照已删除', 1500);
    }
  };

  const handleCreateRecord = (initialType: 'note' | 'code') => {
    if (isGuest) return;
    requestProtectedAction(async () => {
      const autoTitle = formatDefaultNoteTitle();
      const firstPage: CodePage =
        initialType === 'note'
          ? {
              id: `pg_${Date.now()}`,
              title: '笔记_1',
              pageType: 'note',
              language: 'python',
              code: '',
              blocks: [],
              richContent: '<p></p>'
            }
          : {
              id: `pg_${Date.now()}`,
              title: '片段_1.py',
              pageType: 'code',
              language: 'python',
              code: '',
              blocks: []
            };

      await saveNote({
        id: null,
        folderId: selectedFolderId,
        title: autoTitle,
        codePages: [firstPage],
        isPublic: false
      });
      setActiveTabIdx(0);
      setMobileDrawerOpen(false);
    }, noteAutoSave);
  };

  const handleAddPageToFront = (pageType: 'note' | 'code') => {
    if (!canEditActiveNote) return;
    const existingTitles = new Set(codePages.map((p) => (p.title || '').trim()));
    let seq = codePages.filter((p) => p.pageType === pageType).length + 1;
    let candidateTitle = pageType === 'note' ? `笔记_${seq}` : `片段_${seq}.py`;
    while (existingTitles.has(candidateTitle)) {
      seq += 1;
      candidateTitle = pageType === 'note' ? `笔记_${seq}` : `片段_${seq}.py`;
    }

    const nextPageId = createUniquePageId(pageType);
    const newPage: CodePage =
      pageType === 'note'
        ? {
            id: nextPageId,
            title: candidateTitle,
            pageType: 'note',
            language: 'python',
            code: '',
            blocks: [],
            richContent: '<p></p>'
          }
        : {
            id: nextPageId,
            title: candidateTitle,
            pageType: 'code',
            language: 'python',
            code: '',
            blocks: []
          };

    setCodePages((prev) => [newPage, ...prev]);
    setActiveTabIdx(0);
    markDirty();
  };

  const handleRemovePage = (idx: number) => {
    if (!canEditActiveNote) return;
    if (codePages.length <= 1) {
      alert('每篇记录至少保留一页');
      return;
    }
    const target = codePages[idx];
    if (!confirm(`确定删除页面【${target.title}】吗？`)) return;

    const updated = codePages.filter((_, i) => i !== idx);
    setCodePages(updated);
    setActiveTabIdx((prev) => Math.max(0, Math.min(prev, updated.length - 1)));
    markDirty();
  };

  const handleTabDrop = (targetIdx: number) => {
    if (!canEditActiveNote || dragTabIdx === null || dragTabIdx === targetIdx) {
      setDragTabIdx(null);
      setDragOverTabIdx(null);
      return;
    }
    const currentActiveId = codePages[activeTabIdx]?.id;
    const nextPages = [...codePages];
    const [moved] = nextPages.splice(dragTabIdx, 1);
    nextPages.splice(targetIdx, 0, moved);

    setCodePages(nextPages);
    const newActiveIdx = nextPages.findIndex((p) => p.id === currentActiveId);
    if (newActiveIdx !== -1) setActiveTabIdx(newActiveIdx);

    setDragTabIdx(null);
    setDragOverTabIdx(null);
    markDirty();
  };

  // 执行跨笔记页签迁移
  const executeMovePageToNote = async (
    sourceNoteId: string,
    targetNoteId: string,
    targetNoteTitle: string,
    page: CodePage,
    deleteEmptySource: boolean
  ) => {
    // 若源笔记有未保存改动，先保存其余页改动再执行原子迁移
    if (isDirty && canEditActiveNote) {
      const savedOk = await saveCurrentDraft(true, false);
      if (!savedOk) return;
    }
    skipNextActiveNoteHydrateRef.current = false;
    hydratedMetaRef.current = { id: null, rev: 0, updatedAt: '' };
    latestDraftRef.current.isDirty = false;
    setIsDirty(false);

    const res = await movePageToNote({
      sourceNoteId,
      targetNoteId,
      pageId: page.id,
      pagePayload: page,
      deleteEmptySource
    });

    if (res) {
      showToast(
        res.sourceDeleted
          ? `✅ 已将【${page.title}】移入【${targetNoteTitle}】并删除原空笔记`
          : `✅ 已将【${page.title}】移入【${targetNoteTitle}】`,
        2600
      );
    } else {
      showToast('移动页签失败，请确认两端笔记均有编辑权限', 2600);
    }
  };

  // 将顶部页签拖放到左侧目标笔记卡片上
  const handleDropPageOnNoteCard = async (targetNote: NoteItem) => {
    const srcIdx = dragTabIdx;
    setDragTabIdx(null);
    setDragOverTabIdx(null);
    setDragOverNoteIdForPage(null);

    if (srcIdx === null || !activeNote || !canEditActiveNote) return;
    if (targetNote.id === activeNote.id) return;
    if (targetNote.canEdit === false) {
      showToast('⚠️ 目标笔记为只读，无法移入页签', 2200);
      return;
    }

    const pageToMove = codePages[srcIdx];
    if (!pageToMove) return;

    if (codePages.length <= 1) {
      setLastPageMoveConfirm({
        sourceNoteId: activeNote.id,
        targetNoteId: targetNote.id,
        targetNoteTitle: targetNote.title,
        page: pageToMove
      });
      return;
    }

    await executeMovePageToNote(activeNote.id, targetNote.id, targetNote.title, pageToMove, false);
  };

  // 将左侧笔记卡片拖放到分类文件夹（targetFolderId === null 表示全部笔记/未分类）
  const handleDropNoteOnFolder = async (targetFolderId: string | null, folderLabel: string) => {
    const noteId = draggedNoteId;
    setDraggedNoteId(null);
    setDragOverFolderId(null);
    if (!noteId || isGuest) return;

    const noteObj = notes.find((n) => n.id === noteId);
    if (!noteObj || noteObj.folderId === targetFolderId) return;
    if (noteObj.isOwner === false) {
      showToast('⚠️ 仅笔记作者或管理员可调整笔记分类', 2200);
      return;
    }

    const ok = await moveNoteToFolder(noteId, targetFolderId);
    if (ok) {
      showToast(`📁 已将【${noteObj.title}】移至「${folderLabel}」`, 2200);
    } else {
      showToast('移动分类失败，请重试', 2200);
    }
  };

  const handleOpenShareModal = async () => {
    if (!canManageShare || !activeNote) return;
    setDraftPublic(Boolean(activeNote.isPublic));
    const permMap: Record<string, 'none' | 'read' | 'edit'> = {};
    for (const s of activeNote.shares || []) {
      permMap[s.userId] = s.permission === 'edit' ? 'edit' : 'read';
    }
    setDraftUserPerms(permMap);
    setShareSearch('');
    setShareModalOpen(true);
    try {
      const list = await api.files.getShareableUsers();
      setShareableUsers(Array.isArray(list) ? list : []);
    } catch {
      // ignore
    }
  };

  const handleSaveShareSettings = async () => {
    if (!activeNote || !canManageShare) return;
    setSavingShares(true);
    try {
      const sharesPayload = Object.entries(draftUserPerms)
        .filter(([, perm]) => perm === 'read' || perm === 'edit')
        .map(([userId, perm]) => ({ userId, permission: perm as 'read' | 'edit' }));
      skipNextActiveNoteHydrateRef.current = true;
      const ok = await updateNoteShares(activeNote.id, {
        isPublic: draftPublic,
        shares: sharesPayload
      });
      if (ok) {
        setIsPublic(draftPublic);
        setShareModalOpen(false);
        const editCnt = sharesPayload.filter((s) => s.permission === 'edit').length;
        const readCnt = sharesPayload.filter((s) => s.permission === 'read').length;
        if (draftPublic && sharesPayload.length > 0) {
          showToast(`🌐 已公开并定向共享给 ${sharesPayload.length} 人`, 2200);
        } else if (draftPublic) {
          showToast('🌐 已设为公开 (访客只读可见)', 2000);
        } else if (sharesPayload.length > 0) {
          showToast(`👥 已共享：${editCnt} 人可编辑，${readCnt} 人仅查看`, 2200);
        } else {
          showToast('🔒 已设为仅自己可见', 2000);
        }
      } else {
        skipNextActiveNoteHydrateRef.current = false;
        showToast('保存共享设置失败，请重试', 2200);
      }
    } finally {
      setSavingShares(false);
    }
  };

  // 导入 / 导出
  const handleExportCurrentZipWithImages = async () => {
    if (!activeNote) return;
    setShowExportMenu(false);
    setIsExportingZip(true);
    try {
      if (isDirty && canEditActiveNote) {
        const savedOk = await saveCurrentDraft(true, false);
        if (!savedOk) {
          setIsExportingZip(false);
          return;
        }
      }
      const { blob, filename } = await api.notes.exportNoteZip(
        activeNote.id,
        title || activeNote.title || '未命名笔记'
      );
      triggerBlobDownload(filename, blob);
      showToast('📦 已导出笔记 Markdown 及内嵌图片压缩包', 2400);
    } catch (err) {
      alert(`导出带图压缩包失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportCurrentMarkdown = () => {
    const safeName = (title || '未命名笔记').replace(/[\\/:*?"<>|]/g, '_');
    const mdContent = convertNoteToMarkdown(title || '未命名笔记', codePages);
    triggerBrowserDownload(`${safeName}.md`, mdContent, 'text/markdown;charset=utf-8');
    setShowExportMenu(false);
  };

  const handleExportCurrentJson = () => {
    const safeName = (title || '未命名笔记').replace(/[\\/:*?"<>|]/g, '_');
    const folderObj = folders.find((f) => f.id === activeNote?.folderId);
    const payload = {
      version: '2.1',
      exportedAt: new Date().toISOString(),
      folders: folderObj ? [{ name: folderObj.name }] : [],
      notes: [
        {
          title: title || formatDefaultNoteTitle(),
          folderName: folderObj?.name || null,
          isPublic,
          codePages
        }
      ]
    };
    triggerBrowserDownload(
      `${safeName}.note.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
    setShowExportMenu(false);
  };

  const handleExportAllBackup = () => {
    const folderMap = new Map<string, string>();
    folders.forEach((f) => folderMap.set(f.id, f.name));
    const exportNotes = notes.map((n: NoteItem) => ({
      title: n.title,
      folderName: n.folderId ? folderMap.get(n.folderId) || null : null,
      isPublic: Boolean(n.isPublic),
      codePages: n.codePages
    }));
    const payload = {
      version: '2.1',
      exportedAt: new Date().toISOString(),
      folders: folders.map((f) => ({ name: f.name })),
      notes: exportNotes
    };
    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    triggerBrowserDownload(
      `云端笔记全量备份_${dateTag}.note.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
    setShowExportMenu(false);
  };

  const handleSelectImportFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setImportModal({
      isOpen: true,
      files: selected,
      targetMode: activeNoteId && canEditActiveNote ? 'append_current' : 'new_note'
    });
    e.target.value = '';
  };

  const executeImportFiles = async () => {
    const { files, targetMode } = importModal;
    if (files.length === 0) return;

    try {
      const jsonBackupFiles = files.filter(
        (f) => f.name.endsWith('.note.json') || f.name.endsWith('.json')
      );
      const otherFiles = files.filter(
        (f) => !f.name.endsWith('.note.json') && !f.name.endsWith('.json')
      );

      for (const jf of jsonBackupFiles) {
        const rawText = await jf.text();
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && Array.isArray(parsed.notes)) {
            await importNotesBackup(parsed);
          } else {
            otherFiles.push(jf);
          }
        } catch {
          otherFiles.push(jf);
        }
      }

      if (otherFiles.length > 0) {
        const importedPages: CodePage[] = [];
        for (const file of otherFiles) {
          const text = await file.text();
          const ext = file.name.split('.').pop()?.toLowerCase() || '';

          if (ext === 'md' || ext === 'markdown') {
            importedPages.push({
              id: `pg_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              title: file.name.replace(/\.(md|markdown)$/i, ''),
              pageType: 'note',
              language: 'markdown',
              code: '',
              blocks: [],
              richContent: parseMarkdownToRichHtml(text)
            });
          } else {
            const langMap: Record<string, string> = {
              py: 'python',
              js: 'typescript',
              ts: 'typescript',
              tsx: 'typescript',
              sql: 'sql',
              sh: 'bash',
              json: 'json'
            };
            importedPages.push({
              id: `pg_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              title: file.name,
              pageType: 'code',
              language: langMap[ext] || 'python',
              code: text,
              blocks: []
            });
          }
        }

        if (targetMode === 'append_current' && activeNoteId && canEditActiveNote) {
          const nextPages = [...importedPages, ...codePages];
          setCodePages(nextPages);
          setActiveTabIdx(0);
          const saved = await saveNote({
            id: activeNoteId,
            folderId: activeNote ? activeNote.folderId : selectedFolderId,
            title: title.trim() || formatDefaultNoteTitle(),
            codePages: nextPages,
            isPublic,
            baseRevision
          });
          if (saved) {
            setBaseRevision(saved.revision || 1);
            hydratedMetaRef.current = {
              id: saved.id,
              rev: saved.revision || 1,
              updatedAt: saved.updatedAt
            };
          }
          setIsDirty(false);
        } else {
          const newTitle =
            otherFiles.length === 1
              ? otherFiles[0].name.replace(/\.[^.]+$/, '')
              : `导入笔记_${formatDefaultNoteTitle()}`;
          await saveNote({
            id: null,
            folderId: selectedFolderId,
            title: newTitle,
            codePages: importedPages,
            isPublic: false
          });
          setActiveTabIdx(0);
          setIsDirty(false);
        }
      }

      setImportModal({ isOpen: false, files: [], targetMode: 'new_note' });
      showToast('✅ 导入成功并已同步至云端', 2500);
    } catch (err) {
      alert(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const getPageCopyableText = (page: CodePage | undefined): string => {
    if (!page) return '';
    if (page.pageType === 'code') return page.code || '';
    const html =
      typeof page.richContent === 'string'
        ? page.richContent
        : blocksToRichHtml(page.blocks || []);
    return richHtmlToMarkdown(html);
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleCopyAndNextPage = () => {
    if (!currentPage) return;
    copyText(getPageCopyableText(currentPage), `page_next_${activeTabIdx}`);
    if (activeTabIdx < codePages.length - 1) {
      setActiveTabIdx(activeTabIdx + 1);
    }
  };

  return (
    <div className="h-full w-full bg-[#1e2128] text-gray-200 flex overflow-hidden select-none pb-14 md:pb-0 relative">
      <input
        type="file"
        ref={importFileInputRef}
        multiple
        accept=".py,.js,.ts,.tsx,.sql,.sh,.bash,.txt,.md,.markdown,.json"
        className="hidden"
        onChange={handleSelectImportFiles}
      />

      {mobileDrawerOpen && (
        <div
          onClick={() => setMobileDrawerOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-30"
        />
      )}

      {/* 左侧目录栏 */}
      <div
        className={`${
          mobileDrawerOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'
        } ${
          isSidebarCollapsed ? 'md:hidden' : 'md:flex'
        } w-72 bg-[#191b22] border-r border-gray-800 flex-col h-full shrink-0 transition-all`}
      >
        <div className="p-3.5 border-b border-gray-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-blue-400 flex items-center gap-2">
              <FileText size={16} />
              <span>{isGuest ? '公开云端笔记' : '云端跨端笔记'}</span>
            </h2>
            {!isGuest && (
              <div className="flex items-center gap-1">
                {/* 图标已修正：导入使用向下箭头 Download，导出使用向上箭头 Upload */}
                <button
                  onClick={() => importFileInputRef.current?.click()}
                  className="p-1.5 bg-[#252830] hover:bg-[#323640] text-emerald-400 rounded-lg transition-colors"
                  title="导入代码文件 (.py/.sql/.js)、Markdown (.md) 或备份包 (.note.json)"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={handleExportAllBackup}
                  className="p-1.5 bg-[#252830] hover:bg-[#323640] text-blue-400 rounded-lg transition-colors"
                  title="一键导出全部笔记无损备份包 (.note.json)"
                >
                  <Upload size={14} />
                </button>
                <button
                  onClick={() => setIsAddingFolder(true)}
                  className="p-1.5 bg-[#252830] hover:bg-[#323640] text-gray-300 rounded-lg transition-colors"
                  title="新建笔记分类文件夹"
                >
                  <FolderPlus size={14} />
                </button>
              </div>
            )}
          </div>

          {!isGuest && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleCreateRecord('note')}
                className="flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-1.5 px-2 rounded-lg transition-colors shadow"
              >
                <Plus size={13} />
                <span>新建笔记</span>
              </button>
              <button
                onClick={() => handleCreateRecord('code')}
                className="flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 px-2 rounded-lg transition-colors shadow"
              >
                <Code2 size={13} />
                <span>新建代码</span>
              </button>
            </div>
          )}

          {/* 笔记全文检索框 */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索笔记标题、页签或正文..."
              className="w-full bg-[#13151b] border border-gray-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200"
                title="清空搜索"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {isAddingFolder && !isGuest && (
          <div className="p-3 bg-[#22252e] border-b border-gray-800 flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  createFolder(newFolderName.trim());
                  setNewFolderName('');
                  setIsAddingFolder(false);
                }
              }}
              placeholder="文件夹名称..."
              className="flex-1 bg-[#16181d] border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => {
                if (newFolderName.trim()) createFolder(newFolderName.trim());
                setNewFolderName('');
                setIsAddingFolder(false);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 px-1"
            >
              确定
            </button>
          </div>
        )}

        {/* 分类文件夹列表（支持拖放笔记卡片至此归类） */}
        {!isGuest && (
          <div className="p-2 border-b border-gray-800 max-h-40 overflow-y-auto space-y-1">
            <div
              onClick={() =>
                requestProtectedAction(() => setSelectedFolderId(null), noteAutoSave)
              }
              onDragOver={(e) => {
                if (!draggedNoteId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverFolderId !== '__ALL__') setDragOverFolderId('__ALL__');
              }}
              onDragLeave={() => {
                if (dragOverFolderId === '__ALL__') setDragOverFolderId(null);
              }}
              onDrop={(e) => {
                if (!draggedNoteId) return;
                e.preventDefault();
                void handleDropNoteOnFolder(null, '全部笔记(未分类)');
              }}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-all border ${
                dragOverFolderId === '__ALL__'
                  ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200 shadow'
                  : selectedFolderId === null
                  ? 'bg-blue-600/20 border-transparent text-blue-400 font-medium'
                  : 'border-transparent text-gray-400 hover:bg-[#252830]'
              }`}
              title="可将下方笔记拖动至此取消分类归属"
            >
              <div className="flex items-center gap-2">
                <Folder size={14} />
                <span>全部笔记 ({notes.length})</span>
              </div>
              {dragOverFolderId === '__ALL__' && (
                <span className="text-[10px] text-emerald-300">松手移入</span>
              )}
            </div>

            {folders.map((folder) => {
              const folderCount = notes.filter((n) => n.folderId === folder.id).length;
              const isDropHover = dragOverFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  onClick={() =>
                    requestProtectedAction(() => setSelectedFolderId(folder.id), noteAutoSave)
                  }
                  onDragOver={(e) => {
                    if (!draggedNoteId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                  }}
                  onDrop={(e) => {
                    if (!draggedNoteId) return;
                    e.preventDefault();
                    void handleDropNoteOnFolder(folder.id, folder.name);
                  }}
                  className={`group flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-all border ${
                    isDropHover
                      ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200 shadow scale-[1.01]'
                      : selectedFolderId === folder.id
                      ? 'bg-blue-600/20 border-transparent text-blue-400 font-medium'
                      : 'border-transparent text-gray-400 hover:bg-[#252830]'
                  }`}
                  title="可将下方笔记卡片直接拖动至此分类文件夹"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder size={14} className="text-yellow-500 shrink-0" />
                    <span className="truncate">{folder.name}</span>
                    <span className="text-[10px] text-gray-500 shrink-0">({folderCount})</span>
                  </div>
                  {isDropHover ? (
                    <span className="text-[10px] text-emerald-300 shrink-0">松手归类</span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确定要删除文件夹【${folder.name}】及其内部笔记吗？`)) {
                          deleteFolder(folder.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 拖拽引导提示条 */}
        {(draggedNoteId || dragTabIdx !== null) && (
          <div className="px-3 py-1.5 bg-indigo-950/60 border-b border-indigo-500/40 text-[11px] text-indigo-300">
            {draggedNoteId
              ? '📁 拖动笔记至上方分类文件夹即可归类'
              : '📑 拖动页签至下方任意可编辑笔记卡片即可跨笔记迁移'}
          </div>
        )}

        {/* 笔记列表（支持拖动笔记至分类文件夹 & 接收顶部页签拖入） */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredNotes.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-12 px-3">
              {searchKeyword.trim()
                ? `未找到包含「${searchKeyword.trim()}」的笔记`
                : isGuest
                  ? '当前暂无公开的云端笔记'
                  : '暂无记录，点击上方【新建笔记】或【新建代码】开始创建'}
            </div>
          ) : (
            filteredNotes.map((item) => {
              const noteCount = (item.codePages || []).filter((p) => p.pageType === 'note').length;
              const codeCount = (item.codePages || []).filter((p) => p.pageType !== 'note').length;
              const canDragNote = !isGuest && item.isOwner !== false;
              const canAcceptPageDrop =
                dragTabIdx !== null && item.id !== activeNoteId && item.canEdit !== false;
              const isPageDropHover = dragOverNoteIdForPage === item.id && canAcceptPageDrop;

              return (
                <div
                  key={item.id}
                  draggable={canDragNote}
                  onDragStart={(e) => {
                    if (!canDragNote) return;
                    setDragTabIdx(null);
                    setDraggedNoteId(item.id);
                    e.dataTransfer.setData('application/x-note-item', item.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDraggedNoteId(null);
                    setDragOverFolderId(null);
                  }}
                  onDragOver={(e) => {
                    if (!canAcceptPageDrop) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverNoteIdForPage !== item.id) {
                      setDragOverNoteIdForPage(item.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (
                      dragOverNoteIdForPage === item.id &&
                      !e.currentTarget.contains(e.relatedTarget as globalThis.Node)
                    ) {
                      setDragOverNoteIdForPage(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (!canAcceptPageDrop) return;
                    e.preventDefault();
                    void handleDropPageOnNoteCard(item);
                  }}
                  onClick={() => {
                    if (item.id === activeNoteId) {
                      setMobileDrawerOpen(false);
                      return;
                    }
                    requestProtectedAction(() => {
                      setActiveNoteId(item.id);
                      setMobileDrawerOpen(false);
                    }, noteAutoSave);
                  }}
                  className={`group p-3 rounded-xl cursor-pointer border transition-all ${
                    isPageDropHover
                      ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-lg scale-[1.01]'
                      : activeNoteId === item.id
                      ? 'bg-[#262a34] border-blue-500/40 text-gray-100 shadow'
                      : 'bg-[#1e2128]/60 border-transparent text-gray-300 hover:bg-[#252830]'
                  } ${draggedNoteId === item.id ? 'opacity-45 border-dashed border-gray-500' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold truncate">{item.title}</span>
                      {item.isPublic && (
                        <span className="text-[10px] bg-green-950/70 text-green-400 border border-green-700/50 px-1.5 py-0.2 rounded shrink-0 flex items-center gap-0.5">
                          <Globe size={9} /> 公开
                        </span>
                      )}
                      {item.isOwner !== false && (item.shares?.length || 0) > 0 && (
                        <span
                          className="text-[10px] bg-blue-950/60 text-blue-300 border border-blue-700/50 px-1.5 py-0.2 rounded shrink-0 flex items-center gap-0.5"
                          title={`已定向共享给 ${item.shares?.length || 0} 位成员`}
                        >
                          <Users size={9} /> 共享 {item.shares?.length}
                        </span>
                      )}
                      {item.isOwner === false && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded shrink-0 flex items-center gap-0.5 border ${
                            item.canEdit
                              ? 'bg-indigo-950/60 text-indigo-300 border-indigo-600/50'
                              : 'bg-gray-800 text-gray-300 border-gray-600/60'
                          }`}
                          title={`来自 ${item.authorName || '成员'} 的共享笔记`}
                        >
                          {item.canEdit ? <Pencil size={9} /> : <Eye size={9} />}
                          {item.canEdit ? '可编辑' : '仅查看'}
                        </span>
                      )}
                    </div>
                    {isPageDropHover ? (
                      <span className="text-[10px] text-amber-300 font-medium shrink-0">
                        松手移入页签
                      </span>
                    ) : (
                      !isGuest &&
                      item.isOwner !== false && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`确认删除【${item.title}】？`)) {
                              deleteNote(item.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      )
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1.5">
                    <span>{item.updatedAt}</span>
                    <div className="flex items-center gap-1.5">
                      {noteCount > 0 && <span className="text-indigo-400">{noteCount}页笔记</span>}
                      {codeCount > 0 && <span className="text-blue-400">{codeCount}页代码</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 右侧统一工作区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#16181d]">
        {/* 顶部标题栏 */}
        <header className="min-h-14 py-2 bg-[#252830] border-b border-gray-800 px-3 md:px-6 flex flex-wrap items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <button
              onClick={handleToggleSidebar}
              className="p-2 bg-[#1a1c23] hover:bg-[#323640] text-gray-300 hover:text-white border border-gray-700 rounded-xl transition-colors shrink-0"
              title={isSidebarCollapsed ? '展开左侧笔记目录' : '收起左侧笔记目录'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>

            <input
              type="text"
              value={title}
              readOnly={!canEditActiveNote}
              onChange={(e) => {
                if (!canEditActiveNote) return;
                setTitle(e.target.value);
                markDirty();
              }}
              placeholder={
                isGuest ? '公开笔记只读视图' : `留空保存将自动命名为: ${formatDefaultNoteTitle()}`
              }
              className="flex-1 bg-[#1a1c23] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 font-semibold focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {syncNotice && (
              <span className="text-[11px] bg-green-950/60 text-green-400 border border-green-700/50 px-2.5 py-1 rounded-lg">
                {syncNotice}
              </span>
            )}

            {canManageShare && activeNote && (() => {
              const shareCount = activeNote.shares?.length || 0;
              const label =
                isPublic && shareCount > 0
                  ? `公开 · 已共享(${shareCount})`
                  : isPublic
                    ? '公开 (访客可见)'
                    : shareCount > 0
                      ? `已共享 (${shareCount}人)`
                      : '仅自己可见';
              const toneClass = isPublic
                ? 'bg-green-950/40 border-green-600/60 text-green-300 hover:bg-green-900/50'
                : shareCount > 0
                  ? 'bg-blue-950/40 border-blue-600/60 text-blue-300 hover:bg-blue-900/50'
                  : 'bg-[#1a1c23] border-gray-700 text-gray-400 hover:text-gray-200';
              return (
                <button
                  type="button"
                  onClick={() => void handleOpenShareModal()}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-xl border transition-colors ${toneClass}`}
                  title="配置笔记公开状态与指定用户可见 / 可编辑权限"
                >
                  {isPublic ? (
                    <Globe size={14} className="text-green-400" />
                  ) : shareCount > 0 ? (
                    <Users size={14} className="text-blue-400" />
                  ) : (
                    <Lock size={14} />
                  )}
                  <span className="hidden lg:inline">{label}</span>
                </button>
              );
            })()}

            {!isGuest && activeNote && activeNote.isOwner === false && (
              <span
                className={`flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-xl border ${
                  activeNote.canEdit
                    ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-300'
                    : 'bg-[#1a1c23] border-gray-700 text-gray-400'
                }`}
                title={`原作者：${activeNote.authorName || '管理员'}`}
              >
                {activeNote.canEdit ? <Pencil size={13} /> : <Eye size={13} />}
                <span className="hidden lg:inline">
                  {activeNote.canEdit
                    ? `协作可编辑 · ${activeNote.authorName || '成员'}`
                    : `只读共享 · ${activeNote.authorName || '成员'}`}
                </span>
              </span>
            )}

            {/* 自动保存开关（保留自动保存 + 手动提交双模式） */}
            {!isGuest && (
              <button
                type="button"
                onClick={handleToggleAutoSave}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-xl border transition-colors ${
                  noteAutoSave
                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 font-medium'
                    : 'bg-[#1a1c23] border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
                title="开启：输入停顿/切页/关页自动落盘并带乐观锁防覆盖；关闭：手动保存与快照提交模式"
              >
                <span
                  className={`w-6 h-3.5 rounded-full relative transition-colors inline-block shrink-0 ${
                    noteAutoSave ? 'bg-emerald-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full bg-white absolute top-0.5 transition-all ${
                      noteAutoSave ? 'left-3' : 'left-0.5'
                    }`}
                  />
                </span>
                <span>{isAutoSaving ? '保存中...' : '自动保存'}</span>
              </button>
            )}

            {/* 导入按钮（图标已修正为向下箭头 Download） */}
            {!isGuest && (
              <button
                onClick={() => importFileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-xl bg-[#1a1c23] border border-gray-700 text-gray-300 hover:text-white hover:bg-[#323640] transition-colors"
                title="导入本地代码文件 (.py/.sql/.js)、Markdown 或 .note.json 备份"
              >
                <Download size={14} className="text-emerald-400" />
                <span className="hidden sm:inline">导入</span>
              </button>
            )}

            {/* 导出菜单（图标已修正为向上箭头 Upload，新增带图片 ZIP 导出） */}
            {activeNote && (
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu((prev) => !prev)}
                  disabled={isExportingZip}
                  className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-xl bg-[#1a1c23] border border-gray-700 text-gray-300 hover:text-white hover:bg-[#323640] transition-colors disabled:opacity-50"
                  title="导出当前笔记（支持带图片打包）或全量备份"
                >
                  <Upload size={14} className="text-blue-400" />
                  <span className="hidden sm:inline">{isExportingZip ? '打包中...' : '导出'}</span>
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-1.5 w-56 bg-[#1f232c] border border-gray-700 rounded-xl shadow-2xl py-1.5 z-50 text-xs">
                    <button
                      onClick={() => void handleExportCurrentZipWithImages()}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#2b303c] text-amber-300 font-medium flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-1.5">
                        <FileArchive size={13} />
                        <span>导出 Markdown + 图片</span>
                      </span>
                      <span className="text-[10px] text-amber-400/80">.zip</span>
                    </button>
                    <button
                      onClick={handleExportCurrentMarkdown}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#2b303c] text-gray-200 flex items-center justify-between"
                    >
                      <span>仅导出纯 Markdown</span>
                      <span className="text-[10px] text-gray-400">.md</span>
                    </button>
                    <button
                      onClick={handleExportCurrentJson}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#2b303c] text-gray-200 flex items-center justify-between"
                    >
                      <span>导出当前无损备份</span>
                      <span className="text-[10px] text-blue-400">.json</span>
                    </button>
                    {!isGuest && (
                      <button
                        onClick={handleExportAllBackup}
                        className="w-full text-left px-3.5 py-2 hover:bg-[#2b303c] text-emerald-300 border-t border-gray-800 mt-1 pt-2 flex items-center justify-between"
                      >
                        <span>导出全量笔记备份包</span>
                        <span className="text-[10px]">全部</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Git 式版本快照 / 历史记录 */}
            {!isGuest && activeNote && (
              <button
                type="button"
                onClick={() => void openSnapshotDrawer()}
                className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-xl bg-[#1a1c23] border border-gray-700 text-gray-300 hover:text-white hover:bg-[#323640] transition-colors"
                title={`当前云端版本 r${baseRevision}：点击提交版本快照或回滚历史版本`}
              >
                <History size={14} className="text-indigo-400" />
                <span className="hidden xl:inline">快照</span>
                <span className="text-[10px] font-mono text-gray-400">r{baseRevision}</span>
              </button>
            )}

            {/* 手动拉取云端最新（Git Pull） */}
            <button
              onClick={() => void handleManualPull()}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-colors ${
                hasRemoteUpdate
                  ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300 animate-pulse'
                  : 'bg-[#1a1c23] border-gray-700 text-gray-300 hover:text-white hover:bg-[#323640]'
              }`}
              title="从服务器拉取当前笔记最新状态 (Pull)"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-blue-400' : ''} />
              <span>{hasRemoteUpdate ? '远端有更新' : '拉取'}</span>
            </button>

            {canEditActiveNote && (
              <button
                onClick={() => void saveCurrentDraft(false, false)}
                className="relative flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
                title="保存笔记 (快捷键: Ctrl+S)"
              >
                {saveSuccess ? <Check size={15} /> : <Save size={15} />}
                <span>{saveSuccess ? '已保存' : isDirty ? '保存笔记 *' : '保存笔记'}</span>
                {isDirty && !saveSuccess && (
                  <span className="w-2 h-2 rounded-full bg-amber-300 absolute -top-0.5 -right-0.5 shadow" />
                )}
              </button>
            )}
          </div>
        </header>

        {/* 本地防丢草稿恢复提示条 */}
        {recoverableDraft && (
          <div className="px-4 py-2 bg-amber-950/60 border-b border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <span>
                检测到本机有未同步草稿（缓存于{' '}
                {new Date(recoverableDraft.savedAt).toLocaleTimeString()}），是否恢复？
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestoreLocalDraft}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-medium text-[11px]"
              >
                恢复本地草稿
              </button>
              <button
                type="button"
                onClick={handleDiscardLocalDraft}
                className="px-2.5 py-1 rounded-lg bg-[#1a1c23] hover:bg-gray-800 text-gray-300 border border-gray-700 text-[11px]"
              >
                丢弃草稿
              </button>
            </div>
          </div>
        )}

        {/* 双端版本冲突拦截提示条（HTTP 409 乐观锁保护） */}
        {conflictState && conflictState.noteId === activeNoteId && (
          <div className="px-4 py-2.5 bg-rose-950/70 border-b border-rose-500/50 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-100">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              <span className="leading-relaxed">{conflictState.message}</span>
            </div>
            <div className="flex items-center flex-wrap gap-1.5 shrink-0">
              <button
                type="button"
                disabled={resolvingConflict}
                onClick={() => void handleConflictSaveCopy()}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] disabled:opacity-50"
              >
                另存本地为冲突副本
              </button>
              <button
                type="button"
                disabled={resolvingConflict}
                onClick={() => void handleConflictOverwrite()}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-[11px] disabled:opacity-50"
                title="强制使用本地版本覆盖云端（原云端版本会自动保存到历史快照）"
              >
                本地覆盖云端
              </button>
              <button
                type="button"
                disabled={resolvingConflict}
                onClick={() => void handleConflictAcceptServer()}
                className="px-2.5 py-1 rounded-lg bg-[#1a1c23] hover:bg-gray-800 text-gray-200 border border-gray-700 text-[11px] disabled:opacity-50"
              >
                放弃本地并拉取云端
              </button>
            </div>
          </div>
        )}

        {/* 页面标签栏（支持同笔记排序 & 拖到左侧其他笔记卡片迁移） */}
        <div className="px-3 md:px-6 py-2 bg-[#1d2027] border-b border-gray-800 flex items-center justify-between gap-2">
          <div
            key={activeNoteId || 'empty'}
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
            className="flex items-center gap-1.5 overflow-x-auto py-1 flex-1"
          >
            {codePages.map((page, idx) => {
              const isNotePage = page.pageType === 'note';
              const isActive = activeTabIdx === idx;
              const isDragOver = dragOverTabIdx === idx && dragTabIdx !== idx;

              return (
                <div
                  key={page.id}
                  draggable={canEditActiveNote}
                  onDragStart={(e) => {
                    if (!canEditActiveNote) return;
                    setDraggedNoteId(null);
                    setDragTabIdx(idx);
                    e.dataTransfer.setData('application/x-note-page', page.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!canEditActiveNote || dragTabIdx === null) return;
                    e.preventDefault();
                    if (dragOverTabIdx !== idx) setDragOverTabIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverTabIdx === idx) setDragOverTabIdx(null);
                  }}
                  onDrop={(e) => {
                    if (!canEditActiveNote || dragTabIdx === null) return;
                    e.preventDefault();
                    handleTabDrop(idx);
                  }}
                  onDragEnd={() => {
                    setDragTabIdx(null);
                    setDragOverTabIdx(null);
                    setDragOverNoteIdForPage(null);
                  }}
                  onClick={() => setActiveTabIdx(idx)}
                  title="可拖动调整页签顺序，或直接拖到左侧其他笔记中迁移该页"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer border transition-all shrink-0 ${
                    isDragOver
                      ? 'border-yellow-400 bg-yellow-500/20 scale-105'
                      : isActive
                      ? isNotePage
                        ? 'bg-indigo-600/25 border-indigo-500/60 text-indigo-300 font-semibold shadow'
                        : 'bg-blue-600/25 border-blue-500/60 text-blue-300 font-semibold shadow'
                      : 'bg-[#14161b] border-gray-800 text-gray-400 hover:bg-[#252830] hover:text-gray-200'
                  }`}
                >
                  {canEditActiveNote && <GripVertical size={12} className="text-gray-500 -ml-1" />}
                  {isNotePage ? (
                    <FileText size={13} className="text-indigo-400 shrink-0" />
                  ) : (
                    <Code2 size={13} className="text-blue-400 shrink-0" />
                  )}
                  <span>
                    第 {idx + 1} 页: {page.title}
                  </span>
                  {canEditActiveNote && codePages.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePage(idx);
                      }}
                      className="text-gray-500 hover:text-red-400 ml-1 px-0.5"
                      title="删除此页"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {canEditActiveNote && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => handleAddPageToFront('note')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 transition-colors"
              >
                <Plus size={13} />
                <span className="hidden sm:inline">新增笔记页</span>
                <span className="sm:hidden">笔记页</span>
              </button>
              <button
                onClick={() => handleAddPageToFront('code')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 transition-colors"
              >
                <Plus size={13} />
                <span className="hidden sm:inline">新增代码页</span>
                <span className="sm:hidden">代码页</span>
              </button>
            </div>
          )}
        </div>

        {/* 次级页签信息与跨端复制控制条 */}
        {currentPage && (
          <div className="px-3 md:px-6 py-2 bg-[#191c23] border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                {currentPage.pageType === 'note' ? '📝 富文本笔记页' : '💻 代码页'}
              </span>
              <input
                type="text"
                value={currentPage.title}
                readOnly={!canEditActiveNote}
                onChange={(e) => {
                  const val = e.target.value;
                  updateCurrentPage((p) => ({ ...p, title: val }));
                }}
                className="bg-[#111318] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-blue-300 font-mono focus:outline-none focus:border-blue-500 w-36 md:w-44"
              />
              <span className="text-xs text-gray-500">
                ({activeTabIdx + 1}/{codePages.length})
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleToggleWordWrap}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  wordWrap
                    ? 'bg-blue-600/25 border-blue-500/60 text-blue-300 font-medium'
                    : 'bg-[#252830] border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
                title="切换代码区域是否自动折行"
              >
                <WrapText size={13} />
                <span>自动换行</span>
              </button>

              <button
                onClick={() => setActiveTabIdx((prev) => Math.max(0, prev - 1))}
                disabled={activeTabIdx === 0}
                className="p-1.5 rounded-lg bg-[#252830] hover:bg-gray-700 disabled:opacity-40 text-gray-300"
                title="上一页"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setActiveTabIdx((prev) => Math.min(codePages.length - 1, prev + 1))}
                disabled={activeTabIdx >= codePages.length - 1}
                className="p-1.5 rounded-lg bg-[#252830] hover:bg-gray-700 disabled:opacity-40 text-gray-300"
                title="下一页"
              >
                <ChevronRight size={15} />
              </button>

              <button
                onClick={() => copyText(getPageCopyableText(currentPage), `tab_${activeTabIdx}`)}
                className="flex items-center gap-1 bg-[#252830] hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {copiedKey === `tab_${activeTabIdx}` ? (
                  <Check size={13} className="text-green-400" />
                ) : (
                  <Copy size={13} />
                )}
                <span>{copiedKey === `tab_${activeTabIdx}` ? '已复制!' : '一键复制本页'}</span>
              </button>

              {codePages.length > 1 && (
                <button
                  onClick={handleCopyAndNextPage}
                  className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors shadow"
                >
                  <Sparkles size={13} />
                  <span>
                    {copiedKey === `page_next_${activeTabIdx}` ? '已复制并翻页!' : '复制并翻下一页'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 主体统一编辑画布 */}
        <div
          onClick={() => setShowExportMenu(false)}
          className="flex-1 p-3 md:p-6 overflow-y-auto"
        >
          {!currentPage ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-xs">
              {isGuest ? '请从左侧目录选择一篇公开笔记查看' : '请从左侧选择或新建一篇笔记'}
            </div>
          ) : currentPage.pageType === 'code' ? (
            <SyntaxHighlightEditor
              value={currentPage.code}
              readOnly={!canEditActiveNote}
              wordWrap={wordWrap}
              onChange={(val) => updateCurrentPage((p) => ({ ...p, code: val }))}
              placeholder="# 在此输入或粘贴代码（支持三主题语法颜色标注、Tab 缩进与右上角自动换行切换）..."
              minHeightClass="h-full"
            />
          ) : (
            <RichTextNoteEditor
              key={`${activeNoteId || 'draft'}_${currentPage.id}`}
              content={
                typeof currentPage.richContent === 'string'
                  ? currentPage.richContent
                  : blocksToRichHtml(currentPage.blocks || [])
              }
              editable={canEditActiveNote}
              onChange={(html) => updateCurrentPage((p) => ({ ...p, richContent: html }))}
              onNotify={(msg) => showToast(msg)}
            />
          )}
        </div>
      </div>

      {/* 拖出源笔记最后一页确认弹窗 */}
      {lastPageMoveConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>移出当前笔记的最后一页</span>
              </h3>
              <button
                type="button"
                onClick={() => setLastPageMoveConfirm(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              页面 <span className="text-blue-300 font-semibold">【{lastPageMoveConfirm.page.title}】</span>{' '}
              是当前笔记的唯一一页。将其移入{' '}
              <span className="text-emerald-300 font-semibold">【{lastPageMoveConfirm.targetNoteTitle}】</span>{' '}
              后，原笔记如何处理？
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLastPageMoveConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const cfg = lastPageMoveConfirm;
                  setLastPageMoveConfirm(null);
                  void executeMovePageToNote(
                    cfg.sourceNoteId,
                    cfg.targetNoteId,
                    cfg.targetNoteTitle,
                    cfg.page,
                    false
                  );
                }}
                className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white"
              >
                移出并保留空白页
              </button>
              <button
                type="button"
                onClick={() => {
                  const cfg = lastPageMoveConfirm;
                  setLastPageMoveConfirm(null);
                  void executeMovePageToNote(
                    cfg.sourceNoteId,
                    cfg.targetNoteId,
                    cfg.targetNoteTitle,
                    cfg.page,
                    true
                  );
                }}
                className="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium"
              >
                移出并删除原空笔记
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Git 式版本快照与同步抽屉 */}
      {snapshotDrawerOpen && activeNote && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="w-full max-w-md bg-[#1a1d24] border-l border-gray-800 h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History size={16} className="text-indigo-400" />
                  <span>版本快照与同步 (r{baseRevision})</span>
                </h3>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">{activeNote.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSnapshotDrawerOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            </div>

            {canEditActiveNote && (
              <div className="p-4 border-b border-gray-800 bg-[#20242e] space-y-2.5">
                <div className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                  <BookmarkPlus size={14} className="text-emerald-400" />
                  <span>提交当前快照 (Commit)</span>
                </div>
                <input
                  type="text"
                  value={snapshotMessage}
                  onChange={(e) => setSnapshotMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCommitSnapshot();
                  }}
                  placeholder="输入本次提交说明（可选，例如：下班前封版）..."
                  className="w-full bg-[#14161b] border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400">
                    最多保留最近 50 份快照，回滚前自动备份
                  </span>
                  <button
                    type="button"
                    disabled={committingSnapshot}
                    onClick={() => void handleCommitSnapshot()}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium shrink-0"
                  >
                    {committingSnapshot ? '提交中...' : '提交快照'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {loadingSnapshots ? (
                <div className="text-center text-gray-500 text-xs py-12">加载历史快照中...</div>
              ) : snapshots.length === 0 ? (
                <div className="text-center text-gray-500 text-xs py-12">
                  暂无历史快照。在跨电脑切换或重大修改前可点击上方提交快照留档。
                </div>
              ) : (
                snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-3 rounded-xl bg-[#222631] border border-gray-800 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-100 break-words">
                          {snap.message}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          r{snap.revision} · {snap.pageCount ?? '-'} 页 · {snap.authorName || '成员'} ·{' '}
                          {snap.createdAt}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canEditActiveNote && (
                          <button
                            type="button"
                            onClick={() => void handleRestoreSnapshot(snap)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 text-blue-300 border border-blue-500/40 text-[11px]"
                            title="回滚恢复到此快照"
                          >
                            <RotateCcw size={11} />
                            <span>回滚</span>
                          </button>
                        )}
                        {activeNote.isOwner !== false && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteSnapshot(snap.id)}
                            className="p-1 text-gray-500 hover:text-rose-400"
                            title="删除此快照"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 笔记共享与用户权限设置弹窗 */}
      {shareModalOpen && activeNote && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users size={16} className="text-blue-400 shrink-0" />
                  <span>笔记共享与权限设置</span>
                </h3>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  当前笔记：{activeNote.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#1a1d24] border border-gray-700/80">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-100 flex items-center gap-1.5">
                  <Globe size={14} className={draftPublic ? 'text-green-400' : 'text-gray-500'} />
                  <span>公开访问（访客及所有账号只读可见）</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  开启后任何人均可查看并复制本笔记；编辑权限需在下方单独授权。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraftPublic((prev) => !prev)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border shrink-0 transition-colors ${
                  draftPublic
                    ? 'bg-green-600/20 border-green-500/60 text-green-300'
                    : 'bg-[#252830] border-gray-600 text-gray-400 hover:text-gray-200'
                }`}
              >
                {draftPublic ? '已开启' : '未开启'}
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-200">指定成员权限</span>
                {Object.values(draftUserPerms).some((p) => p === 'read' || p === 'edit') && (
                  <button
                    type="button"
                    onClick={() => setDraftUserPerms({})}
                    className="text-[11px] text-rose-400 hover:text-rose-300"
                  >
                    清空定向共享
                  </button>
                )}
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={shareSearch}
                  onChange={(e) => setShareSearch(e.target.value)}
                  placeholder="搜索成员姓名或登录账号..."
                  className="w-full bg-[#1a1d24] border border-gray-700 rounded-xl pl-8 pr-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
                {(() => {
                  const kw = shareSearch.trim().toLowerCase();
                  const candidates = shareableUsers.filter((u) => {
                    if (String(u.id) === String(currentUser?.id)) return false;
                    if (!kw) return true;
                    return (
                      (u.name || '').toLowerCase().includes(kw) ||
                      (u.username || '').toLowerCase().includes(kw)
                    );
                  });

                  if (candidates.length === 0) {
                    return (
                      <div className="text-center text-xs text-gray-500 py-6">
                        暂无可配置的其他成员账号
                      </div>
                    );
                  }

                  return candidates.map((u) => {
                    const currentPerm = draftUserPerms[u.id] || 'none';
                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#1a1d24] border border-gray-800"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-100 truncate">
                            {u.name || u.username}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">@{u.username}</div>
                        </div>

                        <div className="inline-flex items-center rounded-lg bg-[#14161b] border border-gray-700 p-0.5 shrink-0 text-[11px]">
                          {(
                            [
                              { value: 'none', label: '无权限' },
                              { value: 'read', label: '仅查看' },
                              { value: 'edit', label: '可编辑' }
                            ] as const
                          ).map((opt) => {
                            const selected = currentPerm === opt.value;
                            const activeCls =
                              opt.value === 'edit'
                                ? 'bg-indigo-600 text-white'
                                : opt.value === 'read'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700 text-gray-100';
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setDraftUserPerms((prev) => ({ ...prev, [u.id]: opt.value }))
                                }
                                className={`px-2.5 py-1 rounded-md transition-colors ${
                                  selected ? activeCls : 'text-gray-400 hover:text-gray-200'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingShares}
                onClick={() => void handleSaveShareSettings()}
                className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium"
              >
                {savingShares ? '保存中...' : '保存共享设置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入笔记确认弹窗 */}
      {importModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                <Download size={16} className="text-emerald-400" />
                <span>导入文件至云端笔记 ({importModal.files.length} 个文件)</span>
              </h3>
              <button
                onClick={() => setImportModal({ isOpen: false, files: [], targetMode: 'new_note' })}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-36 overflow-y-auto bg-[#1a1c23] border border-gray-800 rounded-xl p-2.5 mb-4 space-y-1">
              {importModal.files.map((f, i) => (
                <div key={i} className="text-xs text-gray-300 flex items-center justify-between">
                  <span className="truncate">{f.name}</span>
                  <span className="text-[10px] text-gray-500 shrink-0 ml-2">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>

            {activeNoteId && canEditActiveNote && (
              <div className="space-y-2 mb-5">
                <div className="text-xs text-gray-400 mb-1">请选择导入方式（针对代码与 Markdown 文件）：</div>
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-700 bg-[#1a1c23] cursor-pointer text-xs">
                  <input
                    type="radio"
                    checked={importModal.targetMode === 'append_current'}
                    onChange={() =>
                      setImportModal((prev) => ({ ...prev, targetMode: 'append_current' }))
                    }
                  />
                  <span>追加为当前笔记【{title || '当前笔记'}】的新标签页</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-700 bg-[#1a1c23] cursor-pointer text-xs">
                  <input
                    type="radio"
                    checked={importModal.targetMode === 'new_note'}
                    onChange={() =>
                      setImportModal((prev) => ({ ...prev, targetMode: 'new_note' }))
                    }
                  />
                  <span>创建为一篇全新的独立笔记</span>
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setImportModal({ isOpen: false, files: [], targetMode: 'new_note' })}
                className="px-3.5 py-1.5 rounded-xl text-xs text-gray-400 hover:bg-[#1e2128]"
              >
                取消
              </button>
              <button
                onClick={executeImportFiles}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium shadow"
              >
                确认导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
