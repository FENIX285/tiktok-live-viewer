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
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private reconnectTimer: any = null;

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
    this.disconnect();
    this.isExplicitDisconnect = false;

    const username = options.uniqueId.trim().replace(/^@/, "");
    this.currentUsername = username;

    try {
      let token = options.jwtToken;

      // If no pre-generated JWT was provided, request one from our backend
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
      this.initWebSocket(wsUrl, username);
    } catch (err: any) {
      console.error("EulerStream Connection Error:", err);
      this.emit("error", err.message || "Error al conectar con Euler Stream");
    }
  }

  private initWebSocket(wsUrl: string, username: string) {
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.retryCount = 0;
        console.log(`[EulerStream] WebSocket connected for @${username}`);
        // Notify connection opened
        this.emit("connected", {
          roomId: `room_${username}`,
          username: username,
          nickname: this.hostNickname || username,
          userId: `user_${username}`,
          avatarUrl: this.hostAvatarUrl || "",
        });
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
        console.log(`[EulerStream] WebSocket closed with code ${event.code}: ${event.reason}`);
        if (this.isExplicitDisconnect) {
          this.emit("status", "disconnected");
          return;
        }

        // Handle specific Euler Stream / TikTok close codes
        let userErrorMessage = "";
        if (event.code === 4404) {
          userErrorMessage = `El usuario @${username} no está transmitiendo en vivo actualmente.`;
        } else if (event.code === 4401) {
          userErrorMessage = "El token JWT de Euler Stream es inválido o ha expirado.";
        } else if (event.code === 4403) {
          userErrorMessage = "Permiso denegado por Euler Stream para acceder a este directo.";
        } else if (event.code === 4005) {
          userErrorMessage = "La transmisión en vivo de TikTok ha finalizado.";
          this.emit("status", "ended");
        } else if (event.code === 4429) {
          userErrorMessage = "Límite de conexiones simultáneas alcanzado en Euler Stream.";
        } else if (event.code !== 1000) {
          userErrorMessage = event.reason || `Conexión cerrada (${event.code}).`;
        }

        if (userErrorMessage) {
          this.emit("error", userErrorMessage);
        }
        this.emit("status", "disconnected");
      };
    } catch (err: any) {
      this.emit("error", "No se pudo inicializar la conexión WebSocket: " + err.message);
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

      case "WebcastGiftMessage":
      case "WebcastGift":
      case "gift":
      case "giftMessage": {
        const user = data.user || data.userInfo || data.user_info || data.sender || {};
        const profilePic = extractAvatarUrl(user);

        const giftDetails = data.giftDetails || data.gift_details || data.gift || data.giftInfo || data.gift_info || data.extendedGiftInfo || data.extended_gift_info || {};

        const giftName =
          data.giftName ||
          data.gift_name ||
          giftDetails.giftName ||
          giftDetails.gift_name ||
          giftDetails.name ||
          giftDetails.describe ||
          giftDetails.title ||
          giftDetails.gift_title ||
          data.describe ||
          "Gift";

        const rawDiamond =
          data.diamondCount ??
          data.diamond_count ??
          data.coinPrice ??
          data.coin_price ??
          data.coinCount ??
          data.coin_count ??
          data.diamonds ??
          data.coins ??
          data.cost ??
          data.price ??
          giftDetails.diamondCount ??
          giftDetails.diamond_count ??
          giftDetails.coinPrice ??
          giftDetails.coin_price ??
          giftDetails.coinCount ??
          giftDetails.coin_count ??
          giftDetails.diamonds ??
          giftDetails.coins ??
          giftDetails.cost ??
          giftDetails.price ??
          0;

        const diamondCount = Number(rawDiamond) || 0;

        const repeatEndRaw = 
          data.repeatEnd !== undefined ? data.repeatEnd :
          data.repeat_end !== undefined ? data.repeat_end :
          data.combo_end !== undefined ? data.combo_end :
          data.comboEnd !== undefined ? data.comboEnd :
          data.is_streak_end !== undefined ? data.is_streak_end :
          data.isStreakEnd !== undefined ? data.isStreakEnd :
          true;
        const repeatEnd = Boolean(repeatEndRaw);

        const giftTypeRaw = data.giftType !== undefined ? data.giftType : (data.gift_type !== undefined ? data.gift_type : 1);
        const giftType = Number(giftTypeRaw);

        // Skip combo streaks in progress if requested
        if (giftType === 1 && !repeatEnd) {
          return;
        }

        const rawCount =
          data.repeatCount ??
          data.repeat_count ??
          data.comboCount ??
          data.combo_count ??
          data.groupCount ??
          data.group_count ??
          data.combo_total_count ??
          data.comboTotalCount ??
          data.giftCount ??
          data.gift_count ??
          data.count ??
          1;

        const repeatCount = Math.max(1, Number(rawCount) || 1);

        const rawUserId = user.userId || user.user_id || user.id_str || user.id || user.secUid || user.sec_uid || user.uniqueId || user.unique_id || "";
        const rawUniqueId = user.uniqueId || user.unique_id || user.displayId || user.display_id || "anonymous";
        const rawNickname = user.nickname || user.nickName || user.displayName || user.display_name || user.name || rawUniqueId || "Anonymous";

        this.emit("gift-msg", {
          userId: rawUserId.toString(),
          uniqueId: rawUniqueId.toString(),
          nickname: rawNickname.toString(),
          giftName: giftName.toString(),
          repeatCount: repeatCount,
          profilePictureUrl: profilePic,
          diamondCount: diamondCount,
          repeatEnd: repeatEnd,
          giftType: giftType,
        });
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
        const topViewers = (data.ranks || data.ranksList || [])
          .filter((r: any) => r && typeof r === "object")
          .map((r: any) => ({
            user: {
              uniqueId: r.user?.uniqueId || r.user?.displayId || "",
              nickname: r.user?.nickname || "",
              profilePictureUrl: extractAvatarUrl(r.user || r),
            },
            coinCount: Number(r?.score ?? r?.coinCount ?? 0),
          }));

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

  public disconnect() {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
  }
}

// Global client instance
export const eulerLiveClient = new EulerStreamLiveClient();
