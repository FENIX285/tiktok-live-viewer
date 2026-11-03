/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Users, 
  Heart, 
  Gift, 
  UserPlus, 
  ExternalLink, 
  Terminal, 
  Activity,
  AlertCircle,
  MessageSquareText,
  Trophy,
  Swords,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { getSocket } from './lib/socket';
import { Avatar } from './components/Avatar';
import { extractAvatarUrl } from './lib/eulerSocket';
import { resolveGiftCoins } from './lib/giftResolver';

interface ChatMessage {
  id: string;
  internalId?: string; // Added for React keys
  uniqueId: string;
  nickname: string;
  comment: string;
  profilePictureUrl: string;
  timestamp: number;
}

interface GiftMessage {
  userId?: string;
  uniqueId: string;
  nickname: string;
  giftName: string;
  repeatCount: number;
  totalRepeatCount?: number;
  isCombo?: boolean;
  comboCount?: number;
  profilePictureUrl: string;
  diamondCount: number;
  repeatEnd?: boolean;
  giftType?: number;
  groupId?: string;
}

export interface GiftRecord {
  id: string;
  giftName: string;
  giftCount: number;
  coins: number;
  isCombo: boolean;
  comboCount?: number;
  groupId?: string;
  isEnded?: boolean;
  timestamp: number;
}

interface TopGifter {
  rank?: number;
  userId: string;
  uniqueId: string;
  nickname: string;
  avatarUrl?: string;
  profilePictureUrl: string;
  giftsSent?: number;
  totalGifts: number;
  totalCoins: number;
  lastGiftName?: string;
  lastGiftCount?: number;
  lastGiftIsCombo?: boolean;
  lastGiftComboCount?: number;
  lastGiftTimestamp: number;
  history?: GiftRecord[];
}

interface LikeMessage {
  uniqueId: string;
  nickname: string;
  likeCount: number;
  totalLikeCount?: number;
  profilePictureUrl: string;
}

interface TopLiker {
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  likes: number;
}

interface EventMessage {
  uniqueId: string;
  nickname: string;
  type: string;
}

interface Viewer {
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  score?: number;
}

interface BattleUser {
  userId: string;
  originalKey?: string;
  displayId: string;
  nickname?: string;
  profilePictureUrl?: string;
  score: number;
  teamId?: number;
}

type BattleResult = "In Progress" | "Victory" | "Defeat" | "Draw" | "Interrupted" | "En curso" | "Victoria" | "Derrota" | "Empate" | "Interrumpido";

interface BattleHistory {
  battleId: string;
  startTime: number;
  type: string;
  users: BattleUser[];
  result: BattleResult;
  duration?: number;
  startTimeMs?: number;
}

const formatScore = (score: number | string) => {
  const num = typeof score === 'string' ? parseInt(score, 10) : score;
  if (num === undefined || num === null || isNaN(num)) return '0';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace('.', ',') + 'M';
  }
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const formatNumberWithDots = (num: number | string) => {
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (n === undefined || n === null || isNaN(n)) return '0';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const formatViewerScore = (score?: number | string) => {
  const num = typeof score === 'string' ? parseInt(score, 10) : score;
  if (num === undefined || num === null || isNaN(num) || num <= 0) return '';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace('.', ',') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace('.', ',') + 'k';
  }
  return num.toString();
};

function processTeamGroupingAndSort(
  users: BattleUser[],
  teamSource: any,
  targetHost: string,
  targetHostId: string,
  currentType: string
): { type: string; sortedUsers: BattleUser[] } {
  if (!users || users.length === 0) return { type: currentType, sortedUsers: users };

  const hostUser = users.find(u => 
    (targetHostId && u.userId === targetHostId) || 
    (targetHost && (
      u.displayId?.toLowerCase() === targetHost || 
      u.nickname?.toLowerCase() === targetHost || 
      u.originalKey?.toLowerCase() === targetHost ||
      u.userId === targetHost
    ))
  ) || users[0];

  const hostIdentifiers = new Set<string>([
    hostUser?.userId,
    hostUser?.originalKey,
    hostUser?.displayId,
    hostUser?.displayId?.toLowerCase(),
    hostUser?.nickname,
    hostUser?.nickname?.toLowerCase(),
    targetHostId,
    targetHost
  ].filter(Boolean).map(s => s!.toString()));

  let type = currentType;

  const extractIds = (arr: any) => {
    if (!Array.isArray(arr)) return [];
    const ids = new Set<string>();
    arr.forEach(m => {
      if (m === null || m === undefined) return;
      if (typeof m === 'string' || typeof m === 'number') {
        const str = m.toString().trim();
        if (str) { ids.add(str); ids.add(str.toLowerCase()); }
        return;
      }
      const obj = m.user || m.anchor || m.anchorInfo?.user || m.userArmies || m;
      const candidates = [
        obj?.userIdStr, obj?.userId, obj?.hostUserId, obj?.anchorIdStr, obj?.anchorId,
        obj?.id, obj?.secUid, obj?.displayId, obj?.uniqueId, obj?.nickname, obj?.display_id,
        m?.userIdStr, m?.userId, m?.hostUserId, m?.anchorIdStr, m?.anchorId, m?.id, m?.secUid, m?.displayId, m?.hostGroup
      ];
      candidates.forEach(k => {
        if (k !== undefined && k !== null && k !== '') {
          const str = k.toString().trim();
          if (str) { ids.add(str); ids.add(str.toLowerCase()); }
        }
      });
    });
    return Array.from(ids);
  };

  if (Array.isArray(teamSource) && teamSource.length > 0) {
    if (teamSource.length === 2) {
      const t1Raw = teamSource[0]?.teamUsers || teamSource[0]?.userArmies || teamSource[0]?.userIds || teamSource[0]?.members || teamSource[0]?.users || teamSource[0]?.anchors || [];
      const t2Raw = teamSource[1]?.teamUsers || teamSource[1]?.userArmies || teamSource[1]?.userIds || teamSource[1]?.members || teamSource[1]?.users || teamSource[1]?.anchors || [];

      const t1Ids = extractIds(t1Raw);
      const t2Ids = extractIds(t2Raw);

      const isHostInT1 = t1Ids.some(id => hostIdentifiers.has(id));
      const isHostInT2 = t2Ids.some(id => hostIdentifiers.has(id));

      let hostTeamIds = t1Ids;
      let rivalTeamIds = t2Ids;

      if (isHostInT2 && !isHostInT1) {
        hostTeamIds = t2Ids;
        rivalTeamIds = t1Ids;
      }

      if (hostTeamIds.length === 3 && rivalTeamIds.length === 1) {
        type = '3v1';
      } else if (hostTeamIds.length === 1 && rivalTeamIds.length === 3) {
        type = '1v3';
      } else if (hostTeamIds.length === 2 && rivalTeamIds.length === 2) {
        type = '2v2';
      } else if (hostTeamIds.length > 0 && rivalTeamIds.length > 0) {
        type = `${hostTeamIds.length}v${rivalTeamIds.length}`;
      } else if (users.length === 4 && (currentType === '2v2' || currentType === '3v1' || currentType === '1v3')) {
        type = currentType;
      }

      if (hostTeamIds.length > 0 && rivalTeamIds.length > 0 && (isHostInT1 || isHostInT2)) {
        users.forEach(u => {
          const uIds = [u.userId, u.originalKey, u.displayId, u.displayId?.toLowerCase(), u.nickname, u.nickname?.toLowerCase()].filter(Boolean).map(s => s!.toString());
          if (uIds.some(id => hostTeamIds.includes(id))) {
            u.teamId = 0;
          } else if (uIds.some(id => rivalTeamIds.includes(id))) {
            u.teamId = 1;
          }
        });
      }
    } else if (teamSource.length === 3) {
      type = '1v1v1';
      users.forEach((u, i) => { u.teamId = i; });
    } else if (teamSource.length === 4) {
      type = '1v1v1v1';
      users.forEach((u, i) => { u.teamId = i; });
    }
  }

  const hasUnassignedTeams = users.some(u => u.teamId === undefined);
  if (hasUnassignedTeams) {
    const hostIdx = users.indexOf(hostUser);
    if (users.length === 4) {
      if (type === '3v1') {
        users.forEach((u) => { u.teamId = u === hostUser ? 0 : 1; });
      } else if (type === '1v3') {
        users.forEach((u) => { u.teamId = u === hostUser ? 0 : 1; });
      } else if (type === '2v2') {
        if (hostIdx === 2 || hostIdx === 3) {
          users[2].teamId = 0; users[3].teamId = 0;
          users[0].teamId = 1; users[1].teamId = 1;
        } else {
          users[0].teamId = 0; users[1].teamId = 0;
          users[2].teamId = 1; users[3].teamId = 1;
        }
      } else {
        // Default 4 individual participants to FFA (1v1v1v1)
        type = '1v1v1v1';
        users.forEach((u, i) => { u.teamId = i; });
      }
    } else if (users.length === 3 && type !== '3v1' && type !== '1v3') {
      type = '1v1v1';
      users.forEach((u, i) => { u.teamId = i; });
    } else if (users.length === 2) {
      users.forEach(u => {
        u.teamId = u === hostUser ? 0 : 1;
      });
    }
  }

  if (hostUser) {
    if (type === '1v1v1' || type === '1v1v1v1') {
      hostUser.teamId = 0;
      let nextTeam = 1;
      users.forEach(u => {
        if (u !== hostUser) {
          u.teamId = nextTeam++;
        }
      });
    } else {
      hostUser.teamId = 0;
    }
  }

  users.sort((a, b) => {
    const aTeam = a.teamId ?? 0;
    const bTeam = b.teamId ?? 0;
    if (aTeam !== bTeam) return aTeam - bTeam;

    const aIsHost = a === hostUser || a.userId === hostUser.userId || a.originalKey === hostUser.originalKey || (targetHost && a.displayId?.toLowerCase() === targetHost);
    const bIsHost = b === hostUser || b.userId === hostUser.userId || b.originalKey === hostUser.originalKey || (targetHost && b.displayId?.toLowerCase() === targetHost);

    if (aIsHost && !bIsHost) return -1;
    if (bIsHost && !aIsHost) return 1;

    return 0;
  });

  return { type, sortedUsers: users };
}

