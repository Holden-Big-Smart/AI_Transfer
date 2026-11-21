// src/components/AvatarModal.tsx
import { useState, useRef } from 'react';
import { Camera, RotateCcw, X, Upload } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

interface AvatarModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AvatarModal({ open, onClose }: AvatarModalProps) {
  const { currentUser, uploadAvatar, resetAvatar } = useAuthStore();
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open || !currentUser) return null;

  const activeImg = previewUrl || currentUser.avatarUrl || '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      alert('头像图片大小不能超过 2MB');
      return;
    }
    setPickedFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!pickedFile) return;
    setSubmitting(true);
    try {
      await uploadAvatar(pickedFile);
      setPickedFile(null);
      setPreviewUrl(null);
      onClose();
    } catch (err) {
      alert(`上传头像失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    setSubmitting(true);
    try {
      await resetAvatar();
      setPickedFile(null);
      setPreviewUrl(null);
      onClose();
    } catch (err) {
      alert(`恢复默认头像失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
      <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Camera size={16} className="text-blue-400" />
            <span>设置个人头像</span>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-blue-600/20 border border-gray-700 flex items-center justify-center text-xl font-bold text-blue-300">
            {activeImg ? (
              <img src={activeImg} alt="头像预览" className="w-full h-full object-cover" />
            ) : (
              <span>{(currentUser.name || currentUser.username || '?').slice(0, 1)}</span>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1d24] hover:bg-[#242832] border border-gray-700 text-xs text-gray-200"
          >
            <Upload size={13} />
            <span>选择本地图片（PNG/JPG/WEBP，≤2MB）</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-800">
          <button
            type="button"
            disabled={submitting || !currentUser.avatarUrl}
            onClick={handleReset}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-40"
          >
            <RotateCcw size={12} />
            <span>恢复默认</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
            >
              取消
            </button>
            <button
              type="button"
              disabled={submitting || !pickedFile}
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium"
            >
              {submitting ? '保存中...' : '保存头像'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
