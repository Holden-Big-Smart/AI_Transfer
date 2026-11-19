// src/components/notes/RichNoteExtensions.tsx
import { useState, useEffect, useRef } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { TaskItem } from '@tiptap/extension-list';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent
} from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  ListPlus,
  Scissors,
  Trash2,
  WrapText
} from 'lucide-react';
import { SyntaxHighlightEditor } from './SyntaxHighlightEditor';

// ============================================================================
// 1. 4 级重要度多级待办事项节点 (PriorityTaskItem)
//    - 4 级重要度：紧急 (high) / 重要 (medium) / 普通 (normal) / 低 (low)
//    - 父子状态独立：勾选父项仅划掉父项文本，不强制联动子项
//    - 父项自动显示子待办完成进度（例如 1/3）
//    - 支持行内 "+ 子待办" 按钮与键盘 Tab / Shift+Tab 升降级
// ============================================================================
export type TodoPriority = 'high' | 'medium' | 'normal' | 'low';

export const TODO_PRIORITY_LIST: Array<{
  key: TodoPriority;
  label: string;
  dotColor: string;
}> = [
  { key: 'high', label: '紧急', dotColor: '#ef4444' },
  { key: 'medium', label: '重要', dotColor: '#f59e0b' },
  { key: 'normal', label: '普通', dotColor: '#3b82f6' },
  { key: 'low', label: '低', dotColor: '#9ca3af' }
];

const PRIORITY_LABEL_MAP: Record<TodoPriority, string> = {
  high: '紧急',
  medium: '重要',
  normal: '普通',
  low: '低'
};

