// src/components/notes/RichTextNoteEditor.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Code2,
  Contrast
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

const CONTRAST_STORAGE_KEY = 'notes_dark_auto_contrast_v1';

// ============================================================================
// 暗色背景文字对比度自适应算法（非破坏性视图层渲染，绝不污染存储 HTML）
// ============================================================================
interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseCssColor(raw: string): RgbaColor | null {
  const s = (raw || '').trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'inherit' || s === 'initial' || s === 'currentcolor') {
    return null;
  }
  const rgbMatch = s.match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
  if (rgbMatch) {
    return {
      r: Math.min(255, Math.max(0, Number(rgbMatch[1]))),
      g: Math.min(255, Math.max(0, Number(rgbMatch[2]))),
      b: Math.min(255, Math.max(0, Number(rgbMatch[3]))),
      a: rgbMatch[4] !== undefined ? Math.min(1, Math.max(0, Number(rgbMatch[4]))) : 1
    };
  }
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1
      };
    }
    if (/^[0-9a-f]{6}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
      };
    }
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function blendOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rn: number;
  let gn: number;
  let bn: number;
  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return [
    Math.round((rn + m) * 255),
    Math.round((gn + m) * 255),
    Math.round((bn + m) * 255)
  ];
}

function resolveEffectiveBgColor(el: HTMLElement, stopAt: HTMLElement, fallback: RgbaColor): RgbaColor {
  const layers: RgbaColor[] = [];
  let cur: HTMLElement | null = el;
  while (cur) {
    const parsed = parseCssColor(window.getComputedStyle(cur).backgroundColor);
    if (parsed && parsed.a > 0.02) {
      layers.push(parsed);
      if (parsed.a >= 0.98) break;
    }
    if (cur === stopAt) break;
    cur = cur.parentElement;
  }
  let base = fallback;
  for (let i = layers.length - 1; i >= 0; i--) {
    base = blendOver(layers[i], base);
  }
  return base;
}

