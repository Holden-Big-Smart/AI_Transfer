// src/components/notes/SyntaxHighlightEditor.tsx
import { useRef } from 'react';

const TOKEN_REGEX =
  /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*)|(@[a-zA-Z_]\w*)|\b(def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|async|await|yield|lambda|pass|break|continue|in|is|not|and|or|True|False|None|self|const|let|var|function|export|default|interface|type|SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|LEFT|RIGHT|ON|GROUP|BY|ORDER|LIMIT|CREATE|TABLE|DROP|ALTER|VALUES|SET|AND|OR|NOT|NULL)\b|\b(print|len|range|str|int|float|list|dict|set|tuple|open|super|isinstance|enumerate|zip|map|filter|Exception|Promise|Array|Object|String|Number|Boolean|console|window|document)\b|\b([a-zA-Z_]\w*)(?=\s*\()|\b(\d+(?:\.\d+)?)\b/g;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightCodeToHtml(code: string): string {
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

export interface HighlightEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  autoHeight?: boolean;
  wordWrap?: boolean;
  readOnly?: boolean;
}

export function SyntaxHighlightEditor({
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
