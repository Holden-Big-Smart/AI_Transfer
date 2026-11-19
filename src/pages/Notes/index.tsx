// src/pages/Notes/index.tsx
import { useState, useEffect, useRef } from 'react';
import {
  FolderPlus, Plus, Trash2, Save, Copy, Check, Code2, FileText,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Folder,
  Sparkles, RefreshCw, GripVertical, PanelLeftClose, PanelLeftOpen,
  WrapText, Globe, Lock, Image as ImageIcon, Scissors, Download, Upload, X
} from 'lucide-react';
import { useNoteStore, formatDefaultNoteTitle } from '../../store/useNoteStore';
import type { CodePage, NoteItem, NoteSubBlock } from '../../store/useNoteStore';
import { useAuthStore } from '../../store/useAuthStore';
import { api } from '../../utils/api';

// ============================================================================
// 方案 A：零依赖语法颜色高亮编译器
// ============================================================================
const TOKEN_REGEX =
  /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*)|(@[a-zA-Z_]\w*)|\b(def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|async|await|yield|lambda|pass|break|continue|in|is|not|and|or|True|False|None|self|const|let|var|function|export|default|interface|type|SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|LEFT|RIGHT|ON|GROUP|BY|ORDER|LIMIT|CREATE|TABLE|DROP|ALTER|VALUES|SET|AND|OR|NOT|NULL)\b|\b(print|len|range|str|int|float|list|dict|set|tuple|open|super|isinstance|enumerate|zip|map|filter|Exception|Promise|Array|Object|String|Number|Boolean|console|window|document)\b|\b([a-zA-Z_]\w*)(?=\s*\()|\b(\d+(?:\.\d+)?)\b/g;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightCodeToHtml(code: string): string {
  if (!code) return '';
  let result = '';
  let lastIndex = 0;
  TOKEN_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(code.slice(lastIndex, match.index));
    }
    const [full, strTok, commentTok, decoratorTok, kwTok, builtinTok, funcTok, numTok] = match;
    const safe = escapeHtml(full);

    if (strTok) {
      result += `<span class="code-tok-str">${safe}</span>`;
    } else if (commentTok) {
      result += `<span class="code-tok-comment">${safe}</span>`;
    } else if (decoratorTok) {
      result += `<span class="code-tok-decorator">${safe}</span>`;
    } else if (kwTok) {
      result += `<span class="code-tok-kw">${safe}</span>`;
    } else if (builtinTok) {
      result += `<span class="code-tok-builtin">${safe}</span>`;
    } else if (funcTok) {
      result += `<span class="code-tok-func">${safe}</span>`;
    } else if (numTok) {
      result += `<span class="code-tok-num">${safe}</span>`;
    } else {
      result += safe;
    }
    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < code.length) {
    result += escapeHtml(code.slice(lastIndex));
  }
  if (code.endsWith('\n')) {
    result += ' ';
  }
  return result;
}

// ============================================================================
// 零依赖双层叠加语法高亮代码编辑器
// ============================================================================
interface HighlightEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  autoHeight?: boolean;
  wordWrap?: boolean;
  readOnly?: boolean;
}