function PriorityTaskItemView({
  node,
  updateAttributes,
  editor,
  getPos
}: NodeViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const checked = Boolean(node.attrs.checked);
  const priority: TodoPriority =
    (['high', 'medium', 'normal', 'low'].includes(node.attrs.priority)
      ? node.attrs.priority
      : 'normal') as TodoPriority;

  // 统计当前待办下所有嵌套子待办的完成进度 (completed / total)
  let subTotal = 0;
  let subCompleted = 0;
  node.forEach((child) => {
    if (child.type.name === 'taskList') {
      child.descendants((desc) => {
        if (desc.type.name === 'taskItem') {
          subTotal += 1;
          if (desc.attrs.checked) subCompleted += 1;
        }
      });
    }
  });

  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [menuOpen]);

  const handleToggleChecked = () => {
    if (!editor.isEditable) return;
    updateAttributes({ checked: !checked });
  };

  const handleSelectPriority = (nextPrio: TodoPriority) => {
    if (!editor.isEditable) return;
    updateAttributes({ priority: nextPrio });
    setMenuOpen(false);
  };

  // 在当前待办项内部插入一条子待办并自动聚焦
  const handleAddSubTask = () => {
    if (!editor.isEditable) return;
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;

    const hasSubList = node.lastChild?.type.name === 'taskList';
    const insertPos = hasSubList ? pos + node.nodeSize - 2 : pos + node.nodeSize - 1;
    const focusPos = hasSubList ? insertPos + 2 : insertPos + 3;

    const subTaskNode = {
      type: 'taskItem',
      attrs: { checked: false, priority: 'normal' },
      content: [{ type: 'paragraph' }]
    };

    const contentToInsert = hasSubList
      ? subTaskNode
      : { type: 'taskList', content: [subTaskNode] };

    editor
      .chain()
      .insertContentAt(insertPos, contentToInsert)
      .setTextSelection(focusPos)
      .focus()
      .run();
  };

  const allSubDone = subTotal > 0 && subCompleted === subTotal;

  return (
    <NodeViewWrapper
      as="li"
      data-type="taskItem"
      data-checked={String(checked)}
      data-priority={priority}
      className="priority-task-item group/task my-1"
    >
      <div className="task-item-row flex items-start gap-2 w-full">
        {/* 左侧：方框勾选 + 4级重要度徽章 */}
        <div
          contentEditable={false}
          className="flex items-center gap-1.5 pt-[3px] shrink-0 select-none relative"
        >
          <button
            type="button"
            disabled={!editor.isEditable}
            onClick={handleToggleChecked}
            className={`todo-checkbox todo-check-${priority} ${checked ? 'is-checked' : ''} ${
              !editor.isEditable ? 'cursor-default' : 'cursor-pointer'
            }`}
            title={checked ? '取消完成' : '标记为已完成（仅划掉本行）'}
          >
            {checked && <Check size={11} strokeWidth={3} />}
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              disabled={!editor.isEditable}
              onClick={() => editor.isEditable && setMenuOpen((prev) => !prev)}
              className={`todo-prio-badge todo-prio-${priority} ${
                !editor.isEditable ? 'cursor-default' : 'cursor-pointer hover:brightness-110'
              }`}
              title="点击切换待办重要等级（紧急 / 重要 / 普通 / 低）"
            >
              {PRIORITY_LABEL_MAP[priority]}
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full mt-1 w-24 bg-[#252830] border border-gray-700 rounded-xl shadow-2xl p-1 z-50">
                {TODO_PRIORITY_LIST.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectPriority(item.key)}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-[11px] hover:bg-[#323640] text-gray-200 ${
                      priority === item.key ? 'bg-blue-600/20 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.dotColor }}
                      />
                      <span>{item.label}</span>
                    </span>
                    {priority === item.key && <Check size={11} className="text-blue-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 中间：待办正文与嵌套子待办列表 */}
        <div className="task-item-body flex-1 min-w-0">
          <NodeViewContent className="task-item-content" />
        </div>

        {/* 右侧：子任务进度计数 (例如 1/3) + 添加子待办按钮 */}
        <div
          contentEditable={false}
          className="flex items-center gap-1.5 pt-[2px] shrink-0 select-none"
        >
          {subTotal > 0 && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                allSubDone
                  ? 'bg-green-950/50 text-green-400 border-green-700/50'
                  : 'bg-[#1a1c23] text-gray-400 border-gray-700/80'
              }`}
              title={`子待办完成进度：已完成 ${subCompleted} 项，共 ${subTotal} 项`}
            >
              {subCompleted}/{subTotal}
            </span>
          )}

          {editor.isEditable && (
            <button
              type="button"
              onClick={handleAddSubTask}
              className="opacity-100 md:opacity-0 md:group-hover/task:opacity-100 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[#252830] hover:bg-blue-600/25 text-gray-400 hover:text-blue-300 border border-gray-700/80 transition-all"
              title="在此待办下方添加子待办事项（也可在子行按 Tab 缩进）"
            >
              <ListPlus size={11} />
              <span>子待办</span>
            </button>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const PriorityTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      priority: {
        default: 'normal',
        keepOnSplit: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-priority') || 'normal',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-priority': (attributes.priority as string) || 'normal'
        })
      }
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(PriorityTaskItemView);
  }
});

// ============================================================================
// 2. 可折叠三主题语法高亮代码窗口节点 (CollapsibleCodeBlock)
// ============================================================================
function CollapsibleCodeBlockView({
  node,
  updateAttributes,
  deleteNode,
  editor
}: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState<boolean>(
    () => localStorage.getItem('notes_code_word_wrap') === 'true'
  );

  useEffect(() => {
    const syncWrap = () => {
      setWordWrap(localStorage.getItem('notes_code_word_wrap') === 'true');
    };
    window.addEventListener('notes_word_wrap_change', syncWrap);
    return () => window.removeEventListener('notes_word_wrap_change', syncWrap);
  }, []);

  const code = String(node.attrs.code || '');
  const language = String(node.attrs.language || 'python');
  const title = String(node.attrs.title || '代码片段.py');
  const collapsed = Boolean(node.attrs.collapsed);

  const lineCount = Math.max(1, code.split('\n').length);
  const firstLinePreview =
    code.split('\n').find((l) => l.trim().length > 0) || '空代码块';

  const handleToggleWrap = () => {
    const next = !wordWrap;
    localStorage.setItem('notes_code_word_wrap', String(next));
    setWordWrap(next);
    window.dispatchEvent(new CustomEvent('notes_word_wrap_change'));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <NodeViewWrapper
      className="my-2.5 select-none"
      data-type="collapsible-code-block"
    >
      <div
        contentEditable={false}
        className="bg-[#13151b] border border-indigo-500/40 rounded-xl overflow-hidden shadow-md"
      >
        <div className="px-3.5 py-2 bg-[#1c2029] border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => updateAttributes({ collapsed: !collapsed })}
              className="flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-600/20 px-2 py-1 rounded-md transition-colors shrink-0"
            >
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              <span>{collapsed ? '展开' : '收起'}</span>
            </button>

            <input
              type="text"
              readOnly={!editor.isEditable}
              value={title}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="代码块说明..."
              className="bg-[#111318] border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 w-36 shrink-0"
            />

            <select
              disabled={!editor.isEditable}
              value={language}
              onChange={(e) => updateAttributes({ language: e.target.value })}
              className="bg-[#111318] border border-gray-700 rounded px-2 py-0.5 text-[11px] text-blue-300 focus:outline-none shrink-0"
            >
              <option value="python">Python</option>
              <option value="typescript">TypeScript / JS</option>
              <option value="sql">SQL</option>
              <option value="bash">Bash / Shell</option>
              <option value="json">JSON</option>
            </select>

            {collapsed && (
              <span className="text-[11px] text-gray-500 font-mono truncate ml-2">
                ({lineCount} 行) {firstLinePreview}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleWrap}
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
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs bg-[#252830] hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded-md border border-gray-700 transition-colors"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              <span>{copied ? '已复制' : '复制代码'}</span>
            </button>

            {editor.isEditable && (
              <button
                type="button"
                onClick={deleteNode}
                className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                title="删除此代码块窗口"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="p-2 bg-[#111318]">
            <SyntaxHighlightEditor
              value={code}
              readOnly={!editor.isEditable}
              wordWrap={wordWrap}
              onChange={(val) => updateAttributes({ code: val })}
              placeholder="# 在此输入代码块内容..."
              autoHeight
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const CollapsibleCodeBlock = Node.create({
  name: 'collapsibleCodeBlock',
  group: 'block',
  atom: true,
  isolating: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-code') ?? el.textContent ?? '',
        renderHTML: (attrs) => ({ 'data-code': attrs.code || '' })
      },
      language: {
        default: 'python',
        parseHTML: (el) => el.getAttribute('data-language') || 'python',
        renderHTML: (attrs) => ({ 'data-language': attrs.language || 'python' })
      },
      title: {
        default: '代码片段.py',
        parseHTML: (el) => el.getAttribute('data-title') || '代码片段.py',
        renderHTML: (attrs) => ({ 'data-title': attrs.title || '代码片段.py' })
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs) => ({ 'data-collapsed': String(Boolean(attrs.collapsed)) })
      }
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="collapsible-code-block"]' },
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (el) => {
          const preEl = el as HTMLElement;
          const codeEl = preEl.querySelector('code');
          const cls = codeEl?.className || '';
          const langMatch = cls.match(/language-(\w+)/);
          return {
            code: codeEl?.textContent ?? preEl.textContent ?? '',
            language: langMatch ? langMatch[1] : 'python',
            title: '代码片段',
            collapsed: false
          };
        }
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'collapsible-code-block' })
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleCodeBlockView);
  }
});

// ============================================================================
// 3. 可折叠内嵌图片块节点 (CollapsibleImageBlock)
//    - 保留收起为长条模式、缩放 (25/50/75/100%)、复制图片、剪切图片、删除
// ============================================================================
function CollapsibleImageBlockView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor
}: NodeViewProps) {
  const [copied, setCopied] = useState(false);

  const src = String(node.attrs.src || '');
  const title = String(node.attrs.title || 'image.png');
  const width = Number(node.attrs.width) || 75;
  const collapsed = Boolean(node.attrs.collapsed);

  const handleCopyImage = async () => {
    if (!src) return;
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      if (window.ClipboardItem && navigator.clipboard?.write) {
        const pngBlob =
          blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      } else {
        await navigator.clipboard.writeText(`__NOTE_IMG__:${src}`);
      }
    } catch {
      await navigator.clipboard.writeText(`__NOTE_IMG__:${src}`).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleCutImage = async () => {
    if (!editor.isEditable) return;
    await handleCopyImage();
    deleteNode();
  };

  return (
    <NodeViewWrapper
      className="my-2 select-none"
      data-type="collapsible-image-block"
    >
      <div
        contentEditable={false}
        className={`bg-[#14171f] border rounded-xl overflow-hidden transition-all ${
          selected
            ? 'border-blue-400 ring-2 ring-blue-500/30 shadow-lg'
            : 'border-gray-800/90 hover:border-gray-700'
        }`}
      >
        <div className="px-3 py-1.5 bg-[#1b1f2a] flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => updateAttributes({ collapsed: !collapsed })}
              className="flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-600/20 px-2 py-0.5 rounded-md transition-colors shrink-0"
              title={collapsed ? '展开图片' : '收起图片为长条'}
            >
              {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              <span>{collapsed ? '展开' : '收起'}</span>
            </button>

            <ImageIcon size={13} className="text-emerald-400 shrink-0" />

            <input
              type="text"
              readOnly={!editor.isEditable}
              value={title}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="图片名称..."
              className="bg-[#111318] border border-gray-700/80 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 w-36 truncate"
            />

            {collapsed ? (
              <span className="text-[11px] text-gray-500 truncate">
                (已收起图片 · 可直接复制/剪切)
              </span>
            ) : (
              editor.isEditable && (
                <div className="flex items-center gap-1 ml-1">
                  {[25, 50, 75, 100].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => updateAttributes({ width: w })}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        width === w
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

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyImage}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#252830] hover:bg-gray-700 text-gray-200 border border-gray-700"
              title="复制图片"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              <span>{copied ? '已复制' : '复制图片'}</span>
            </button>

            {editor.isEditable && (
              <>
                <button
                  type="button"
                  onClick={handleCutImage}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#252830] hover:bg-gray-700 text-yellow-300 border border-gray-700"
                  title="剪切图片"
                >
                  <Scissors size={12} />
                  <span>剪切</span>
                </button>

                <button
                  type="button"
                  onClick={deleteNode}
                  className="p-1 text-gray-500 hover:text-red-400"
                  title="删除图片"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {!collapsed && src && (
          <div className="flex justify-center bg-[#0e1015] p-2.5 border-t border-gray-800/80 overflow-hidden">
            <img
              src={src}
              alt={title}
              style={{ width: `${width}%` }}
              className="max-w-full h-auto rounded object-contain"
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const CollapsibleImageBlock = Node.create({
  name: 'collapsibleImageBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-src') || el.getAttribute('src') || '',
        renderHTML: (attrs) => ({ 'data-src': attrs.src || '' })
      },
      title: {
        default: 'image.png',
        parseHTML: (el) => el.getAttribute('data-title') || el.getAttribute('alt') || 'image.png',
        renderHTML: (attrs) => ({ 'data-title': attrs.title || 'image.png' })
      },
      width: {
        default: 75,
        parseHTML: (el) => Number(el.getAttribute('data-width')) || 75,
        renderHTML: (attrs) => ({ 'data-width': String(attrs.width || 75) })
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs) => ({ 'data-collapsed': String(Boolean(attrs.collapsed)) })
      }
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="collapsible-image-block"]' },
      { tag: 'img[src]' }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'collapsible-image-block' })
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleImageBlockView);
  }
});
