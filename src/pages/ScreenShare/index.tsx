// src/pages/ScreenShare/index.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MonitorPlay,
  Radio,
  Square,
  Copy,
  Check,
  RefreshCw,
  Users,
  Lock,
  Globe,
  Pause,
  Play,
  ArrowLeftRight,
  UserX,
  Maximize2,
  Minimize2,
  Camera,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Wifi,
  Smartphone,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { api } from '../../utils/api';
import { useAuthStore } from '../../store/useAuthStore';

type QualityPresetKey = 'doc' | 'balanced' | 'smooth';

interface QualityPreset {
  key: QualityPresetKey;
  label: string;
  desc: string;
  width: number;
  height: number;
  fps: number;
  maxBitrate: number;
  contentHint: 'detail' | 'motion';
}

const QUALITY_PRESETS: QualityPreset[] = [
  {
    key: 'doc',
    label: '文档/代码清晰 (推荐)',
    desc: '1080p · 10fps · 低带宽文字极清',
    width: 1920,
    height: 1080,
    fps: 10,
    maxBitrate: 900_000,
    contentHint: 'detail'
  },
  {
    key: 'balanced',
    label: '均衡演示',
    desc: '720p · 20fps · 流畅与清晰兼顾',
    width: 1280,
    height: 720,
    fps: 20,
    maxBitrate: 1_400_000,
    contentHint: 'detail'
  },
  {
    key: 'smooth',
    label: '高流畅演示',
    desc: '1080p · 30fps · 适合视频与动画',
    width: 1920,
    height: 1080,
    fps: 30,
    maxBitrate: 2_800_000,
    contentHint: 'motion'
  }
];

interface ShareableUser {
  id: string;
  username: string;
  name: string;
  role: string;
}

interface ActiveRoomSummary {
  roomId: string;
  hostName: string;
  hostUsername: string;
  allowMode: 'code' | 'users';
  qualityLabel: string;
  createdAt: string;
  isSelfDevice: boolean;
  viewerCount: number;
}

interface ViewerEntry {
  clientId: string;
  userId: string;
  name: string;
  username: string;
  role: string;
  joinedAt: string;
  connState: string;
}

interface HostPeerSlot {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  viewer: ViewerEntry;
}

