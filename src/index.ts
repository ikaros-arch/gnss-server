import pino from "pino";
import type { Server } from "node:http";
import { loadConfig } from "./config.js";
import { FixStore } from "./store/fixStore.js";
import { startTcpListener } from "./tcp/listener.js";
import { buildRest } from "./rest/api.js";
import { attachWs } from "./ws/hub.js";

async function main() {
  const cfg = loadConfig();
  const logger = pino({
    level: cfg.logLevel,
    ...(cfg.redactIps ? { redact: { paths: ["ip", "remoteIp", "req.remoteAddress"], censor: "[redacted]" } } : {}),
  });
  logger.info(
    { tcpPort: cfg.tcpPort, httpPort: cfg.httpPort, outputCrs: cfg.outputCrs, antennas: Object.keys(cfg.antennas).length },
    "starting gnss-server",
  );

  const store = new FixStore();

  const tcp = startTcpListener({
    port: cfg.tcpPort,
    maxConnections: cfg.maxConnections,
    idleTimeoutMs: cfg.tcpIdleTimeoutMs,
    outputCrs: cfg.outputCrs,
    antennas: cfg.antennas,
    store,
    logger: logger.child({ mod: "tcp" }),
  });

  const app = buildRest(store, logger.child({ mod: "rest" }), cfg.outputCrs);
  await app.listen({ port: cfg.httpPort, host: "0.0.0.0" });
  attachWs(app.server as Server, store, logger.child({ mod: "ws" }));

  // Periodically remove antennas that have been silent for too long.
  const purgeLog = logger.child({ mod: "store" });
  setInterval(() => {
    const removed = store.purge(cfg.antennaPurgeMs);
    if (removed.length) purgeLog.info({ removed }, "purged stale antennas");
  }, 60_000).unref();

  const shutdown = async (sig: string) => {
    logger.info({ sig }, "shutting down");
    tcp.close();
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
