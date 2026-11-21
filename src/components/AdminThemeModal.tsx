// src/components/AdminThemeModal.tsx
import { useState, useEffect, useRef } from 'react';
import { Palette, Upload, Trash2, Save, Plus, X } from 'lucide-react';
import { useAuthStore, type CustomThemeItem } from '../store/useAuthStore';

interface AdminThemeModalProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_SAMPLE_JSON = JSON.stringify(
  {
    name: '暖杏极简',
    description: '柔和暖米色日间风格',
    baseMode: 'light',
    colors: {
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
    },
  },
  null,
  2
);

export default function AdminThemeModal({ open, onClose }: AdminThemeModalProps) {
  const { currentUser, customThemes, fetchThemes, importCustomTheme, updateCustomTheme, deleteCustomTheme } =
    useAuthStore();
  const [selectedId, setSelectedId] = useState<string>('__new__');
  const [name, setName] = useState<string>('暖杏极简');
  const [description, setDescription] = useState<string>('柔和暖米色日间风格');
  const [baseMode, setBaseMode] = useState<'dark' | 'light' | 'eyecare'>('light');
  const [jsonText, setJsonText] = useState<string>(DEFAULT_SAMPLE_JSON);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      fetchThemes();
      setMsg('');
    }
  }, [open, fetchThemes]);

  if (!open || currentUser?.role !== 'admin') return null;

  const selectThemeForEdit = (t: CustomThemeItem | null) => {
    setMsg('');
    if (!t) {
      setSelectedId('__new__');
      setName('暖杏极简');
      setDescription('柔和暖米色日间风格');
      setBaseMode('light');
      setJsonText(DEFAULT_SAMPLE_JSON);
      return;
    }
    setSelectedId(t.id);
    setName(t.name);
    setDescription(t.description || '');
    setBaseMode(t.baseMode || 'dark');
    setJsonText(
      JSON.stringify(
        {
          name: t.name,
          description: t.description || '',
          baseMode: t.baseMode || 'dark',
          colors: t.colors || {},
        },
        null,
        2
      )
    );
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      setJsonText(raw);
      try {
        const parsed = JSON.parse(raw);
        if (parsed.name) setName(String(parsed.name));
        if (parsed.description) setDescription(String(parsed.description));
        if (parsed.baseMode === 'light' || parsed.baseMode === 'eyecare' || parsed.baseMode === 'dark') {
          setBaseMode(parsed.baseMode);
        }
        setMsg('已载入 JSON 文件，确认后点击保存/导入');
      } catch {
        setMsg('JSON 格式解析失败，请检查语法');
      }
    };
    reader.readAsText(f, 'utf-8');
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const parsed = JSON.parse(jsonText);
      const colorsObj = parsed && typeof parsed.colors === 'object' ? parsed.colors : parsed;
      const payload = {
        name: (name || parsed?.name || '').trim(),
        description: (description || parsed?.description || '').trim(),
        baseMode:
          parsed?.baseMode === 'light' || parsed?.baseMode === 'eyecare' || parsed?.baseMode === 'dark'
            ? parsed.baseMode
            : baseMode,
        colors: colorsObj,
      };
      if (selectedId === '__new__') {
        await importCustomTheme(payload);
        setMsg('已导入并发布全局风格，所有用户均可在侧边栏切换使用');
      } else {
        await updateCustomTheme(selectedId, payload);
        setMsg('已更新该全局风格配色');
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
      setMsg('已删除自定义风格');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
      <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Palette size={16} className="text-blue-400" />
            <span>全局风格库管理（管理员导入 / 修改 / 删除）</span>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
          <div className="space-y-2 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => selectThemeForEdit(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                selectedId === '__new__'
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                  : 'bg-[#1a1d24] border-gray-800 text-gray-300 hover:bg-[#232731]'
              }`}
            >
              <Plus size={14} />
              <span>导入新风格 JSON</span>
            </button>

            <div className="text-[11px] text-gray-400 pt-1">已有自定义全局风格（{customThemes.length}）</div>
            {customThemes.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs ${
                  selectedId === t.id
                    ? 'bg-blue-600/15 border-blue-500/40 text-white'
                    : 'bg-[#1a1d24] border-gray-800 text-gray-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectThemeForEdit(t)}
                  className="flex-1 text-left truncate"
                >
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">基底: {t.baseMode}</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  className="text-gray-500 hover:text-rose-400 p-1 shrink-0"
                  title="删除该自定义风格"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="md:col-span-2 flex flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">风格名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">简短说明</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">基准模式</label>
                <select
                  value={baseMode}
                  onChange={(e) => setBaseMode(e.target.value as 'dark' | 'light' | 'eyecare')}
                  className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="dark">dark（暗色基底）</option>
                  <option value="light">light（亮色基底）</option>
                  <option value="eyecare">eyecare（护眼基底）</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">风格 JSON 配置（支持直接编辑色值或导入 .json）</span>
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
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full flex-1 bg-[#14161b] border border-gray-700 rounded-xl p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
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
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium"
          >
            <Save size={13} />
            <span>{saving ? '保存中...' : selectedId === '__new__' ? '导入并发布风格' : '保存风格修改'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
