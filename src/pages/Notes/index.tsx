// src/pages/Notes/index.tsx
import { useState, useEffect, useRef } from 'react';
import {
  FolderPlus, Plus, Trash2, Save, Copy, Check, Code2, FileText,
  ChevronLeft, ChevronRight, Folder, Sparkles, RefreshCw, GripVertical,
  PanelLeftClose, PanelLeftOpen, WrapText, Globe, Lock, Download, Upload, X
} from 'lucide-react';
import { useNoteStore, blocksToRichHtml, formatDefaultNoteTitle } from '../../store/useNoteStore';
import type { CodePage, NoteItem } from '../../store/useNoteStore';
import { useAuthStore } from '../../store/useAuthStore';
import { SyntaxHighlightEditor } from '../../components/notes/SyntaxHighlightEditor';
import RichTextNoteEditor from '../../components/notes/RichTextNoteEditor';

// ============================================================================
// 富文本 HTML <-> Markdown / 纯文本双向转换工具（支持嵌套待办与 4 级重要度）
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
          // 兼容普通 DOM 结构下的内容包装层
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

// 将导入的 Markdown 文本（含代码块、图片、多级缩进待办与优先级）解析为 TipTap HTML
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

    // 1. 围栏代码块
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

    // 2. 多级任务待办列表 (- [ ] / - [x]，支持 [紧急]/[重要]/[普通]/[低])
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

    // 3. 图片行
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgMatch) {
      out.push(
        `<div data-type="collapsible-image-block" data-src="${escapeHtmlAttr(imgMatch[2])}" data-title="${escapeHtmlAttr(imgMatch[1] || 'image.png')}" data-width="75" data-collapsed="false"></div>`
      );
      i++;
      continue;
    }

    // 4. 标题 / 分割线 / 引用 / 普通列表 / 段落
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// 笔记主页面组件
// ============================================================================
export default function Notes() {
  const { currentUser } = useAuthStore();
  const {
    folders, notes, selectedFolderId, activeNoteId,
    loadNotesData, checkRemoteVersion, setSelectedFolderId, setActiveNoteId,
    createFolder, deleteFolder, saveNote, toggleNotePublic, deleteNote,
    importNotesBackup
  } = useNoteStore();

  const isGuest = currentUser?.role === 'guest';

  const [title, setTitle] = useState('');
  const [codePages, setCodePages] = useState<CodePage[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // 左侧目录折叠与移动端抽屉状态
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('notes_sidebar_collapsed') === 'true';
  });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // 代码自动换行状态（与富文本内嵌折叠代码窗全局联动）
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

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [importModal, setImportModal] = useState<{
    isOpen: boolean;
    files: File[];
    targetMode: 'new_note' | 'append_current';
  }>({
    isOpen: false,
    files: [],
    targetMode: 'new_note'
  });

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

  const [isDirty, setIsDirty] = useState(false);
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [dragTabIdx, setDragTabIdx] = useState<number | null>(null);
  const [dragOverTabIdx, setDragOverTabIdx] = useState<number | null>(null);

  const importFileInputRef = useRef<HTMLInputElement>(null);

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

  const filteredNotes = selectedFolderId
    ? notes.filter((n) => n.folderId === selectedFolderId)
    : notes;

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;
  const canEditActiveNote = !isGuest && (activeNote ? activeNote.isOwner !== false : true);

  useEffect(() => {
    if (activeNote) {
      setTitle(activeNote.title);
      setCodePages(activeNote.codePages || []);
      setIsPublic(Boolean(activeNote.isPublic));
      setActiveTabIdx((prev) => (prev < (activeNote.codePages?.length || 1) ? prev : 0));
      setIsDirty(false);
    } else {
      setTitle('');
      setCodePages([]);
      setIsPublic(false);
      setActiveTabIdx(0);
      setIsDirty(false);
    }
  }, [activeNote]);

  // 跨端版本轮询同步
  useEffect(() => {
    const checkAndSync = async () => {
      const changed = await checkRemoteVersion();
      if (changed) {
        if (!isDirty) {
          await loadNotesData(true);
          setHasRemoteUpdate(false);
          showToast('⚡ 已自动同步远端最新状态', 2500);
        } else {
          setHasRemoteUpdate(true);
        }
      }
    };

    const timer = setInterval(checkAndSync, 3000);
    const handleFocus = () => checkAndSync();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isDirty, checkRemoteVersion, loadNotesData]);

  const currentPage = codePages[activeTabIdx] || codePages[0];

  const updateCurrentPage = (updater: (page: CodePage) => CodePage) => {
    if (!canEditActiveNote) return;
    setCodePages((prev) => prev.map((p, idx) => (idx === activeTabIdx ? updater(p) : p)));
    setIsDirty(true);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadNotesData(true);
    setIsDirty(false);
    setHasRemoteUpdate(false);
    showToast('已刷新至最新云端状态', 1200);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleCreateRecord = async (initialType: 'note' | 'code') => {
    if (isGuest) return;
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
  };

  const handleAddPageToFront = (pageType: 'note' | 'code') => {
    if (!canEditActiveNote) return;
    const sameTypeCount = codePages.filter((p) => p.pageType === pageType).length + 1;
    const newPage: CodePage =
      pageType === 'note'
        ? {
            id: `pg_${Date.now()}`,
            title: `笔记_${sameTypeCount}`,
            pageType: 'note',
            language: 'python',
            code: '',
            blocks: [],
            richContent: '<p></p>'
          }
        : {
            id: `pg_${Date.now()}`,
            title: `片段_${sameTypeCount}.py`,
            pageType: 'code',
            language: 'python',
            code: '',
            blocks: []
          };

    setCodePages((prev) => [newPage, ...prev]);
    setActiveTabIdx(0);
    setIsDirty(true);
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
    setIsDirty(true);
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
    setIsDirty(true);
  };

  const handleSaveCurrentNote = async () => {
    if (!canEditActiveNote) return;
    const saved = await saveNote({
      id: activeNoteId,
      folderId: activeNote ? activeNote.folderId : selectedFolderId,
      title: title.trim() || formatDefaultNoteTitle(),
      codePages,
      isPublic
    });
    if (saved) {
      setTitle(saved.title);
      setIsDirty(false);
      setHasRemoteUpdate(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1800);
    }
  };

  const handleTogglePublicStatus = async () => {
    if (!canEditActiveNote) return;
    const nextState = !isPublic;
    setIsPublic(nextState);
    if (activeNoteId) {
      const ok = await toggleNotePublic(activeNoteId, nextState);
      if (ok) {
        showToast(nextState ? '🌐 已设为公开 (访客可见)' : '🔒 已设为仅自己可见', 2000);
      }
    } else {
      setIsDirty(true);
    }
  };

  // ============================================================================
  // 导入 / 导出核心处理
  // ============================================================================
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
          await saveNote({
            id: activeNoteId,
            folderId: activeNote ? activeNote.folderId : selectedFolderId,
            title: title.trim() || formatDefaultNoteTitle(),
            codePages: nextPages,
            isPublic
          });
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
        }
      }

      setImportModal({ isOpen: false, files: [], targetMode: 'new_note' });
      showToast('✅ 导入成功并已同步至云端', 2500);
    } catch (err) {
      alert(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // 提取整洁文本供“一键复制本页”使用
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
                <button
                  onClick={() => importFileInputRef.current?.click()}
                  className="p-1.5 bg-[#252830] hover:bg-[#323640] text-emerald-400 rounded-lg transition-colors"
                  title="导入代码文件 (.py/.sql/.js)、Markdown (.md) 或备份包 (.note.json)"
                >
                  <Upload size={14} />
                </button>
                <button
                  onClick={handleExportAllBackup}
                  className="p-1.5 bg-[#252830] hover:bg-[#323640] text-blue-400 rounded-lg transition-colors"
                  title="一键导出全部笔记无损备份包 (.note.json)"
                >
                  <Download size={14} />
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

        {!isGuest && (
          <div className="p-2 border-b border-gray-800 max-h-36 overflow-y-auto space-y-1">
            <div
              onClick={() => setSelectedFolderId(null)}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                selectedFolderId === null
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-gray-400 hover:bg-[#252830]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Folder size={14} />
                <span>全部笔记 ({notes.length})</span>
              </div>
            </div>

            {folders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => setSelectedFolderId(folder.id)}
                className={`group flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                  selectedFolderId === folder.id
                    ? 'bg-blue-600/20 text-blue-400 font-medium'
                    : 'text-gray-400 hover:bg-[#252830]'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Folder size={14} className="text-yellow-500 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定要删除文件夹【${folder.name}】及其内部笔记吗？`)) {
                      deleteFolder(folder.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredNotes.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-12 px-3">
              {isGuest ? '当前暂无公开的云端笔记' : '暂无记录，点击上方【新建笔记】或【新建代码】开始创建'}
            </div>
          ) : (
            filteredNotes.map((item) => {
              const noteCount = (item.codePages || []).filter((p) => p.pageType === 'note').length;
              const codeCount = (item.codePages || []).filter((p) => p.pageType !== 'note').length;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setActiveNoteId(item.id);
                    setMobileDrawerOpen(false);
                  }}
                  className={`group p-3 rounded-xl cursor-pointer border transition-all ${
                    activeNoteId === item.id
                      ? 'bg-[#262a34] border-blue-500/40 text-gray-100 shadow'
                      : 'bg-[#1e2128]/60 border-transparent text-gray-300 hover:bg-[#252830]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold truncate">{item.title}</span>
                      {item.isPublic && (
                        <span className="text-[10px] bg-green-950/70 text-green-400 border border-green-700/50 px-1.5 py-0.2 rounded shrink-0 flex items-center gap-0.5">
                          <Globe size={9} /> 公开
                        </span>
                      )}
                    </div>
                    {!isGuest && item.isOwner !== false && (
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
                setIsDirty(true);
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

            {canEditActiveNote && activeNote && (
              <button
                onClick={handleTogglePublicStatus}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-colors ${
                  isPublic
                    ? 'bg-green-950/40 border-green-600/60 text-green-300 hover:bg-green-900/50'
                    : 'bg-[#1a1c23] border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
                title="开启公开后，未登录的访客也可查看并复制此笔记"
              >
                {isPublic ? <Globe size={14} className="text-green-400" /> : <Lock size={14} />}
                <span>{isPublic ? '公开 (访客可见)' : '仅自己可见'}</span>
              </button>
            )}

            {!isGuest && (
              <button
                onClick={() => importFileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-xl bg-[#1a1c23] border border-gray-700 text-gray-300 hover:text-white hover:bg-[#323640] transition-colors"
                title="导入本地代码文件 (.py/.sql/.js)、Markdown 或 .note.json 备份"
              >
                <Upload size={14} className="text-emerald-400" />
                <span className="hidden sm:inline">导入</span>
              </button>
            )}

            {activeNote && (
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu((prev) => !prev)}
                  className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-xl bg-[#1a1c23] border border-gray-700 text-gray-300 hover:text-white hover:bg-[#323640] transition-colors"
                  title="导出当前笔记或全量备份"
                >
                  <Download size={14} className="text-blue-400" />
                  <span className="hidden sm:inline">导出</span>
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-1.5 w-48 bg-[#1f232c] border border-gray-700 rounded-xl shadow-2xl py-1.5 z-50 text-xs">
                    <button
                      onClick={handleExportCurrentMarkdown}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#2b303c] text-gray-200 flex items-center justify-between"
                    >
                      <span>导出当前为 Markdown</span>
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

            <button
              onClick={handleManualRefresh}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-colors ${
                hasRemoteUpdate
                  ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300 animate-pulse'
                  : 'bg-[#1a1c23] border-gray-700 text-gray-300 hover:text-white hover:bg-[#323640]'
              }`}
              title="从服务器拉取最新保存状态"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-blue-400' : ''} />
              <span>{hasRemoteUpdate ? '远端已更新' : '刷新'}</span>
            </button>

            {canEditActiveNote && (
              <button
                onClick={handleSaveCurrentNote}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
              >
                {saveSuccess ? <Check size={15} /> : <Save size={15} />}
                <span>{saveSuccess ? '已保存' : '保存笔记'}</span>
              </button>
            )}
          </div>
        </header>

        {/* 页面标签栏 */}
        <div className="px-3 md:px-6 py-2 bg-[#1d2027] border-b border-gray-800 flex items-center justify-between gap-2">
          <div
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
                  onDragStart={() => canEditActiveNote && setDragTabIdx(idx)}
                  onDragOver={(e) => {
                    if (!canEditActiveNote) return;
                    e.preventDefault();
                    if (dragOverTabIdx !== idx) setDragOverTabIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverTabIdx === idx) setDragOverTabIdx(null);
                  }}
                  onDrop={(e) => {
                    if (!canEditActiveNote) return;
                    e.preventDefault();
                    handleTabDrop(idx);
                  }}
                  onDragEnd={() => {
                    setDragTabIdx(null);
                    setDragOverTabIdx(null);
                  }}
                  onClick={() => setActiveTabIdx(idx)}
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

      {/* 导入笔记确认弹窗 */}
      {importModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                <Upload size={16} className="text-emerald-400" />
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
                className="px-3.5 py-1.5 rounded-xl text-xs text-gray-400 hover:bg-[#1a1c23]"
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