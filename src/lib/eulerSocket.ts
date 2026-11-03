import { resolveGiftCoins } from "./giftResolver";

/**
 * Euler Stream WebSocket Client for TikTok LIVE
 * Direct WebSocket connection to wss://ws.eulerstream.com using ephemeral JWT tokens
 */

export interface EulerConnectOptions {
  uniqueId: string;
  clientApiKey?: string;
  jwtToken?: string;
}

export type EventHandler = (...args: any[]) => void;

/**
 * Helper to robustly extract user profile avatar URL from TikTok / Euler Stream protobuf & JSON payloads
 */
export function extractAvatarUrl(userOrData: any): string {
  if (!userOrData) return "";
  if (typeof userOrData === "string") {
    const trimmed = userOrData.trim();
    return trimmed.startsWith("http") ? trimmed.replace(/^http:\/\//, "https://") : "";
  }

  const user = userOrData.user || userOrData.userInfo || userOrData.user_info || userOrData;

  const findValidUrl = (obj: any): string => {
    if (!obj) return "";
    if (typeof obj === "string") {
      const trimmed = obj.trim();
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        // Discard dead webcast domain URLs that return 404 in web browsers
        if (trimmed.includes("webcast.tiktokcdn.com")) {
          return "";
        }
        return trimmed.replace(/^http:\/\//, "https://");
      }
      return "";
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findValidUrl(item);
        if (found) return found;
      }
      return "";
    }
    if (typeof obj === "object") {
      const candidates = [
        obj.urlList,
        obj.url_list,
        obj.urls,
        obj.url_list_list,
        obj.uri,
        obj.url,
      ];
      for (const cand of candidates) {
        const found = findValidUrl(cand);
        if (found) return found;
      }
    }
    return "";
  };

  const candidateFields = [
    user.avatarThumb,
    user.avatar_thumb,
    user.avatarMedium,
    user.avatar_medium,
    user.avatarLarge,
    user.avatar_large,
    user.profilePicture,
    user.profile_picture,
    user.profilePictureUrl,
    user.profile_picture_url,
    user.avatar168x168,
    user.avatar_168x168,
    user.avatar300x300,
    user.avatar_300x300,
    user.avatarUrl,
    user.avatar_url,
    user.avatar,
    user.headUrl,
    user.head_url,
    user.icon,
    user.displayAvatar,
    userOrData.profilePictureUrl,
    userOrData.profile_picture_url,
    userOrData.avatarThumb,
    userOrData.avatar_thumb,
    userOrData.avatarUrl,
    userOrData.avatar_url,
  ];

  for (const field of candidateFields) {
    const url = findValidUrl(field);
    if (url) return url;
  }

  return "";
}

