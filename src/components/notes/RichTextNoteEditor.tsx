// src/components/notes/RichTextNoteEditor.tsx
import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  IndentIncrease,
  IndentDecrease,
  Quote,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Table as TableIcon,
  RemoveFormatting,
  Highlighter,
  Palette,
  Image as ImageIcon,
  Code2
} from 'lucide-react';
import {
  PriorityTaskItem,
  CollapsibleCodeBlock,
  CollapsibleImageBlock
} from './RichNoteExtensions';
import { api } from '../../utils/api';

const TEXT_COLORS = [
  { label: '默认', value: '' },
  { label: '红色', value: '#ef4444' },
  { label: '橙色', value: '#f97316' },
  { label: '琥珀', value: '#eab308' },
  { label: '绿色', value: '#22c55e' },
  { label: '蓝色', value: '#3b82f6' },
  { label: '紫色', value: '#a855f7' },
  { label: '灰色', value: '#9ca3af' }
];

const HIGHLIGHT_COLORS = [
  { label: '无高亮', value: '' },
  { label: '黄高亮', value: 'rgba(250, 204, 21, 0.35)' },
  { label: '绿高亮', value: 'rgba(34, 197, 94, 0.30)' },
  { label: '蓝高亮', value: 'rgba(59, 130, 246, 0.30)' },
  { label: '红高亮', value: 'rgba(239, 68, 68, 0.30)' },
  { label: '紫高亮', value: 'rgba(168, 85, 247, 0.30)' }
];

export interface RichTextNoteEditorProps {
  content: string;
  editable: boolean;
  onChange: (html: string) => void;
  onNotify?: (msg: string) => void;
}