function SyntaxHighlightEditor({
  value,
  onChange,
  placeholder = '# 在此输入或粘贴代码...',
  minHeightClass = 'h-full',
  autoHeight = false,
  wordWrap = false,
  readOnly = false
}: HighlightEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.substring(0, start) + '    ' + value.substring(end);
      onChange(next);
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + 4;
      }, 0);
    }
  };

  const lineCount = Math.max(1, value.split('\n').length);
  const extraWrapLines = wordWrap
    ? value.split('\n').reduce((acc, l) => acc + Math.floor(l.length / 75), 0)
    : 0;
  const computedHeight = autoHeight
    ? `${Math.min(560, Math.max(130, (lineCount + extraWrapLines) * 24 + 36))}px`
    : undefined;

  return (
    <div
      style={computedHeight ? { height: computedHeight } : undefined}
      className={`relative w-full ${minHeightClass} bg-[#111318] border border-gray-800 rounded-xl overflow-hidden flex focus-within:border-blue-500/60 transition-colors`}
    >
      {!wordWrap && (
        <div
          ref={gutterRef}
          className="w-11 py-4 bg-[#151820] border-r border-gray-800/80 text-right pr-2.5 font-mono text-xs leading-6 text-gray-600 select-none overflow-hidden shrink-0"
        >
          {Array.from({ length: lineCount }).map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>
      )}

      <div className="relative flex-1 h-full overflow-hidden">
        <pre
          ref={preRef}
          aria-hidden="true"
          className={`code-editor-pre absolute inset-0 m-0 p-4 font-mono text-xs leading-6 overflow-hidden pointer-events-none select-none ${
            wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
          }`}
          dangerouslySetInnerHTML={{
            __html: value
              ? highlightCodeToHtml(value)
              : `<span class="code-editor-placeholder">${escapeHtml(placeholder)}</span>`
          }}
        />
        <textarea
          ref={textareaRef}
          value={value}
          readOnly={readOnly}
          onChange={(e) => !readOnly && onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className={`code-editor-textarea absolute inset-0 w-full h-full m-0 p-4 font-mono text-xs leading-6 bg-transparent text-transparent resize-none focus:outline-none select-text ${
            wordWrap ? 'whitespace-pre-wrap break-all overflow-y-auto overflow-x-hidden' : 'whitespace-pre overflow-auto'
          }`}
        />
      </div>
    </div>
  );
}

// ============================================================================
// 导入/导出辅助转换工具
// ============================================================================
function convertNoteToMarkdown(title: string, pages: CodePage[]): string {
  const lines: string[] = [`# ${title}\n`];
  pages.forEach((p, idx) => {
    lines.push(`## 第 ${idx + 1} 页: ${p.title} (${p.pageType === 'note' ? '笔记页' : '代码页'})\n`);
    if (p.pageType === 'code') {
      lines.push(`\`\`\`${p.language || 'python'}\n${p.code || ''}\n\`\`\`\n`);
    } else {
      (p.blocks || []).forEach((b) => {
        if (b.type === 'text' && b.content.trim()) {
          lines.push(`${b.content}\n`);
        } else if (b.type === 'code') {
          lines.push(`\`\`\`${b.language || 'python'}\n${b.content || ''}\n\`\`\`\n`);
        } else if (b.type === 'image' && b.imageUrl) {
          lines.push(`![${b.title || '图片'}](${window.location.origin}${b.imageUrl})\n`);
        }
      });
    }
  });
  return lines.join('\n');
}

function parseMarkdownToBlocks(mdText: string): NoteSubBlock[] {
  const parts = mdText.split(/```(\w*)\n([\s\S]*?)```/g);
  const blocks: NoteSubBlock[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const textSeg = parts[i];
    const langSeg = parts[i + 1];
    const codeSeg = parts[i + 2];

    if (textSeg !== undefined && (textSeg.trim() || blocks.length === 0)) {
      blocks.push({
        id: `blk_md_${Date.now()}_${i}`,
        type: 'text',
        content: textSeg.replace(/^\n+|\n+$/g, ''),
        language: 'python',
        collapsed: false,
        title: ''
      });
    }
    if (codeSeg !== undefined) {
      blocks.push({
        id: `blk_md_code_${Date.now()}_${i + 1}`,
        type: 'code',
        content: codeSeg.replace(/\n$/, ''),
        language: langSeg || 'python',
        collapsed: false,
        title: `代码片段_${blocks.filter((b) => b.type === 'code').length + 1}`
      });
    }
  }
  if (blocks.length === 0 || blocks[blocks.length - 1].type !== 'text') {
    blocks.push({
      id: `blk_md_tail_${Date.now()}`,
      type: 'text',
      content: '',
      language: 'python',
      collapsed: false,
      title: ''
    });
  }
  return blocks;
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

// 时间戳唯一 ID：把 Date.now / Math.random 收敛到事件处理路径，避免在渲染期被调用
function makeBlockId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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

  // 占位提示中的默认标题（惰性初始化一次，避免在渲染期反复读取系统时间）
  const [autoTitlePlaceholder] = useState(() => formatDefaultNoteTitle());

  // 左侧目录折叠与移动端抽屉状态
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('notes_sidebar_collapsed') === 'true';
  });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // 代码自动换行状态
  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    return localStorage.getItem('notes_code_word_wrap') === 'true';
  });

  // 导出下拉菜单与导入弹窗状态
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
      return next;
    });
  };

  const [isDirty, setIsDirty] = useState(false);
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [dragTabIdx, setDragTabIdx] = useState<number | null>(null);
  const [dragOverTabIdx, setDragOverTabIdx] = useState<number | null>(null);

  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [selectedImageBlockId, setSelectedImageBlockId] = useState<string | null>(null);
  const [internalImageClip, setInternalImageClip] = useState<{
    url: string;
    title: string;
    width: number;
  } | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const textBlockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
      setSelectedImageBlockId(null);
    } else {
      setTitle('');
      setCodePages([]);
      setIsPublic(false);
      setActiveTabIdx(0);
      setIsDirty(false);
      setSelectedImageBlockId(null);
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
          setSyncNotice('⚡ 已自动同步远端最新状态');
          setTimeout(() => setSyncNotice(null), 2500);
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

  const showNotice = (text: string, ms = 2200) => {
    setSyncNotice(text);
    setTimeout(() => setSyncNotice(null), ms);
  };

  // 在指定索引位置插入新文本行并自动聚焦（供两张连续图片之间或按回车时插入文字）
  const insertTextLineAtBlockIndex = (insertIdx: number) => {
    if (!currentPage || currentPage.pageType !== 'note' || !canEditActiveNote) return;
    const newTextId = makeBlockId('blk_txt');
    const newTextBlock: NoteSubBlock = {
      id: newTextId,
      type: 'text',
      content: '',
      language: 'python',
      collapsed: false,
      title: ''
    };
    const nextBlocks = [...(currentPage.blocks || [])];
    nextBlocks.splice(insertIdx, 0, newTextBlock);
    updateCurrentPage((p) => ({ ...p, blocks: nextBlocks }));
    setSelectedImageBlockId(null);
    setFocusedBlockId(newTextId);
    setTimeout(() => {
      textBlockRefs.current[newTextId]?.focus();
    }, 30);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadNotesData(true);
    setIsDirty(false);
    setHasRemoteUpdate(false);
    setSyncNotice('已刷新至最新云端状态');
    setTimeout(() => {
      setIsRefreshing(false);
      setSyncNotice(null);
    }, 1200);
  };

  const handleCreateRecord = async (initialType: 'note' | 'code') => {
    if (isGuest) return;
    const autoTitle = formatDefaultNoteTitle();
    const firstPage: CodePage =
      initialType === 'note'
        ? {
            id: makeBlockId('pg'),
            title: '笔记_1',
            pageType: 'note',
            language: 'python',
            code: '',
            blocks: [
              {
                id: makeBlockId('blk'),
                type: 'text',
                content: '',
                language: 'python',
                collapsed: false,
                title: ''
              }
            ]
          }
        : {
            id: makeBlockId('pg'),
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
            id: makeBlockId('pg'),
            title: `笔记_${sameTypeCount}`,
            pageType: 'note',
            language: 'python',
            code: '',
            blocks: [
              {
                id: makeBlockId('blk'),
                type: 'text',
                content: '',
                language: 'python',
                collapsed: false,
                title: ''
              }
            ]
          }
        : {
            id: makeBlockId('pg'),
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
        showNotice(nextState ? '🌐 已设为公开 (访客可见)' : '🔒 已设为仅自己可见', 2000);
      }
    } else {
      setIsDirty(true);
    }
  };

  // ============================================================================
  // Notion 式流式块插入算法：自动清理连续图片/代码块之间的多余空文本块
  // ============================================================================
  const insertSubBlockAtCursor = (newBlock: NoteSubBlock, targetTextBlockId?: string) => {
    if (!currentPage || currentPage.pageType !== 'note' || !canEditActiveNote) return;

    const blocks =
      currentPage.blocks && currentPage.blocks.length > 0
        ? [...currentPage.blocks]
        : [
            {
              id: makeBlockId('blk'),
              type: 'text' as const,
              content: '',
              language: 'python',
              collapsed: false,
              title: ''
            }
          ];

    const lookupId = targetTextBlockId || focusedBlockId;
    let targetIdx = blocks.findIndex((b) => b.id === lookupId && b.type === 'text');
    if (targetIdx === -1) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].type === 'text') {
          targetIdx = i;
          break;
        }
      }
    }

    if (targetIdx === -1) {
      const trailingId = makeBlockId('blk_txt');
      const trailingText: NoteSubBlock = {
        id: trailingId,
        type: 'text',
        content: '',
        language: 'python',
        collapsed: false,
        title: ''
      };
      updateCurrentPage((p) => ({ ...p, blocks: [...blocks, newBlock, trailingText] }));
      setFocusedBlockId(trailingId);
      return;
    }

    const targetBlock = blocks[targetIdx];
    const el = textBlockRefs.current[targetBlock.id];
    const cursorPos = el ? el.selectionStart : targetBlock.content.length;

    const beforeText = targetBlock.content.slice(0, cursorPos);
    const afterText = targetBlock.content.slice(cursorPos);

    const replacement: NoteSubBlock[] = [];

    // 只有光标前半段确实有文字时才保留前半段文本块，消除连续粘贴图片时中间残留的空文本框
    if (beforeText.length > 0) {
      replacement.push({ ...targetBlock, content: beforeText });
    }

    replacement.push(newBlock);

    const afterBlockId = makeBlockId('blk_txt');
    const isLastBlock = targetIdx === blocks.length - 1;
    if (afterText.length > 0 || isLastBlock) {
      replacement.push({
        id: afterBlockId,
        type: 'text',
        content: afterText,
        language: 'python',
        collapsed: false,
        title: ''
      });
    }

    blocks.splice(targetIdx, 1, ...replacement);

    // 清理相邻的空文本块，确保最末尾始终有一个尾随文本输入点
    const cleaned: NoteSubBlock[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const curr = blocks[i];
      const prev = cleaned[cleaned.length - 1];
      if (curr.type === 'text' && prev && prev.type === 'text' && !prev.content && !curr.content) {
        continue;
      }
      cleaned.push(curr);
    }
    if (cleaned.length === 0 || cleaned[cleaned.length - 1].type !== 'text') {
      cleaned.push({
        id: afterBlockId,
        type: 'text',
        content: '',
        language: 'python',
        collapsed: false,
        title: ''
      });
    }

    const lastTextBlk = cleaned[cleaned.length - 1];
    updateCurrentPage((p) => ({ ...p, blocks: cleaned }));
    setFocusedBlockId(lastTextBlk.id);
    setTimeout(() => {
      textBlockRefs.current[lastTextBlk.id]?.focus();
    }, 30);
  };

  const handleInsertCollapsibleCodeWindow = () => {
    if (!currentPage || currentPage.pageType !== 'note') return;
    const blocks = currentPage.blocks || [];
    const newCodeBlock: NoteSubBlock = {
      id: makeBlockId('blk_code'),
      type: 'code',
      content: '',
      language: 'python',
      collapsed: false,
      title: `代码片段_${blocks.filter((b) => b.type === 'code').length + 1}.py`
    };
    insertSubBlockAtCursor(newCodeBlock);
  };

  const uploadAndInsertImage = async (file: File | Blob, targetBlockId?: string) => {
    if (!canEditActiveNote) return;
    setIsUploadingImage(true);
    try {
      const res = await api.notes.uploadImage(
        file,
        file instanceof File ? file.name : `paste_${Date.now()}.png`
      );
      const newImgBlock: NoteSubBlock = {
        id: makeBlockId('blk_img'),
        type: 'image',
        content: '',
        language: 'image',
        collapsed: false,
        title: file instanceof File ? file.name : 'image.png',
        imageUrl: res.url,
        imageWidth: 75
      };
      insertSubBlockAtCursor(newImgBlock, targetBlockId);
      showNotice('🖼️ 图片已嵌入画布，记得点击保存笔记');
    } catch (err) {
      alert(`图片上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleTextPaste = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    blockId: string
  ) => {
    if (!canEditActiveNote) return;
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            await uploadAndInsertImage(blob, blockId);
          }
          return;
        }
      }
    }

    const pastedText = e.clipboardData?.getData('text/plain') || '';
    if (pastedText.startsWith('__NOTE_IMG__:')) {
      e.preventDefault();
      const imgUrl = pastedText.replace('__NOTE_IMG__:', '').trim();
      const newImgBlock: NoteSubBlock = {
        id: makeBlockId('blk_img'),
        type: 'image',
        content: '',
        language: 'image',
        collapsed: false,
        title: internalImageClip?.title || 'image.png',
        imageUrl: imgUrl,
        imageWidth: internalImageClip?.width || 75
      };
      insertSubBlockAtCursor(newImgBlock, blockId);
    }
  };

  const handleCopyImageBlock = async (block: NoteSubBlock) => {
    if (!block.imageUrl) return;
    setInternalImageClip({
      url: block.imageUrl,
      title: block.title || 'image.png',
      width: block.imageWidth || 75
    });

    try {
      const response = await fetch(block.imageUrl);
      const blob = await response.blob();
      if (window.ClipboardItem && navigator.clipboard?.write) {
        const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      } else {
        await navigator.clipboard.writeText(`__NOTE_IMG__:${block.imageUrl}`);
      }
    } catch {
      await navigator.clipboard.writeText(`__NOTE_IMG__:${block.imageUrl}`).catch(() => {});
    }

    setCopiedKey(`img_copy_${block.id}`);
    showNotice('📋 图片已复制，可在任意位置按 Ctrl+V 粘贴', 1800);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleCutImageBlock = async (block: NoteSubBlock) => {
    if (!canEditActiveNote || !block.imageUrl) return;
    await handleCopyImageBlock(block);
    handleRemoveSubBlock(block.id);
    setSelectedImageBlockId(null);
    showNotice('✂️ 图片已剪切，可在目标位置按 Ctrl+V 粘贴', 2000);
  };

  const handleRemoveSubBlock = (blockId: string) => {
    if (!currentPage || currentPage.pageType !== 'note' || !canEditActiveNote) return;
    const raw = (currentPage.blocks || []).filter((b) => b.id !== blockId);
    const merged: NoteSubBlock[] = [];

    for (const blk of raw) {
      const prev = merged[merged.length - 1];
      if (prev && prev.type === 'text' && blk.type === 'text') {
        prev.content =
          prev.content && blk.content ? `${prev.content}\n${blk.content}` : `${prev.content}${blk.content}`;
      } else {
        merged.push({ ...blk });
      }
    }
    if (merged.length === 0 || merged[merged.length - 1].type !== 'text') {
      merged.push({
        id: makeBlockId('blk'),
        type: 'text',
        content: '',
        language: 'python',
        collapsed: false,
        title: ''
      });
    }
    updateCurrentPage((p) => ({ ...p, blocks: merged }));
  };

  // 选中图片时的快捷键监听（Ctrl+C 复制 / Ctrl+X 剪切 / Delete 删除 / Enter 在图片下方输入文字）
  useEffect(() => {
    if (!selectedImageBlockId || !currentPage || currentPage.pageType !== 'note') return;
    const blocks = currentPage.blocks || [];
    const imgIdx = blocks.findIndex((b) => b.id === selectedImageBlockId && b.type === 'image');
    if (imgIdx === -1) return;
    const imgBlock = blocks[imgIdx];

    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopyImageBlock(imgBlock);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (!canEditActiveNote) return;
        e.preventDefault();
        handleCutImageBlock(imgBlock);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!canEditActiveNote) return;
        e.preventDefault();
        handleRemoveSubBlock(imgBlock.id);
        setSelectedImageBlockId(null);
      } else if (e.key === 'Enter') {
        if (!canEditActiveNote) return;
        e.preventDefault();
        insertTextLineAtBlockIndex(imgIdx + 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImageBlockId, currentPage, canEditActiveNote]);

  const handleInsertTextFormat = (prefix: string, suffix: string = '') => {
    if (!currentPage || currentPage.pageType !== 'note' || !canEditActiveNote) return;
    const blocks = currentPage.blocks || [];
    const targetId = focusedBlockId || blocks.find((b) => b.type === 'text')?.id;
    if (!targetId) return;

    const el = textBlockRefs.current[targetId];
    updateCurrentPage((p) => ({
      ...p,
      blocks: (p.blocks || []).map((b) => {
        if (b.id !== targetId) return b;
        const start = el ? el.selectionStart : b.content.length;
        const end = el ? el.selectionEnd : b.content.length;
        const selected = b.content.substring(start, end) || '文本';
        const nextContent =
          b.content.substring(0, start) + prefix + selected + suffix + b.content.substring(end);
        return { ...b, content: nextContent };
      })
    }));
  };

  // ============================================================================
  // 导入 / 导出核心处理函数
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
      version: '2.0',
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
      version: '2.0',
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
      // 1. 识别是否包含 .note.json 备份包
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

      // 2. 处理普通代码文件与 Markdown 文档 (.py, .js, .ts, .sql, .md, .txt 等)
      if (otherFiles.length > 0) {
        const importedPages: CodePage[] = [];
        for (const file of otherFiles) {
          const text = await file.text();
          const ext = file.name.split('.').pop()?.toLowerCase() || '';

          if (ext === 'md' || ext === 'markdown') {
            importedPages.push({
              id: makeBlockId('pg_imp'),
              title: file.name.replace(/\.(md|markdown)$/i, ''),
              pageType: 'note',
              language: 'markdown',
              code: '',
              blocks: parseMarkdownToBlocks(text)
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
              id: makeBlockId('pg_imp'),
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
      showNotice('✅ 导入成功并已同步至云端', 2500);
    } catch (err) {
      alert(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const getPageCopyableText = (page: CodePage | undefined): string => {
    if (!page) return '';
    if (page.pageType === 'code') return page.code || '';
    return (page.blocks || [])
      .filter((b) => b.type !== 'image')
      .map((b) => b.content)
      .filter((t) => t !== '')
      .join('\n\n');
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
      {/* 隐藏的图片上传与笔记导入文件选择器 */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadAndInsertImage(file);
          e.target.value = '';
        }}
      />
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
                      ? 'bg-[#262a34] border-blue-500/40 text-white shadow'
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
                isGuest ? '公开笔记只读视图' : `留空保存将自动命名为: ${autoTitlePlaceholder}`
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

            {/* 导入按钮 */}
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

            {/* 导出下拉菜单 */}
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

        {/* 次级控制工具栏 */}
        {currentPage && (
          <div className="px-3 md:px-6 py-2 bg-[#191c23] border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                  {currentPage.pageType === 'note' ? '📝 笔记页' : '💻 代码页'}
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

              {currentPage.pageType === 'note' && canEditActiveNote && (
                <div className="flex items-center gap-1.5 pl-2 border-l border-gray-800 flex-wrap">
                  <button
                    onClick={() => handleInsertTextFormat('**', '**')}
                    className="px-2 py-1 text-xs bg-[#252830] hover:bg-gray-700 rounded text-gray-200 font-bold"
                    title="加粗文本"
                  >
                    B
                  </button>
                  <button
                    onClick={() => handleInsertTextFormat('### ')}
                    className="px-2 py-1 text-xs bg-[#252830] hover:bg-gray-700 rounded text-gray-200"
                    title="插入标题"
                  >
                    H3
                  </button>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors"
                    title="上传图片插入到当前光标处（也支持直接在画布按 Ctrl+V 粘贴截图）"
                  >
                    <ImageIcon size={13} />
                    <span>{isUploadingImage ? '上传中...' : '插入图片'}</span>
                  </button>
                  <button
                    onClick={handleInsertCollapsibleCodeWindow}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow"
                    title="在当前光标位置直接插入一个可展开/收起的代码编辑窗口"
                  >
                    <Code2 size={13} />
                    <span>插入代码块窗口</span>
                  </button>
                </div>
              )}
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

        {/* 主体统一编辑画布（Notion 式无缝图文融合体验） */}
        <div
          onClick={() => {
            setSelectedImageBlockId(null);
            setShowExportMenu(false);
          }}
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
              placeholder="# 在此输入或粘贴代码（支持语法颜色标注、Tab 缩进与右上角自动换行切换）..."
              minHeightClass="h-full"
            />
          ) : (
            /* Notion 式一体化无框流式文档画布 */
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget && canEditActiveNote) {
                  const blocks = currentPage.blocks || [];
                  const lastBlk = blocks[blocks.length - 1];
                  if (lastBlk && lastBlk.type === 'text') {
                    textBlockRefs.current[lastBlk.id]?.focus();
                  } else {
                    insertTextLineAtBlockIndex(blocks.length);
                  }
                }
              }}
              className="max-w-4xl mx-auto min-h-full bg-[#1b1e26] border border-gray-800/80 rounded-2xl px-5 md:px-10 py-6 md:py-8 shadow-inner space-y-1.5 cursor-text"
            >
              {(currentPage.blocks || []).map((block, bIdx) => {
                const allBlocks = currentPage.blocks || [];
                const prevBlock = bIdx > 0 ? allBlocks[bIdx - 1] : null;
                const showInsertLineAbove =
                  canEditActiveNote && block.type !== 'text' && (!prevBlock || prevBlock.type !== 'text');

                // 1. Notion 式无边框自适应文本段落（仅在整页完全空白时显示占位提示）
                if (block.type === 'text') {
                  const isOnlyEmptyBlock = allBlocks.length === 1 && !block.content;
                  const lineRows = Math.max(1, block.content.split('\n').length);

                  return (
                    <textarea
                      key={block.id}
                      ref={(el) => {
                        textBlockRefs.current[block.id] = el;
                      }}
                      rows={lineRows}
                      readOnly={!canEditActiveNote}
                      value={block.content}
                      onFocus={() => {
                        setFocusedBlockId(block.id);
                        setSelectedImageBlockId(null);
                      }}
                      onPaste={(e) => handleTextPaste(e, block.id)}
                      onKeyDown={(e) => {
                        // 在空文本段按 Backspace 时，若不是唯一段落则自动回收该空行
                        if (
                          canEditActiveNote &&
                          e.key === 'Backspace' &&
                          !block.content &&
                          allBlocks.length > 1 &&
                          bIdx < allBlocks.length - 1
                        ) {
                          e.preventDefault();
                          handleRemoveSubBlock(block.id);
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateCurrentPage((p) => ({
                          ...p,
                          blocks: (p.blocks || []).map((b) =>
                            b.id === block.id ? { ...b, content: val } : b
                          )
                        }));
                      }}
                      placeholder={
                        isOnlyEmptyBlock
                          ? '在此输入笔记内容... 支持直接按 Ctrl+V 粘贴截图/图片（图文自动无缝融合），或点击上方嵌入可折叠代码窗。'
                          : ''
                      }
                      className="w-full bg-transparent border-none px-1 py-1 text-sm text-gray-100 leading-relaxed focus:outline-none resize-none overflow-hidden select-text block"
                    />
                  );
                }

                // 2. 内嵌图片块（支持像代码块一样收起为长条状，且保留复制/剪切按钮）
                if (block.type === 'image') {
                  const isImgSelected = selectedImageBlockId === block.id;
                  const widthPct = block.imageWidth || 75;

                  return (
                    <div key={block.id} className="my-1.5">
                      {/* 当两张图片紧挨时，鼠标悬停在缝隙可一键插入文字行 */}
                      {showInsertLineAbove && (
                        <div className="group/ins h-2 flex items-center justify-center my-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              insertTextLineAtBlockIndex(bIdx);
                            }}
                            className="opacity-0 group-hover/ins:opacity-100 text-[10px] text-blue-400 bg-blue-950/60 border border-blue-500/40 px-2 py-0.2 rounded-full transition-opacity"
                          >
                            + 在此插入文字行
                          </button>
                        </div>
                      )}

                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImageBlockId(block.id);
                        }}
                        className={`bg-[#14171f] border rounded-xl overflow-hidden transition-all ${
                          isImgSelected
                            ? 'border-blue-400 ring-2 ring-blue-500/30 shadow-lg'
                            : 'border-gray-800/90 hover:border-gray-700'
                        }`}
                      >
                        {/* 图片块顶部控制长条（收起后仅保留此长条，且完整保留复制/剪切/删除按钮） */}
                        <div className="px-3 py-1.5 bg-[#1b1f2a] flex items-center justify-between flex-wrap gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCodePages((prev) =>
                                  prev.map((p, idx) =>
                                    idx === activeTabIdx
                                      ? {
                                          ...p,
                                          blocks: (p.blocks || []).map((b) =>
                                            b.id === block.id ? { ...b, collapsed: !b.collapsed } : b
                                          )
                                        }
                                      : p
                                  )
                                );
                              }}
                              className="flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-600/20 px-2 py-0.5 rounded-md transition-colors shrink-0"
                              title={block.collapsed ? '点击展开图片' : '点击收起图片为长条'}
                            >
                              {block.collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                              <span>{block.collapsed ? '展开' : '收起'}</span>
                            </button>

                            <ImageIcon size={13} className="text-emerald-400 shrink-0" />

                            <input
                              type="text"
                              readOnly={!canEditActiveNote}
                              value={block.title || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateCurrentPage((p) => ({
                                  ...p,
                                  blocks: (p.blocks || []).map((b) =>
                                    b.id === block.id ? { ...b, title: val } : b
                                  )
                                }));
                              }}
                              placeholder="图片名称..."
                              className="bg-[#111318] border border-gray-700/80 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 w-36 truncate"
                            />

                            {block.collapsed ? (
                              <span className="text-[11px] text-gray-500 truncate">
                                (已收起图片 · 可直接复制/剪切)
                              </span>
                            ) : (
                              canEditActiveNote && (
                                <div className="flex items-center gap-1 ml-1">
                                  {[25, 50, 75, 100].map((w) => (
                                    <button
                                      key={w}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateCurrentPage((p) => ({
                                          ...p,
                                          blocks: (p.blocks || []).map((b) =>
                                            b.id === block.id ? { ...b, imageWidth: w } : b
                                          )
                                        }));
                                      }}
                                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                                        widthPct === w
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-[#222631] text-gray-400 hover:text-gray-200'
                                      }`}
                                    >
                                      {w}%
                                    </button>
                                  ))}
                                </div>
                              )
                            )}
                          </div>

                          {/* 右侧操作按钮：无论展开还是收起状态，均常驻保留复制/剪切/删除 */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyImageBlock(block);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-[#252830] hover:bg-gray-700 text-gray-200 border border-gray-700"
                              title="复制图片 (选中按 Ctrl+C)"
                            >
                              {copiedKey === `img_copy_${block.id}` ? (
                                <Check size={12} className="text-green-400" />
                              ) : (
                                <Copy size={12} />
                              )}
                              <span>{copiedKey === `img_copy_${block.id}` ? '已复制' : '复制图片'}</span>
                            </button>

                            {canEditActiveNote && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCutImageBlock(block);
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#252830] hover:bg-gray-700 text-yellow-300 border border-gray-700"
                                  title="剪切图片 (选中按 Ctrl+X)"
                                >
                                  <Scissors size={12} />
                                  <span>剪切</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveSubBlock(block.id);
                                  }}
                                  className="p-1 text-gray-500 hover:text-red-400"
                                  title="删除图片"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 展开状态下显示图片内容 */}
                        {!block.collapsed && (
                          <div className="flex justify-center bg-[#0e1015] p-2.5 border-t border-gray-800/80 overflow-hidden">
                            <img
                              src={block.imageUrl}
                              alt={block.title || '笔记图片'}
                              style={{ width: `${widthPct}%` }}
                              className="max-w-full h-auto rounded object-contain select-all"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // 3. 可展开/收起的内嵌代码块窗口
                const codeLineCount = Math.max(1, block.content.split('\n').length);
                const firstLinePreview =
                  block.content.split('\n').find((l) => l.trim().length > 0) || '空代码块';

                return (
                  <div key={block.id} className="my-2">
                    {showInsertLineAbove && (
                      <div className="group/ins h-2 flex items-center justify-center my-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            insertTextLineAtBlockIndex(bIdx);
                          }}
                          className="opacity-0 group-hover/ins:opacity-100 text-[10px] text-blue-400 bg-blue-950/60 border border-blue-500/40 px-2 py-0.2 rounded-full transition-opacity"
                        >
                          + 在此插入文字行
                        </button>
                      </div>
                    )}

                    <div className="bg-[#13151b] border border-indigo-500/40 rounded-xl overflow-hidden shadow-lg">
                      <div className="px-3.5 py-2 bg-[#1c2029] border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <button
                            onClick={() =>
                              setCodePages((prev) =>
                                prev.map((p, idx) =>
                                  idx === activeTabIdx
                                    ? {
                                        ...p,
                                        blocks: (p.blocks || []).map((b) =>
                                          b.id === block.id ? { ...b, collapsed: !b.collapsed } : b
                                        )
                                      }
                                    : p
                                )
                              )
                            }
                            className="flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-600/20 px-2 py-1 rounded-md transition-colors shrink-0"
                          >
                            {block.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            <span>{block.collapsed ? '展开' : '收起'}</span>
                          </button>

                          <input
                            type="text"
                            readOnly={!canEditActiveNote}
                            value={block.title || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateCurrentPage((p) => ({
                                ...p,
                                blocks: (p.blocks || []).map((b) =>
                                  b.id === block.id ? { ...b, title: val } : b
                                )
                              }));
                            }}
                            placeholder="代码块说明..."
                            className="bg-[#111318] border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 w-36 shrink-0"
                          />

                          <select
                            disabled={!canEditActiveNote}
                            value={block.language || 'python'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateCurrentPage((p) => ({
                                ...p,
                                blocks: (p.blocks || []).map((b) =>
                                  b.id === block.id ? { ...b, language: val } : b
                                )
                              }));
                            }}
                            className="bg-[#111318] border border-gray-700 rounded px-2 py-0.5 text-[11px] text-blue-300 focus:outline-none shrink-0"
                          >
                            <option value="python">Python</option>
                            <option value="typescript">TypeScript / JS</option>
                            <option value="sql">SQL</option>
                            <option value="bash">Bash / Shell</option>
                            <option value="json">JSON</option>
                          </select>

                          {block.collapsed && (
                            <span className="text-[11px] text-gray-500 font-mono truncate ml-2">
                              ({codeLineCount} 行) {firstLinePreview}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={handleToggleWordWrap}
                            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
                              wordWrap
                                ? 'bg-blue-600/25 border-blue-500/50 text-blue-300'
                                : 'bg-[#252830] border-gray-700 text-gray-400 hover:text-gray-200'
                            }`}
                            title="切换自动换行"
                          >
                            <WrapText size={12} />
                            <span>换行</span>
                          </button>

                          <button
                            onClick={() => copyText(block.content, `inline_${block.id}`)}
                            className="flex items-center gap-1 text-xs bg-[#252830] hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded-md border border-gray-700 transition-colors"
                          >
                            {copiedKey === `inline_${block.id}` ? (
                              <Check size={12} className="text-green-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                            <span>{copiedKey === `inline_${block.id}` ? '已复制' : '复制代码'}</span>
                          </button>

                          {canEditActiveNote && (
                            <button
                              onClick={() => handleRemoveSubBlock(block.id)}
                              className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                              title="删除此代码块窗口"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {!block.collapsed && (
                        <div className="p-2 bg-[#111318]">
                          <SyntaxHighlightEditor
                            value={block.content}
                            readOnly={!canEditActiveNote}
                            wordWrap={wordWrap}
                            onChange={(val) =>
                              updateCurrentPage((p) => ({
                                ...p,
                                blocks: (p.blocks || []).map((b) =>
                                  b.id === block.id ? { ...b, content: val } : b
                                )
                              }))
                            }
                            placeholder="# 在此输入代码块内容..."
                            autoHeight
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
                <div className="text-xs text-gray-400 mb-1">
                  请选择导入方式（针对代码与 Markdown 文件）：
                </div>
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
                    onChange={() => setImportModal((prev) => ({ ...prev, targetMode: 'new_note' }))}
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
