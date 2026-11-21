// src/components/AdminThemeModal.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Palette, Upload, Trash2, Save, Plus, X, Lock } from 'lucide-react';
import {
  useAuthStore,
  DEFAULT_THEME_COLORS,
  THEME_COLOR_FIELDS,
  LOGO_ICONS,
  LOGO_ICON_LABELS,
  LOGO_ICON_COMPONENTS,
  getThemeLogo,
  isLogoIcon,
  type CustomThemeItem,
  type LogoIcon,
  type ThemeLogo,
} from '../store/useAuthStore';

interface AdminThemeModalProps {
  open: boolean;
  onClose: () => void;
  initialThemeId?: string | null;
}

interface ThemeDraft {
  name: string;
  description: string;
  logo: ThemeLogo;
  colors: Record<string, string>;
}

const SAMPLE_COLORS = { ...DEFAULT_THEME_COLORS };
delete SAMPLE_COLORS['--logo-bg'];
delete SAMPLE_COLORS['--logo-fg'];
delete SAMPLE_COLORS['--logo-border'];

const DEFAULT_SAMPLE_JSON = JSON.stringify(
  {
    name: '暖杏极简',
    description: '柔和暖米色日间风格',
    logo: { icon: 'ring', fg: '#fff7ed', bg: '#d97706' },
    colors: {
      ...SAMPLE_COLORS,
      '--bg-base': '#f6f1e7',
      '--bg-surface': '#fffdf8',
      '--bg-surface-alt': '#faf5ea',
      '--bg-sidebar': '#efe8da',
      '--bg-panel': '#f4ede0',
      '--bg-input': '#ffffff',
      '--bg-hover': '#e7decb',
      '--bg-hover-strong': '#dcd0b8',
      '--text-primary': '#26231e',
      '--text-secondary': '#3d3830',
      '--text-muted': '#6b6356',
      '--text-subtle': '#8c8272',
      '--border-main': '#d6ccb8',
      '--border-subtle': '#e5dccb',
      '--chart-free': '#e5dccb',
    },
  },
  null,
  2
);

function stripLogoColors(colors: Record<string, string>): Record<string, string> {
  const next = { ...(colors || {}) };
  delete next['--logo-bg'];
  delete next['--logo-fg'];
  delete next['--logo-border'];
  return next;
}

function draftFromParsed(parsed: unknown): ThemeDraft {
  const data = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const rawColors =
    data.colors && typeof data.colors === 'object'
      ? (data.colors as Record<string, unknown>)
      : data;
  const colors = { ...DEFAULT_THEME_COLORS };
  for (const [key, value] of Object.entries(rawColors)) {
    if (typeof value === 'string') colors[key] = value;
  }
  const cleanColors = stripLogoColors(colors);
  const legacyShape = isLogoIcon(data.logoShape) ? data.logoShape : undefined;
  const logo = getThemeLogo({
    id: '',
    name: '',
    colors: cleanColors,
    logo: data.logo,
    ...(legacyShape ? { logoShape: legacyShape } : {}),
  } as unknown as CustomThemeItem);
  return {
    name: String(data.name || '未命名主题'),
    description: String(data.description || ''),
    logo,
    colors: cleanColors,
  };
}

function toColorInputValue(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return '#334155';
}

function renderLogo(icon: LogoIcon, size = 13) {
  if (icon === 'ring') {
    const side = Math.max(10, size - 1);
    return (
      <span
        className="rounded-full inline-block shrink-0"
        style={{
          width: `${side}px`,
          height: `${side}px`,
          border: '2px solid currentColor',
          backgroundColor: 'transparent',
        }}
      />
    );
  }
  const Icon = LOGO_ICON_COMPONENTS[icon] || LOGO_ICON_COMPONENTS.sparkle;
  return <Icon size={size} />;
}