export default function RichTextNoteEditor({
  content,
  editable,
  onChange,
  onNotify
}: RichTextNoteEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastEmittedRef = useRef<string>(content);
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const [openPicker, setOpenPicker] = useState<'color' | 'highlight' | null>(null);

  const uploadAndInsertImage = async (file: File | Blob) => {
    if (!editor || !editable) return;
    setIsUploadingImg(true);
    try {
      const res = await api.notes.uploadImage(
        file,
        file instanceof File ? file.name : `paste_${Date.now()}.png`
      );
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'collapsibleImageBlock',
          attrs: {
            src: res.url,
            title: file instanceof File ? file.name : 'image.png',
            width: 75,
            collapsed: false
          }
        })
        .run();
      onNotify?.('🖼️ 图片已插入，记得点击保存笔记');
    } catch (err) {
      alert(`图片上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsUploadingImg(false);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-blue-400 underline cursor-pointer'
          }
        }
      }),
      Placeholder.configure({
        placeholder:
          '在此输入笔记内容... 支持完整富文本排版、直接按 Ctrl+V 粘贴图片、点击上方按钮插入待办事项或折叠代码块。'
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      PriorityTaskItem.configure({ nested: true }),
      TableKit.configure({
        table: { resizable: false }
      }),
      CollapsibleCodeBlock,
      CollapsibleImageBlock
    ],
    content: content || '',
    editable,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor focus:outline-none min-h-[420px] select-text'
      },
      handlePaste: (_view, event) => {
        if (!editable) return false;
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
              const blob = item.getAsFile();
              if (blob) {
                event.preventDefault();
                uploadAndInsertImage(blob);
                return true;
              }
            }
          }
        }

        const text = event.clipboardData?.getData('text/plain') || '';
        if (text.startsWith('__NOTE_IMG__:')) {
          const imgUrl = text.replace('__NOTE_IMG__:', '').trim();
          if (imgUrl && editor) {
            event.preventDefault();
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'collapsibleImageBlock',
                attrs: {
                  src: imgUrl,
                  title: 'image.png',
                  width: 75,
                  collapsed: false
                }
              })
              .run();
            return true;
          }
        }
        return false;
      }
    }
  });

  // 同步外部只读状态变化
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // 切换笔记/页签或远端自动同步时更新画布内容（不干扰本地连续输入光标）
  useEffect(() => {
    if (!editor) return;
    if (content !== lastEmittedRef.current && content !== editor.getHTML()) {
      lastEmittedRef.current = content;
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
  }, [editor, content]);

  if (!editor) return null;

  const isInTaskItem = editor.isActive('taskItem');
  const isInTable = editor.isActive('table');

  const handleSetLink = () => {
    const previousUrl = editor.getAttributes('link').href || '';
    const url = window.prompt('请输入链接地址 (留空则移除链接):', previousUrl);
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const normalizedUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedUrl }).run();
  };

  const handleInsertCodeWindow = () => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'collapsibleCodeBlock',
        attrs: {
          code: '',
          language: 'python',
          title: '代码片段.py',
          collapsed: false
        }
      })
      .run();
  };

  const toolBtn = (active: boolean) =>
    `p-1.5 rounded-lg text-xs transition-colors flex items-center justify-center ${
      active
        ? 'bg-blue-600/25 text-blue-400 border border-blue-500/50'
        : 'text-gray-300 hover:bg-[#323640] hover:text-white border border-transparent'
    }`;

  return (
    <div
      onClick={() => setOpenPicker(null)}
      className="max-w-5xl mx-auto min-h-full bg-[#1b1e26] border border-gray-800/80 rounded-2xl shadow-inner flex flex-col overflow-visible"
    >
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

      {/* 完整富文本编辑器工具栏（访客/只读模式下自动隐藏） */}
      {editable && (
        <div className="rich-editor-toolbar sticky top-0 z-20 px-3 py-2 border-b border-gray-800 rounded-t-2xl flex items-center flex-wrap gap-1 select-none">
          {/* 撤销 / 重做 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className={`${toolBtn(false)} disabled:opacity-35`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className={`${toolBtn(false)} disabled:opacity-35`}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 size={14} />
          </button>

          <span className="w-px h-4 bg-gray-700 mx-1" />

          {/* 标题层级 H1 ~ H3 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={toolBtn(editor.isActive('heading', { level: 1 }))}
            title="一级标题 (H1)"
          >
            <Heading1 size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={toolBtn(editor.isActive('heading', { level: 2 }))}
            title="二级标题 (H2)"
          >
            <Heading2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={toolBtn(editor.isActive('heading', { level: 3 }))}
            title="三级标题 (H3)"
          >
            <Heading3 size={14} />
          </button>

          <span className="w-px h-4 bg-gray-700 mx-1" />

          {/* 字符样式 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={toolBtn(editor.isActive('bold'))}
            title="加粗 (Ctrl+B)"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={toolBtn(editor.isActive('italic'))}
            title="斜体 (Ctrl+I)"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={toolBtn(editor.isActive('underline'))}
            title="下划线 (Ctrl+U)"
          >
            <UnderlineIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={toolBtn(editor.isActive('strike'))}
            title="删除线"
          >
            <Strikethrough size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={toolBtn(editor.isActive('code'))}
            title="行内代码"
          >
            <Code size={14} />
          </button>

          {/* 文字颜色选择器 */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setOpenPicker((prev) => (prev === 'color' ? null : 'color'))}
              className={toolBtn(openPicker === 'color')}
              title="文字颜色"
            >
              <Palette size={14} />
            </button>
            {openPicker === 'color' && (
              <div className="absolute left-0 top-full mt-1.5 p-2 bg-[#252830] border border-gray-700 rounded-xl shadow-2xl flex items-center gap-1.5 z-50">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => {
                      if (c.value) {
                        editor.chain().focus().setColor(c.value).run();
                      } else {
                        editor.chain().focus().unsetColor().run();
                      }
                      setOpenPicker(null);
                    }}
                    className="w-5 h-5 rounded-full border border-gray-600 flex items-center justify-center text-[9px] hover:scale-110 transition-transform"
                    style={{ backgroundColor: c.value || 'transparent' }}
                    title={c.label}
                  >
                    {!c.value && '×'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 荧光高亮选择器 */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setOpenPicker((prev) => (prev === 'highlight' ? null : 'highlight'))}
              className={toolBtn(editor.isActive('highlight') || openPicker === 'highlight')}
              title="文字背景高亮"
            >
              <Highlighter size={14} />
            </button>
            {openPicker === 'highlight' && (
              <div className="absolute left-0 top-full mt-1.5 p-2 bg-[#252830] border border-gray-700 rounded-xl shadow-2xl flex items-center gap-1.5 z-50">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => {
                      if (c.value) {
                        editor.chain().focus().toggleHighlight({ color: c.value }).run();
                      } else {
                        editor.chain().focus().unsetHighlight().run();
                      }
                      setOpenPicker(null);
                    }}
                    className="w-5 h-5 rounded-md border border-gray-600 flex items-center justify-center text-[9px] hover:scale-110 transition-transform"
                    style={{ backgroundColor: c.value || 'transparent' }}
                    title={c.label}
                  >
                    {!c.value && '×'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-gray-700 mx-1" />

          {/* 对齐方式 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={toolBtn(editor.isActive({ textAlign: 'left' }))}
            title="左对齐"
          >
            <AlignLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={toolBtn(editor.isActive({ textAlign: 'center' }))}
            title="居中对齐"
          >
            <AlignCenter size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={toolBtn(editor.isActive({ textAlign: 'right' }))}
            title="右对齐"
          >
            <AlignRight size={14} />
          </button>

          <span className="w-px h-4 bg-gray-700 mx-1" />

          {/* 列表与核心待办按钮 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={toolBtn(editor.isActive('bulletList'))}
            title="无序列表"
          >
            <List size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={toolBtn(editor.isActive('orderedList'))}
            title="有序列表"
          >
            <ListOrdered size={14} />
          </button>

          {/* 插入待办事项核心按钮 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
              editor.isActive('taskList')
                ? 'bg-emerald-600/25 border-emerald-500/60 text-emerald-300 font-medium'
                : 'bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/35 text-emerald-300'
            }`}
            title="在光标处插入带重要等级的待办事项（支持子待办与点击勾选划掉）"
          >
            <CheckSquare size={13} />
            <span>待办</span>
          </button>

          {/* 当光标位于待办中时，提供直观的升降级按钮（对应 Tab / Shift+Tab） */}
          {isInTaskItem && (
            <>
              <button
                type="button"
                onClick={() => editor.chain().focus().sinkListItem('taskItem').run()}
                disabled={!editor.can().sinkListItem('taskItem')}
                className={`${toolBtn(false)} disabled:opacity-35`}
                title="降级为子待办 (Tab)"
              >
                <IndentIncrease size={14} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().liftListItem('taskItem').run()}
                disabled={!editor.can().liftListItem('taskItem')}
                className={`${toolBtn(false)} disabled:opacity-35`}
                title="升级为上级待办 (Shift+Tab)"
              >
                <IndentDecrease size={14} />
              </button>
            </>
          )}

          <span className="w-px h-4 bg-gray-700 mx-1" />

          {/* 引用 / 分割线 / 链接 / 表格 / 清除格式 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={toolBtn(editor.isActive('blockquote'))}
            title="引用块"
          >
            <Quote size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className={toolBtn(false)}
            title="插入分割线"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={handleSetLink}
            className={toolBtn(editor.isActive('link'))}
            title="插入或编辑超链接"
          >
            <LinkIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            className={toolBtn(isInTable)}
            title="插入 3×3 表格"
          >
            <TableIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            className={toolBtn(false)}
            title="一键清除选中文本格式"
          >
            <RemoveFormatting size={14} />
          </button>

          {/* 表格上下文快捷操作 */}
          {isInTable && (
            <div className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-lg bg-[#16181d] border border-gray-700 text-[11px]">
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="text-blue-400 hover:underline px-1"
              >
                +行
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="text-blue-400 hover:underline px-1"
              >
                +列
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteRow().run()}
                className="text-yellow-400 hover:underline px-1"
              >
                -行
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className="text-yellow-400 hover:underline px-1"
              >
                -列
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="text-red-400 hover:underline px-1"
              >
                删表
              </button>
            </div>
          )}

          <span className="w-px h-4 bg-gray-700 mx-1" />

          {/* 插入图片与折叠代码窗 */}
          <button
            type="button"
            disabled={isUploadingImg}
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors"
            title="上传图片插入到当前光标处（支持 Ctrl+V 粘贴截图）"
          >
            <ImageIcon size={13} />
            <span>{isUploadingImg ? '上传中...' : '图片'}</span>
          </button>

          <button
            type="button"
            onClick={handleInsertCodeWindow}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow"
            title="在当前光标处插入可展开/收起的高亮代码块窗口"
          >
            <Code2 size={13} />
            <span>代码块</span>
          </button>
        </div>
      )}

      {/* 主画布编辑区域 */}
      <div className="flex-1 px-5 md:px-10 py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}