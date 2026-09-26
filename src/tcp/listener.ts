import { createServer, type Socket } from "node:net";
import type { Logger } from "pino";
import { FixAssembler, LineSplitter } from "@ikaros-arch/gnss-core";
import type { FixStore } from "../store/fixStore.js";
import type { AntennaMap } from "../config.js";

// Maximum bytes allowed in the per-connection line buffer before it is flushed.
// Protects against a misbehaving peer that never sends newlines.
const MAX_LINE_BYTES = 2048;

export interface TcpListenerOptions {
  port: number;
  maxConnections: number;
  idleTimeoutMs: number;
  outputCrs: string;
  antennas: AntennaMap;
  store: FixStore;
  logger: Logger;
}

/**
 * Accepts antenna TCP connections and hands each one its own LineSplitter +
 * FixAssembler (from @ikaros-arch/gnss-core). All parsing/normalisation lives
 * there; this module only does sockets, identity and logging.
 */
export function startTcpListener(opts: TcpListenerOptions) {
  const { port, maxConnections, idleTimeoutMs, outputCrs, antennas, store, logger } = opts;

  const server = createServer((socket) => {
    if ((server as any).connections > maxConnections) {
      logger.warn({ remoteIp: socket.remoteAddress }, "max connections reached, rejecting");
      socket.destroy();
      return;
    }
    handleSocket(socket);
  });

  function handleSocket(socket: Socket) {
    const remoteIp = socket.remoteAddress?.replace(/^::ffff:/, "") ?? "unknown";
    const remotePort = socket.remotePort ?? 0;
    const mapped = antennas[remoteIp];
    const antennaId = mapped?.id ?? `${remoteIp}:${remotePort}`;
    const log = logger.child({ antennaId, remoteIp, remotePort });
    log.info("antenna connected");

    const assembler = new FixAssembler({
      antennaId,
      label: mapped?.label,
      outputCrs,
      transport: { remoteIp, remotePort },
    });
    const lines = new LineSplitter(MAX_LINE_BYTES, (len) => {
      log.warn({ len }, "line buffer overflow, flushing");
    });

    socket.setEncoding("utf8");
    socket.setTimeout(idleTimeoutMs);
    socket.on("timeout", () => {
      log.warn({ idleTimeoutMs }, "socket idle timeout");
      socket.destroy();
    });
    socket.on("error", (err) => log.warn({ err: err.message }, "socket error"));
    socket.on("close", () => log.info("antenna disconnected"));

    socket.on("data", (chunk: string) => {
      for (const line of lines.push(chunk)) {
        try {
          const fix = assembler.feed(line);
          if (fix) store.set(fix);
        } catch (err) {
          log.error({ err: (err as Error).message, outputCrs }, "projection failed");
        }
      }
    });
  }

  server.listen(port, () => {
    logger.info({ port }, "TCP listener started");
  });

  return server;
}