export default function App() {
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [likersMap, setLikersMap] = useState<Record<string, TopLiker>>({});
  const [giftersMap, setGiftersMap] = useState<Record<string, TopGifter>>({});
  const [expandedGifterId, setExpandedGifterId] = useState<string | null>(null);
  const [stats, setStats] = useState({ likes: 0, followers: 0 });
  const [currentUsername, setCurrentUsername] = useState('');
  const [hostAvatar, setHostAvatar] = useState('');
  const [hostNickname, setHostNickname] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [battles, setBattles] = useState<BattleHistory[]>([]);
  const [battlePage, setBattlePage] = useState(1);
  const BATTLES_PER_PAGE = 10;

  const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
  const [uptimeTicker, setUptimeTicker] = useState(0);
  const connectionStartTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isConnected) return;
    const timer = setInterval(() => {
      setUptimeTicker(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isConnected]);

  const streamUptimeString = useMemo(() => {
    if (!isConnected) return '00h 00m 00s';
    const now = Math.floor(Date.now() / 1000);
    const start = (streamStartTime && streamStartTime > 0)
      ? streamStartTime
      : (connectionStartTimeRef.current || now);
    const elapsed = Math.max(0, now - start);

    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }, [isConnected, streamStartTime, uptimeTicker]);

  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const hasActiveBattle = battles.some(b => b.result === 'En curso');
    if (!hasActiveBattle) return;

    const timer = setInterval(() => {
      setTicker(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [battles]);

  const formatBattleTime = (battle: BattleHistory) => {
    if (!battle.startTime) return '00:00';
    const duration = battle.duration || 300;
    const elapsed = Math.floor((Date.now() - battle.startTime) / 1000);
    const remaining = Math.max(0, duration - elapsed);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const socket = getSocket();

  const currentTargetUserRef = useRef('');
  const currentTargetUserIdRef = useRef('');

  useEffect(() => {
    currentTargetUserRef.current = currentUsername;

    if (!currentUsername) {
      setHostAvatar('');
      setHostNickname('');
      return;
    }

    let isCancelled = false;
    const clean = currentUsername.trim().replace(/^@/, '');
    fetch(`/api/tiktok-user/${encodeURIComponent(clean)}`)
      .then(res => {
        if (!res.ok) throw new Error('Could not load profile');
        return res.json();
      })
      .then(data => {
        if (!isCancelled && data) {
          if (data.avatarUrl) {
            setHostAvatar(prev => prev || data.avatarUrl);
          }
          if (data.nickname) {
            setHostNickname(prev => prev || data.nickname);
          }
          if (data.startTime && data.startTime > 0) {
            setStreamStartTime(data.startTime);
          }
        }
      })
      .catch(err => {
        console.warn('Profile fetch note:', err.message);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentUsername]);

  useEffect(() => {
    socket.on('connected', ({ username, userId, avatarUrl, nickname, startTime }: { username?: string; userId?: string; avatarUrl?: string; nickname?: string; startTime?: number }) => {
      setIsConnected(true);
      setStatus('connected');
      if (username) {
        setCurrentUsername(username);
      }
      if (userId) {
        currentTargetUserIdRef.current = (userId || '').toString();
      }
      if (avatarUrl) {
        setHostAvatar(prev => prev || avatarUrl);
      }
      if (nickname) {
        setHostNickname(prev => prev || nickname);
      }
      if (startTime && startTime > 0) {
        setStreamStartTime(startTime);
      }
      setError(null);
    });

    socket.on('viewer-count', (count: number) => {
      if (typeof count === 'number' && !isNaN(count) && count > 0) {
        setViewerCount(count);
      }
    });

    socket.on('total-likes-update', (totalLikes: number) => {
      if (typeof totalLikes === 'number' && !isNaN(totalLikes) && totalLikes > 0) {
        setStats(prev => ({
          ...prev,
          likes: Math.max(prev.likes, totalLikes)
        }));
      }
    });

    socket.on('room-update', (data: { viewerCount?: number, likes?: number, createTime?: number, startTime?: number, hostAvatar?: string, topViewers?: any[] }) => {
      if (data.viewerCount !== undefined && typeof data.viewerCount === 'number' && !isNaN(data.viewerCount) && data.viewerCount > 0) {
        setViewerCount(data.viewerCount);
      }
      if (data.likes !== undefined && typeof data.likes === 'number' && data.likes > 0) {
        setStats(prev => ({ ...prev, likes: Math.max(prev.likes, data.likes!) }));
      }
      if (data.hostAvatar) {
        setHostAvatar(prev => prev || data.hostAvatar);
      }
      if (data.startTime && data.startTime > 0) {
        setStreamStartTime(data.startTime);
      }
      if (data.topViewers && data.topViewers.length > 0) {
        const mappedViewers = data.topViewers.map((v: any) => ({
          uniqueId: v.user ? v.user.uniqueId : (v.uniqueId || ''),
          nickname: v.user ? v.user.nickname : (v.nickname || ''),
          profilePictureUrl: extractAvatarUrl(v.user || v),
          score: Number(v.score ?? v.coinCount ?? v.coins ?? v.points ?? 0)
        })).slice(0, 10);
        
        setViewers(mappedViewers);
      }
    });

    socket.on('ranking-update', (data: any) => {
      if (data && data.ranklist && data.ranklist.length > 0) {
        const mappedViewers = data.ranklist.map((v: any) => ({
          uniqueId: v.user ? v.user.uniqueId : (v.uniqueId || ''),
          nickname: v.user ? v.user.nickname : (v.nickname || ''),
          profilePictureUrl: extractAvatarUrl(v.user || v),
          score: Number(v.score ?? v.coinCount ?? v.coins ?? v.points ?? 0)
        })).slice(0, 10);
        
        setViewers(mappedViewers);
      }
    });

    socket.on('member-join', (viewer: any) => {
      if (viewer && typeof viewer.memberCount === 'number' && viewer.memberCount > 0) {
        setViewerCount(viewer.memberCount);
      }
    });

    socket.on('battle-msg', (data: any) => {
      const battleId = (data.battleId || data.battleSetting?.battleId || '').toString();
      if (!battleId) return;
      
      setBattles(prev => {
        const existing = prev.find(b => b.battleId === battleId);
        const targetHost = currentTargetUserRef.current.toLowerCase();
        const targetHostId = currentTargetUserIdRef.current;

        let type = existing?.type || '1v1';
        let users: BattleUser[] = existing ? existing.users.map(u => ({ ...u })) : [];
        let result: BattleResult = existing ? existing.result : 'In Progress';

        const teamSource = data.teamArmies || data.team_armies || data.teams || data.battleGroups || data.battleTeams || [];
        const isExplicitTeamMode = (
          (Array.isArray(teamSource) && teamSource.length === 2) ||
          data.battleSetting?.battleType === 2 ||
          data.battleType === 2 ||
          data.battleMode === 'team' ||
          data.battleMode === 2
        );

        if (data.anchorInfo) {
          const anchors = Object.entries(data.anchorInfo);
          if (anchors.length > 2) {
            if (anchors.length === 4) {
              type = (existing?.type === '2v2' || existing?.type === '3v1' || existing?.type === '1v3' || isExplicitTeamMode)
                ? (existing?.type || '2v2')
                : '1v1v1v1';
            } else if (anchors.length === 3) {
              type = (existing?.type === '2v1' || existing?.type === '1v2' || isExplicitTeamMode)
                ? (existing?.type || '2v1')
                : '1v1v1';
            } else {
              type = `${anchors.length}vHosts`;
            }
          }
          
          users = anchors.map(([key, a]: [string, any]) => {
             const extractedUserId = (a.user?.userId ?? a.user?.id ?? key).toString();
             const existingUser = users.find(u => u.userId === extractedUserId || u.originalKey === key.toString());
             
             let initialScore = existingUser ? existingUser.score : 0;
             if (data.armies && data.armies[key]) {
                const mapScore = parseInt(data.armies[key].hostScore ?? data.armies[key].score ?? 0, 10);
                if (!isNaN(mapScore)) initialScore = mapScore;
             }

             return {
               userId: extractedUserId,
               originalKey: key.toString(),
               displayId: (a.user?.displayId || key || 'Unknown').toString(),
               nickname: (a.user?.nickname || a.user?.nickName || a.user?.displayId || key || 'Unknown').toString(),
               profilePictureUrl: extractAvatarUrl(a.user || a) || existingUser?.profilePictureUrl || '',
               score: initialScore,
               teamId: existingUser?.teamId
             };
          });
        }

        // Process team grouping and scores
        const { type: groupedType, sortedUsers } = processTeamGroupingAndSort(users, teamSource, targetHost, targetHostId, type);
        type = groupedType;
        users = sortedUsers;

        let apiHostResult: number | null = null;
        if (data.battleResult && typeof data.battleResult === 'object') {
           Object.entries(data.battleResult).forEach(([key, res]: [string, any]) => {
              if (!res) return;
              const rScore = parseInt(res?.score, 10);
              const uId = res.userId?.toString() ?? key;
              const u = users.find(usr => usr.userId === uId || usr.originalKey === key);
              if (u) {
                if (!isNaN(rScore)) u.score = rScore;
                if (u === users[0] && res.result !== undefined) {
                  apiHostResult = res.result;
                }
              }
           });
        }

        const isCutShort = data.action === 6;
        const isFinished = (
          data.action === 5 ||
          (data.battleSetting?.status === 2 || data.battleSetting?.status === 3) ||
          (data.battleResult && Object.keys(data.battleResult).length > 0)
        );

        if (isCutShort) {
             result = 'Interrupted';
        } else if (isFinished && users.length >= 2) {
             if (apiHostResult === 0) result = 'Victory';
             else if (apiHostResult === 1) result = 'Defeat';
             else if (apiHostResult === 2) result = 'Draw';
             else {
               const isTeamMatch = type === '2v2' || type === '3v1' || type === '1v3' || (type.includes('v') && type !== '1v1' && type !== '1v1v1' && type !== '1v1v1v1');
               if (isTeamMatch) {
                 const t1 = users.filter(u => u.teamId === 0).reduce((s, u) => s + (u.score || 0), 0);
                 const t2 = users.filter(u => u.teamId === 1).reduce((s, u) => s + (u.score || 0), 0);
                 if (t1 > t2) result = 'Victory';
                 else if (t1 < t2) result = 'Defeat';
                 else result = 'Draw';
               } else {
                 const host = users[0];
                 const others = users.slice(1);
                 const maxOtherScore = Math.max(...others.map(o => o.score || 0));
                 if (host.score > maxOtherScore) result = 'Victory';
                 else if (host.score < maxOtherScore) result = 'Defeat';
                 else result = 'Draw';
               }
             }
        } else if (result !== 'Victory' && result !== 'Defeat' && result !== 'Draw' && result !== 'Interrupted' && result !== 'Victoria' && result !== 'Derrota' && result !== 'Empate' && result !== 'Interrumpido') {
             result = 'In Progress';
        }

        const inputDuration = data.battleSetting?.duration;
        const durationSec = inputDuration ? parseInt(inputDuration, 10) : (existing?.duration || 300);
        
        const inputStart = data.battleSetting?.startTimeMs;
        const startMs = inputStart ? parseInt(inputStart, 10) : (existing?.startTimeMs || Date.now());

        if (existing) {
          return prev.map(b => b.battleId === battleId ? { 
            ...b, 
            users, 
            type, 
            result, 
            duration: durationSec, 
            startTimeMs: startMs 
          } : b);
        } else {
          return [{
             battleId,
             startTime: Date.now(),
             type,
             users,
             result,
             duration: durationSec,
             startTimeMs: startMs
          }, ...prev].slice(0, 1000);
        }
      });
    });

    socket.on('raw-battle-msg', (data: any) => {
       const battleId = data.battleId?.toString() || data.battleSetting?.battleId?.toString();
       if (!battleId) return;

       setBattles(prev => {
         const existing = prev.find(b => b.battleId === battleId);
         if (!existing) return prev;
         
         const targetHost = currentTargetUserRef.current.toLowerCase();
         const targetHostId = currentTargetUserIdRef.current;
         let users = existing.users.map(u => ({ ...u }));

         let type = existing.type;
         const teams = data.battleGroups || data.teams || data.teamUsers || data.battleTeams || data.teamArmies || [];
         const { type: groupedType, sortedUsers } = processTeamGroupingAndSort(users, teams, targetHost, targetHostId, type);
         type = groupedType;
         users = sortedUsers;

         return prev.map(b => b.battleId === battleId ? { ...b, type, users } : b);
       });
    });

    socket.on('raw-battle-armies-msg', (data: any) => {
       const battleId = data.battleId?.toString() || data.battleSettings?.battleId?.toString();
       if (!battleId) return;

       setBattles(prev => {
         const existing = prev.find(b => b.battleId === battleId);
         if (!existing) return prev;
         
         const targetHost = currentTargetUserRef.current.toLowerCase();
         const targetHostId = currentTargetUserIdRef.current;
         let users = existing.users.map(u => ({ ...u }));

         let type = existing.type;
         const teamArmies = data.teamArmies || data.team_armies || data.teams || data.battleGroups || [];
         const { type: groupedType, sortedUsers } = processTeamGroupingAndSort(users, teamArmies, targetHost, targetHostId, type);
         type = groupedType;
         users = sortedUsers;

         return prev.map(b => b.battleId === battleId ? { ...b, type, users } : b);
       });
    });

    socket.on('battle-armies-msg', (data: any) => {
      const battleId = (data.battleId || data.battleSettings?.battleId || '').toString();
      if (!battleId) return;

      setBattles(prev => {
        const existing = prev.find(b => b.battleId === battleId);
        if (!existing) return prev;

        const targetHost = currentTargetUserRef.current.toLowerCase();
        const targetHostId = currentTargetUserIdRef.current;

        let result = existing.result;
        let type = existing.type;
        let updatedUsers = existing.users.map(u => ({ ...u }));

        const items = data.battleItems ? Object.entries(data.battleItems) as Array<[string, any]> : [];
        const unassignedUsers = [...updatedUsers];
        const unassignedScores: number[] = [];

        items.forEach(([key, item]) => {
           if (!item) return;
           const extractedUserId = item.anchorIdStr ?? item.userId ?? item.userIdStr ?? item.hostId ?? key;
           const userId = extractedUserId.toString();
           const score = parseInt(item.hostScore ?? item.score ?? item.points ?? 0, 10);
           
           if (!isNaN(score)) {
             const userIndex = unassignedUsers.findIndex(u => 
               u.userId === userId || 
               u.userId === key.toString() || 
               u.originalKey === key.toString() || 
               u.originalKey === userId || 
               u.displayId === userId ||
               (item.hostGroup !== undefined && u.originalKey === item.hostGroup.toString())
             );
             if (userIndex !== -1) {
               const matchedUser = unassignedUsers[userIndex];
               const u = updatedUsers.find(ru => ru.originalKey === matchedUser.originalKey && ru.userId === matchedUser.userId);
               if (u) u.score = score;
               unassignedUsers.splice(userIndex, 1);
             } else {
               unassignedScores.push(score);
             }
           }
        });

        const teamArmies = data.teamArmies || data.team_armies || data.teams || data.battleGroups || [];
        if (teamArmies && Array.isArray(teamArmies)) {
           teamArmies.forEach((team: any) => {
              if (team && team.teamUsers && Array.isArray(team.teamUsers)) {
                 team.teamUsers.forEach((tu: any) => {
                    if (!tu) return;
                    const tScore = parseInt(tu?.score, 10);
                    const tUid = (tu.userIdStr || tu.userId)?.toString();
                    if (!isNaN(tScore) && tUid) {
                       const userIndex = unassignedUsers.findIndex(u => 
                         u.userId === tUid || u.originalKey === tUid || u.displayId === tUid
                       );
                       if (userIndex !== -1) {
                         const matchedUser = unassignedUsers[userIndex];
                         const u = updatedUsers.find(ru => ru.originalKey === matchedUser.originalKey && ru.userId === matchedUser.userId);
                         if (u) u.score = tScore;
                         unassignedUsers.splice(userIndex, 1);
                       } else {
                         const u = updatedUsers.find(ru => ru.userId === tUid || ru.originalKey === tUid || ru.displayId === tUid);
                         if (u) u.score = tScore;
                       }
                    }
                 });
              }
           });
        }

        unassignedUsers.forEach((unmapped, index) => {
           if (index < unassignedScores.length) {
              const u = updatedUsers.find(ru => ru.originalKey === unmapped.originalKey && ru.userId === unmapped.userId);
              if (u) u.score = unassignedScores[index];
           }
        });

        const { type: groupedType, sortedUsers } = processTeamGroupingAndSort(updatedUsers, teamArmies, targetHost, targetHostId, type);
        type = groupedType;
        updatedUsers = sortedUsers;

        if (updatedUsers.length >= 2) {
           if (data.battleStatus === 2) {
             if (result !== 'Interrupted' && result !== 'Interrumpido') {
               const isTeamMatch = type === '2v2' || type === '3v1' || type === '1v3' || (type.includes('v') && type !== '1v1' && type !== '1v1v1' && type !== '1v1v1v1');
               if (isTeamMatch) {
                 const t1 = updatedUsers.filter(u => u.teamId === 0).reduce((s, u) => s + (u.score || 0), 0);
                 const t2 = updatedUsers.filter(u => u.teamId === 1).reduce((s, u) => s + (u.score || 0), 0);
                 if (t1 > t2) result = 'Victory';
                 else if (t1 < t2) result = 'Defeat';
                 else result = 'Draw';
               } else {
                 const host = updatedUsers[0];
                 const others = updatedUsers.slice(1);
                 const maxOtherScore = Math.max(...others.map(o => o.score || 0));
                 if (host.score > maxOtherScore) result = 'Victory';
                 else if (host.score < maxOtherScore) result = 'Defeat';
                 else result = 'Draw';
               }
             }
           } else if (result !== 'Victory' && result !== 'Defeat' && result !== 'Draw' && result !== 'Interrupted' && result !== 'Victoria' && result !== 'Derrota' && result !== 'Empate' && result !== 'Interrumpido') {
             result = 'In Progress';
           }
        }

        return prev.map(b => b.battleId === battleId ? { ...b, type, users: updatedUsers, result } : b);
      });
    });

    socket.on('chat-msg', (msg: ChatMessage) => {
      // Use crypto.randomUUID() to ensure key uniqueness even if TikTok sends duplicate msgIds
      const msgWithUniqueKey = { ...msg, internalId: crypto.randomUUID() };
      setMessages(prev => {
        const newMessages = [...prev, msgWithUniqueKey];
        if (newMessages.length > 100) {
          // Si hay más de 100, eliminamos los 20 más antiguos (nos quedamos con los últimos 80)
          return newMessages.slice(-80);
        }
        return newMessages;
      });
    });

    socket.on('like-msg', (msg: LikeMessage) => {
      const addedLikes = msg.likeCount && msg.likeCount > 0 ? msg.likeCount : 1;

      setStats(prev => {
        let newTotal = prev.likes + addedLikes;
        if (msg.totalLikeCount !== undefined && typeof msg.totalLikeCount === 'number' && msg.totalLikeCount > 0) {
          newTotal = Math.max(newTotal, msg.totalLikeCount);
        }
        return {
          ...prev,
          likes: newTotal
        };
      });

      // Update the cumulative likers map
      setLikersMap(prev => {
        const existing = prev[msg.uniqueId];
        const currentLikes = existing ? existing.likes + addedLikes : addedLikes;

        return {
          ...prev,
          [msg.uniqueId]: {
            uniqueId: msg.uniqueId,
            nickname: msg.nickname,
            profilePictureUrl: msg.profilePictureUrl,
            likes: currentLikes
          }
        };
      });
    });

    socket.on('gift-msg', (msg: GiftMessage) => {
      const giftCount = msg.repeatCount || 1;
      const rawDiamond = msg.diamondCount || 0;
      const giftName = msg.giftName || 'Regalo';
      const unitCoins = resolveGiftCoins(giftName, rawDiamond > 0 ? rawDiamond : undefined);
      const giftCoins = unitCoins * giftCount;
      const key = (msg.userId || msg.uniqueId || 'anonymous').toString();
      const isEnded = Boolean(msg.repeatEnd);
      const groupId = msg.groupId || '';
      const comboCount = msg.comboCount || msg.totalRepeatCount || giftCount;
      const isCombo = Boolean(msg.isCombo || comboCount > 1 || groupId);

      setGiftersMap(prev => {
        const existing = prev[key];
        const newTotalGifts = (existing?.totalGifts || 0) + giftCount;
        const newTotalCoins = (existing?.totalCoins || 0) + giftCoins;
        
        const existingHistory = existing?.history || [];
        const recentRecord = existingHistory[0];

        // Check if this incoming gift is continuation of the exact same active ongoing combo
        const isSameOngoingCombo = Boolean(
          recentRecord &&
          !recentRecord.isEnded &&
          recentRecord.giftName === giftName &&
          recentRecord.isCombo &&
          (
            (groupId && recentRecord.groupId && groupId === recentRecord.groupId) ||
            (!groupId && !recentRecord.groupId && (Date.now() - recentRecord.timestamp < 3500) && comboCount >= (recentRecord.comboCount || 1))
          )
        );

        let updatedHistory: GiftRecord[];

        if (isSameOngoingCombo && recentRecord) {
          const updatedRecord: GiftRecord = {
            ...recentRecord,
            giftCount: comboCount,
            comboCount: comboCount,
            coins: comboCount * unitCoins,
            isEnded: isEnded,
            timestamp: Date.now()
          };
          updatedHistory = [updatedRecord, ...existingHistory.slice(1)];
        } else {
          const newRecord: GiftRecord = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            giftName: giftName,
            giftCount: isCombo ? comboCount : giftCount,
            coins: isCombo ? (comboCount * unitCoins) : giftCoins,
            isCombo: isCombo,
            comboCount: isCombo ? comboCount : undefined,
            groupId: groupId || undefined,
            isEnded: isEnded || !isCombo,
            timestamp: Date.now()
          };
          updatedHistory = [newRecord, ...existingHistory].slice(0, 200);
        }

        return {
          ...prev,
          [key]: {
            userId: key,
            uniqueId: msg.uniqueId,
            nickname: msg.nickname,
            profilePictureUrl: msg.profilePictureUrl || existing?.profilePictureUrl || '',
            avatarUrl: msg.profilePictureUrl || existing?.avatarUrl || '',
            giftsSent: newTotalGifts,
            totalGifts: newTotalGifts,
            totalCoins: newTotalCoins,
            lastGiftName: giftName,
            lastGiftCount: giftCount,
            lastGiftIsCombo: isCombo,
            lastGiftComboCount: comboCount,
            lastGiftTimestamp: Date.now(),
            history: updatedHistory
          }
        };
      });

      // Synchronize with backend GET /api/gifters/top10
      fetch('/api/gifters/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentTargetUserRef.current || 'default',
          userId: key,
          uniqueId: msg.uniqueId,
          nickname: msg.nickname,
          avatarUrl: msg.profilePictureUrl,
          giftName: giftName,
          giftCount: giftCount,
          coins: giftCoins,
          isCombo: isCombo,
          comboCount: comboCount,
          repeatEnd: isEnded,
          groupId: groupId,
        })
      }).catch(() => {});
    });

    socket.on('event-msg', (msg: EventMessage) => {
      if (msg.type?.includes('follow')) {
        setStats(prev => ({ ...prev, followers: prev.followers + 1 }));
      }
    });

    socket.on('error', (err: string) => {
      setStatus('error');
      setError(err);
      setIsConnected(false);
    });

    socket.on('status', (s: string) => {
      if (s === 'reconnecting') {
        setStatus('connecting');
      } else if (s === 'connected') {
        setIsConnected(true);
        setStatus('connected');
        setError(null);
      } else if (s === 'disconnected' || s === 'ended') {
        setIsConnected(false);
        setStatus('idle');
        
        if (s === 'ended') {
          setLikersMap({});
          setStats(prev => ({ ...prev, likes: 0 }));
          setViewerCount(0);
        }
      }
    });

    socket.on('reconnecting', () => {
      setStatus('connecting');
    });

    return () => {
      socket.off('connected');
      socket.off('viewer-count');
      socket.off('total-likes-update');
      socket.off('room-update');
      socket.off('ranking-update');
      socket.off('member-join');
      socket.off('chat-msg');
      socket.off('like-msg');
      socket.off('gift-msg');
      socket.off('top-gifters-update');
      socket.off('event-msg');
      socket.off('battle-msg');
      socket.off('battle-armies-msg');
      socket.off('error');
      socket.off('status');
      socket.off('reconnecting');
    };
  }, [socket]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    setStatus('connecting');
    setError(null);
    setMessages([]);
    
    if (currentUsername && currentUsername.toLowerCase() !== username.toLowerCase()) {
      setStats({ likes: 0, followers: 0 });
      setLikersMap({});
      setGiftersMap({});
      setBattles([]);
      setHostAvatar('');
      setHostNickname('');
      setStreamStartTime(null);
    }
    connectionStartTimeRef.current = Math.floor(Date.now() / 1000);

    const clean = username.trim().replace(/^@/, '');
    fetch(`/api/tiktok-user/${encodeURIComponent(clean)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.avatarUrl) setHostAvatar(data.avatarUrl);
        if (data?.nickname) setHostNickname(data.nickname);
        if (data?.startTime && data.startTime > 0) setStreamStartTime(data.startTime);
      })
      .catch(() => {});
    
    await socket.connect({
      uniqueId: username
    });
  };

  const handleDisconnect = () => {
    socket.disconnect();
    setIsConnected(false);
    setStatus('idle');
    setHostAvatar('');
    setHostNickname('');
    setViewerCount(0);
    setStreamStartTime(null);
  };

  const topLikers = useMemo(() => {
    return (Object.values(likersMap) as TopLiker[]).sort((a, b) => b.likes - a.likes).slice(0, 5);
  }, [likersMap]);

  const topGifters = useMemo(() => {
    return (Object.values(giftersMap) as TopGifter[])
      .sort((a, b) => {
        if (b.totalCoins === a.totalCoins) {
          return b.lastGiftTimestamp - a.lastGiftTimestamp;
        }
        return b.totalCoins - a.totalCoins;
      })
      .slice(0, 10);
  }, [giftersMap]);

  const totalBattlePages = Math.ceil(battles.length / BATTLES_PER_PAGE);
  const currentBattles = battles.slice((battlePage - 1) * BATTLES_PER_PAGE, battlePage * BATTLES_PER_PAGE);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 p-4 flex justify-between items-center bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-indigo-400" />
          <div>
            <h1 className="font-sans font-bold tracking-tight text-xl text-zinc-100 flex items-center gap-2">
              Tik Live Monitor
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-zinc-800 rounded-full bg-zinc-900/50 shadow-inner">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
            <span className="text-[11px] font-medium tracking-wide text-zinc-300">
              {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-8 flex flex-col gap-8">
        
        {/* Top Connection Form */}
        <section className="border border-zinc-800 bg-zinc-900/50 rounded-xl p-6 relative overflow-hidden backdrop-blur-xl shadow-xl w-full">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-50 pointer-events-none" />
          <form onSubmit={handleConnect} className="flex flex-col md:flex-row gap-4 relative z-10 items-end">
            <div className="flex-1 w-full space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Target User</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="w-full pl-9 pr-4 py-3 bg-zinc-950/50 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-zinc-100 placeholder:text-zinc-600 shadow-inner"
                />
              </div>
            </div>

            {isConnected ? (
              <button 
                type="button"
                onClick={handleDisconnect}
                className="w-full md:w-48 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 h-[50px]"
              >
                Disconnect
              </button>
            ) : (
              <button 
                type="submit"
                disabled={status === 'connecting'}
                className="w-full md:w-48 bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] h-[50px]"
              >
                {status === 'connecting' ? 'Connecting...' : 'Connect'}
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm flex items-center gap-2 relative z-10"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </section>

        {/* Top Summary / Stats Layout */}
        <section className={`grid gap-4 ${isConnected ? 'grid-cols-2 md:grid-cols-12' : 'grid-cols-2'}`}>
          {isConnected && (
            <div className="col-span-2 md:col-span-6 border border-zinc-800 bg-zinc-900/50 rounded-xl p-5 backdrop-blur-md shadow-lg flex items-center">
              <div className="flex items-center gap-4 min-w-0 w-full">
                <Avatar 
                  src={hostAvatar}
                  name={hostNickname || currentUsername}
                  sizeClassName="w-14 h-14"
                  roundedClassName="rounded-2xl"
                  className="border border-zinc-700 font-bold text-xl shadow-inner shrink-0"
                />
                <div className="min-w-0 flex-1">
                  {/* Row 1: Streamer Name + Unique ID to its right */}
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="font-bold text-base md:text-lg leading-tight text-zinc-100 truncate">
                      {hostNickname || currentUsername}
                    </h3>
                    <span className="text-xs text-zinc-400 font-medium truncate">
                      @{currentUsername}
                    </span>
                  </div>

                  {/* Row 2: Green LIVE badge + Watch Live Button + Live Time (desktop: same row, mobile: Live Time on row below) */}
                  <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium shrink-0 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      LIVE
                    </span>

                    <a 
                      href={`https://www.tiktok.com/@${currentUsername}/live`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 transition-all shadow-sm active:scale-95 shrink-0"
                    >
                      <span>Watch Live</span>
                      <ExternalLink className="w-3 h-3 text-indigo-400" />
                    </a>

                    {/* Live Time: On desktop (md+) sits on the same row; on mobile (<md) wraps to the row below */}
                    <div className="w-full md:w-auto mt-1 md:mt-0">
                      <div 
                        className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg bg-zinc-950/70 border border-indigo-500/30 text-zinc-300 shadow-inner group transition-colors hover:border-indigo-500/50"
                        title={streamStartTime ? `Stream start time: ${new Date(streamStartTime * 1000).toLocaleTimeString()}` : 'Live stream elapsed time'}
                      >
                        <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0 animate-pulse" />
                        <span className="text-zinc-400 text-[11px] font-sans">Live Time:</span>
                        <span className="font-semibold text-indigo-300 tracking-tight font-mono">
                          {streamUptimeString}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Viewers Card */}
          <div className={`${isConnected ? 'col-span-1 md:col-span-3' : 'col-span-1'} border border-zinc-800 bg-zinc-900/50 rounded-xl p-5 flex flex-col justify-between backdrop-blur-md shadow-lg space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Viewers</span>
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <span className="text-2xl lg:text-3xl font-bold tracking-tight text-zinc-100">{formatNumberWithDots(viewerCount)}</span>
            </div>
          </div>

          {/* Total Likes Card */}
          <div className={`${isConnected ? 'col-span-1 md:col-span-3' : 'col-span-1'} border border-zinc-800 bg-zinc-900/50 rounded-xl p-5 flex flex-col justify-between backdrop-blur-md shadow-lg space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Total Likes</span>
              <Heart className="w-4 h-4 text-rose-500" />
            </div>
            <div>
              <span className="text-2xl lg:text-3xl font-bold tracking-tight text-zinc-100">{formatNumberWithDots(stats.likes)}</span>
            </div>
          </div>
        </section>

        {/* Content Layout */}
        <div className="flex flex-col gap-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Ranking Top 10 Viewers Section */}
            <section className="lg:col-span-3 border border-zinc-800 bg-zinc-900/50 rounded-xl p-4 relative overflow-hidden backdrop-blur-md shadow-lg flex flex-col h-[400px]">
            <div className="flex flex-col h-full space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 shrink-0">
                <span className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" /> Top Viewers
                </span>
                <span className="text-[10px] font-medium tracking-wider text-emerald-400 uppercase bg-emerald-400/10 px-2 py-0.5 rounded-full">Live</span>
              </div>
              
              <div className="space-y-2 overflow-y-auto pr-2 flex-1 relative custom-scrollbar">
                {viewers.length > 0 ? (
                  viewers.map((viewer, idx) => (
                    <motion.div 
                      key={viewer.uniqueId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 300, delay: idx * 0.05 }}
                      className="flex items-center gap-3 p-2 bg-zinc-950/30 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800/50 rounded-lg transition-all group"
                    >
                      <div className={`w-7 h-7 flex items-center justify-center font-mono font-bold text-[11px] rounded-full shrink-0 shadow-sm
                        ${idx === 0 ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30' : 
                          idx === 1 ? 'bg-zinc-300/20 text-zinc-300 border border-zinc-400/30' : 
                          idx === 2 ? 'bg-orange-400/20 text-orange-400 border border-orange-400/30' : 
                          'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                        {idx + 1}
                      </div>
                      <Avatar 
                        src={viewer.profilePictureUrl} 
                        name={viewer.nickname || viewer.uniqueId} 
                        sizeClassName="w-9 h-9" 
                        className="border border-zinc-800 shadow-sm"
                      />
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-[13px] font-medium truncate text-zinc-200">{viewer.nickname}</p>
                        <p className="text-[11px] text-zinc-500 truncate">@{viewer.uniqueId}</p>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        {formatViewerScore(viewer.score) ? (
                          <span className="font-mono text-xs sm:text-[13px] font-bold text-indigo-300">
                            {formatViewerScore(viewer.score)}
                          </span>
                        ) : null}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-zinc-950/20 border border-zinc-800/30 rounded-lg animate-pulse">
                      <div className="w-7 h-7 bg-zinc-800 rounded-full shrink-0" />
                      <div className="w-9 h-9 bg-zinc-800 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-2.5 bg-zinc-800 rounded-full w-2/3" />
                        <div className="h-2 bg-zinc-800/50 rounded-full w-1/2" />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {viewers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center p-4 pt-10 pointer-events-none">
                   <p className="text-[11px] text-zinc-500 text-center italic mt-10">Esperando datos de audiencia...</p>
                </div>
              )}
            </div>
          </section>

          {/* Live Chat Section */}
          <section className="lg:col-span-6 flex flex-col h-[400px]">
            <div className="border border-zinc-800 bg-zinc-900/50 rounded-xl flex flex-col h-full overflow-hidden relative shadow-lg backdrop-blur-sm">
              <div className="bg-zinc-950/80 border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4 text-indigo-400" />
                  <span className="text-[11px] font-semibold tracking-wider text-zinc-200 uppercase">Live Chat</span>
                </div>
              </div>

              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-5 space-y-5 scroll-smooth relative z-10 custom-scrollbar"
              >
                <AnimatePresence initial={false}>
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-zinc-500">
                      <Users className="w-12 h-12 opacity-50" />
                      <p className="text-sm font-medium">
                        {status === 'connected' ? 'Esperando mensajes...' : 'Esperando conexión...'}
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <motion.div
                        key={msg.internalId || msg.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="group flex gap-3.5 items-start"
                      >
                        <Avatar 
                          src={msg.profilePictureUrl} 
                          name={msg.nickname || msg.uniqueId} 
                          sizeClassName="w-9 h-9 lg:w-10 lg:h-10" 
                          className="border border-zinc-700 shadow-sm"
                        />
                        <div className="flex-1 min-w-0 bg-zinc-800/40 p-3 rounded-2xl rounded-tl-sm border border-zinc-700/50 shadow-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-[13px] text-zinc-200">
                              {msg.nickname}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-300 leading-relaxed break-words">
                            {msg.comment}
                          </p>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>

          {/* Ranking Top 10 Likers Section */}
          <section className="lg:col-span-3 border border-zinc-800 bg-zinc-900/50 rounded-xl p-4 relative overflow-hidden backdrop-blur-md shadow-lg flex flex-col h-[400px]">
            <div className="flex flex-col h-full space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 shrink-0">
                <span className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" /> Top Tappers
                </span>
              </div>
              
              <div className="space-y-2 overflow-y-auto pr-2 flex-1 relative custom-scrollbar">
                {topLikers.length > 0 ? (
                  topLikers.map((liker, idx) => (
                    <motion.div 
                      key={liker.uniqueId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 300, delay: idx * 0.05 }}
                      className="flex items-center gap-3 p-2 bg-zinc-950/30 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800/50 rounded-lg transition-all group"
                    >
                      <div className={`w-7 h-7 flex items-center justify-center font-mono font-bold text-[11px] rounded-full shrink-0 shadow-sm
                        ${idx === 0 ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30' : 
                          idx === 1 ? 'bg-zinc-300/20 text-zinc-300 border border-zinc-400/30' : 
                          idx === 2 ? 'bg-orange-400/20 text-orange-400 border border-orange-400/30' : 
                          'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                        {idx + 1}
                      </div>
                      <Avatar 
                        src={liker.profilePictureUrl} 
                        name={liker.nickname || liker.uniqueId} 
                        sizeClassName="w-9 h-9" 
                        className="border border-zinc-800 shadow-sm"
                      />
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-[13px] font-medium truncate text-zinc-200">{liker.nickname}</p>
                        <p className="text-[11px] text-zinc-500 truncate">@{liker.uniqueId}</p>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="font-sans text-[13px] font-bold text-rose-500 flex items-center gap-1.5 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                          <Heart className="w-3.5 h-3.5 fill-current" />
                          {liker.likes.toLocaleString()}
                        </span>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-zinc-950/20 border border-zinc-800/30 rounded-lg animate-pulse">
                      <div className="w-7 h-7 bg-zinc-800 rounded-full shrink-0" />
                      <div className="w-9 h-9 bg-zinc-800 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-2.5 bg-zinc-800 rounded-full w-2/3" />
                        <div className="h-2 bg-zinc-800/50 rounded-full w-1/2" />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {topLikers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center p-4 pt-10 pointer-events-none">
                  <p className="text-[11px] text-zinc-500 text-center italic mt-10">Esperando datos de likes...</p>
                </div>
              )}
            </div>
          </section>
          </div>

          {/* Battle History Section */}
          <section className="border border-zinc-800 bg-zinc-900/50 rounded-xl flex flex-col overflow-hidden relative shadow-lg backdrop-blur-md">
            <div className="bg-zinc-950/80 border-b border-zinc-800 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                <span className="font-semibold tracking-wider text-zinc-200">Battle History</span>
              </div>
              <span className="text-[11px] font-medium text-zinc-500 uppercase bg-zinc-800/50 px-2 py-0.5 rounded-full">{battles.length} Battles</span>
            </div>

            {(() => {
              const activeBattle = battles.find(b => b.result === 'In Progress' || b.result === 'En curso');
              if (!activeBattle) return null;

              const type = activeBattle.type;
              const isFFA = type === '1v1v1v1' || type === '1v1v1';
              const isTeamMatch = type === '2v2' || type === '3v1' || type === '1v3' || (type.includes('v') && type !== '1v1' && !isFFA);

              const team1Users = isTeamMatch 
                ? activeBattle.users.filter(u => u && (u.teamId === 0 || (u.teamId === undefined && (u === activeBattle.users[0] || (type === '2v2' && activeBattle.users.indexOf(u) === 1) || (type === '3v1' && activeBattle.users.indexOf(u) < 3)))))
                : [activeBattle.users[0]].filter(Boolean);
                
              const team2Users = isTeamMatch 
                ? activeBattle.users.filter(u => u && (u.teamId === 1 || (!team1Users.includes(u) && u !== activeBattle.users[0])))
                : activeBattle.users.slice(1).filter(Boolean);

              const team1Score = team1Users.reduce((sum, u) => sum + (u?.score || 0), 0);
              const team2Score = team2Users.reduce((sum, u) => sum + (u?.score || 0), 0);

              // Calculate point difference & leader details
              let pointDiff = 0;
              let leaderLabel = '';
              let isTie = false;

              if (isTeamMatch) {
                pointDiff = Math.abs(team1Score - team2Score);
                if (team1Score > team2Score) leaderLabel = 'Host Team';
                else if (team2Score > team1Score) leaderLabel = 'Rival Team';
                else isTie = true;
              } else if (isFFA) {
                const sortedByScore = [...(activeBattle.users || [])].filter(Boolean).sort((a, b) => (b?.score || 0) - (a?.score || 0));
                const top1 = sortedByScore[0];
                const top2 = sortedByScore[1];
                const score1 = top1?.score || 0;
                const score2 = top2?.score || 0;
                pointDiff = score1 - score2;
                if (score1 > score2) leaderLabel = top1?.nickname || top1?.displayId || 'Leader';
                else isTie = true;
              } else {
                const score1 = activeBattle.users[0]?.score || 0;
                const score2 = activeBattle.users[1]?.score || 0;
                pointDiff = Math.abs(score1 - score2);
                if (score1 > score2) leaderLabel = activeBattle.users[0]?.nickname || activeBattle.users[0]?.displayId || 'Host';
                else if (score2 > score1) leaderLabel = activeBattle.users[1]?.nickname || activeBattle.users[1]?.displayId || 'Rival';
                else isTie = true;
              }

              return (
                <div className="p-5 border-b border-zinc-800 bg-gradient-to-r from-zinc-950/90 via-zinc-900/60 to-rose-950/20">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                          Battle in Progress <span className="text-xs bg-rose-500/20 text-rose-300 font-mono px-2 py-0.5 rounded border border-rose-500/30">{type}</span>
                        </h4>
                        <p className="text-xs text-zinc-400">
                          {isTeamMatch ? 'Real-time synchronized team battle' : isFFA ? `Free-for-all battle (${type})` : '1 vs 1 real-time battle'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center">
                      {/* Point Difference Badge & Leader */}
                      <div className="flex items-center gap-2.5 bg-zinc-900/80 px-3.5 py-2 rounded-lg border border-zinc-800 shadow-md">
                        <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">Difference:</span>
                          <span className="text-base font-black font-mono text-emerald-400">
                            +{formatScore(pointDiff)} <span className="text-xs font-normal text-emerald-400/80">pts</span>
                          </span>
                        </div>
                        {!isTie ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 truncate max-w-[150px]" title={`${leaderLabel} is leading`}>
                            👑 {leaderLabel}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            ⚖️ Tie
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Comparative progress bar with embedded percentages only, and clean bottom layout */}
                  {(() => {
                    if (isFFA) {
                      const total = (activeBattle.users || []).reduce((sum, u) => sum + (u?.score || 0), 0);
                      const colors = [
                        'bg-gradient-to-r from-rose-500 to-pink-500', 
                        'bg-gradient-to-r from-indigo-500 to-indigo-600', 
                        'bg-gradient-to-r from-amber-500 to-amber-600', 
                        'bg-gradient-to-r from-emerald-500 to-emerald-600'
                      ];
                      return (
                        <div className="mt-4 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/70 space-y-2">
                          <div className="h-5 w-full bg-zinc-800/90 rounded-md overflow-hidden flex shadow-inner">
                            {(activeBattle.users || []).map((u, i) => {
                              const defaultPct = (activeBattle.users || []).length > 0 ? 100 / activeBattle.users.length : 25;
                              const userScore = u?.score || 0;
                              const pct = total > 0 ? (userScore / total) * 100 : defaultPct;
                              return (
                                <div 
                                  key={u?.userId || i} 
                                  className={`${colors[i % colors.length]} h-full flex items-center justify-center px-1 text-white font-mono font-bold text-[11px] whitespace-nowrap overflow-hidden transition-all duration-500`} 
                                  style={{ width: `${pct}%` }}
                                  title={`@${u?.displayId || 'user'}: ${pct.toFixed(1)}%`}
                                >
                                  {pct >= 8 ? (
                                    <span className="drop-shadow-sm leading-none">{pct.toFixed(1)}%</span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between items-center text-xs font-mono">
                            <span className="text-rose-400 font-bold">Host</span>
                            <div className="flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20 text-amber-300 font-mono text-xs font-bold shadow-sm">
                              <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                              <span>{formatBattleTime(activeBattle)}</span>
                            </div>
                            <span className="text-indigo-400 font-bold">Rivals</span>
                          </div>
                        </div>
                      );
                    } else {
                      const score1 = isTeamMatch ? team1Score : (activeBattle.users[0]?.score || 0);
                      const score2 = isTeamMatch ? team2Score : (activeBattle.users[1]?.score || 0);
                      const total = score1 + score2;
                      const pct1 = total > 0 ? (score1 / total) * 100 : 50;
                      const pct2 = 100 - pct1;

                      return (
                        <div className="mt-4 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/70 space-y-2">
                          <div className="h-5 w-full bg-zinc-800/90 rounded-md overflow-hidden flex shadow-inner">
                            {/* Host Team / Host Segment */}
                            <div 
                              className="bg-gradient-to-r from-rose-500 to-pink-500 h-full flex items-center justify-center px-1.5 text-white font-mono font-bold text-[11px] whitespace-nowrap overflow-hidden transition-all duration-500" 
                              style={{ width: `${pct1}%` }}
                              title={`${isTeamMatch ? 'Host Team' : 'Host'}: ${pct1.toFixed(1)}%`}
                            >
                              {pct1 >= 8 ? (
                                <span className="drop-shadow-sm leading-none">{pct1.toFixed(1)}%</span>
                              ) : null}
                            </div>

                            {/* Rival Team / Rival Segment */}
                            <div 
                              className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full flex items-center justify-center px-1.5 text-white font-mono font-bold text-[11px] whitespace-nowrap overflow-hidden flex-1 transition-all duration-500"
                              title={`${isTeamMatch ? 'Rival Team' : 'Rival'}: ${pct2.toFixed(1)}%`}
                            >
                              {pct2 >= 8 ? (
                                <span className="drop-shadow-sm leading-none">{pct2.toFixed(1)}%</span>
                              ) : null}
                            </div>
                          </div>

                          {/* Bottom Row: Host Team on left, Animated remaining time in center, Rival Team on right */}
                          <div className="flex justify-between items-center text-xs font-mono">
                            <span className="text-rose-400 font-bold tracking-wide">{isTeamMatch ? 'Host Team' : 'Host'}</span>
                            <div className="flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20 text-amber-300 font-mono text-xs font-bold shadow-sm">
                              <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                              <span>{formatBattleTime(activeBattle)}</span>
                            </div>
                            <span className="text-indigo-400 font-bold tracking-wide">{isTeamMatch ? 'Rival Team' : 'Rival'}</span>
                          </div>
                        </div>
                      );
                    }
                  })()}

                  {/* Rendering for Team Match (2v2, 3v1, etc.) */}
                  {isTeamMatch && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                      {/* Team 1 (Host's Team) */}
                      <div className="bg-rose-950/20 p-4 rounded-xl border border-rose-500/30 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between border-b border-rose-500/20 pb-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold font-mono text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                                Host Team (You)
                              </span>
                              {team1Score > team2Score && (
                                <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  +{formatScore(pointDiff)} pts
                                </span>
                              )}
                            </div>
                            <span className="text-xl font-black font-mono text-rose-300">{formatScore(team1Score)}</span>
                          </div>
                          <div className="space-y-2">
                            {team1Users.map((u, i) => (
                              <div key={u?.userId || i} className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60">
                                <div className="flex items-center gap-2.5">
                                  <Avatar 
                                    src={u?.profilePictureUrl} 
                                    name={u?.nickname || u?.displayId || 'User'} 
                                    sizeClassName="w-7 h-7" 
                                    className="border border-rose-500/30 text-xs font-mono" 
                                  />
                                  <div>
                                    <span className="text-xs font-bold text-zinc-200 block">{u?.nickname || u?.displayId || 'User'}</span>
                                    <span className="text-[10px] text-zinc-400 block">@{u?.displayId || 'user'}</span>
                                  </div>
                                </div>
                                <span className="font-mono font-bold text-sm text-rose-300">{formatScore(u?.score || 0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Team 2 (Rivals' Team) */}
                      <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/30 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold font-mono text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                                Rival Team
                              </span>
                              {team2Score > team1Score && (
                                <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  +{formatScore(pointDiff)} pts
                                </span>
                              )}
                            </div>
                            <span className="text-xl font-black font-mono text-indigo-300">{formatScore(team2Score)}</span>
                          </div>
                          <div className="space-y-2">
                            {team2Users.map((u, i) => (
                              <div key={u?.userId || i} className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60">
                                <div className="flex items-center gap-2.5">
                                  <Avatar 
                                    src={u?.profilePictureUrl} 
                                    name={u?.nickname || u?.displayId || 'User'} 
                                    sizeClassName="w-7 h-7" 
                                    className="border border-indigo-500/30 text-xs font-mono" 
                                  />
                                  <div>
                                    <span className="text-xs font-bold text-zinc-200 block">{u?.nickname || u?.displayId || 'User'}</span>
                                    <span className="text-[10px] text-zinc-400 block">@{u?.displayId || 'user'}</span>
                                  </div>
                                </div>
                                <span className="font-mono font-bold text-sm text-indigo-300">{formatScore(u?.score || 0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rendering for Free-For-All (1v1v1 / 1v1v1v1) */}
                  {isFFA && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {(activeBattle.users || []).map((u, i) => {
                        const isLeader = (u?.nickname || u?.displayId) === leaderLabel;
                        return (
                          <div key={u?.userId || i} className={`p-3.5 rounded-xl border flex flex-col justify-between ${i === 0 ? 'bg-rose-950/30 border-rose-500/40' : 'bg-zinc-900/50 border-zinc-800/60'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Avatar 
                                  src={u?.profilePictureUrl} 
                                  name={u?.nickname || u?.displayId || 'User'} 
                                  sizeClassName="w-7 h-7" 
                                  className="border border-zinc-700 text-xs font-mono" 
                                />
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-zinc-200 block truncate">{u?.nickname || u?.displayId || 'User'}</span>
                                  <span className="text-[10px] text-zinc-400 block truncate">@{u?.displayId || 'user'}</span>
                                </div>
                              </div>
                              {isLeader && !isTie && (
                                <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                  +{formatScore(pointDiff)} pts
                                </span>
                              )}
                            </div>
                            <div className="pt-2 border-t border-zinc-800/50 flex justify-between items-center">
                              <span className="text-[10px] font-mono uppercase text-zinc-500">{i === 0 ? 'Host' : `Player ${i+1}`}</span>
                              <span className={`text-lg font-black font-mono ${i === 0 ? 'text-rose-400' : 'text-indigo-400'}`}>{formatScore(u?.score || 0)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Rendering for 1v1 */}
                  {!isTeamMatch && !isFFA && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <div className="bg-rose-950/20 p-4 rounded-xl border border-rose-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar 
                            src={activeBattle.users[0]?.profilePictureUrl} 
                            name={activeBattle.users[0]?.nickname || activeBattle.users[0]?.displayId || 'Host'} 
                            sizeClassName="w-9 h-9" 
                            className="border border-rose-500/40 text-xs font-mono" 
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-500 block uppercase font-mono tracking-wider">Host (You)</span>
                              {(activeBattle.users[0]?.score || 0) > (activeBattle.users[1]?.score || 0) && (
                                <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  +{formatScore(pointDiff)} pts
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-bold text-rose-300 block">{activeBattle.users[0]?.nickname || activeBattle.users[0]?.displayId || 'Host'}</span>
                            <span className="text-[11px] text-zinc-400 block">@{activeBattle.users[0]?.displayId || 'Host'}</span>
                          </div>
                        </div>
                        <span className="text-2xl font-black font-mono text-rose-300">{formatScore(activeBattle.users[0]?.score || 0)}</span>
                      </div>

                      <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar 
                            src={activeBattle.users[1]?.profilePictureUrl} 
                            name={activeBattle.users[1]?.nickname || activeBattle.users[1]?.displayId || 'Rival'} 
                            sizeClassName="w-9 h-9" 
                            className="border border-indigo-500/40 text-xs font-mono" 
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-500 block uppercase font-mono tracking-wider">Rival</span>
                              {(activeBattle.users[1]?.score || 0) > (activeBattle.users[0]?.score || 0) && (
                                <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  +{formatScore(pointDiff)} pts
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-bold text-indigo-300 block">{activeBattle.users[1]?.nickname || activeBattle.users[1]?.displayId || 'Rival'}</span>
                            <span className="text-[11px] text-zinc-400 block">@{activeBattle.users[1]?.displayId || 'Rival'}</span>
                          </div>
                        </div>
                        <span className="text-2xl font-black font-mono text-indigo-300">{formatScore(activeBattle.users[1]?.score || 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-400 bg-zinc-950/50 uppercase border-b border-zinc-800">
                  <tr>
                    <th className="px-2.5 sm:px-6 py-3 sm:py-4 font-semibold">Date</th>
                    <th className="px-2.5 sm:px-6 py-3 sm:py-4 font-semibold">Type</th>
                    <th className="px-2.5 sm:px-6 py-3 sm:py-4 font-semibold">Opponent(s) / Teams</th>
                    <th className="px-2.5 sm:px-6 py-3 sm:py-4 font-semibold text-center">Score</th>
                    <th className="px-2.5 sm:px-6 py-3 sm:py-4 font-semibold text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {currentBattles.length > 0 ? (
                    currentBattles.map((battle) => {
                      const type = battle.type;
                      const isFFA = type === '1v1v1v1' || type === '1v1v1';
                      const isTeamMatch = type === '2v2' || type === '3v1' || type === '1v3' || (type.includes('v') && type !== '1v1' && !isFFA);

                      const team1 = isTeamMatch
                        ? (battle.users || []).filter(u => u && (u.teamId === 0 || (u.teamId === undefined && (u === battle.users[0] || (type === '2v2' && battle.users.indexOf(u) === 1) || (type === '3v1' && battle.users.indexOf(u) < 3)))))
                        : [battle.users?.[0]].filter(Boolean);
                      const team2 = isTeamMatch
                        ? (battle.users || []).filter(u => u && (u.teamId === 1 || (!team1.includes(u) && u !== battle.users[0])))
                        : (battle.users || []).slice(1).filter(Boolean);

                      const team1Score = team1.reduce((sum, u) => sum + (u?.score || 0), 0);
                      const team2Score = team2.reduce((sum, u) => sum + (u?.score || 0), 0);

                      // Calculate top 2 highest scores among all participants in this battle
                      const sortedScores = [...(battle.users || []).map(u => u?.score || 0)].sort((a, b) => b - a);
                      const topScores = sortedScores.filter(s => s > 0).slice(0, 2);

                      const isTop2Score = (score?: number) => {
                        if (!score || score <= 0) return false;
                        return topScores.includes(score);
                      };

                      return (
                        <tr key={battle.battleId} className="bg-zinc-900/20 hover:bg-zinc-800/30 transition-colors">
                          <td className="px-2.5 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-zinc-300 font-mono text-xs">
                            <div className="flex flex-col items-center sm:block sm:text-left">
                              <span>
                                {new Intl.DateTimeFormat('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric'
                                }).format(new Date(battle.startTime))}
                              </span>
                              <span className="hidden sm:inline">, </span>
                              <span className="text-center sm:text-left sm:inline">
                                {new Intl.DateTimeFormat('en-US', {
                                  hour: 'numeric', minute: '2-digit', hour12: true
                                }).format(new Date(battle.startTime))}
                              </span>
                            </div>
                          </td>
                          <td className="px-2.5 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-indigo-300 border border-zinc-700 text-xs font-mono font-bold">
                              {battle.type}
                            </span>
                          </td>
                          <td className="px-2.5 sm:px-6 py-3 sm:py-4">
                            {isTeamMatch ? (
                              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-2.5">
                                <div className="w-fit inline-flex flex-col bg-rose-950/40 p-2.5 rounded-lg border border-rose-500/30">
                                  <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-1.5">Host Team</span>
                                  <div className="flex flex-col gap-1.5 w-full">
                                    {team1.map((u, uIdx) => {
                                      const isTop = isTop2Score(u?.score);
                                      const avatarSrc = u?.profilePictureUrl || (u?.userId === currentTargetUserIdRef.current || u?.displayId?.toLowerCase() === currentUsername?.toLowerCase() ? hostAvatar : '');
                                      return (
                                        <div key={u?.userId || uIdx} className="w-full flex items-center justify-between gap-3 bg-rose-900/30 px-2.5 py-1.5 rounded-md border border-rose-500/20">
                                          <div className="flex items-center gap-2 text-left min-w-0">
                                            <Avatar 
                                              src={avatarSrc} 
                                              name={u?.nickname || u?.displayId || 'User'} 
                                              sizeClassName="w-6 h-6 sm:w-7 sm:h-7" 
                                              className="border border-rose-500/30 text-[10px] font-mono shrink-0 shadow-xs" 
                                            />
                                            <div className="flex flex-col min-w-0">
                                              <span className="text-xs font-semibold text-rose-200 leading-tight truncate">
                                                {u?.nickname || u?.displayId || 'User'}
                                              </span>
                                              <span className="text-rose-400/80 text-[10px] font-mono leading-tight truncate">
                                                @{u?.displayId || 'user'}
                                              </span>
                                            </div>
                                          </div>
                                          <span className={`font-mono text-xs px-2 py-0.5 rounded-md font-bold whitespace-nowrap ml-2 shrink-0 ${
                                            isTop 
                                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs' 
                                              : 'text-rose-300 bg-rose-500/10'
                                          }`}>
                                            {formatScore(u?.score || 0)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                <span className="text-xs font-bold text-zinc-500 px-1 py-0.5 self-center font-mono">VS</span>

                                <div className="w-fit inline-flex flex-col bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-500/30">
                                  <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-1.5">Rival Team</span>
                                  <div className="flex flex-col gap-1.5 w-full">
                                    {team2.map((u, uIdx) => {
                                      const isTop = isTop2Score(u?.score);
                                      const avatarSrc = u?.profilePictureUrl || (u?.userId === currentTargetUserIdRef.current || u?.displayId?.toLowerCase() === currentUsername?.toLowerCase() ? hostAvatar : '');
                                      return (
                                        <div key={u?.userId || uIdx} className="w-full flex items-center justify-between gap-3 bg-indigo-900/30 px-2.5 py-1.5 rounded-md border border-indigo-500/20">
                                          <div className="flex items-center gap-2 text-left min-w-0">
                                            <Avatar 
                                              src={avatarSrc} 
                                              name={u?.nickname || u?.displayId || 'User'} 
                                              sizeClassName="w-6 h-6 sm:w-7 sm:h-7" 
                                              className="border border-indigo-500/30 text-[10px] font-mono shrink-0 shadow-xs" 
                                            />
                                            <div className="flex flex-col min-w-0">
                                              <span className="text-xs font-semibold text-indigo-200 leading-tight truncate">
                                                {u?.nickname || u?.displayId || 'User'}
                                              </span>
                                              <span className="text-indigo-400/80 text-[10px] font-mono leading-tight truncate">
                                                @{u?.displayId || 'user'}
                                              </span>
                                            </div>
                                          </div>
                                          <span className={`font-mono text-xs px-2 py-0.5 rounded-md font-bold whitespace-nowrap ml-2 shrink-0 ${
                                            isTop 
                                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs' 
                                              : 'text-indigo-300 bg-indigo-500/10'
                                          }`}>
                                            {formatScore(u?.score || 0)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ) : isFFA ? (
                              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-2">
                                {(battle.users || []).map((u, i) => {
                                  const avatarSrc = u?.profilePictureUrl || (i === 0 ? hostAvatar : '');
                                  return (
                                    <React.Fragment key={u?.userId || i}>
                                      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border w-full sm:w-auto text-left ${
                                        i === 0 
                                          ? 'bg-rose-950/40 border-rose-500/30' 
                                          : 'bg-indigo-950/40 border-indigo-500/30'
                                      }`}>
                                        <Avatar 
                                          src={avatarSrc} 
                                          name={u?.nickname || u?.displayId || 'User'} 
                                          sizeClassName="w-6 h-6 sm:w-7 sm:h-7" 
                                          className={`border text-[10px] font-mono shrink-0 shadow-xs ${i === 0 ? 'border-rose-500/30' : 'border-indigo-500/30'}`} 
                                        />
                                        <div className="flex flex-col min-w-0">
                                          <span className={`text-xs font-semibold leading-tight truncate ${
                                            i === 0 ? 'text-rose-200' : 'text-indigo-200'
                                          }`}>
                                            {u?.nickname || u?.displayId || 'User'}
                                          </span>
                                          <span className={`text-[10px] font-mono leading-tight truncate ${
                                            i === 0 ? 'text-rose-400/80' : 'text-indigo-400/80'
                                          }`}>
                                            @{u?.displayId || 'user'}
                                          </span>
                                        </div>
                                      </div>
                                      {i < (battle.users || []).length - 1 && (
                                        <span className="text-zinc-500 text-xs font-bold font-mono py-0.5 self-center">vs</span>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-2">
                                {(battle.users || []).map((u, i) => {
                                  const avatarSrc = u?.profilePictureUrl || (i === 0 ? hostAvatar : '');
                                  return (
                                    <React.Fragment key={u?.userId || i}>
                                      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border w-full sm:w-auto text-left ${
                                        i === 0 
                                          ? 'bg-rose-950/40 border-rose-500/30' 
                                          : 'bg-indigo-950/40 border-indigo-500/30'
                                      }`}>
                                        <Avatar 
                                          src={avatarSrc} 
                                          name={u?.nickname || u?.displayId || 'User'} 
                                          sizeClassName="w-6 h-6 sm:w-7 sm:h-7" 
                                          className={`border text-[10px] font-mono shrink-0 shadow-xs ${i === 0 ? 'border-rose-500/30' : 'border-indigo-500/30'}`} 
                                        />
                                        <div className="flex flex-col min-w-0">
                                          <span className={`text-xs font-semibold leading-tight truncate ${
                                            i === 0 ? 'text-rose-200' : 'text-indigo-200'
                                          }`}>
                                            {u?.nickname || u?.displayId || 'User'}
                                          </span>
                                          <span className={`text-[10px] font-mono leading-tight truncate ${
                                            i === 0 ? 'text-rose-400/80' : 'text-indigo-400/80'
                                          }`}>
                                            @{u?.displayId || 'user'}
                                          </span>
                                        </div>
                                      </div>
                                      {i === 0 && (battle.users || []).length > 1 && (
                                        <span className="text-xs font-bold text-zinc-500 font-mono py-0.5 self-center">VS</span>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-center">
                            {isTeamMatch ? (
                              <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 font-mono text-sm font-bold">
                                <span className="text-rose-400">{formatScore(team1Score)}</span>
                                <span className="text-zinc-400 font-mono font-bold text-xs">vs</span>
                                <span className="text-indigo-400">{formatScore(team2Score)}</span>
                              </div>
                            ) : isFFA ? (
                              <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 font-mono text-xs">
                                {(battle.users || []).map((u, i) => {
                                  const isTop = (battle.users || []).length > 2 && isTop2Score(u?.score);
                                  return (
                                    <React.Fragment key={u?.userId || i}>
                                      {i > 0 && <span className="text-zinc-400 font-mono font-bold text-xs">vs</span>}
                                      <span className={`px-2 py-0.5 rounded-md font-bold ${
                                        isTop 
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs' 
                                          : i === 0 
                                            ? 'text-rose-400' 
                                            : 'text-indigo-400'
                                      }`}>
                                        {formatScore(u?.score || 0)}
                                      </span>
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 font-mono text-sm font-bold">
                                <span className="text-rose-400">{formatScore(battle.users[0]?.score || 0)}</span>
                                <span className="text-zinc-400 font-mono font-bold text-xs">vs</span>
                                <span className="text-indigo-400">{formatScore(battle.users[1]?.score || 0)}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right">
                            {(() => {
                              const res = battle.result;
                              const isVictory = res === 'Victory' || res === 'Victoria';
                              const isDefeat = res === 'Defeat' || res === 'Derrota';
                              const isDraw = res === 'Draw' || res === 'Empate';
                              const isInterrupted = res === 'Interrupted' || res === 'Interrumpido';

                              const label = isVictory ? 'Victory' : isDefeat ? 'Defeat' : isDraw ? 'Draw' : isInterrupted ? 'Interrupted' : 'In Progress';
                              const style = isVictory 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : isDefeat 
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                : isDraw 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                : isInterrupted 
                                ? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20' 
                                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse';

                              return (
                                <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${style}`}>
                                  {label}
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Activity className="w-8 h-8 opacity-20" />
                          <p className="text-sm">No battles recorded yet.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {totalBattlePages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 bg-zinc-950/50">
                <button 
                  onClick={() => setBattlePage(p => Math.max(1, p - 1))}
                  disabled={battlePage === 1}
                  className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-zinc-400 text-sm">
                  Page {battlePage} of {totalBattlePages}
                </span>
                <button 
                  onClick={() => setBattlePage(p => Math.min(totalBattlePages, p + 1))}
                  disabled={battlePage === totalBattlePages}
                  className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </section>

          {/* Top Gifters Section */}
          <section className="border border-zinc-800 bg-zinc-900/50 rounded-xl p-4 relative overflow-hidden backdrop-blur-md shadow-lg flex flex-col h-[480px]">
            <div className="flex flex-col h-full space-y-3 min-h-0">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 shrink-0">
                <span className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-amber-500" /> Top Gifters
                </span>
                <span className="text-[10px] font-medium tracking-wider text-amber-500 uppercase bg-amber-500/10 px-2 py-0.5 rounded-full">{topGifters.length} Top</span>
              </div>
              
              <div className="space-y-2 overflow-y-auto pr-2 flex-1 min-h-0 relative custom-scrollbar">
                {topGifters.length > 0 ? (
                  topGifters.map((gifter, idx) => {
                    const gifterKey = gifter.userId || gifter.uniqueId;
                    const isExpanded = expandedGifterId === gifterKey;
                    const history = gifter.history || [];
                    const lastComboVal = gifter.lastGiftIsCombo || (gifter.lastGiftComboCount && gifter.lastGiftComboCount > 1) 
                      ? (gifter.lastGiftComboCount || gifter.lastGiftCount || 1) 
                      : (gifter.lastGiftCount || 1);

                    return (
                      <div 
                        key={gifterKey}
                        className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 overflow-hidden transition-all"
                      >
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ type: "spring", stiffness: 300, delay: idx * 0.05 }}
                          className="flex items-center gap-3 p-2 hover:bg-zinc-800/40 transition-colors"
                        >
                          <div className={`w-7 h-7 flex items-center justify-center font-mono font-bold text-[11px] rounded-full shrink-0 shadow-sm
                            ${idx === 0 ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30' : 
                              idx === 1 ? 'bg-zinc-300/20 text-zinc-300 border border-zinc-400/30' : 
                              idx === 2 ? 'bg-orange-400/20 text-orange-400 border border-orange-400/30' : 
                              'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                            #{idx + 1}
                          </div>
                          <Avatar 
                            src={gifter.profilePictureUrl || gifter.avatarUrl} 
                            name={gifter.nickname || gifter.uniqueId} 
                            sizeClassName="w-9 h-9" 
                            className="border border-zinc-800 shadow-sm"
                          />
                          <div className="flex-1 min-w-0 pr-1">
                            <div className="flex flex-col min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5 min-w-0">
                                <span className="text-[13px] font-medium text-zinc-200 truncate">{gifter.nickname}</span>
                                <span className="text-[11px] text-zinc-500 truncate">@{gifter.uniqueId}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 leading-tight flex-wrap">
                                <span>{(gifter.giftsSent || gifter.totalGifts || 0).toLocaleString()} gifts</span>
                                {gifter.lastGiftName && (
                                  <>
                                    <span>•</span>
                                    <span className="text-amber-400/90 font-medium truncate">
                                      Last: {gifter.lastGiftName} ×{lastComboVal}
                                    </span>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setExpandedGifterId(isExpanded ? null : gifterKey)}
                                  className="inline-flex items-center justify-center p-0.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                                  title="Gift breakdown"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span className="font-mono text-[13px] font-bold text-amber-500 flex items-center gap-1.5 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 shadow-inner">
                              🪙 {gifter.totalCoins.toLocaleString()}
                            </span>
                          </div>
                        </motion.div>

                        {/* Desplegable de todos los regalos */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-zinc-800/70 bg-zinc-950/70 px-3 py-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-amber-400" />
                                  Gift Breakdown
                                </span>
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  {history.length > 0 ? `${history.length} recorded sends` : 'Recent sends'}
                                </span>
                              </div>

                              {history.length > 0 ? (
                                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                                  {history.map((record) => (
                                    <div
                                      key={record.id}
                                      className="flex items-center justify-between py-1 px-2 rounded bg-zinc-900/60 border border-zinc-800/40 text-[11px]"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-medium text-zinc-200 truncate">
                                          {record.giftName}
                                        </span>
                                        {record.isCombo || (record.comboCount && record.comboCount > 1) ? (
                                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 font-mono">
                                            ×{record.comboCount || record.giftCount || 1}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-1 py-0.2 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-mono">
                                            ×{record.giftCount || 1}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                                        <span className="text-amber-400 font-medium">🪙 {record.coins.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="py-2 text-center text-zinc-500 text-[11px]">
                                  Last recorded gift: {gifter.lastGiftName} ×{lastComboVal}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full flex flex-col items-center justify-center gap-3 p-8 text-zinc-500">
                    <Gift className="w-8 h-8 opacity-20" />
                    <p className="text-sm">No gifts recorded yet.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="p-4 border-l-4 border-indigo-500/50 bg-indigo-500/5 rounded-r-lg text-sm text-zinc-400">
            Note: This monitor establishes a real-time data bridge. Video content must be viewed via the official link above.
          </div>
        </div>
      </main>

      {/* Footer Meta */}
      <footer className="mt-8 border-t border-zinc-800/50 p-6 text-center text-zinc-500 text-xs">
        <p>Tik Live Monitor • Connected via WebSocket</p>
      </footer>
    </div>
  );
}
