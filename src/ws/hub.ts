import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { Logger } from "pino";
import type { FixStore } from "../store/fixStore.js";
import type { Fix } from "../store/fix.js";

export function attachWs(httpServer: Server, store: FixStore, logger: Logger) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress;
    logger.info({ ip }, "ws client connected");
    // Send snapshot of all current fixes on connect.
    ws.send(JSON.stringify({ type: "snapshot", fixes: store.all() }));

    const onFix = (fix: Fix) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "fix", fix }));
      }
    };
    store.on("fix", onFix);

    ws.on("close", () => {
      store.off("fix", onFix);
      logger.info({ ip }, "ws client disconnected");
    });
  });

  // Heartbeat
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(interval));

  return wss;
}
