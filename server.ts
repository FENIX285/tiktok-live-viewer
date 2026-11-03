import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import EulerStreamApiClient from "@eulerstream/euler-api-sdk";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(cors());
  app.use(express.json());

  // Cached Euler Stream API client & account ID
  let eulerClient: EulerStreamApiClient | null = null;
  let cachedAccountId: number | null = null;

  function getEulerClient() {
    const key = process.env.EULER_STREAM_API_KEY || process.env.EULER_API_KEY;
    if (!key || key.trim() === "") {
      throw new Error(
        "EULER_STREAM_API_KEY no está configurada. Por favor, añade tu API Key de Euler Stream (https://www.eulerstream.com/) en las variables de entorno del proyecto."
      );
    }
    if (!eulerClient) {
      eulerClient = new EulerStreamApiClient({ apiKey: key.trim() });
    }
    return eulerClient;
  }

  // In-memory cache for TikTok creator profiles
  interface TikTokUserProfile {
    username: string;
    nickname: string;
    avatarUrl: string;
  }
  const userProfileCache = new Map<string, { profile: TikTokUserProfile; timestamp: number }>();
  const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min cache

  async function fetchTikTokUserProfile(username: string): Promise<TikTokUserProfile | null> {
    const clean = username.trim().replace(/^@/, "");
    if (!clean) return null;

    const cacheKey = clean.toLowerCase();
    const cached = userProfileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.profile;
    }

    try {
      const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(clean)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!res.ok) return null;
      const html = await res.text();

      const avatarMatch =
        html.match(/"avatarLarger":"([^"]+)"/) ||
        html.match(/"avatarMedium":"([^"]+)"/) ||
        html.match(/"avatarThumb":"([^"]+)"/);
      const nicknameMatch = html.match(/"nickname":"([^"]+)"/);

      let avatarUrl = "";
      if (avatarMatch) {
        try {
          avatarUrl = JSON.parse('"' + avatarMatch[1] + '"');
        } catch {
          avatarUrl = avatarMatch[1].replace(/\\u002F/g, "/");
        }
      }

      let nickname = clean;
      if (nicknameMatch) {
        try {
          nickname = JSON.parse('"' + nicknameMatch[1] + '"');
        } catch {
          nickname = nicknameMatch[1];
        }
      }

      const profile: TikTokUserProfile = {
        username: clean,
        nickname: nickname || clean,
        avatarUrl: avatarUrl || "",
      };

      if (avatarUrl) {
        userProfileCache.set(cacheKey, { profile, timestamp: Date.now() });
      }

      return profile;
    } catch (err) {
      console.error(`Error fetching TikTok profile for @${clean}:`, err);
      return null;
    }
  }

  // In-memory store for Top Gifters
  interface BackendGiftRecord {
    id: string;
    giftName: string;
    giftCount: number;
    coins: number;
    isCombo: boolean;
    comboCount?: number;
    timestamp: number;
    groupId?: string;
    isEnded?: boolean;
  }

  interface BackendTopGifter {
    userId: string;
    uniqueId: string;
    nickname: string;
    avatarUrl: string;
    giftsSent: number;
    totalCoins: number;
    lastGiftName: string;
    lastGiftCount: number;
    lastGiftIsCombo: boolean;
    lastGiftComboCount?: number;
    lastUpdated: number;
    history: BackendGiftRecord[];
  }

  const giftersStore = new Map<string, Map<string, BackendTopGifter>>();

  function getRoomGiftersMap(roomKey: string = "default"): Map<string, BackendTopGifter> {
    const key = roomKey.toLowerCase().trim() || "default";
    let map = giftersStore.get(key);
    if (!map) {
      map = new Map<string, BackendTopGifter>();
      giftersStore.set(key, map);
    }
    return map;
  }

  function recordGift(
    roomKey: string,
    gift: {
      userId?: string;
      uniqueId: string;
      nickname: string;
      avatarUrl?: string;
      giftName: string;
      giftCount: number;
      coins: number;
      isCombo?: boolean;
      comboCount?: number;
      repeatEnd?: boolean;
      groupId?: string;
    }
  ) {
    const map = getRoomGiftersMap(roomKey);
    const key = (gift.userId || gift.uniqueId || "anonymous").toString();
    const existing = map.get(key);

    const giftCount = gift.giftCount || 1;
    const giftsSent = (existing?.giftsSent || 0) + giftCount;
    const totalCoins = (existing?.totalCoins || 0) + (gift.coins || 0);
    const avatarUrl = gift.avatarUrl || existing?.avatarUrl || "";
    const isEnded = Boolean(gift.repeatEnd);
    const groupId = gift.groupId || "";
    const comboCount = gift.comboCount || giftCount || 1;
    const isCombo = Boolean(gift.isCombo || comboCount > 1 || groupId);
    const currentGiftName = gift.giftName || existing?.lastGiftName || "Regalo";

    const existingHistory = existing?.history || [];
    const recentRecord = existingHistory[0];

    // Check if this incoming gift is continuation of the exact same active ongoing combo
    const isSameOngoingCombo = Boolean(
      recentRecord &&
      !recentRecord.isEnded &&
      recentRecord.giftName === currentGiftName &&
      recentRecord.isCombo &&
      (
        (groupId && recentRecord.groupId && groupId === recentRecord.groupId) ||
        (!groupId && !recentRecord.groupId && (Date.now() - recentRecord.timestamp < 3500) && comboCount >= (recentRecord.comboCount || 1))
      )
    );

    const unitPrice = giftCount > 0 ? (gift.coins / giftCount) : (gift.coins || 0);
    let updatedHistory: BackendGiftRecord[];

    if (isSameOngoingCombo && recentRecord) {
      const updatedRecord: BackendGiftRecord = {
        ...recentRecord,
        giftCount: comboCount,
        comboCount: comboCount,
        coins: Math.round(comboCount * unitPrice) || (recentRecord.coins + (gift.coins || 0)),
        isEnded: isEnded,
        timestamp: Date.now(),
      };
      updatedHistory = [updatedRecord, ...existingHistory.slice(1)];
    } else {
      const newRecord: BackendGiftRecord = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        giftName: currentGiftName,
        giftCount: isCombo ? comboCount : giftCount,
        coins: isCombo ? Math.round(comboCount * unitPrice) : (gift.coins || 0),
        isCombo: isCombo,
        comboCount: isCombo ? comboCount : undefined,
        groupId: groupId || undefined,
        isEnded: isEnded || !isCombo,
        timestamp: Date.now(),
      };
      updatedHistory = [newRecord, ...existingHistory].slice(0, 200);
    }

    map.set(key, {
      userId: key,
      uniqueId: gift.uniqueId || existing?.uniqueId || key,
      nickname: gift.nickname || existing?.nickname || gift.uniqueId || "Anonymous",
      avatarUrl: avatarUrl,
      giftsSent: giftsSent,
      totalCoins: totalCoins,
      lastGiftName: currentGiftName,
      lastGiftCount: giftCount,
      lastGiftIsCombo: isCombo,
      lastGiftComboCount: comboCount,
      lastUpdated: Date.now(),
      history: updatedHistory,
    });
  }

  // Top 10 Gifters endpoint
  app.get("/api/gifters/top10", (req, res) => {
    const roomParam = (req.query.username as string) || (req.query.room as string) || "";
    let targetMap: Map<string, BackendTopGifter>;

    if (roomParam) {
      targetMap = getRoomGiftersMap(roomParam);
    } else {
      // If no room is specified, find the map with the most gifters or fallback to default
      targetMap = getRoomGiftersMap("default");
      for (const [, rMap] of giftersStore) {
        if (rMap.size > targetMap.size) {
          targetMap = rMap;
        }
      }
    }

    const sorted = Array.from(targetMap.values())
      .sort((a, b) => {
        if (b.totalCoins === a.totalCoins) {
          return b.giftsSent - a.giftsSent;
        }
        return b.totalCoins - a.totalCoins;
      })
      .slice(0, 10);

    const responseData = sorted.map((g, index) => ({
      rank: index + 1,
      userId: g.userId,
      uniqueId: g.uniqueId,
      nickname: g.nickname,
      avatarUrl: g.avatarUrl,
      giftsSent: g.giftsSent,
      totalCoins: g.totalCoins,
      lastGiftName: g.lastGiftName,
      lastGiftCount: g.lastGiftCount,
      lastGiftIsCombo: g.lastGiftIsCombo,
      lastGiftComboCount: g.lastGiftComboCount,
      history: g.history || [],
    }));

    return res.json(responseData);
  });

  // Specific gifter history endpoint
  app.get("/api/gifters/history", (req, res) => {
    const roomParam = (req.query.username as string) || (req.query.room as string) || "default";
    const userParam = (req.query.userId as string) || (req.query.uniqueId as string) || "";
    if (!userParam) {
      return res.status(400).json({ error: "Missing userId or uniqueId" });
    }
    const map = getRoomGiftersMap(roomParam);
    const gifter = map.get(userParam) || Array.from(map.values()).find(g => g.uniqueId.toLowerCase() === userParam.toLowerCase());
    if (!gifter) {
      return res.json({ history: [] });
    }
    return res.json({
      userId: gifter.userId,
      uniqueId: gifter.uniqueId,
      nickname: gifter.nickname,
      history: gifter.history || [],
    });
  });

  // Record gift endpoint to register gifts in backend
  app.post("/api/gifters/record", (req, res) => {
    try {
      const { username, room, userId, uniqueId, nickname, avatarUrl, giftName, giftCount, coins, isCombo, comboCount, repeatEnd, groupId } = req.body;
      const targetRoom = username || room || "default";

      if (!uniqueId && !userId) {
        return res.status(400).json({ error: "Missing uniqueId or userId" });
      }

      recordGift(targetRoom, {
        userId,
        uniqueId: uniqueId || userId,
        nickname: nickname || uniqueId || userId,
        avatarUrl,
        giftName: giftName || "Regalo",
        giftCount: Number(giftCount) || 1,
        coins: Number(coins) || 0,
        isCombo: isCombo !== undefined ? Boolean(isCombo) : undefined,
        comboCount: Number(comboCount) || undefined,
        repeatEnd: Boolean(repeatEnd),
        groupId: groupId || undefined,
      });

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to record gift" });
    }
  });

  // Reset gifters for a room
  app.post("/api/gifters/reset", (req, res) => {
    const room = req.body?.username || req.body?.room || "default";
    const map = giftersStore.get(room.toLowerCase());
    if (map) {
      map.clear();
    }
    return res.json({ success: true });
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    const hasKey = Boolean(process.env.EULER_STREAM_API_KEY || process.env.EULER_API_KEY);
    res.json({ status: "ok", eulerConfigured: hasKey });
  });

  // Creator profile info endpoint (direct TikTok profile avatar and nickname)
  app.get("/api/tiktok-user/:username", async (req, res) => {
    try {
      const username = req.params.username;
      if (!username) {
        return res.status(400).json({ error: "Missing username parameter" });
      }
      const profile = await fetchTikTokUserProfile(username);
      if (!profile) {
        return res.status(404).json({ error: "TikTok user profile not found" });
      }
      return res.json(profile);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch profile" });
    }
  });

  // Euler Stream JWT Generation Endpoint (Option B: Hybrid JWT connection)
  app.post("/api/euler-jwt", async (req, res) => {
    try {
      const { uniqueId, clientApiKey } = req.body;
      
      if (!uniqueId || typeof uniqueId !== "string" || uniqueId.trim().length < 2) {
        return res.status(400).json({ error: "El nombre de usuario (uniqueId) es obligatorio." });
      }

      const cleanUsername = uniqueId.trim().replace(/^@/, "");

      // Allow using an optional client-provided API key if provided, otherwise use server-configured key
      let client: EulerStreamApiClient;
      if (clientApiKey && typeof clientApiKey === "string" && clientApiKey.trim().length > 5) {
        client = new EulerStreamApiClient({ apiKey: clientApiKey.trim() });
      } else {
        client = getEulerClient();
      }

      // Retrieve account ID if not already cached (or if custom client key is used)
      let accountId = cachedAccountId;
      if (!accountId || (clientApiKey && clientApiKey.trim().length > 5)) {
        const accountRes = await client.accounts.retrieveAccountSelf();
        if (accountRes.data && accountRes.data.account) {
          accountId = accountRes.data.account.id;
          if (!clientApiKey) {
            cachedAccountId = accountId;
          }
        }
      }

      if (!accountId) {
        return res.status(500).json({
          error: "No se pudo recuperar la cuenta de Euler Stream. Verifica la validez de tu API Key."
        });
      }

      // Generate a scoped ephemeral JWT and fetch creator profile in parallel
      const [jwtRes, userProfile] = await Promise.all([
        client.authentication.createJWT(accountId, {
          expireAfter: 3600,
          name: `viewer-${cleanUsername}-${Date.now()}`,
          websockets: {
            allowedCreators: [cleanUsername],
            maxWebSockets: 2
          }
        }),
        fetchTikTokUserProfile(cleanUsername).catch(() => null)
      ]);

      const token = jwtRes.data.token;
      if (!token) {
        return res.status(500).json({
          error: "Euler Stream no retornó un token JWT válido."
        });
      }

      return res.json({
        token,
        uniqueId: cleanUsername,
        avatarUrl: userProfile?.avatarUrl || "",
        nickname: userProfile?.nickname || cleanUsername,
        expiresAt: jwtRes.data.config?.expiresAt,
        wsUrl: `wss://ws.eulerstream.com?uniqueId=${encodeURIComponent(cleanUsername)}&jwtKey=${encodeURIComponent(token)}`
      });
    } catch (err: any) {
      console.error("Error generando JWT en Euler Stream:", err?.response?.data || err?.message || err);
      const errorMsg =
        err?.response?.data?.message ||
        err?.message ||
        "Error al comunicarse con la API de Euler Stream.";
      return res.status(500).json({ error: errorMsg });
    }
  });

  // Avatar image proxy endpoint to bypass CORS / hotlinking restrictions from TikTok CDN
  app.get("/api/proxy/avatar", async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl) {
        return res.status(400).send("Missing url parameter");
      }

      // Note: req.query.url is already decoded by Express. Do NOT call decodeURIComponent again,
      // as double decoding corrupts cryptographic parameters like x-signature in TikTok CDN URLs.
      const targetUrl = rawUrl;
      const parsed = new URL(targetUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).send("Invalid protocol");
      }

      // Fetch avatar from TikTok CDN using standard browser headers and referer
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": "https://www.tiktok.com/",
        },
      });

      if (!response.ok) {
        return res.status(response.status).send("Failed to fetch image");
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error("Avatar proxy error:", err.message);
      return res.status(500).send("Proxy error");
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