function computeReadableDarkBgColor(fg: RgbaColor, bgLum: number): string {
  const [h, s, l] = rgbToHsl(fg.r, fg.g, fg.b);
  // 黑/深灰系：直接反转为柔和清晰浅灰白，兼顾高对比与防刺眼
  if (s < 0.14) {
    const targetL = Math.min(0.94, Math.max(0.84, 1 - l));
    const [r, g, b] = hslToRgb(215, 0.12, targetL);
    return `rgb(${r}, ${g}, ${b})`;
  }
  // 彩色系：保留原始色相，逐步反转并提升亮度直至对比度 >= 4.8
  let targetL = Math.max(0.68, 1 - l);
  const targetS = Math.min(0.92, Math.max(s, 0.55));
  for (let step = 0; step < 8; step++) {
    const [r, g, b] = hslToRgb(h, targetS, Math.min(0.92, targetL));
    if (contrastRatio(relativeLuminance(r, g, b), bgLum) >= 4.8) {
      return `rgb(${r}, ${g}, ${b})`;
    }
    targetL += 0.04;
  }
  const [r, g, b] = hslToRgb(h, targetS, 0.88);
  return `rgb(${r}, ${g}, ${b})`;
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastEmittedRef = useRef<string>(content);
  const pasteSeqRef = useRef(0);
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const [openPicker, setOpenPicker] = useState<'color' | 'highlight' | null>(null);
  const [autoContrast, setAutoContrast] = useState<boolean>(() => {
    const saved = localStorage.getItem(CONTRAST_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  });

  const applyContrastEnhancement = useCallback(() => {
    const wrap = containerRef.current;
    if (!wrap) return;
    const editorRoot = wrap.querySelector('.tiptap-editor') as HTMLElement | null;
    if (!editorRoot) return;

    const canvasBg = resolveEffectiveBgColor(editorRoot, wrap, { r: 27, g: 30, b: 38, a: 1 });
    const canvasLum = relativeLuminance(canvasBg.r, canvasBg.g, canvasBg.b);
    const isDarkCanvas = canvasLum < 0.35;

    const nodes = editorRoot.querySelectorAll<HTMLElement>('[style*="color"], [data-orig-color]');
    nodes.forEach((el) => {
      if (
        el.closest('[data-type="collapsible-code-block"]') ||
        el.closest('[data-type="collapsible-image-block"]')
      ) {
        return;
      }

      const currentInline = el.style.color || '';
      const applied = el.dataset.appliedContrastColor || '';

      // 若 ProseMirror / 用户主动修改了文字颜色，则刷新原始色记录
      if (el.dataset.origColor === undefined || (applied && currentInline !== applied)) {
        if (currentInline) {
          el.dataset.origColor = currentInline;
        } else {
          delete el.dataset.origColor;
          delete el.dataset.appliedContrastColor;
          return;
        }
      }

      const origColor = el.dataset.origColor || '';
      if (!origColor) return;

      if (!autoContrast || !isDarkCanvas) {
        if (el.dataset.appliedContrastColor) {
          el.style.color = origColor;
          delete el.dataset.appliedContrastColor;
        }
        return;
      }

      // 先临时以原始色计算，再判定与实际有效背景（含高亮底色）的色差
      const effectiveBg = resolveEffectiveBgColor(el, wrap, canvasBg);
      const effectiveBgLum = relativeLuminance(effectiveBg.r, effectiveBg.g, effectiveBg.b);
      if (effectiveBgLum >= 0.42) {
        // 元素本身处于浅色高亮底块内，保持原色以免亮底白字
        if (el.dataset.appliedContrastColor) {
          el.style.color = origColor;
          delete el.dataset.appliedContrastColor;
        }
        return;
      }

      const parsedOrig = parseCssColor(origColor);
      if (!parsedOrig) return;

      const fgLum = relativeLuminance(parsedOrig.r, parsedOrig.g, parsedOrig.b);
      const ratio = contrastRatio(fgLum, effectiveBgLum);

      if (ratio < 4.5 && fgLum < 0.45) {
        const boosted = computeReadableDarkBgColor(parsedOrig, effectiveBgLum);
        el.style.color = boosted;
        el.dataset.appliedContrastColor = el.style.color;
      } else if (el.dataset.appliedContrastColor) {
        el.style.color = origColor;
        delete el.dataset.appliedContrastColor;
      }
    });
  }, [autoContrast]);

  const scheduleContrastPass = useCallback(() => {
    window.requestAnimationFrame(() => applyContrastEnhancement());
  }, [applyContrastEnhancement]);

  const uploadAndInsertImage = async (file: File | Blob) => {
    if (!editor || !editable) return;
    setIsUploadingImg(true);
    try {
      pasteSeqRef.current += 1;
      const fallbackName = `paste_${pasteSeqRef.current}.png`;
      const res = await api.notes.uploadImage(
        file,
        file instanceof File ? file.name : fallbackName
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
      scheduleContrastPass();
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

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    if (content !== lastEmittedRef.current && content !== editor.getHTML()) {
      lastEmittedRef.current = content;
      editor.commands.setContent(content || '', { emitUpdate: false });
      scheduleContrastPass();
    }
  }, [editor, content, scheduleContrastPass]);

  // 监听开关变化、主题切换及编辑器内容重绘，实时执行暗色对比度自适应
  useEffect(() => {
    scheduleContrastPass();
    const themeObserver = new MutationObserver(() => scheduleContrastPass());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style']
    });
    return () => themeObserver.disconnect();
  }, [scheduleContrastPass, content]);

  const handleToggleAutoContrast = () => {
    setAutoContrast((prev) => {
      const next = !prev;
      localStorage.setItem(CONTRAST_STORAGE_KEY, String(next));
      onNotify?.(
        next
          ? '🌓 已开启暗色文字自适应增亮（不修改原始文档颜色）'
          : '已关闭暗色文字自适应增亮，恢复原始字体颜色'
      );
      return next;
    });
  };

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
      ref={containerRef}
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

      {/* 完整富文本编辑器工具栏 */}
      <div className="rich-editor-toolbar sticky top-0 z-20 px-3 py-2 border-b border-gray-800 rounded-t-2xl flex items-center flex-wrap gap-1 select-none">
        {editable && (
          <>
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
          </>
        )}

        {/* 暗色背景文字自适应增亮开关（只读与编辑模式均可用） */}
        <button
          type="button"
          onClick={handleToggleAutoContrast}
          className={`ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
            autoContrast
              ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 font-medium'
              : 'bg-[#252830] border-gray-700 text-gray-400 hover:text-gray-200'
          }`}
          title="开启后：暗色背景下自动计算文字与背景色差，低对比深色文本自动反转增亮，不改动原始文档颜色"
        >
          <Contrast size={13} />
          <span>暗色增亮</span>
        </button>
      </div>

      {/* 主画布编辑区域 */}
      <div className="flex-1 px-5 md:px-10 py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
