// src/pages/AICopilot/index.tsx
import { useState, useRef, useEffect } from 'react';
import { 
  Bot, Send, RefreshCw, Sparkles, Folder, FileText, 
  FolderOutput, CheckCircle2, Clock, Terminal, ChevronRight,
  Paperclip, X, Trash2, CheckSquare, Square, AlertCircle,
  History, MessageSquare, Plus
} from 'lucide-react';
import { useChatStore, type Message, type AttachedFile } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';

// 字节单位格式化
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default function AICopilot() {
  const { currentUser } = useAuthStore();
  // 引入会话管理相关字段与方法
  const { 
    messages, isThinking, selectedProject, syncStatus, lastSyncTime, contextTurnCount,
    sessions, currentSessionId, createNewSession, switchSession, deleteSession,
    setThinking, setSelectedProject, setSyncStatus, addMessage, deleteMessage, batchDeleteMessages, clearAllMessages
  } = useChatStore();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false); // 控制历史抽屉显隐

  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);

  // 通用确认弹窗状态 (用于对话单条删除、批量删除及历史会话删除)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 消息自动滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // 模拟即时同步
  const handleManualSync = () => {
    setSyncStatus('syncing');
    setTimeout(() => {
      setSyncStatus('synced', new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }, 1000);
  };

  // 处理附件上传选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles: AttachedFile[] = Array.from(e.target.files).map((f) => ({
        id: `att_${Date.now()}_${Math.random()}`,
        name: f.name,
        size: f.size
      }));
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // 1. 先定义发送消息
  const handleSendMessage = () => {
    if ((!inputText.trim() && attachedFiles.length === 0) || isThinking) return;

    const userPrompt = inputText.trim();
    const currentAttachments = [...attachedFiles];

    const userMsg: Message = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: userPrompt || (currentAttachments.length > 0 ? '【发送了附件资料】' : ''),
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      attachedFiles: currentAttachments.length > 0 ? currentAttachments : undefined
    };

    addMessage(userMsg);
    setInputText('');
    setAttachedFiles([]);
    setThinking(true);

    // 重置文本框高度
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // 模拟本地大模型推理与工具调用写入
    setTimeout(() => {
      const isGenerateRequest = userPrompt.includes('大纲') || userPrompt.includes('总结') || userPrompt.includes('输出');
      
      const aiResponse: Message = {
        id: `msg_ai_${Date.now()}`,
        sender: 'ai',
        text: isGenerateRequest
          ? `已成功检索【${selectedProject}】目录及您上传的临时文件。已为您提取核心要点，并在【${selectedProject}】的专属输出文件夹中生成了 Word 文档。`
          : `已在【${selectedProject}】知识库中完成检索：项目关注要点清晰，模型随时可调用写入工具导出总结报告。`,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
        generatedFile: isGenerateRequest ? {
          name: `${selectedProject}_分析大纲_V1.docx`,
          path: `${selectedProject} / 输出文件夹 /`,
          size: '26.8 KB'
        } : undefined
      };

      addMessage(aiResponse);
      setThinking(false);
    }, 1000);
  };

  // 2. 后定义快捷键监听：Enter 发送，Shift + Enter 换行
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 批量管理勾选切换
  const toggleSelectMessage = (id: string) => {
    setSelectedMsgIds((prev) => 
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedMsgIds.length === messages.filter(m => m.sender !== 'system').length) {
      setSelectedMsgIds([]);
    } else {
      setSelectedMsgIds(messages.filter(m => m.sender !== 'system').map(m => m.id));
    }
  };

  // 执行批量删除
  const handleExecuteBatchDelete = () => {
    if (selectedMsgIds.length === 0) return;
    batchDeleteMessages(selectedMsgIds);
    setSelectedMsgIds([]);
    setIsManageMode(false);
  };

  return (
    <div className="h-full w-full bg-[#1e2128] text-gray-200 flex overflow-hidden select-none">
      
      {/* 隐藏的文件输入组件 */}
      <input 
        type="file" 
        ref={fileInputRef} 
        multiple 
        className="hidden" 
        onChange={handleFileChange} 
      />

      {/* 左侧历史会话抽屉（可折叠） */}
      {isHistoryOpen && (
        <div className="w-64 bg-[#1a1c23] border-r border-gray-800 flex flex-col h-full shrink-0 z-10 animate-in slide-in-from-left duration-200">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
              <MessageSquare size={14} className="text-blue-400" />
              历史对话记录
            </span>
            <button onClick={() => setIsHistoryOpen(false)} className="text-gray-500 hover:text-white">
              <X size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => switchSession(s.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-colors border ${
                    isActive
                      ? 'bg-blue-600/15 border-blue-500/40 text-white'
                      : 'bg-[#21242c] border-transparent text-gray-400 hover:bg-[#282c37] hover:text-gray-200'
                  }`}
                >
                  <div className="truncate pr-2 flex-1">
                    <div className="font-medium truncate text-gray-200">{s.title}</div>
                    <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                      <span>{s.updatedAt}</span>
                      <span>·</span>
                      <span className="text-blue-400/80">【{s.project}】</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmModal({
                        isOpen: true,
                        title: '确认删除历史会话？',
                        description: `确定要永久移除会话【${s.title}】吗？该会话的所有对话与临时状态将被清空。`,
                        confirmText: '确认删除',
                        onConfirm: () => {
                          deleteSession(s.id);
                          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                        }
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-opacity"
                    title="删除此会话"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 左侧主体：AI 对话流控制台 */}
      <div className="flex-1 flex flex-col h-full border-r border-gray-800 overflow-hidden">

        {/* 对话窗口头部导航 */}
        <header className="h-14 bg-[#2a2d35]/60 border-b border-gray-700/60 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            {/* 历史会话抽屉切换按钮 */}
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                isHistoryOpen
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-[#1e2128] border-gray-700 text-gray-300 hover:text-white hover:bg-[#323640]'
              }`}
              title="查看历史对话记录"
            >
              <History size={14} />
              <span>历史 ({sessions.length})</span>
            </button>

            {/* 开启新会话按钮 */}
            <button
              onClick={() => createNewSession()}
              className="flex items-center gap-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 px-2.5 py-1.5 rounded-lg transition-colors"
              title="保留当前对话并开启一个全新的会话"
            >
              <Plus size={14} />
              <span>新会话</span>
            </button>

            <div className="h-4 w-px bg-gray-700 mx-1" />

            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">本地 AI 智能体 (Agent)</span>
                <span className="text-[10px] bg-green-900/40 text-green-400 border border-green-700/40 px-1.5 py-0.5 rounded">Ollama 活跃</span>
              </div>
              <p className="text-[11px] text-gray-400">
                上下文记忆：<span className="text-blue-400 font-medium">{contextTurnCount}</span> 条有效记忆 · 支持文档自生成
              </p>
            </div>
          </div>

          {/* 右侧操作栏：管理模式切换 / 批量删除 */}
          <div className="flex items-center gap-3">
            {isManageMode ? (
              <div className="flex items-center gap-2 bg-[#1e2128] border border-gray-700 rounded-lg px-2.5 py-1">
                <button 
                  onClick={handleSelectAll} 
                  className="flex items-center gap-1 text-xs text-gray-300 hover:text-white"
                >
                  {selectedMsgIds.length > 0 && selectedMsgIds.length === messages.filter(m => m.sender !== 'system').length ? (
                    <CheckSquare size={14} className="text-blue-400" />
                  ) : (
                    <Square size={14} />
                  )}
                  <span>全选</span>
                </button>
                <span className="text-gray-600 text-xs">|</span>
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: '确认批量删除对话？',
                      description: `已选择 ${selectedMsgIds.length} 项。删除操作将自动联动补齐成对的问答，并重构 AI 历史记忆库。`,
                      confirmText: '确认批量删除',
                      onConfirm: () => {
                        handleExecuteBatchDelete();
                        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                      }
                    });
                  }}
                  disabled={selectedMsgIds.length === 0}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:text-gray-600"
                >
                  <Trash2 size={13} />
                  <span>删除 ({selectedMsgIds.length})</span>
                </button>
                <span className="text-gray-600 text-xs">|</span>
                <button 
                  onClick={() => { setIsManageMode(false); setSelectedMsgIds([]); }}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  完成
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsManageMode(true)}
                  className="text-xs text-gray-400 hover:text-gray-200 bg-[#1e2128] border border-gray-700 px-2.5 py-1 rounded transition-colors"
                >
                  管理对话
                </button>
                {/* Admin 与 AE (普通用户) 均可开启新会话/清空历史，仅 Guest 禁用 */}
                {currentUser.role !== 'guest' && (
                  <button 
                    onClick={clearAllMessages}
                    className="text-xs text-red-400 hover:text-red-300 bg-[#1e2128] border border-gray-700/60 px-2 py-1 rounded transition-colors"
                    title="清空当前会话上下文并重置 AI 记忆"
                  >
                    清空历史
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs text-gray-400 pl-2 border-l border-gray-700">
              <Terminal size={14} className="text-gray-500" />
              <span>沙盒:</span>
              <span className="text-blue-400 font-semibold bg-blue-950/40 px-2 py-0.5 rounded border border-blue-800/40">
                {selectedProject}
              </span>
            </div>
          </div>
        </header>

        {/* 聊天消息流 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => {
            // 系统通知气泡（例如上下文重置提示）
            if (msg.sender === 'system') {
              return (
                <div key={msg.id} className="flex justify-center my-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-yellow-400/80 bg-yellow-950/30 border border-yellow-700/40 px-3 py-1.5 rounded-full">
                    <AlertCircle size={13} />
                    <span>{msg.text}</span>
                  </div>
                </div>
              );
            }

            const isSelected = selectedMsgIds.includes(msg.id);

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl group relative ${
                  msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                {/* 批量管理多选框 */}
                {isManageMode && (
                  <button 
                    onClick={() => toggleSelectMessage(msg.id)}
                    className="self-center p-1 text-gray-400 hover:text-white"
                  >
                    {isSelected ? (
                      <CheckSquare size={16} className="text-blue-400" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                )}

                {/* 用户 / AI 头像 */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white'
                }`}>
                  {msg.sender === 'user' ? 'AE' : <Sparkles size={16} />}
                </div>

                <div className={`space-y-1.5 max-w-[85%] ${msg.sender === 'user' ? 'items-end' : ''}`}>
                  
                  {/* 用户随对话附带的文件展示卡片 */}
                  {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                    <div className={`flex flex-wrap gap-1.5 mb-1 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                      {msg.attachedFiles.map((file) => (
                        <div key={file.id} className="flex items-center gap-1 bg-[#16181d] border border-gray-700 px-2 py-1 rounded-md text-[11px] text-gray-300">
                          <Paperclip size={12} className="text-blue-400" />
                          <span className="truncate max-w-[150px]">{file.name}</span>
                          <span className="text-gray-500 text-[10px]">({formatBytes(file.size)})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 消息文本正文 */}
                  <div className={`p-3.5 rounded-2xl shadow-md text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    msg.sender === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-[#2a2d35] text-gray-200 border border-gray-700 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>

                  {/* AI 生成并写入项目的文件 */}
                  {msg.generatedFile && (
                    <div className="bg-[#1e2128] border border-blue-500/40 rounded-xl p-3 flex items-center justify-between gap-4 max-w-md shadow-lg">
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                          <FileText size={18} />
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-gray-200 truncate text-xs">{msg.generatedFile.name}</div>
                          <div className="text-[10px] text-gray-500">已写入至: {msg.generatedFile.path}</div>
                        </div>
                      </div>
                      <span className="text-[10px] text-green-400 font-medium shrink-0 bg-green-950/40 border border-green-800/40 px-2 py-1 rounded">
                        已就绪
                      </span>
                    </div>
                  )}

                  {/* 时间与单条快捷删除按钮 */}
                  <div className={`flex items-center gap-2 text-[10px] text-gray-500 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                    <span>{msg.time}</span>
                    {!isManageMode && (
                      <button
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: '确认删除对话？',
                            description: '系统将执行【成对删除】，同时移除与该条内容对应的问题或回答，并即时重置 AI 上下文记忆。',
                            confirmText: '成对删除',
                            onConfirm: () => {
                              deleteMessage(msg.id);
                              setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                            }
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 p-0.5"
                        title="成对删除此对话并同步重置 AI 记忆"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* AI 思考中指示器 */}
          {isThinking && (
            <div className="flex gap-3 max-w-xl">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Sparkles size={16} className="animate-spin" />
              </div>
              <div className="bg-[#2a2d35] text-gray-400 text-xs p-3.5 rounded-2xl rounded-tl-none border border-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                正在阅读上下文、匹配项目知识库并调用文件工具...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部仿 Gemini 多功能输入区 */}
        <div className="p-4 bg-[#2a2d35]/60 border-t border-gray-700/60 shrink-0">
          
          {/* 预设快捷指令 */}
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            <button
              onClick={() => setInputText(`请帮我访问【${selectedProject}】文件夹下的资料，总结一份大纲放到输出文件夹中。`)}
              className="text-[11px] bg-[#1e2128] hover:bg-[#323640] text-gray-300 border border-gray-700 px-2.5 py-1 rounded-full shrink-0 transition-colors"
            >
              ⚡ 总结大纲并输出到 Word
            </button>
            <button
              onClick={() => setInputText(`分析【${selectedProject}】项目的核心风险点`)}
              className="text-[11px] bg-[#1e2128] hover:bg-[#323640] text-gray-300 border border-gray-700 px-2.5 py-1 rounded-full shrink-0 transition-colors"
            >
              🔍 检索项目核心难点
            </button>
          </div>

          {/* 输入框主容器 */}
          <div className="bg-[#1e2128] border border-gray-700 rounded-2xl p-2.5 focus-within:border-blue-500 transition-colors shadow-inner">
            
            {/* 待发送附件预览标签组 */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 p-1.5 bg-[#252830] rounded-xl border border-gray-700/60">
                {attachedFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-1.5 bg-[#1e2128] border border-gray-600 px-2 py-1 rounded-lg text-xs text-gray-200">
                    <Paperclip size={13} className="text-blue-400" />
                    <span className="truncate max-w-[140px] text-[11px]">{file.name}</span>
                    <span className="text-[10px] text-gray-400">({formatBytes(file.size)})</span>
                    <button onClick={() => removeAttachment(file.id)} className="text-gray-400 hover:text-red-400 ml-1">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 多行自适应输入框 */}
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`给本地 AI 发送指令（支持 Shift + Enter 换行，Enter 直接发送）...`}
              className="w-full bg-transparent text-xs text-gray-200 focus:outline-none placeholder-gray-500 resize-none px-1"
            />

            {/* 输入框底部功能条 */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-800/80">
              <div className="flex items-center gap-1">
                {/* 仿 Gemini 附件添加按钮 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-400 hover:bg-[#2e323c] px-2 py-1 rounded-lg transition-colors"
                  title="上传参考文档至本次对话上下文"
                >
                  <Paperclip size={14} />
                  <span>添加附件</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 hidden sm:inline">
                  按 Enter 发送，Shift + Enter 换行
                </span>
                <button
                  onClick={handleSendMessage}
                  disabled={(!inputText.trim() && attachedFiles.length === 0) || isThinking}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white p-1.5 rounded-xl transition-colors shadow"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧边栏：主机端知识库双向映射看板 */}
      <div className="w-80 bg-[#252830] flex flex-col h-full shrink-0">
        
        {/* 同步状态控制栏 */}
        <div className="p-4 border-b border-gray-700/60">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-300">主机端知识库映射</span>
            <button
              onClick={handleManualSync}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/40 text-white px-2.5 py-1 rounded transition-colors shadow"
              title="立即与本地主机执行增量防丢同步"
            >
              <RefreshCw size={12} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              <span>{syncStatus === 'syncing' ? '同步中...' : '即时同步'}</span>
            </button>
          </div>

          <div className="bg-[#1e2128] p-2.5 rounded-lg border border-gray-700/50 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-gray-400">
              <Clock size={13} className="text-gray-500" />
              <span>上次更新: {lastSyncTime}</span>
            </div>
            <div className="flex items-center gap-1 text-green-400 font-medium">
              <CheckCircle2 size={13} />
              <span>已保持一致</span>
            </div>
          </div>
        </div>

        {/* 项目知识库树状目录 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              可用项目目录 (点击切换 AI 路由)
            </span>
            
            {/* 项目列表动态过滤 */}
            <div className="space-y-1">
              {['南方电网', 'Cyber_EcoTank', '通用公用库']
                .filter((proj) => currentUser.role === 'admin' || currentUser.allowedProjects.includes(proj))
                .map((proj) => (
                  <div
                    key={proj}
                    onClick={() => setSelectedProject(proj)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                      selectedProject === proj
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-gray-300 hover:bg-[#2e323c]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Folder size={14} className={selectedProject === proj ? 'text-blue-400' : 'text-yellow-500'} />
                      <span className="truncate">{proj}</span>
                    </div>
                    <ChevronRight size={14} className="text-gray-500" />
                  </div>
                ))}

              {currentUser.role === 'guest' && (
                <div className="p-3 bg-[#1e2128] rounded text-[11px] text-gray-500 text-center">
                  访客身份无权限挂载内部项目知识库
                </div>
              )}
            </div>
          </div>

          {/* 当前选定项目的内部结构预览 */}
          <div className="bg-[#1e2128] rounded-xl p-3 border border-gray-700/60">
            <span className="text-[11px] font-medium text-gray-400 block mb-2.5">
              【{selectedProject}】目录结构预览:
            </span>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-gray-300 pl-1">
                <FileText size={13} className="text-blue-400" />
                <span className="truncate">南方电网原始资料.docx</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 pl-1">
                <FileText size={13} className="text-blue-400" />
                <span className="truncate">技术参数需求表.xlsx</span>
              </div>

              {/* 专属输出目录 */}
              <div className="mt-2 pt-2 border-t border-gray-700/50">
                <div className="flex items-center gap-1.5 text-green-400 font-semibold mb-1">
                  <FolderOutput size={14} />
                  <span>输出文件夹 (AI 写入通道)</span>
                </div>
                <p className="text-[10px] text-gray-500 leading-normal pl-5">
                  AI 生成的 docx/总结均直接写入此路径，并自动同步回当前界面供下载。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 底部隔离防丢说明 */}
        <div className="p-3 bg-[#1e2128] border-t border-gray-700/60 text-[10px] text-gray-500 leading-relaxed">
          💡 双向防丢策略：在此删除的文件在主机端将移至专属独立回收站，绝不直接物理销毁。
        </div>

      </div>

      {/* 全局操作确认弹窗 (Fail-Safe 防误触机制) */}
      {confirmModal.isOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in duration-150">
          <div className="bg-[#2a2d35] rounded-xl p-5 w-96 shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-100">{confirmModal.title}</h3>
              <button 
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))} 
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-300 mb-5 leading-relaxed bg-[#1e2128] p-3 rounded-lg border border-gray-800">
              {confirmModal.description}
            </p>
            <div className="flex justify-end gap-2.5">
              <button 
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))} 
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-[#323640] transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors shadow"
              >
                {confirmModal.confirmText || '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}