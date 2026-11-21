// src/pages/AICopilot/index.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  Send,
  Plus,
  Trash2,
  RefreshCw,
  FileText,
  Download,
  BookmarkPlus,
  Paperclip,
  Wifi,
  WifiOff,
  FolderOpen,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  X
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { API_BASE_URL } from '../../utils/api';

interface AiSession {
  id: string;
  user_id: string;
  project_name: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AiMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: {
    attachments?: string[];
    generatedDocx?: string;
    outputFolder?: string;
    error?: string;
    deepThinking?: boolean;
  };
  created_at?: string;
}

interface KbFileEntry {
  name: string;
  relPath: string;
  size: number;
  updatedAt?: string;
}

interface MemoryItem {
  filename: string;
  title: string;
  preview: string;
  content: string;
  size: number;
  updatedAt?: string;
}

interface AttachedFilePayload {
  name: string;
  content_base64: string;
  size: number;
}

function getTokenHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function splitThinkingContent(raw: string): { thinking: string; answer: string; isThinkingOpenDefault: boolean } {
  const text = raw || '';
  const closedMatch = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (closedMatch) {
    const thinking = (closedMatch[1] || '').trim();
    const answer = text.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    return { thinking, answer, isThinkingOpenDefault: false };
  }
  const openMatch = text.match(/<think>([\s\S]*)$/i);
  if (openMatch) {
    return {
      thinking: (openMatch[1] || '').trim(),
      answer: '',
      isThinkingOpenDefault: true
    };
  }
  return { thinking: '', answer: text, isThinkingOpenDefault: false };
}

