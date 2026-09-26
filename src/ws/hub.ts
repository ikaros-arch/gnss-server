import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { Logger } from "pino";
import type { FixStore } from "../store/fixStore.js";
import type { Fix } from "@ikaros-arch/gnss-core";

export function attachWs(httpServer: Server, store: FixStore, logger: Logger) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress;
    logger.info({ ip }, "ws client connected");

    // null means "all antennas"; a Set means only those IDs.
    let subscribed: Set<string> | null = null;

    // Send snapshot on connect (respects subscription if set, though typically not set yet).
    ws.send(JSON.stringify({ type: "snapshot", fixes: store.all() }));

    const onFix = (fix: Fix) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (subscribed !== null && !subscribed.has(fix.antennaId)) return;
      ws.send(JSON.stringify({ type: "fix", fix }));
    };
    store.on("fix", onFix);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg.type === "subscribe" && Array.isArray(msg.ids)) {
          subscribed = new Set(msg.ids as string[]);
          // Immediately send a fresh snapshot filtered to the subscription.
          const fixes = store.all().filter((f) => (subscribed as Set<string>).has(f.antennaId));
          ws.send(JSON.stringify({ type: "snapshot", fixes }));
          logger.debug({ ip, ids: msg.ids }, "ws client subscribed");
        } else if (msg.type === "unsubscribe") {
          subscribed = null;
          ws.send(JSON.stringify({ type: "snapshot", fixes: store.all() }));
          logger.debug({ ip }, "ws client unsubscribed (receiving all)");
        }
      } catch {
        // Ignore malformed messages.
      }
    });

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