export default function ScreenShare() {
  const { currentUser } = useAuthStore();
  const isGuest = currentUser?.role === 'guest';
  const canCaptureScreen =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  // 当前工作模式：idle (大厅) | host (正在共享) | viewer (正在观看)
  const [mode, setMode] = useState<'idle' | 'host' | 'viewer'>('idle');
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 大厅状态：可邀请用户列表、可一键加入的活跃房间、6位房间码输入框
  const [shareableUsers, setShareableUsers] = useState<ShareableUser[]>([]);
  const [activeRooms, setActiveRooms] = useState<ActiveRoomSummary[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // 发起共享配置
  const [qualityKey, setQualityKey] = useState<QualityPresetKey>('doc');
  const [shareAudio, setShareAudio] = useState(false);
  const [allowMode, setAllowMode] = useState<'code' | 'users'>(isGuest ? 'code' : 'code');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // 共享方（Host）运行态
  const [hostRoomId, setHostRoomId] = useState('');
  const [hostPaused, setHostPaused] = useState(false);
  const [viewers, setViewers] = useState<ViewerEntry[]>([]);
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);

  // 观看方（Viewer）运行态
  const [viewerRoomId, setViewerRoomId] = useState('');
  const [viewerHostInfo, setViewerHostInfo] = useState<{
    name: string;
    username: string;
    qualityLabel: string;
  } | null>(null);
  const [viewerConnState, setViewerConnState] = useState<string>('正在连接...');
  const [remotePaused, setRemotePaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual'>('fit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveStats, setLiveStats] = useState<{
    width: number;
    height: number;
    fps: number;
    transport: string;
  }>({ width: 0, height: 0, fps: 0, transport: '检测中' });

  // 底层 Ref 管理（媒体流、WebSocket、PeerConnections、ICE 队列）
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const viewerStageRef = useRef<HTMLDivElement>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const statsTimerRef = useRef<number | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);

  const hostPeersRef = useRef<Map<string, HostPeerSlot>>(new Map());
  const viewerPcRef = useRef<RTCPeerConnection | null>(null);
  const viewerPendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const hostRoomIdRef = useRef<string>('');
  const hostPausedRef = useRef<boolean>(false);

  const showToast = useCallback((msg: string, ms = 2500) => {
    setStatusToast(msg);
    window.setTimeout(() => setStatusToast(null), ms);
  }, []);

  // 拉取可共享用户列表与活跃房间列表
  const fetchRooms = useCallback(async (silent = false) => {
    if (isGuest) {
      setActiveRooms([]);
      return;
    }
    if (!silent) setIsLoadingRooms(true);
    try {
      const list = await api.screen.listRooms();
      setActiveRooms(list || []);
    } catch {
      // ignore
    } finally {
      if (!silent) setIsLoadingRooms(false);
    }
  }, [isGuest]);

  useEffect(() => {
    if (!isGuest) {
      api.files.getShareableUsers().then(setShareableUsers).catch(() => {});
      void Promise.resolve().then(() => {
        void fetchRooms();
      });
    }
  }, [isGuest, fetchRooms]);

  // 大厅模式下每 4 秒自动刷新待加入会话（方便同账号设备或被邀请者即时看到）
  useEffect(() => {
    if (mode !== 'idle' || isGuest) return;
    const timer = window.setInterval(() => fetchRooms(true), 4000);
    return () => window.clearInterval(timer);
  }, [mode, isGuest, fetchRooms]);

  // 监听浏览器全屏状态变化
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // 统一清理所有 WebRTC / WebSocket / 媒体流资源
  const cleanupSession = useCallback((notifyServerClose = false) => {
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (statsTimerRef.current) {
      window.clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }

    if (wsRef.current) {
      try {
        if (notifyServerClose && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop_share' }));
        }
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    hostPeersRef.current.forEach((slot) => {
      try {
        slot.pc.close();
      } catch {
        // ignore
      }
    });
    hostPeersRef.current.clear();

    if (viewerPcRef.current) {
      try {
        viewerPcRef.current.close();
      } catch {
        // ignore
      }
      viewerPcRef.current = null;
    }
    viewerPendingIceRef.current = [];

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (notifyServerClose && hostRoomIdRef.current) {
      api.screen.closeRoom(hostRoomIdRef.current).catch(() => {});
    }
    hostRoomIdRef.current = '';
    hostPausedRef.current = false;

    setHostRoomId('');
    setHostPaused(false);
    setViewers([]);
    setViewerRoomId('');
    setViewerHostInfo(null);
    setRemotePaused(false);
    setLiveStats({ width: 0, height: 0, fps: 0, transport: '检测中' });
    setMode('idle');
  }, []);

  // 页面卸载时彻底释放屏幕采集与连接
  useEffect(() => {
    return () => {
      cleanupSession(true);
    };
  }, [cleanupSession]);

  // 共享方挂载本地预览视频
  useEffect(() => {
    if (mode === 'host' && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
  }, [mode]);

  const syncViewersState = () => {
    const arr = Array.from(hostPeersRef.current.values()).map((s) => s.viewer);
    setViewers(arr);
  };

  // 为共享方单个观看者建立点对点连接并发送 Offer
  const createHostPeerForViewer = async (viewer: ViewerEntry) => {
    const stream = localStreamRef.current;
    const ws = wsRef.current;
    if (!stream || !ws || ws.readyState !== WebSocket.OPEN) return;

    const existing = hostPeersRef.current.get(viewer.clientId);
    if (existing) {
      try {
        existing.pc.close();
      } catch {
        // ignore
      }
      hostPeersRef.current.delete(viewer.clientId);
    }

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const preset = QUALITY_PRESETS.find((p) => p.key === qualityKey) || QUALITY_PRESETS[0];

    const slot: HostPeerSlot = {
      pc,
      pendingIce: [],
      viewer: { ...viewer, connState: '建立连接中' }
    };
    hostPeersRef.current.set(viewer.clientId, slot);
    syncViewersState();

    stream.getTracks().forEach((track) => {
      if (track.kind === 'video' && 'contentHint' in track) {
        try {
          (track as MediaStreamTrack & { contentHint: string }).contentHint = preset.contentHint;
        } catch {
          // ignore
        }
      }
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = preset.maxBitrate;
        params.encodings[0].maxFramerate = preset.fps;
        sender.setParameters(params).catch(() => {});
      }
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'ice',
            targetClientId: viewer.clientId,
            candidate: event.candidate.toJSON()
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      const target = hostPeersRef.current.get(viewer.clientId);
      if (!target) return;
      const st = pc.connectionState;
      const map: Record<string, string> = {
        new: '初始化',
        connecting: '建立连接中',
        connected: '已连接',
        disconnected: '连接波动',
        failed: '连接失败',
        closed: '已断开'
      };
      target.viewer = { ...target.viewer, connState: map[st] || st };
      syncViewersState();
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(
        JSON.stringify({
          type: 'offer',
          targetClientId: viewer.clientId,
          sdp: offer
        })
      );
      if (hostPausedRef.current) {
        ws.send(JSON.stringify({ type: 'host_paused', paused: true }));
      }
    } catch (err) {
      console.error('创建 Offer 失败:', err);
    }
  };

  // ============================================================================
  // 1. 发起屏幕共享（Host 模式）
  // ============================================================================
  const handleStartHosting = async () => {
    if (!canCaptureScreen) {
      setErrorMsg('当前设备浏览器不支持发起桌面屏幕采集，请使用电脑端浏览器发起共享。');
      return;
    }

    setErrorMsg(null);
    setIsBusy(true);
    const preset = QUALITY_PRESETS.find((p) => p.key === qualityKey) || QUALITY_PRESETS[0];

    try {
      // 第一步：请求系统屏幕/窗口采集权限
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.fps, max: preset.fps + 2 }
        },
        audio: shareAudio
      });

      localStreamRef.current = stream;

      // 监听浏览器原生“停止共享”悬浮条点击
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          cleanupSession(true);
          showToast('屏幕共享已停止');
          fetchRooms(true);
        };
      }

      // 第二步：拉取动态 ICE / TURN 配置并向后端申请房间
      const iceRes = await api.screen.getIceConfig();
      iceServersRef.current = iceRes.iceServers || [];

      const roomRes = await api.screen.createRoom({
        allow_mode: isGuest ? 'code' : allowMode,
        allowed_user_ids: allowMode === 'users' ? selectedUserIds : [],
        quality_label: `${preset.width === 1920 ? '1080p' : '720p'} · ${preset.fps}fps`
      });

      hostRoomIdRef.current = roomRes.roomId;
      setHostRoomId(roomRes.roomId);

      // 第三步：建立 WebSocket 信令连接
      const ws = new WebSocket(api.screen.getWsUrl(roomRes.roomId, roomRes.wsTicket));
      wsRef.current = ws;

      ws.onopen = () => {
        setMode('host');
        setIsBusy(false);
        showToast(`✅ 投屏房间已开启：${roomRes.roomId}`);
        pingTimerRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'viewer_joined' && msg.viewer) {
            showToast(`👀 ${msg.viewer.name} 加入了观看`);
            await createHostPeerForViewer(msg.viewer);
          } else if (msg.type === 'viewer_left' && msg.clientId) {
            const slot = hostPeersRef.current.get(msg.clientId);
            if (slot) {
              try {
                slot.pc.close();
              } catch {
                // ignore
              }
              hostPeersRef.current.delete(msg.clientId);
              syncViewersState();
            }
          } else if (msg.type === 'answer' && msg.fromClientId && msg.sdp) {
            const slot = hostPeersRef.current.get(msg.fromClientId);
            if (slot) {
              await slot.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              for (const cand of slot.pendingIce) {
                await slot.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }
              slot.pendingIce = [];
            }
          } else if (msg.type === 'ice' && msg.fromClientId && msg.candidate) {
            const slot = hostPeersRef.current.get(msg.fromClientId);
            if (slot) {
              if (slot.pc.remoteDescription) {
                await slot.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
              } else {
                slot.pendingIce.push(msg.candidate);
              }
            }
          }
        } catch (err) {
          console.error('处理共享方信令异常:', err);
        }
      };

      ws.onerror = () => {
        setErrorMsg('信令通道连接失败，请确认服务器 Nginx WebSocket 代理与 Redis 服务运行正常。');
        cleanupSession(true);
        setIsBusy(false);
      };

      ws.onclose = () => {
        if (hostRoomIdRef.current) {
          cleanupSession(false);
          fetchRooms(true);
        }
      };
    } catch (err) {
      cleanupSession(true);
      setIsBusy(false);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        showToast('已取消选择共享屏幕');
      } else {
        setErrorMsg(err instanceof Error ? err.message : '启动屏幕共享失败');
      }
    }
  };

  // 共享方：无缝切换共享窗口/屏幕（replaceTrack，观看端不断线）
  const handleSwitchWindow = async () => {
    if (!canCaptureScreen || !localStreamRef.current) return;
    const preset = QUALITY_PRESETS.find((p) => p.key === qualityKey) || QUALITY_PRESETS[0];
    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.fps, max: preset.fps + 2 }
        },
        audio: shareAudio
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      newVideoTrack.enabled = !hostPausedRef.current;
      newVideoTrack.onended = () => {
        cleanupSession(true);
        showToast('屏幕共享已停止');
        fetchRooms(true);
      };

      // 替换所有在线观看者连接中的视频轨道
      for (const slot of hostPeersRef.current.values()) {
        const sender = slot.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }

      // 停掉旧媒体流并更新本地预览
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = newStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
        localVideoRef.current.play().catch(() => {});
      }
      showToast('已无缝切换共享画面');
    } catch {
      // 用户取消切窗时不中断原有共享
    }
  };

  // 共享方：暂停 / 恢复画面
  const handleTogglePause = () => {
    const nextPaused = !hostPaused;
    setHostPaused(nextPaused);
    hostPausedRef.current = nextPaused;

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = !nextPaused;
      });
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'host_paused', paused: nextPaused }));
    }
  };

  // 共享方：踢出指定观看者
  const handleKickViewer = (clientId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'kick', targetClientId: clientId }));
    }
    const slot = hostPeersRef.current.get(clientId);
    if (slot) {
      try {
        slot.pc.close();
      } catch {
        // ignore
      }
      hostPeersRef.current.delete(clientId);
      syncViewersState();
    }
  };

  // ============================================================================
  // 2. 加入观看共享（Viewer 模式）
  // ============================================================================
  const handleJoinRoom = async (roomId: string) => {
    const cleanId = roomId.trim();
    if (!cleanId) {
      setErrorMsg('请输入 6 位房间号');
      return;
    }

    setErrorMsg(null);
    setIsBusy(true);

    try {
      const iceRes = await api.screen.getIceConfig();
      iceServersRef.current = iceRes.iceServers || [];

      const joinRes = await api.screen.joinRoom(cleanId);
      setViewerRoomId(joinRes.roomId);
      setViewerHostInfo({
        name: joinRes.hostName,
        username: joinRes.hostUsername,
        qualityLabel: joinRes.qualityLabel
      });
      setViewerConnState('正在握手建立通道...');

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      viewerPcRef.current = pc;
      viewerPendingIceRef.current = [];

      const ws = new WebSocket(api.screen.getWsUrl(joinRes.roomId, joinRes.wsTicket));
      wsRef.current = ws;

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (remoteVideoRef.current && stream) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {
            // 若浏览器策略阻止带声音自动播放，自动静音保底确保画面立即呈现
            if (remoteVideoRef.current) {
              remoteVideoRef.current.muted = true;
              setIsMuted(true);
              remoteVideoRef.current.play().catch(() => {});
            }
          });
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'ice',
              targetClientId: joinRes.hostClientId,
              candidate: event.candidate.toJSON()
            })
          );
        }
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        const map: Record<string, string> = {
          new: '初始化通道',
          connecting: '正在穿透连接...',
          connected: '实时连接中',
          disconnected: '网络波动，尝试恢复...',
          failed: '连接失败（请检查服务器 3478/UDP 防火墙）',
          closed: '连接已关闭'
        };
        setViewerConnState(map[st] || st);
      };

      ws.onopen = () => {
        setMode('viewer');
        setIsBusy(false);

        pingTimerRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);

        // 每 2 秒采集分辨率、FPS 及连接通道类型（P2P 直连 vs TURN 中继）
        statsTimerRef.current = window.setInterval(async () => {
          if (!viewerPcRef.current) return;
          try {
            const stats = await viewerPcRef.current.getStats();
            let width = 0;
            let height = 0;
            let fps = 0;
            let transport = '连接中';
            type RtcStatRecord = Record<string, unknown> & {
              id?: string;
              type?: string;
              kind?: string;
              frameWidth?: number;
              frameHeight?: number;
              framesPerSecond?: number;
              state?: string;
              nominated?: boolean;
              localCandidateId?: string;
              remoteCandidateId?: string;
              candidateType?: string;
              protocol?: string;
            };
            const candidates = new Map<string, RtcStatRecord>();
            let selectedPair: RtcStatRecord | null = null;

            stats.forEach((rawReport) => {
              const report = rawReport as RtcStatRecord;
              if (report.type === 'inbound-rtp' && report.kind === 'video') {
                width = Number(report.frameWidth || width);
                height = Number(report.frameHeight || height);
                fps = Math.round(Number(report.framesPerSecond || 0));
              } else if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
                if (report.id) candidates.set(report.id, report);
              } else if (
                report.type === 'candidate-pair' &&
                (report.selected || report.nominated) &&
                report.state === 'succeeded'
              ) {
                selectedPair = report;
              }
            });

            const pair = selectedPair as RtcStatRecord | null;
            if (pair) {
              const localCand = pair.localCandidateId ? candidates.get(pair.localCandidateId) : undefined;
              const remoteCand = pair.remoteCandidateId ? candidates.get(pair.remoteCandidateId) : undefined;
              if (
                localCand?.candidateType === 'relay' ||
                remoteCand?.candidateType === 'relay'
              ) {
                transport = 'TURN 中继';
              } else {
                transport = 'P2P 直连';
              }
            }
            setLiveStats({ width, height, fps, transport });
          } catch {
            // ignore
          }
        }, 2000);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'offer' && msg.sdp && viewerPcRef.current) {
            await viewerPcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            for (const cand of viewerPendingIceRef.current) {
              await viewerPcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
            viewerPendingIceRef.current = [];
            const answer = await viewerPcRef.current.createAnswer();
            await viewerPcRef.current.setLocalDescription(answer);
            ws.send(
              JSON.stringify({
                type: 'answer',
                targetClientId: msg.fromClientId || joinRes.hostClientId,
                sdp: answer
              })
            );
          } else if (msg.type === 'ice' && msg.candidate && viewerPcRef.current) {
            if (viewerPcRef.current.remoteDescription) {
              await viewerPcRef.current
                .addIceCandidate(new RTCIceCandidate(msg.candidate))
                .catch(() => {});
            } else {
              viewerPendingIceRef.current.push(msg.candidate);
            }
          } else if (msg.type === 'host_paused') {
            setRemotePaused(Boolean(msg.paused));
          } else if (msg.type === 'room_closed') {
            cleanupSession(false);
            showToast(msg.reason || '共享方已结束投屏', 3000);
            fetchRooms(true);
          } else if (msg.type === 'kicked') {
            cleanupSession(false);
            setErrorMsg(msg.reason || '您已被共享方移出房间');
            fetchRooms(true);
          }
        } catch (err) {
          console.error('处理观看端信令异常:', err);
        }
      };

      ws.onerror = () => {
        setErrorMsg('无法连接屏幕共享信令通道');
        cleanupSession(false);
        setIsBusy(false);
      };
    } catch (err) {
      cleanupSession(false);
      setIsBusy(false);
      setErrorMsg(err instanceof Error ? err.message : '加入房间失败');
    }
  };

  // 观看方：全屏切换
  const handleToggleFullscreen = () => {
    if (!viewerStageRef.current) return;
    if (!document.fullscreenElement) {
      viewerStageRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // 观看方：一键截屏下载当前画面
  const handleTakeScreenshot = () => {
    const video = remoteVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `DCM投屏截图_${viewerRoomId}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('📸 已保存当前画面截图');
  };

  const handleCopyRoomCode = () => {
    if (!hostRoomId) return;
    navigator.clipboard.writeText(hostRoomId);
    setCopiedRoomCode(true);
    setTimeout(() => setCopiedRoomCode(false), 1600);
  };

  return (
    <div className="h-full w-full bg-[#1e2128] text-gray-200 p-3 md:p-6 pb-16 md:pb-6 flex flex-col overflow-hidden select-none">
      {/* 顶部标题栏 */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <MonitorPlay size={22} className="text-blue-400" />
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-blue-400 leading-tight">
              实时屏幕共享
            </h1>
            <p className="text-[11px] text-gray-400">
              支持跨账号协作、同账号多设备互投、访客房间码观看及 TURN 防火墙自动穿透
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusToast && (
            <span className="text-xs bg-green-950/60 text-green-400 border border-green-700/50 px-3 py-1.5 rounded-xl">
              {statusToast}
            </span>
          )}
          {mode === 'idle' && !isGuest && (
            <button
              onClick={() => fetchRooms(false)}
              className="flex items-center gap-1.5 text-xs bg-[#2a2d35] hover:bg-[#323640] border border-gray-700 px-3 py-2 rounded-xl text-gray-300 transition-colors"
            >
              <RefreshCw size={13} className={isLoadingRooms ? 'animate-spin text-blue-400' : 'text-blue-400'} />
              <span>刷新会话</span>
            </button>
          )}
        </div>
      </header>

      {/* 错误提示横幅 */}
      {errorMsg && (
        <div className="mb-4 px-4 py-2.5 bg-red-950/40 border border-red-800/60 rounded-xl flex items-center justify-between text-xs text-red-400 shrink-0">
          <span className="flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </span>
          <button onClick={() => setErrorMsg(null)} className="hover:underline ml-3 shrink-0">
            关闭
          </button>
        </div>
      )}

      {/* ====================================================================
          视图 A：大厅模式（左侧发起共享配置 + 右侧输入房间码/一键加入会话）
          ==================================================================== */}
      {mode === 'idle' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 overflow-y-auto pr-1">
          {/* 左卡：发起屏幕共享 */}
          <div className="bg-[#2a2d35] border border-gray-700/60 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                  <Radio size={18} className="text-blue-400" />
                  <span>发起屏幕共享</span>
                </h2>
                {!canCaptureScreen && (
                  <span className="text-[11px] bg-yellow-950/40 text-yellow-300 border border-yellow-600/50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <Smartphone size={12} /> 移动端仅支持观看
                  </span>
                )}
              </div>

              {/* 画质档位选择 */}
              <div>
                <div className="text-xs font-semibold text-gray-300 mb-2">1. 选择画质与带宽档位</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {QUALITY_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setQualityKey(p.key)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        qualityKey === p.key
                          ? 'bg-blue-600/20 border-blue-500/60 text-blue-300 shadow'
                          : 'bg-[#1e2128] border-gray-700 text-gray-300 hover:bg-[#323640]'
                      }`}
                    >
                      <div className="text-xs font-bold">{p.label}</div>
                      <div className="text-[10px] text-gray-400 mt-1">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 音频选项 */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#1e2128] border border-gray-700/80 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={shareAudio}
                  onChange={(e) => setShareAudio(e.target.checked)}
                />
                <span className="text-gray-200 font-medium">同步共享系统/标签页音频</span>
                <span className="text-[11px] text-gray-500">（需浏览器弹窗勾选“共享音频”）</span>
              </label>

              {/* 观看权限范围 */}
              <div>
                <div className="text-xs font-semibold text-gray-300 mb-2">2. 设置谁可以观看</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setAllowMode('code')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      allowMode === 'code'
                        ? 'bg-green-950/30 border-green-500/60 text-green-300'
                        : 'bg-[#1e2128] border-gray-700 text-gray-400 hover:bg-[#323640]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Globe size={14} /> 凭 6 位房间码加入
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      支持任意成员、同账号多设备及访客凭房间号观看
                    </div>
                  </button>

                  {!isGuest && (
                    <button
                      type="button"
                      onClick={() => setAllowMode('users')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        allowMode === 'users'
                          ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                          : 'bg-[#1e2128] border-gray-700 text-gray-400 hover:bg-[#323640]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <Lock size={14} /> 仅指定账号 / 本人设备
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        仅允许本人其他设备及下方勾选的成员一键加入
                      </div>
                    </button>
                  )}
                </div>

                {/* 可选邀请成员列表 */}
                {!isGuest && (
                  <div className="bg-[#1e2128] border border-gray-700/80 rounded-xl p-3">
                    <div className="flex items-center justify-between text-[11px] text-gray-400 mb-2">
                      <span>
                        {allowMode === 'users'
                          ? '选择允许观看的成员（不选则仅限自己另一台设备）：'
                          : '可选邀请成员（勾选后对方大厅将直接显示一键加入入口）：'}
                      </span>
                      {selectedUserIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds([])}
                          className="text-red-400 hover:underline"
                        >
                          清空
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {shareableUsers
                        .filter((u) => u.id !== currentUser?.id)
                        .map((u) => {
                          const active = selectedUserIds.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() =>
                                setSelectedUserIds((prev) =>
                                  prev.includes(u.id)
                                    ? prev.filter((id) => id !== u.id)
                                    : [...prev, u.id]
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                                active
                                  ? 'bg-blue-600/25 border-blue-500/60 text-blue-300 font-medium'
                                  : 'bg-[#252830] border-gray-700 text-gray-400 hover:text-gray-200'
                              }`}
                            >
                              {active ? '✓ ' : '+ '}
                              {u.name} (@{u.username})
                            </button>
                          );
                        })}
                      {shareableUsers.filter((u) => u.id !== currentUser?.id).length === 0 && (
                        <span className="text-[11px] text-gray-500">
                          暂无其他成员，可直接用于本账号多设备间实时投屏
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={!canCaptureScreen || isBusy}
              onClick={handleStartHosting}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors shadow-lg shadow-blue-600/20"
            >
              <MonitorPlay size={17} />
              <span>{isBusy ? '正在初始化投屏房间...' : '开始共享我的屏幕'}</span>
            </button>
          </div>

          {/* 右卡：观看屏幕共享（房间码加入 + 待加入会话列表） */}
          <div className="bg-[#2a2d35] border border-gray-700/60 rounded-2xl p-5 flex flex-col gap-4 shadow-lg">
            <div className="border-b border-gray-700 pb-3">
              <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <Users size={18} className="text-emerald-400" />
                <span>加入观看屏幕</span>
              </h2>
            </div>

            {/* 6 位房间码直连入口（全角色含访客可用） */}
            <div className="bg-[#1e2128] border border-gray-700/80 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-300 mb-2">
                输入 6 位房间号加入观看
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom(joinCodeInput)}
                  placeholder="例如：482910"
                  className="flex-1 bg-[#16181d] border border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-gray-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  disabled={isBusy || joinCodeInput.length < 6}
                  onClick={() => handleJoinRoom(joinCodeInput)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-colors shrink-0"
                >
                  {isBusy ? '连接中...' : '加入观看'}
                </button>
              </div>
            </div>

            {/* 待加入的共享会话列表（同账号跨设备 & 被定向邀请的会话） */}
            <div className="flex-1 flex flex-col min-h-[200px]">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-300 mb-2">
                <span>可一键加入的活跃共享</span>
                {!isGuest && (
                  <span className="text-[11px] text-gray-500 font-normal">每 4 秒自动发现</span>
                )}
              </div>

              {isGuest ? (
                <div className="flex-1 bg-[#1e2128] border border-gray-800 rounded-xl p-6 flex flex-col items-center justify-center text-center text-xs text-gray-400 gap-2">
                  <Lock size={22} className="text-gray-500" />
                  <p>当前为访客模式，请输入共享方提供的 6 位房间号直接观看。</p>
                </div>
              ) : activeRooms.length === 0 ? (
                <div className="flex-1 bg-[#1e2128] border border-gray-800 rounded-xl p-6 flex flex-col items-center justify-center text-center text-xs text-gray-500 gap-1.5">
                  <MonitorPlay size={24} className="text-gray-600 mb-1" />
                  <p>当前暂无共享给您的活跃会话</p>
                  <p className="text-[11px]">
                    同一账号在另一台电脑开启投屏后，这里会自动出现一键观看入口
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 overflow-y-auto max-h-72 pr-1">
                  {activeRooms.map((room) => (
                    <div
                      key={room.roomId}
                      className="p-3.5 bg-[#1e2128] border border-gray-700/80 hover:border-blue-500/50 rounded-xl flex items-center justify-between gap-3 transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-100">
                            {room.isSelfDevice
                              ? '我的另一台设备'
                              : `${room.hostName} (@${room.hostUsername})`}
                          </span>
                          <span className="text-[10px] font-mono bg-blue-600/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded">
                            房间 #{room.roomId}
                          </span>
                          {room.qualityLabel && (
                            <span className="text-[10px] text-gray-400">{room.qualityLabel}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          开始于 {room.createdAt} · 当前 {room.viewerCount} 人观看
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleJoinRoom(room.roomId)}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl transition-colors shrink-0 shadow"
                      >
                        加入观看
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          视图 B：共享方实时控制工作台（Host 模式）
          ==================================================================== */}
      {mode === 'host' && (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* 顶部红色呼吸控制条 */}
          <div className="bg-[#252830] border border-red-500/40 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-2 text-xs font-bold text-red-400">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span>{hostPaused ? '画面已暂停' : '正在共享屏幕'}</span>
              </span>

              <div className="flex items-center gap-1.5 bg-[#1a1c23] border border-gray-700 px-3 py-1 rounded-xl">
                <span className="text-[11px] text-gray-400">房间号:</span>
                <span className="text-sm font-mono font-bold text-blue-400 tracking-widest">
                  {hostRoomId}
                </span>
                <button
                  type="button"
                  onClick={handleCopyRoomCode}
                  className="ml-1 text-gray-400 hover:text-white"
                  title="复制房间号"
                >
                  {copiedRoomCode ? (
                    <Check size={14} className="text-green-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>

              <span className="text-xs text-gray-400">
                在线观看：{viewers.length} 人
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSwitchWindow}
                className="flex items-center gap-1.5 text-xs bg-[#1a1c23] hover:bg-[#323640] border border-gray-700 text-gray-200 px-3 py-2 rounded-xl transition-colors"
              >
                <ArrowLeftRight size={14} className="text-blue-400" />
                <span>切换共享窗口</span>
              </button>

              <button
                type="button"
                onClick={handleTogglePause}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-colors ${
                  hostPaused
                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-yellow-950/40 border-yellow-600/50 text-yellow-300'
                }`}
              >
                {hostPaused ? <Play size={14} /> : <Pause size={14} />}
                <span>{hostPaused ? '恢复画面' : '暂停画面'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  cleanupSession(true);
                  showToast('已停止屏幕共享');
                  fetchRooms(true);
                }}
                className="flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-3.5 py-2 rounded-xl transition-colors shadow"
              >
                <Square size={13} />
                <span>停止共享</span>
              </button>
            </div>
          </div>

          {/* 下方：本地画面预览 + 在线观看者列表 */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden">
            <div className="lg:col-span-3 bg-[#111318] border border-gray-800 rounded-2xl overflow-hidden flex items-center justify-center relative">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="max-w-full max-h-full object-contain"
              />
              {hostPaused && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-gray-200 gap-2">
                  <Pause size={36} className="text-yellow-400" />
                  <p className="text-sm font-semibold">共享画面已暂停，观看端当前不可见最新内容</p>
                </div>
              )}
            </div>

            <div className="bg-[#2a2d35] border border-gray-700/60 rounded-2xl p-4 flex flex-col overflow-hidden">
              <h3 className="text-xs font-bold text-gray-200 border-b border-gray-700 pb-2.5 mb-3 flex items-center justify-between">
                <span>当前观看成员 ({viewers.length})</span>
                <span className="text-[10px] font-normal text-gray-400">支持多端同时观看</span>
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                {viewers.length === 0 ? (
                  <div className="text-center text-xs text-gray-500 py-10 leading-relaxed">
                    等待对方加入...
                    <br />
                    请将房间号 <span className="text-blue-400 font-mono font-bold">{hostRoomId}</span> 发给对方
                  </div>
                ) : (
                  viewers.map((v) => (
                    <div
                      key={v.clientId}
                      className="p-2.5 bg-[#1e2128] border border-gray-700/80 rounded-xl flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-200 truncate">
                          {v.name} {v.role === 'guest' ? '(访客)' : `(@${v.username})`}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {v.connState} · {v.joinedAt} 加入
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleKickViewer(v.clientId)}
                        className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-950/30 shrink-0"
                        title="移出该观看者"
                      >
                        <UserX size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          视图 C：观看方实时画布（Viewer 模式）
          ==================================================================== */}
      {mode === 'viewer' && (
        <div
          ref={viewerStageRef}
          className="flex-1 flex flex-col bg-[#111318] border border-gray-800 rounded-2xl overflow-hidden"
        >
          {/* 顶部观看控制工具栏 */}
          <div className="px-4 py-2.5 bg-[#1c2029] border-b border-gray-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 flex-wrap text-xs">
              <span className="font-bold text-gray-100">
                正在观看：{viewerHostInfo?.name || '共享屏幕'}
              </span>
              <span className="font-mono text-[11px] bg-blue-600/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded">
                #{viewerRoomId}
              </span>
              <span className="text-[11px] text-gray-400">{viewerConnState}</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 实时连接质量胶囊 */}
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] bg-[#14161b] border border-gray-700 px-2.5 py-1 rounded-lg text-gray-300 font-mono">
                <Wifi
                  size={12}
                  className={
                    liveStats.transport === 'P2P 直连' ? 'text-green-400' : 'text-blue-400'
                  }
                />
                <span>{liveStats.transport}</span>
                {liveStats.width > 0 && (
                  <span>
                    · {liveStats.width}×{liveStats.height} · {liveStats.fps}fps
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  if (remoteVideoRef.current) remoteVideoRef.current.muted = next;
                }}
                className="p-1.5 rounded-lg bg-[#252830] hover:bg-gray-700 border border-gray-700 text-gray-200"
                title={isMuted ? '开启声音' : '静音'}
              >
                {isMuted ? <VolumeX size={14} className="text-gray-400" /> : <Volume2 size={14} className="text-green-400" />}
              </button>

              <button
                type="button"
                onClick={() => setZoomMode((prev) => (prev === 'fit' ? 'actual' : 'fit'))}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#252830] hover:bg-gray-700 border border-gray-700 text-gray-200"
                title="切换自适应窗口 / 1:1 原始像素查看代码细节"
              >
                {zoomMode === 'fit' ? <ZoomIn size={13} /> : <ZoomOut size={13} />}
                <span>{zoomMode === 'fit' ? '1:1 原尺寸' : '适应窗口'}</span>
              </button>

              <button
                type="button"
                onClick={handleTakeScreenshot}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#252830] hover:bg-gray-700 border border-gray-700 text-gray-200"
                title="保存当前投屏画面为 PNG 图片"
              >
                <Camera size={13} className="text-emerald-400" />
                <span className="hidden sm:inline">截屏</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#252830] hover:bg-gray-700 border border-gray-700 text-gray-200"
                title="全屏 / 退出全屏"
              >
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                <span className="hidden sm:inline">{isFullscreen ? '退出全屏' : '全屏'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  cleanupSession(false);
                  fetchRooms(true);
                }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                <LogOut size={13} />
                <span>退出观看</span>
              </button>
            </div>
          </div>

          {/* 视频主显示画布 */}
          <div
            className={`flex-1 relative bg-[#0c0e12] ${
              zoomMode === 'actual'
                ? 'overflow-auto'
                : 'overflow-hidden flex items-center justify-center'
            }`}
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={isMuted}
              className={
                zoomMode === 'actual'
                  ? 'max-w-none block'
                  : 'max-w-full max-h-full object-contain'
              }
            />

            {remotePaused && (
              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-gray-200 gap-2">
                <Pause size={36} className="text-yellow-400" />
                <p className="text-sm font-semibold">共享方已暂时暂停画面</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
