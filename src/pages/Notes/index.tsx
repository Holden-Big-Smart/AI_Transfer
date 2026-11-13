// src/pages/Notes/index.tsx
import { useState, useEffect, useRef } from 'react';
import {
  FolderPlus, Plus, Trash2, Save, Copy, Check, Code2, FileText,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Folder,
  Sparkles, RefreshCw, GripVertical
} from 'lucide-react';
import { useNoteStore, formatDefaultNoteTitle } from '../../store/useNoteStore';
import type { CodePage, NoteSubBlock } from '../../store/useNoteStore';

// ============================================================================
// 方案 A：零依赖语法颜色高亮编译器（单趟正则着色，避免 HTML 标签污染）
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
// 零依赖双层叠加语法高亮代码编辑器组件
// ============================================================================
interface HighlightEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  autoHeight?: boolean;
}

function SyntaxHighlightEditor({
  value,
  onChange,
  placeholder = '# 在此输入或粘贴代码...',
  minHeightClass = 'h-full',
  autoHeight = false
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

  // 支持 Tab 键插入 4 个空格
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
  const computedHeight = autoHeight ? `${Math.min(520, Math.max(130, lineCount * 24 + 32))}px` : undefined;

  return (
    <div
      style={computedHeight ? { height: computedHeight } : undefined}
      className={`relative w-full ${minHeightClass} bg-[#111318] border border-gray-800 rounded-xl overflow-hidden flex focus-within:border-blue-500/60 transition-colors`}
    >
      {/* 左侧行号栏 */}
      <div
        ref={gutterRef}
        className="w-11 py-4 bg-[#151820] border-r border-gray-800/80 text-right pr-2.5 font-mono text-xs leading-6 text-gray-600 select-none overflow-hidden shrink-0"
      >
        {Array.from({ length: lineCount }).map((_, idx) => (
          <div key={idx}>{idx + 1}</div>
        ))}
      </div>

      {/* 右侧双层高亮叠加编辑区 */}
      <div className="relative flex-1 h-full overflow-hidden">
        <pre
          ref={preRef}
          aria-hidden="true"
          className="absolute inset-0 m-0 p-4 font-mono text-xs leading-6 text-gray-200 whitespace-pre overflow-hidden pointer-events-none select-none"
          dangerouslySetInnerHTML={{
            __html: value
              ? highlightCodeToHtml(value)
              : `<span class="text-gray-600">${escapeHtml(placeholder)}</span>`
          }}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="absolute inset-0 w-full h-full m-0 p-4 font-mono text-xs leading-6 bg-transparent text-transparent caret-white whitespace-pre overflow-auto resize-none focus:outline-none select-text"
        />
      </div>
    </div>
  );
}

// ============================================================================
// 笔记主页面组件
// ============================================================================
export default function Notes() {
  const {
    folders, notes, selectedFolderId, activeNoteId,
    loadNotesData, checkRemoteVersion, setSelectedFolderId, setActiveNoteId,
    createFolder, deleteFolder, saveNote, deleteNote
  } = useNoteStore();

  const [title, setTitle] = useState('');
  const [codePages, setCodePages] = useState<CodePage[]>([]);
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // 标记本地是否有未保存改动（防远端轮询覆盖正在敲字的内容）
  const [isDirty, setIsDirty] = useState(false);
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 标签页拖拽排序状态
  const [dragTabIdx, setDragTabIdx] = useState<number | null>(null);
  const [dragOverTabIdx, setDragOverTabIdx] = useState<number | null>(null);

  // 笔记页内记录当前焦点所在的文本子块与光标位置（用于原地插入可折叠代码窗）
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const textBlockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // 新建文件夹状态
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // 复制与保存反馈状态
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 首次挂载拉取笔记
  useEffect(() => {
    loadNotesData();
  }, [loadNotesData]);

  // 过滤当前文件夹下的笔记
  const filteredNotes = selectedFolderId
    ? notes.filter((n) => n.folderId === selectedFolderId)
    : notes;

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  // 当切换左侧笔记或远端刷新时，加载笔记数据到工作区
  useEffect(() => {
    if (activeNote) {
      setTitle(activeNote.title);
      setCodePages(activeNote.codePages || []);
      setActiveTabIdx((prev) => (prev < (activeNote.codePages?.length || 1) ? prev : 0));
      setIsDirty(false);
    } else {
      setTitle('');
      setCodePages([]);
      setActiveTabIdx(0);
      setIsDirty(false);
    }
  }, [activeNote]);

  // 跨端动态同步机制：每 3 秒及窗口切回焦点时检测远端是否有新保存版本
  useEffect(() => {
    const checkAndSync = async () => {
      const changed = await checkRemoteVersion();
      if (changed) {
        if (!isDirty) {
          await loadNotesData(true);
          setHasRemoteUpdate(false);
          setSyncNotice('⚡ 已自动同步远端最新保存');
          setTimeout(() => setSyncNotice(null), 2500);
        } else {
          setHasRemoteUpdate(true);
        }
      }
    };

    const timer = setInterval(checkAndSync, 3000);
    const handleFocus = () => {
      checkAndSync();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isDirty, checkRemoteVersion, loadNotesData]);

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

  // 1. 左侧顶部：点击「新建笔记」或「新建代码」创建一篇新记录
  const handleCreateRecord = async (initialType: 'note' | 'code') => {
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
      codePages: [firstPage]
    });
    setActiveTabIdx(0);
  };

  // 2 & 3. 在同一篇记录中点击「新增笔记页」或「新增代码页」，排在最前面 (Index 0)
  const handleAddPageToFront = (pageType: 'note' | 'code') => {
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

    // 插入到数组最前面，并自动切换到第 0 页
    setCodePages((prev) => [newPage, ...prev]);
    setActiveTabIdx(0);
    setIsDirty(true);
  };

  // 删除某个标签页
  const handleRemovePage = (idx: number) => {
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

  // 4. 页面标签鼠标拖拽调整前后位置
  const handleTabDrop = (targetIdx: number) => {
    if (dragTabIdx === null || dragTabIdx === targetIdx) {
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
    const saved = await saveNote({
      id: activeNoteId,
      folderId: activeNote ? activeNote.folderId : selectedFolderId,
      title: title.trim() || formatDefaultNoteTitle(),
      codePages
    });
    if (saved) {
      setTitle(saved.title);
      setIsDirty(false);
      setHasRemoteUpdate(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1800);
    }
  };

  const currentPage = codePages[activeTabIdx] || codePages[0];

  // 更新当前页面的属性
  const updateCurrentPage = (updater: (page: CodePage) => CodePage) => {
    setCodePages((prev) => prev.map((p, idx) => (idx === activeTabIdx ? updater(p) : p)));
    setIsDirty(true);
  };

  // 5. 在笔记页当前光标处直接切分文本并嵌入一个「可折叠代码块窗口」
  const handleInsertCollapsibleCodeWindow = () => {
    if (!currentPage || currentPage.pageType !== 'note') return;

    const blocks = currentPage.blocks && currentPage.blocks.length > 0
      ? [...currentPage.blocks]
      : [{ id: `blk_${Date.now()}`, type: 'text' as const, content: '', language: 'python', collapsed: false, title: '' }];

    let targetIdx = blocks.findIndex((b) => b.id === focusedBlockId && b.type === 'text');
    if (targetIdx === -1) {
      // 若当前没有聚焦在某个文本框，默认找最后一个文本框
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].type === 'text') {
          targetIdx = i;
          break;
        }
      }
    }

    const newCodeBlock: NoteSubBlock = {
      id: `blk_code_${Date.now()}`,
      type: 'code',
      content: '',
      language: 'python',
      collapsed: false,
      title: `代码片段_${blocks.filter((b) => b.type === 'code').length + 1}.py`
    };

    if (targetIdx === -1) {
      const trailingText: NoteSubBlock = {
        id: `blk_txt_${Date.now()}_after`,
        type: 'text',
        content: '',
        language: 'python',
        collapsed: false,
        title: ''
      };
      updateCurrentPage((p) => ({ ...p, blocks: [...blocks, newCodeBlock, trailingText] }));
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

    blocks.splice(targetIdx, 1, beforeBlock, newCodeBlock, afterBlock);
    updateCurrentPage((p) => ({ ...p, blocks }));
  };

  // 在笔记页当前聚焦的文本框中插入排版标记
  const handleInsertTextFormat = (prefix: string, suffix: string = '') => {
    if (!currentPage || currentPage.pageType !== 'note') return;
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
        const nextContent = b.content.substring(0, start) + prefix + selected + suffix + b.content.substring(end);
        return { ...b, content: nextContent };
      })
    }));
  };

  // 删除笔记页内的某个内嵌代码块（并将上下相邻的文本块无缝合并）
  const handleRemoveInlineCodeBlock = (blockId: string) => {
    if (!currentPage || currentPage.pageType !== 'note') return;
    const raw = (currentPage.blocks || []).filter((b) => b.id !== blockId);
    const merged: NoteSubBlock[] = [];

    for (const blk of raw) {
      const prev = merged[merged.length - 1];
      if (prev && prev.type === 'text' && blk.type === 'text') {
        prev.content = prev.content && blk.content ? `${prev.content}\n${blk.content}` : `${prev.content}${blk.content}`;
      } else {
        merged.push({ ...blk });
      }
    }
    if (merged.length === 0) {
      merged.push({ id: `blk_${Date.now()}`, type: 'text', content: '', language: 'python', collapsed: false, title: '' });
    }
    updateCurrentPage((p) => ({ ...p, blocks: merged }));
  };

  // 提取任意一页的完整文本供“一键复制本页”使用
  const getPageCopyableText = (page: CodePage | undefined): string => {
    if (!page) return '';
    if (page.pageType === 'code') return page.code || '';
    return (page.blocks || [])
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
    <div className="h-full w-full bg-[#1e2128] text-gray-200 flex overflow-hidden select-none">
      {/* 左侧栏：笔记文件夹与双新建按钮 */}
      <div className="w-72 bg-[#191b22] border-r border-gray-800 flex flex-col h-full shrink-0">
        <div className="p-3.5 border-b border-gray-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-blue-400 flex items-center gap-2">
              <FileText size={16} />
              <span>云端跨端笔记</span>
            </h2>
            <button
              onClick={() => setIsAddingFolder(true)}
              className="p-1.5 bg-[#252830] hover:bg-[#323640] text-gray-300 rounded-lg transition-colors"
              title="新建笔记分类文件夹"
            >
              <FolderPlus size={14} />
            </button>
          </div>

          {/* 双新建入口（新建笔记 / 新建代码） */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleCreateRecord('note')}
              className="flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-1.5 px-2 rounded-lg transition-colors shadow"
              title="创建以笔记页开头的记录"
            >
              <Plus size={13} />
              <span>新建笔记</span>
            </button>
            <button
              onClick={() => handleCreateRecord('code')}
              className="flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 px-2 rounded-lg transition-colors shadow"
              title="创建以代码页开头的记录"
            >
              <Code2 size={13} />
              <span>新建代码</span>
            </button>
          </div>
        </div>

        {/* 新建文件夹输入栏 */}
        {isAddingFolder && (
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

        {/* 文件夹筛选区 */}
        <div className="p-2 border-b border-gray-800 max-h-36 overflow-y-auto space-y-1">
          <div
            onClick={() => setSelectedFolderId(null)}
            className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
              selectedFolderId === null ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-gray-400 hover:bg-[#252830]'
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
                selectedFolderId === folder.id ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-gray-400 hover:bg-[#252830]'
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

        {/* 笔记列表 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredNotes.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-12 px-3">
              暂无记录，点击上方【新建笔记】或【新建代码】开始创建
            </div>
          ) : (
            filteredNotes.map((item) => {
              const noteCount = (item.codePages || []).filter((p) => p.pageType === 'note').length;
              const codeCount = (item.codePages || []).filter((p) => p.pageType !== 'note').length;
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveNoteId(item.id)}
                  className={`group p-3 rounded-xl cursor-pointer border transition-all ${
                    activeNoteId === item.id
                      ? 'bg-[#262a34] border-blue-500/40 text-white shadow'
                      : 'bg-[#1e2128]/60 border-transparent text-gray-300 hover:bg-[#252830]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">{item.title}</span>
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

      {/* 右侧统一工作区（合并笔记与代码为单一多页签画布） */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#16181d]">
        {/* 顶部标题、动态刷新与保存控制栏 */}
        <header className="h-14 bg-[#252830] border-b border-gray-800 px-6 flex items-center justify-between shrink-0 gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
            }}
            placeholder={`留空保存将自动命名为: ${formatDefaultNoteTitle()}`}
            className="flex-1 bg-[#1a1c23] border border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-100 font-semibold focus:outline-none focus:border-blue-500"
          />

          <div className="flex items-center gap-2.5 shrink-0">
            {/* 自动同步状态气泡 */}
            {syncNotice && (
              <span className="text-[11px] bg-green-950/60 text-green-400 border border-green-700/50 px-2.5 py-1 rounded-lg animate-pulse">
                {syncNotice}
              </span>
            )}

            {/* 手动刷新 / 远端更新提示按钮 */}
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
              <span>{hasRemoteUpdate ? '远端已更新 (点击刷新)' : '刷新'}</span>
            </button>

            <button
              onClick={handleSaveCurrentNote}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
            >
              {saveSuccess ? <Check size={15} /> : <Save size={15} />}
              <span>{saveSuccess ? '已保存并同步' : '保存笔记'}</span>
            </button>
          </div>
        </header>

        {/* 页面标签栏（支持拖拽排序 + 新增笔记页/新增代码页排在最前面） */}
        <div className="px-6 py-2.5 bg-[#1d2027] border-b border-gray-800 flex items-center justify-between gap-3">
          {/* 左侧：可拖拽排序的页面 Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1">
            {codePages.map((page, idx) => {
              const isNotePage = page.pageType === 'note';
              const isActive = activeTabIdx === idx;
              const isDragOver = dragOverTabIdx === idx && dragTabIdx !== idx;

              return (
                <div
                  key={page.id}
                  draggable
                  onDragStart={() => setDragTabIdx(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverTabIdx !== idx) setDragOverTabIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverTabIdx === idx) setDragOverTabIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleTabDrop(idx);
                  }}
                  onDragEnd={() => {
                    setDragTabIdx(null);
                    setDragOverTabIdx(null);
                  }}
                  onClick={() => setActiveTabIdx(idx)}
                  title="可按住鼠标左右拖动调整页面位置"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-grab active:cursor-grabbing border transition-all shrink-0 ${
                    isDragOver
                      ? 'border-yellow-400 bg-yellow-500/20 scale-105'
                      : isActive
                      ? isNotePage
                        ? 'bg-indigo-600/25 border-indigo-500/60 text-indigo-300 font-semibold shadow'
                        : 'bg-blue-600/25 border-blue-500/60 text-blue-300 font-semibold shadow'
                      : 'bg-[#14161b] border-gray-800 text-gray-400 hover:bg-[#252830] hover:text-gray-200'
                  }`}
                >
                  <GripVertical size={12} className="text-gray-500 -ml-1" />
                  {isNotePage ? (
                    <FileText size={13} className="text-indigo-400 shrink-0" />
                  ) : (
                    <Code2 size={13} className="text-blue-400 shrink-0" />
                  )}
                  <span>
                    第 {idx + 1} 页: {page.title}
                  </span>
                  {codePages.length > 1 && (
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

          {/* 右侧：新增笔记页 / 新增代码页按钮（新页排在最前面 Index 0） */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleAddPageToFront('note')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 transition-colors"
              title="在最前面新增一页图文笔记页"
            >
              <Plus size={13} />
              <span>新增笔记页</span>
            </button>
            <button
              onClick={() => handleAddPageToFront('code')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 transition-colors"
              title="在最前面新增一页纯代码页"
            >
              <Plus size={13} />
              <span>新增代码页</span>
            </button>
          </div>
        </div>

        {/* 当前页次级控制工具条（页标识修改 + 笔记页插入折叠代码窗 + 跨设备翻页复制） */}
        {currentPage && (
          <div className="px-6 py-2.5 bg-[#191c23] border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
            {/* 左侧：当前页标识 + 笔记页专属排版工具 */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                  {currentPage.pageType === 'note' ? '📝 笔记页' : '💻 代码页'}
                </span>
                <span className="text-[11px] text-gray-400">当前页标识:</span>
                <input
                  type="text"
                  value={currentPage.title}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateCurrentPage((p) => ({ ...p, title: val }));
                  }}
                  className="bg-[#111318] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-blue-300 font-mono focus:outline-none focus:border-blue-500 w-44"
                />
                <span className="text-xs text-gray-500">
                  (页码: {activeTabIdx + 1} / {codePages.length})
                </span>
              </div>

              {/* 当处于「笔记页」时，展示富文本快捷排版与「插入可折叠代码块窗口」按钮 */}
              {currentPage.pageType === 'note' && (
                <div className="flex items-center gap-1.5 pl-3 border-l border-gray-800">
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
                    onClick={() => handleInsertTextFormat('- ')}
                    className="px-2 py-1 text-xs bg-[#252830] hover:bg-gray-700 rounded text-gray-200"
                    title="插入列表项"
                  >
                    • 列表
                  </button>
                  <button
                    onClick={handleInsertCollapsibleCodeWindow}
                    className="flex items-center gap-1 px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow ml-1"
                    title="在当前光标位置直接插入一个可展开/收起的代码编辑窗口"
                  >
                    <Code2 size={13} />
                    <span>插入代码块窗口</span>
                  </button>
                </div>
              )}
            </div>

            {/* 右侧：左右翻页 + 一键复制本页 + 复制并翻下一页 */}
            <div className="flex items-center gap-2">
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
                className="flex items-center gap-1.5 bg-[#252830] hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                {copiedKey === `tab_${activeTabIdx}` ? (
                  <Check size={14} className="text-green-400" />
                ) : (
                  <Copy size={14} />
                )}
                <span>{copiedKey === `tab_${activeTabIdx}` ? '本页已复制!' : '一键复制本页'}</span>
              </button>

              {codePages.length > 1 && (
                <button
                  onClick={handleCopyAndNextPage}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shadow"
                  title="复制当前页内容后自动跳转到下一页"
                >
                  <Sparkles size={14} />
                  <span>
                    {copiedKey === `page_next_${activeTabIdx}` ? '已复制并翻页!' : '复制并翻下一页'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 主体统一编辑画布（根据当前激活页是“笔记页”还是“代码页”动态渲染） */}
        <div className="flex-1 p-6 overflow-y-auto">
          {!currentPage ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-xs">
              请从左侧选择或新建一篇笔记
            </div>
          ) : currentPage.pageType === 'code' ? (
            /* 模式 A：纯代码页（全屏带行号与语法颜色高亮） */
            <SyntaxHighlightEditor
              value={currentPage.code}
              onChange={(val) => updateCurrentPage((p) => ({ ...p, code: val }))}
              placeholder="# 在此输入或粘贴代码（已开启语法颜色标注，支持 Tab 键缩进）..."
              minHeightClass="h-full"
            />
          ) : (
            /* 模式 B：笔记页（流式图文 + 光标处可展开/收起的内嵌代码窗口） */
            <div className="max-w-5xl mx-auto space-y-3 pb-12">
              {(currentPage.blocks || []).map((block, bIdx) => {
                if (block.type === 'text') {
                  const textRows = Math.max(3, block.content.split('\n').length + 1);
                  return (
                    <textarea
                      key={block.id}
                      ref={(el) => {
                        textBlockRefs.current[block.id] = el;
                      }}
                      rows={textRows}
                      value={block.content}
                      onFocus={() => setFocusedBlockId(block.id)}
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
                          ? '在此输入笔记内容... 需要贴代码时，直接点击上方【插入代码块窗口】，即可在当前光标处创建可折叠的高亮代码窗。'
                          : '继续输入后续笔记内容...'
                      }
                      className="w-full bg-[#1b1e26] border border-gray-800/90 focus:border-indigo-500/60 rounded-xl p-4 text-xs text-gray-200 leading-relaxed focus:outline-none resize-y select-text"
                    />
                  );
                }

                // 可展开/收起的内嵌代码块窗口
                const codeLineCount = Math.max(1, block.content.split('\n').length);
                const firstLinePreview =
                  block.content.split('\n').find((l) => l.trim().length > 0) || '空代码块';

                return (
                  <div
                    key={block.id}
                    className="bg-[#13151b] border border-indigo-500/40 rounded-xl overflow-hidden shadow-lg"
                  >
                    {/* 代码块窗口顶部标题控制栏（支持展开/收起、命名、语言选择、复制、删除） */}
                    <div className="px-3.5 py-2 bg-[#1c2029] border-b border-gray-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          onClick={() =>
                            updateCurrentPage((p) => ({
                              ...p,
                              blocks: (p.blocks || []).map((b) =>
                                b.id === block.id ? { ...b, collapsed: !b.collapsed } : b
                              )
                            }))
                          }
                          className="flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-600/20 px-2 py-1 rounded-md transition-colors shrink-0"
                          title={block.collapsed ? '点击展开代码块' : '点击收起代码块'}
                        >
                          {block.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          <span>{block.collapsed ? '展开' : '收起'}</span>
                        </button>

                        <input
                          type="text"
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
                          className="bg-[#111318] border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 w-40 shrink-0"
                        />

                        <select
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

                        <button
                          onClick={() => handleRemoveInlineCodeBlock(block.id)}
                          className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                          title="删除此代码块窗口"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* 展开状态下渲染语法高亮代码编辑器 */}
                    {!block.collapsed && (
                      <div className="p-2 bg-[#111318]">
                        <SyntaxHighlightEditor
                          value={block.content}
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