function extractViewerCountFromData(data: any): number {
  if (!data || typeof data !== "object") return 0;

  const candidates = [
    data.viewerCount,
    data.viewer_count,
    data.totalUser,
    data.total_user,
    data.totalUserCount,
    data.total_user_count,
    data.currentCount,
    data.current_count,
    data.memberCount,
    data.member_count,
    data.userCount,
    data.user_count,
    data.total,
    data.count,
    data.totalCount,
    data.total_count,
    data.room?.user_count,
    data.room?.userCount,
    data.room?.viewerCount,
    data.room?.viewer_count,
    data.room?.memberCount,
    data.room?.totalUser,
    data.roomInfo?.viewerCount,
    data.roomInfo?.totalUser,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const num = Number(candidate);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }

  // Check if string popularity / popStr (e.g. "1240" or "1.2k")
  const pop = data.popStr || data.popularityStr || data.popularity || data.room?.popStr;
  if (typeof pop === "string") {
    const cleanPop = pop.trim().toLowerCase();
    if (cleanPop.endsWith("k")) {
      const kVal = parseFloat(cleanPop);
      if (!isNaN(kVal)) return Math.round(kVal * 1000);
    } else if (cleanPop.endsWith("m")) {
      const mVal = parseFloat(cleanPop);
      if (!isNaN(mVal)) return Math.round(mVal * 1000000);
    } else {
      const num = parseInt(cleanPop.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }

  return 0;
}

function extractTotalLikesFromData(data: any): number {
  if (!data || typeof data !== "object") return 0;

  const candidates = [
    data.totalLikeCount,
    data.total_like_count,
    data.totalLikes,
    data.total_likes,
    data.total,
    data.totalCount,
    data.total_count,
    data.likeCount,
    data.like_count,
    data.likes,
    data.room?.like_count,
    data.room?.likeCount,
    data.room?.total_like_count,
    data.roomInfo?.likeCount,
    data.roomInfo?.totalLikes,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const num = Number(candidate);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }

  return 0;
}

export class EulerStreamLiveClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private currentUsername: string = "";
  private hostAvatarUrl: string = "";
  private hostNickname: string = "";
  private hostStartTime: number | null = null;
  private isExplicitDisconnect: boolean = false;
  private retryCount: number = 0;
  private maxRetries: number = 6;
  private reconnectTimer: any = null;
  private keepAliveTimer: any = null;
  private lastConnectOptions: EulerConnectOptions | null = null;
  private comboTracker: Map<string, number> = new Map();

  constructor() {
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);

    // If tab was sleeping and becomes visible, check if we need to reconnect
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !this.isExplicitDisconnect && this.lastConnectOptions && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
          console.log("[EulerStream] Tab became visible, checking connection...");
          if (this.retryCount < this.maxRetries) {
            this.attemptAutoReconnect();
          }
        }
      });
    }
  }

  public on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  public off(event: string, handler?: EventHandler) {
    if (!handler) {
      this.listeners.delete(event);
      return;
    }
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  public emit(event: string, ...args: any[]) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(...args);
        } catch (e) {
          console.error(`Error in EulerStream event listener for ${event}:`, e);
        }
      });
    }
  }

  public async connect(options: EulerConnectOptions, isRetry: boolean = false) {
    if (!isRetry) {
      this.disconnect();
      this.isExplicitDisconnect = false;
      this.retryCount = 0;
      this.lastConnectOptions = { ...options };
    } else {
      this.clearSocketOnly();
    }

    const username = options.uniqueId.trim().replace(/^@/, "");
    this.currentUsername = username;

    try {
      let token = options.jwtToken;

      // Always obtain a fresh JWT token on retries or initial connect
      if (!token || isRetry) {
        const res = await fetch("/api/euler-jwt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uniqueId: username,
            clientApiKey: options.clientApiKey,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Error al obtener token de Euler Stream");
        }
        token = data.token;
        if (data.avatarUrl) {
          this.hostAvatarUrl = data.avatarUrl;
        }
        if (data.nickname) {
          this.hostNickname = data.nickname;
        }
        if (data.startTime) {
          this.hostStartTime = Number(data.startTime);
        }
      }

      if (!token) {
        throw new Error("No se pudo obtener el token JWT de Euler Stream.");
      }

      const wsUrl = `wss://ws.eulerstream.com?uniqueId=${encodeURIComponent(username)}&jwtKey=${encodeURIComponent(token)}`;
      this.initWebSocket(wsUrl, username);
    } catch (err: any) {
      console.error("EulerStream Connection Error:", err);
      if (isRetry && this.retryCount < this.maxRetries) {
        this.scheduleReconnect(username);
      } else {
        this.emit("error", err.message || "Error al conectar con Euler Stream");
        this.emit("status", "disconnected");
      }
    }
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    // Heartbeat every 20 seconds to prevent TCP idle disconnects / proxies timeout
    this.keepAliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        } catch (e) {
          // ignore
        }
      }
    }, 20000);
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private initWebSocket(wsUrl: string, username: string) {
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.retryCount = 0;
        this.startKeepAlive();
        console.log(`[EulerStream] WebSocket connected for @${username}`);
        // Notify connection opened
        this.emit("connected", {
          roomId: `room_${username}`,
          username: username,
          nickname: this.hostNickname || username,
          userId: `user_${username}`,
          avatarUrl: this.hostAvatarUrl || "",
          startTime: this.hostStartTime || undefined,
        });
        this.emit("status", "connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          this.handleIncomingMessage(rawData);
        } catch (e) {
          console.warn("[EulerStream] Non-JSON or parse error on message:", event.data);
        }
      };

      this.ws.onerror = (event) => {
        console.error("[EulerStream] WebSocket error:", event);
      };

      this.ws.onclose = (event) => {
        this.stopKeepAlive();
        console.log(`[EulerStream] WebSocket closed with code ${event.code}: ${event.reason}`);
        
        if (this.isExplicitDisconnect) {
          this.emit("status", "disconnected");
          return;
        }

        // Handle specific Euler Stream / TikTok close codes
        let userErrorMessage = "";
        let shouldAutoRetry = false;

        if (event.code === 4404) {
          userErrorMessage = `El usuario @${username} no está transmitiendo en vivo actualmente.`;
        } else if (event.code === 4401) {
          // Token expired or invalid -> retry with a fresh token
          shouldAutoRetry = true;
          userErrorMessage = "Renovando sesión con Euler Stream...";
        } else if (event.code === 4403) {
          userErrorMessage = "Permiso denegado por Euler Stream para acceder a este directo.";
        } else if (event.code === 4005) {
          userErrorMessage = "La transmisión en vivo de TikTok ha finalizado.";
          this.emit("status", "ended");
        } else if (event.code === 4429) {
          userErrorMessage = "Límite de conexiones alcanzado en Euler Stream.";
        } else if (event.code === 1006 || event.code === 1001 || event.code === 1005) {
          // Code 1006: Abnormal closure (network blip, proxy reset, background tab) -> auto retry!
          shouldAutoRetry = true;
        } else if (event.code !== 1000) {
          userErrorMessage = event.reason || `Conexión cerrada (${event.code}).`;
          shouldAutoRetry = true;
        }

        if (shouldAutoRetry && !this.isExplicitDisconnect && this.retryCount < this.maxRetries) {
          this.scheduleReconnect(username);
          return;
        }

        if (userErrorMessage) {
          this.emit("error", userErrorMessage);
        }
        this.emit("status", "disconnected");
      };
    } catch (err: any) {
      this.stopKeepAlive();
      this.emit("error", "No se pudo inicializar la conexión WebSocket: " + err.message);
      this.emit("status", "disconnected");
    }
  }

  private scheduleReconnect(username: string) {
    this.retryCount += 1;
    const delay = Math.min(2000 * Math.pow(1.4, this.retryCount - 1), 10000);
    console.log(`[EulerStream] Auto-reconnecting attempt ${this.retryCount}/${this.maxRetries} in ${Math.round(delay)}ms...`);
    
    this.emit("status", "reconnecting");
    this.emit("reconnecting", { attempt: this.retryCount, maxRetries: this.maxRetries });

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitDisconnect && this.lastConnectOptions) {
        this.connect(this.lastConnectOptions, true);
      }
    }, delay);
  }

  private attemptAutoReconnect() {
    if (!this.isExplicitDisconnect && this.lastConnectOptions) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.scheduleReconnect(this.currentUsername || this.lastConnectOptions.uniqueId);
    }
  }

  private handleIncomingMessage(msg: any) {
    if (!msg) return;

    // Handle bundled events
    if (Array.isArray(msg.messages)) {
      msg.messages.forEach((m: any) => this.processSingleEvent(m.type, m.data));
      return;
    }

    if (msg.type) {
      this.processSingleEvent(msg.type, msg.data || msg);
    }
  }

  private processSingleEvent(type: string, data: any) {
    if (!data) data = {};

    switch (type) {
      case "roomInfo":
      case "room":
      case "room-update":
      case "WebcastRoomMessage":
      case "WebcastRoomStatsMessage":
      case "WebcastRoomInfo": {
        let cTime = data.createTime || data.create_time;
        if (cTime) {
          const num = typeof cTime === "string" ? parseInt(cTime, 10) : Number(cTime);
          cTime = num < 10000000000 ? num * 1000 : num;
        }

        const rawStartTime = data.start_time ?? data.startTime ?? data.room_info?.start_time ?? data.roomInfo?.start_time ?? data.room?.start_time ?? data.create_time ?? data.createTime;
        if (rawStartTime) {
          const num = typeof rawStartTime === "string" ? parseInt(rawStartTime, 10) : Number(rawStartTime);
          if (!isNaN(num) && num > 0) {
            this.hostStartTime = num > 10000000000 ? Math.floor(num / 1000) : num;
          }
        }

        const extractedAvatar = extractAvatarUrl(data.owner || data.anchor || data.room || data);
        const hostAvatar = this.hostAvatarUrl || extractedAvatar;
        if (extractedAvatar && !this.hostAvatarUrl) {
          this.hostAvatarUrl = extractedAvatar;
        }
        if (data.owner?.nickname && !this.hostNickname) {
          this.hostNickname = data.owner.nickname;
        }

        const vCount = extractViewerCountFromData(data);
        const totalLikes = extractTotalLikesFromData(data);

        this.emit("room-update", {
          viewerCount: vCount,
          likes: totalLikes > 0 ? totalLikes : (parseInt(data.likeCount || data.likes || "0", 10) || 0),
          createTime: cTime || Date.now(),
          startTime: this.hostStartTime || undefined,
          hostAvatar: hostAvatar,
        });

        if (vCount > 0) {
          this.emit("viewer-count", vCount);
        }

        if (totalLikes > 0) {
          this.emit("total-likes-update", totalLikes);
        }

        if (data.owner || data.roomId) {
          this.emit("connected", {
            roomId: data.roomId || data.room_id || "",
            username: this.currentUsername,
            nickname: data.owner?.nickname || this.hostNickname || this.currentUsername,
            userId: (data.owner?.id_str || data.owner?.id || "").toString(),
            avatarUrl: hostAvatar,
            startTime: this.hostStartTime || undefined,
          });
        }
        break;
      }

      case "WebcastChatMessage": {
        const user = data.user || data.userInfo || {};
        const profilePic = extractAvatarUrl(user);

        this.emit("chat-msg", {
          id: (data.msgId || data.common?.msgId || crypto.randomUUID()).toString(),
          uniqueId: user.uniqueId || user.displayId || "anonymous",
          nickname: user.nickname || user.uniqueId || "Anonymous",
          comment: data.comment || data.content || "",
          profilePictureUrl: profilePic,
          timestamp: data.createTime ? Number(data.createTime) : Date.now(),
        });
        break;
      }

      case "gift":
      case "gift-msg":
      case "WebcastGift":
      case "WebcastGiftMessage": {
        const user = data.user || data.userInfo || data.user_info || data.fromUser || data.sender || {};
        const profilePic = extractAvatarUrl(user || data);

        const giftName =
          data.giftName ||
          data.gift_name ||
          data.giftDetails?.giftName ||
          data.giftDetails?.gift_name ||
          data.gift?.name ||
          data.gift?.describe ||
          data.gift?.gift_name ||
          data.describe ||
          "Gift";

        let diamondCount = Number(
          data.diamondCount ??
          data.diamond_count ??
          data.coinCount ??
          data.coin_count ??
          data.coinPrice ??
          data.coin_price ??
          data.giftDetails?.diamondCount ??
          data.giftDetails?.diamond_count ??
          data.gift?.diamondCount ??
          data.gift?.diamond_count ??
          data.gift?.coinPrice ??
          data.gift?.coin_price ??
          data.gift?.diamond ??
          data.gift?.coins ??
          data.coins ??
          0
        );

        diamondCount = resolveGiftCoins(giftName, diamondCount > 0 ? diamondCount : undefined);

        const userId = (
          user.id_str ||
          user.id ||
          user.userId ||
          user.user_id ||
          user.secUid ||
          user.sec_uid ||
          user.uniqueId ||
          user.unique_id ||
          user.displayId ||
          "anonymous"
        ).toString();

        const uniqueId = (
          user.uniqueId ||
          user.unique_id ||
          user.displayId ||
          user.display_id ||
          user.id_str ||
          user.id ||
          userId ||
          "anonymous"
        ).toString();

        const nickname = user.nickname || user.nick_name || uniqueId || "Anonymous";

        const rawRepeatCount = Number(
          data.repeatCount ||
          data.repeat_count ||
          data.comboCount ||
          data.combo_count ||
          data.groupCount ||
          data.group_count ||
          data.count ||
          1
        );
        const currentRepeatCount = isNaN(rawRepeatCount) || rawRepeatCount < 1 ? 1 : rawRepeatCount;

        const isEnded = Boolean(
          data.repeatEnd === true ||
          data.repeatEnd === 1 ||
          data.repeat_end === true ||
          data.repeat_end === 1
        );

        const giftId = (data.giftId || data.gift_id || data.gift?.id || giftName).toString();
        const groupId = (data.groupId || data.group_id || data.comboId || data.combo_id || "").toString();
        const comboKey = `${userId}_${giftId}_${groupId}`;

        // Calculate delta gifts for streak/combos
        let deltaGifts = 1;
        if (groupId || data.comboCount || data.combo_count || currentRepeatCount > 1) {
          const prevCount = this.comboTracker.get(comboKey) || 0;
          if (currentRepeatCount > prevCount) {
            deltaGifts = currentRepeatCount - prevCount;
            this.comboTracker.set(comboKey, currentRepeatCount);
          } else {
            // Already processed this repeat count
            deltaGifts = isEnded ? 0 : 0;
          }
        } else {
          deltaGifts = currentRepeatCount;
        }

        if (isEnded) {
          this.comboTracker.delete(comboKey);
        }

        // Emit if there are newly delivered gifts or initial count
        if (deltaGifts > 0) {
          const isCombo = Boolean(groupId || currentRepeatCount > 1 || deltaGifts > 1);
          this.emit("gift-msg", {
            userId: userId,
            uniqueId: uniqueId,
            nickname: nickname,
            giftName: giftName,
            repeatCount: deltaGifts,
            totalRepeatCount: currentRepeatCount,
            isCombo: isCombo,
            comboCount: currentRepeatCount,
            profilePictureUrl: profilePic,
            diamondCount: diamondCount,
            repeatEnd: isEnded,
            giftType: Number(data.giftType ?? data.gift_type ?? 1),
            groupId: groupId,
          });
        }
        break;
      }

      case "like":
      case "like-msg":
      case "WebcastLike":
      case "WebcastLikeMessage": {
        const user = data.user || data.userInfo || data.user_info || {};
        const profilePic = extractAvatarUrl(user);

        const likeCount = Number(data.likeCount || data.like_count || data.count || 1);
        const totalLikeCount = extractTotalLikesFromData(data);

        this.emit("like-msg", {
          uniqueId: user.uniqueId || user.displayId || "anonymous",
          nickname: user.nickname || user.uniqueId || "Anonymous",
          likeCount: likeCount > 0 ? likeCount : 1,
          totalLikeCount: totalLikeCount > 0 ? totalLikeCount : undefined,
          profilePictureUrl: profilePic,
        });

        if (totalLikeCount > 0) {
          this.emit("total-likes-update", totalLikeCount);
        }
        break;
      }

      case "WebcastRoomUserSeqMessage":
      case "roomUser":
      case "room_user": {
        const viewerCount = extractViewerCountFromData(data);
        const topViewers = (data.ranks || data.ranksList || data.ranks_list || data.topViewers || [])
          .filter((r: any) => r && typeof r === "object")
          .map((r: any) => {
            const rawScore = Number(r?.score ?? r?.coinCount ?? r?.coin_count ?? r?.points ?? 0);
            return {
              user: {
                uniqueId: r.user?.uniqueId || r.user?.displayId || r.uniqueId || "",
                nickname: r.user?.nickname || r.nickname || "",
                profilePictureUrl: extractAvatarUrl(r.user || r),
              },
              score: rawScore,
              coinCount: rawScore,
            };
          });

        this.emit("room-update", {
          viewerCount: viewerCount,
          topViewers: topViewers,
        });

        if (viewerCount > 0) {
          this.emit("viewer-count", viewerCount);
        }

        if (topViewers.length > 0) {
          this.emit("top-gifters-update", topViewers);
          this.emit("ranking-update", { ranklist: topViewers });
        }
        break;
      }

      case "WebcastMemberMessage": {
        const user = data.user || data.userInfo || {};
        const profilePic = extractAvatarUrl(user);
        const memberViewerCount = extractViewerCountFromData(data);

        this.emit("member-join", {
          uniqueId: user.uniqueId || user.displayId || "anonymous",
          nickname: user.nickname || user.uniqueId || "Anonymous",
          profilePictureUrl: profilePic,
          memberCount: memberViewerCount,
        });

        if (memberViewerCount > 0) {
          this.emit("viewer-count", memberViewerCount);
        }
        break;
      }

      case "WebcastSocialMessage": {
        const user = data.user || {};
        this.emit("event-msg", {
          uniqueId: user.uniqueId || user.displayId || "anonymous",
          nickname: user.nickname || user.uniqueId || "Anonymous",
          type: data.displayType || data.action || "social",
        });
        break;
      }

      case "WebcastLinkMicBattle": {
        this.emit("battle-msg", data);
        this.emit("raw-battle-msg", data);
        break;
      }

      case "WebcastLinkMicArmies": {
        this.emit("battle-armies-msg", data);
        this.emit("raw-battle-armies-msg", data);
        break;
      }

      case "tiktok.disconnect": {
        const reason = data.reason || "TikTok desconectado";
        this.emit("error", reason);
        this.emit("status", "disconnected");
        break;
      }

      default: {
        // Forward custom or raw events
        this.emit(type, data);
        break;
      }
    }
  }

  private clearSocketOnly() {
    this.stopKeepAlive();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
  }

  public disconnect() {
    this.isExplicitDisconnect = true;
    this.lastConnectOptions = null;
    this.comboTracker.clear();
    this.stopKeepAlive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearSocketOnly();
  }
}

// Global client instance
export const eulerLiveClient = new EulerStreamLiveClient();
