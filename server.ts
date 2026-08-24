import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { WebcastPushConnection } from "tiktok-live-connector";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(cors());
  const PORT = 3000;

  // Track active connections
  const activeConnections = new Map<string, WebcastPushConnection>();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join-live", (username: string) => {
      console.log(`Socket ${socket.id} requesting join: ${username}`);
      
      // Basic validation
      if (!username || username.length < 2) {
        socket.emit("error", "El nombre de usuario es obligatorio y debe ser válido.");
        return;
      }

      // Cleanup existing connection if any for this socket
      const existing = activeConnections.get(socket.id);
      if (existing) {
        existing.disconnect();
        activeConnections.delete(socket.id);
      }

      const tiktokConnection = new WebcastPushConnection(username, {
        processInitialData: true,
        enableExtendedGiftInfo: true,
        requestOptions: {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        }
      });

      tiktokConnection.connect().then(state => {
        console.log(`Connected to room ${state.roomId} for user ${username}`);
        
        // Send initial room stats if available
        if (state.roomInfo) {
          console.log("Room Info keys:", Object.keys(state.roomInfo));
          let cTime = state.roomInfo.createTime || state.roomInfo.create_time;
          if (cTime) {
            // Some versions return it as a string or number
            const cTimeParsed = typeof cTime === 'string' ? parseInt(cTime) : Number(cTime);
            
            // TikTok return createTime in seconds usually (e.g. 1714438400)
            // If it's less than 10^12, it's likely seconds
            if (cTimeParsed < 10000000000) {
              cTime = cTimeParsed * 1000;
            } else {
              cTime = cTimeParsed;
            }
          }

          socket.emit("room-update", { 
            viewerCount: state.roomInfo.viewerCount || 0,
            likes: parseInt(state.roomInfo.likeCount) || 0,
            createTime: cTime || Date.now()
          });
        }
        
        const ownerDisplayId = state.roomInfo?.owner?.display_id || username;
        const ownerUserId = (state.roomInfo?.owner?.id_str || state.roomInfo?.owner?.id || '').toString();
        socket.emit("connected", { roomId: state.roomId, username: ownerDisplayId, userId: ownerUserId });
      }).catch(err => {
        console.error("TikTok Connection Failed:", err);
        let errorMsg = "Failed to connect to TikTok Live.";
        if (err.message && err.message.includes("not live")) {
          errorMsg = "El usuario no está en vivo actualmente.";
        } else if (err.name === "FetchIsLiveError") {
          errorMsg = "No se pudo verificar si el usuario está en vivo. TikTok podría estar bloqueando las solicitudes. Intenta de nuevo en unos minutos.";
        } else {
          errorMsg = "Error al conectar con TikTok Live. Asegúrate de que el nombre de usuario sea correcto y que esté en vivo.";
        }
        socket.emit("error", errorMsg);
      });

      // Events
      tiktokConnection.on('chat', data => {
        socket.emit("chat-msg", {
          id: data.msgId,
          uniqueId: data.uniqueId,
          nickname: data.nickname,
          comment: data.comment,
          profilePictureUrl: data.profilePictureUrl,
          timestamp: Date.now()
        });
      });

      tiktokConnection.on('gift', data => {
        // Enviar todos los datos necesarios y filtrar combos en progreso que no hayan terminado
        // Si es tipo streak/combo (giftType === 1), solo lo pasamos cuando termine (repeatEnd === true)
        // Pero para estar más seguros, podemos enviar repeatEnd y que el frontend / backend filtre.
        // El usuario pide: "Solo procesar el regalo cuando: data.repeatEnd === true"
        if (data.giftType === 1 && !data.repeatEnd) {
          return; // Ignore intermediate combo updates
        }

        socket.emit("gift-msg", {
          userId: data.userId || (data.user && data.user.userId),
          uniqueId: data.uniqueId,
          nickname: data.nickname,
          giftName: data.giftName,
          repeatCount: data.repeatCount || 1,
          profilePictureUrl: data.profilePictureUrl,
          diamondCount: data.diamondCount || (data.giftDetails && data.giftDetails.diamondCount) || 0,
          repeatEnd: data.repeatEnd,
          giftType: data.giftType
        });
      });

      tiktokConnection.on('like', data => {
        socket.emit("like-msg", {
          uniqueId: data.uniqueId,
          nickname: data.nickname,
          likeCount: data.likeCount,
          totalLikeCount: data.totalLikeCount,
          profilePictureUrl: data.profilePictureUrl
        });
      });

      tiktokConnection.on('social', data => {
          socket.emit("event-msg", {
              uniqueId: data.uniqueId,
              nickname: data.nickname,
              type: data.displayType // e.g. "follow", "share"
          });
      });

      tiktokConnection.on('member', data => {
        socket.emit("member-join", {
          uniqueId: data.uniqueId,
          nickname: data.nickname,
          profilePictureUrl: data.profilePictureUrl
        });
      });

      tiktokConnection.on('roomUser', data => {
        socket.emit("room-update", {
          viewerCount: data.viewerCount,
          topViewers: data.topViewers // Capturamos la lista de tops si está disponible
        });
        
        if (data.topViewers && Array.isArray(data.topViewers)) {
          socket.emit("top-gifters-update", data.topViewers);
        }
      });

      tiktokConnection.on('ranklist', data => {
        socket.emit("ranking-update", data);
      });

      tiktokConnection.on('roomViewerList', data => {
        socket.emit("room-update", {
          viewerCount: data.viewerCount,
          topViewers: data.viewers
        });
      });

      tiktokConnection.on('linkMicBattle', data => {
        socket.emit("battle-msg", data);
      });

      tiktokConnection.on('linkMicArmies', data => {
        socket.emit("battle-armies-msg", data);
      });

      tiktokConnection.on('decodedData', (eventName, decodedData) => {
        if (eventName === 'WebcastLinkMicBattle') {
           socket.emit("raw-battle-msg", decodedData);
        }
        if (eventName === 'WebcastLinkMicArmies') {
           socket.emit("raw-battle-armies-msg", decodedData);
        }
      });

      tiktokConnection.on('error', err => {
        socket.emit("error", "TikTok Connection Error: " + err.message);
      });

      tiktokConnection.on('disconnected', () => {
        socket.emit("status", "disconnected");
      });

      tiktokConnection.on('streamEnd', () => {
        socket.emit("status", "ended");
        tiktokConnection.disconnect();
      });

      activeConnections.set(socket.id, tiktokConnection);
    });

    socket.on("disconnect", () => {
      const tiktok = activeConnections.get(socket.id);
      if (tiktok) {
        tiktok.disconnect();
        activeConnections.delete(socket.id);
      }
      console.log("Client disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
