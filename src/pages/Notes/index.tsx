// src/pages/Notes/index.tsx
import { useState, useEffect, useRef } from 'react';
import {
  FolderPlus, Plus, Trash2, Save, Copy, Check, Code2, FileText,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Folder,
  Sparkles, RefreshCw, GripVertical, PanelLeftClose, PanelLeftOpen,
  WrapText, Globe, Lock, Image as ImageIcon, Scissors
} from 'lucide-react';
import { useNoteStore, formatDefaultNoteTitle } from '../../store/useNoteStore';
import type { CodePage, NoteSubBlock } from '../../store/useNoteStore';
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
      result += `<span class="text-amber-300">${safe}</span>`;
    } else if (commentTok) {
      result += `<span class="text-emerald-500/80 italic">${safe}</span>`;
    } else if (decoratorTok) {
      result += `<span class="text-yellow-400">${safe}</span>`;
    } else if (kwTok) {
      result += `<span class="text-purple-400 font-semibold">${safe}</span>`;
    } else if (builtinTok) {
      result += `<span class="text-cyan-400">${safe}</span>`;
    } else if (funcTok) {
      result += `<span class="text-blue-400">${safe}</span>`;
    } else if (numTok) {
      result += `<span class="text-orange-400">${safe}</span>`;
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
// 零依赖双层叠加语法高亮代码编辑器（支持自动换行切换与只读模式）
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
      {/* 未开启自动换行时展示精确行号栏；开启自动换行时隐藏静态行号栏以防折行错位 */}
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

      {/* 双层高亮叠加编辑区 */}
      <div className="relative flex-1 h-full overflow-hidden">
        <pre
          ref={preRef}
          aria-hidden="true"
          className={`absolute inset-0 m-0 p-4 font-mono text-xs leading-6 text-gray-200 overflow-hidden pointer-events-none select-none ${
            wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
          }`}
          dangerouslySetInnerHTML={{
            __html: value
              ? highlightCodeToHtml(value)
              : `<span class="text-gray-600">${escapeHtml(placeholder)}</span>`
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
          className={`absolute inset-0 w-full h-full m-0 p-4 font-mono text-xs leading-6 bg-transparent text-transparent caret-white resize-none focus:outline-none select-text ${
            wordWrap ? 'whitespace-pre-wrap break-all overflow-y-auto overflow-x-hidden' : 'whitespace-pre overflow-auto'
          }`}
        />
      </div>
    </div>
  );
}

// ============================================================================
// 笔记主页面组件
// ============================================================================
export default function Notes() {
  const { currentUser } = useAuthStore();
  const {
    folders, notes, selectedFolderId, activeNoteId,
    loadNotesData, checkRemoteVersion, setSelectedFolderId, setActiveNoteId,
    createFolder, deleteFolder, saveNote, toggleNotePublic, deleteNote
  } = useNoteStore();

  const isGuest = currentUser?.role === 'guest';

  const [title, setTitle] = useState('');
  const [codePages, setCodePages] = useState<CodePage[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // 左侧笔记目录栏折叠开关（桌面端持久化在 localStorage，移动端作为抽屉开关）
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('notes_sidebar_collapsed') === 'true';
  });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // 代码自动换行开关（持久化在 localStorage）
  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    return localStorage.getItem('notes_code_word_wrap') === 'true';
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

  // 标签页拖拽排序状态
  const [dragTabIdx, setDragTabIdx] = useState<number | null>(null);
  const [dragOverTabIdx, setDragOverTabIdx] = useState<number | null>(null);

  // 笔记页内焦点文本块、选中图片块与内部图片剪贴板（支持粘贴/复制/剪切图片）
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [selectedImageBlockId, setSelectedImageBlockId] = useState<string | null>(null);
  const [internalImageClip, setInternalImageClip] = useState<{ url: string; title: string; width: number } | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const textBlockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 新建文件夹状态
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // 复制与保存反馈状态
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadNotesData();
  }, [loadNotesData]);

  // 占位提示中的默认标题（惰性初始化一次，避免在渲染期反复读取系统时间）
  const [autoTitlePlaceholder] = useState(() => formatDefaultNoteTitle());

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

  // 跨端动态同步机制：每 3 秒及窗口切回焦点时检测远端是否有新版本
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

  // 手动刷新按钮
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

  // 新建笔记或新建代码
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
            blocks: [
              {
                id: `blk_${Date.now()}`,
                type: 'text',
                content: '',
                language: 'python',
                collapsed: false,
                title: ''
              }
            ]
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

  // 在同篇记录最前面（Index 0）新增笔记页或代码页
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
            blocks: [
              {
                id: `blk_${Date.now()}`,
                type: 'text',
                content: '',
                language: 'python',
                collapsed: false,
                title: ''
              }
            ]
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

  // 标签页拖拽排序
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

  // 保存当前笔记
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

  // 切换当前笔记公开/私密状态（公开后访客可见）
  const handleTogglePublicStatus = async () => {
    if (!canEditActiveNote) return;
    const nextState = !isPublic;
    setIsPublic(nextState);
    if (activeNoteId) {
      const ok = await toggleNotePublic(activeNoteId, nextState);
      if (ok) {
        setSyncNotice(nextState ? '🌐 已设为公开 (访客可见)' : '🔒 已设为仅自己可见');
        setTimeout(() => setSyncNotice(null), 2000);
      }
    } else {
      setIsDirty(true);
    }
  };

  // 通用辅助：在当前聚焦的文本块光标处切分并插入一个新子块（用于插入代码窗或插入粘贴的图片）
  const insertSubBlockAtCursor = (newBlock: NoteSubBlock, targetTextBlockId?: string) => {
    if (!currentPage || currentPage.pageType !== 'note' || !canEditActiveNote) return;

    const blocks =
      currentPage.blocks && currentPage.blocks.length > 0
        ? [...currentPage.blocks]
        : [
            {
              id: `blk_${Date.now()}`,
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
      const trailingText: NoteSubBlock = {
        id: `blk_txt_${Date.now()}_after`,
        type: 'text',
        content: '',
        language: 'python',
        collapsed: false,
        title: ''
      };
      updateCurrentPage((p) => ({ ...p, blocks: [...blocks, newBlock, trailingText] }));
      return;
    }

    const targetBlock = blocks[targetIdx];
    const el = textBlockRefs.current[targetBlock.id];
    const cursorPos = el ? el.selectionStart : targetBlock.content.length;

    const beforeText = targetBlock.content.slice(0, cursorPos);
    const afterText = targetBlock.content.slice(cursorPos);

    const beforeBlock: NoteSubBlock = { ...targetBlock, content: beforeText };
    const afterBlock: NoteSubBlock = {
      id: `blk_txt_${Date.now()}_after`,
      type: 'text',
      content: afterText,
      language: 'python',
      collapsed: false,
      title: ''
    };

    blocks.splice(targetIdx, 1, beforeBlock, newBlock, afterBlock);
    updateCurrentPage((p) => ({ ...p, blocks }));
  };

  // 在光标处插入可折叠代码块窗口
  const handleInsertCollapsibleCodeWindow = () => {
    if (!currentPage || currentPage.pageType !== 'note') return;
    const blocks = currentPage.blocks || [];
    const newCodeBlock: NoteSubBlock = {
      id: `blk_code_${Date.now()}`,
      type: 'code',
      content: '',
      language: 'python',
      collapsed: false,
      title: `代码片段_${blocks.filter((b) => b.type === 'code').length + 1}.py`
    };
    insertSubBlockAtCursor(newCodeBlock);
  };

  // 上传图片文件并在光标处插入图片块
  const uploadAndInsertImage = async (file: File | Blob, targetBlockId?: string) => {
    if (!canEditActiveNote) return;
    setIsUploadingImage(true);
    try {
      const res = await api.notes.uploadImage(
        file,
        file instanceof File ? file.name : `paste_${Date.now()}.png`
      );
      const newImgBlock: NoteSubBlock = {
        id: `blk_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'image',
        content: '',
        language: 'image',
        collapsed: false,
        title: file instanceof File ? file.name : '粘贴的图片',
        imageUrl: res.url,
        imageWidth: 75
      };
      insertSubBlockAtCursor(newImgBlock, targetBlockId);
      setSyncNotice('🖼️ 图片已插入，记得点击保存笔记');
      setTimeout(() => setSyncNotice(null), 2200);
    } catch (err) {
      alert(`图片上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // 处理笔记文本框内的 Ctrl+V 粘贴事件（自动拦截剪贴板中的图片或内部复制/剪切的图片）
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

    // 检查是否粘贴了笔记内部复制/剪切的图片标记
    const pastedText = e.clipboardData?.getData('text/plain') || '';
    if (pastedText.startsWith('__NOTE_IMG__:')) {
      e.preventDefault();
      const imgUrl = pastedText.replace('__NOTE_IMG__:', '').trim();
      const newImgBlock: NoteSubBlock = {
        id: `blk_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'image',
        content: '',
        language: 'image',
        collapsed: false,
        title: internalImageClip?.title || '图片',
        imageUrl: imgUrl,
        imageWidth: internalImageClip?.width || 75
      };
      insertSubBlockAtCursor(newImgBlock, blockId);
    }
  };

  // 复制图片块（同时写入系统图片剪贴板与内部跨页剪贴板）
  const handleCopyImageBlock = async (block: NoteSubBlock) => {
    if (!block.imageUrl) return;
    setInternalImageClip({
      url: block.imageUrl,
      title: block.title || '图片',
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
      // 若浏览器在非 HTTPS 环境下限制二进制图片写入，回退写入内部图片标识，确保笔记内粘贴 100% 可用
      await navigator.clipboard.writeText(`__NOTE_IMG__:${block.imageUrl}`).catch(() => {});
    }

    setCopiedKey(`img_copy_${block.id}`);
    setSyncNotice('📋 图片已复制，可在任意位置按 Ctrl+V 粘贴');
    setTimeout(() => {
      setCopiedKey(null);
      setSyncNotice(null);
    }, 1800);
  };

  // 剪切图片块（复制图片并从当前位置移除）
  const handleCutImageBlock = async (block: NoteSubBlock) => {
    if (!canEditActiveNote || !block.imageUrl) return;
    await handleCopyImageBlock(block);
    handleRemoveSubBlock(block.id);
    setSelectedImageBlockId(null);
    setSyncNotice('✂️ 图片已剪切，可在目标位置按 Ctrl+V 粘贴');
    setTimeout(() => setSyncNotice(null), 2000);
  };

  // 删除子块（代码块或图片块），并自动合并相邻的文本块
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
    if (merged.length === 0) {
      merged.push({
        id: `blk_${Date.now()}`,
        type: 'text',
        content: '',
        language: 'python',
        collapsed: false,
        title: ''
      });
    }
    updateCurrentPage((p) => ({ ...p, blocks: merged }));
  };

  // 监听选中图片时的键盘快捷键（Ctrl+C 复制图片 / Ctrl+X 剪切图片 / Delete 删除图片）
  useEffect(() => {
    if (!selectedImageBlockId || !currentPage || currentPage.pageType !== 'note') return;
    const imgBlock = (currentPage.blocks || []).find(
      (b) => b.id === selectedImageBlockId && b.type === 'image'
    );
    if (!imgBlock) return;

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
      {/* 隐藏的图片上传选择器 */}
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

      {/* 移动端抽屉遮罩层 */}
      {mobileDrawerOpen && (
        <div
          onClick={() => setMobileDrawerOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-30"
        />
      )}

      {/* 左侧栏：支持桌面端折叠/展开 & 移动端抽屉滑出 */}
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
              <span>{isGuest ? '公开云端笔记 (访客模式)' : '云端跨端笔记'}</span>
            </h2>
            {!isGuest && (
              <button
                onClick={() => setIsAddingFolder(true)}
                className="p-1.5 bg-[#252830] hover:bg-[#323640] text-gray-300 rounded-lg transition-colors"
                title="新建笔记分类文件夹"
              >
                <FolderPlus size={14} />
              </button>
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

        {/* 笔记列表 */}
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
        {/* 顶部标题栏：左侧目录收起/展开开关 + 标题框 + 公开开关 + 刷新 + 保存 */}
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

            {/* 公开 / 私密状态切换按钮（允许访客查看公开笔记） */}
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

        {/* 页面标签栏（支持滚轮横向滑动与拖拽排序） */}
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

        {/* 次级控制工具栏（含图片插入、代码块插入、自动换行开关、翻页复制） */}
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
                    title="上传图片插入到当前光标处（也支持直接在编辑框按 Ctrl+V 粘贴截图）"
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

            {/* 右侧：自动换行开关 + 左右翻页 + 一键复制本页 + 复制并翻下一页 */}
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
          onClick={() => setSelectedImageBlockId(null)}
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
            <div className="max-w-5xl mx-auto space-y-3 pb-12">
              {(currentPage.blocks || []).map((block, bIdx) => {
                // 1. 文本子块（支持直接按 Ctrl+V 粘贴截图或已复制/剪切的图片）
                if (block.type === 'text') {
                  const textRows = Math.max(3, block.content.split('\n').length + 1);
                  return (
                    <textarea
                      key={block.id}
                      ref={(el) => {
                        textBlockRefs.current[block.id] = el;
                      }}
                      rows={textRows}
                      readOnly={!canEditActiveNote}
                      value={block.content}
                      onFocus={() => {
                        setFocusedBlockId(block.id);
                        setSelectedImageBlockId(null);
                      }}
                      onPaste={(e) => handleTextPaste(e, block.id)}
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
                        bIdx === 0
                          ? '在此输入笔记内容... 支持直接按 Ctrl+V 粘贴截图/图片，或点击上方【插入代码块窗口】嵌入可折叠代码窗。'
                          : '继续输入后续笔记内容（支持按 Ctrl+V 直接粘贴图片）...'
                      }
                      className="w-full bg-[#1b1e26] border border-gray-800/90 focus:border-indigo-500/60 rounded-xl p-4 text-xs text-gray-200 leading-relaxed focus:outline-none resize-y select-text"
                    />
                  );
                }

                // 2. 内嵌图片子块（支持点击选中后 Ctrl+C 复制 / Ctrl+X 剪切 / 宽度缩放）
                if (block.type === 'image') {
                  const isImgSelected = selectedImageBlockId === block.id;
                  const widthPct = block.imageWidth || 75;
                  return (
                    <div
                      key={block.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImageBlockId(block.id);
                      }}
                      className={`bg-[#151821] border rounded-xl p-3 transition-all ${
                        isImgSelected
                          ? 'border-blue-400 ring-2 ring-blue-500/30 shadow-lg'
                          : 'border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2 pb-2 border-b border-gray-800/80 text-xs">
                        <div className="flex items-center gap-2">
                          <ImageIcon size={14} className="text-emerald-400" />
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
                            placeholder="图片说明..."
                            className="bg-[#111318] border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 w-36"
                          />
                          {canEditActiveNote && (
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
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyImageBlock(block);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-[#252830] hover:bg-gray-700 text-gray-200 border border-gray-700"
                            title="复制图片 (快捷键: 选中图片按 Ctrl+C)"
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
                                title="剪切图片 (快捷键: 选中图片按 Ctrl+X)"
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

                      <div className="flex justify-center bg-[#0e1015] rounded-lg p-2 overflow-hidden">
                        <img
                          src={block.imageUrl}
                          alt={block.title || '笔记图片'}
                          style={{ width: `${widthPct}%` }}
                          className="max-w-full h-auto rounded object-contain select-all"
                        />
                      </div>
                    </div>
                  );
                }

                // 3. 可展开/收起的内嵌代码块窗口
                const codeLineCount = Math.max(1, block.content.split('\n').length);
                const firstLinePreview =
                  block.content.split('\n').find((l) => l.trim().length > 0) || '空代码块';

                return (
                  <div
                    key={block.id}
                    className="bg-[#13151b] border border-indigo-500/40 rounded-xl overflow-hidden shadow-lg"
                  >
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
