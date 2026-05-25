const { Server } = require("socket.io");
const env = require("../config/env");
const sendEngine = require("../services/sendEngine");
const whatsappService = require("../services/whatsappService");

function initializeSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigins,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.emit("whatsapp:status", whatsappService.getStatus());

    socket.on("campaign:join", (campaignId) => {
      if (!campaignId) {
        return;
      }
      socket.join(`campaign:${campaignId}`);
    });

    socket.on("campaign:leave", (campaignId) => {
      if (!campaignId) {
        return;
      }
      socket.leave(`campaign:${campaignId}`);
    });
  });

  sendEngine.setIO(io);
  return io;
}

module.exports = {
  initializeSocket,
};