export default function AdminThemeModal({ open, onClose, initialThemeId }: AdminThemeModalProps) {
  const { currentUser, themes, fetchThemes, importCustomTheme, updateCustomTheme, deleteCustomTheme } =
    useAuthStore();
  const [selectedId, setSelectedId] = useState<string>('__new__');
  const [draft, setDraft] = useState<ThemeDraft>(() => draftFromParsed(JSON.parse(DEFAULT_SAMPLE_JSON)));
  const [jsonText, setJsonText] = useState<string>(DEFAULT_SAMPLE_JSON);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>('');
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoButtonRef = useRef<HTMLButtonElement>(null);
  const logoPickerRef = useRef<HTMLDivElement>(null);

  const currentItem = themes.find((item) => item.id === selectedId);
  const isReadonly = Boolean(currentItem?.readonly);
  const isNew = selectedId === '__new__';
  const controlsDisabled = saving || isReadonly;

  const syncJson = (next: ThemeDraft) => {
    setJsonText(JSON.stringify(next, null, 2));
  };

  const selectThemeForEdit = useCallback((t: CustomThemeItem | null) => {
    setMsg('');
    setLogoPickerOpen(false);
    if (!t) {
      setSelectedId('__new__');
      const next = draftFromParsed(JSON.parse(DEFAULT_SAMPLE_JSON));
      setDraft(next);
      syncJson(next);
      return;
    }
    setSelectedId(t.id);
    const next = draftFromParsed(t);
    next.name = t.name;
    next.description = t.description || '';
    setDraft(next);
    syncJson(next);
  }, []);

  useEffect(() => {
    if (open) {
      fetchThemes();
      setMsg('');
    }
  }, [open, fetchThemes]);

  useEffect(() => {
    if (!open || !initialThemeId || currentUser?.role !== 'admin') return;
    const target = themes.find((item) => item.id === initialThemeId);
    if (target) selectThemeForEdit(target);
  }, [open, initialThemeId, themes, currentUser?.role, selectThemeForEdit]);

  useEffect(() => {
    if (!logoPickerOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (logoPickerRef.current?.contains(e.target as Node)) return;
      if (logoButtonRef.current?.contains(e.target as Node)) return;
      setLogoPickerOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [logoPickerOpen]);

  if (!open || currentUser?.role !== 'admin') return null;

  const updateDraft = (patch: Partial<ThemeDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    syncJson(next);
  };

  const updateColor = (key: string, value: string) => {
    updateDraft({ colors: { ...draft.colors, [key]: value } });
  };

  const updateLogo = (patch: Partial<ThemeLogo>) => {
    updateDraft({ logo: { ...draft.logo, ...patch } });
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      setJsonText(raw);
      try {
        const next = draftFromParsed(JSON.parse(raw));
        setDraft(next);
        syncJson(next);
        setMsg('已载入 JSON 文件，确认后点击保存/导入');
      } catch {
        setMsg('JSON 格式解析失败，请检查语法');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const parsedDraft = draftFromParsed(JSON.parse(jsonText));
      const payload = {
        name: parsedDraft.name.trim(),
        description: parsedDraft.description.trim(),
        logo: parsedDraft.logo,
        colors: { ...SAMPLE_COLORS, ...parsedDraft.colors },
      };
      if (!payload.name) throw new Error('主题名称不能为空');
      if (isNew) {
        await importCustomTheme(payload);
        setMsg('已导入并发布全局主题方案，所有用户均可在侧边栏切换使用');
      } else {
        await updateCustomTheme(selectedId, payload);
        setMsg('已更新该主题方案配色');
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '保存失败，请检查 JSON 格式');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setMsg('');
    try {
      await deleteCustomTheme(id);
      if (selectedId === id) selectThemeForEdit(null);
      setMsg('已删除自定义主题方案');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const builtins = themes.filter((item) => item.isBuiltin);
  const customs = themes.filter((item) => !item.isBuiltin);
  const logoRect = logoButtonRef.current?.getBoundingClientRect();

  const renderThemeItem = (t: CustomThemeItem) => (
    <div
      key={t.id}
      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs ${
        selectedId === t.id
          ? 'bg-blue-600/15 border-blue-500/40 text-white'
          : 'bg-[#1a1d24] border-gray-800 text-gray-300'
      }`}
    >
      <button type="button" onClick={() => selectThemeForEdit(t)} className="flex-1 min-w-0 text-left">
        <span className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: getThemeLogo(t).bg, color: getThemeLogo(t).fg }}
          >
            {renderLogo(getThemeLogo(t).icon)}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-medium truncate">
              {t.name}
              {t.readonly && <Lock size={10} className="text-amber-400 shrink-0" />}
            </span>
            <span className="block text-[10px] text-gray-400 truncate">
              {t.isBuiltin ? '内置方案' : '自定义方案'} · {t.activeInMenu !== false ? '菜单已激活' : '菜单未激活'}
            </span>
          </span>
        </span>
      </button>
      {!t.isBuiltin && (
        <button
          type="button"
          onClick={() => void handleDelete(t.id)}
          className="text-gray-500 hover:text-rose-400 p-1 shrink-0"
          title="删除该自定义主题方案"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
      <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-5xl p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Palette size={16} className="text-blue-400" />
            <span>全局主题风格库（内置方案 + 自定义方案）</span>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 min-h-0 overflow-hidden">
          <div className="space-y-2 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => selectThemeForEdit(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                isNew
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                  : 'bg-[#1a1d24] border-gray-800 text-gray-300 hover:bg-[#232731]'
              }`}
            >
              <Plus size={14} />
              <span>导入新风格 JSON</span>
            </button>

            <div className="text-[11px] text-gray-400 pt-1">内置独立方案（{builtins.length}）</div>
            {builtins.map(renderThemeItem)}
            <div className="text-[11px] text-gray-400 pt-2">自定义方案（{customs.length}）</div>
            {customs.map(renderThemeItem)}
          </div>

          <div className="md:col-span-3 flex flex-col gap-3 overflow-y-auto">
            {isReadonly && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                <Lock size={12} />
                <span>该内置方案为只读锁定，不可修改配色或 Logo。</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">方案名称</label>
                <input
                  type="text"
                  disabled={controlsDisabled}
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">简短说明</label>
                <input
                  type="text"
                  disabled={controlsDisabled}
                  value={draft.description}
                  onChange={(e) => updateDraft({ description: e.target.value })}
                  className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">主题 Logo</label>
                <div className="text-[11px] text-gray-300 bg-[#1a1d24] border border-gray-700 rounded-lg px-2.5 py-1.5 truncate">
                  点击下方图标按钮更换（{LOGO_ICON_LABELS[draft.logo.icon]}）
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1a1d24] border border-gray-700">
              <button
                ref={logoButtonRef}
                type="button"
                disabled={controlsDisabled}
                onClick={() => setLogoPickerOpen((prev) => !prev)}
                title="点击选择 Logo 图标"
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 disabled:cursor-default"
                style={{ backgroundColor: draft.logo.bg, color: draft.logo.fg }}
              >
                {renderLogo(draft.logo.icon, 16)}
              </button>
              <span className="text-[11px] text-gray-400">点击 Logo 打开图标库（12 款）</span>
              {[
                { key: 'fg' as const, label: '图案色' },
                { key: 'bg' as const, label: '底色' },
              ].map((field) => (
                <label key={field.key} className="flex items-center gap-1.5 text-[11px] text-gray-300">
                  <span>{field.label}</span>
                  <input
                    type="color"
                    disabled={controlsDisabled}
                    value={toColorInputValue(draft.logo[field.key])}
                    onChange={(e) => updateLogo({ [field.key]: e.target.value })}
                    className="w-7 h-7 rounded border border-gray-600 bg-transparent cursor-pointer disabled:cursor-default"
                  />
                </label>
              ))}
            </div>

            <div>
              <div className="text-[11px] text-gray-400 mb-1.5">独立色值配置（15 项）</div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {THEME_COLOR_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    title={`${field.description}（${field.key}）`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#1a1d24] border border-gray-800"
                  >
                    <input
                      type="color"
                      disabled={controlsDisabled}
                      value={toColorInputValue(draft.colors[field.key])}
                      onChange={(e) => updateColor(field.key, e.target.value)}
                      className="w-6 h-6 shrink-0 rounded border border-gray-600 bg-transparent cursor-pointer disabled:cursor-default"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] text-gray-200">{field.label}</span>
                      <span className="block text-[9px] text-gray-500 truncate">{field.key}</span>
                    </span>
                    <input
                      type="text"
                      disabled={controlsDisabled}
                      value={draft.colors[field.key] || ''}
                      onChange={(e) => updateColor(field.key, e.target.value)}
                      className="w-[74px] bg-[#14161b] border border-gray-700 rounded px-1.5 py-1 text-[10px] font-mono text-gray-300 disabled:opacity-50"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">风格 JSON 配置（可编辑，支持导入 .json）</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1a1d24] hover:bg-[#232731] border border-gray-700 text-[11px] text-gray-200"
              >
                <Upload size={12} />
                <span>导入 JSON 文件</span>
              </button>
            </div>

            <textarea
              rows={7}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full bg-[#14161b] border border-gray-700 rounded-xl p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
            />

            {msg && <div className="text-xs text-blue-300">{msg}</div>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
          >
            关闭
          </button>
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium"
          >
            <Save size={13} />
            <span>{saving ? '保存中...' : isNew ? '导入并发布风格' : '保存风格修改'}</span>
          </button>
        </div>

        {logoPickerOpen && logoRect && (
          <div
            ref={logoPickerRef}
            className="fixed z-[60] w-64 rounded-xl border border-gray-600 bg-[#1a1d24] p-2 shadow-2xl"
            style={{
              top: Math.min(logoRect.bottom + 6, window.innerHeight - 210),
              left: Math.min(logoRect.left, window.innerWidth - 272),
            }}
          >
            <div className="px-1 pb-2 text-[11px] text-gray-400">Logo 图标库（12 款）</div>
            <div className="grid grid-cols-4 gap-1.5">
              {LOGO_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  title={LOGO_ICON_LABELS[icon]}
                  onClick={() => {
                    updateLogo({ icon });
                    setLogoPickerOpen(false);
                  }}
                  className={`h-9 rounded-lg flex items-center justify-center ${
                    draft.logo.icon === icon
                      ? 'bg-blue-600/30 text-blue-300'
                      : 'text-gray-300 hover:bg-[#323640]'
                  }`}
                >
                  {renderLogo(icon, 16)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