function stripThinkingForSave(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

function AssistantBubble({
  content,
  isStreaming,
  meta,
  onDownload
}: {
  content: string;
  isStreaming: boolean;
  meta?: AiMessage['meta'];
  onDownload: (relPath: string, fileName: string) => void;
}) {
  const { thinking, answer, isThinkingOpenDefault } = splitThinkingContent(content);
  const [expanded, setExpanded] = useState<boolean>(isThinkingOpenDefault);

  useEffect(() => {
    if (isThinkingOpenDefault) {
      setExpanded(true);
    }
  }, [isThinkingOpenDefault]);

  return (
    <div className="max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap shadow-sm bg-[#252932] border border-gray-700/80 text-gray-200 space-y-2.5">
      {thinking && (
        <div className="rounded-xl bg-[#1b1e26] border border-indigo-500/30 overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between text-[11px] text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Sparkles size={12} className="text-indigo-400" />
              <span>{isStreaming && !answer ? '深度思考中...' : '深度思考过程'}</span>
            </span>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {expanded && (
            <div className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-800/80 whitespace-pre-wrap leading-relaxed">
              {thinking}
            </div>
          )}
        </div>
      )}

      <div>
        {answer ||
          (isStreaming && !thinking
            ? '正在本地推理生成中...'
            : !thinking
            ? content
            : '')}
      </div>

      {meta?.generatedDocx && (
        <div className="pt-2 border-t border-gray-700 flex items-center justify-between gap-3 text-[11px] text-emerald-300">
          <span>已生成 Word：{meta.generatedDocx}</span>
          {meta.outputFolder && (
            <button
              type="button"
              onClick={() => onDownload(meta.outputFolder!, meta.generatedDocx!)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200"
            >
              <Download size={12} />
              <span>下载</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AICopilot() {
  const { currentUser, setAllowedProjects } = useAuthStore();

  const allowedProjects: string[] = (() => {
    const list = currentUser?.allowedProjects;
    if (Array.isArray(list) && list.length > 0) return list;
    return ['通用公用库'];
  })();

  const [selectedProject, setSelectedProject] = useState<string>(allowedProjects[0]);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('正在检测本地算力状态...');
  const [modelInfo, setModelInfo] = useState<string>('qwen2.5:7b + bge-m3');

  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [messages, setMessages] = useState<AiMessage[]>([]);

  const [kbFiles, setKbFiles] = useState<KbFileEntry[]>([]);
  const [outputFiles, setOutputFiles] = useState<KbFileEntry[]>([]);
  const [lastSync, setLastSync] = useState<string>('尚未同步');
  const [chunkCount, setChunkCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [rightTab, setRightTab] = useState<'kb' | 'memory'>('kb');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState<boolean>(false);
  const [memModalOpen, setMemModalOpen] = useState<boolean>(false);
  const [memDraftTitle, setMemDraftTitle] = useState<string>('');
  const [memDraftContent, setMemDraftContent] = useState<string>('');
  const [isSavingMemory, setIsSavingMemory] = useState<boolean>(false);
  const [activePreviewMem, setActivePreviewMem] = useState<MemoryItem | null>(null);

  // 新建与删除项目弹窗状态
  const [isCreateProjOpen, setIsCreateProjOpen] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [isCreatingProj, setIsCreatingProj] = useState<boolean>(false);
  const [isDeleteProjOpen, setIsDeleteProjOpen] = useState<boolean>(false);
  const [isDeletingProj, setIsDeletingProj] = useState<boolean>(false);

  const [inputText, setInputText] = useState<string>('');
  const [attachments, setAttachments] = useState<AttachedFilePayload[]>([]);
  const [deepThinking, setDeepThinking] = useState<boolean>(false);
  const [generateDocx, setGenerateDocx] = useState<boolean>(false);
  const [docxTitle, setDocxTitle] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3600);
  }, []);

  useEffect(() => {
    if (!allowedProjects.includes(selectedProject)) {
      setSelectedProject(allowedProjects[0]);
    }
  }, [allowedProjects, selectedProject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const checkComputeStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ai/status?project=${encodeURIComponent(selectedProject)}`,
        { headers: getTokenHeaders() }
      );
      if (!res.ok) {
        setIsOnline(false);
        setStatusMessage('本地算力离线');
        return;
      }
      const data = await res.json();
      const online = Boolean(data.online);
      setIsOnline(online);
      setStatusMessage(online ? '本地算力在线' : '本地算力离线');
      if (data.chat_model || data.embed_model) {
        setModelInfo(`${data.chat_model || 'qwen2.5:7b'} · ${data.embed_model || 'bge-m3'}`);
      }
    } catch {
      setIsOnline(false);
      setStatusMessage('本地算力离线');
    }
  }, [selectedProject]);

  const loadKbTree = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ai/kb/tree?project=${encodeURIComponent(selectedProject)}`,
        { headers: getTokenHeaders() }
      );
      if (!res.ok) return;
      const data = await res.json();
      setKbFiles(Array.isArray(data.kbFiles) ? data.kbFiles : []);
      setOutputFiles(Array.isArray(data.outputFiles) ? data.outputFiles : []);
      setLastSync(data.lastSync || '尚未同步');
      setChunkCount(Number(data.chunkCount || 0));
    } catch {
      // 离线时不中断界面
    }
  }, [selectedProject]);

  const loadMemories = useCallback(async () => {
    setIsLoadingMemories(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ai/memories?project=${encodeURIComponent(selectedProject)}`,
        { headers: getTokenHeaders() }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.detail || '加载我的记忆失败');
        return;
      }
      const rawList = Array.isArray(data.memories)
        ? data.memories
        : Array.isArray(data.items)
        ? data.items
        : [];
      const list: MemoryItem[] = rawList.map((m: any) => ({
        filename: String(m.filename || m.file_name || m.name || ''),
        title: String(m.title || m.filename || m.file_name || m.name || '未命名记忆'),
        preview: String(m.preview || m.content || '').slice(0, 160),
        content: String(m.content || ''),
        size: Number(m.size || 0),
        updatedAt: m.updatedAt || m.updated_at || undefined
      }));
      setMemories(list);
    } catch {
      showToast('err', '加载我的记忆网络异常');
    } finally {
      setIsLoadingMemories(false);
    }
  }, [selectedProject, showToast]);

  const loadMessages = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ai/sessions/${encodeURIComponent(sessionId)}/messages`,
        { headers: getTokenHeaders() }
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      // ignore
    }
  }, []);

  const handleCreateSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ project_name: selectedProject })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast('err', err.detail || '创建会话失败');
        return;
      }
      const data = await res.json();
      if (data.session) {
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        setMessages([]);
      }
    } catch {
      showToast('err', '创建会话网络异常');
    }
  }, [selectedProject, showToast]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ai/sessions?project=${encodeURIComponent(selectedProject)}`,
        { headers: getTokenHeaders() }
      );
      if (!res.ok) return;
      const data = await res.json();
      const list: AiSession[] = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(list);
      if (list.length > 0) {
        const currentExists = list.some((s) => s.id === activeSessionId);
        const targetId = currentExists ? activeSessionId : list[0].id;
        setActiveSessionId(targetId);
        await loadMessages(targetId);
      } else {
        setActiveSessionId('');
        setMessages([]);
      }
    } catch {
      // ignore
    }
  }, [selectedProject, activeSessionId, loadMessages]);

  useEffect(() => {
    checkComputeStatus();
    loadSessions();
    loadKbTree();
    loadMemories();
    const timer = window.setInterval(checkComputeStatus, 15000);
    return () => window.clearInterval(timer);
  }, [selectedProject, checkComputeStatus, loadSessions, loadKbTree, loadMemories]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newProjectName.trim();
    if (!clean) return;
    if (!isOnline) {
      showToast('err', '本地算力离线，无法在本地创建项目目录');
      return;
    }
    setIsCreatingProj(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/projects/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ project_name: clean })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.detail || '创建项目失败');
        return;
      }
      if (Array.isArray(data.allowed_projects)) {
        setAllowedProjects(data.allowed_projects);
      } else if (!allowedProjects.includes(clean)) {
        setAllowedProjects([...allowedProjects, clean]);
      }
      setSelectedProject(clean);
      setNewProjectName('');
      setIsCreateProjOpen(false);
      showToast('ok', `已创建项目「${clean}」`);
    } catch {
      showToast('err', '创建项目网络异常');
    } finally {
      setIsCreatingProj(false);
    }
  };

  const handleConfirmDeleteProject = async () => {
    if (selectedProject === '通用公用库') return;
    if (!isOnline) {
      showToast('err', '本地算力离线，无法将项目移入回收站');
      return;
    }
    setIsDeletingProj(true);
    const targetName = selectedProject;
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/projects/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ project_name: targetName })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.detail || '删除项目失败');
        return;
      }
      const nextAllowed = Array.isArray(data.allowed_projects) && data.allowed_projects.length > 0
        ? data.allowed_projects
        : allowedProjects.filter((p) => p !== targetName).length > 0
        ? allowedProjects.filter((p) => p !== targetName)
        : ['通用公用库'];
      setAllowedProjects(nextAllowed);
      const fallbackProj = nextAllowed[0] || '通用公用库';
      setSelectedProject(fallbackProj);
      setIsDeleteProjOpen(false);
      showToast('ok', `已将项目「${targetName}」移入本地回收站`);
    } catch {
      showToast('err', '删除项目网络异常');
    } finally {
      setIsDeletingProj(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: getTokenHeaders()
      });
      if (res.ok) {
        showToast('ok', '会话已删除');
        await loadSessions();
      }
    } catch {
      showToast('err', '删除会话失败');
    }
  };

  const handleDeleteMessagePair = async (messageId: string) => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ai/sessions/${encodeURIComponent(activeSessionId)}/messages/delete-pair`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
          body: JSON.stringify({ message_id: messageId })
        }
      );
      if (res.ok) {
        await loadMessages(activeSessionId);
        showToast('ok', '已成对移除该轮问答上下文');
      }
    } catch {
      showToast('err', '移除上下文失败');
    }
  };

  const handleSyncKb = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/kb/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ project_name: selectedProject })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.detail || '本地算力离线，无法同步知识库');
        setIsOnline(false);
        setStatusMessage('本地算力离线');
        return;
      }
      setIsOnline(true);
      setStatusMessage('本地算力在线');
      setLastSync(data.lastSync || '刚刚');
      setChunkCount(Number(data.chunkCount || 0));
      await loadKbTree();
      showToast('ok', `知识库同步完成（共 ${data.chunkCount || 0} 个向量切片）`);
    } catch {
      showToast('err', '本地算力离线');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSoftDeleteKbFile = async (relPath: string, fileName: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/kb/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ project_name: selectedProject, rel_path: relPath })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.detail || '删除失败');
        return;
      }
      await loadKbTree();
      showToast('ok', `已将「${fileName}」移至本地防丢回收站`);
    } catch {
      showToast('err', '本地算力离线，删除操作失败');
    }
  };

  const handleDownloadFile = async (relPath: string, fileName: string) => {
    try {
      const url = `${API_BASE_URL}/api/ai/kb/download?project=${encodeURIComponent(
        selectedProject
      )}&rel_path=${encodeURIComponent(relPath)}`;
      const res = await fetch(url, { headers: getTokenHeaders() });
      if (!res.ok) {
        showToast('err', '下载失败或本地算力离线');
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      showToast('err', '下载文件异常');
    }
  };

  const handleSaveToNote = async (rawContent: string, titleHint?: string) => {
    const cleanContent = stripThinkingForSave(rawContent) || rawContent;
    const cleanTitle = (titleHint || `${selectedProject} - AI 整理总结`).slice(0, 60);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/save-to-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ title: cleanTitle, content: cleanContent })
      });
      if (!res.ok) {
        showToast('err', '转存笔记失败');
        return;
      }
      showToast('ok', `已转存至在线笔记：「${cleanTitle}」`);
    } catch {
      showToast('err', '转存笔记网络异常');
    }
  };

  const openSaveMemoryModal = (rawContent: string = '', titleHint?: string) => {
    setMemDraftTitle((titleHint || `${selectedProject} - 记忆`).slice(0, 60));
    setMemDraftContent(stripThinkingForSave(rawContent));
    setActivePreviewMem(null);
    setMemModalOpen(true);
  };

  const handleConfirmSaveMemory = async () => {
    const title = memDraftTitle.trim() || `${selectedProject} - 记忆`;
    const content = stripThinkingForSave(memDraftContent);
    if (!content) {
      showToast('err', '记忆内容不能为空');
      return;
    }
    setIsSavingMemory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/memories/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ project_name: selectedProject, title, content })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.detail || '保存记忆失败');
        return;
      }
      setMemModalOpen(false);
      setMemDraftTitle('');
      setMemDraftContent('');
      await loadMemories();
      showToast('ok', `已记入记忆：「${title}」`);
    } catch {
      showToast('err', '保存记忆网络异常');
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (mem: MemoryItem) => {
    if (!mem.filename) {
      showToast('err', '记忆文件标识缺失，无法归档');
      return;
    }
    if (!window.confirm(`确认归档删除记忆「${mem.title}」？`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/memories/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ project_name: selectedProject, filename: mem.filename })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.detail || '归档删除记忆失败');
        return;
      }
      if (activePreviewMem?.filename === mem.filename) {
        setActivePreviewMem(null);
      }
      await loadMemories();
      showToast('ok', `已归档删除记忆「${mem.title}」`);
    } catch {
      showToast('err', '归档删除记忆网络异常');
    }
  };

  const handlePickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const added: AttachedFilePayload[] = [];
    for (const f of files.slice(0, 5)) {
      if (f.size > 12 * 1024 * 1024) {
        showToast('err', `文件 ${f.name} 超过 12MB 限制`);
        continue;
      }
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      added.push({
        name: f.name,
        content_base64: btoa(binary),
        size: f.size
      });
    }
    setAttachments((prev) => [...prev, ...added].slice(0, 5));
    e.target.value = '';
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    if (!isOnline) {
      showToast('err', '本地算力离线，请先启动本地算力服务');
      return;
    }

    let currentSid = activeSessionId;
    if (!currentSid) {
      const createRes = await fetch(`${API_BASE_URL}/api/ai/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({ project_name: selectedProject })
      });
      if (!createRes.ok) {
        showToast('err', '无法创建会话');
        return;
      }
      const created = await createRes.json();
      currentSid = created.session?.id || '';
      setActiveSessionId(currentSid);
      if (created.session) {
        setSessions((prev) => [created.session, ...prev]);
      }
    }

    const tempUserId = `tmp_u_${Date.now()}`;
    const tempAsstId = `tmp_a_${Date.now()}`;
    const attNames = attachments.map((a) => a.name);
    const displayUserText = trimmed || `[上传附件: ${attNames.join(', ')}]`;
    const activeThinking = deepThinking;

    setInputText('');
    const sendingAttachments = [...attachments];
    setAttachments([]);
    setIsStreaming(true);

    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        session_id: currentSid,
        role: 'user',
        content: displayUserText,
        meta: attNames.length > 0 ? { attachments: attNames } : undefined
      },
      {
        id: tempAsstId,
        session_id: currentSid,
        role: 'assistant',
        content: '',
        meta: { deepThinking: activeThinking }
      }
    ]);

    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTokenHeaders() },
        body: JSON.stringify({
          session_id: currentSid,
          project_name: selectedProject,
          content: trimmed,
          attachments: sendingAttachments.map((a) => ({
            name: a.name,
            content_base64: a.content_base64
          })),
          generate_docx: generateDocx,
          docx_title: docxTitle.trim() || undefined,
          deep_thinking: activeThinking
        })
      });

      if (!res.ok || !res.body) {
        throw new Error('本地算力离线');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'delta') {
              const delta = String(evt.content || '');
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAsstId ? { ...m, content: m.content + delta } : m
                )
              );
            } else if (evt.type === 'error') {
              if (evt.offline) {
                setIsOnline(false);
                setStatusMessage('本地算力离线');
              }
              showToast('err', evt.message || '本地算力离线');
            } else if (evt.type === 'done' && evt.generatedDocx) {
              showToast('ok', `已生成 Word 文档：${evt.generatedDocx}`);
              await loadKbTree();
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }

      await loadSessions();
      await loadMessages(currentSid);
    } catch {
      setIsOnline(false);
      setStatusMessage('本地算力离线');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAsstId ? { ...m, content: '[本地算力离线]' } : m
        )
      );
      showToast('err', '本地算力离线');
    } finally {
      setIsStreaming(false);
      setGenerateDocx(false);
      setDocxTitle('');
    }
  };

  return (
    <div className="flex h-full w-full bg-[#1e2128] text-gray-200 overflow-hidden relative">
      {toast && (
        <div
          className={`fixed top-4 right-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium shadow-xl border ${
            toast.type === 'ok'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* 左侧栏：项目沙盒切换 + 新建/删除项目 + 会话列表 */}
      <aside className="w-64 bg-[#191c22] border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-3.5 border-b border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <Bot size={18} className="text-blue-400" />
              <span>DCM-助手</span>
            </div>
            <span
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                isOnline
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}
            >
              {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
              <span>{isOnline ? '在线' : '离线'}</span>
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-gray-400">当前项目知识库沙盒</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsCreateProjOpen(true)}
                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30"
                  title="新建知识库项目"
                >
                  <FolderPlus size={11} />
                  <span>新建</span>
                </button>
                {selectedProject !== '通用公用库' && (
                  <button
                    type="button"
                    onClick={() => setIsDeleteProjOpen(true)}
                    className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 border border-rose-500/30"
                    title="删除当前项目（移入本地回收站）"
                  >
                    <Trash2 size={11} />
                    <span>删项目</span>
                  </button>
                )}
              </div>
            </div>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full bg-[#242832] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {allowedProjects.map((proj) => (
                <option key={proj} value={proj}>
                  {proj}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleCreateSession}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            <Plus size={14} />
            <span>新建对话会话</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center text-xs text-gray-500 py-8">暂无历史会话</div>
          ) : (
            sessions.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    loadMessages(s.id);
                  }}
                  className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                    active
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                      : 'text-gray-300 hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare size={13} className="shrink-0 opacity-75" />
                    <span className="truncate">{s.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-rose-400 p-1"
                    title="删除会话"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 中央主区 */}
      <section className="flex-1 flex flex-col min-w-0 h-full">
        {!isOnline && (
          <div className="bg-rose-950/70 border-b border-rose-500/40 px-4 py-2.5 flex items-center justify-between text-xs text-rose-200">
            <div className="flex items-center gap-2">
              <WifiOff size={15} className="text-rose-400 shrink-0" />
              <span>
                <strong>本地算力离线</strong>：未检测到本地工作站 Agent 与 Ollama 隧道连接，问答与知识库同步暂不可用。
              </span>
            </div>
            <button
              type="button"
              onClick={checkComputeStatus}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-100 shrink-0"
            >
              重新探活
            </button>
          </div>
        )}

        <header className="h-12 px-4 border-b border-gray-800 flex items-center justify-between bg-[#1e2128] shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <span className="font-semibold text-white">{selectedProject}</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">{statusMessage}</span>
            <span className="hidden sm:inline text-gray-500">({modelInfo})</span>
          </div>
          <div className="text-[11px] text-gray-400">
            向量切片：{chunkCount} · 上次同步：{lastSync}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 max-w-md mx-auto">
              <Bot size={36} className="text-blue-400 mb-3 opacity-80" />
              <p className="text-sm font-medium text-gray-200 mb-1">
                DCM-助手已挂载项目【{selectedProject}】
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                可新建或删除项目（删除项目自动移入本地回收站），开启“深度思考”进行多步拆解分析，结合本地知识库与附件进行问答，支持生成 Word 报告、成对删除记忆裁剪与一键转存笔记。
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {isUser ? (
                    <div className="max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap shadow-sm bg-blue-600/25 border border-blue-500/35 text-blue-50">
                      {msg.content}
                      {msg.meta?.attachments && msg.meta.attachments.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/10 text-[11px] text-blue-200">
                          附件：{msg.meta.attachments.join('、')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <AssistantBubble
                      content={msg.content}
                      isStreaming={isStreaming && msg.id.startsWith('tmp_a_')}
                      meta={msg.meta}
                      onDownload={handleDownloadFile}
                    />
                  )}

                  {!msg.id.startsWith('tmp_') && (
                    <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-gray-500">
                      {!isUser && msg.content && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveToNote(msg.content)}
                            className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
                            title="转存为在线笔记"
                          >
                            <BookmarkPlus size={12} />
                            <span>转存笔记</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openSaveMemoryModal(msg.content)}
                            className="inline-flex items-center gap-1 hover:text-indigo-400 transition-colors"
                            title="记入我的记忆"
                          >
                            <FileText size={12} />
                            <span>记入记忆</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteMessagePair(msg.id)}
                        className="inline-flex items-center gap-1 hover:text-rose-400 transition-colors"
                        title="成对删除该轮问答并裁剪记忆"
                      >
                        <Trash2 size={12} />
                        <span>成对删除</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部输入区 */}
        <div className="p-3.5 border-t border-gray-800 bg-[#191c22] space-y-2.5 shrink-0">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((att, idx) => (
                <span
                  key={`${att.name}_${idx}`}
                  className="inline-flex items-center gap-1.5 bg-[#262b36] border border-gray-700 rounded-lg px-2.5 py-1 text-[11px] text-gray-200"
                >
                  <FileText size={12} className="text-blue-400" />
                  <span>{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-gray-400 hover:text-rose-400"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setDeepThinking((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
                  deepThinking
                    ? 'bg-indigo-600/25 border-indigo-400/50 text-indigo-200 font-medium'
                    : 'bg-[#242832] border-gray-700/80 text-gray-300 hover:bg-[#2c313d]'
                }`}
                title="切换深度思考模式"
              >
                <Sparkles size={12} className={deepThinking ? 'text-indigo-300' : 'text-gray-400'} />
                <span>深度思考：{deepThinking ? '已开启' : '已关闭'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handlePickFiles}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#242832] hover:bg-[#2c313d] text-gray-200 border border-gray-700/80"
              >
                <Paperclip size={12} />
                <span>上传附件解析</span>
              </button>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={generateDocx}
                  onChange={(e) => setGenerateDocx(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-blue-500"
                />
                <span>自动生成 Word 报告至输出文件夹</span>
              </label>

              {generateDocx && (
                <input
                  type="text"
                  value={docxTitle}
                  onChange={(e) => setDocxTitle(e.target.value)}
                  placeholder="报告标题（可选）"
                  className="bg-[#242832] border border-gray-700 rounded-lg px-2 py-0.5 text-xs text-white w-40 focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isOnline
                  ? `向【${selectedProject}】知识库提问或总结需求（Enter 发送，Shift+Enter 换行）...`
                  : '本地算力离线，暂无法发送提问'
              }
              className="flex-1 bg-[#242832] border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              disabled={isStreaming || !isOnline}
              onClick={handleSend}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-400 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Send size={14} />
              <span>{isStreaming ? '生成中' : '发送'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 右侧栏 */}
      <aside className="hidden lg:flex w-72 bg-[#191c22] border-l border-gray-800 flex-col shrink-0">
        <div className="p-3.5 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            {rightTab === 'kb' ? (
              <FolderOpen size={15} className="text-amber-400" />
            ) : (
              <Sparkles size={15} className="text-indigo-400" />
            )}
            <span>{rightTab === 'kb' ? '项目知识库与输出' : '我的记忆'}</span>
          </div>
          {rightTab === 'kb' ? (
            <button
              type="button"
              disabled={isSyncing || !isOnline}
              onClick={handleSyncKb}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 text-blue-300 border border-blue-500/30 text-[11px]"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? '同步中' : '同步目录'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openSaveMemoryModal()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px]"
            >
              <Plus size={12} />
              <span>新建记忆</span>
            </button>
          )}
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-gray-800">
          <button
            type="button"
            onClick={() => setRightTab('kb')}
            className={`flex-1 py-1.5 rounded-lg text-[11px] transition-colors ${
              rightTab === 'kb'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 font-medium'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#232731]'
            }`}
          >
            知识库/输出
          </button>
          <button
            type="button"
            onClick={() => {
              setRightTab('memory');
              loadMemories();
            }}
            className={`flex-1 py-1.5 rounded-lg text-[11px] transition-colors ${
              rightTab === 'memory'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 font-medium'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#232731]'
            }`}
          >
            我的记忆（{memories.length}）
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
          {rightTab === 'kb' ? (
            <>
              <div>
                <div className="text-[11px] font-medium text-gray-400 mb-2">
                  知识库文件（{kbFiles.length}）
                </div>
                {kbFiles.length === 0 ? (
                  <div className="text-[11px] text-gray-500 py-2">暂无知识库文件</div>
                ) : (
                  <div className="space-y-1.5">
                    {kbFiles.map((f) => (
                      <div
                        key={f.relPath}
                        className="flex items-center justify-between gap-2 bg-[#232731] rounded-lg px-2.5 py-1.5 border border-gray-800"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-gray-200 text-[11px]" title={f.relPath}>
                            {f.name}
                          </div>
                          <div className="text-[10px] text-gray-500">{formatBytes(f.size)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSoftDeleteKbFile(f.relPath, f.name)}
                          className="text-gray-500 hover:text-rose-400 p-1 shrink-0"
                          title="移入本地防丢回收站"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-medium text-gray-400 mb-2">
                  输出文件夹（{outputFiles.length}）
                </div>
                {outputFiles.length === 0 ? (
                  <div className="text-[11px] text-gray-500 py-2">暂无生成的报告文件</div>
                ) : (
                  <div className="space-y-1.5">
                    {outputFiles.map((f) => (
                      <div
                        key={f.relPath}
                        className="flex items-center justify-between gap-2 bg-[#232731] rounded-lg px-2.5 py-1.5 border border-gray-800"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-emerald-300 text-[11px]" title={f.relPath}>
                            {f.name}
                          </div>
                          <div className="text-[10px] text-gray-500">{formatBytes(f.size)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(f.relPath, f.name)}
                          className="text-emerald-400 hover:text-emerald-300 p-1 shrink-0"
                          title="下载文件"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <div className="text-[11px] font-medium text-gray-400 mb-2 flex items-center justify-between">
                <span>记忆文件（{memories.length}）</span>
                <button
                  type="button"
                  onClick={loadMemories}
                  disabled={isLoadingMemories}
                  className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-300 disabled:opacity-40"
                  title="刷新记忆列表"
                >
                  <RefreshCw size={11} className={isLoadingMemories ? 'animate-spin' : ''} />
                  <span>刷新</span>
                </button>
              </div>
              {isLoadingMemories ? (
                <div className="text-[11px] text-gray-500 py-2">正在加载记忆...</div>
              ) : memories.length === 0 ? (
                <div className="text-[11px] text-gray-500 py-2">暂无记忆，可点击右上角新建或记入 AI 回复</div>
              ) : (
                <div className="space-y-1.5">
                  {memories.map((mem) => (
                    <div
                      key={mem.filename || mem.title}
                      onClick={() => setActivePreviewMem(mem)}
                      className="bg-[#232731] rounded-lg px-2.5 py-1.5 border border-gray-800 cursor-pointer hover:border-indigo-500/40 transition-colors"
                      title="点击查看记忆全文"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-gray-200 text-[11px]" title={mem.filename || mem.title}>
                            {mem.title}
                          </div>
                          <div className="truncate text-[10px] text-gray-500">
                            {mem.preview || '暂无预览内容'}
                          </div>
                          <div className="text-[10px] text-gray-600">
                            {formatBytes(mem.size)}
                            {mem.updatedAt ? ` · ${mem.updatedAt}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMemory(mem);
                          }}
                          className="text-gray-500 hover:text-rose-400 p-1 shrink-0"
                          title="归档删除记忆"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* 新建项目弹窗 */}
      {isCreateProjOpen && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateProject}
            className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">新建项目知识库</h3>
              <button type="button" onClick={() => setIsCreateProjOpen(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">项目名称</label>
              <input
                type="text"
                required
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="例如：RPA模块分析"
                className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateProjOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isCreatingProj}
                className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                {isCreatingProj ? '创建中...' : '确认创建'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 删除项目确认弹窗（移入本地回收站） */}
      {isDeleteProjOpen && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400 text-sm font-bold">
              <Trash2 size={16} />
              <span>确认删除项目「{selectedProject}」？</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              该项目目录及其中文件、输出报告将被完整移入本地回收站（<span className="font-mono text-gray-400">_RecycleBin\Projects</span>），并清理对应向量索引。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDeleteProjOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDeletingProj}
                onClick={handleConfirmDeleteProject}
                className="px-4 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium"
              >
                {isDeletingProj ? '移入回收站中...' : '确认移入回收站'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建/编辑记忆弹窗 */}
      {memModalOpen && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmSaveMemory();
            }}
            className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-400" />
                <span>记入我的记忆</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setMemModalOpen(false);
                  setMemDraftTitle('');
                  setMemDraftContent('');
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">记忆标题</label>
              <input
                type="text"
                value={memDraftTitle}
                onChange={(e) => setMemDraftTitle(e.target.value)}
                placeholder={`${selectedProject} - 记忆`}
                className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">记忆内容</label>
              <textarea
                rows={10}
                value={memDraftContent}
                onChange={(e) => setMemDraftContent(e.target.value)}
                placeholder="输入需要长期保留的要点、结论或 AI 回复内容..."
                className="w-full bg-[#1a1d24] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 resize-none focus:outline-none focus:border-indigo-500"
              />
              <p className="mt-1 text-[10px] text-gray-500">
                保存前会自动剥离未闭合的 &lt;think&gt; 思考草稿。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMemModalOpen(false);
                  setMemDraftTitle('');
                  setMemDraftContent('');
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSavingMemory}
                className="px-4 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium"
              >
                {isSavingMemory ? '保存中...' : '确认记入'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 记忆全文预览弹窗 */}
      {activePreviewMem && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-[#252830] border border-gray-700 rounded-2xl w-full max-w-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate" title={activePreviewMem.title}>
                  {activePreviewMem.title}
                </h3>
                <p className="mt-1 text-[10px] text-gray-500 truncate" title={activePreviewMem.filename}>
                  {activePreviewMem.filename} · {formatBytes(activePreviewMem.size)}
                  {activePreviewMem.updatedAt ? ` · ${activePreviewMem.updatedAt}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePreviewMem(null)}
                className="text-gray-400 hover:text-white shrink-0"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto bg-[#1a1d24] border border-gray-800 rounded-xl px-3.5 py-3 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
              {activePreviewMem.content || '暂无记忆内容'}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDeleteMemory(activePreviewMem)}
                className="px-3 py-1.5 rounded-lg text-xs text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30"
              >
                归档删除
              </button>
              <button
                type="button"
                onClick={() => setActivePreviewMem(null)}
                className="px-4 py-1.5 rounded-lg text-xs bg-gray-700 hover:bg-gray-600 text-white font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}