// src/pages/Notes/index.tsx
import { useState, useEffect, useRef } from 'react';
import {
  FolderPlus, Plus, Trash2, Save, Copy, Check, Code2, FileText,
  ChevronLeft, ChevronRight, Folder, Eye, Edit3, Sparkles
} from 'lucide-react';
import { useNoteStore, formatDefaultNoteTitle } from '../../store/useNoteStore';
import type { CodePage } from '../../store/useNoteStore';

export default function Notes() {
  const {
    folders, notes, selectedFolderId, activeNoteId,
    loadNotesData, setSelectedFolderId, setActiveNoteId,
    createFolder, deleteFolder, saveNote, deleteNote
  } = useNoteStore();

  // 当前编辑状态
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [codePages, setCodePages] = useState<CodePage[]>([]);
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // 新建文件夹输入状态
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // 复制与保存反馈状态
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadNotesData();
  }, [loadNotesData]);

  // 过滤当前文件夹下的笔记
  const filteredNotes = selectedFolderId
    ? notes.filter((n) => n.folderId === selectedFolderId)
    : notes;

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  // 当切换选中的笔记时，同步加载到编辑器
  useEffect(() => {
    if (activeNote) {
      setTitle(activeNote.title);
      setContent(activeNote.content);
      setCodePages(
        activeNote.codePages && activeNote.codePages.length > 0
          ? activeNote.codePages
          : [{ id: 'cp_init', title: '片段_1.py', language: 'python', code: '' }]
      );
      setActiveTabIdx(0);
    } else {
      setTitle('');
      setContent('');
      setCodePages([{ id: 'cp_init', title: '片段_1.py', language: 'python', code: '' }]);
      setActiveTabIdx(0);
    }
  }, [activeNoteId, activeNote]);

  // 新建空白笔记（不填标题时直接生成带中文年月日时分秒的默认标题）
  const handleCreateNewNote = async () => {
    const autoTitle = formatDefaultNoteTitle();
    const defaultPages: CodePage[] = [
      { id: `cp_${Date.now()}`, title: '片段_1.py', language: 'python', code: '' }
    ];
    await saveNote({
      id: null,
      folderId: selectedFolderId,
      title: autoTitle,
      content: '',
      codePages: defaultPages
    });
  };

  // 保存当前笔记
  const handleSaveCurrentNote = async () => {
    const saved = await saveNote({
      id: activeNoteId,
      folderId: activeNote ? activeNote.folderId : selectedFolderId,
      title: title.trim() || formatDefaultNoteTitle(),
      content,
      codePages
    });
    if (saved) {
      setTitle(saved.title);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1800);
    }
  };

  // 在正文光标处直接插入代码块（无需手敲 ```python）
  const handleInsertCodeBlockToContent = () => {
    const textarea = contentTextareaRef.current;
    const template = '\n```python\n# 在此粘贴或输入代码\n\n```\n';
    if (!textarea) {
      setContent((prev) => prev + template);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextVal = content.substring(0, start) + template + content.substring(end);
    setContent(nextVal);
    setIsPreviewMode(false);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 11, start + 22);
    }, 50);
  };

  // 在正文中插入常用排版格式
  const handleInsertFormat = (prefix: string, suffix: string = '') => {
    const textarea = contentTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end) || '文本';
    const nextVal = content.substring(0, start) + prefix + selected + suffix + content.substring(end);
    setContent(nextVal);
    setTimeout(() => textarea.focus(), 30);
  };

  // 新增一个代码翻页标签页 (Code Tab)
  const handleAddCodePage = () => {
    const nextIndex = codePages.length + 1;
    const newPage: CodePage = {
      id: `cp_${Date.now()}`,
      title: `片段_${nextIndex}.py`,
      language: 'python',
      code: ''
    };
    const updated = [...codePages, newPage];
    setCodePages(updated);
    setActiveTabIdx(updated.length - 1);
  };

  // 删除当前代码标签页
  const handleRemoveCodePage = (idx: number) => {
    if (codePages.length <= 1) {
      setCodePages([{ ...codePages[0], code: '' }]);
      return;
    }
    const updated = codePages.filter((_, i) => i !== idx);
    setCodePages(updated);
    setActiveTabIdx(Math.max(0, idx - 1));
  };

  // 复制工具函数
  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // 一键复制当前页代码并自动翻到下一页
  const handleCopyAndNextPage = () => {
    const currentPage = codePages[activeTabIdx];
    if (!currentPage) return;
    copyText(currentPage.code, `page_next_${activeTabIdx}`);
    if (activeTabIdx < codePages.length - 1) {
      setActiveTabIdx(activeTabIdx + 1);
    }
  };

  // 渲染正文预览（自动识别代码块并提供一键复制）
  const renderFormattedContent = (raw: string) => {
    if (!raw.trim()) {
      return <div className="text-gray-500 text-xs italic">暂无正文内容，可切回编辑模式输入...</div>;
    }
    const parts = raw.split(/```(\w*)\n([\s\S]*?)```/g);
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < parts.length; i += 3) {
      const normalText = parts[i];
      const lang = parts[i + 1];
      const codeContent = parts[i + 2];

      if (normalText) {
        elements.push(
          <div key={`txt_${i}`} className="whitespace-pre-wrap text-xs text-gray-200 leading-relaxed mb-3">
            {normalText}
          </div>
        );
      }

      if (codeContent !== undefined) {
        const blockKey = `inline_code_${i}`;
        elements.push(
          <div key={blockKey} className="my-3 bg-[#14161b] border border-gray-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1d24] border-b border-gray-800 text-[11px] text-gray-400">
              <span className="font-mono text-blue-400">{lang || 'code'}</span>
              <button
                onClick={() => copyText(codeContent.trim(), blockKey)}
                className="flex items-center gap-1 text-gray-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 px-2 py-0.5 rounded transition-colors"
              >
                {copiedKey === blockKey ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                <span>{copiedKey === blockKey ? '已复制' : '一键复制'}</span>
              </button>
            </div>
            <pre className="p-3 text-xs font-mono text-green-300 overflow-x-auto leading-relaxed">
              <code>{codeContent}</code>
            </pre>
          </div>
        );
      }
    }
    return elements;
  };

  const currentCodePage = codePages[activeTabIdx] || codePages[0];

  return (
    <div className="h-full w-full bg-[#1e2128] text-gray-200 flex overflow-hidden select-none">
      {/* 左侧栏：笔记文件夹与笔记列表 */}
      <div className="w-72 bg-[#191b22] border-r border-gray-800 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-blue-400 flex items-center gap-2">
            <FileText size={16} />
            <span>云端跨端笔记</span>
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsAddingFolder(true)}
              className="p-1.5 bg-[#252830] hover:bg-[#323640] text-gray-300 rounded-lg transition-colors"
              title="新建笔记文件夹"
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={handleCreateNewNote}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors shadow"
              title="新建笔记（默认按当前日期时间命名）"
            >
              <Plus size={14} />
              <span>新建笔记</span>
            </button>
          </div>
        </div>

        {/* 新建笔记文件夹输入框 */}
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

        {/* 文件夹分类导航 */}
        <div className="p-2 border-b border-gray-800 max-h-40 overflow-y-auto space-y-1">
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
            <div className="text-center text-gray-500 text-xs py-12">
              当前分类下暂无笔记，点击上方“新建笔记”开始记录
            </div>
          ) : (
            filteredNotes.map((item) => (
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
                      if (confirm(`确认删除笔记【${item.title}】？`)) {
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
                  <span className="text-blue-400/80">{item.codePages?.length || 0} 页代码</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧主工作区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* 顶部标题与保存控制栏 */}
        <header className="h-14 bg-[#252830] border-b border-gray-800 px-6 flex items-center justify-between shrink-0 gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`留空保存将自动命名为: ${formatDefaultNoteTitle()}`}
            className="flex-1 bg-[#1a1c23] border border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-100 font-semibold focus:outline-none focus:border-blue-500"
          />

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleSaveCurrentNote}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
            >
              {saveSuccess ? <Check size={15} /> : <Save size={15} />}
              <span>{saveSuccess ? '已同步至云端' : '保存笔记'}</span>
            </button>
          </div>
        </header>

        {/* 主体分栏编辑区 */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* 左半区：富文本 / 快捷代码块正文编辑器 */}
          <div className="lg:col-span-5 border-r border-gray-800 flex flex-col h-full overflow-hidden bg-[#1e2128]">
            <div className="px-4 py-2.5 bg-[#22252e] border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleInsertFormat('**', '**')}
                  className="px-2 py-1 text-xs bg-[#191b22] hover:bg-gray-700 rounded text-gray-300 font-bold"
                  title="加粗"
                >
                  B
                </button>
                <button
                  onClick={() => handleInsertFormat('### ')}
                  className="px-2 py-1 text-xs bg-[#191b22] hover:bg-gray-700 rounded text-gray-300"
                  title="插入小标题"
                >
                  H3
                </button>
                <button
                  onClick={() => handleInsertFormat('- ')}
                  className="px-2 py-1 text-xs bg-[#191b22] hover:bg-gray-700 rounded text-gray-300"
                  title="插入列表"
                >
                  • 列表
                </button>
                <button
                  onClick={handleInsertCodeBlockToContent}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg transition-colors ml-1"
                  title="直接在正文中插入代码块，无需手敲反引号"
                >
                  <Code2 size={13} />
                  <span>插入代码块</span>
                </button>
              </div>

              <button
                onClick={() => setIsPreviewMode(!isPreviewMode)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  isPreviewMode
                    ? 'bg-green-600/20 text-green-400 border-green-500/40'
                    : 'bg-[#191b22] text-gray-400 border-gray-700 hover:text-gray-200'
                }`}
              >
                {isPreviewMode ? <Edit3 size={12} /> : <Eye size={12} />}
                <span>{isPreviewMode ? '返回编辑' : '阅读/复制模式'}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isPreviewMode ? (
                <div className="space-y-2">{renderFormattedContent(content)}</div>
              ) : (
                <textarea
                  ref={contentTextareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="在此记录日常笔记、接口说明或会议纪要... 点击上方【插入代码块】可直接嵌入代码段。"
                  className="w-full h-full bg-transparent text-xs text-gray-200 leading-relaxed focus:outline-none resize-none select-text"
                />
              )}
            </div>
          </div>

          {/* 右半区：多页签代码片段管理器 */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-hidden bg-[#16181d]">
            {/* 代码标签页导航栏 (Tabs) */}
            <div className="px-4 py-2 bg-[#1f2229] border-b border-gray-800 flex items-center justify-between gap-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                {codePages.map((page, idx) => (
                  <div
                    key={page.id}
                    onClick={() => setActiveTabIdx(idx)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer border transition-all shrink-0 ${
                      activeTabIdx === idx
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 font-semibold'
                        : 'bg-[#16181d] border-gray-800 text-gray-400 hover:bg-[#252830]'
                    }`}
                  >
                    <Code2 size={13} />
                    <span>第 {idx + 1} 页: {page.title}</span>
                    {codePages.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCodePage(idx);
                        }}
                        className="text-gray-500 hover:text-red-400 ml-1"
                        title="移除此页代码"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <button
                  onClick={handleAddCodePage}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-[#252830] hover:bg-blue-600/20 text-blue-400 border border-dashed border-blue-500/40 shrink-0 transition-colors"
                  title="插入新的代码翻页标签"
                >
                  <Plus size={13} />
                  <span>新增代码页</span>
                </button>
              </div>
            </div>

            {/* 当前代码页控制工具条 */}
            {currentCodePage && (
              <div className="px-4 py-2.5 bg-[#1a1d24] border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">当前页标识:</span>
                  <input
                    type="text"
                    value={currentCodePage.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCodePages((prev) =>
                        prev.map((p, i) => (i === activeTabIdx ? { ...p, title: val } : p))
                      );
                    }}
                    className="bg-[#121418] border border-gray-700 rounded px-2.5 py-1 text-xs text-blue-300 font-mono focus:outline-none focus:border-blue-500 w-44"
                  />
                  <span className="text-xs text-gray-500">
                    (页码: {activeTabIdx + 1} / {codePages.length})
                  </span>
                </div>

                {/* 翻页与一键复制按钮组 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTabIdx((prev) => Math.max(0, prev - 1))}
                    disabled={activeTabIdx === 0}
                    className="p-1.5 rounded-lg bg-[#252830] hover:bg-gray-700 disabled:opacity-40 text-gray-300"
                    title="上一页代码"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    onClick={() => setActiveTabIdx((prev) => Math.min(codePages.length - 1, prev + 1))}
                    disabled={activeTabIdx >= codePages.length - 1}
                    className="p-1.5 rounded-lg bg-[#252830] hover:bg-gray-700 disabled:opacity-40 text-gray-300"
                    title="下一页代码"
                  >
                    <ChevronRight size={15} />
                  </button>

                  <button
                    onClick={() => copyText(currentCodePage.code, `tab_${activeTabIdx}`)}
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
                      title="复制当前页代码后，自动跳转到下一页"
                    >
                      <Sparkles size={14} />
                      <span>
                        {copiedKey === `page_next_${activeTabIdx}`
                          ? '已复制并翻页!'
                          : '复制并翻下一页'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 代码编辑主视窗 */}
            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              <textarea
                value={currentCodePage?.code || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setCodePages((prev) =>
                    prev.map((p, i) => (i === activeTabIdx ? { ...p, code: val } : p))
                  );
                }}
                placeholder={'# 在此粘贴你的 Python / TypeScript / SQL 等代码片段...\n# 如有多份代码文件需要跨设备传输，可点击上方【+ 新增代码页】分页存放，另一台设备打开即可逐页一键复制。'}
                spellCheck={false}
                className="w-full h-full bg-[#111318] border border-gray-800 rounded-xl p-4 font-mono text-xs text-green-300 leading-relaxed focus:outline-none focus:border-blue-500/60 resize-none select-text"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
