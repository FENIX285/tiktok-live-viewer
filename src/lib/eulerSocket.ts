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

export class EulerStreamLiveClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private currentUsername: string = "";
  private hostAvatarUrl: string = "";
  private hostNickname: string = "";
  private isExplicitDisconnect: boolean = false;
  private lastConnectOptions: EulerConnectOptions | null = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 15;
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private readonly HEARTBEAT_INTERVAL_MS: number = 20000; // 20 seconds keep-alive
  private comboTracker: Map<string, number> = new Map();

  constructor() {
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);
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

  public async connect(options: EulerConnectOptions) {
    this.cleanupSocketOnly();
    this.isExplicitDisconnect = false;
    this.reconnectAttempts = 0;
    this.lastConnectOptions = { ...options };

    await this.connectInternal(options, false);
  }

  private async connectInternal(options: EulerConnectOptions, isReconnection: boolean = false) {
    const username = options.uniqueId.trim().replace(/^@/, "");
    this.currentUsername = username;

    try {
      let token = options.jwtToken;

      // When reconnecting or if no pre-generated JWT was provided, request a fresh JWT from backend
      if (!token) {
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
      }

      if (!token) {
        throw new Error("No se pudo obtener el token JWT de Euler Stream.");
      }

      const wsUrl = `wss://ws.eulerstream.com?uniqueId=${encodeURIComponent(username)}&jwtKey=${encodeURIComponent(token)}`;
      this.initWebSocket(wsUrl, username, isReconnection);
    } catch (err: any) {
      console.error("[EulerStream] Connection Error:", err);
      if (isReconnection) {
        this.scheduleReconnect(username, err.message || "Fallo en la reconexión");
      } else {
        this.emit("error", err.message || "Error al conectar con Euler Stream");
        this.emit("status", "error");
      }
    }
  }

  private initWebSocket(wsUrl: string, username: string, isReconnection: boolean) {
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log(`[EulerStream] WebSocket ${isReconnection ? "reconnected" : "connected"} for @${username}`);
        
        // Start keep-alive heartbeat
        this.startHeartbeat();

        // Notify connection opened
        this.emit("connected", {
          roomId: `room_${username}`,
          username: username,
          nickname: this.hostNickname || username,
          userId: `user_${username}`,
          avatarUrl: this.hostAvatarUrl || "",
          isReconnected: isReconnection,
        });

        if (isReconnection) {
          this.emit("reconnected", { username });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          
          // Handle heartbeat pong or ping from server
          if (rawData && (rawData.type === "pong" || rawData.pong)) {
            return;
          }
          if (rawData && (rawData.type === "ping" || rawData.ping)) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            }
            return;
          }

          this.handleIncomingMessage(rawData);
        } catch (e) {
          console.warn("[EulerStream] Non-JSON or parse error on message:", event.data);
        }
      };

      this.ws.onerror = (event) => {
        console.error("[EulerStream] WebSocket error:", event);
      };

      this.ws.onclose = (event) => {
        console.log(`[EulerStream] WebSocket closed with code ${event.code}: ${event.reason || "no reason"}`);
        this.stopHeartbeat();

        if (this.isExplicitDisconnect) {
          this.emit("status", "disconnected");
          return;
        }

        // Fatal codes where reconnection should not be attempted endlessly
        const isLiveEnded = event.code === 4005;
        const isNotLive = event.code === 4404;
        const isForbidden = event.code === 4403;
        const isRateLimited = event.code === 4429;

        if (isLiveEnded) {
          this.emit("error", "La transmisión en vivo de TikTok ha finalizado.");
          this.emit("status", "ended");
          return;
        }

        if (isNotLive) {
          this.emit("error", `El usuario @${username} no está transmitiendo en vivo actualmente.`);
          this.emit("status", "disconnected");
          return;
        }

        if (isForbidden) {
          this.emit("error", "Permiso denegado por Euler Stream para acceder a este directo.");
          this.emit("status", "disconnected");
          return;
        }

        if (isRateLimited) {
          this.emit("error", "Límite de conexiones simultáneas alcanzado en Euler Stream.");
          this.emit("status", "disconnected");
          return;
        }

        // For code 1006 (abnormal close / network drop), 1001 (going away), 4401 (token expired),
        // or any unexpected closure, schedule automatic reconnection with token refresh
        this.scheduleReconnect(username, event.reason || `Conexión cerrada inesperadamente (${event.code})`);
      };
    } catch (err: any) {
      this.emit("error", "No se pudo inicializar la conexión WebSocket: " + err.message);
      this.scheduleReconnect(username, err.message);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        } catch (err) {
          console.warn("[EulerStream] Heartbeat ping error:", err);
        }
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(username: string, cause?: string) {
    if (this.isExplicitDisconnect || !this.lastConnectOptions) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[EulerStream] Máximo de intentos (${this.maxReconnectAttempts}) alcanzado. Deteniendo reconexión.`);
      this.emit("error", `Conexión perdida con Euler Stream tras ${this.maxReconnectAttempts} intentos.`);
      this.emit("status", "disconnected");
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff: 1.5s, 2.25s, 3.37s, up to 12s + random jitter
    const baseDelay = Math.min(1500 * Math.pow(1.5, this.reconnectAttempts - 1), 12000);
    const jitter = Math.floor(Math.random() * 600);
    const delayMs = Math.round(baseDelay + jitter);

    console.log(
      `[EulerStream] Reconexión automática #${this.reconnectAttempts}/${this.maxReconnectAttempts} en ${(delayMs / 1000).toFixed(1)}s (Causa: ${cause || "1006"})`
    );

    this.emit("status", "reconnecting");
    this.emit("reconnecting", {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs,
      username,
    });

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      if (this.isExplicitDisconnect || !this.lastConnectOptions) return;
      
      console.log(`[EulerStream] Ejecutando intento de reconexión #${this.reconnectAttempts}...`);
      const options: EulerConnectOptions = {
        ...this.lastConnectOptions,
        jwtToken: undefined, // Force getting a fresh ephemeral JWT token
      };

      await this.connectInternal(options, true);
    }, delayMs);
  }

  private cleanupSocketOnly() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
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
    this.reconnectAttempts = 0;
    this.comboTracker.clear();
    this.cleanupSocketOnly();
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
      case "WebcastRoomInfo": {
        let cTime = data.createTime || data.create_time;
        if (cTime) {
          const num = typeof cTime === "string" ? parseInt(cTime, 10) : Number(cTime);
          cTime = num < 10000000000 ? num * 1000 : num;
        }
        const extractedAvatar = extractAvatarUrl(data.owner || data.anchor || data.room || data);
        const hostAvatar = this.hostAvatarUrl || extractedAvatar;
        if (extractedAvatar && !this.hostAvatarUrl) {
          this.hostAvatarUrl = extractedAvatar;
        }
        if (data.owner?.nickname && !this.hostNickname) {
          this.hostNickname = data.owner.nickname;
        }

        this.emit("room-update", {
          viewerCount: data.viewerCount || data.currentCount || 0,
          likes: parseInt(data.likeCount || data.likes || "0", 10) || 0,
          createTime: cTime || Date.now(),
          hostAvatar: hostAvatar,
        });

        if (data.owner || data.roomId) {
          this.emit("connected", {
            roomId: data.roomId || data.room_id || "",
            username: this.currentUsername,
            nickname: data.owner?.nickname || this.hostNickname || this.currentUsername,
            userId: (data.owner?.id_str || data.owner?.id || "").toString(),
            avatarUrl: hostAvatar,
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

      case "WebcastLikeMessage": {
        const user = data.user || data.userInfo || {};
        const profilePic = extractAvatarUrl(user);

        const likeCount = Number(data.likeCount || data.count || 1);
        const totalLikeCount = Number(data.totalLikeCount || data.total || 0);

        this.emit("like-msg", {
          uniqueId: user.uniqueId || user.displayId || "anonymous",
          nickname: user.nickname || user.uniqueId || "Anonymous",
          likeCount: likeCount,
          totalLikeCount: totalLikeCount,
          profilePictureUrl: profilePic,
        });
        break;
      }

      case "WebcastRoomUserSeqMessage": {
        const viewerCount = Number(data.currentCount || data.totalUser || data.viewerCount || 0);
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

        if (topViewers.length > 0) {
          this.emit("top-gifters-update", topViewers);
        }
        break;
      }

      case "WebcastMemberMessage": {
        const user = data.user || data.userInfo || {};
        const profilePic = extractAvatarUrl(user);

        this.emit("member-join", {
          uniqueId: user.uniqueId || user.displayId || "anonymous",
          nickname: user.nickname || user.uniqueId || "Anonymous",
          profilePictureUrl: profilePic,
        });
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
}

// Global client instance
export const eulerLiveClient = new EulerStreamLiveClient();
